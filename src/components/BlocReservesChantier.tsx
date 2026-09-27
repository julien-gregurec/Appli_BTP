import { BoutonEnvoi } from "@/components/BoutonEnvoi";
import { urlChantierReserves, type EtatReservesChantier } from "@/lib/reserves-gp";

/*
 * Les formulaires portent `data-application-tierce` : le « mode consultation » de Gestion Pro
 * masque les écritures GP d'un poste sans `gerer_chantiers`, mais cette action écrit dans
 * Réserves et reste jugée par la base (rôle Réserves + chantier consultable dans GP). Un
 * chef de chantier responsable des réserves doit donc la voir.
 *
 * Bloc « ELSATIA Réserves » de la fiche chantier. Affiché seulement quand la base le permet
 * (organisation abonnée à Réserves, rôle Réserves de l'utilisateur, chantier consultable
 * dans Gestion Pro) : sinon la page ne le rend pas du tout. Aucun réglage technique visible.
 */
export function BlocReservesChantier({
  chantierId,
  etat,
  urlReserves,
}: {
  chantierId: string;
  etat: EtatReservesChantier;
  urlReserves: string | null;
}) {
  const action = `/chantiers/${encodeURIComponent(chantierId)}/reserves`;
  const bouton = "rounded-md px-3 py-1.5 text-sm font-medium";

  if (!etat.lie) {
    return (
      <section id="reserves" aria-label="ELSATIA Réserves" className="space-y-3 rounded-md border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
        <div>
          <h2 className="font-semibold">ELSATIA Réserves</h2>
          <p className="text-sm text-neutral-500">
            Suivez les réserves de ce chantier (constat, entreprise, levée) dans ELSATIA Réserves.
            L’adresse, le client, les entreprises, les contacts et les plans y sont repris.
          </p>
        </div>
        {etat.peutSynchroniser ? (
          <form method="post" action={action} data-application-tierce="reserves">
            <BoutonEnvoi className={`${bouton} bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-60`} libelleEnCours="Transmission…">
              Utiliser dans ELSATIA Réserves
            </BoutonEnvoi>
          </form>
        ) : (
          <p className="text-sm text-neutral-500">Un responsable des réserves peut activer le suivi de ce chantier.</p>
        )}
      </section>
    );
  }

  const url = urlChantierReserves(urlReserves, etat.chantierReservesId);
  const tuiles: Array<{ libelle: string; valeur: number; aide?: string }> = [
    { libelle: "Total", valeur: etat.total },
    { libelle: "Ouvertes", valeur: etat.ouvertes, aide: "à attribuer" },
    { libelle: "En cours", valeur: etat.enCours, aide: "chez l’entreprise" },
    { libelle: "Attente levée", valeur: etat.attenteLevee, aide: "à valider" },
    { libelle: "Levées", valeur: etat.levees },
  ];

  return (
    <section id="reserves" aria-label="ELSATIA Réserves" className="space-y-3 rounded-md border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-900 dark:bg-violet-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">ELSATIA Réserves</h2>
          {etat.synchroniseAt && (
            <p className="text-xs text-neutral-500">
              Dernière mise à jour depuis Gestion Pro : {new Date(etat.synchroniseAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className={`${bouton} bg-violet-700 text-white hover:bg-violet-800`}>
              Ouvrir dans Réserves
            </a>
          )}
          {etat.peutSynchroniser && (
            <form method="post" action={action} data-application-tierce="reserves">
              <BoutonEnvoi className={`${bouton} border border-violet-300 hover:bg-violet-100 disabled:opacity-60 dark:border-violet-800 dark:hover:bg-violet-950`} libelleEnCours="Mise à jour…">
                Mettre à jour depuis Gestion Pro
              </BoutonEnvoi>
            </form>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tuiles.map((tuile) => (
          <div key={tuile.libelle} className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950" data-testid={`reserves-${tuile.libelle.toLowerCase().replaceAll(" ", "-")}`}>
            <dt className="text-xs text-neutral-500">{tuile.libelle}{tuile.aide && <span className="block text-[11px]">{tuile.aide}</span>}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold">{tuile.valeur}</dd>
          </div>
        ))}
      </dl>
      {etat.enRetard > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">{etat.enRetard} réserve{etat.enRetard > 1 ? "s" : ""} en retard sur l’échéance.</p>}
      {etat.plansMajDisponible > 0 && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {etat.plansMajDisponible} plan{etat.plansMajDisponible > 1 ? "s ont" : " a"} une version plus récente dans Gestion Pro, non appliquée car déjà utilisé{etat.plansMajDisponible > 1 ? "s" : ""} dans Réserves.
        </p>
      )}
    </section>
  );
}
