"use client";

import { useFormStatus } from "react-dom";

/**
 * Bouton de soumission qui se désactive pendant l'envoi (empêche le double clic /
 * double submit d'une action serveur). L'idempotence serveur reste l'autorité ;
 * ceci n'est qu'un garde-fou d'interface.
 */
export function BoutonEnvoi({
  children,
  className,
  libelleEnCours = "En cours…",
}: {
  children: React.ReactNode;
  className?: string;
  libelleEnCours?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? libelleEnCours : children}
    </button>
  );
}
