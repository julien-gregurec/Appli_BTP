import { CLIENT_TYPES, CLIENT_STATUTS } from "@/lib/chantier-statuts";

type ClientInitial = {
  type?: string;
  nom?: string | null;
  prenom?: string | null;
  societe?: string | null;
  raison_sociale?: string | null;
  siret?: string | null;
  numero_tva?: string | null;
  forme_juridique?: string | null;
  adresse_facturation?: string | null;
  adresse_complement?: string | null;
  pays?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  telephone?: string | null;
  email?: string | null;
  conditions_paiement?: string | null;
  delai_paiement_jours?: number | null;
  statut?: string;
  notes?: string | null;
};

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const labelClass = "text-sm font-medium";

// Formulaire partagé création / modification client. L'action est fournie par la page.
export function ClientForm({
  action,
  initial,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  initial?: ClientInitial;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={initial?.type ?? "particulier"} className={inputClass}>
            {CLIENT_TYPES.map((t) => (
              <option key={t.cle} value={t.cle}>{t.libelle}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="statut">Statut</label>
          <select id="statut" name="statut" defaultValue={initial?.statut ?? "prospect"} className={inputClass}>
            {CLIENT_STATUTS.map((s) => (
              <option key={s.cle} value={s.cle}>{s.libelle}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="prenom">Prénom</label>
          <input id="prenom" name="prenom" defaultValue={initial?.prenom ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="nom">Nom</label>
          <input id="nom" name="nom" defaultValue={initial?.nom ?? ""} className={inputClass} />
        </div>
      </div>

      {/*
        Deux noms, deux rôles, une seule source chacun (ELSATIA-GP-CLIENT-LEGAL-FIELDS-V1) :
        « Société » est le nom commercial d'usage (clients.societe), affiché partout ;
        « Raison sociale » est la dénomination légale (clients.raison_sociale), portée sur
        les documents commerciaux. La colonne existait depuis 20260710000004 sans jamais
        être saisie — c'est ce formulaire qui l'active. Aucune colonne `nom_commercial`
        n'est créée : elle ferait doublon avec `societe`.
      */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="societe">Société</label>
          <input id="societe" name="societe" defaultValue={initial?.societe ?? ""} className={inputClass} />
          <p className="text-xs text-neutral-500">Nom commercial ou enseigne, utilisé pour l&apos;affichage.</p>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="raison_sociale">Raison sociale</label>
          <input id="raison_sociale" name="raison_sociale" defaultValue={initial?.raison_sociale ?? ""} className={inputClass} />
          <p className="text-xs text-neutral-500">Dénomination légale, si elle diffère du nom commercial.</p>
        </div>
      </div>

      {/*
        Identité légale — facultative, et sans effet pour un particulier. Les champs restent
        visibles quel que soit le type de client : le formulaire est rendu côté serveur, et
        masquer une saisie déjà enregistrée derrière un changement de type ferait disparaître
        une donnée de l'écran sans la supprimer en base. Le libellé porte donc la nuance,
        plutôt qu'un affichage conditionnel qui mentirait sur le contenu réel.
      */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="siret">SIRET</label>
          <input id="siret" name="siret" defaultValue={initial?.siret ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="numero_tva">N° TVA intracommunautaire</label>
          <input id="numero_tva" name="numero_tva" placeholder="FR40303265045" defaultValue={initial?.numero_tva ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="forme_juridique">Forme juridique</label>
          <input id="forme_juridique" name="forme_juridique" placeholder="SAS, SARL, SCI…" defaultValue={initial?.forme_juridique ?? ""} className={inputClass} />
        </div>
      </div>

      <div className="space-y-1">
        <label className={labelClass} htmlFor="adresse_facturation">Adresse de facturation</label>
        <input id="adresse_facturation" name="adresse_facturation" defaultValue={initial?.adresse_facturation ?? ""} className={inputClass} />
      </div>

      <div className="space-y-1">
        <label className={labelClass} htmlFor="adresse_complement">Complément d&apos;adresse</label>
        <input id="adresse_complement" name="adresse_complement" placeholder="Bâtiment, étage, boîte postale" defaultValue={initial?.adresse_complement ?? ""} className={inputClass} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="code_postal">Code postal</label>
          <input id="code_postal" name="code_postal" defaultValue={initial?.code_postal ?? ""} className={inputClass} />
        </div>
        <div className="col-span-2 space-y-1">
          <label className={labelClass} htmlFor="ville">Ville</label>
          <input id="ville" name="ville" defaultValue={initial?.ville ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="pays">Pays</label>
          <input id="pays" name="pays" placeholder="FR" maxLength={2} defaultValue={initial?.pays ?? ""} className={inputClass} />
          <p className="text-xs text-neutral-500">Code ISO à 2 lettres. Vide = France.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="telephone">Téléphone</label>
          <input id="telephone" name="telephone" defaultValue={initial?.telephone ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-1">
          <label className={labelClass} htmlFor="conditions_paiement">Conditions de paiement</label>
          <input id="conditions_paiement" name="conditions_paiement" placeholder="ex. virement à réception" defaultValue={initial?.conditions_paiement ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="delai_paiement_jours">Délai (jours)</label>
          <input id="delai_paiement_jours" name="delai_paiement_jours" type="number" min="0" max="365" required defaultValue={initial?.delai_paiement_jours ?? 30} className={inputClass} />
        </div>
      </div>

      <div className="space-y-1">
        <label className={labelClass} htmlFor="notes">Notes internes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} className={inputClass} />
      </div>

      <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
        {submitLabel}
      </button>
    </form>
  );
}
