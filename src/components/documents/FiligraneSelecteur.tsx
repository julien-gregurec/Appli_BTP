"use client";

import { useId } from "react";
import {
  FILIGRANE_AUCUN,
  lisibilite,
  normaliserFiligrane,
  OPACITE_MAX,
  OPACITE_MIN,
  PRESETS_FILIGRANE,
  TEXTE_MAX,
  type Filigrane,
  type PresetFiligrane,
  type TypeFiligrane,
} from "@/lib/devis/filigrane";

/**
 * Réglage d'un filigrane — partagé par l'éditeur de devis (réglage du document) et les paramètres
 * de l'entreprise (défaut et brouillons).
 *
 * `valeur === null` signifie « hérite » (des réglages de l'entreprise) quand `heritable` est vrai.
 * Les bornes de `filigrane.ts` s'appliquent à chaque changement : le composant ne peut pas produire
 * un filigrane illisible, et il affiche le contraste mesuré.
 */
export function FiligraneSelecteur({
  valeur,
  onChange,
  heritable = false,
  logoDisponible,
  desactive = false,
  legende = "Filigrane",
}: {
  valeur: Partial<Filigrane> | null;
  onChange: (valeur: Partial<Filigrane> | null) => void;
  heritable?: boolean;
  logoDisponible: boolean;
  desactive?: boolean;
  legende?: string;
}) {
  const id = useId();
  const f = valeur ? normaliserFiligrane(valeur) : null;
  const courant = f ?? FILIGRANE_AUCUN;
  const maj = (patch: Partial<Filigrane>) => onChange(normaliserFiligrane({ ...courant, ...patch }));
  const mesure = f ? lisibilite(f) : null;
  const champ = "min-h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <fieldset disabled={desactive} className="space-y-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <legend className="px-1 text-sm font-medium">{legende}</legend>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${legende} : type`}>
        {heritable && (
          <label className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm">
            <input type="radio" name={`${id}-type`} checked={valeur === null} onChange={() => onChange(null)} />
            Réglage de l’entreprise
          </label>
        )}
        {([
          ["aucun", "Aucun"],
          ["texte", "Texte"],
          ["logo", "Logo"],
          ["logo_texte", "Logo et texte"],
        ] as Array<[TypeFiligrane, string]>).map(([type, libelle]) => (
          <label key={type} className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm">
            <input
              type="radio"
              name={`${id}-type`}
              checked={valeur !== null && courant.type === type}
              disabled={(type === "logo" || type === "logo_texte") && !logoDisponible}
              onChange={() => maj({ type, texte: courant.texte ?? (type.includes("texte") ? "BROUILLON" : null), preset: courant.preset ?? (type.includes("texte") ? "BROUILLON" : null) })}
            />
            {libelle}
          </label>
        ))}
      </div>
      {!logoDisponible && <p className="text-xs text-neutral-500">Ajoutez un logo dans les paramètres pour l’utiliser en filigrane.</p>}

      {f && f.type !== "aucun" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(f.type === "texte" || f.type === "logo_texte") && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                Texte prédéfini
                <select
                  className={champ}
                  value={f.preset ?? ""}
                  onChange={(e) => maj(e.target.value ? { preset: e.target.value as PresetFiligrane } : { preset: null, texte: f.texte })}
                >
                  <option value="">Texte libre</option>
                  {PRESETS_FILIGRANE.map((p) => <option key={p.cle} value={p.cle}>{p.texte}</option>)}
                </select>
              </label>
              {!f.preset && (
                <label className="flex flex-col gap-1 text-sm">
                  Texte libre ({TEXTE_MAX} caractères au plus)
                  <input className={champ} maxLength={TEXTE_MAX} value={f.texte ?? ""} onChange={(e) => maj({ texte: e.target.value })} />
                </label>
              )}
            </>
          )}
          <label className="flex flex-col gap-1 text-sm">
            Position
            <select className={champ} value={f.position} onChange={(e) => maj({ position: e.target.value as Filigrane["position"] })}>
              <option value="centre">Centre</option>
              <option value="haut">Haut</option>
              <option value="bas">Bas</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Pages
            <select className={champ} value={f.pages} onChange={(e) => maj({ pages: e.target.value as Filigrane["pages"] })}>
              <option value="toutes">Toutes les pages</option>
              <option value="premiere">Première page seulement</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Taille ({f.taillePct} % de la largeur)
            <input type="range" min={10} max={80} step={5} value={f.taillePct} onChange={(e) => maj({ taillePct: Number(e.target.value) })} className="min-h-11" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Rotation ({f.rotationDeg}°)
            <input type="range" min={-60} max={60} step={5} value={f.rotationDeg} onChange={(e) => maj({ rotationDeg: Number(e.target.value) })} className="min-h-11" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Transparence ({Math.round(f.opacite * 100)} % d’opacité)
            <input
              type="range"
              min={OPACITE_MIN}
              max={OPACITE_MAX}
              step={0.01}
              value={f.opacite}
              onChange={(e) => maj({ opacite: Number(e.target.value) })}
              className="min-h-11"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            Couleur
            <input type="color" value={f.couleur} onChange={(e) => maj({ couleur: e.target.value })} className="h-11 w-14 rounded border" />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={f.repetition} onChange={(e) => maj({ repetition: e.target.checked })} />
            Répéter en mosaïque
          </label>
          {mesure && (
            <p className={`text-xs sm:col-span-2 ${mesure.lisible ? "text-neutral-500" : "text-red-700"}`} aria-live="polite">
              Contraste du filigrane {mesure.contrasteFiligrane.toFixed(2)} (1,5 au plus) · texte du document {mesure.contrasteTexte.toFixed(1)} (4,5 au moins)
              {mesure.lisible ? " — lisible." : " — trop marqué : réduisez l’opacité."}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
