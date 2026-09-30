import {
  chargeurPostgrest,
  creerLecteurEtatIncident,
  type LecteurEtatIncident,
} from "@elsatia/incident-control";
import { clePubliqueSupabase } from "@/lib/supabase/keys";

/**
 * Lecteur de l'état du mode sûr pour Gestion Pro (une instance par processus serveur).
 *
 * Lit `incident_etat_public()` avec la clé PUBLIQUE : aucune donnée sensible, aucun secret. Cache
 * 10 s (délai maximal de propagation d'une bascule), repli 5 min sur la dernière valeur connue si
 * la base ne répond plus. Sans configuration Supabase (build, tests) : état inconnu, rien bloqué.
 */
let lecteur: LecteurEtatIncident | null = null;

export function lecteurEtatIncident(): LecteurEtatIncident {
  if (lecteur) return lecteur;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let cle: string | null = null;
  try {
    cle = clePubliqueSupabase();
  } catch {
    cle = null;
  }
  lecteur = creerLecteurEtatIncident({
    charger: url && cle ? chargeurPostgrest({ urlSupabase: url, clePublique: cle }) : async () => null,
  });
  return lecteur;
}

/** Test uniquement. */
export function reinitialiserLecteurEtatIncidentPourTest() {
  lecteur = null;
}
