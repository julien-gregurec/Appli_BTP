"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BLOC_STOCKAGE,
  FORFAITS_VENDABLES,
  MODULES_COMMERCIAUX,
  OPTIONS_IA,
  offreTarifaireParCle,
  type CodeForfaitVendable,
  type PeriodiciteAbonnement,
} from "@/lib/commercial/catalogue";
import { calculerAbonnement, etatModulesPour, formatCentimes } from "@/lib/commercial/moteur";
import { comparerForfaits, economieAnnuelle, recommanderForfait } from "@/lib/commercial/recommandation";
import type { ConfigurationAbonnement } from "@/lib/commercial/types";

/**
 * Configurateur Gestion Pro (§7).
 *
 * Tout le chiffrage vient de `calculerAbonnement` : aucun prix n'est recalculé
 * ici. Le composant ne fait qu'afficher le résultat du moteur.
 */

const carte = "rounded-2xl border bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";
const titre = "text-sm font-semibold uppercase tracking-wide text-neutral-500";

const STATUT_LIBELLE: Record<string, string> = {
  valide: "Tarif validé",
  recommande: "Tarif recommandé",
  provisoire: "Tarif provisoire",
  divergent: "Tarif divergent",
  a_definir: "Tarif à définir",
};

function Badge({ statut }: { statut: string }) {
  if (statut === "valide") return null;
  const couleur = statut === "divergent"
    ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
    : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  return <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${couleur}`}>{STATUT_LIBELLE[statut] ?? statut}</span>;
}

export function ConfigurateurAbonnement({
  forfaitInitial = "mini",
  urlContact,
}: {
  forfaitInitial?: CodeForfaitVendable;
  urlContact: string;
}) {
  const [forfait, setForfait] = useState<CodeForfaitVendable>(forfaitInitial);
  const [periodicite, setPeriodicite] = useState<PeriodiciteAbonnement>("mensuel");
  const [personnes, setPersonnes] = useState<number>(offreTarifaireParCle(forfaitInitial).comptesInclus);
  const [modules, setModules] = useState<string[]>([]);
  const [blocsStockage, setBlocsStockage] = useState(0);
  const [optionIA, setOptionIA] = useState<"aucune" | "credits" | "intensive">("aucune");
  const [confirme, setConfirme] = useState(false);

  const offre = offreTarifaireParCle(forfait);
  const configuration: ConfigurationAbonnement = {
    forfait, periodicite, personnesActives: personnes, modules, blocsStockage, optionIA,
  };

  const calcul = calculerAbonnement(configuration);
  const comparaisons = comparerForfaits(configuration);
  const recommandation = recommanderForfait(configuration);
  const economie = economieAnnuelle(configuration);
  const etatsModules = etatModulesPour(configuration);

  function changerForfait(nouveau: CodeForfaitVendable) {
    setForfait(nouveau);
    setConfirme(false);
    const cible = offreTarifaireParCle(nouveau);
    setPersonnes((actuel) => Math.max(actuel, cible.comptesInclus));
  }

  function basculerModule(cle: string) {
    setConfirme(false);
    setModules((actuels) => (actuels.includes(cle) ? actuels.filter((m) => m !== cle) : [...actuels, cle]));
  }

  const periodeLabel = periodicite === "annuel" ? "HT / an" : "HT / mois";

  return (
    <div className="space-y-6">
      {/* 1. Forfait de départ */}
      <section className={carte}>
        <h2 className={titre}>1 · Forfait de départ</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {FORFAITS_VENDABLES.map((cle) => {
            const candidat = offreTarifaireParCle(cle);
            const actif = cle === forfait;
            return (
              <button
                key={cle}
                type="button"
                onClick={() => changerForfait(cle)}
                aria-pressed={actif}
                className={`rounded-xl border p-3 text-left transition ${actif ? "border-[#c9a24a] ring-2 ring-[#c9a24a]/40" : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-700"}`}
              >
                <p className="font-semibold">{candidat.nom}</p>
                <p className="text-lg font-bold">{formatCentimes(candidat.prixMensuelCentimes)}</p>
                <p className="text-xs text-neutral-500">HT / mois · {candidat.comptesInclus} personnes actives</p>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Vous n&apos;êtes jamais obligé de monter de forfait à cause du nombre de personnes : chaque forfait accepte
          des personnes supplémentaires.
        </p>
      </section>

      {/* 2. Comptes */}
      <section className={carte}>
        <h2 className={titre}>2 · Personnes actives</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm" htmlFor="personnes">Nombre de personnes pouvant se connecter</label>
          <input
            id="personnes"
            type="number"
            min={1}
            value={personnes}
            onChange={(event) => { setConfirme(false); setPersonnes(Math.max(1, Number(event.target.value) || 1)); }}
            className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="text-sm text-neutral-500">
            {offre.comptesInclus} incluses · au-delà, le tarif suit le rôle du compte (terrain 5 € · chef d’équipe 9 € · administratif 15 € · expert-comptable gratuit)
          </span>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Un <strong>salarié</strong> enregistré dans Gestion Pro n&apos;est pas forcément un <strong>compte</strong> :
          seules les personnes qui se connectent sont comptées. Vous pouvez enregistrer cinq salariés et n&apos;ouvrir
          que trois comptes. L&apos;accès expert-comptable est gratuit et hors capacité facturée.
        </p>
      </section>

      {/* 3. Modules */}
      <section className={carte}>
        <h2 className={titre}>3 · Modules</h2>
        <ul className="mt-3 divide-y dark:divide-neutral-800">
          {etatsModules
            // Les modules `interne` (capacité, traitée à part) et `non_vendable`
            // (service inexistant) ne sont jamais montrés : ne rien promettre.
            .filter((ligne) => ligne.statutCatalogue === "actif" || ligne.statutCatalogue === "bientot")
            .map((ligne) => {
            const definition = MODULES_COMMERCIAUX.find((candidat) => candidat.cle === ligne.cle);
            const desactive = ligne.etat === "inclus" || ligne.etat === "indisponible";
            return (
              <li key={ligne.cle} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <label className="text-sm font-medium" htmlFor={`module-${ligne.cle}`}>{ligne.nom}</label>
                  <Badge statut={ligne.statutPrix} />
                  {definition?.statutCatalogue !== "actif" && (
                    <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800">Bientôt disponible</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-neutral-500">
                    {ligne.etat === "inclus" && "Inclus dans mon forfait"}
                    {ligne.etat === "indisponible" && "Indisponible à ce niveau"}
                    {(ligne.etat === "option" || ligne.etat === "disponible")
                      && `${formatCentimes(ligne.prixMensuelCentimes ?? 0)} / mois`}
                  </span>
                  <input
                    id={`module-${ligne.cle}`}
                    type="checkbox"
                    disabled={desactive}
                    checked={ligne.etat === "inclus" || ligne.etat === "option"}
                    onChange={() => basculerModule(ligne.cle)}
                    className="h-4 w-4"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 4-5. Stockage et IA */}
      <section className={`${carte} grid gap-4 sm:grid-cols-2`}>
        <div>
          <h2 className={titre}>4 · Stockage</h2>
          <p className="mt-2 text-sm">{offre.stockageGoInclus} Go inclus dans {offre.nom}.</p>
          <div className="mt-2 flex items-center gap-3">
            <label className="text-sm" htmlFor="blocs">Blocs de {BLOC_STOCKAGE.goParBloc} Go en plus</label>
            <input
              id="blocs"
              type="number"
              min={0}
              value={blocsStockage}
              onChange={(event) => { setConfirme(false); setBlocsStockage(Math.max(0, Number(event.target.value) || 0)); }}
              className="w-20 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <span className="text-sm text-neutral-500">{formatCentimes(BLOC_STOCKAGE.prixMensuelCentimes)} / mois</span>
            <Badge statut={BLOC_STOCKAGE.statutPrix} />
          </div>
        </div>
        <div>
          <h2 className={titre}>5 · Intelligence artificielle</h2>
          <p className="mt-2 text-sm">
            {offre.operationsIAIncluses.toLocaleString("fr-FR")} opérations incluses. L&apos;accès IA fait partie de
            tous les forfaits ; l&apos;option ne fait qu&apos;augmenter la consommation.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {OPTIONS_IA.map((option) => (
              <button
                key={option.cle}
                type="button"
                onClick={() => { setConfirme(false); setOptionIA(option.cle); }}
                aria-pressed={optionIA === option.cle}
                className={`rounded-lg border px-3 py-2 text-sm ${optionIA === option.cle ? "border-[#c9a24a] ring-2 ring-[#c9a24a]/40" : "border-neutral-200 dark:border-neutral-700"}`}
              >
                {option.nom}
                {option.prixMensuelCentimes > 0 && <span className="ml-1 text-neutral-500">+{formatCentimes(option.prixMensuelCentimes)}</span>}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 6-7. Périodicité */}
      <section className={carte}>
        <h2 className={titre}>6 · Périodicité</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {(["mensuel", "annuel"] as const).map((valeur) => (
            <button
              key={valeur}
              type="button"
              onClick={() => { setConfirme(false); setPeriodicite(valeur); }}
              aria-pressed={periodicite === valeur}
              className={`rounded-lg border px-4 py-2 text-sm ${periodicite === valeur ? "border-[#c9a24a] ring-2 ring-[#c9a24a]/40" : "border-neutral-200 dark:border-neutral-700"}`}
            >
              {valeur === "mensuel" ? "Mensuel" : "Annuel — 2 mois offerts"}
            </button>
          ))}
          <span className="text-sm text-green-700 dark:text-green-400">
            Économie annuelle : {formatCentimes(economie.economieCentimes)} par an
          </span>
        </div>
      </section>

      {/* 8-11. Récapitulatif */}
      <section className={carte}>
        <h2 className={titre}>Votre configuration</h2>
        <table className="mt-3 w-full text-sm">
          <tbody className="divide-y dark:divide-neutral-800">
            {calcul.lignes.map((ligne) => (
              <tr key={ligne.cle}>
                <td className="py-2">
                  {ligne.libelle}
                  {ligne.quantite > 1 && <span className="text-neutral-500"> × {ligne.quantite}</span>}
                  <Badge statut={ligne.statutPrix} />
                </td>
                <td className="py-2 text-right tabular-nums">{formatCentimes(ligne.montantPeriodeCentimes)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 dark:border-neutral-700">
            {calcul.avantages.map((avantage) => (
              <tr key={avantage.remiseId} className="text-green-700 dark:text-green-400">
                <td className="py-1">Remise {avantage.ordre} — {avantage.libelle} <span className="text-xs">({avantage.explication})</span></td>
                <td className="py-1 text-right tabular-nums">− {formatCentimes(avantage.reductionCentimes)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="pt-2">Total {periodeLabel}</td>
              <td className="pt-2 text-right tabular-nums">{formatCentimes(calcul.totalHtCentimes)}</td>
            </tr>
            <tr className="text-neutral-500">
              <td>TVA {calcul.tauxTvaPourcent} %</td>
              <td className="text-right tabular-nums">{formatCentimes(calcul.tvaCentimes)}</td>
            </tr>
            <tr className="font-bold">
              <td>Total TTC</td>
              <td className="text-right tabular-nums">{formatCentimes(calcul.totalTtcCentimes)}</td>
            </tr>
            {periodicite === "annuel" && (
              <tr className="text-neutral-500">
                <td>Équivalent mensuel HT</td>
                <td className="text-right tabular-nums">{formatCentimes(calcul.equivalentMensuelHtCentimes)}</td>
              </tr>
            )}
          </tfoot>
        </table>
        {calcul.avertissements.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-400">
            {calcul.avertissements.map((message) => <li key={message}>⚠ {message}</li>)}
          </ul>
        )}
      </section>

      {/* 12-13. Comparaison et recommandation */}
      <section className={carte}>
        <h2 className={titre}>Comparer avec les forfaits standards</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr><th className="py-1">Forfait</th><th className="py-1">Même périmètre</th><th className="py-1 text-right">Total {periodeLabel}</th><th className="py-1 text-right">Écart</th></tr>
          </thead>
          <tbody className="divide-y dark:divide-neutral-800">
            {comparaisons.map((comparaison) => (
              <tr key={comparaison.forfait} className={comparaison.actuel ? "font-semibold" : undefined}>
                <td className="py-2">{comparaison.nom}{comparaison.actuel && " (votre choix)"}</td>
                <td className="py-2 text-neutral-500">
                  {comparaison.couvertureComplete ? "Oui" : `Sans ${comparaison.modulesManquants.join(", ")}`}
                </td>
                <td className="py-2 text-right tabular-nums">{formatCentimes(comparaison.totalHtCentimes)}</td>
                <td className={`py-2 text-right tabular-nums ${comparaison.ecartCentimes < 0 ? "text-green-700 dark:text-green-400" : "text-neutral-500"}`}>
                  {comparaison.actuel ? "—" : `${comparaison.ecartCentimes > 0 ? "+" : ""}${formatCentimes(comparaison.ecartCentimes)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-950">
          <p>{recommandation.message}</p>
          {recommandation.forfait && (
            <button
              type="button"
              onClick={() => changerForfait(recommandation.forfait as CodeForfaitVendable)}
              className="mt-2 rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
            >
              Essayer {offreTarifaireParCle(recommandation.forfait).nom} — vous pouvez revenir en arrière
            </button>
          )}
        </div>
      </section>

      {/* 14. Confirmation explicite */}
      <section className={carte}>
        <h2 className={titre}>Confirmation</h2>
        {!confirme ? (
          <>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Rien n&apos;est modifié tant que vous n&apos;avez pas confirmé. Vérifiez le récapitulatif ci-dessus.
            </p>
            <button
              type="button"
              onClick={() => setConfirme(true)}
              className="mt-3 rounded-lg bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-[#0d1b2a]"
            >
              Vérifier et confirmer cette configuration
            </button>
          </>
        ) : (
          <div className="mt-2 space-y-3 text-sm">
            <p className="font-semibold">
              {offre.nom} · {personnes} personnes · {modules.length} module{modules.length > 1 ? "s" : ""} en option ·{" "}
              {periodicite === "annuel" ? "facturation annuelle" : "facturation mensuelle"} —{" "}
              {formatCentimes(calcul.totalTtcCentimes)} TTC {periodicite === "annuel" ? "par an" : "par mois"}.
            </p>
            <p className="text-neutral-600 dark:text-neutral-300">
              Les souscriptions et changements en ligne ne sont pas encore ouverts : envoyez-nous cette configuration
              pour que nous la mettions en place et vous confirmions la date de première échéance.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={urlContact}
                className="rounded-lg bg-[#c9a24a] px-4 py-2 font-semibold text-[#0d1b2a]"
              >
                Envoyer cette configuration
              </Link>
              <button type="button" onClick={() => setConfirme(false)} className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700">
                Modifier
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
