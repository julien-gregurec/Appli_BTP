import Link from "next/link";
import { getContexteColors } from "@/lib/contexte";
import { resoudreRoleColors } from "@/lib/acces-colors";
import { peutEffectuerColors } from "@/lib/permissions-colors";
import { etatOcrColors } from "@/lib/ocr/fournisseurs";
import { RAISONS_OCR_INACTIF } from "@/lib/ocr/politique";

/**
 * Marche à suivre pour documenter un seau par la photo.
 *
 * L'écran précédent annonçait « le contrat de fournisseur OCR est prêt ». Il ne
 * l'est pas : aucun prestataire n'est contractualisé ni implémenté. Cette page
 * dit désormais l'état réel, lu sur la configuration du serveur.
 */
export default async function AjoutPhotoPage() {
  const contexte = await getContexteColors();
  const role = await resoudreRoleColors(contexte);
  const ocr = etatOcrColors();

  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">Saisie terrain</span>
          <h1>Ajout par photo</h1>
          <p>Créez d’abord le seau, puis photographiez-le depuis sa fiche. La photo documente le produit ; elle ne mesure rien.</p>
        </div>
      </header>

      <article className="panel photo-first">
        <span className="step">1</span>
        <h2>Créer la fiche minimale</h2>
        <p>Marque, produit, quantité et emplacement suffisent pour commencer.</p>
        {peutEffectuerColors(role, "ajouter_seau")
          ? <Link className="primary-action" href="/inventaire">Créer un seau</Link>
          : <span className="badge">Votre rôle est en lecture seule</span>}
      </article>

      <article className="panel photo-first">
        <span className="step">2</span>
        <h2>Prendre la photo</h2>
        <p>
          JPEG, PNG, WebP ou HEIC, 10 Mo maximum. Le contenu du fichier est vérifié — pas seulement
          son extension — puis stocké dans un espace privé rattaché à votre organisation, lisible
          uniquement par des liens signés de courte durée.
        </p>
      </article>

      <article className="panel photo-first">
        <span className="step">3</span>
        <h2>Renseigner la teinte</h2>
        <p>
          La couleur se saisit à la main, d’après l’étiquette ou un nuancier physique. Colors ne
          relève <strong>aucune couleur depuis la photographie</strong> : une image non calibrée dépend de
          l’éclairage, du capteur et du traitement de l’appareil, et ne permet aucune conclusion
          colorimétrique. La fiche propose ensuite la référence la plus proche du nuancier chargé,
          avec son écart — une proposition, jamais une identification.
        </p>
      </article>

      <article className="panel">
        <h2>Lecture automatique de l’étiquette</h2>
        <p className="nuancier-explication">
          Colors sait lire le texte d’une étiquette — marque, produit, référence, teinte, volume —
          pour éviter une saisie. Cette lecture suppose de transmettre l’image à un prestataire
          extérieur : c’est un transfert de données, distinct de l’envoi de la photo à ELSATIA,
          et il n’a pas lieu sans décision explicite.
        </p>
        <div className={ocr.actif ? "status-banner" : "coming-note"}>
          {ocr.actif
            ? <><span className="signal"/><div><strong>Lecture d’étiquette active</strong><span>Prestataire déclaré : {ocr.fournisseur}. Chaque champ proposé doit être confirmé un par un avant d’entrer dans la fiche.</span></div></>
            : <><strong>Lecture d’étiquette inactive</strong><span>{RAISONS_OCR_INACTIF[ocr.raison]}</span></>}
        </div>
        <p className="nuancier-explication">
          Même active, elle ne modifie jamais une fiche d’elle-même : elle propose, une personne
          confirme champ par champ, et ce qui n’est pas coché n’est pas écrit. Aucune couleur n’est
          jamais déduite de l’image.
        </p>
      </article>
    </>
  );
}
