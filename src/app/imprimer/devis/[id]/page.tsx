import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { chargerDonneesDevisImprimable } from "@/lib/documents-commerciaux";
import { DocumentImprimable } from "@/components/DocumentImprimable";
import { DocumentA4 } from "@/components/documents/DocumentA4";
import { AutoPrint } from "@/components/AutoPrint";
import { chargerRenduDocument, vueDepuisReponse } from "@/lib/devis/v2-serveur";

export default async function ImprimerDevisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  // Moteur v2 (brouillon v2, ou devis émis avec son instantané v2) : la même source que l'aperçu,
  // le PDF, le portail et la pièce jointe d'e-mail. Tout autre devis garde le rendu historique.
  const reponse = await chargerRenduDocument(supabase, "devis", id);
  if (!reponse) notFound();
  const vue = vueDepuisReponse(reponse);
  if (vue) {
    return (
      <>
        <AutoPrint />
        <DocumentA4 vue={vue} mode="impression" />
      </>
    );
  }

  const donnees = await chargerDonneesDevisImprimable(supabase, { id, entrepriseId: ctx.entrepriseId });
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
        estFacture={false}
        signatures={donnees.signatures}
        photos={donnees.photos}
      />
    </>
  );
}
