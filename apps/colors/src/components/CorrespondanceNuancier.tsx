import { LIBELLES_ECART, type ResultatNuancier } from "@/lib/nuancier/correspondance";
import type { FinitionSeau } from "@/lib/finition-colors";

const RAISONS: Record<Extract<ResultatNuancier, { statut: "sans_proposition" }>["raison"], string> = {
  teinte_non_declaree: "Aucune teinte n’est renseignée sur cette fiche : saisissez la valeur HEX relevée sur l’étiquette pour obtenir une proposition.",
  teinte_invalide: "La teinte enregistrée n’est pas une valeur HEX exploitable.",
  nuancier_absent: "Aucun nuancier n’est chargé sur cette installation : aucune référence ne peut être proposée.",
};

/**
 * Encart « référence proposée » de la fiche seau.
 *
 * Quatre informations y sont tenues distinctes, parce que les confondre serait
 * précisément la faute à ne pas commettre :
 *
 *  - la **couleur déclarée** : ce que quelqu'un a saisi, et rien d'autre ;
 *  - la **référence proposée** : la plus proche du nuancier chargé, avec son
 *    écart chiffré et sa provenance citable ;
 *  - la **finition** : déclarée d'après l'étiquette, ou inconnue ;
 *  - l'**inconnu** : dit comme tel, jamais comblé par une valeur plausible.
 *
 * Aucune de ces lignes n'affirme que la référence est celle du produit. Colors
 * ne mesure aucune couleur : la proposition ne peut pas être plus fiable que la
 * déclaration dont elle part, et le texte le dit.
 */
export function CorrespondanceNuancier({
  hexDeclare,
  resultat,
  finition,
}: {
  hexDeclare: string | null;
  resultat: ResultatNuancier;
  finition: FinitionSeau;
}) {
  return (
    <article className="panel nuancier-panel">
      <h2>Teinte et référence</h2>

      <dl className="nuancier-lignes">
        <div>
          <dt>Couleur déclarée</dt>
          <dd>
            {hexDeclare
              ? <><span className="nuancier-pastille" style={{ background: hexDeclare }} aria-hidden="true"/>{hexDeclare}</>
              : <span className="nuancier-inconnu">Non renseignée</span>}
          </dd>
        </div>

        <div>
          <dt>Référence proposée</dt>
          <dd>
            {resultat.statut === "proposition"
              ? <>
                  <span className="nuancier-pastille" style={{ background: resultat.hex }} aria-hidden="true"/>
                  <strong>{resultat.code}</strong>
                  {resultat.nom && <span className="nuancier-nom">{resultat.nom}</span>}
                  <span className="badge">ΔE {resultat.distance.toFixed(2)} — {LIBELLES_ECART[resultat.niveau]}</span>
                </>
              : <span className="nuancier-inconnu">{RAISONS[resultat.raison]}</span>}
          </dd>
        </div>

        <div>
          <dt>Finition</dt>
          <dd>
            {finition.origine === "declaree"
              ? <><strong>{finition.libelle}</strong><span className="badge">Déclarée</span></>
              : <span className="nuancier-inconnu">{finition.libelle}</span>}
          </dd>
        </div>
      </dl>

      {resultat.statut === "proposition" && (
        <p className="nuancier-provenance">
          D’après {resultat.source}, version {resultat.version} — proximité calculée par le moteur ELSATIA {resultat.moteur} (ΔE*ab CIE76).
        </p>
      )}
      <p className="color-note">
        La couleur enregistrée ici est <strong>déclarée</strong>, pas mesurée : Colors ne relève aucune couleur
        depuis une photographie. La référence ci-dessus est une <strong>proposition de proximité</strong>, jamais une
        identification du produit. Validez toujours avec un nuancier physique avant de commander ou de retoucher.
      </p>
    </article>
  );
}
