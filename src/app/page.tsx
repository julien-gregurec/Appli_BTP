import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { PiedLegal } from "@/components/PiedLegal";
import { DUREE_ESSAI_JOURS } from "@/lib/plateforme";
import { BrandWordmark } from "@/components/BrandWordmark";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — Le logiciel de gestion pour les entreprises du BTP`,
  description: "Clients, devis, factures, chantiers, planning, pointage, stock et rentabilité : un seul outil pour piloter votre entreprise du bâtiment.",
};

const GROUPES = [
  {
    titre: "Clients & ventes",
    points: ["Fiches clients centralisées", "Devis et factures", "Prestations réutilisables", "Suivi des règlements"],
  },
  {
    titre: "Chantiers & interventions",
    points: ["Suivi de chantier", "Équipe affectée", "Documents et photos", "Travaux à réaliser"],
  },
  {
    titre: "Équipe & temps",
    points: ["Planning des équipes", "Pointage des heures avec GPS", "Congés", "Notes de frais"],
  },
  {
    titre: "Achats & stock",
    points: ["Fournisseurs et commandes", "Charges récurrentes", "Articles, dépôt et inventaires", "Borne de scan en atelier"],
  },
  {
    titre: "Matériel",
    points: ["Flotte automobile", "Outillage et affectations", "Suivi d’entretien"],
  },
  {
    titre: "Pilotage",
    points: ["Rentabilité par chantier", "Trésorerie", "Exports comptables"],
  },
];

export default async function AccueilPage() {
  if (!isEmailLoginDisabled()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <BrandWordmark className="text-base text-[#0d1b2a] dark:text-white sm:text-lg" />
          </div>
          <nav className="flex shrink-0 items-center gap-2 text-xs font-medium sm:gap-4 sm:text-sm">
            <Link href="/tarifs" className="hidden text-neutral-600 hover:text-[#0d1b2a] dark:text-neutral-300 dark:hover:text-white sm:inline">Tarifs</Link>
            <Link href="/login" className="text-neutral-600 hover:text-[#0d1b2a] dark:text-neutral-300 dark:hover:text-white">Se connecter</Link>
            <Link href="/signup" className="rounded-lg bg-[#0d1b2a] px-3 py-2 whitespace-nowrap text-white hover:bg-[#0d1b2a]/90 dark:bg-white dark:text-[#0d1b2a] sm:px-4">Essai gratuit</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#c9a24a]">Fait pour le bâtiment</p>
        <h1 className="mt-3 text-4xl font-bold text-[#0d1b2a] dark:text-white sm:text-5xl">
          Toute la gestion de votre entreprise BTP, dans un seul outil
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600 dark:text-neutral-300">
          Clients, devis, factures, chantiers, planning, pointage, stock et rentabilité. {PRODUCT_NAME}
          centralise ce qui aujourd’hui est éparpillé entre Excel, papier et plusieurs logiciels.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="rounded-lg bg-[#0d1b2a] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0d1b2a]/90 dark:bg-white dark:text-[#0d1b2a]">
            Démarrer l’essai de {DUREE_ESSAI_JOURS} jours
          </Link>
          <Link href="/tarifs" className="rounded-lg border border-[#0d1b2a] px-6 py-3 text-sm font-semibold text-[#0d1b2a] hover:bg-neutral-100 dark:border-white dark:text-white dark:hover:bg-neutral-800">
            Voir les tarifs
          </Link>
        </div>
        <p className="mt-4 text-xs text-neutral-500">Sans engagement et sans débit pendant la période d’essai.</p>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GROUPES.map((groupe) => (
            <div key={groupe.titre} className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-lg font-bold text-[#0d1b2a] dark:text-white">{groupe.titre}</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-neutral-600 dark:text-neutral-300">
                {groupe.points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <span className="mt-1 text-[#c9a24a]">✓</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-20 text-center">
        <div className="rounded-2xl border border-[#c9a24a]/40 bg-[#c9a24a]/5 p-10">
          <h2 className="text-2xl font-bold text-[#0d1b2a] dark:text-white">Prêt à essayer ?</h2>
          <p className="mt-3 text-neutral-600 dark:text-neutral-300">
            Chaque droit d’accès reste contrôlé par le rôle défini par l’administrateur de votre entreprise.
          </p>
          <Link href="/signup" className="mt-6 inline-block rounded-lg bg-[#0d1b2a] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0d1b2a]/90 dark:bg-white dark:text-[#0d1b2a]">
            Créer mon compte
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-8">
        <PiedLegal />
      </div>
    </main>
  );
}
