import Link from "next/link";
import type { EtatDemarrageColors } from "@/lib/demarrage-colors";

/**
 * Bandeau de première utilisation.
 *
 * Il ne s'affiche que tant qu'il reste quelque chose à faire, et disparaît de
 * lui-même : aucun bouton « ne plus afficher » n'est nécessaire puisque l'état
 * est déduit des données, pas d'une préférence stockée.
 */
export function DemarrageColors({ etat }: { etat: EtatDemarrageColors }) {
  if (etat.termine) return null;
  const suivante = etat.etapes.find((etape) => !etape.faite);
  return (
    <section className="onboarding" aria-labelledby="onboarding-titre">
      <div className="onboarding-head">
        <div>
          <span className="eyebrow">Première utilisation</span>
          <h2 id="onboarding-titre">Mettre Colors en service</h2>
          <p>{etat.faites} étape{etat.faites > 1 ? "s" : ""} sur {etat.etapes.length} — commencez par « {suivante?.titre.toLowerCase()} ».</p>
        </div>
        <span className="onboarding-count" aria-hidden="true">{etat.faites}/{etat.etapes.length}</span>
      </div>
      <ol className="onboarding-steps">
        {etat.etapes.map((etape, rang) => (
          <li key={etape.cle} className={etape.faite ? "done" : etape.accessible ? "next" : "later"}>
            <span className="onboarding-rank" aria-hidden="true">{etape.faite ? "✓" : rang + 1}</span>
            <div>
              <strong>{etape.titre}</strong>
              <small>{etape.description}</small>
            </div>
            {etape.faite
              ? <span className="badge">Fait</span>
              : etape.accessible
                ? <Link className="outline-button" href={etape.href}>{etape.libelleAction}</Link>
                : <span className="badge">À suivre</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
