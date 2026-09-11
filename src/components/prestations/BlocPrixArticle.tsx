"use client";

import { useId, useMemo, useState } from "react";
import { euros } from "@/lib/devis";
import {
  COEFFICIENT_MAX,
  indicateursArticle,
  lireCoefficient,
  prixVenteDepuisCoefficient,
  type ModePrix,
} from "@/lib/catalogue/prix-article";

const champ =
  "min-h-11 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900";

const nombre = (s: string): number | null => {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Nombre affiché à la française dans un champ (la saisie accepte la virgule comme le point). */
const fr = (v: number) => String(v).replace(".", ",");
const pct = (v: number | null) => (v === null ? "—" : `${fr(v)} %`);

/**
 * Prix de vente, prix d'achat, coefficient et marge d'un article (moteur de devis v2).
 *
 * `cout` décide de ce qui existe dans la page — pas seulement de ce qui est affiché :
 * - `absent` : ni champ ni valeur de coût (l'utilisateur n'a pas `voir_couts_devis`) ;
 * - `lecture` : coût, coefficient et marge montrés, non modifiables ;
 * - `edition` : champs de coût envoyés au serveur, qui revérifie le droit.
 * En mode « calculé », le prix de vente affiché est prix d'achat × coefficient ; le serveur le
 * RECALCULE à l'enregistrement et ignore la valeur du champ.
 */
export function BlocPrixArticle({
  prixVenteInitial,
  cout,
  prixAchatInitial,
  coefficientInitial,
  modeInitial,
}: {
  prixVenteInitial: number;
  cout: "absent" | "lecture" | "edition";
  prixAchatInitial: number | null;
  coefficientInitial: number | null;
  modeInitial: ModePrix;
}) {
  const id = useId();
  const [prixVente, setPrixVente] = useState(fr(prixVenteInitial ?? 0));
  const [prixAchat, setPrixAchat] = useState(prixAchatInitial === null ? "" : fr(prixAchatInitial));
  const [coefficient, setCoefficient] = useState(coefficientInitial === null ? "" : fr(coefficientInitial));
  const [mode, setMode] = useState<ModePrix>(modeInitial);

  const achat = cout === "absent" ? null : nombre(prixAchat);
  const coef = lireCoefficient(coefficient);
  const coefValide = "valeur" in coef ? coef.valeur : null;
  const venteCalculee = mode === "calcule" && achat !== null && coefValide !== null ? prixVenteDepuisCoefficient(achat, coefValide) : null;
  const venteRetenue = venteCalculee ?? nombre(prixVente) ?? 0;
  const indicateurs = useMemo(() => indicateursArticle(venteRetenue, achat), [venteRetenue, achat]);
  const modifiable = cout === "edition";

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor={`${id}-vente`} className="text-sm font-medium">Prix de vente unitaire HT</label>
        <input
          id={`${id}-vente`}
          name="prix_unitaire_ht"
          inputMode="decimal"
          value={venteCalculee !== null ? fr(venteCalculee) : prixVente}
          onChange={(e) => setPrixVente(e.target.value)}
          readOnly={venteCalculee !== null}
          aria-describedby={venteCalculee !== null ? `${id}-vente-aide` : undefined}
          className={`${champ} ${venteCalculee !== null ? "bg-neutral-50 dark:bg-neutral-800" : ""}`}
        />
        {venteCalculee !== null && (
          <p id={`${id}-vente-aide`} className="text-xs text-neutral-500">Calculé : prix d’achat × coefficient, arrondi au centime.</p>
        )}
      </div>

      {cout !== "absent" && (
        <fieldset className="space-y-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <legend className="px-1 text-sm font-semibold">Coût et marge <span className="font-normal text-neutral-500">— interne, jamais imprimé</span></legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`${id}-achat`} className="text-sm font-medium">Prix d’achat HT</label>
              {modifiable ? (
                <input id={`${id}-achat`} name="prix_achat_ht" inputMode="decimal" value={prixAchat} onChange={(e) => setPrixAchat(e.target.value)} className={champ} aria-describedby={`${id}-achat-aide`} />
              ) : (
                <p id={`${id}-achat`} className="flex min-h-11 items-center font-mono text-sm">{prixAchatInitial === null ? "Non renseigné" : euros(prixAchatInitial)}</p>
              )}
              {modifiable && <p id={`${id}-achat-aide`} className="text-xs text-neutral-500">Laisser vide ne modifie pas un prix déjà enregistré.</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor={`${id}-coef`} className="text-sm font-medium">Coefficient</label>
              {modifiable ? (
                <input id={`${id}-coef`} name="coefficient" inputMode="decimal" value={coefficient} onChange={(e) => setCoefficient(e.target.value)} className={champ} aria-invalid={"erreur" in coef} aria-describedby={`${id}-coef-aide`} />
              ) : (
                <p id={`${id}-coef`} className="flex min-h-11 items-center font-mono text-sm">{coefficientInitial === null ? "—" : fr(coefficientInitial)}</p>
              )}
              {modifiable && (
                <p id={`${id}-coef-aide`} className={`text-xs ${"erreur" in coef ? "text-red-700" : "text-neutral-500"}`}>
                  {"erreur" in coef ? coef.erreur : `Prix de vente = prix d’achat × coefficient (au plus ${COEFFICIENT_MAX}).`}
                </p>
              )}
            </div>
          </div>
          {modifiable ? (
            <div role="radiogroup" aria-label="Mode de prix" className="flex flex-wrap gap-2">
              {([["saisi", "Prix de vente saisi"], ["calcule", "Prix calculé depuis le coefficient"]] as Array<[ModePrix, string]>).map(([valeur, libelle]) => (
                <label key={valeur} className="flex min-h-11 items-center gap-2 rounded-md border border-neutral-300 px-3 text-sm dark:border-neutral-700">
                  <input type="radio" name="mode_prix" value={valeur} checked={mode === valeur} onChange={() => setMode(valeur)} />
                  {libelle}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-500">{modeInitial === "calcule" ? "Prix calculé depuis le coefficient." : "Prix de vente saisi."} Lecture seule : la modification demande le droit de gérer les coûts.</p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-live="polite">
            <div><dt className="text-xs text-neutral-500">Marge HT</dt><dd className={`font-mono ${indicateurs.sousLeCout ? "text-red-700" : ""}`}>{indicateurs.margeHt === null ? "—" : euros(indicateurs.margeHt)}</dd></div>
            <div><dt className="text-xs text-neutral-500">Taux de marge</dt><dd className="font-mono">{pct(indicateurs.tauxMargePct)}</dd></div>
            <div><dt className="text-xs text-neutral-500">Taux de marque</dt><dd className="font-mono">{pct(indicateurs.tauxMarquePct)}</dd></div>
            <div><dt className="text-xs text-neutral-500">Coefficient réel</dt><dd className="font-mono">{indicateurs.coefficient === null ? "—" : fr(indicateurs.coefficient)}</dd></div>
          </dl>
          {indicateurs.sousLeCout && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Prix de vente inférieur au prix d’achat.</p>}
        </fieldset>
      )}
    </div>
  );
}
