import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { appliquerRemiseAction, retirerRemiseAction } from "@/app/actions/plateforme";
import { ConsoleRemises, type DossierRemise } from "@/components/commercial/ConsoleRemises";
import { estForfaitVendable } from "@/lib/commercial/catalogue";
import { MODULES_COMMERCIAUX } from "@/lib/commercial/catalogue";

export const metadata = { title: "Remises commerciales" };

type LigneEntreprise = {
  id: string;
  nom: string;
  code_adhesion: string | null;
  abonnement_offre: string | null;
  abonnement_periodicite: string | null;
  stripe_subscription_id: string | null;
  remise_description: string | null;
  remise_type: string | null;
  remise_valeur: number | null;
  remise_duree_mois: number | null;
  remise_appliquee_at: string | null;
};

const carte = "rounded-2xl border bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";

export default async function PlateformeRemisesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entreprise?: string; succes?: string; error?: string }>;
}) {
  if (!(await estPlateformeAdmin())) notFound();
  const { q, entreprise: entrepriseId, succes, error } = await searchParams;
  const supabase = await createClient();

  const { data: brut, error: erreurListe } = await supabase.rpc("plateforme_entreprises");
  const entreprises = ((brut ?? []) as LigneEntreprise[]).filter((ligne) =>
    !q || `${ligne.nom} ${ligne.code_adhesion ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );
  const selectionnee = entrepriseId ? entreprises.find((ligne) => ligne.id === entrepriseId) ?? null : null;

  const { data: admins } = await supabase.from("plateforme_admins").select("id").limit(50);
  const nombreAdminsPlateforme = Math.max(1, admins?.length ?? 1);

  let dossier: DossierRemise | null = null;
  let historique: Array<{ id: string; action: string; created_at: string; nouveau: unknown }> = [];
  if (selectionnee) {
    const [{ data: capacite }, { data: modulesEtat }, { data: journal }] = await Promise.all([
      supabase.rpc("capacite_personnes_entreprise", { p_entreprise_id: selectionnee.id }).maybeSingle(),
      supabase.rpc("modules_entreprise_etat", { p_entreprise_id: selectionnee.id }),
      supabase
        .from("historique_tarification")
        .select("id,action,created_at,nouveau")
        .eq("entreprise_id", selectionnee.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    const capaciteLigne = (Array.isArray(capacite) ? capacite[0] : capacite) as { personnes_actives?: number } | null;
    const forfait = estForfaitVendable(selectionnee.abonnement_offre) ? selectionnee.abonnement_offre : "mini";
    // Modules ACHETÉS uniquement : ceux inclus dans le forfait sont déjà dans le prix.
    const codesActifs = new Set(
      ((modulesEtat ?? []) as Array<{ module_code?: string; entitlement_actif?: boolean; inclus_plan?: boolean }>)
        .filter((ligne) => ligne.entitlement_actif && !ligne.inclus_plan)
        .map((ligne) => String(ligne.module_code)),
    );
    dossier = {
      entrepriseId: selectionnee.id,
      nom: selectionnee.nom,
      forfait,
      periodicite: selectionnee.abonnement_periodicite === "annuel" ? "annuel" : "mensuel",
      personnesActives: Number(capaciteLigne?.personnes_actives ?? 0),
      modules: MODULES_COMMERCIAUX
        .filter((module) => module.codesTechniques.some((code) => codesActifs.has(code)))
        .map((module) => module.cle),
      abonnementStripe: Boolean(selectionnee.stripe_subscription_id),
      remiseActuelle: selectionnee.remise_description
        ? {
          description: selectionnee.remise_description,
          type: selectionnee.remise_type,
          valeur: selectionnee.remise_valeur,
          dureeMois: selectionnee.remise_duree_mois,
          appliqueeLe: selectionnee.remise_appliquee_at,
        }
        : null,
    };
    historique = (journal ?? []) as typeof historique;
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/plateforme" className="text-sm text-neutral-500 hover:underline">← Espace plateforme</Link>
        <h1 className="mt-2 text-2xl font-bold">Remises commerciales</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Le tarif public n&apos;est jamais modifié pour un client : un avantage individuel est toujours une remise,
          tracée, datée et révocable.
        </p>
      </header>

      {succes && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">{succes}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      <section className={carte}>
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="text-neutral-500">Rechercher une entreprise</span>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Nom ou code d'adhésion"
              className="mt-1 block w-64 rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Rechercher</button>
        </form>
        <ul className="mt-3 divide-y text-sm dark:divide-neutral-800">
          {entreprises.slice(0, 25).map((ligne) => (
            <li key={ligne.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="font-medium">{ligne.nom}</p>
                <p className="text-xs text-neutral-500">
                  {ligne.abonnement_offre ?? "sans offre"} · {ligne.abonnement_periodicite ?? "—"}
                  {ligne.remise_description && ` · remise en cours : ${ligne.remise_description}`}
                </p>
              </div>
              <Link
                href={`/plateforme/remises?entreprise=${ligne.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
              >
                Ouvrir le dossier
              </Link>
            </li>
          ))}
          {entreprises.length === 0 && (
            <li className="py-2 text-neutral-500">
              {erreurListe
                // En mode prototype (connexion e-mail désactivée), la RPC réservée à la
                // plateforme n'est pas disponible : le dire, plutôt que de laisser croire
                // qu'il n'y a aucune entreprise.
                ? "Liste des entreprises indisponible : cet écran a besoin d'un compte plateforme authentifié."
                : "Aucune entreprise ne correspond."}
            </li>
          )}
        </ul>
      </section>

      {dossier && (
        <>
          <ConsoleRemises
            dossier={dossier}
            nombreAdminsPlateforme={nombreAdminsPlateforme}
            appliquerRemise={appliquerRemiseAction.bind(null, dossier.entrepriseId)}
            retirerRemise={retirerRemiseAction.bind(null, dossier.entrepriseId)}
            intentionId={randomUUID()}
            aujourdhui={aujourdhui}
          />
          <section className={carte}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Historique</h2>
            <ul className="mt-3 divide-y text-sm dark:divide-neutral-800">
              {historique.map((entree) => (
                <li key={entree.id} className="py-2">
                  <span className="font-medium">{entree.action}</span>
                  <span className="ml-2 text-neutral-500">{new Date(entree.created_at).toLocaleString("fr-FR")}</span>
                </li>
              ))}
              {historique.length === 0 && <li className="py-2 text-neutral-500">Aucun mouvement enregistré.</li>}
            </ul>
            <p className="mt-3 text-xs text-neutral-500">
              L&apos;historique est en lecture seule : aucune modification directe du prix en base n&apos;est possible
              depuis cet écran, et une remise ne modifie jamais une facture déjà émise.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
