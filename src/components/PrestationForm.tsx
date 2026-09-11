import { PRESTATION_TYPES, type PrestationCatalogue } from "@/lib/prestations";
import { TAUX_TVA, UNITES, euros } from "@/lib/devis";
import { LONGUEURS_MAX_CATALOGUE, type ChampsCatalogueV2, type OptionsCatalogueV2 } from "@/lib/prestations-catalogue-v2";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const inputV2 = `${input} min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500`;

export function PrestationForm({
  action,
  prestation,
  submitLabel,
  catalogueV2,
}: {
  action: (formData: FormData) => void | Promise<void>;
  prestation?: PrestationCatalogue & Partial<ChampsCatalogueV2>;
  submitLabel: string;
  /** Présent seulement quand le moteur de devis v2 est actif : champs de catalogue et prix d'achat. */
  catalogueV2?: OptionsCatalogueV2;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1">
        <label htmlFor="designation" className="text-sm font-medium">Désignation *</label>
        <input id="designation" name="designation" required defaultValue={prestation?.designation} className={input} />
      </div>
      <div className="space-y-1">
        <label htmlFor="description" className="text-sm font-medium">Description</label>
        <textarea id="description" name="description" rows={3} defaultValue={prestation?.description ?? ""} className={input} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="type" className="text-sm font-medium">Type</label>
          <select id="type" name="type" defaultValue={prestation?.type ?? "main_oeuvre"} className={input}>
            {PRESTATION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="unite" className="text-sm font-medium">Unité</label>
          <select id="unite" name="unite" defaultValue={prestation?.unite ?? "h"} className={input}>
            {UNITES.map((unite) => <option key={unite} value={unite}>{unite}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="prix_unitaire_ht" className="text-sm font-medium">Prix unitaire HT</label>
          <input id="prix_unitaire_ht" name="prix_unitaire_ht" type="number" min="0" step="0.01" defaultValue={prestation?.prix_unitaire_ht ?? 0} className={input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="taux_tva" className="text-sm font-medium">TVA</label>
          <select id="taux_tva" name="taux_tva" defaultValue={prestation?.taux_tva ?? 20} className={input}>
            {TAUX_TVA.map((taux) => <option key={taux} value={taux}>{taux} %</option>)}
          </select>
        </div>
      </div>
      {catalogueV2 && <ChampsCatalogue prestation={prestation} options={catalogueV2} />}
      <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
        {submitLabel}
      </button>
    </form>
  );
}

function ChampsCatalogue({ prestation, options }: { prestation?: Partial<ChampsCatalogueV2>; options: OptionsCatalogueV2 }) {
  const texte = (nom: keyof typeof LONGUEURS_MAX_CATALOGUE, libelle: string, aide?: string) => (
    <div className="space-y-1">
      <label htmlFor={nom} className="text-sm font-medium">{libelle}</label>
      <input id={nom} name={nom} maxLength={LONGUEURS_MAX_CATALOGUE[nom]} defaultValue={prestation?.[nom] ?? ""} className={inputV2} aria-describedby={aide ? `${nom}-aide` : undefined} />
      {aide && <p id={`${nom}-aide`} className="text-xs text-neutral-500">{aide}</p>}
    </div>
  );
  const fournisseurs = options.fournisseurs.filter((f) => f.actif || f.id === prestation?.fournisseur_id);

  return (
    <fieldset className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <legend className="px-1 text-sm font-semibold">Références et approvisionnement</legend>
      <p className="text-xs text-neutral-500">Trois références distinctes : aucune n’est recopiée dans une autre. La référence interne est unique dans votre catalogue ; une même référence fabricant peut désigner plusieurs articles.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {texte("reference_interne", "Référence interne", "Votre propre code article. Vide : attribuée automatiquement si la numérotation automatique est active.")}
        {texte("reference_fabricant", "Référence fabricant")}
        {texte("code_barres", "Code-barres", "EAN ou code scanné (64 caractères au plus).")}
        {texte("fabricant", "Fabricant")}
        <div className="space-y-1">
          <label htmlFor="fournisseur_id" className="text-sm font-medium">Fournisseur</label>
          <select id="fournisseur_id" name="fournisseur_id" defaultValue={prestation?.fournisseur_id ?? ""} className={inputV2}>
            <option value="">Aucun</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>{f.nom}{f.reference ? ` (${f.reference})` : ""}{f.actif ? "" : " — inactif"}</option>
            ))}
          </select>
        </div>
        {texte("categorie", "Catégorie")}
        {options.cout === "edition" && (
          <div className="space-y-1">
            <label htmlFor="prix_achat_ht" className="text-sm font-medium">Prix d’achat HT</label>
            <input
              id="prix_achat_ht"
              name="prix_achat_ht"
              inputMode="decimal"
              defaultValue={options.prixAchatHt ?? ""}
              className={inputV2}
              aria-describedby="prix_achat_ht-aide"
            />
            <p id="prix_achat_ht-aide" className="text-xs text-neutral-500">Interne, jamais imprimé. Laisser vide ne modifie pas un prix déjà enregistré.</p>
          </div>
        )}
        {options.cout === "lecture" && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Prix d’achat HT</p>
            <p className="flex min-h-11 items-center font-mono text-sm">{options.prixAchatHt === null ? "Non renseigné" : euros(options.prixAchatHt)}</p>
            <p className="text-xs text-neutral-500">Lecture seule : la modification demande le droit de gérer les coûts.</p>
          </div>
        )}
      </div>
    </fieldset>
  );
}
