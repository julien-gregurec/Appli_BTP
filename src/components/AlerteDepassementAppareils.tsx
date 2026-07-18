import type { DepassementAppareilsFacturable } from "@/lib/facturation-appareils";

/**
 * Prévient l'entreprise cliente qu'un ou plusieurs de ses comptes dépassent
 * deux appareils, ce qui entraîne une facturation supplémentaire.
 *
 * La règle est fixée côté plateforme (migration 20260716000085) : dès qu'un
 * compte utilise plus de deux appareils actifs, il est facturé UN poste
 * supplémentaire au tarif mensuel de son poste — forfaitairement, quel que
 * soit le nombre d'appareils au-delà de deux. On reproduit ici EXACTEMENT ce
 * calcul (même filtre `revoque_at is null`, même forfait) pour afficher le
 * montant que le client verra sur sa facture, sans surprise.
 *
 * Composant de lecture seule affiché uniquement sur la page Abonnement.
 */
export function AlerteDepassementAppareils({ lignes }: { lignes: DepassementAppareilsFacturable[] }) {
  if (!lignes.length) return null;
  const total = lignes.reduce((s, ligne) => s + ligne.supplementMensuelHt, 0);
  const euros = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-none text-amber-700 dark:text-amber-400" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-amber-900 dark:text-amber-200">
            Facturation d&apos;appareils supplémentaires
          </h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/90">
            {lignes.length === 1 ? "Un salarié utilise" : `${lignes.length} salariés utilisent`}{" "}
            plus de deux appareils actifs. Pour chaque salarié concerné, un poste supplémentaire est facturé
            au tarif mensuel de son poste — soit <strong>{euros(total)} HT / mois</strong> au total.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {lignes.map((l) => (
              <li key={l.utilisateurId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-white/60 px-3 py-1.5 dark:border-amber-900 dark:bg-amber-950/20">
                <span><strong>{l.nom}</strong> · {l.posteNom} · {l.nbAppareils} appareils</span>
                <span className="font-mono">{l.supplementMensuelHt > 0 ? `+ ${euros(l.supplementMensuelHt)} / mois` : "poste non tarifé"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300/80">
            Pour éviter ce supplément, retirez les appareils inutilisés d&apos;un compte depuis sa fiche
            (deux appareils actifs restent inclus).
          </p>
        </div>
      </div>
    </section>
  );
}
