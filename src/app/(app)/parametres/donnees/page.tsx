import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { demanderSuppressionAction, annulerSuppressionAction, confirmerPurgeAction, leverLegalHoldAction } from "@/app/actions/rgpd";

const LIBELLES_STATUT: Record<string, string> = {
  actif: "Aucune suppression en cours",
  requested: "Suppression demandée",
  review: "Délai écoulé : confirmation définitive possible",
  retention: "Données opérationnelles supprimées, conservation légale en cours",
  purge_ready: "Conservation légale terminée, purge finale imminente",
  purging: "Purge finale en cours",
  completed: "Compte définitivement purgé",
  blocked: "Suppression bloquée",
};

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
    .select("nom, suppression_demandee_at, suppression_prevue_at, suppression_statut, suppression_blocage_motif")
    .eq("id", ctx.entrepriseId)
    .single();

  const statut = entreprise?.suppression_statut ?? "actif";
  const suppressionEnCours = Boolean(entreprise?.suppression_demandee_at) && statut !== "actif";
  const datePrevue = entreprise?.suppression_prevue_at
    ? new Date(entreprise.suppression_prevue_at).toLocaleDateString("fr-FR")
    : null;

  const [{ data: echeances }, { data: holdsActifs }] = statut === "actif" || statut === "requested"
    ? [{ data: null }, { data: null }]
    : await Promise.all([
        supabase
          .from("retention_entreprise_echeances")
          .select("politique_cle, echeance_le")
          .eq("entreprise_id", ctx.entrepriseId),
        supabase
          .from("legal_holds_entreprise")
          .select("id, politique_cle, motif, pose_at")
          .eq("entreprise_id", ctx.entrepriseId)
          .eq("actif", true),
      ]);

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
          <h2 className="text-sm font-semibold">Exporter les données de l&apos;entreprise</h2>
          <p className="text-xs text-neutral-500">
            Télécharge l&apos;intégralité des données de votre entreprise (clients, chantiers, devis,
            factures, salariés, stock, pointages…) ainsi que les documents, photos, signatures et
            justificatifs du Storage, dans une archive ZIP avec manifeste et empreintes de contrôle.
            Vous pouvez le faire à tout moment, sans condition.
          </p>
          {peutGerer && (
            <a
              href="/api/rgpd/export"
              className="inline-block rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              Télécharger les données de l&apos;entreprise (ZIP)
            </a>
          )}
        </section>

        {/* ── Export personnel ────────────────────────────── */}
        <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Exporter mes données personnelles</h2>
          <p className="text-xs text-neutral-500">
            Télécharge uniquement vos données personnelles (profil, fiche salarié le cas échéant,
            pointages, notes de frais, paie qui vous concernent) — jamais celles de vos collègues.
          </p>
          <a
            href="/api/rgpd/export-personnel"
            className="inline-block rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            Télécharger mes données personnelles (JSON)
          </a>
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
          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Statut actuel : {LIBELLES_STATUT[statut] ?? statut}
          </p>

          {statut === "blocked" && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
              La suppression est bloquée{entreprise?.suppression_blocage_motif ? ` : ${entreprise.suppression_blocage_motif}` : ""}.
              Contactez le support pour la débloquer.
            </p>
          )}

          {(statut === "retention" || statut === "purge_ready" || statut === "purging") && (
            <div className="space-y-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p>
                Les données opérationnelles ont été supprimées. Les données comptables, sociales et
                d&apos;audit restent conservées le temps imposé par la loi, puis sont anonymisées et la
                purge est clôturée.
              </p>
              {echeances && echeances.length > 0 && (
                <ul className="list-disc pl-4 text-xs">
                  {echeances.map((e) => (
                    <li key={e.politique_cle}>
                      {e.politique_cle} :{" "}
                      {e.echeance_le
                        ? `conservé jusqu'au ${new Date(e.echeance_le).toLocaleDateString("fr-FR")}`
                        : "durée en attente de validation par la plateforme"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {holdsActifs && holdsActifs.length > 0 && (
            <div className="space-y-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
              <p className="font-medium">Réserve(s) légale(s) active(s) — la purge est bloquée :</p>
              <ul className="space-y-1 text-xs">
                {holdsActifs.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2">
                    <span>{h.politique_cle ?? "toutes données"} — {h.motif}</span>
                    {peutGerer && (
                      <form action={leverLegalHoldAction}>
                        <input type="hidden" name="hold_id" value={h.id} />
                        <button className="underline">Lever</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {statut === "completed" ? (
            <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              Ce compte a été définitivement purgé.
            </p>
          ) : statut === "review" ? (
            <>
              <p className="text-xs text-neutral-500">
                Le délai de 30 jours est écoulé. Cette confirmation est <strong>irréversible</strong> :
                les données opérationnelles seront supprimées immédiatement ; les données comptables et
                sociales entreront en conservation légale avant purge finale.
              </p>
              {peutGerer && (
                <form action={confirmerPurgeAction} className="space-y-2">
                  <input type="hidden" name="nom_entreprise" value={entreprise?.nom ?? ""} />
                  <label className="block text-xs text-neutral-500">
                    Pour confirmer définitivement, saisissez le nom de l&apos;entreprise : <strong>{entreprise?.nom}</strong>
                    <input
                      name="confirmation"
                      required
                      autoComplete="off"
                      className="mt-1 w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  <button className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">
                    Confirmer la purge définitive
                  </button>
                </form>
              )}
            </>
          ) : suppressionEnCours ? (
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
                récupérer vos données ou annuler. Passé ce délai, une confirmation définitive vous sera
                demandée.
                <br />
                <strong>À savoir :</strong> les factures et pièces comptables sont conservées le temps
                imposé par la loi, sous forme anonymisée lorsque c&apos;est possible.
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
