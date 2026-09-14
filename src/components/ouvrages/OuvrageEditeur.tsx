"use client";

import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NATURES_COMPOSANT, optionsParDefaut, validerVersion, type NatureComposant, type VersionOuvrage } from "@/lib/devis/ouvrages";
import { TAUX_TVA_ADMIS } from "@/lib/devis/prix";
import { euros } from "@/lib/devis";
import { changerStatutOuvrageAction, publierOuvrageAction } from "@/app/actions/devis-v2";
import {
  clesReservees,
  dependantsDirects,
  deplacer,
  formulaireVersVersion,
  lireNombre,
  nouveauComposant,
  optionsBase,
  optionsDeclarees,
  payloadPublication,
  simulerOuvrage,
  versionVersFormulaire,
  type ComposantFormulaire,
  type MetaVersion,
  type ModeArrondi,
  type OuvrageFormulaire,
  type TypeCondition,
} from "@/lib/ouvrages/editeur-ouvrage";

/**
 * Éditeur d'un ouvrage de la bibliothèque (moteur de devis v2).
 *
 * Le composant ne reçoit un prix d'achat que si la page l'y autorise (`peutVoirCouts`) ; par
 * prudence, il les écarte lui-même sinon. Toutes les règles de calcul et de validation viennent
 * de `src/lib/devis/ouvrages.ts` : la simulation est le calcul réel d'une insertion.
 */
export type OuvrageEditeurProps = {
  ouvrageId: string | null;
  versionInitiale: VersionOuvrage | null;
  peutGerer: boolean;
  peutVoirCouts: boolean;
  peutGererCouts: boolean;
  /** Seuil d'alerte de taux de marque de l'entreprise ; n'est utilisé qu'avec `peutVoirCouts`. */
  seuilTauxMarquePct?: number | null;
};

const champ =
  "min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm read-only:bg-neutral-50 disabled:bg-neutral-50 disabled:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:read-only:bg-neutral-800 dark:disabled:bg-neutral-800";
const bouton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";
const boutonPrincipal =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-white dark:text-neutral-900";
const section = "space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800";

