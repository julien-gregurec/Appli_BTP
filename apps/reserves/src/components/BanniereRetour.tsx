"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Bannière de retour d'action, commune à TOUTES les pages de la coquille.
 *
 * Les server actions signalent leur issue en redirigeant vers `?message=` ou `?error=`
 * (voir `appeler()` dans `app/actions.ts`). Jusqu'ici chaque page devait penser à lire
 * ces paramètres : celles qui l'oubliaient — tableau de bord, chantiers, réserves,
 * messages, notifications, exports — avalaient silencieusement le retour. Un échec de
 * transition y était donc indiscernable d'un succès, ce qui est la pire issue possible
 * sur un workflow de levée.
 *
 * La bannière est désormais rendue une seule fois, dans la coquille. Un layout ne reçoit
 * pas `searchParams` : la lecture se fait donc côté client, sous Suspense comme l'exige
 * `useSearchParams()`.
 */
function Contenu() {
  const params = useSearchParams();
  const erreur = params.get("error");
  const message = params.get("message");
  if (!erreur && !message) return null;
  return (
    <>
      {erreur && <div className="message erreur" role="alert">{erreur}</div>}
      {message && <div className="message" role="status">{message}</div>}
    </>
  );
}

export function BanniereRetour() {
  return (
    <Suspense fallback={null}>
      <Contenu />
    </Suspense>
  );
}
