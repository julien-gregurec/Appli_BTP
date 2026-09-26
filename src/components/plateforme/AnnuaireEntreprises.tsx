import { Lien as Link } from "@/components/Lien";
import { RechercheAnnuaire } from "@/components/plateforme/RechercheAnnuaire";
import { ROLES_PLATEFORME_LIBELLES, type HabilitationsAnnuaire } from "@/lib/plateforme-annuaire-habilitations";
import type { ResultatAnnuaire } from "@/lib/plateforme-annuaire-serveur";
import {
  COLONNES_ANNUAIRE,
  DENSITES,
  FILTRES_NON_DISPONIBLES,
  FILTRES_VIDES,
  ONGLETS_ANNUAIRE,
  TAILLES_PAGE,
  TRIS_ANNUAIRE,
  TRANCHES_RETARD,
  composerCout,
  filtresActifs,
  lienAnnuaire,
  lienAnnuaireDepuisPremierePage,
  ongletParCle,
  serialiserRequeteAnnuaire,
  situationPaiement,
  type CleColonneAnnuaire,
  type LigneAnnuaire,
  type RequeteAnnuaire,
} from "@/lib/plateforme-annuaire";
import {
  MENTION_NON_DISPONIBLE,
  MENTION_VIDE,
  dateCourte,
  delaiRelatif,
  montantCompact,
  montantHT,
  texteOuVide,
} from "@/lib/plateforme-annuaire-format";
import { OFFRES_TARIFAIRES, offreTarifaireParCle } from "@/lib/tarification";
import { enregistrerVueAnnuaireAction, oublierVueAnnuaireAction } from "@/app/actions/plateforme-annuaire";
import { statutAbonnement } from "@/lib/plateforme";

const champ =
  "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

/** Teintes de la situation de paiement. La couleur double toujours un mot. */
const TEINTES_PAIEMENT: Record<string, string> = {
  a_jour: "text-green-700 dark:text-green-400",
  en_attente: "text-amber-700 dark:text-amber-400",
  retard: "text-orange-700 dark:text-orange-400",
  impaye: "text-red-700 dark:text-red-400",
  inconnu: "text-neutral-500",
  sans_objet: "text-neutral-500",
};

/**
 * Présentation de l'annuaire des entreprises clientes.
 *
 * Ce composant ne lit rien : il reçoit une requête déjà analysée, un résultat
 * déjà chargé et les habilitations de la session. Cette séparation permet de
 * rendre exactement le même écran, sans base ni session, pour la recette
 * visuelle et les captures — sans jamais contourner une garde d'accès pour
 * obtenir une image.
 */
