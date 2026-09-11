import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resoudreTokenPartage } from "@/lib/documents-partage";
import { chargerDonneesDevisImprimable, chargerDonneesFactureImprimable } from "@/lib/documents-commerciaux";
import { DocumentImprimable } from "@/components/DocumentImprimable";
import { DocumentA4 } from "@/components/documents/DocumentA4";
import { chargerRenduParJeton, vueDepuisReponse } from "@/lib/devis/v2-serveur";

export const metadata = { robots: { index: false, follow: false } };

function Bandeau({ entrepriseNom, lienPdf }: { entrepriseNom: string; lienPdf: string }) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <span className="text-neutral-600 dark:text-neutral-400">
        Document transmis par <strong>{entrepriseNom}</strong>
      </span>
      <a href={lienPdf} className="rounded-md bg-[#0d1b2a] px-3 py-1.5 font-medium text-white">
        Télécharger le PDF
      </a>
    </div>
  );
}

// Page publique (sans authentification, sans navigation interne ELSATIA) :
// c'est ce que voit un client externe qui a reçu un lien de devis/facture.
// Ne doit jamais exposer autre chose que ce document précis — voir
// resoudreTokenPartage() pour la résolution du token et son isolation.
export default async function DocumentPartagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabaseAnon = await createClient();

  // Moteur v2 : le document client figé, rendu par une fonction résolue par le jeton (sans
  // service_role), avec EXACTEMENT les pages du PDF téléchargeable.
  const reponse = await chargerRenduParJeton(supabaseAnon, token);
  if (!reponse) notFound();
  const vue = vueDepuisReponse(reponse);
  if (vue) {
    const lienPdf = `/api/documents/partage/${token}/pdf?numero=${encodeURIComponent(vue.numero)}&type=${vue.typeDocument}`;
    return (
      <main className="min-h-full bg-neutral-100 py-8 dark:bg-neutral-950">
        <div className="mx-auto max-w-[230mm] px-4">
          <Bandeau entrepriseNom={vue.emetteur.nom} lienPdf={lienPdf} />
          <div className="overflow-x-auto">
            <DocumentA4 vue={vue} mode="consultation" />
          </div>
        </div>
      </main>
    );
  }

  const resolution = await resoudreTokenPartage(supabaseAnon, token);
  if (!resolution) notFound();

  const supabaseAdmin = createAdminClient();
  const donnees =
    resolution.typeDocument === "devis"
      ? await chargerDonneesDevisImprimable(supabaseAdmin, { id: resolution.documentId, entrepriseId: resolution.entrepriseId })
      : await chargerDonneesFactureImprimable(supabaseAdmin, { id: resolution.documentId, entrepriseId: resolution.entrepriseId });
  if (!donnees) notFound();

  return (
    <main className="min-h-full bg-neutral-100 py-8 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4">
        <Bandeau
          entrepriseNom={donnees.entrepriseNom}
          lienPdf={`/api/documents/partage/${token}/pdf?numero=${encodeURIComponent(donnees.numero)}&type=${donnees.estFacture ? "facture" : "devis"}`}
        />
        <div className="overflow-hidden rounded-md border border-neutral-200 shadow-sm dark:border-neutral-800">
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
            photos={[]}
          />
        </div>
      </div>
    </main>
  );
}
