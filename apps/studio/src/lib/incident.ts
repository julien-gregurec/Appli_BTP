import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { creerGardeProxy, type ControleSante } from "@elsatia/incident-control";

/**
 * Mode sûr (incident) de Studio — projet Supabase DÉDIÉ. L'état vient de
 * `public.incident_etat_public()` (migration dédiée 20260929180000), qui traduit
 * `studio_guard.control.mode` : 'off' → application coupée (503), 'read_only' → lecture seule.
 * La base reste l'autorité (studio_guard.assert_write). `STUDIO_ENABLED` demeure une coupure de
 * dernier recours, indépendante de la base (voir proxy.ts).
 */
const garde = creerGardeProxy({
  app: "studio",
  urlSupabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
  clePublique: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export async function reponseModeSur(chemin: string, methode: string, entetes: Headers): Promise<NextResponse | null> {
  const reponse = await garde({ chemin, methode, entetes });
  return reponse ? new NextResponse(reponse.corps, { status: reponse.statut, headers: reponse.entetes }) : null;
}

/** Sonde profonde autorisée par `Authorization: Bearer <STUDIO_CRON_SECRET>`. */
export function sondeProfondeAutorisee(autorisation: string | null, secret = process.env.STUDIO_CRON_SECRET): boolean {
  if (!secret || !autorisation?.startsWith("Bearer ")) return false;
  const a = Buffer.from(autorisation.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

type SanteWorker = { rendus_sans_battement?: unknown; rendus_en_attente_anciens?: unknown };

/**
 * Worker de rendu vu depuis la base : un rendu en cours sans battement depuis 60 s, ou une file
 * qui ne se vide plus depuis 10 min, signale un worker bloqué ou arrêté. Compteurs seulement.
 * `lire` appelle l'RPC `incident_worker_sante` (service_role) via le client confiné
 * `storage-admin` ; `null` = non configuré.
 */
export function controleWorker(lire: (() => Promise<{ data: unknown; error: unknown }>) | null): ControleSante {
  return {
    nom: "worker_studio",
    critique: false,
    executer: async () => {
      if (!lire) return "non_configure";
      const { data, error } = await lire();
      if (error || !data || typeof data !== "object") return "ko";
      const sante = data as SanteWorker;
      return Number(sante.rendus_sans_battement) === 0 && Number(sante.rendus_en_attente_anciens) === 0 ? "ok" : "ko";
    },
  };
}
