import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { chargerDonneesFactureImprimable } from "@/lib/documents-commerciaux";
import { DocumentImprimable } from "@/components/DocumentImprimable";
import { AutoPrint } from "@/components/AutoPrint";

export default async function ImprimerFacturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

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
