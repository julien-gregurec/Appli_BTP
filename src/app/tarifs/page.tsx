import Link from "next/link";
import type { Metadata } from "next";
import { OFFRES, BESOINS_OPTIONS, DUREE_ESSAI_JOURS, prixAbonnementMensuel } from "@/lib/plateforme";
import { PiedLegal } from "@/components/PiedLegal";

export const metadata: Metadata = {
  title: "Tarifs — Liria Gestion Pro",
  description: "Nos offres pour les entreprises du bâtiment : devis, chantiers, planning, pointage, stock et rentabilité.",
};

export default function TarifsPage() {
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-12 dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#c9a24a]">Liria Gestion Pro</p>
          <h1 className="mt-2 text-3xl font-bold text-[#0d1b2a] dark:text-white">Un tarif clair, du devis à la marge</h1>
          <p className="mx-auto mt-3 max-w-2xl text-neutral-600 dark:text-neutral-300">
            Tous vos chantiers dans un seul logiciel. {DUREE_ESSAI_JOURS} jours d&apos;essai gratuit, sans engagement
            ni carte bancaire. −20 % en paiement annuel.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {OFFRES.map((offre) => {
            const enVedette = offre.cle === "pro";
            const prix = prixAbonnementMensuel(offre.comptesInclus, offre);
            const inclus = BESOINS_OPTIONS.filter((b) => b.palier <= offre.palier);
            return (
              <div key={offre.cle}
                className={`flex flex-col rounded-2xl border bg-white p-6 dark:bg-neutral-900 ${enVedette ? "border-[#c9a24a] shadow-lg ring-1 ring-[#c9a24a]" : "border-neutral-200 dark:border-neutral-800"}`}>
                {enVedette && <span className="mb-3 inline-block self-start rounded-full bg-[#c9a24a] px-3 py-0.5 text-xs font-semibold text-[#0d1b2a]">Le plus choisi</span>}
                <h2 className="text-lg font-bold text-[#0d1b2a] dark:text-white">{offre.nom}</h2>
                <p className="mt-1 min-h-10 text-sm text-neutral-500">{offre.resume}</p>

                <div className="mt-4">
                  <span className="text-4xl font-bold text-[#0d1b2a] dark:text-white">{offre.base} €</span>
                  <span className="text-sm text-neutral-500"> / mois HT</span>
                </div>
                <p className="text-sm text-green-700 dark:text-green-400">ou {prix.mensuelSiAnnuel} € / mois en annuel</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {offre.comptesInclus} comptes inclus, puis {offre.parCompteSup} € / compte supplémentaire
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {offre.stockageGoInclus} Go de fichiers inclus, puis 0,50 € HT / Go / mois
                </p>

                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {inclus.map((b) => (
                    <li key={b.cle} className="flex items-start gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                        className="mt-0.5 flex-none text-green-600" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                      <span className="text-neutral-700 dark:text-neutral-200">{b.libelle}</span>
                    </li>
                  ))}
                </ul>

                <Link href="/signup"
                  className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${enVedette ? "bg-[#0d1b2a] text-white" : "border border-[#0d1b2a] text-[#0d1b2a] dark:border-white dark:text-white"}`}>
                  Essayer gratuitement
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-neutral-200 bg-white p-5 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="font-semibold text-[#0d1b2a] dark:text-white">Ce qui est compris dans tous les tarifs</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              `${DUREE_ESSAI_JOURS} jours d'essai gratuit, sans carte`,
              "Reprise de vos données depuis votre ancien logiciel",
              "Application mobile pour vos équipes",
              "Mises à jour et support inclus",
              "Vos données hébergées et chiffrées",
              "Sans engagement, résiliable à tout moment",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2 text-neutral-700 dark:text-neutral-200">
                <span className="mt-0.5 text-[#c9a24a]">◆</span>{t}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 text-center text-sm text-neutral-500">
          Déjà un compte ? <Link href="/login" className="font-medium text-[#0d1b2a] underline dark:text-white">Se connecter</Link>
        </p>

        <PiedLegal />
      </div>
    </main>
  );
}
