"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FREE_ACCESS, type AccessContext } from "@/lib/access";
import { getElsatiaClient, isElsatiaAccountConfigured } from "@/lib/auth/client";
import { secureSessionStorage } from "@/lib/auth/secure-storage";
import { clearEntitlementCache, entitlementToAccess, readEntitlementCache, writeEntitlementCache, type ServerEntitlement } from "@/lib/entitlements";
import { createProjectRepository } from "@/lib/projects/repository";
import type { ProjectMutationSink } from "@/lib/projects/service";
import { IndexedDbSyncStateRepository, SupabaseCloudProjectStore, SyncService } from "@/lib/projects/sync";
import type { ToolProject } from "@/lib/projects/model";
import { Capacitor } from "@capacitor/core";
import type { EntitlementSource } from "@/lib/access";
import type { ToolsProductSku } from "@/lib/monetization";
import { manageToolsSubscription, restoreToolsPurchases, startToolsPurchase } from "@/lib/monetization-client";

export type AccountStatus = "anonymous" | "loading" | "verified" | "offline-grace" | "expired" | "error";
type AccountContextValue = {
  configured: boolean; user: User | null; access: AccessContext; status: AccountStatus; message: string;
  activeSources: Array<{ source: EntitlementSource; status: string; expires_at: string | null; renews_at: string | null }>;
  syncStatus: "idle" | "syncing" | "synced" | "error"; projectMutations: ProjectMutationSink;
  signIn(email: string, password: string): Promise<void>; signOut(): Promise<void>; refresh(): Promise<void>; syncNow(): Promise<void>;
  startPurchase(sku: ToolsProductSku): Promise<void>; restorePurchases(): Promise<void>; manageSubscription(source: "web" | "apple" | "google"): Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);
