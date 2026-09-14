import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { lireFormat, TYPES_DOCUMENT_NUMEROTES, type TypeDocumentNumerote } from "@/lib/numerotation-documents";
import { NumerotationDocuments, type EtatNumerotation } from "@/components/parametres/NumerotationDocuments";

export const dynamic = "force-dynamic";

export default async function NumerotationPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  const [{ error, succes }, ctx] = await Promise.all([searchParams, getContexteEntreprise()]);
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_parametres");
  const { data: lignes } = await supabase.from("numerotation_documents").select("type_document, prefixe, avec_annee, avec_mois, separateur, largeur, compteur_annuel").eq("entreprise_id", ctx.entrepriseId);
  const etat = {} as EtatNumerotation;
  for (const type of TYPES_DOCUMENT_NUMEROTES) {
    const ligne = lignes?.find((l) => l.type_document === type) ?? null;
    const { data: prochain } = peutGerer ? await supabase.rpc("numero_document_apercu", { p_entreprise_id: ctx.entrepriseId, p_type: type }) : { data: null };
    etat[type as TypeDocumentNumerote] = { format: lireFormat(type, ligne), prochain: typeof prochain === "string" ? prochain : null, configure: ligne !== null };
  }
  return (
    <main className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link href="/parametres" className="text-sm text-neutral-500 hover:underline">← Paramètres</Link>
          <h1 className="mt-1 text-xl font-semibold">Numérotation des documents</h1>
          <p className="text-sm text-neutral-500">Format des numéros de devis, factures, avoirs et commandes : préfixe facultatif, année, mois, séparateur, nombre de chiffres. Propre à votre entreprise.</p>
          <Link href="/parametres/devis" className="mt-1 inline-block text-sm text-[#0d1b2a] underline dark:text-white">← Valeurs par défaut des devis et rappel de sauvegarde</Link>
        </div>
        {!devisV2Actif() && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Réglage disponible avec l’éditeur de devis V2.</p>}
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {succes && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Numérotation enregistrée.</p>}
        <NumerotationDocuments initial={etat} peutGerer={peutGerer} voitProchain={peutGerer} />
      </div>
    </main>
  );
}
