import { notFound } from "next/navigation";
import { Lien as Link } from "@/components/Lien";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { chargerFamilles } from "@/lib/prestations-catalogue-v2-serveur";
import { arbreFamilles, LONGUEUR_MAX_FAMILLE, type Famille } from "@/lib/catalogue/familles";
import {
  changerActivationFamilleAction,
  creerFamilleAction,
  modifierFamilleAction,
  supprimerFamilleAction,
} from "@/app/actions/catalogue-v2";

const champ = "min-h-11 rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900";
const bouton = "inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-3 text-sm dark:border-neutral-700";

const SUCCES: Record<string, string> = {
  creee: "Famille créée.",
  modifiee: "Famille enregistrée.",
  supprimee: "Famille supprimée.",
};

/** Familles et sous-familles de la bibliothèque (deux niveaux), communes au catalogue, au stock et aux ouvrages. */
export default async function FamillesPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  if (!devisV2Actif()) notFound();
  const [{ error, succes }, ctx, familles] = await Promise.all([searchParams, getContexteEntreprise(), chargerFamilles()]);
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_devis");
  const racines = familles.filter((f) => !f.parentId);

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link href="/prestations" className="text-sm text-neutral-500 hover:underline">← Bibliothèque d’articles</Link>
          <h1 className="mt-1 text-xl font-semibold">Familles</h1>
          <p className="text-sm text-neutral-500">Deux niveaux : une famille, puis ses sous-familles. Une famille qui range encore des articles ne se supprime pas : on l’archive.</p>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {succes && SUCCES[succes] && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{SUCCES[succes]}</p>}

        {peutGerer && (
          <section aria-labelledby="nouvelle-famille" className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 id="nouvelle-famille" className="text-sm font-semibold">Nouvelle famille</h2>
            <form action={creerFamilleAction} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm"><span>Nom</span><input name="nom" required maxLength={LONGUEUR_MAX_FAMILLE} className={champ} /></label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Rangée sous</span>
                <select name="parent_id" defaultValue="" className={champ}>
                  <option value="">— premier niveau —</option>
                  {racines.filter((f) => f.actif).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </label>
              <label className="flex w-24 flex-col gap-1 text-sm"><span>Ordre</span><input name="ordre" type="number" step={1} defaultValue={0} className={champ} /></label>
              <button type="submit" className="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">Créer</button>
            </form>
          </section>
        )}

        {familles.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucune famille pour le moment.</p>
        ) : (
          <ul className="space-y-3">
            {arbreFamilles(familles).map(({ famille, sousFamilles }) => (
              <li key={famille.id} className="rounded-md border border-neutral-200 dark:border-neutral-800">
                <LigneFamille famille={famille} racines={racines} aDesEnfants={sousFamilles.length > 0} peutGerer={peutGerer} />
                {sousFamilles.length > 0 && (
                  <ul className="border-t border-neutral-100 pl-6 dark:border-neutral-800">
                    {sousFamilles.map((s) => (
                      <li key={s.id} className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800">
                        <LigneFamille famille={s} racines={racines} aDesEnfants={false} peutGerer={peutGerer} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function LigneFamille({ famille, racines, aDesEnfants, peutGerer }: { famille: Famille; racines: Famille[]; aDesEnfants: boolean; peutGerer: boolean }) {
  if (!peutGerer) {
    return (
      <div className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm">
        <span className={famille.actif ? "font-medium" : "text-neutral-500 line-through"}>{famille.nom}</span>
        {!famille.actif && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">Archivée</span>}
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap items-end gap-2 px-3 py-2 ${famille.actif ? "" : "bg-neutral-50 dark:bg-neutral-900"}`}>
      <form action={modifierFamilleAction.bind(null, famille.id)} className="flex flex-1 flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-500">
          <span>Nom</span>
          <input name="nom" required maxLength={LONGUEUR_MAX_FAMILLE} defaultValue={famille.nom} className={`${champ} text-neutral-900 dark:text-neutral-100`} />
        </label>
        {aDesEnfants ? (
          <input type="hidden" name="parent_id" value="" />
        ) : (
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            <span>Rangée sous</span>
            <select name="parent_id" defaultValue={famille.parentId ?? ""} className={champ}>
              <option value="">— premier niveau —</option>
              {racines.filter((r) => r.id !== famille.id && (r.actif || r.id === famille.parentId)).map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
            </select>
          </label>
        )}
        <label className="flex w-20 flex-col gap-1 text-xs text-neutral-500">
          <span>Ordre</span>
          <input name="ordre" type="number" step={1} defaultValue={famille.ordre} className={champ} />
        </label>
        <button type="submit" className={bouton}>Enregistrer</button>
      </form>
      <form action={changerActivationFamilleAction.bind(null, famille.id, !famille.actif)}>
        <button type="submit" className={bouton}>{famille.actif ? "Archiver" : "Réactiver"}</button>
      </form>
      <form action={supprimerFamilleAction.bind(null, famille.id)}>
        <ConfirmSubmitButton message={`Supprimer la famille « ${famille.nom} » ? Refusé si elle range encore des articles ou des sous-familles.`} className={`${bouton} text-red-700`}>
          Supprimer
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}
