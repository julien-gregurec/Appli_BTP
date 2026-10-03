import { after } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { traiterEvenementsWebhook } from "@/lib/social/synchronisation";
import { cleEvenement } from "@/lib/social/securite";
import type { Fournisseur } from "@/lib/social/types";

export const TAILLE_MAX_WEBHOOK = 1_000_000;

/**
 * Enregistre un événement vérifié (idempotent) puis le traite après la réponse.
 * La plateforme reçoit 200 immédiatement ; un échec de traitement est repris
 * par le cron, puis classé « abandonne » (file des échecs) après 5 tentatives.
 */
export async function enregistrerEvenement(fournisseur: Fournisseur, corpsBrut: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(corpsBrut);
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const admin = createAdminClient();
  const type = typeof payload === "object" && payload ? String((payload as { object?: string; type?: string }).object ?? (payload as { type?: string }).type ?? "") : "";
  const { error } = await admin.from("social_webhook_evenements").insert({ fournisseur, cle_idempotence: cleEvenement(fournisseur, corpsBrut), type_evenement: type || null, payload });
  if (error?.code === "23505") return NextResponse.json({ recu: true, doublon: true });
  if (error) return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 }); // la plateforme réessaiera
  after(async () => {
    await traiterEvenementsWebhook(createAdminClient(), 10);
  });
  return NextResponse.json({ recu: true });
}
