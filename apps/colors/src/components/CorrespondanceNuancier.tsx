import { LIBELLES_ECART, type ResultatNuancier } from "@/lib/nuancier/correspondance";
import { FINITIONS, LIBELLES_FINITION, type FinitionSeau } from "@/lib/finition-colors";
import { confirmerReferenceNuancierAction, definirFinitionAction } from "@/app/actions-metier";

const RAISONS: Record<Extract<ResultatNuancier, { statut: "sans_proposition" }>["raison"], string> = {
  teinte_non_declaree: "Aucune teinte n’est renseignée sur cette fiche : saisissez la valeur HEX relevée sur l’étiquette pour obtenir une proposition.",
  teinte_invalide: "La teinte enregistrée n’est pas une valeur HEX exploitable.",
  nuancier_absent: "Aucun nuancier n’est chargé sur cette installation : aucune référence ne peut être proposée.",
};

export type ReferenceEnregistree = {
  code: string | null;
  distance: number | null;
  confirmee: boolean;
};

/**
 * Encart « teinte, référence et finition » de la fiche seau.
 *
 * Cinq faits y sont tenus distincts, parce que les confondre serait exactement
 * la faute à ne pas commettre :
 *
 *  - la **couleur déclarée** : ce que quelqu'un a saisi, et rien d'autre ;
 *  - la **référence proposée** : la plus proche du nuancier chargé, recalculée
 *    à chaque affichage, avec son écart chiffré et sa provenance citable ;
 *  - la **référence confirmée** : celle qu'une personne a explicitement retenue,
 *    et la seule qui soit enregistrée en base ;
 *  - la **finition** : déclarée d'après l'étiquette, ou inconnue ;
 *  - l'**inconnu** : dit comme tel, jamais comblé par une valeur plausible.
 *
 * Aucune de ces lignes n'affirme que la référence est celle du produit. Colors
 * ne mesure aucune couleur : la proposition ne peut pas être plus fiable que la
 * déclaration dont elle part, et le texte le dit.
 */
export function CorrespondanceNuancier({
  seauId,
  hexDeclare,
  resultat,
  finition,
  reference,
  peutModifier,
}: {
  seauId: string;
  hexDeclare: string | null;
  resultat: ResultatNuancier;
  finition: FinitionSeau;
  reference: ReferenceEnregistree;
  peutModifier: boolean;
}) {
  return (
    <article className="panel nuancier-panel">
      <h2>Teinte, référence et finition</h2>

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
                  <strong data-test="reference-proposee">{resultat.code}</strong>
                  {resultat.nom && <span className="nuancier-nom">{resultat.nom}</span>}
                  <span className="badge" data-test="nature-reference">
                    {resultat.nature === "ral" ? "Référentiel RAL" : "Référence fabricant"}
                  </span>
                  <span className="badge">ΔE {resultat.distance.toFixed(2)} — {LIBELLES_ECART[resultat.niveau]}</span>
                </>
              : <span className="nuancier-inconnu" data-test="sans-proposition">{RAISONS[resultat.raison]}</span>}
          </dd>
        </div>

        <div>
          <dt>Référence retenue</dt>
          <dd>
            {reference.code
              ? <>
                  <strong data-test="reference-confirmee">{reference.code}</strong>
                  <span className="badge">{reference.confirmee ? "Confirmée par une personne" : "Enregistrée, non confirmée"}</span>
                  {reference.distance !== null && <span className="nuancier-nom">ΔE {reference.distance.toFixed(2)}</span>}
                </>
              : <span className="nuancier-inconnu" data-test="sans-reference">Aucune référence n’a été retenue pour ce seau.</span>}
          </dd>
        </div>

        <div>
          <dt>Finition</dt>
          <dd>
            {finition.origine === "declaree"
              ? <><strong data-test="finition">{finition.libelle}</strong><span className="badge">Déclarée</span></>
              : <span className="nuancier-inconnu" data-test="finition">{finition.libelle}</span>}
          </dd>
        </div>
      </dl>

      {peutModifier && (
        <div className="nuancier-actions">
          {/*
            La finition est un choix fermé : un champ libre inviterait à saisir
            « mate satinée » ou « brillant léger », que rien ne saurait exploiter.
          */}
          <form action={definirFinitionAction.bind(null, seauId)} className="inline-form">
            <label>
              Déclarer la finition
              <select name="finition" defaultValue={finition.valeur}>
                {FINITIONS.map((valeur) => (
                  <option key={valeur} value={valeur}>{LIBELLES_FINITION[valeur]}</option>
                ))}
              </select>
            </label>
            <button className="outline-button" data-test="enregistrer-finition">Enregistrer la finition</button>
          </form>

          {/*
            Le bouton n'existe que pour une référence RAL. Une référence
            fabricant n'a aujourd'hui aucune colonne où être retenue : proposer
            un bouton qui échoue ensuite ferait porter à l'utilisateur une
            limite de schéma dont il n'est pas responsable, et l'inviterait à
            réessayer. On explique à la place.
          */}
          {resultat.statut === "proposition" && resultat.persistable && !reference.confirmee && (
            <form action={confirmerReferenceNuancierAction.bind(null, seauId)} className="inline-form">
              <input type="hidden" name="reference" value={resultat.code}/>
              <input type="hidden" name="distance" value={resultat.distance}/>
              <button className="outline-button" data-test="confirmer-reference">
                Retenir « {resultat.code} » pour ce seau
              </button>
            </form>
          )}

          {resultat.statut === "proposition" && !resultat.persistable && (
            <p className="nuancier-inconnu" data-test="reference-non-retenable">
              Cette référence vient d’un nuancier fabricant. Elle reste proposée et exportée avec sa
              provenance, mais elle n’est pas enregistrée sur la fiche : ELSATIA ne conserve
              aujourd’hui que les références du référentiel RAL, et inscrire une référence
              fabricant à leur place la ferait passer pour une norme qu’elle n’est pas.
            </p>
          )}

          {reference.code && (
            <form action={confirmerReferenceNuancierAction.bind(null, seauId)} className="inline-form">
              <input type="hidden" name="reference" value=""/>
              <button className="outline-button" data-test="retirer-reference">Retirer la référence retenue</button>
            </form>
          )}
        </div>
      )}

      {resultat.statut === "proposition" && (
        <p className="nuancier-provenance">
          D’après {resultat.source}, version {resultat.version}, référentiel déclaré « {resultat.referentiel} » —
          proximité calculée par le moteur ELSATIA {resultat.moteur} (ΔE*ab CIE76).
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