const cacheStore = {
  async getItem(key: string) { return localStorage.getItem(key); },
  async setItem(key: string, value: string) { localStorage.setItem(key, value); },
  async removeItem(key: string) { localStorage.removeItem(key); },
};

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const configured = isElsatiaAccountConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<AccessContext>(FREE_ACCESS);
  const [status, setStatus] = useState<AccountStatus>(configured ? "loading" : "anonymous");
  const [message, setMessage] = useState(configured ? "Vérification du compte…" : "Compte cloud indisponible dans cet environnement.");
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [activeSources, setActiveSources] = useState<AccountContextValue["activeSources"]>([]);

  const projectMutations = useMemo<ProjectMutationSink>(() => ({
    async changed(project: ToolProject) { const state = new IndexedDbSyncStateRepository(); const current = await state.get(project.id); await state.put({ projectId: project.id, project, revision: current?.revision ?? 0, dirty: true, status: "pending" }); },
    async deleted(project: ToolProject) { const state = new IndexedDbSyncStateRepository(); const current = await state.get(project.id); await state.put({ projectId: project.id, project, revision: current?.revision ?? 0, dirty: true, status: "pending", deletedAt: new Date().toISOString() }); },
  }), []);

  const resolve = useCallback(async (activeSession: Session | null) => {
    if (!configured || !activeSession) { setAccess(FREE_ACCESS); setActiveSources([]); setStatus("anonymous"); setMessage("Tools Free · sans compte"); return; }
    const client = getElsatiaClient();
    try {
      const { data, error } = await client.rpc("tools_resoudre_entitlements");
      if (error) throw error;
      const entitlement = data as ServerEntitlement;
      await writeEntitlementCache(activeSession.user.id, entitlement, cacheStore, secureSessionStorage);
      setAccess(entitlementToAccess(entitlement)); setActiveSources(entitlement.sources ?? []); setStatus("verified"); setMessage("Droits vérifiés · projets prêts à synchroniser");
    } catch {
      const cached = await readEntitlementCache(activeSession.user.id, cacheStore, secureSessionStorage);
      setAccess(cached.access);
      setActiveSources(cached.state === "offline-grace" ? cached.entitlement?.sources ?? [] : []);
      if (cached.state === "offline-grace") { setStatus("offline-grace"); setMessage("Hors ligne · droits Pro temporairement validés"); }
      else { setStatus(cached.state === "expired" ? "expired" : "error"); setMessage(cached.state === "expired" ? "Droits non vérifiables : accès Free jusqu’à la prochaine connexion." : "Compte non vérifiable. Tools Free reste disponible."); }
    }
  }, [configured]);

  const refresh = useCallback(async () => {
    if (!configured) return;
    const { data } = await getElsatiaClient().auth.getSession();
    setSession(data.session); await resolve(data.session);
  }, [configured, resolve]);

  const syncNow = useCallback(async () => {
    if (!configured || !session || access.tier !== "pro" || typeof indexedDB === "undefined" || !navigator.onLine) { setSyncStatus("idle"); return; }
    setSyncStatus("syncing");
    try {
      const state = new IndexedDbSyncStateRepository();
      const service = new SyncService(createProjectRepository(), state, new SupabaseCloudProjectStore(getElsatiaClient()), `${Capacitor.getPlatform()}-${session.user.id.slice(0, 8)}`);
      await service.enqueueInitialProjects(); await service.sync();
      setSyncStatus((await state.list()).some((record) => record.status === "error") ? "error" : "synced");
    } catch { setSyncStatus("error"); }
  }, [configured, session, access.tier]);

  useEffect(() => {
    if (!configured) return;
    let mounted = true;
    const client = getElsatiaClient();
    void client.auth.getSession()
      .then(({ data }) => { if (mounted) { setSession(data.session); void resolve(data.session); } })
      .catch(() => { if (mounted) { setSession(null); setAccess(FREE_ACCESS); setStatus("error"); setMessage("Session sécurisée indisponible. Tools Free reste disponible."); } });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return; setSession(nextSession); void resolve(nextSession);
    });
    const online = () => { void refresh(); };
    window.addEventListener("online", online);
    return () => { mounted = false; listener.subscription.unsubscribe(); window.removeEventListener("online", online); };
  }, [configured, refresh, resolve]);

  useEffect(() => {
    if (status !== "verified" || access.tier !== "pro") return;
    const timer = window.setTimeout(() => { void syncNow(); }, 0);
    return () => window.clearTimeout(timer);
  }, [status, access.tier, syncNow]);

  async function signIn(email: string, password: string) {
    if (!configured) throw new Error("Le compte ELSATIA n’est pas configuré ici.");
    setStatus("loading"); setMessage("Connexion sécurisée…");
    const { data, error } = await getElsatiaClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setStatus("error"); setMessage("Adresse ou mot de passe incorrect."); throw new Error("Adresse ou mot de passe incorrect."); }
    setSession(data.session); await resolve(data.session);
  }

  async function signOut() {
    if (configured) await getElsatiaClient().auth.signOut({ scope: "local" });
    await clearEntitlementCache(cacheStore); setSession(null); setAccess(FREE_ACCESS); setActiveSources([]); setStatus("anonymous"); setMessage("Déconnecté · Tools Free reste disponible");
  }

  async function startPurchase(sku: ToolsProductSku) {
    if (!session) throw new Error("Connectez votre compte ELSATIA avant l’achat.");
    if (access.tier === "pro" || activeSources.length) throw new Error("Tools Pro est déjà actif sur votre compte.");
    setMessage("Ouverture du paiement sécurisé…");
    const outcome = await startToolsPurchase(sku, session.user.id, session.access_token);
    if (outcome !== "redirect") await resolve(session);
  }

  async function restorePurchases() {
    if (!session) throw new Error("Connectez votre compte ELSATIA avant la restauration.");
    setMessage("Vérification des achats…"); await restoreToolsPurchases(session.access_token); await resolve(session);
  }

  async function manageSubscription(source: "web" | "apple" | "google") {
    if (!session) throw new Error("Connectez votre compte ELSATIA.");
    await manageToolsSubscription(session.access_token, source);
  }

  const value: AccountContextValue = { configured, user: session?.user ?? null, access, status, message, activeSources, syncStatus, projectMutations, signIn, signOut, refresh, syncNow, startPurchase, restorePurchases, manageSubscription };
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error("useAccount doit être utilisé dans AccountProvider.");
  return context;
}