const nombre = (x: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(x);
const pourcent = (x: number | null) => (x === null ? "incomplet" : `${nombre(x)} %`);
const eurosOuIncomplet = (x: number | null) => (x === null ? "incomplet" : euros(x));

function Champ({ libelle, aide, className = "", children }: { libelle: string; aide?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium">{libelle}</span>
      {children}
      {aide && <span className="text-xs text-neutral-500">{aide}</span>}
    </label>
  );
}

function Case({ libelle, checked, onChange }: { libelle: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" className="h-5 w-5 focus-visible:ring-2 focus-visible:ring-neutral-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {libelle}
    </label>
  );
}

export function OuvrageEditeur({ ouvrageId, versionInitiale, peutGerer, peutVoirCouts, peutGererCouts, seuilTauxMarquePct = null }: OuvrageEditeurProps) {
  const router = useRouter();
  const id = useId();
  const [enCours, demarrer] = useTransition();
  const [form, setForm] = useState<OuvrageFormulaire>(() => versionVersFormulaire(versionInitiale, { inclureCouts: peutVoirCouts }));
  const [nouveauxOuverts, setNouveauxOuverts] = useState<ReadonlySet<string>>(() => new Set());
  const [nouvelleDesignation, setNouvelleDesignation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const clesInitiales = useMemo(() => (versionInitiale?.composants ?? []).map((c) => c.cle), [versionInitiale]);
  const numeroSuivant = (versionInitiale?.version ?? 0) + 1;
  const statut = versionInitiale?.statut ?? "actif";
  const meta: MetaVersion = useMemo(() => ({
    ouvrageId: ouvrageId ?? "nouvel-ouvrage",
    entrepriseId: versionInitiale?.entrepriseId ?? "",
    version: versionInitiale?.version ?? 0,
    statut,
    auteur: versionInitiale?.auteur ?? null,
    creeLe: versionInitiale?.creeLe ?? "",
    modifieLe: versionInitiale?.modifieLe ?? "",
  }), [ouvrageId, versionInitiale, statut]);

  // ── Simulation ──
  const [simQuantite, setSimQuantite] = useState(() => form.quantitePrincipale || "1");
  const [simOptions, setSimOptions] = useState<ReadonlySet<string>>(() => new Set(versionInitiale ? optionsParDefaut(versionInitiale) : []));
  const [simSaisies, setSimSaisies] = useState<Record<string, string>>({});

  const versionEditee = useMemo(() => formulaireVersVersion(form, meta, { inclureCouts: peutVoirCouts }), [form, meta, peutVoirCouts]);
  const erreursPublication = useMemo(() => validerVersion(versionEditee), [versionEditee]);
  const optionsVersion = useMemo(() => optionsDeclarees(versionEditee), [versionEditee]);
  const resultat = useMemo(() => {
    const saisies: Record<string, number> = {};
    for (const [cle, valeur] of Object.entries(simSaisies)) {
      const n = lireNombre(valeur);
      if (n !== null && Number.isFinite(n)) saisies[cle] = n;
    }
    return simulerOuvrage(
      versionEditee,
      { quantitePrincipale: lireNombre(simQuantite) ?? Number.NaN, options: [...simOptions], saisies },
      { peutVoirCouts, seuilTauxMarquePct: peutVoirCouts ? seuilTauxMarquePct : null },
    );
  }, [versionEditee, simQuantite, simOptions, simSaisies, peutVoirCouts, seuilTauxMarquePct]);

  // ── Édition ──
  const majForm = (patch: Partial<OuvrageFormulaire>) => setForm((f) => ({ ...f, ...patch }));
  const majComposant = (cle: string, patch: Partial<ComposantFormulaire>) =>
    setForm((f) => ({ ...f, composants: f.composants.map((c) => (c.cle === cle ? { ...c, ...patch } : c)) }));

  const ajouter = () => {
    const designation = nouvelleDesignation.trim();
    if (!designation) return;
    const c = nouveauComposant(designation, clesReservees(form.composants, clesInitiales));
    setForm((f) => ({ ...f, composants: [...f.composants, c] }));
    setNouveauxOuverts((s) => new Set([...s, c.cle]));
    setNouvelleDesignation("");
    setErreur(null);
  };
  const retirer = (c: ComposantFormulaire) => {
    const dependants = dependantsDirects(form.composants, c.cle);
    if (dependants.length) {
      setErreur(`« ${dependants[0].designation || dependants[0].cle} » est calculé à partir de « ${c.designation || c.cle} » : changez d’abord sa base de calcul.`);
      return;
    }
    setErreur(null);
    setForm((f) => ({ ...f, composants: f.composants.filter((x) => x.cle !== c.cle) }));
  };
  const deplacerComposant = (index: number, delta: number) => setForm((f) => ({ ...f, composants: deplacer(f.composants, index, delta) }));

  // ── Actions serveur ──
  const publier = () => {
    setErreur(null);
    setMessage(null);
    const aPublier = formulaireVersVersion(form, meta, { inclureCouts: peutGererCouts });
    const erreurs = validerVersion(aPublier);
    if (erreurs.length) {
      setErreur(erreurs[0]);
      return;
    }
    demarrer(async () => {
      const r = await publierOuvrageAction(ouvrageId, payloadPublication(aPublier));
      if ("error" in r) {
        setErreur(r.error);
        return;
      }
      router.push(`/ouvrages/bibliotheque/${r.id}?publie=1`);
      router.refresh();
    });
  };
  const changerStatut = (cible: "actif" | "archive") => {
    if (!ouvrageId) return;
    setErreur(null);
    setMessage(null);
    demarrer(async () => {
      const r = await changerStatutOuvrageAction(ouvrageId, cible);
      if ("error" in r) {
        setErreur(r.error);
        return;
      }
      setMessage(cible === "archive" ? "Ouvrage archivé : il n’est plus proposé par défaut dans les devis." : "Ouvrage réactivé.");
      router.refresh();
    });
  };

  const idErreurs = `${id}-erreurs`;

  return (
    <div className="space-y-6">
      {!peutGerer && (
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
          Lecture seule : vous n’avez pas le droit de modifier les ouvrages.
        </p>
      )}
      {erreur && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
      {message && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

      <fieldset disabled={!peutGerer} className="min-w-0 space-y-6">
        <section className={section} aria-labelledby={`${id}-identite`}>
          <h2 id={`${id}-identite`} className="text-sm font-semibold">Identité de l’ouvrage</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Champ libelle="Référence interne">
              <input className={champ} maxLength={120} value={form.referenceInterne} onChange={(e) => majForm({ referenceInterne: e.target.value })} />
            </Champ>
            <Champ libelle="Nom *" className="lg:col-span-2">
              <input className={champ} required maxLength={200} value={form.nom} onChange={(e) => majForm({ nom: e.target.value })} />
            </Champ>
            <Champ libelle="Catégorie">
              <input className={champ} maxLength={120} value={form.categorie} onChange={(e) => majForm({ categorie: e.target.value })} />
            </Champ>
            <Champ libelle="Unité principale *" aide="m², ml, u…">
              <input className={champ} required maxLength={20} value={form.unitePrincipale} onChange={(e) => majForm({ unitePrincipale: e.target.value })} />
            </Champ>
            <Champ libelle="Quantité principale *" aide="Quantité pour laquelle les composants sont décrits.">
              <input className={champ} required inputMode="decimal" value={form.quantitePrincipale} onChange={(e) => majForm({ quantitePrincipale: e.target.value })} />
            </Champ>
            <Champ libelle="Description interne" aide="Jamais imprimée sur un devis." className="sm:col-span-2 lg:col-span-3">
              <textarea className={champ} rows={2} value={form.descriptionInterne} onChange={(e) => majForm({ descriptionInterne: e.target.value })} />
            </Champ>
            <Champ libelle="Description client" aide="Texte proposé sur le devis." className="sm:col-span-2 lg:col-span-3">
              <textarea className={champ} rows={3} value={form.descriptionClient} onChange={(e) => majForm({ descriptionClient: e.target.value })} />
            </Champ>
          </div>
        </section>

        <section className={section} aria-labelledby={`${id}-composants`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`${id}-composants`} className="text-sm font-semibold">Composants ({form.composants.length})</h2>
            <p className="text-xs text-neutral-500">Ordre de calcul : base × coefficient + quantité fixe (+ saisie) → perte → minimum → arrondi.</p>
          </div>
          {form.composants.length === 0 && <p className="text-sm text-neutral-500">Aucun composant pour l’instant.</p>}
          <ol className="space-y-3">
            {form.composants.map((c, index) => (
              <CarteComposant
                key={c.cle}
                c={c}
                index={index}
                total={form.composants.length}
                ouvert={nouveauxOuverts.has(c.cle)}
                bases={optionsBase(form.composants, c.cle)}
                peutGerer={peutGerer}
                peutVoirCouts={peutVoirCouts}
                peutGererCouts={peutGererCouts}
                maj={(patch) => majComposant(c.cle, patch)}
                monter={() => deplacerComposant(index, -1)}
                descendre={() => deplacerComposant(index, 1)}
                retirer={() => retirer(c)}
              />
            ))}
          </ol>
          {peutGerer && (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                ajouter();
              }}
            >
              <Champ libelle="Désignation du nouveau composant" aide="Elle fixe la clé du composant, qui ne changera plus." className="flex-1">
                <input className={champ} maxLength={200} value={nouvelleDesignation} onChange={(e) => setNouvelleDesignation(e.target.value)} />
              </Champ>
              <button type="submit" className={bouton} disabled={!nouvelleDesignation.trim()}>Ajouter le composant</button>
            </form>
          )}
        </section>
      </fieldset>

      <section className={section} aria-labelledby={`${id}-simulation`}>
        <h2 id={`${id}-simulation`} className="text-sm font-semibold">Simulation</h2>
        <p className="text-xs text-neutral-500">Calcul réel d’une insertion dans un devis, sans rien enregistrer.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Champ libelle={`Quantité principale de test${form.unitePrincipale.trim() ? ` (${form.unitePrincipale.trim()})` : ""}`}>
            <input className={champ} inputMode="decimal" value={simQuantite} onChange={(e) => setSimQuantite(e.target.value)} />
          </Champ>
          {versionEditee.composants.filter((c) => c.saisieRequise).map((c) => (
            <Champ key={c.cle} libelle={`Saisie pour « ${c.designation || c.cle} » (${c.unite || "?"})`}>
              <input
                className={champ}
                inputMode="decimal"
                value={simSaisies[c.cle] ?? ""}
                onChange={(e) => setSimSaisies((s) => ({ ...s, [c.cle]: e.target.value }))}
              />
            </Champ>
          ))}
        </div>
        {optionsVersion.length > 0 && (
          <fieldset className="flex flex-wrap gap-x-6">
            <legend className="text-sm font-medium">Options retenues</legend>
            {optionsVersion.map((o) => (
              <Case
                key={o.cle}
                libelle={o.libelle}
                checked={simOptions.has(o.cle)}
                onChange={(coche) => setSimOptions((s) => {
                  const suivant = new Set(s);
                  if (coche) suivant.add(o.cle);
                  else suivant.delete(o.cle);
                  return suivant;
                })}
              />
            ))}
          </fieldset>
        )}

        {resultat.etat === "invalide" ? (
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Simulation impossible pour l’instant :</p>
            <ul className="mt-1 list-disc pl-5">{resultat.erreurs.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        ) : (
          <div className="space-y-4" aria-live="polite">
            <table className="w-full text-sm">
              <thead className="hidden text-left text-xs uppercase text-neutral-500 md:table-header-group">
                <tr>
                  <th className="px-3 py-2">Composant</th>
                  <th className="px-3 py-2">Quantité</th>
                  <th className="px-3 py-2">Détail du calcul</th>
                  <th className="px-3 py-2 text-right">Vente HT</th>
                </tr>
              </thead>
              <tbody>
                {resultat.lignes.map((l) => (
                  <tr key={l.cle} className={`block border-t border-neutral-100 py-2 md:table-row md:py-0 dark:border-neutral-800 ${l.inclus ? "" : "text-neutral-500"}`}>
                    <td className="block px-3 py-1 font-medium md:table-cell md:py-2">{l.designation}</td>
                    <td className="block px-3 py-1 font-mono md:table-cell md:py-2">
                      <span className="text-xs text-neutral-500 md:hidden">Quantité : </span>
                      {l.inclus ? `${nombre(l.quantite)} ${l.unite}` : "—"}
                    </td>
                    <td className="block px-3 py-1 text-xs md:table-cell md:py-2">
                      {l.detail}
                      {l.saisieManquante && <span className="block text-amber-700">Saisie attendue à l’insertion.</span>}
                    </td>
                    <td className="block px-3 py-1 font-mono md:table-cell md:py-2 md:text-right">
                      <span className="text-xs text-neutral-500 md:hidden">Vente HT : </span>
                      {l.venteHt === null ? "—" : euros(l.venteHt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
                <dt className="text-xs text-neutral-500">Prix de vente HT</dt>
                <dd className="font-mono text-lg font-semibold">{euros(resultat.indicateurs.prixVenteRetenuHt)}</dd>
              </div>
              {peutVoirCouts && (
                <>
                  <div className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
                    <dt className="text-xs text-neutral-500">Coût d’achat estimé HT</dt>
                    <dd className="font-mono text-lg">{eurosOuIncomplet(resultat.indicateurs.coutAchatHt)}</dd>
                  </div>
                  <div className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
                    <dt className="text-xs text-neutral-500">Marge HT</dt>
                    <dd className="font-mono text-lg">{eurosOuIncomplet(resultat.indicateurs.margeHt)}</dd>
                  </div>
                  <div className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
                    <dt className="text-xs text-neutral-500">Taux de marque</dt>
                    <dd className="font-mono text-lg">{pourcent(resultat.indicateurs.tauxMarquePct)}</dd>
                  </div>
                </>
              )}
            </dl>
            {(resultat.avertissements.length > 0 || resultat.saisiesManquantes.length > 0) && (
              <ul className="space-y-1 text-sm">
                {resultat.saisiesManquantes.length > 0 && (
                  <li className="text-amber-800">Saisie attendue à l’insertion pour {resultat.saisiesManquantes.length} composant(s) : la quantité calculée ici l’ignore.</li>
                )}
                {resultat.avertissements.map((a, i) => (
                  <li key={`${a.code}-${a.cle ?? i}`} className={a.gravite === "attention" ? "text-amber-800" : "text-neutral-600 dark:text-neutral-400"}>
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {peutGerer && (
        <section className={section} aria-labelledby={`${id}-publication`}>
          <h2 id={`${id}-publication`} className="text-sm font-semibold">Publication</h2>
          <p className="text-sm">Une version publiée ne se modifie plus. Les devis existants gardent la version qu’ils ont reçue.</p>
          {!peutGererCouts && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Une publication faite sans le droit de gérer les coûts ne reprend aucun coût interne : la nouvelle version n’en portera pas.
            </p>
          )}
          {erreursPublication.length > 0 && (
            <div id={idErreurs} className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">À corriger avant de publier :</p>
              <ul className="mt-1 list-disc pl-5">{erreursPublication.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={boutonPrincipal}
              disabled={enCours || erreursPublication.length > 0}
              aria-describedby={erreursPublication.length > 0 ? idErreurs : undefined}
              onClick={publier}
            >
              {enCours ? "Publication…" : `Publier la version ${numeroSuivant}`}
            </button>
            {ouvrageId && statut === "actif" && (
              <button type="button" className={bouton} disabled={enCours} onClick={() => changerStatut("archive")}>Archiver</button>
            )}
            {ouvrageId && statut === "archive" && (
              <button type="button" className={bouton} disabled={enCours} onClick={() => changerStatut("actif")}>Réactiver</button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

const MODES_ARRONDI: ReadonlyArray<{ cle: ModeArrondi; libelle: string }> = [
  { cle: "aucun", libelle: "Aucun arrondi" },
  { cle: "superieur", libelle: "Au multiple supérieur de…" },
  { cle: "proche", libelle: "Au multiple le plus proche de…" },
];

const CONDITIONS: ReadonlyArray<{ cle: TypeCondition; libelle: string }> = [
  { cle: "toujours", libelle: "Toujours inclus" },
  { cle: "quantite_min", libelle: "Si la quantité principale atteint un seuil" },
  { cle: "option", libelle: "Selon une option cochée à l’insertion" },
];

function CarteComposant({
  c, index, total, ouvert, bases, peutGerer, peutVoirCouts, peutGererCouts, maj, monter, descendre, retirer,
}: {
  c: ComposantFormulaire;
  index: number;
  total: number;
  ouvert: boolean;
  bases: ReturnType<typeof optionsBase>;
  peutGerer: boolean;
  peutVoirCouts: boolean;
  peutGererCouts: boolean;
  maj: (patch: Partial<ComposantFormulaire>) => void;
  monter: () => void;
  descendre: () => void;
  retirer: () => void;
}) {
  const nom = c.designation.trim() || c.cle;
  const nature = NATURES_COMPOSANT.find((n) => n.cle === c.nature)?.libelle ?? c.nature;
  const tauxProposes = TAUX_TVA_ADMIS.map(String).includes(c.tauxTva) ? TAUX_TVA_ADMIS.map(String) : [...TAUX_TVA_ADMIS.map(String), c.tauxTva];
  return (
    <li className="rounded-md border border-neutral-200 dark:border-neutral-800">
      <details open={ouvert}>
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500">
          <span className="font-medium">{index + 1}. {nom}</span>
          <span className="text-xs text-neutral-500">{nature} · {c.unite || "unité ?"} · clé {c.cle}{c.visibleClient ? "" : " · masqué au client"}</span>
        </summary>
        <div className="space-y-5 border-t border-neutral-200 p-3 dark:border-neutral-800">
          <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="mb-2 text-xs font-semibold uppercase text-neutral-500">Identification</legend>
            <Champ libelle="Nature">
              <select className={champ} value={c.nature} onChange={(e) => maj({ nature: e.target.value as NatureComposant })}>
                {NATURES_COMPOSANT.map((n) => <option key={n.cle} value={n.cle}>{n.libelle}</option>)}
              </select>
            </Champ>
            <Champ libelle="Désignation *" className="sm:col-span-2">
              <input className={champ} maxLength={200} value={c.designation} onChange={(e) => maj({ designation: e.target.value })} />
            </Champ>
            <Champ libelle="Unité *">
              <input className={champ} maxLength={20} value={c.unite} onChange={(e) => maj({ unite: e.target.value })} />
            </Champ>
            <Champ libelle="Description client" className="sm:col-span-2 lg:col-span-4">
              <textarea className={champ} rows={2} value={c.descriptionClient} onChange={(e) => maj({ descriptionClient: e.target.value })} />
            </Champ>
            <Champ libelle="Référence interne">
              <input className={champ} maxLength={120} value={c.referenceInterne} onChange={(e) => maj({ referenceInterne: e.target.value })} />
            </Champ>
            <Champ libelle="Référence fabricant">
              <input className={champ} maxLength={120} value={c.referenceFabricant} onChange={(e) => maj({ referenceFabricant: e.target.value })} />
            </Champ>
            <Champ libelle="Fabricant">
              <input className={champ} maxLength={120} value={c.fabricant} onChange={(e) => maj({ fabricant: e.target.value })} />
            </Champ>
            <Champ libelle="Fournisseur">
              <input className={champ} maxLength={120} value={c.fournisseur} onChange={(e) => maj({ fournisseur: e.target.value })} />
            </Champ>
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="mb-2 text-xs font-semibold uppercase text-neutral-500">Quantité</legend>
            <Champ libelle="Coefficient">
              <input className={champ} inputMode="decimal" value={c.coefficient} onChange={(e) => maj({ coefficient: e.target.value })} />
            </Champ>
            <Champ libelle="Base de calcul" className="sm:col-span-2">
              <select className={champ} value={c.baseCle ?? ""} onChange={(e) => maj({ baseCle: e.target.value || null })}>
                {bases.map((b) => <option key={b.valeur ?? ""} value={b.valeur ?? ""}>{b.libelle}</option>)}
              </select>
            </Champ>
            <Champ libelle="Quantité fixe">
              <input className={champ} inputMode="decimal" value={c.quantiteFixe} onChange={(e) => maj({ quantiteFixe: e.target.value })} />
            </Champ>
            <Case libelle="Quantité à saisir à l’insertion" checked={c.saisieRequise} onChange={(v) => maj({ saisieRequise: v })} />
            <Champ libelle="Perte (%)">
              <input className={champ} inputMode="decimal" value={c.pertePct} onChange={(e) => maj({ pertePct: e.target.value })} />
            </Champ>
            <Champ libelle="Quantité minimale">
              <input className={champ} inputMode="decimal" value={c.quantiteMin} onChange={(e) => maj({ quantiteMin: e.target.value })} />
            </Champ>
            <Champ libelle="Arrondi">
              <select className={champ} value={c.arrondiMode} onChange={(e) => maj({ arrondiMode: e.target.value as ModeArrondi })}>
                {MODES_ARRONDI.map((m) => <option key={m.cle} value={m.cle}>{m.libelle}</option>)}
              </select>
            </Champ>
            {c.arrondiMode !== "aucun" && (
              <Champ libelle="Pas d’arrondi">
                <input className={champ} inputMode="decimal" value={c.arrondiPas} onChange={(e) => maj({ arrondiPas: e.target.value })} />
              </Champ>
            )}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="mb-2 text-xs font-semibold uppercase text-neutral-500">Inclusion</legend>
            <Champ libelle="Condition" className="sm:col-span-2">
              <select className={champ} value={c.conditionType} onChange={(e) => maj({ conditionType: e.target.value as TypeCondition })}>
                {CONDITIONS.map((k) => <option key={k.cle} value={k.cle}>{k.libelle}</option>)}
              </select>
            </Champ>
            {c.conditionType === "quantite_min" && (
              <Champ libelle="Seuil de quantité principale">
                <input className={champ} inputMode="decimal" value={c.conditionSeuil} onChange={(e) => maj({ conditionSeuil: e.target.value })} />
              </Champ>
            )}
            {c.conditionType === "option" && (
              <>
                <Champ libelle="Libellé de l’option">
                  <input className={champ} maxLength={120} value={c.optionLibelle} onChange={(e) => maj({ optionLibelle: e.target.value })} />
                </Champ>
                <Champ libelle="Clé de l’option" aide="Partagée par les composants de la même option ; vide : déduite du libellé.">
                  <input className={champ} maxLength={60} value={c.optionCle} onChange={(e) => maj({ optionCle: e.target.value })} />
                </Champ>
                <Case libelle="Cochée par défaut" checked={c.optionParDefaut} onChange={(v) => maj({ optionParDefaut: v })} />
              </>
            )}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="mb-2 text-xs font-semibold uppercase text-neutral-500">Prix</legend>
            <Champ libelle="Prix de vente HT">
              <input className={champ} inputMode="decimal" value={c.prixVenteHt} onChange={(e) => maj({ prixVenteHt: e.target.value })} />
            </Champ>
            <Champ libelle="Taux de TVA">
              <select className={champ} value={c.tauxTva} onChange={(e) => maj({ tauxTva: e.target.value })}>
                {tauxProposes.map((t) => <option key={t} value={t}>{nombre(Number(t))} %</option>)}
              </select>
            </Champ>
            {peutVoirCouts && (
              <Champ libelle="Prix d’achat HT" aide={peutGererCouts ? "Interne : jamais imprimé." : "Lecture seule."}>
                <input
                  className={champ}
                  inputMode="decimal"
                  readOnly={!peutGererCouts}
                  value={c.prixAchatHt}
                  onChange={(e) => maj({ prixAchatHt: e.target.value })}
                />
              </Champ>
            )}
            <Case libelle="Visible par le client" checked={c.visibleClient} onChange={(v) => maj({ visibleClient: v })} />
          </fieldset>
        </div>
      </details>
      {peutGerer && (
        <div className="flex flex-wrap gap-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <button type="button" className={bouton} disabled={index === 0} onClick={monter} aria-label={`Monter « ${nom} »`}>Monter</button>
          <button type="button" className={bouton} disabled={index === total - 1} onClick={descendre} aria-label={`Descendre « ${nom} »`}>Descendre</button>
          <button type="button" className={`${bouton} text-red-700`} onClick={retirer} aria-label={`Retirer « ${nom} »`}>Retirer</button>
        </div>
      )}
    </li>
  );
}
