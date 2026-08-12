import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resoudreTokenPartage } from "@/lib/documents-partage";
import { chargerDonneesDevisImprimable, chargerDonneesFactureImprimable } from "@/lib/documents-commerciaux";
import { DocumentImprimable } from "@/components/DocumentImprimable";

export const metadata = { robots: { index: false, follow: false } };

// Page publique (token dans l'URL, aucune session requise) : source unique
// utilisée à la fois par le téléchargement PDF externe
// (/api/documents/partage/[token]/pdf) et par la pièce jointe des e-mails
// devis/facture (voir src/lib/documents-envoi.ts) — Chromium headless
// l'imprime telle quelle, sans rendu dupliqué. Pas de chrome ELSATIA ici
// (contrairement à /document/[token], destinée elle à un humain) : ce n'est
// que le document, prêt à être imprimé.
export default async function ImprimerPartagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabaseAnon = await createClient();
  const resolution = await resoudreTokenPartage(supabaseAnon, token);
  if (!resolution) notFound();

  const supabaseAdmin = createAdminClient();
  const donnees =
    resolution.typeDocument === "devis"
      ? await chargerDonneesDevisImprimable(supabaseAdmin, { id: resolution.documentId, entrepriseId: resolution.entrepriseId })
      : await chargerDonneesFactureImprimable(supabaseAdmin, { id: resolution.documentId, entrepriseId: resolution.entrepriseId });
  if (!donnees) notFound();

  return (
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
      estFacture={donnees.estFacture}
      signatures={donnees.signatures}
      photos={donnees.photos}
    />
  );
}
