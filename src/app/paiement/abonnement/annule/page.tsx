import Link from "next/link";
import { MESSAGES_REABONNEMENT } from "@/lib/stripe-reabonnement";

export default async function AbonnementAnnulePage({ searchParams }: { searchParams: Promise<{ reabonnement?: string }> }) {
  const { reabonnement } = await searchParams;
  // Réabonnement interrompu (ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1) : aucun accès rouvert.
  const echec = reabonnement === "1";
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 p-4">
      <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">{echec ? MESSAGES_REABONNEMENT.echec.titre : "Souscription interrompue"}</h1>
        <p className="mt-3 text-sm text-neutral-600">{echec ? MESSAGES_REABONNEMENT.echec.description : "Aucun abonnement n’a été créé et aucun paiement n’a été effectué."}</p>
        <Link href={echec ? "/abonnement#choisir-offre" : "/abonnement"} className="mt-6 inline-flex rounded-md bg-[#0d1b2a] px-5 py-3 text-sm font-semibold text-white">
          {echec ? MESSAGES_REABONNEMENT.reactiver.libelle : "Revenir aux offres"}
        </Link>
      </section>
    </main>
  );
}
