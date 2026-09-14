import Link from "next/link";

/** Affiché tant que le moteur de devis v2 est éteint. Aucun accès à la base. */
export function BibliothequeInactive() {
  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/ouvrages" className="inline-flex min-h-11 items-center text-sm text-neutral-500 hover:underline">← Ouvrages, modèles et métrés</Link>
        <section className="space-y-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h1 className="text-lg font-semibold">Bibliothèque d’ouvrages composés</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            La bibliothèque d’ouvrages composés arrive avec le nouvel éditeur de devis. Vos modèles chiffrés et vos métrés restent disponibles dans la page Ouvrages.
          </p>
        </section>
      </div>
    </main>
  );
}
