import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargerDonneesDocumentPartage } from "@/lib/documents-commerciaux";
import { DocumentImprimable } from "@/components/DocumentImprimable";

export const metadata = { robots: { index: false, follow: false } };

// Page publique (sans authentification, sans navigation interne ELSATIA) :
// c'est ce que voit un client externe qui a reçu un lien de devis/facture.
// Ne doit jamais exposer autre chose que ce document précis — voir
// chargerDonneesDocumentPartage() : résolution du token et lecture passent par
// une seule fonction SECURITY DEFINER ; le client service_role n'y gagne aucun
// droit de table et ne peut rien lire sans le token.
export default async function DocumentPartagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const donnees = await chargerDonneesDocumentPartage(createAdminClient(), token);
  if (!donnees) notFound();

  return (
    <main className="min-h-full bg-neutral-100 py-8 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-neutral-600 dark:text-neutral-400">
            Document transmis par <strong>{donnees.entrepriseNom}</strong>
          </span>
          <a
            href={`/api/documents/partage/${token}/pdf?numero=${encodeURIComponent(donnees.numero)}&type=${donnees.estFacture ? "facture" : "devis"}`}
            className="rounded-md bg-[#0d1b2a] px-3 py-1.5 font-medium text-white"
          >
            Télécharger le PDF
          </a>
        </div>
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
