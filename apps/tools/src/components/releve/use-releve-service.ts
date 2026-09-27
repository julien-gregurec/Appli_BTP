"use client";

import { useEffect, useState } from "react";
import { ReleveService, type ReleveActorContext } from "@elsatia/releve-domain";
import { hasCapability } from "@/lib/access";
import { getElsatiaClient } from "@/lib/auth/client";
import { loadReleveActorContext } from "@/lib/releve/actor-context";
import { SupabaseReleveRepository } from "@/lib/releve/supabase-repository";
import { useAccount } from "../AccountProvider";

export type ReleveServiceState =
  | { status: "locked"; reason: "account" | "company" | "entitlement" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; service: ReleveService; actor: ReleveActorContext };

/**
 * Construit le service Relevé & Métré pour l'entreprise active. Le verrou client n'est
 * qu'un confort d'affichage : la RLS refuse de toute façon un compte sans `releve-metre`.
 */
export function useReleveService(): ReleveServiceState {
  const { configured, user, activeCompany, access, status: accountStatus } = useAccount();
  const entitled = hasCapability(access, "releve-metre");
  const companyId = activeCompany?.id ?? null;
  const userId = user?.id ?? null;
  const [loaded, setLoaded] = useState<{ key: string; state: ReleveServiceState } | null>(null);
  const key = `${userId}:${companyId}:${entitled}`;

  useEffect(() => {
    if (!configured || !userId || !companyId || !entitled) return;
    let cancelled = false;
    loadReleveActorContext(getElsatiaClient(), userId, companyId)
      .then((actor) => {
        if (!cancelled) setLoaded({ key, state: { status: "ready", actor, service: new ReleveService(new SupabaseReleveRepository(getElsatiaClient()), actor) } });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ key, state: { status: "error", message: error instanceof Error ? error.message : "Droits non vérifiables." } });
      });
    return () => { cancelled = true; };
  }, [configured, userId, companyId, entitled, key]);

  if (!configured || !userId) return accountStatus === "loading" ? { status: "loading" } : { status: "locked", reason: "account" };
  if (!companyId) return { status: "locked", reason: "company" };
  if (!entitled) return { status: "locked", reason: "entitlement" };
  return loaded?.key === key ? loaded.state : { status: "loading" };
}
