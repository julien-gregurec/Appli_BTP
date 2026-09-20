"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/**
 * Bouton d'envoi d'un formulaire qui écrit.
 *
 * Pendant l'exécution de l'action serveur du formulaire, il est désactivé. Sans cela, un
 * second appui — le geste ordinaire d'une personne qui porte des gants, sur un écran qui
 * tarde à répondre — rejouait l'action : deux seaux pour un, une sortie de stock retranchée
 * deux fois. `useFormStatus` est propre au formulaire parent : les autres boutons de la même
 * page ne sont pas touchés.
 *
 * Un bouton désactivé ne peut plus être le déclencheur d'une seconde soumission ; le nom et
 * la valeur du bouton cliqué (`name="etat" value="vide"`) sont déjà captés dans les données du
 * formulaire au moment de la soumission, la désactivation ne les perd donc pas.
 *
 * Ce n'est PAS une idempotence : elle ne protège pas d'un rejeu réseau. L'idempotence côté
 * serveur exige une clé unique en base, donc une migration — voir le rapport de la session.
 */
export function BoutonEnvoi({ children, disabled, ...proprietes }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button {...proprietes} disabled={pending || disabled} aria-busy={pending || undefined}>
      {children}
    </button>
  );
}
