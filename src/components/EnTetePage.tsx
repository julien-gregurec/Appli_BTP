import type { ReactNode } from "react";
import { Lien } from "@/components/Lien";

/**
 * En-tête de page partagé (GP V1, exigence « retour / quitter » de Julien) : lien de retour explicite,
 * titre, sous-titre et zone d'actions. Toute page métier secondaire l'utilise pour qu'on ne dépende jamais
 * du menu principal pour revenir en arrière.
 */
export function EnTetePage({ titre, retour, sousTitre, actions, children }: {
  titre: ReactNode;
  retour?: { href: string; libelle: string };
  sousTitre?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {retour && <Lien href={retour.href} className="text-sm text-neutral-500 hover:underline">← {retour.libelle}</Lien>}
        <h1 className="mt-1 text-xl font-semibold">{titre}</h1>
        {sousTitre && <p className="text-sm text-neutral-500">{sousTitre}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
