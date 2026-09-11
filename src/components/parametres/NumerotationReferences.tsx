import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import {
  ENTITES_REFERENCE,
  FORMATS_REFERENCE_DEFAUT,
  LARGEUR_MAX,
  LARGEUR_MIN,
  formaterReference,
  type EntiteReference,
  type FormatReference,
} from "@/lib/references";
import { attribuerReferencesManquantesAction, modifierParametresReferencesAction } from "@/app/actions/catalogue-v2";

export type ParametreReference = FormatReference & { generationAuto: boolean };

const LIBELLES: Record<EntiteReference, string> = {
  client: "Clients",
  chantier: "Chantiers",
  fournisseur: "Fournisseurs",
  article: "Articles du catalogue",
  ouvrage: "Ouvrages",
};

const champ = "min-h-11 rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900";
const bouton = "inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-3 text-sm dark:border-neutral-700";

/**
 * Numérotation des références internes (GP V1) : préfixe, nombre de chiffres, année, génération
 * automatique, par nature d'objet. Changer de préfixe ne remet jamais le compteur à zéro, et une
 * valeur déjà saisie à la main n'est jamais réattribuée (la base le garantit).
 */
export function NumerotationReferences({
  parametres,
  peutGerer,
  attribuees,
}: {
  parametres: Partial<Record<EntiteReference, ParametreReference>>;
  peutGerer: boolean;
  /** Nombre de références attribuées par la dernière action, s'il y en a une. */
  attribuees?: string;
}) {
  const annee = new Date().getFullYear();
  const valeur = (e: EntiteReference): ParametreReference => parametres[e] ?? { ...FORMATS_REFERENCE_DEFAUT[e], generationAuto: true };

  return (
    <section id="references" aria-labelledby="references-titre" className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div>
        <h2 id="references-titre" className="text-sm font-semibold">Numérotation des références</h2>
        <p className="text-xs text-neutral-500">Référence interne attribuée à la création quand elle est laissée vide. Unique dans votre entreprise, insensible à la casse, aux accents et aux séparateurs.</p>
      </div>
      {attribuees !== undefined && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{attribuees} référence{Number(attribuees) > 1 ? "s" : ""} attribuée{Number(attribuees) > 1 ? "s" : ""}.</p>}
      <form action={modifierParametresReferencesAction} className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr><th className="py-1 pr-3">Objet</th><th className="py-1 pr-3">Préfixe</th><th className="py-1 pr-3">Chiffres</th><th className="py-1 pr-3">Année</th><th className="py-1 pr-3">Automatique</th><th className="py-1">Exemple</th></tr>
            </thead>
            <tbody>
              {ENTITES_REFERENCE.map((e) => {
                const v = valeur(e);
                return (
                  <tr key={e} className="border-t border-neutral-100 dark:border-neutral-800">
                    <th scope="row" className="py-2 pr-3 text-left font-medium">{LIBELLES[e]}</th>
                    <td className="py-2 pr-3"><input name={`prefixe_${e}`} aria-label={`Préfixe — ${LIBELLES[e]}`} defaultValue={v.prefixe} required pattern="[A-Za-z0-9]{1,8}" maxLength={8} disabled={!peutGerer} className={`${champ} w-24 font-mono uppercase`} /></td>
                    <td className="py-2 pr-3"><input name={`largeur_${e}`} aria-label={`Nombre de chiffres — ${LIBELLES[e]}`} type="number" min={LARGEUR_MIN} max={LARGEUR_MAX} defaultValue={v.largeur} required disabled={!peutGerer} className={`${champ} w-20`} /></td>
                    <td className="py-2 pr-3"><input name={`annee_${e}`} aria-label={`Inclure l’année — ${LIBELLES[e]}`} type="checkbox" defaultChecked={v.avecAnnee} disabled={!peutGerer} className="h-5 w-5" /></td>
                    <td className="py-2 pr-3">
                      {e === "fournisseur"
                        ? <span className="text-xs text-neutral-500">toujours</span>
                        : <input name={`auto_${e}`} aria-label={`Numérotation automatique — ${LIBELLES[e]}`} type="checkbox" defaultChecked={v.generationAuto} disabled={!peutGerer} className="h-5 w-5" />}
                    </td>
                    <td className="py-2 font-mono text-xs text-neutral-500">{formaterReference(v, 1, annee)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {peutGerer
          ? <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">Enregistrer la numérotation</button>
          : <p className="text-xs text-neutral-500">Lecture seule : la modification demande le droit de gérer les paramètres.</p>}
      </form>
      {peutGerer && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-500">Les fiches existantes sans référence n’en reçoivent une que sur votre demande, dans l’ordre de création. Chaque attribution est inscrite à l’historique.</p>
          <div className="flex flex-wrap gap-2">
            {(["client", "chantier", "article", "ouvrage"] as const).map((e) => (
              <form key={e} action={attribuerReferencesManquantesAction.bind(null, e)}>
                <ConfirmSubmitButton message={`Attribuer une référence à toutes les fiches « ${LIBELLES[e]} » qui n’en ont pas ?`} className={bouton}>
                  Compléter : {LIBELLES[e].toLowerCase()}
                </ConfirmSubmitButton>
              </form>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
