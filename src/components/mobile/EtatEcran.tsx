import type { ReactNode } from "react";

/**
 * États explicites d'un écran : chargement, vide, erreur, hors ligne.
 *
 * L'application disait déjà « Aucun chantier pour l'instant » ici, « Aucune dépense
 * accessible » là, avec à chaque fois une mise en forme légèrement différente. Sur un
 * téléphone, cette variété a un coût réel : l'utilisateur ne sait pas si l'écran est vide
 * parce qu'il n'y a rien, parce que ça charge encore, ou parce que le réseau a lâché — et
 * les trois appellent des gestes opposés (ne rien faire, attendre, se rapprocher d'une
 * antenne).
 *
 * Les quatre états sont donc distincts VISUELLEMENT et par leur texte. Le cas hors ligne est
 * traité comme un état de plein droit et non comme une erreur : ce n'est pas une panne, c'est
 * la situation normale d'un sous-sol ou d'un chantier isolé, et le message doit dire ce qui
 * reste possible plutôt que ce qui a échoué.
 */

type Nature = "chargement" | "vide" | "erreur" | "hors_ligne";

const APPARENCE: Record<Nature, { bordure: string; fond: string; texte: string; icone: string }> = {
  chargement: { bordure: "border-neutral-300", fond: "bg-neutral-50 dark:bg-neutral-900", texte: "text-neutral-600 dark:text-neutral-400", icone: "⏳" },
  vide:       { bordure: "border-dashed border-neutral-300", fond: "", texte: "text-neutral-500", icone: "—" },
  erreur:     { bordure: "border-red-300", fond: "bg-red-50 dark:bg-red-950/30", texte: "text-red-800 dark:text-red-300", icone: "⚠" },
  hors_ligne: { bordure: "border-amber-300", fond: "bg-amber-50 dark:bg-amber-950/30", texte: "text-amber-900 dark:text-amber-300", icone: "⚡" },
};

export function EtatEcran({
  nature,
  titre,
  detail,
  action,
}: {
  nature: Nature;
  titre: string;
  /** Ce que l'utilisateur peut faire, pas ce qui s'est passé techniquement. */
  detail?: string;
  action?: ReactNode;
}) {
  const style = APPARENCE[nature];
  return (
    <div
      // `status` pour ce qui informe, `alert` pour ce qui interrompt : un lecteur d'écran
      // ne doit pas couper la lecture en cours pour annoncer une liste vide.
      role={nature === "erreur" ? "alert" : "status"}
      aria-live={nature === "erreur" ? "assertive" : "polite"}
      aria-busy={nature === "chargement" || undefined}
      className={`flex flex-col items-center gap-3 rounded-lg border p-8 text-center ${style.bordure} ${style.fond}`}
    >
      <span aria-hidden="true" className="text-2xl">{style.icone}</span>
      <p className={`text-sm font-medium ${style.texte}`}>{titre}</p>
      {detail && <p className="max-w-prose text-xs text-neutral-500">{detail}</p>}
      {action}
    </div>
  );
}
