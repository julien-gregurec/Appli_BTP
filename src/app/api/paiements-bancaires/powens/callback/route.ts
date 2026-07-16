import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenirPaiementPowens, verifierEtatPaiementBancaire } from "@/lib/banking";

export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || request.nextUrl.origin;
  const etat = verifierEtatPaiementBancaire(request.nextUrl.searchParams.get("state") || "");
  if (!etat) return NextResponse.redirect(`${base}/paiements-bancaires?error=${encodeURIComponent("Retour bancaire invalide ou expiré")}`);
  const admin = createAdminClient();
  const { data: lot } = await admin.from("lots_virements").select("id,entreprise_id,provider_payment_id").eq("id", etat.lotId).eq("entreprise_id", etat.entrepriseId).maybeSingle();
  if (!lot?.provider_payment_id) return NextResponse.redirect(`${base}/paiements-bancaires?error=${encodeURIComponent("Lot bancaire introuvable")}`);
  try {
    const paiement = await obtenirPaiementPowens(lot.provider_payment_id);
    const { error } = await admin.rpc("reconcilier_lot_virements", { p_lot_id: lot.id, p_provider_statut: paiement.state, p_message: request.nextUrl.searchParams.get("bank_message") || null });
    if (error) throw error;
    const message = paiement.state === "done"
      ? "Virements exécutés et sources comptables mises à jour"
      : paiement.state === "rejected"
        ? "Le lot a été rejeté par la banque"
        : "Validation bancaire reçue ; le statut final reste en cours de confirmation";
    return NextResponse.redirect(`${base}/paiements-bancaires?success=${encodeURIComponent(message)}`);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Impossible de contrôler le retour bancaire";
    return NextResponse.redirect(`${base}/paiements-bancaires?error=${encodeURIComponent(message)}`);
  }
}
