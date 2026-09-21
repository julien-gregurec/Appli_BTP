"use client";

import { useMemo, useState } from "react";
import { CIBLES_REMISE, MODES_DUREE_REMISE, TYPES_REMISE_COMMERCIALE } from "@/lib/commercial/types";
import type { CibleRemise, ConfigurationAbonnement, ModeDureeRemise, Remise, TypeRemiseCommerciale } from "@/lib/commercial/types";
import { calculerAbonnement, formatCentimes, projeterEcheances } from "@/lib/commercial/moteur";
import {
  EXPLICATION_TYPE_REMISE,
  LIBELLE_CIBLE_REMISE,
  LIBELLES_MODE_DUREE,
  LIBELLE_TYPE_REMISE,
  dateRetourTarifNormal,
} from "@/lib/commercial/remises";
import { evaluerRemise } from "@/lib/commercial/autorisations";
import { mecanismeStripePour } from "@/lib/commercial/stripe-mapping";
import type { CodeForfaitVendable, PeriodiciteAbonnement } from "@/lib/commercial/catalogue";
import { MODULES_COMMERCIAUX } from "@/lib/commercial/catalogue";

/**
 * Console de remise commerciale (§15).
 *
 * L'aperçu, l'échéancier et le verdict d'autorisation viennent intégralement du
 * moteur : cet écran ne recalcule rien. Il refuse d'envoyer une combinaison que
 * le schéma actuel ne sait pas représenter fidèlement plutôt que de l'appliquer
 * approximativement.
 */

const carte = "rounded-2xl border bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";
const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export type DossierRemise = {
  entrepriseId: string;
  nom: string;
  forfait: CodeForfaitVendable;
  periodicite: PeriodiciteAbonnement;
  personnesActives: number;
  modules: string[];
  abonnementStripe: boolean;
  remiseActuelle: { description: string | null; type: string | null; valeur: number | null; dureeMois: number | null; appliqueeLe: string | null } | null;
};

/**
 * Ce que le schéma d'aujourd'hui (colonnes `entreprises.remise_*` + coupon
 * Stripe unique) sait représenter. Tout le reste attend la migration proposée
 * `gp-subscriptions-modules-discounts-v1.sql.proposed`.
 */
function limitesSchemaActuel(
  type: TypeRemiseCommerciale,
  cible: CibleRemise,
  mode: ModeDureeRemise,
  periodicite: PeriodiciteAbonnement,
): string[] {
  const blocages: string[] = [];
  if (type === "prix_negocie") {
    blocages.push("Le prix négocié fixe exige un Price Stripe dédié et une table de remises : non applicable en l'état.");
  }
  if (cible !== "abonnement") {
    blocages.push("Le coupon Stripe se répartit au prorata sur toute la facture : un périmètre restreint n'est pas représentable aujourd'hui.");
  }
  if (mode === "dates") {
    blocages.push("Une fenêtre de dates n'est pas portée par le schéma actuel (seule une durée en mois l'est).");
  }
  if (mode === "nb_echeances" && periodicite === "annuel") {
    blocages.push("Sur un abonnement annuel, Stripe compterait des MOIS et non des années : forme ambiguë refusée.");
  }
  return blocages;
}

function dureeVersStripe(mode: ModeDureeRemise): "once" | "repeating" | "forever" {
  if (mode === "une_echeance") return "once";
  if (mode === "nb_echeances") return "repeating";
  return "forever";
}

