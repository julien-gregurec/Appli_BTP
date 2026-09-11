import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { resumeEntree } from "@/lib/historique";
import type { FournisseurOption } from "@/lib/prestations-catalogue-v2";
import type { FicheArticleV2 } from "@/lib/prestations-catalogue-v2-serveur";
import {
  ajouterCodeFournisseurAction,
  basculerFavoriPrestationAction,
  definirCodePrincipalAction,
  dupliquerPrestationAction,
  envoyerImagePrestationAction,
  retirerCodeFournisseurAction,
  retirerImagePrestationAction,
} from "@/app/actions/catalogue-v2";

const carte = "space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800";
const bouton = "inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-3 text-sm dark:border-neutral-700";
const champ = "min-h-11 rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900";

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

/** Barre d'actions de la fiche : favori (tout lecteur), duplication (gestionnaire du catalogue). */
export function ActionsFicheArticle({ prestationId, favori, peutGerer }: { prestationId: string; favori: boolean; peutGerer: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <form action={basculerFavoriPrestationAction.bind(null, prestationId, !favori, undefined)}>
        <button type="submit" className={bouton} aria-pressed={favori}>
          <span aria-hidden="true" className="mr-1 text-amber-500">{favori ? "★" : "☆"}</span>
          {favori ? "Dans mes favoris" : "Ajouter aux favoris"}
        </button>
      </form>
      {peutGerer ? (
        <form action={dupliquerPrestationAction.bind(null, prestationId)}>
          <ConfirmSubmitButton message="Créer une copie de cet article ? Code-barres et codes distributeurs ne sont pas recopiés." className={bouton}>
            Dupliquer
          </ConfirmSubmitButton>
        </form>
      ) : (
        <button type="button" aria-disabled="true" title="Demande le droit de gérer les devis et le catalogue." className={`${bouton} cursor-not-allowed opacity-50`}>
          Dupliquer
        </button>
      )}
    </div>
  );
}

/** Image, codes distributeurs et historique d'un article (page de modification, moteur v2). */
export function FicheArticleComplements({
  prestationId,
  designation,
  fiche,
  fournisseurs,
  peutGerer,
}: {
  prestationId: string;
  designation: string;
  fiche: FicheArticleV2;
  fournisseurs: FournisseurOption[];
  peutGerer: boolean;
}) {
  const fournisseursActifs = fournisseurs.filter((f) => f.actif);

  return (
    <div className="space-y-6">
      <section aria-labelledby="fiche-image" className={carte}>
        <h2 id="fiche-image" className="text-sm font-semibold">Image</h2>
        {fiche.imageUrl ? (
          // Bucket privé : URL signée de courte durée, hors du domaine des images optimisées.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fiche.imageUrl} alt={`Image de l’article ${designation}`} className="h-40 w-40 rounded-md border border-neutral-200 object-contain dark:border-neutral-800" />
        ) : (
          <p className="text-sm text-neutral-500">Aucune image.</p>
        )}
        {peutGerer && (
          <div className="flex flex-wrap items-end gap-3">
            <form action={envoyerImagePrestationAction.bind(null, prestationId)} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>{fiche.imageUrl ? "Remplacer l’image" : "Ajouter une image"} (PNG, JPG ou WebP, 2 Mo au plus)</span>
                <input type="file" name="image" accept="image/png,image/jpeg,image/webp" required className="text-sm" />
              </label>
              <button type="submit" className={bouton}>Envoyer</button>
            </form>
            {fiche.imageUrl && (
              <form action={retirerImagePrestationAction.bind(null, prestationId)}>
                <ConfirmSubmitButton message="Retirer l’image de cet article ? Les documents déjà émis la conservent." className={`${bouton} text-neutral-600`}>Retirer l’image</ConfirmSubmitButton>
              </form>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="fiche-codes" className={carte}>
        <div>
          <h2 id="fiche-codes" className="text-sm font-semibold">Codes distributeurs</h2>
          <p className="text-xs text-neutral-500">Le code de cet article chez chaque distributeur où vous l’achetez. Recherchables depuis un devis ; aucun prix ici.</p>
        </div>
        {fiche.codes.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun code distributeur.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {fiche.codes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-40 font-medium">{c.fournisseur}</span>
                <span className="font-mono">{c.code}</span>
                {c.principal && <span className="rounded bg-neutral-100 px-1.5 text-xs dark:bg-neutral-800">Principal</span>}
                {peutGerer && (
                  <span className="ml-auto flex gap-2">
                    {!c.principal && (
                      <form action={definirCodePrincipalAction.bind(null, prestationId, c.id)}>
                        <button type="submit" className={bouton}>Définir principal</button>
                      </form>
                    )}
                    <form action={retirerCodeFournisseurAction.bind(null, prestationId, c.id)}>
                      <ConfirmSubmitButton message={`Retirer le code ${c.code} (${c.fournisseur}) ?`} className={`${bouton} text-red-700`}>Retirer</ConfirmSubmitButton>
                    </form>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {peutGerer && (
          fournisseursActifs.length === 0 ? (
            <p className="text-xs text-neutral-500">Créez d’abord un fournisseur pour lui associer un code.</p>
          ) : (
            <form action={ajouterCodeFournisseurAction.bind(null, prestationId)} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>Distributeur</span>
                <select name="fournisseur_id" required className={champ} defaultValue="">
                  <option value="" disabled>Choisir…</option>
                  {fournisseursActifs.map((f) => <option key={f.id} value={f.id}>{f.nom}{f.reference ? ` (${f.reference})` : ""}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Code chez ce distributeur</span>
                <input name="code_article" required maxLength={120} className={`${champ} font-mono`} />
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="principal" className="h-5 w-5" defaultChecked={fiche.codes.length === 0} />
                Principal
              </label>
              <button type="submit" className={bouton}>Ajouter le code</button>
            </form>
          )
        )}
      </section>

      <section aria-labelledby="fiche-historique" className={carte}>
        <div>
          <h2 id="fiche-historique" className="text-sm font-semibold">Historique</h2>
          <p className="text-xs text-neutral-500">Les 50 derniers évènements. Les modifications de coût n’apparaissent qu’aux personnes autorisées à voir les coûts.</p>
        </div>
        {fiche.historique.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun évènement enregistré.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {fiche.historique.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3">
                <time dateTime={e.creeLe} className="w-32 shrink-0 tabular-nums text-neutral-500">{dateHeure(e.creeLe)}</time>
                <span className="flex-1">{resumeEntree(e)}{e.sensible && <span className="ml-2 text-xs text-neutral-500">(coût)</span>}</span>
                <span className="text-neutral-500">{e.auteur ?? "Système"}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
