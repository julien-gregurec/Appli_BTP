import type { ReactNode } from "react";

/**
 * Barre d'action de bas d'écran, mobile uniquement.
 *
 * Sur un grand écran, l'action principale d'une page vit en haut à droite et se voit d'un
 * coup d'œil. Sur un téléphone, ce même bouton se retrouve après le contenu — donc parfois
 * après deux écrans de défilement — et surtout hors de portée du pouce, qui atteint
 * confortablement le bas de l'écran, pas le haut.
 *
 * Cette barre ramène l'action principale sous le pouce, là où elle est atteignable d'une
 * main — la seule disponible quand l'autre tient un niveau ou un carnet.
 *
 * Trois précautions y sont prises, et chacune corrige un défaut observable :
 *
 * 1. `env(safe-area-inset-bottom)` : sans elle, l'indicateur d'accueil des iPhone récents
 *    recouvre le bas du bouton, qui devient partiellement intouchable.
 * 2. Un `div` de réserve de la même hauteur est rendu dans le flux : une barre `fixed` sans
 *    réserve masque la fin du contenu, et le dernier élément d'une liste devient
 *    inatteignable — défaut classique et particulièrement pénible sur une liste longue.
 * 3. Un décalage à gauche laisse la place au bouton « ← Retour » flottant de `MobileBack`,
 *    qui occupe déjà le coin bas-gauche. Sans ce décalage, les deux se superposent et le
 *    retour devient le bouton que l'on touche en visant l'action principale.
 */
export function BarreActionMobile({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Réserve dans le flux — voir précaution 2. */}
      <div aria-hidden="true" className="h-20 md:hidden" />
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur md:hidden dark:border-neutral-800 dark:bg-neutral-950/95"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* `pl-20` : voir précaution 3. */}
        <div className="flex items-center gap-2 py-3 pl-20 pr-4 [&>*]:min-h-[44px] [&>a]:flex-1 [&>button]:flex-1 [&>a]:items-center [&>a]:justify-center">
          {children}
        </div>
      </div>
    </>
  );
}
