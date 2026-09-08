import type { BandeauAssistance } from "@elsatia/platform-support-comms";

/**
 * Bandeau permanent d'une session d'assistance (§4 du lot ELSATIA-PLATFORM-CROSS-APP).
 *
 * Il est visible du client comme de l'opérateur, et ne contient donc que le motif
 * PUBLIC. Sa présence est la contrepartie de l'accès : sans lui, une intervention
 * serait indistinguable d'une connexion ordinaire du client, ce que le §4 interdit.
 */
export function BandeauAssistanceElsatia({ bandeau }: { bandeau: BandeauAssistance | null }) {
  if (!bandeau) return null;
  const debut = new Date(bandeau.debutIso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        borderBottom: "2px solid #b45309",
        background: "#fffbeb",
        color: "#451a03",
        padding: "0.65rem 1rem",
        fontSize: "0.85rem",
      }}
    >
      <div>
        <strong>{bandeau.titre}</strong> — {bandeau.entrepriseNom}
        <div style={{ fontSize: "0.78rem" }}>
          Application : {bandeau.applicationNom} · Motif : {bandeau.motif} · Ouverte le {debut} ·
          Intervenant : {bandeau.acteurEmail} · Temps restant : {bandeau.tempsRestantLibelle}
        </div>
      </div>
    </div>
  );
}