export function AnnuaireEntreprises(props: {
  requete: RequeteAnnuaire;
  resultat: ResultatAnnuaire;
  habilitations: HabilitationsAnnuaire;
  /** Requête courante sérialisée, pour « Enregistrer cette vue » et l'export. */
  chaineVue: string;
  vueEnregistree: string;
  maintenant: Date;
}) {
  const maintenant = props.maintenant;
  const { requete, resultat, habilitations, chaineVue, vueEnregistree } = props;

  // Paramètres transmis à la barre de recherche : tout sauf le terme lui-même
  // et la page, puisqu'une nouvelle recherche repart toujours de la page 1.
  const parametresRecherche = (() => {
    const sp = serialiserRequeteAnnuaire(requete, { page: 1, q: "" });
    sp.delete("q");
    sp.delete("page");
    return sp.toString();
  })();

  const colonnes = COLONNES_ANNUAIRE.filter((c) => requete.colonnes.includes(c.cle))
    // Un rôle sans habilitation de facturation ne voit pas les colonnes d'argent.
    .filter((c) => habilitations.peutVoirFacturation || c.groupe !== "Facturation");
  const actifs = filtresActifs(requete.filtres);
  const compacte = requete.densite === "compacte";
  const cellule = compacte ? "px-3 py-1.5" : "px-4 py-3";

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <EnTete habilitations={habilitations} chaineVue={chaineVue} />

        {resultat.erreur && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {resultat.erreur}
          </p>
        )}

        {resultat.avertissements.map((avertissement) => (
          <p
            key={avertissement}
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <strong>Mode dégradé.</strong> {avertissement}
          </p>
        ))}

        {!resultat.facturationLisible && (
          <p className="rounded-md border border-neutral-300 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900">
            <strong>État de facturation indisponible.</strong> Les situations de paiement sont affichées
            « Paiement inconnu ». Une indisponibilité de facturation n&apos;est pas une absence d&apos;impayé :
            aucune décision de relance ou de suspension ne doit être prise sur cet écran tant qu&apos;elle dure.
          </p>
        )}

        <RechercheAnnuaire
          valeurInitiale={requete.q}
          champs={
            resultat.mode === "index_serveur"
              ? "Nom commercial, raison sociale, SIRET, e-mail, téléphone, contact, ville, code postal, référence client, code d'adhésion."
              : "Mode dégradé : la recherche ne couvre que le nom commercial, la référence client et le code d'adhésion."
          }
          placeholder="Rechercher une entreprise…"
          base="/plateforme/entreprises"
          parametres={parametresRecherche}
        />

        <Onglets requete={requete} compteurs={resultat.compteursOnglets} />

        <Resume resultat={resultat} requete={requete} peutVoirFacturation={habilitations.peutVoirFacturation} />

        <Filtres requete={requete} actifs={actifs} chaineVue={chaineVue} vueEnregistree={vueEnregistree} />

        <BarreAffichage requete={requete} resultat={resultat} />

        {resultat.lignes.length === 0 ? (
          <EtatVide requete={requete} total={resultat.total} erreur={resultat.erreur} />
        ) : (
          <>
            {/* Ordinateur : tableau dense, en-tête collant, tri par colonne. */}
            <div className="hidden overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800 lg:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Entreprises clientes — {resultat.total} résultat(s), page {resultat.page} sur {resultat.pages}
                </caption>
                <thead className="sticky top-0 z-10 bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    {colonnes.map((colonne) => (
                      <th key={colonne.cle} scope="col" className={`${cellule} font-medium ${colonne.numerique ? "text-right" : ""}`}>
                        <EnTeteTriable colonne={colonne.cle} libelle={colonne.libelle} requete={requete} />
                      </th>
                    ))}
                    <th scope="col" className={`${cellule} text-right font-medium`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resultat.lignes.map((ligne) => (
                    <tr
                      key={ligne.id}
                      className="border-t border-neutral-100 hover:bg-neutral-50 focus-within:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900 dark:focus-within:bg-neutral-900"
                    >
                      {colonnes.map((colonne) => (
                        <td key={colonne.cle} className={`${cellule} ${colonne.numerique ? "text-right tabular-nums" : ""}`}>
                          <Cellule colonne={colonne.cle} ligne={ligne} maintenant={maintenant} />
                        </td>
                      ))}
                      <td className={`${cellule} text-right`}>
                        <ActionsLigne ligne={ligne} habilitations={habilitations} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Téléphone et tablette : lignes compactes, jamais un tableau écrasé. */}
            <ul className="space-y-2 lg:hidden">
              {resultat.lignes.map((ligne) => {
                const paiement = situationPaiement(ligne, maintenant);
                const cout = composerCout(ligne);
                return (
                  <li key={ligne.id} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/plateforme/entreprises/${ligne.id}`} className="block truncate font-semibold hover:underline">
                          {ligne.nom}
                        </Link>
                        <p className="truncate text-xs text-neutral-500">
                          {texteOuVide(ligne.raison_sociale)} · {statutAbonnement(ligne.abonnement_statut).libelle}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-medium ${TEINTES_PAIEMENT[paiement.cle]}`}>
                        <span aria-hidden="true">{paiement.icone} </span>
                        {paiement.libelle}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-neutral-500">Forfait</dt>
                        <dd>{ligne.abonnement_offre ? offreTarifaireParCle(ligne.abonnement_offre).nom : MENTION_VIDE}</dd>
                      </div>
                      {habilitations.peutVoirFacturation && (
                        <div>
                          <dt className="text-neutral-500">Prix souscrit HT</dt>
                          <dd className="tabular-nums">{montantHT(cout.totalRecurrentHT)}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-neutral-500">Prochaine échéance</dt>
                        <dd>{dateCourte(ligne.abonnement_echeance)}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-500">Comptes actifs</dt>
                        <dd className="tabular-nums">{ligne.nb_comptes_actifs}</dd>
                      </div>
                    </dl>
                    <Link
                      href={`/plateforme/entreprises/${ligne.id}`}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-neutral-700"
                    >
                      Ouvrir la fiche
                    </Link>
                  </li>
                );
              })}
            </ul>

            <Pagination requete={requete} resultat={resultat} />
          </>
        )}

        <DefinitionsOnglets requete={requete} />
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EnTete({
  habilitations,
  chaineVue,
}: {
  habilitations: HabilitationsAnnuaire;
  chaineVue: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">Entreprises clientes</h1>
        <p className="text-sm text-neutral-500">
          Annuaire d&apos;administration de la plateforme.
          {habilitations.role && (
            <> Session : <strong>{ROLES_PLATEFORME_LIBELLES[habilitations.role]}</strong>
              {habilitations.sessionForte ? " · authentification forte" : " · authentification simple"}.
            </>
          )}
          {!habilitations.peutVoirFacturation && " Les montants et états de paiement sont masqués pour ce rôle."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/plateforme" className="rounded-md border px-3 py-2 text-sm font-medium">
          Tableau de bord plateforme
        </Link>
        {habilitations.peutExporter && (
          <Link
            href={`/plateforme/entreprises/export${chaineVue ? `?${chaineVue}` : ""}`}
            prefetch={false}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-neutral-700"
          >
            Exporter (CSV)
          </Link>
        )}
      </div>
    </div>
  );
}

function Resume({
  resultat,
  requete,
  peutVoirFacturation,
}: {
  resultat: ResultatAnnuaire;
  requete: RequeteAnnuaire;
  peutVoirFacturation: boolean;
}) {
  if (!resultat.resume) {
    return (
      <p className="rounded-md border border-dashed border-neutral-300 p-3 text-sm text-neutral-500 dark:border-neutral-700">
        Indicateurs de synthèse non disponibles : ils exigent une lecture complète du parc, que le mode courant
        ne fournit pas.
      </p>
    );
  }
  const indicateurs = resultat.resume.filter((i) => peutVoirFacturation || (i.cle !== "mrr" && i.cle !== "impayes"));

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
      {indicateurs.map((indicateur) => {
        const contenu = (
          <>
            <div className="text-xs uppercase text-neutral-500">{indicateur.libelle}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {indicateur.valeur === null
                ? <span className="text-base font-medium text-neutral-500">{MENTION_NON_DISPONIBLE}</span>
                : indicateur.cle === "mrr"
                  ? montantCompact(indicateur.valeur)
                  : indicateur.valeur.toLocaleString("fr-FR")}
            </div>
            {indicateur.note && <div className="mt-0.5 text-[11px] text-neutral-500">{indicateur.note}</div>}
          </>
        );
        const classe = "rounded-md border border-neutral-200 p-3 text-left dark:border-neutral-800";
        return indicateur.onglet ? (
          <Link
            key={indicateur.cle}
            href={lienAnnuaireDepuisPremierePage(requete, { onglet: indicateur.onglet })}
            className={`${classe} hover:border-neutral-400 dark:hover:border-neutral-600`}
          >
            {contenu}
          </Link>
        ) : (
          <div key={indicateur.cle} className={classe}>
            {contenu}
          </div>
        );
      })}
    </div>
  );
}

function Onglets({
  requete,
  compteurs,
}: {
  requete: RequeteAnnuaire;
  compteurs: Record<string, number | null>;
}) {
  return (
    <nav aria-label="Onglets de suivi" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {ONGLETS_ANNUAIRE.map((onglet) => {
          const actif = onglet.cle === requete.onglet;
          const indisponible = onglet.couverture === "absente";
          const compteur = compteurs[onglet.cle];
          const etiquette = (
            <>
              {onglet.libelle}
              <span className="ml-1.5 tabular-nums text-xs text-neutral-500">
                {indisponible ? "—" : compteur === null ? "?" : compteur}
              </span>
            </>
          );
          const classe = `inline-block whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
            actif
              ? "border-neutral-900 font-semibold dark:border-white"
              : "border-transparent text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          }`;
          return (
            <li key={onglet.cle}>
              {indisponible ? (
                <span
                  className={`${classe} cursor-not-allowed opacity-50`}
                  aria-disabled="true"
                  title={onglet.reserve}
                >
                  {etiquette}
                </span>
              ) : (
                <Link
                  href={lienAnnuaireDepuisPremierePage(requete, { onglet: onglet.cle })}
                  aria-current={actif ? "page" : undefined}
                  className={classe}
                  title={onglet.definition}
                >
                  {etiquette}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Filtres({
  requete,
  actifs,
  chaineVue,
  vueEnregistree,
}: {
  requete: RequeteAnnuaire;
  actifs: { cle: string; valeur: string }[];
  chaineVue: string;
  vueEnregistree: string;
}) {
  const f = requete.filtres;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <details className="group">
          <summary className="cursor-pointer rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700">
            Filtres {actifs.length > 0 && <span className="ml-1 rounded-full bg-neutral-900 px-1.5 text-xs text-white dark:bg-white dark:text-neutral-900">{actifs.length}</span>}
          </summary>
          {/* Un formulaire GET : les filtres finissent dans l'URL, donc partageables. */}
          <form method="get" className="mt-2 grid gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800 sm:grid-cols-3 lg:grid-cols-4">
            {/* La recherche et l'affichage courants survivent à l'application d'un filtre. */}
            <input type="hidden" name="q" value={requete.q} />
            <input type="hidden" name="onglet" value={requete.onglet} />
            <input type="hidden" name="tri" value={requete.tri} />
            <input type="hidden" name="sens" value={requete.sens} />
            <input type="hidden" name="taille" value={requete.taille} />
            <input type="hidden" name="densite" value={requete.densite} />
            <input type="hidden" name="colonnes" value={requete.colonnes.join(",")} />

            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Forfait</span>
              <select name="forfait" defaultValue={f.forfait} className={`${champ} w-full`}>
                <option value="">Tous</option>
                {OFFRES_TARIFAIRES.map((offre) => (
                  <option key={offre.cle} value={offre.cle}>{offre.nom}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Module (code)</span>
              <input name="module" defaultValue={f.module} placeholder="ex. pointage" className={`${champ} w-full`} />
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Application (code)</span>
              <input name="application" defaultValue={f.application} placeholder="ex. gestion_pro" className={`${champ} w-full`} />
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Périodicité</span>
              <select name="periodicite" defaultValue={f.periodicite} className={`${champ} w-full`}>
                <option value="">Toutes</option>
                <option value="mensuel">Mensuelle</option>
                <option value="annuel">Annuelle</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Statut d&apos;abonnement</span>
              <select name="statut" defaultValue={f.statutAbonnement} className={`${champ} w-full`}>
                <option value="">Tous</option>
                <option value="essai">Essai</option>
                <option value="actif">Actif</option>
                <option value="impaye">Impayé</option>
                <option value="suspendu">Suspendu</option>
                <option value="annule">Annulé</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Statut de paiement</span>
              <select name="paiement" defaultValue={f.statutPaiement} className={`${champ} w-full`}>
                <option value="">Tous</option>
                <option value="a_jour">À jour</option>
                <option value="en_attente">En attente</option>
                <option value="retard">En retard</option>
                <option value="impaye">Impayé</option>
                <option value="inconnu">Paiement inconnu</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Ancienneté du retard</span>
              <select name="retard" defaultValue={f.trancheRetard} className={`${champ} w-full`}>
                <option value="">Toutes</option>
                {TRANCHES_RETARD.map((tranche) => (
                  <option key={tranche.cle} value={tranche.cle}>{tranche.libelle}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Remise</span>
              <select name="remise" defaultValue={f.remise} className={`${champ} w-full`}>
                <option value="">Indifférent</option>
                <option value="oui">Remise active</option>
                <option value="non">Sans remise</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Inscription — du</span>
              <input type="date" name="inscrit_du" defaultValue={f.inscritDu} className={`${champ} w-full`} />
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Inscription — au</span>
              <input type="date" name="inscrit_au" defaultValue={f.inscritAu} className={`${champ} w-full`} />
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Échéance — du</span>
              <input type="date" name="echeance_du" defaultValue={f.echeanceDu} className={`${champ} w-full`} />
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Échéance — au</span>
              <input type="date" name="echeance_au" defaultValue={f.echeanceAu} className={`${champ} w-full`} />
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Ville</span>
              <input name="ville" defaultValue={f.ville} className={`${champ} w-full`} />
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Comptes actifs — min.</span>
              <input type="number" min="0" name="comptes_min" defaultValue={f.comptesMin ?? ""} className={`${champ} w-full`} />
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Comptes actifs — max.</span>
              <input type="number" min="0" name="comptes_max" defaultValue={f.comptesMax ?? ""} className={`${champ} w-full`} />
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Salariés — min.</span>
              <input type="number" min="0" name="salaries_min" defaultValue={f.salariesMin ?? ""} className={`${champ} w-full`} />
            </label>
            <label className="space-y-1 text-xs text-neutral-500">
              <span className="block">Option IA</span>
              <select name="ia" defaultValue={f.ia} className={`${champ} w-full`}>
                <option value="">Indifférent</option>
                <option value="oui">Activée</option>
                <option value="non">Non activée</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end text-xs text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" name="remise_expire" value="1" defaultChecked={f.remiseExpire} />
              Remise expirant sous 60 jours
            </label>
            <label className="flex items-center gap-2 self-end text-xs text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" name="essai" value="1" defaultChecked={f.essai} />
              En période d&apos;essai
            </label>

            <div className="sm:col-span-3 lg:col-span-4">
              <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">
                Appliquer les filtres
              </button>
              <p className="mt-2 text-[11px] text-neutral-500">
                Filtres demandés mais sans donnée source, donc absents de ce panneau :{" "}
                {FILTRES_NON_DISPONIBLES.map((filtre) => `${String(filtre.cle)} (${filtre.raison})`).join(" ")}
              </p>
            </div>
          </form>
        </details>

        {actifs.length > 0 && (
          <Link href={lienAnnuaireDepuisPremierePage(requete, { filtres: FILTRES_VIDES })} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
            Effacer les filtres
          </Link>
        )}

        <form action={enregistrerVueAnnuaireAction} className="inline">
          <input type="hidden" name="vue" value={chaineVue} />
          <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
            Enregistrer cette vue
          </button>
        </form>
        {vueEnregistree && (
          <form action={oublierVueAnnuaireAction} className="inline">
            <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              Oublier la vue enregistrée
            </button>
          </form>
        )}
      </div>

      {actifs.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Filtres actifs">
          {actifs.map((filtre) => (
            <li key={filtre.cle} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-800">
              {filtre.cle} : <strong>{filtre.valeur}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BarreAffichage({
  requete,
  resultat,
}: {
  requete: RequeteAnnuaire;
  resultat: ResultatAnnuaire;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-neutral-500">
        {resultat.total.toLocaleString("fr-FR")} entreprise(s)
        {resultat.pages > 1 && ` — page ${resultat.page} sur ${resultat.pages}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <details className="relative">
          <summary className="cursor-pointer rounded-md border border-neutral-300 px-3 py-1.5 dark:border-neutral-700">
            Colonnes ({requete.colonnes.length})
          </summary>
          <form method="get" className="absolute right-0 z-20 mt-2 w-72 space-y-2 rounded-md border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-950">
            <input type="hidden" name="q" value={requete.q} />
            <input type="hidden" name="onglet" value={requete.onglet} />
            <input type="hidden" name="tri" value={requete.tri} />
            <input type="hidden" name="sens" value={requete.sens} />
            <input type="hidden" name="taille" value={requete.taille} />
            <input type="hidden" name="densite" value={requete.densite} />
            {Array.from(serialiserRequeteAnnuaire(requete)).map(([cle, valeur]) =>
              ["q", "onglet", "tri", "sens", "taille", "densite", "colonnes", "page"].includes(cle) ? null : (
                <input key={cle} type="hidden" name={cle} value={valeur} />
              ),
            )}
            <fieldset className="max-h-72 space-y-1 overflow-y-auto">
              <legend className="sr-only">Colonnes affichées</legend>
              {COLONNES_ANNUAIRE.map((colonne) => (
                <label key={colonne.cle} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="colonnes"
                    value={colonne.cle}
                    defaultChecked={requete.colonnes.includes(colonne.cle)}
                    disabled={colonne.cle === "nom"}
                  />
                  <span>{colonne.libelle}</span>
                  <span className="ml-auto text-neutral-400">{colonne.groupe}</span>
                </label>
              ))}
            </fieldset>
            <button className="w-full rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900">
              Appliquer
            </button>
          </form>
        </details>

        <div className="flex items-center gap-1 rounded-md border border-neutral-300 p-0.5 dark:border-neutral-700">
          {DENSITES.map((densite) => (
            <Link
              key={densite}
              href={lienAnnuaire(requete, { densite })}
              aria-current={requete.densite === densite ? "true" : undefined}
              className={`rounded px-2 py-1 text-xs ${requete.densite === densite ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}
            >
              {densite === "compacte" ? "Compacte" : "Confortable"}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-500">Lignes</span>
          {TAILLES_PAGE.map((taille) => (
            <Link
              key={taille}
              href={lienAnnuaireDepuisPremierePage(requete, { taille })}
              aria-current={requete.taille === taille ? "true" : undefined}
              className={`rounded px-2 py-1 text-xs ${requete.taille === taille ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}
            >
              {taille}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Colonnes triables : seules celles dont une clé de tri existe côté serveur. */
const TRI_PAR_COLONNE: Partial<Record<CleColonneAnnuaire, (typeof TRIS_ANNUAIRE)[number]["cle"]>> = {
  nom: "nom",
  date_inscription: "date_inscription",
  forfait: "forfait",
  prix_souscrit: "montant",
  prochaine_echeance: "prochaine_echeance",
  montant_impaye: "montant_impaye",
  derniere_activite: "derniere_activite",
  comptes_actifs: "comptes_actifs",
  remise: "fin_remise",
};

function EnTeteTriable({
  colonne,
  libelle,
  requete,
}: {
  colonne: CleColonneAnnuaire;
  libelle: string;
  requete: RequeteAnnuaire;
}) {
  const tri = TRI_PAR_COLONNE[colonne];
  if (!tri) return <>{libelle}</>;
  const actif = requete.tri === tri;
  const sens = actif && requete.sens === "asc" ? "desc" : "asc";
  return (
    <Link
      href={lienAnnuaireDepuisPremierePage(requete, { tri, sens })}
      aria-sort={actif ? (requete.sens === "asc" ? "ascending" : "descending") : "none"}
      className="inline-flex items-center gap-1 hover:underline"
    >
      {libelle}
      <span aria-hidden="true" className="text-[10px]">{actif ? (requete.sens === "asc" ? "▲" : "▼") : "↕"}</span>
    </Link>
  );
}

function Cellule({
  colonne,
  ligne,
  maintenant,
}: {
  colonne: CleColonneAnnuaire;
  ligne: LigneAnnuaire;
  maintenant: Date;
}) {
  switch (colonne) {
    case "nom":
      return (
        <Link href={`/plateforme/entreprises/${ligne.id}`} className="font-medium hover:underline">
          {ligne.nom}
        </Link>
      );
    case "raison_sociale":
      return <span className="text-neutral-600 dark:text-neutral-400">{texteOuVide(ligne.raison_sociale)}</span>;
    case "siret":
      return <span className="font-mono text-xs text-neutral-500">{texteOuVide(ligne.siret)}</span>;
    case "ville":
      return <span className="text-neutral-600 dark:text-neutral-400">{texteOuVide(ligne.ville)}</span>;
    case "reference":
      return <span className="font-mono text-xs text-neutral-500">{texteOuVide(ligne.reference_interne ?? ligne.code_adhesion)}</span>;
    case "proprietaire":
      return <span className="text-neutral-600 dark:text-neutral-400">{texteOuVide(ligne.proprietaire_nom)}</span>;
    case "email":
      return <span className="text-neutral-600 dark:text-neutral-400">{texteOuVide(ligne.proprietaire_email)}</span>;
    case "date_inscription":
      return <span className="text-neutral-600 dark:text-neutral-400">{dateCourte(ligne.created_at)}</span>;
    case "statut": {
      const statut = statutAbonnement(ligne.abonnement_statut);
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: statut.couleur }} />
          {statut.libelle}
        </span>
      );
    }
    case "forfait":
      return <span>{ligne.abonnement_offre ? offreTarifaireParCle(ligne.abonnement_offre).nom : MENTION_VIDE}</span>;
    case "periodicite":
      return <span>{ligne.abonnement_periodicite === "annuel" ? "Annuelle" : ligne.abonnement_periodicite === "mensuel" ? "Mensuelle" : MENTION_VIDE}</span>;
    case "modules":
      return <span className="tabular-nums">{ligne.modules_actifs.length}</span>;
    case "applications":
      return <span className="text-xs text-neutral-600 dark:text-neutral-400">{ligne.applications_actives.length > 0 ? ligne.applications_actives.join(", ") : MENTION_VIDE}</span>;
    case "comptes_actifs":
      return <span className="tabular-nums">{ligne.nb_comptes_actifs}</span>;
    case "comptes_inclus": {
      const inclus = ligne.abonnement_offre ? offreTarifaireParCle(ligne.abonnement_offre).comptesInclus : null;
      return <span className="tabular-nums">{inclus ?? MENTION_VIDE}</span>;
    }
    case "montant_public":
      return <span className="tabular-nums">{montantHT(composerCout(ligne).tarifPublicHT)}</span>;
    case "remise": {
      const cout = composerCout(ligne);
      if (!cout.remise) return <span className="text-neutral-400">{MENTION_VIDE}</span>;
      return (
        <span className="whitespace-nowrap text-xs">
          {cout.remise.type === "pourcentage" ? `-${cout.remise.valeur} %` : cout.remise.type === "montant" ? `-${montantHT(cout.remise.valeur)}` : "Remise"}
          {cout.remise.finPrevue ? ` · fin ${dateCourte(cout.remise.finPrevue)}` : cout.remise.permanente ? " · permanente" : ""}
        </span>
      );
    }
    case "prix_souscrit":
      return <span className="tabular-nums">{montantHT(composerCout(ligne).totalRecurrentHT)}</span>;
    case "prochaine_echeance":
      return (
        <span className="whitespace-nowrap">
          {dateCourte(ligne.abonnement_echeance)}
          {ligne.abonnement_echeance && (
            <span className="ml-1 text-xs text-neutral-500">({delaiRelatif(ligne.abonnement_echeance, maintenant)})</span>
          )}
        </span>
      );
    case "statut_paiement": {
      const paiement = situationPaiement(ligne, maintenant);
      return (
        <span className={`whitespace-nowrap text-xs font-medium ${TEINTES_PAIEMENT[paiement.cle]}`}>
          <span aria-hidden="true">{paiement.icone} </span>
          {paiement.libelle}
          {paiement.cle === "retard" && paiement.jours !== null && ` · ${paiement.jours} j`}
        </span>
      );
    }
    case "montant_impaye":
      return <span className="tabular-nums">{montantHT(ligne.montant_impaye_ht)}</span>;
    case "derniere_activite":
      return <span className="whitespace-nowrap text-neutral-600 dark:text-neutral-400">{dateCourte(ligne.derniere_activite)}</span>;
  }
}

function ActionsLigne({
  ligne,
  habilitations,
}: {
  ligne: LigneAnnuaire;
  habilitations: HabilitationsAnnuaire;
}) {
  const base = `/plateforme/entreprises/${ligne.id}`;
  return (
    <details className="relative inline-block text-left">
      <summary className="cursor-pointer list-none rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">
        <span className="sr-only">Actions pour {ligne.nom}</span>
        <span aria-hidden="true">Ouvrir ▾</span>
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-neutral-200 bg-white py-1 text-left shadow-lg dark:border-neutral-700 dark:bg-neutral-950">
        <Link href={base} className="block px-3 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900">
          Ouvrir la fiche
        </Link>
        {habilitations.peutVoirFacturation && (
          <>
            <Link href={`${base}?onglet=abonnement`} className="block px-3 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900">
              Abonnement et tarification
            </Link>
            <Link href={`${base}?onglet=facturation`} className="block px-3 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900">
              Factures et impayés
            </Link>
          </>
        )}
        {habilitations.peutOuvrirAssistance && (
          <Link href={`${base}?onglet=assistance`} className="block px-3 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900">
            Ouvrir une assistance
          </Link>
        )}
        <Link href={`${base}?onglet=communications`} className="block px-3 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900">
          Communications
        </Link>
        {/* Suppression, changement de prix et suspension ne sont volontairement
            pas offerts depuis la liste : ils exigent un aperçu et un motif (§14). */}
      </div>
    </details>
  );
}

function Pagination({
  requete,
  resultat,
}: {
  requete: RequeteAnnuaire;
  resultat: ResultatAnnuaire;
}) {
  if (resultat.pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
      {resultat.page > 1 ? (
        <Link href={lienAnnuaire(requete, { page: resultat.page - 1 })} className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">
          ← Page précédente
        </Link>
      ) : <span />}
      <span className="text-neutral-500">Page {resultat.page} sur {resultat.pages}</span>
      {resultat.page < resultat.pages ? (
        <Link href={lienAnnuaire(requete, { page: resultat.page + 1 })} className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">
          Page suivante →
        </Link>
      ) : <span />}
    </nav>
  );
}

function EtatVide({
  requete,
  total,
  erreur,
}: {
  requete: RequeteAnnuaire;
  total: number;
  erreur: string | null;
}) {
  if (erreur) return null;
  const aDesCriteres = requete.q.length > 0 || filtresActifs(requete.filtres).length > 0;
  return (
    <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
      {total === 0 && !aDesCriteres && requete.onglet === "toutes" ? (
        <p>Aucune entreprise cliente enregistrée.</p>
      ) : aDesCriteres ? (
        <>
          <p>Aucune entreprise ne correspond à cette recherche.</p>
          <Link href={lienAnnuaireDepuisPremierePage(requete, { q: "", filtres: FILTRES_VIDES })} className="mt-3 inline-block rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">
            Effacer la recherche et les filtres
          </Link>
        </>
      ) : (
        <p>Aucune entreprise dans l&apos;onglet « {ongletParCle(requete.onglet).libelle} ».</p>
      )}
    </div>
  );
}

function DefinitionsOnglets({ requete }: { requete: RequeteAnnuaire }) {
  const onglet = ongletParCle(requete.onglet);
  return (
    <details className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <summary className="cursor-pointer font-medium">Ce que montre cet onglet, et ce qu&apos;il ne montre pas</summary>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">{onglet.definition}</p>
      {onglet.reserve && (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Réserve :</strong> {onglet.reserve}
        </p>
      )}
      <ul className="mt-3 space-y-1 text-xs text-neutral-500">
        {ONGLETS_ANNUAIRE.filter((o) => o.cle !== onglet.cle).map((autre) => (
          <li key={autre.cle}>
            <strong>{autre.libelle} :</strong> {autre.definition}
          </li>
        ))}
      </ul>
    </details>
  );
}