export function ConsoleRemises({
  dossier,
  nombreAdminsPlateforme,
  appliquerRemise,
  retirerRemise,
  intentionId,
  aujourdhui,
}: {
  dossier: DossierRemise;
  nombreAdminsPlateforme: number;
  appliquerRemise: (formData: FormData) => void;
  retirerRemise: (formData: FormData) => void;
  intentionId: string;
  aujourdhui: string;
}) {
  const [type, setType] = useState<TypeRemiseCommerciale>("pourcentage");
  const [cible, setCible] = useState<CibleRemise>("abonnement");
  const [modules, setModules] = useState<string[]>([]);
  const [valeurSaisie, setValeurSaisie] = useState("50");
  const [mode, setMode] = useState<ModeDureeRemise>("nb_echeances");
  const [nombre, setNombre] = useState(2);
  const [debut, setDebut] = useState(aujourdhui);
  const [fin, setFin] = useState("");
  const [motif, setMotif] = useState("");
  const [cumulAutorise, setCumulAutorise] = useState(false);
  const [secondeConfirmation, setSecondeConfirmation] = useState(false);
  const [ambiguiteConfirmee, setAmbiguiteConfirmee] = useState(false);

  const configuration: ConfigurationAbonnement = useMemo(
    () => ({
      forfait: dossier.forfait,
      periodicite: dossier.periodicite,
      personnesActives: dossier.personnesActives,
      modules: dossier.modules,
    }),
    [dossier],
  );

  const valeurCentimes = useMemo(() => {
    const brut = Number(valeurSaisie.replace(",", "."));
    if (!Number.isFinite(brut)) return Number.NaN;
    return type === "pourcentage" ? brut : Math.round(brut * 100);
  }, [valeurSaisie, type]);

  const remise: Remise = useMemo(() => ({
    id: intentionId,
    type,
    valeur: valeurCentimes,
    perimetre: cible === "modules" && modules.length > 0 ? { cible, cles: modules } : { cible },
    duree:
      mode === "nb_echeances"
        ? { mode, debut, nombre }
        : mode === "dates"
          ? { mode, debut, fin }
          : { mode, debut },
    etat: "active",
    motif,
    cumulAutorise,
  }), [intentionId, type, valeurCentimes, cible, modules, mode, debut, nombre, fin, motif, cumulAutorise]);

  const avant = useMemo(() => calculerAbonnement(configuration), [configuration]);
  const apres = useMemo(
    () => calculerAbonnement(configuration, { remises: [remise], date: debut }),
    [configuration, remise, debut],
  );
  const echeances = useMemo(
    () => projeterEcheances(configuration, { debutContrat: debut, nombre: 6, remises: [remise] }),
    [configuration, debut, remise],
  );
  // Rôle et AAL sont posés à « satisfaits » pour l'aperçu : la page est déjà
  // fermée aux non-administrateurs (`estPlateformeAdmin` côté serveur) et l'AAL2
  // est exigée à l'exécution par `plateforme_autoriser_effet_externe`. Ce verdict
  // ne sert donc qu'à afficher ce qui reste à faire côté saisie ; il ne remplace
  // aucun contrôle.
  const verdict = useMemo(
    () => evaluerRemise(remise, {
      estPlateformeAdmin: true,
      aal: "aal2",
      nombreAdminsPlateforme,
      secondeConfirmation,
      validationSecondAdministrateur: false,
      periodicite: dossier.periodicite,
      ambiguiteAnnuelleConfirmee: ambiguiteConfirmee,
      baseCentimes: avant.totalHtCentimes,
    }),
    [remise, nombreAdminsPlateforme, secondeConfirmation, dossier.periodicite, ambiguiteConfirmee, avant.totalHtCentimes],
  );

  const blocagesSchema = limitesSchemaActuel(type, cible, mode, dossier.periodicite);
  const mecanisme = mecanismeStripePour(remise, dossier.periodicite);
  const retour = dateRetourTarifNormal(remise, dossier.periodicite);
  const applicable = blocagesSchema.length === 0 && verdict.autorise && dossier.abonnementStripe;

  return (
    <div className="space-y-5">
      <section className={carte}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Dossier</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-neutral-500">Entreprise</dt><dd className="font-medium">{dossier.nom}</dd></div>
          <div><dt className="text-neutral-500">Forfait</dt><dd className="font-medium">{dossier.forfait} · {dossier.periodicite}</dd></div>
          <div><dt className="text-neutral-500">Personnes actives</dt><dd className="font-medium">{dossier.personnesActives}</dd></div>
          <div><dt className="text-neutral-500">Modules en option</dt><dd className="font-medium">{dossier.modules.length > 0 ? dossier.modules.join(", ") : "aucun"}</dd></div>
          <div><dt className="text-neutral-500">Prix public</dt><dd className="font-medium">{formatCentimes(avant.sousTotalHtCentimes)} HT</dd></div>
          <div><dt className="text-neutral-500">Prix souscrit</dt><dd className="font-medium">{formatCentimes(avant.totalHtCentimes)} HT</dd></div>
        </dl>
        {dossier.remiseActuelle?.description && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <p className="font-medium">Remise en cours : {dossier.remiseActuelle.description}</p>
            {dossier.remiseActuelle.appliqueeLe && <p className="text-neutral-500">Depuis le {new Date(dossier.remiseActuelle.appliqueeLe).toLocaleDateString("fr-FR")}</p>}
            <form action={retirerRemise} className="mt-2">
              <input type="hidden" name="intention_id" value={intentionId} />
              <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
                Révoquer la remise — retour immédiat à {formatCentimes(avant.sousTotalHtCentimes)} HT
              </button>
            </form>
          </div>
        )}
      </section>

      <section className={carte}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Nouvelle remise</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="text-neutral-500">Type</span>
            <select className={`${input} mt-1 block w-full`} value={type} onChange={(e) => setType(e.target.value as TypeRemiseCommerciale)}>
              {TYPES_REMISE_COMMERCIALE.map((valeur) => <option key={valeur} value={valeur}>{LIBELLE_TYPE_REMISE[valeur]}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-neutral-500">{type === "pourcentage" ? "Pourcentage" : type === "montant" ? "Montant déduit (€ HT)" : "Prix négocié (€ HT / échéance)"}</span>
            <input className={`${input} mt-1 block w-full`} value={valeurSaisie} onChange={(e) => setValeurSaisie(e.target.value)} inputMode="decimal" />
          </label>
          <label className="text-sm">
            <span className="text-neutral-500">Périmètre</span>
            <select className={`${input} mt-1 block w-full`} value={cible} onChange={(e) => setCible(e.target.value as CibleRemise)}>
              {CIBLES_REMISE.map((valeur) => <option key={valeur} value={valeur}>{LIBELLE_CIBLE_REMISE[valeur]}</option>)}
            </select>
          </label>
        </div>

        <p className="mt-2 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600 dark:bg-neutral-950 dark:text-neutral-300">
          {EXPLICATION_TYPE_REMISE[type]}
        </p>

        {cible === "modules" && (
          <fieldset className="mt-3">
            <legend className="text-xs text-neutral-500">Modules visés (aucun coché = tous)</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {MODULES_COMMERCIAUX.filter((definition) => definition.vendableALaCarte).map((definition) => (
                <label key={definition.cle} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={modules.includes(definition.cle)}
                    onChange={() => setModules((actuels) => actuels.includes(definition.cle) ? actuels.filter((c) => c !== definition.cle) : [...actuels, definition.cle])}
                  />
                  {definition.nom}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-sm">
            <span className="text-neutral-500">Durée</span>
            <select className={`${input} mt-1 block w-full`} value={mode} onChange={(e) => setMode(e.target.value as ModeDureeRemise)}>
              {MODES_DUREE_REMISE.map((valeur) => <option key={valeur} value={valeur}>{LIBELLES_MODE_DUREE[valeur]}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-neutral-500">Début</span>
            <input type="date" className={`${input} mt-1 block w-full`} value={debut} onChange={(e) => setDebut(e.target.value)} />
          </label>
          {mode === "nb_echeances" && (
            <label className="text-sm">
              <span className="text-neutral-500">Nombre d&apos;échéances</span>
              <input type="number" min={1} className={`${input} mt-1 block w-full`} value={nombre} onChange={(e) => setNombre(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          )}
          {mode === "dates" && (
            <label className="text-sm">
              <span className="text-neutral-500">Fin</span>
              <input type="date" className={`${input} mt-1 block w-full`} value={fin} onChange={(e) => setFin(e.target.value)} />
            </label>
          )}
        </div>

        <label className="mt-3 block text-sm">
          <span className="text-neutral-500">Motif interne (obligatoire, jamais montré au client)</span>
          <input className={`${input} mt-1 block w-full`} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cumulAutorise} onChange={(e) => setCumulAutorise(e.target.checked)} />
          Autoriser le cumul avec une autre remise de périmètre recouvrant
        </label>
      </section>

      {/* Aperçu avant / après */}
      <section className={carte}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Aperçu avant / après</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-lg border p-3 dark:border-neutral-800">
            <p className="text-neutral-500">Avant</p>
            <p className="text-lg font-bold">{formatCentimes(avant.totalHtCentimes)} HT</p>
            <p className="text-neutral-500">{formatCentimes(avant.totalTtcCentimes)} TTC</p>
          </div>
          <div className="rounded-lg border p-3 dark:border-neutral-800">
            <p className="text-neutral-500">Après</p>
            <p className="text-lg font-bold">{formatCentimes(apres.totalHtCentimes)} HT</p>
            <p className="text-neutral-500">{formatCentimes(apres.totalTtcCentimes)} TTC</p>
          </div>
          <div className="rounded-lg border p-3 dark:border-neutral-800">
            <p className="text-neutral-500">Retour au tarif normal</p>
            <p className="font-medium">{retour ? new Date(retour).toLocaleDateString("fr-FR") : "aucun retour programmé"}</p>
            <p className="text-xs text-neutral-500">Mécanisme Stripe : {mecanisme.mecanisme}</p>
          </div>
        </div>

        {apres.avantages.length > 0 && (
          <ol className="mt-3 space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
            {apres.avantages.map((avantage) => (
              <li key={avantage.remiseId}>
                {avantage.ordre}. {LIBELLE_CIBLE_REMISE[avantage.cible]} — {avantage.explication}
              </li>
            ))}
          </ol>
        )}
        {apres.avertissements.map((message) => (
          <p key={message} className="mt-2 text-xs text-amber-700 dark:text-amber-400">⚠ {message}</p>
        ))}

        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr><th className="py-1">Échéance</th><th className="py-1">Date</th><th className="py-1 text-right">Total HT</th><th className="py-1 text-right">Total TTC</th></tr>
          </thead>
          <tbody className="divide-y dark:divide-neutral-800">
            {echeances.map((echeance) => (
              <tr key={echeance.index}>
                <td className="py-1">{echeance.index}</td>
                <td className="py-1">{new Date(echeance.debut).toLocaleDateString("fr-FR")}</td>
                <td className="py-1 text-right tabular-nums">{formatCentimes(echeance.totalHtCentimes)}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatCentimes(echeance.totalTtcCentimes)}
                  {echeance.derniereEcheanceRemisee && <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">dernière échéance remisée</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Confirmation et application */}
      <section className={carte}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Contrôles avant application</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {verdict.exigences.raisons.map((raison) => <li key={raison} className="text-amber-700 dark:text-amber-400">⚠ {raison}</li>)}
          {verdict.erreurs.map((erreur) => <li key={erreur.champ + erreur.message} className="text-red-700 dark:text-red-400">✗ {erreur.message}</li>)}
          {verdict.blocages.map((blocage) => <li key={blocage} className="text-red-700 dark:text-red-400">✗ {blocage}</li>)}
          {blocagesSchema.map((blocage) => <li key={blocage} className="text-red-700 dark:text-red-400">✗ {blocage}</li>)}
          {!dossier.abonnementStripe && <li className="text-red-700 dark:text-red-400">✗ Cette entreprise n&apos;a pas d&apos;abonnement Stripe actif.</li>}
        </ul>

        {verdict.exigences.secondeConfirmationRequise && (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={secondeConfirmation} onChange={(e) => setSecondeConfirmation(e.target.checked)} className="mt-1" />
            <span>
              Je confirme cette remise en connaissance de cause : montant, périmètre, durée et date de retour au
              tarif normal ont été vérifiés ci-dessus.
            </span>
          </label>
        )}
        {dossier.periodicite === "annuel" && (mode === "nb_echeances" || mode === "une_echeance") && (
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={ambiguiteConfirmee} onChange={(e) => setAmbiguiteConfirmee(e.target.checked)} className="mt-1" />
            <span>Je confirme que « {nombre} échéance(s) » vaut ici {nombre} ANNÉE(S), l&apos;abonnement étant annuel.</span>
          </label>
        )}

        <form action={appliquerRemise} className="mt-4">
          <input type="hidden" name="intention_id" value={intentionId} />
          <input type="hidden" name="type" value={type === "prix_negocie" ? "" : type} />
          <input type="hidden" name="valeur" value={type === "pourcentage" ? valeurSaisie : String(Number(valeurSaisie.replace(",", ".")) || 0)} />
          <input type="hidden" name="duree" value={dureeVersStripe(mode)} />
          <input type="hidden" name="duree_mois" value={mode === "nb_echeances" ? String(nombre) : ""} />
          <input type="hidden" name="motif_interne" value={motif} />
          <button
            type="submit"
            disabled={!applicable}
            className="rounded-lg bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-[#0d1b2a]"
          >
            Appliquer la remise
          </button>
          {!applicable && (
            <p className="mt-2 text-xs text-neutral-500">
              L&apos;application est volontairement bloquée tant qu&apos;un point ci-dessus n&apos;est pas levé. Les
              capacités marquées comme non représentables attendent la migration proposée
              <code className="mx-1">gp-subscriptions-modules-discounts-v1</code>.
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
