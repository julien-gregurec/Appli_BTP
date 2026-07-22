import Link from "next/link";

export default async function ModuleNonInclusPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const { module } = await searchParams;
  return (
    <main className="mx-auto max-w-2xl space-y-6 py-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#9b762f]">Abonnement</p>
        <h1 className="mt-2 text-3xl font-bold">Module non inclus dans votre offre</h1>
      </div>
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
        <p>
          Votre poste peut être autorisé à utiliser ce module, mais l’offre souscrite par
          l’entreprise ne l’inclut pas actuellement.
        </p>
        {module ? <p className="mt-3 text-sm">Droit concerné : <code>{module}</code></p> : null}
      </section>
      <div className="flex flex-wrap gap-3">
        <Link href="/abonnement" className="rounded-lg bg-[#0d1b2a] px-4 py-2 font-semibold text-white">
          Comparer les offres
        </Link>
        <Link href="/dashboard" className="rounded-lg border px-4 py-2 font-semibold">
          Retour au tableau de bord
        </Link>
      </div>
    </main>
  );
}
