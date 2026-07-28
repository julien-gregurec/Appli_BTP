"use server";

import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";

type ResultatAction = { ok: true } | { ok: false; error: string };

function nettoyerCle(valeur: string) {
  const cle = valeur.trim();
  return /^[a-z0-9-]{1,120}$/i.test(cle) ? cle : null;
}

export async function ignorerAlerteOperationnelleAction(
  alerteCle: string,
  signature: string,
  titre: string,
): Promise<ResultatAction> {
  const cle = nettoyerCle(alerteCle);
  const signatureNettoyee = signature.trim();
  const titreNettoye = titre.trim().slice(0, 250);

  if (!cle || !signatureNettoyee || signatureNettoyee.length > 1_000) {
    return { ok: false, error: "Cette alerte ne peut pas être ignorée." };
  }

  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase
    .from("alertes_operationnelles_ignorees")
    .upsert(
      {
        entreprise_id: ctx.entrepriseId,
        utilisateur_id: ctx.userId,
        alerte_cle: cle,
        signature: signatureNettoyee,
        titre: titreNettoye || null,
        ignoree_at: new Date().toISOString(),
      },
      { onConflict: "entreprise_id,utilisateur_id,alerte_cle" },
    );

  if (error) return { ok: false, error: "Impossible d’ignorer l’alerte pour le moment." };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function retablirAlerteOperationnelleAction(
  alerteCle: string,
): Promise<ResultatAction> {
  const cle = nettoyerCle(alerteCle);
  if (!cle) return { ok: false, error: "Alerte invalide." };

  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { error } = await supabase
    .from("alertes_operationnelles_ignorees")
    .delete()
    .eq("entreprise_id", ctx.entrepriseId)
    .eq("utilisateur_id", ctx.userId)
    .eq("alerte_cle", cle);

  if (error) return { ok: false, error: "Impossible de rétablir l’alerte pour le moment." };
  revalidatePath("/dashboard");
  return { ok: true };
}
