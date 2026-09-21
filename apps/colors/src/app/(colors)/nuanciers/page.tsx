import { getContexteColors } from "@/lib/contexte";
import { nuancierColors, VARIABLE_NUANCIER } from "@/lib/nuancier/source";
import { RAISONS_NUANCIER } from "@/lib/nuancier/contrat";
import { LIBELLES_ECART, referencesLesPlusProches } from "@/lib/nuancier/correspondance";

const HEX = /^#[0-9A-Fa-f]{6}$/;
const TAILLE_APERCU = 60;

/**
 * Nuanciers chargés sur l'installation.
 *
 * Cet écran ne propose aucun import : Colors ne livre et ne collecte aucune
 * référence. Il constate ce qui est chargé, le cite avec sa source, sa version
 * et sa licence — les trois choses qu'un export devra pouvoir mentionner — et
 * explique franchement l'absence quand il n'y a rien.
 */
export default async function NuanciersPage({ searchParams }: { searchParams: Promise<{ hex?: string }> }) {
  const [, params] = await Promise.all([getContexteColors(), searchParams]);
  const nuancier = nuancierColors();

  if (!nuancier.disponible) {
    return (
      <>
        <header className="page-heading">
          <div>
            <span className="eyebrow">Références de teintes</span>
            <h1>Nuanciers</h1>
            <p>Aucun nuancier n’est chargé sur cette installation.</p>
          </div>
        </header>
        <article className="panel">
          <h2>Pourquoi cet écran est vide</h2>
          <p className="nuancier-explication">{RAISONS_NUANCIER[nuancier.raison]}</p>
          <p className="nuancier-explication">
            ELSATIA ne livre aucune référence de nuancier avec Colors. RAL Classic et les nuanciers
            fabricants sont des bases protégées : les recopier dans le produit serait une
            contrefaçon, et une valeur sRGB approchée n’aurait de toute façon pas la valeur du
            standard mesuré. Charger un nuancier est donc une décision de l’exploitant, qui seul
            peut détenir les droits correspondants — licence RAL, nuancier fabricant communiqué par
            contrat, ou nuancier propre à l’organisation.
          </p>
          <p className="nuancier-explication">
            Techniquement, il s’agit d’un fichier JSON déclarant sa source, sa version et sa licence,
            désigné par la variable serveur <code>{VARIABLE_NUANCIER}</code>. Le format est décrit
            dans <code>apps/colors/src/lib/nuancier/contrat.ts</code>.
          </p>
          <div className="coming-note">
            <strong>Conséquence dans l’application</strong>
            <span>Les fiches produits affichent « aucune référence proposée » au lieu d’inventer une correspondance.</span>
          </div>
        </article>
      </>
    );
  }

  const hex = params.hex && HEX.test(params.hex) ? params.hex.toUpperCase() : null;
  const proches = hex ? referencesLesPlusProches(hex, nuancier.references, 8) : [];
  const apercu = nuancier.references.slice(0, TAILLE_APERCU);

  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">Références de teintes</span>
          <h1>Nuanciers</h1>
          <p>{nuancier.references.length} références chargées, utilisées pour proposer une correspondance sur chaque fiche.</p>
        </div>
      </header>

      <article className="panel">
        <h2>Provenance</h2>
        <dl className="nuancier-lignes">
          <div><dt>Source</dt><dd>{nuancier.source}</dd></div>
          <div><dt>Version</dt><dd>{nuancier.version}</dd></div>
          <div><dt>Licence</dt><dd>{nuancier.licence}</dd></div>
        </dl>
        <p className="color-note">
          Ces trois mentions accompagnent toute référence citée dans Colors. Une correspondance sans
          provenance ne serait pas vérifiable, et donc pas utilisable pour commander.
        </p>
      </article>

      <form className="filter-bar">
        <label className="grow">
          Chercher la référence la plus proche d’une teinte
          <input name="hex" defaultValue={hex ?? ""} pattern="#[0-9A-Fa-f]{6}" placeholder="#2E5B8A"/>
        </label>
        <button className="primary-action">Comparer</button>
      </form>

      {hex && (
        <article className="panel">
          <h2>Références les plus proches de {hex}</h2>
          {proches.length === 0
            ? <div className="empty-state"><strong>Aucune référence comparable.</strong><span>Vérifiez la valeur saisie.</span></div>
            : <ul className="nuancier-liste">
                {proches.map((reference) => (
                  <li key={reference.code}>
                    <span className="nuancier-pastille" style={{ background: reference.hex }} aria-hidden="true"/>
                    <div><strong>{reference.code}</strong><small>{reference.nom ?? reference.hex}</small></div>
                    <span className="badge">ΔE {reference.distance.toFixed(2)} — {LIBELLES_ECART[reference.niveau]}</span>
                  </li>
                ))}
              </ul>}
        </article>
      )}

      <article className="panel">
        <h2>Aperçu du nuancier</h2>
        <p className="color-note">
          {nuancier.references.length > TAILLE_APERCU
            ? `Les ${TAILLE_APERCU} premières références sur ${nuancier.references.length}. Utilisez la comparaison ci-dessus pour le reste.`
            : "Nuancier complet."}
        </p>
        <ul className="nuancier-liste">
          {apercu.map((reference) => (
            <li key={reference.code}>
              <span className="nuancier-pastille" style={{ background: reference.hex }} aria-hidden="true"/>
              <div><strong>{reference.code}</strong><small>{reference.nom ?? reference.hex}</small></div>
            </li>
          ))}
        </ul>
      </article>
    </>
  );
}
