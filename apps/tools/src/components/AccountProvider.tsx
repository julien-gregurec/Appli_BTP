"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { creerControleAccesApplications, type ClientAccesApplications } from "@elsatia/application-access";
import { Capacitor } from "@capacitor/core";
import { FREE_ACCESS, type AccessContext, type EntitlementSource } from "@/lib/access";
import { getElsatiaClient, isElsatiaAccountConfigured } from "@/lib/auth/client";
import { secureSessionStorage } from "@/lib/auth/secure-storage";
import { clearEntitlementCache, entitlementToAccess, readEntitlementCache, writeEntitlementCache, type ServerEntitlement } from "@/lib/entitlements";
import type { ToolsProductSku } from "@/lib/monetization";
import { manageToolsSubscription, restoreToolsPurchases, startToolsPurchase } from "@/lib/monetization-client";
import type { ToolProject } from "@/lib/projects/model";
import { createProjectRepository, projectStorageScope } from "@/lib/projects/repository";
import type { ProjectMutationSink } from "@/lib/projects/service";
import { IndexedDbSyncStateRepository, SupabaseCloudProjectStore, SyncService } from "@/lib/projects/sync";

export type AccountStatus = "anonymous" | "loading" | "verified" | "offline-grace" | "expired" | "error";
export type ToolsCompany = { id: string; name: string; current: boolean };
type AccountContextValue = {
  configured: boolean; user: User | null; access: AccessContext; status: AccountStatus; message: string;
  companies: ToolsCompany[]; activeCompany: ToolsCompany | null; switchingCompany: boolean;
  activeSources: Array<{ source: EntitlementSource; status: string; expires_at: string | null; renews_at: string | null }>;
  syncStatus: "idle" | "syncing" | "synced" | "error"; projectMutations: ProjectMutationSink;
  signIn(email: string, password: string): Promise<void>; signOut(): Promise<void>; refresh(): Promise<void>; syncNow(): Promise<void>;
  switchCompany(companyId: string): Promise<void>; requestPasswordReset(email: string): Promise<void>; updatePassword(password: string): Promise<void>; requestAccountDeletion(): Promise<void>;
  startPurchase(sku: ToolsProductSku): Promise<void>; restorePurchases(): Promise<void>; manageSubscription(source: "web" | "apple" | "google"): Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);
const COMPANY_CACHE = "elsatia.tools.authorized-companies.v1";
const cacheStore = { async getItem(key: string) { return localStorage.getItem(key); }, async setItem(key: string, value: string) { localStorage.setItem(key, value); }, async removeItem(key: string) { localStorage.removeItem(key); } };
const accessControl = creerControleAccesApplications(async () => getElsatiaClient() as unknown as ClientAccesApplications);

