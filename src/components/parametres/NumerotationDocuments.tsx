"use client";

import { useState } from "react";
import { modifierNumerotationDocumentsAction } from "@/app/actions/numerotation-documents";
import { formaterNumero, LARGEUR_MAX, LARGEUR_MIN, LIBELLES_TYPES_DOCUMENT, SEPARATEURS, TYPES_DOCUMENT_NUMEROTES, validerFormatNumerotation, type FormatNumerotation, type Separateur, type TypeDocumentNumerote } from "@/lib/numerotation-documents";

const champ = "min-h-11 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export type EtatNumerotation = Record<TypeDocumentNumerote, { format: FormatNumerotation; prochain: string | null; configure: boolean }>;

/**
 * Numérotation des documents : préfixe facultatif, année, mois, séparateur, largeur du compteur, remise à
 * zéro annuelle, prochain numéro (lecture seule, calculé en base) et aperçu immédiat. Le numéro réel est
 * attribué par la base à la sortie du brouillon : ce formulaire ne renumérote rien.
 */
export function NumerotationDocuments({ initial, peutGerer, voitProchain }: { initial: EtatNumerotation; peutGerer: boolean; voitProchain: boolean }) {
  const [formats, setFormats] = useState<Record<TypeDocumentNumerote, FormatNumerotation>>({ devis: initial.devis.format, facture: initial.facture.format, avoir: initial.avoir.format, commande: initial.commande.format });
  const [avoirPropre, setAvoirPropre] = useState(initial.avoir.configure);
  const maj = (type: TypeDocumentNumerote, patch: Partial<FormatNumerotation>) => setFormats((f) => ({ ...f, [type]: { ...f[type], ...patch } }));

  return (
    <form action={modifierNumerotationDocumentsAction} className="space-y-4">
      <fieldset disabled={!peutGerer} className="space-y-4">
        {TYPES_DOCUMENT_NUMEROTES.map((type) => {
          const f = formats[type];
          const refus = validerFormatNumerotation(f);
          const inactif = type === "avoir" && !avoirPropre;
          return (
            <section key={type} className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800" data-testid={`numerotation-${type}`}>
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-sm font-semibold">{LIBELLES_TYPES_DOCUMENT[type]}</h2>
                {type === "avoir" && (
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="avoir_propre" checked={avoirPropre} onChange={(e) => setAvoirPropre(e.target.checked)} />Séquence propre aux avoirs (sinon : suite des factures)</label>
                )}
                <span className="ml-auto text-sm text-neutral-600 dark:text-neutral-300">
                  Aperçu : <strong data-testid={`apercu-${type}`}>{inactif ? formaterNumero(formats.facture, 1) : formaterNumero(f, 1)}</strong>
                  {voitProchain && initial[type].prochain && <> · prochain numéro attribué : <strong data-testid={`prochain-${type}`}>{initial[type].prochain}</strong></>}
                </span>
              </div>
              {!inactif && (
                <div className="grid gap-3 sm:grid-cols-6">
                  <label className="flex flex-col gap-1 text-xs text-neutral-500">Préfixe (facultatif)
                    <input name={`prefixe_${type}`} value={f.prefixe} onChange={(e) => maj(type, { prefixe: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) })} className={champ} placeholder="aucun" aria-label={`Préfixe ${LIBELLES_TYPES_DOCUMENT[type]}`} />
                  </label>
                  <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" name={`annee_${type}`} checked={f.avecAnnee} onChange={(e) => maj(type, { avecAnnee: e.target.checked, compteurAnnuel: e.target.checked ? f.compteurAnnuel : false })} />Année</label>
                  <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" name={`mois_${type}`} checked={f.avecMois} onChange={(e) => maj(type, { avecMois: e.target.checked })} />Mois</label>
                  <label className="flex flex-col gap-1 text-xs text-neutral-500">Séparateur
                    <select name={`separateur_${type}`} value={f.separateur} onChange={(e) => maj(type, { separateur: e.target.value as Separateur })} className={champ} aria-label={`Séparateur ${LIBELLES_TYPES_DOCUMENT[type]}`}>
                      {SEPARATEURS.map((s) => <option key={s.cle || "aucun"} value={s.cle}>{s.libelle}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-neutral-500">Chiffres du compteur
                    <select name={`largeur_${type}`} value={f.largeur} onChange={(e) => maj(type, { largeur: Number(e.target.value) })} className={champ} aria-label={`Chiffres ${LIBELLES_TYPES_DOCUMENT[type]}`}>
                      {Array.from({ length: LARGEUR_MAX - LARGEUR_MIN + 1 }, (_, i) => LARGEUR_MIN + i).map((n) => <option key={n} value={n}>{"0".repeat(n - 1)}1 ({n})</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" name={`annuel_${type}`} checked={f.compteurAnnuel} disabled={!f.avecAnnee} onChange={(e) => maj(type, { compteurAnnuel: e.target.checked })} />Repart à 1 chaque année</label>
                </div>
              )}
              {!inactif && refus && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{refus}</p>}
            </section>
          );
        })}
        <p className="text-xs text-neutral-500">Le numéro est attribué par la base au moment où le document quitte le brouillon, jamais avant : changer le format ne renumérote aucun document existant et ne remet pas le compteur à zéro (sauf option « repart à 1 chaque année »). Deux documents créés en même temps ne peuvent pas recevoir le même numéro.</p>
        <div className="flex justify-end">
          <button type="submit" className="min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-neutral-900" disabled={!peutGerer}>Enregistrer la numérotation</button>
        </div>
      </fieldset>
    </form>
  );
}
