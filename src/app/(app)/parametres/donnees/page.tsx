import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { demanderSuppressionAction, annulerSuppressionAction } from "@/app/actions/rgpd";

export default async function DonneesRgpdPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const [{ error, message }, ctx] = await Promise.all([searchParams, getContexteEntreprise()]);
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_parametres");

  const { data: entreprise } = await supabase
    .from("entreprises")
    .select("nom, suppression_demandee_at, suppression_prevue_at")
    .eq("id", ctx.entrepriseId)
    .single();

  const suppressionEnCours = Boolean(entreprise?.suppression_demandee_at);
  const datePrevue = entreprise?.suppression_prevue_at
    ? new Date(entreprise.suppression_prevue_at).toLocaleDateString("fr-FR")
    : null;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Mes données</h1>
          <p className="text-sm text-neutral-500">
            Exercer vos droits sur vos données personnelles (RGPD). Voir aussi notre{" "}
            <Link href="/confidentialite" className="underline">politique de confidentialité</Link>.
          </p>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

        {!peutGerer && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Seul un administrateur de l&apos;entreprise peut exporter ou supprimer les données.
          </p>
        )}

        {/* ── Export ───────────────────────────────────────── */}
        <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Exporter mes données</h2>
          <p className="text-xs text-neutral-500">
            Télécharge l&apos;intégralité des données de votre entreprise (clients, chantiers, devis,
            factures, salariés, stock, pointages…) dans un fichier structuré, lisible et réutilisable.
            Vous pouvez le faire à tout moment, sans condition.
          </p>
          {peutGerer && (
            <a
              href="/api/rgpd/export"
              className="inline-block rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              Télécharger mes données (JSON)
            </a>
          )}
        </section>

        {/* ── Effacement d'une personne ────────────────────── */}
        <section className="space-y-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Effacer les données d&apos;un salarié</h2>
          <p className="text-xs text-neutral-500">
            Pour anonymiser un salarié (à sa demande, ou après son départ), ouvrez sa fiche depuis{" "}
            <Link href="/employes" className="underline">Employés</Link> et utilisez « Anonymiser ».
            Son identité et ses coordonnées sont effacées ; les éléments que la loi impose de
            conserver (heures travaillées, paie, comptabilité) sont préservés.
          </p>
        </section>

        {/* ── Suppression du compte ────────────────────────── */}
        <section className="space-y-3 rounded-md border border-red-200 p-4 dark:border-red-900/50">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Supprimer mon compte et mes données</h2>

          {suppressionEnCours ? (
            <>
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Une suppression est programmée{datePrevue ? ` pour le ${datePrevue}` : ""}. D&apos;ici là,
                votre compte reste utilisable et vous pouvez encore exporter vos données.
              </p>
              {peutGerer && (
                <form action={annulerSuppressionAction}>
                  <button className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900">
                    Annuler la demande de suppression
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-neutral-500">
                Cette demande déclenche un délai de <strong>30 jours</strong> pendant lequel vous pouvez
                récupérer vos données ou annuler. Passé ce délai, vos données sont supprimées.
                <br />
                <strong>À savoir :</strong> les factures et pièces comptables sont conservées le temps
                imposé par la loi (environ 10 ans), sous forme anonymisée lorsque c&apos;est possible.
                Pensez à <strong>exporter vos données avant</strong>.
              </p>
              {peutGerer && (
                <form action={demanderSuppressionAction} className="space-y-2">
                  <input type="hidden" name="nom_entreprise" value={entreprise?.nom ?? ""} />
                  <label className="block text-xs text-neutral-500">
                    Pour confirmer, saisissez le nom de l&apos;entreprise : <strong>{entreprise?.nom}</strong>
                    <input
                      name="confirmation"
                      required
                      autoComplete="off"
                      className="mt-1 w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  <button className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">
                    Demander la suppression
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
