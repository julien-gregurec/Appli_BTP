import Link from "next/link";

export default function AbonnementSuccesPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 p-4">
      <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-3xl text-green-700">✓</div>
        <h1 className="mt-5 text-2xl font-semibold">Abonnement enregistré</h1>
        <p className="mt-3 text-sm text-neutral-600">
          Votre moyen de paiement est enregistré de façon sécurisée par Stripe. Aucun prélèvement n’est effectué pendant l’essai de 30 jours.
        </p>
        <Link href="/abonnement?succes=1" className="mt-6 inline-flex rounded-md bg-[#0d1b2a] px-5 py-3 text-sm font-semibold text-white">
          Retourner dans Liria Gestion Pro
        </Link>
      </section>
    </main>
  );
}
