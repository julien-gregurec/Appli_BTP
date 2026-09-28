import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { MESSAGES_REABONNEMENT } from "@/lib/stripe-reabonnement";

export default async function AbonnementSuccesPage({ searchParams }: { searchParams: Promise<{ reabonnement?: string }> }) {
  const { reabonnement } = await searchParams;
  // Réabonnement (ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1) : pas d'essai, paiement
  // immédiat ; l'accès ne revient qu'avec la confirmation Stripe (webhook).
  if (reabonnement === "1") {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-50 p-4">
        <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold">{MESSAGES_REABONNEMENT.en_attente.titre}</h1>
          <p className="mt-3 text-sm text-neutral-600">{MESSAGES_REABONNEMENT.en_attente.description}</p>
          <Link href="/abonnement" className="mt-6 inline-flex rounded-md bg-[#0d1b2a] px-5 py-3 text-sm font-semibold text-white">
            Retourner dans {PRODUCT_NAME}
          </Link>
        </section>
      </main>
    );
  }
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 p-4">
      <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-3xl text-green-700">✓</div>
        <h1 className="mt-5 text-2xl font-semibold">Abonnement enregistré</h1>
        <p className="mt-3 text-sm text-neutral-600">
          Votre moyen de paiement est enregistré de façon sécurisée par Stripe. Aucun prélèvement n’est effectué pendant l’essai de 30 jours.
        </p>
        <Link href="/abonnement?succes=1" className="mt-6 inline-flex rounded-md bg-[#0d1b2a] px-5 py-3 text-sm font-semibold text-white">
          Retourner dans {PRODUCT_NAME}
        </Link>
      </section>
    </main>
  );
}
