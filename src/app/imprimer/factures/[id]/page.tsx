import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { chargerDonneesFactureImprimable } from "@/lib/documents-commerciaux";
import { DocumentImprimable } from "@/components/DocumentImprimable";
import { DocumentA4 } from "@/components/documents/DocumentA4";
import { AutoPrint } from "@/components/AutoPrint";
import { chargerRenduDocument, vueDepuisReponse } from "@/lib/devis/v2-serveur";

export default async function ImprimerFacturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duplicata?: string }>;
}) {
  const { id } = await params;
  // Duplicata : reproduction du document FIGÉ, marquée comme telle ; l'original n'est jamais touché.
  const estDuplicata = (await searchParams).duplicata === "1";
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const reponse = await chargerRenduDocument(supabase, "facture", id);
  if (!reponse) notFound();
  const vue = vueDepuisReponse(reponse, { estDuplicata });
  if (vue) {
    return (
      <>
        <AutoPrint />
        <DocumentA4 vue={vue} mode="impression" />
      </>
    );
  }

  const donnees = await chargerDonneesFactureImprimable(supabase, { id, entrepriseId: ctx.entrepriseId });
  if (!donnees) notFound();

  return (
    <>
      <AutoPrint />
      <DocumentImprimable
        typeDoc={donnees.typeDoc}
        numero={donnees.numero}
        dateEmission={donnees.dateEmission}
        dateSecondaire={donnees.dateSecondaire}
        entreprise={donnees.entreprise}
        client={donnees.client}
        lignes={donnees.lignes}
        montantHt={donnees.montantHt}
        montantTva={donnees.montantTva}
        montantTtc={donnees.montantTtc}
        notesClient={donnees.notesClient}
        estFacture={true}
        signatures={donnees.signatures}
        photos={donnees.photos}
      />
    </>
  );
}