function cachedCompanies(userId: string): ToolsCompany[] {
  try { const value = JSON.parse(localStorage.getItem(`${COMPANY_CACHE}:${userId}`) ?? "[]") as ToolsCompany[]; return value.filter((item) => typeof item.id === "string" && typeof item.name === "string"); } catch { return []; }
}
function rememberCompanies(userId: string, companies: ToolsCompany[]) { localStorage.setItem(`${COMPANY_CACHE}:${userId}`, JSON.stringify(companies)); }

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const configured = isElsatiaAccountConfigured();
  const [session, setSession] = useState<Session | null>(null); const [access, setAccess] = useState<AccessContext>(FREE_ACCESS);
  const [status, setStatus] = useState<AccountStatus>(configured ? "loading" : "anonymous"); const [message, setMessage] = useState(configured ? "Vérification du compte…" : "Compte cloud indisponible dans cet environnement.");
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle"); const [activeSources, setActiveSources] = useState<AccountContextValue["activeSources"]>([]);
  const [companies, setCompanies] = useState<ToolsCompany[]>([]); const [activeCompany, setActiveCompany] = useState<ToolsCompany | null>(null); const [switchingCompany, setSwitchingCompany] = useState(false);

  const projectMutations = useMemo<ProjectMutationSink>(() => { const scope = projectStorageScope(activeCompany?.id); return {
    async changed(project: ToolProject) { const state = new IndexedDbSyncStateRepository(indexedDB, scope); const current = await state.get(project.id); await state.put({ projectId: project.id, project, revision: current?.revision ?? 0, dirty: true, status: "pending" }); },
    async deleted(project: ToolProject) { const state = new IndexedDbSyncStateRepository(indexedDB, scope); const current = await state.get(project.id); await state.put({ projectId: project.id, project, revision: current?.revision ?? 0, dirty: true, status: "pending", deletedAt: new Date().toISOString() }); },
  }; }, [activeCompany?.id]);

  const resolveEntitlement = useCallback(async (activeSession: Session, company: ToolsCompany) => {
    try {
      if (!(await accessControl.verifierAccesApplication({ entrepriseId: company.id }, "tools"))) throw new Error("Accès Tools révoqué");
      const { data, error } = await getElsatiaClient().rpc("tools_resoudre_entitlements_entreprise", { p_entreprise_id: company.id }); if (error) throw error;
      const entitlement = data as ServerEntitlement; await writeEntitlementCache(activeSession.user.id, entitlement, cacheStore, secureSessionStorage, company.id);
      setAccess(entitlementToAccess(entitlement)); setActiveSources(entitlement.sources ?? []); setStatus("verified"); setMessage(`Droits vérifiés · ${company.name}`);
    } catch {
      const cached = await readEntitlementCache(activeSession.user.id, cacheStore, secureSessionStorage, Date.now(), company.id); setAccess(cached.access); setActiveSources(cached.state === "offline-grace" ? cached.entitlement?.sources ?? [] : []);
      if (cached.state === "offline-grace") { setStatus("offline-grace"); setMessage(`Hors ligne · ${company.name} · droits temporairement validés`); }
      else { setStatus(cached.state === "expired" ? "expired" : "error"); setMessage("Accès entreprise non vérifiable : Tools Free reste disponible."); }
    }
  }, []);

  const resolve = useCallback(async (activeSession: Session | null) => {
    if (!configured || !activeSession) { setAccess(FREE_ACCESS); setCompanies([]); setActiveCompany(null); setActiveSources([]); setStatus("anonymous"); setMessage("Tools Free · sans compte"); return; }
    try {
      const { data, error } = await getElsatiaClient().rpc("tools_lister_entreprises_autorisees"); if (error) throw error;
      const available = (Array.isArray(data) ? data : []).map((row: { entreprise_id: string; entreprise_nom: string; est_courante: boolean }) => ({ id: row.entreprise_id, name: row.entreprise_nom, current: row.est_courante }));
      rememberCompanies(activeSession.user.id, available); setCompanies(available); const selected = available.find((item) => item.current) ?? available[0] ?? null; setActiveCompany(selected);
      if (!selected) { setAccess(FREE_ACCESS); setStatus("verified"); setMessage("Aucune entreprise autorisée pour Tools · mode Free"); return; } await resolveEntitlement(activeSession, selected);
    } catch {
      const available = cachedCompanies(activeSession.user.id); setCompanies(available); const selected = available.find((item) => item.current) ?? available[0] ?? null; setActiveCompany(selected);
      if (selected) await resolveEntitlement(activeSession, selected); else { setAccess(FREE_ACCESS); setStatus("error"); setMessage("Entreprises non vérifiables · Tools Free reste disponible."); }
    }
  }, [configured, resolveEntitlement]);

  const refresh = useCallback(async () => { if (!configured) return; const { data } = await getElsatiaClient().auth.getSession(); setSession(data.session); await resolve(data.session); }, [configured, resolve]);
  const syncNow = useCallback(async () => {
    if (!configured || !session || !activeCompany || access.tier !== "pro" || typeof indexedDB === "undefined" || !navigator.onLine) { setSyncStatus("idle"); return; } setSyncStatus("syncing");
    try { await accessControl.exigerAccesApplication({ entrepriseId: activeCompany.id }, "tools"); const scope = projectStorageScope(activeCompany.id); const state = new IndexedDbSyncStateRepository(indexedDB, scope); const service = new SyncService(createProjectRepository(scope), state, new SupabaseCloudProjectStore(getElsatiaClient(), activeCompany.id), `${Capacitor.getPlatform()}-${session.user.id.slice(0, 8)}`); await service.enqueueInitialProjects(); await service.sync(); setSyncStatus((await state.list()).some((record) => record.status === "error") ? "error" : "synced"); }
    catch { setSyncStatus("error"); setAccess(FREE_ACCESS); setMessage("Accès entreprise retiré : écritures cloud bloquées."); }
  }, [configured, session, activeCompany, access.tier]);

  const switchCompany = useCallback(async (companyId: string) => {
    if (!session) throw new Error("Connectez votre compte ELSATIA."); const selected = companies.find((item) => item.id === companyId); if (!selected) throw new Error("Entreprise non autorisée."); setSwitchingCompany(true); setSyncStatus("idle"); setAccess(FREE_ACCESS);
    try { if (navigator.onLine) { const { error } = await getElsatiaClient().rpc("tools_changer_entreprise_active", { p_entreprise_id: companyId }); if (error) throw error; await accessControl.exigerAccesApplication({ entrepriseId: companyId }, "tools"); }
      const next = companies.map((item) => ({ ...item, current: item.id === companyId })); rememberCompanies(session.user.id, next); setCompanies(next); setActiveCompany({ ...selected, current: true }); await resolveEntitlement(session, selected);
    } finally { setSwitchingCompany(false); }
  }, [companies, resolveEntitlement, session]);

  useEffect(() => { if (!configured) return; let mounted = true; const client = getElsatiaClient(); void client.auth.getSession().then(({ data }) => { if (mounted) { setSession(data.session); void resolve(data.session); } }).catch(() => { if (mounted) { setSession(null); setAccess(FREE_ACCESS); setStatus("error"); setMessage("Session sécurisée indisponible. Tools Free reste disponible."); } }); const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => { if (!mounted) return; setSession(nextSession); void resolve(nextSession); }); const online = () => { void refresh(); }; window.addEventListener("online", online); return () => { mounted = false; listener.subscription.unsubscribe(); window.removeEventListener("online", online); }; }, [configured, refresh, resolve]);
  useEffect(() => { if (status !== "verified" || access.tier !== "pro" || !activeCompany) return; const timer = window.setTimeout(() => { void syncNow(); }, 0); return () => window.clearTimeout(timer); }, [status, access.tier, activeCompany, syncNow]);

  async function signIn(email: string, password: string) { if (!configured) throw new Error("Le compte ELSATIA n’est pas configuré ici."); setStatus("loading"); const { data, error } = await getElsatiaClient().auth.signInWithPassword({ email: email.trim(), password }); if (error) { setStatus("error"); throw new Error("Adresse ou mot de passe incorrect."); } setSession(data.session); await resolve(data.session); }
  async function signOut() { if (configured) await getElsatiaClient().auth.signOut({ scope: "local" }); await clearEntitlementCache(cacheStore, [null, ...companies.map((item) => item.id)]); setSession(null); setAccess(FREE_ACCESS); setCompanies([]); setActiveCompany(null); setActiveSources([]); setStatus("anonymous"); setMessage("Déconnecté · Tools Free reste disponible"); }
  async function requestPasswordReset(email: string) { if (!configured) throw new Error("Le compte ELSATIA n’est pas configuré ici."); const redirectTo = Capacitor.isNativePlatform() ? "fr.elsatia.tools://auth/recovery" : `${window.location.origin}/compte?recovery=1`; const { error } = await getElsatiaClient().auth.resetPasswordForEmail(email.trim(), { redirectTo }); if (error) throw new Error("Demande de récupération impossible."); }
  async function updatePassword(password: string) { if (password.length < 10) throw new Error("Le nouveau mot de passe doit contenir au moins 10 caractères."); const { error } = await getElsatiaClient().auth.updateUser({ password }); if (error) throw new Error("Mise à jour du mot de passe impossible."); }
  async function requestAccountDeletion() { if (!session) throw new Error("Connectez votre compte ELSATIA."); const { error } = await getElsatiaClient().rpc("tools_demander_suppression_compte"); if (error) throw new Error("Demande de suppression impossible."); await signOut(); }
  async function startPurchase(sku: ToolsProductSku) { if (!session) throw new Error("Connectez votre compte ELSATIA avant l’achat."); if (access.tier === "pro" || activeSources.length) throw new Error("Tools Pro est déjà actif sur votre compte."); const outcome = await startToolsPurchase(sku, session.user.id, session.access_token); if (outcome !== "redirect") await resolve(session); }
  async function restorePurchases() { if (!session) throw new Error("Connectez votre compte ELSATIA avant la restauration."); await restoreToolsPurchases(session.access_token); await resolve(session); }
  async function manageSubscription(source: "web" | "apple" | "google") { if (!session) throw new Error("Connectez votre compte ELSATIA."); await manageToolsSubscription(session.access_token, source); }

  const value: AccountContextValue = { configured, user: session?.user ?? null, access, status, message, companies, activeCompany, switchingCompany, activeSources, syncStatus, projectMutations, signIn, signOut, refresh, syncNow, switchCompany, requestPasswordReset, updatePassword, requestAccountDeletion, startPurchase, restorePurchases, manageSubscription };
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() { const context = useContext(AccountContext); if (!context) throw new Error("useAccount doit être utilisé dans AccountProvider."); return context; }
