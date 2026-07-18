import Link from "next/link";

export default function AbonnementAnnulePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-50 p-4">
      <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">Souscription interrompue</h1>
        <p className="mt-3 text-sm text-neutral-600">Aucun abonnement n’a été créé et aucun paiement n’a été effectué.</p>
        <Link href="/abonnement" className="mt-6 inline-flex rounded-md bg-[#0d1b2a] px-5 py-3 text-sm font-semibold text-white">
          Revenir aux offres
        </Link>
      </section>
    </main>
  );
}
