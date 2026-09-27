import { MESSAGE_LECTURE_SEULE } from "@/lib/suspension-hote";

/**
 * D-01 — bandeau affiché à l'entreprise intervenante quand l'organisation hôte du
 * chantier est suspendue. Les commandes sont masquées par la page ; la base, elle,
 * refuse toute écriture quel que soit le chemin.
 */
export function BandeauLectureSeule() {
  return (
    <div className="message" role="status" data-testid="bandeau-lecture-seule">
      <b>Lecture seule.</b> {MESSAGE_LECTURE_SEULE}
    </div>
  );
}
