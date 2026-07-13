import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

function ipDepuisEntetes(value: string | null): string | null {
  const candidat = value?.split(",")[0]?.trim() ?? "";
  return isIP(candidat) ? candidat : null;
}

export async function contexteAuditHttp() {
  const h = await headers();
  return {
    adresseIp: ipDepuisEntetes(h.get("x-forwarded-for") ?? h.get("x-real-ip")),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  };
}

export async function ajouterAudit(
  supabase: SupabaseClient,
  params: {
    entrepriseId: string;
    action: string;
    ressourceType: string;
    ressourceId: string;
    ancienStatut?: string | null;
    nouveauStatut?: string | null;
    metadata?: Record<string, unknown>;
    empreinteDocument?: string | null;
  },
) {
  const http = await contexteAuditHttp();
  const { error } = await supabase.rpc("ajouter_audit_note_frais", {
    p_entreprise_id: params.entrepriseId,
    p_action: params.action,
    p_ressource_type: params.ressourceType,
    p_ressource_id: params.ressourceId,
    p_ancien_statut: params.ancienStatut ?? null,
    p_nouveau_statut: params.nouveauStatut ?? null,
    p_metadata: params.metadata ?? {},
    p_empreinte_document: params.empreinteDocument ?? null,
    p_adresse_ip: http.adresseIp,
    p_user_agent: http.userAgent,
  });
  if (error) throw new Error(`Journal d’audit indisponible : ${error.message}`);
}

export async function journaliserAccesRefuse(
  supabase: SupabaseClient,
  params: { entrepriseId?: string | null; ressourceType: string; ressourceId?: string | null; action: string; motif: string },
) {
  const http = await contexteAuditHttp();
  await supabase.rpc("journaliser_acces_refuse_note_frais", {
    p_entreprise_id: params.entrepriseId ?? null,
    p_ressource_type: params.ressourceType,
    p_ressource_id: params.ressourceId ?? null,
    p_action: params.action,
    p_motif: params.motif,
    p_adresse_ip: http.adresseIp,
    p_user_agent: http.userAgent,
  });
}
