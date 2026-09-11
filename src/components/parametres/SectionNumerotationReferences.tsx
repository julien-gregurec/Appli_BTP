import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { ENTITES_REFERENCE, type EntiteReference } from "@/lib/references";
import { NumerotationReferences, type ParametreReference } from "@/components/parametres/NumerotationReferences";

/**
 * Section « Numérotation des références » avec ses données (lecture sous RLS : tout membre actif de
 * l'entreprise). À n'afficher que drapeau `GP_DEVIS_V2` posé : la table vient avec les migrations V1.
 */
export async function SectionNumerotationReferences({ peutGerer, attribuees }: { peutGerer: boolean; attribuees?: string }) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase
    .from("references_parametres")
    .select("entite, prefixe, largeur, avec_annee, generation_auto")
    .eq("entreprise_id", ctx.entrepriseId);

  const parametres: Partial<Record<EntiteReference, ParametreReference>> = {};
  for (const l of (data ?? []) as Array<Record<string, unknown>>) {
    const entite = String(l.entite);
    if (!(ENTITES_REFERENCE as readonly string[]).includes(entite)) continue;
    parametres[entite as EntiteReference] = {
      prefixe: String(l.prefixe),
      largeur: Number(l.largeur),
      avecAnnee: l.avec_annee === true,
      generationAuto: l.generation_auto !== false,
    };
  }
  return <NumerotationReferences parametres={parametres} peutGerer={peutGerer} attribuees={attribuees} />;
}
