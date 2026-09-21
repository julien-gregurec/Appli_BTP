import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  construireBandeauAssistance,
  resoudreModeAssistance,
  type BandeauAssistance,
  type ModeAssistance,
  type PerimetreAssistance,
} from "@elsatia/platform-support-comms";

/**
 * Accès serveur au contrat d'assistance.
 *
 * Ce lot livre le code applicatif AVANT sa migration : le Train V3 et le chantier
 * Pricing occupent le ledger, et aucun numéro n'a été réservé (voir
 * `docs/migrations-proposees/`). Toutes les lectures ci-dessous doivent donc
 * fonctionner sur une base où les fonctions n'existent pas encore, sans casser une
 * page ni une session support existante.
 *
 * `fonctionAbsente` reconnaît ce cas précis — et LUI SEUL. Une erreur de droits
 * (42501) ou une panne réseau continuent de remonter : les avaler transformerait un
 * refus de sécurité en « pas de session », donc en absence de bandeau.
 */
function fonctionAbsente(erreur: { code?: string; message?: string } | null): boolean {
  if (!erreur) return false;
  // PGRST202 : PostgREST ne trouve pas la fonction dans son cache de schéma.
  // 42883 : Postgres ne connaît pas la fonction.
  return erreur.code === "PGRST202" || erreur.code === "42883";
}

export type EtatAssistance =
  | { disponible: false; raison: "migration_absente" }
  | { disponible: true; bandeau: BandeauAssistance | null; perimetre: PerimetreAssistance | null };

type BandeauRpc = {
  session_id: string;
  entreprise_id: string;
  entreprise_nom: string | null;
  application_code: string;
  application_nom: string | null;
  motif_public: string;
  perimetre: PerimetreAssistance;
  acteur_email: string;
  ouverte_at: string;
  expire_at: string;
  secondes_restantes: number;
};

/**
 * Bandeau permanent de l'application appelante. `null` = pas de session ELSATIA en
 * cours SUR CETTE APPLICATION : une session ouverte sur Colors ne peint pas de
 * bandeau dans Gestion Pro, ce qui est exactement la garantie du §8.
 */
export const lireEtatAssistance = cache(async function lireEtatAssistance(
  applicationCode: string,
): Promise<EtatAssistance> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assistance_bandeau", {
    p_application_code: applicationCode,
  });
  if (fonctionAbsente(error)) return { disponible: false, raison: "migration_absente" };
  if (error) throw new Error("Contrat d’assistance indisponible");
  if (!data) return { disponible: true, bandeau: null, perimetre: null };

  const brut = data as BandeauRpc;
  const bandeau = construireBandeauAssistance(
    {
      id: brut.session_id,
      acteurId: "",
      acteurEmail: brut.acteur_email,
      acteurNom: null,
      entrepriseId: brut.entreprise_id,
      entrepriseNom: brut.entreprise_nom ?? "",
      applications: [brut.application_code],
      incidentGlobal: false,
      perimetre: brut.perimetre,
      // Le serveur n'expose que le libellé public : la catégorie exacte n'a pas à
      // redescendre dans le navigateur, où elle finirait dans le HTML rendu.
      motifCategorie: "autre",
      motifDetailInterne: null,
      ticket: null,
      ouverteAt: brut.ouverte_at,
      expireAt: brut.expire_at,
      derniereActiviteAt: brut.ouverte_at,
      termineeAt: null,
      termineeMotif: null,
      revoqueeAt: null,
      revoqueePar: null,
    },
    brut.application_nom ?? applicationCode,
    new Date(),
  );
  return {
    disponible: true,
    bandeau: { ...bandeau, motif: brut.motif_public },
    perimetre: brut.perimetre,
  };
});

/**
 * Permissions Gestion Pro à appliquer pendant une session d'assistance.
 *
 * `undefined` : le contrat n'est pas encore en base — l'appelant applique alors la
 *   posture d'environnement, stricte par défaut (voir `permissions.ts`).
 * `null` : aucune session d'assistance sur Gestion Pro pour cette entreprise.
 * `string[]` : la liste EXACTE des droits du périmètre choisi.
 */
export async function permissionsAssistanceGestionPro(
  entrepriseId: string,
): Promise<string[] | null | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assistance_permissions_gestion_pro", {
    p_entreprise_id: entrepriseId,
  });
  if (fonctionAbsente(error)) return undefined;
  if (error) throw new Error("Périmètre d’assistance indisponible");
  return Array.isArray(data) ? (data as string[]) : null;
}

/**
 * Un déploiement de Production, au sens le plus large possible.
 *
 * Le test est délibérément large et cumulatif dans le sens du OU : n'importe lequel de
 * ces indices suffit à verrouiller la posture. Se tromper en croyant être en Production
 * n'a aucun coût — la posture reste stricte, ce qui est le comportement voulu partout ;
 * se tromper dans l'autre sens ouvrirait tous les droits sur un déploiement réel.
 */
export function estDeploiementProduction(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.ELSATIA_ENV === "production"
  );
}

/**
 * Posture d'assistance effective.
 *
 * **Le mode strict est le défaut, et il est verrouillé en Production.** Variable
 * absente, valeur inconnue, valeur vide : strict. Seules les valeurs `0` et `false`
 * demandent le mode hérité, et seulement hors Production — auquel cas un avertissement
 * de sécurité est journalisé à chaque résolution, pour qu'un environnement laissé dans
 * cet état finisse par se faire remarquer.
 */
export function modeAssistance(): ModeAssistance {
  const mode = resoudreModeAssistance({
    valeurBrute: process.env.ELSATIA_ASSISTANCE_STRICTE,
    production: estDeploiementProduction(),
  });
  if (mode.avertissement) {
    console.warn(`[securite][assistance] ${mode.avertissement}`);
  }
  return mode;
}

/**
 * Conservée pour les appelants qui n'ont besoin que du booléen. Elle ne peut plus
 * renvoyer `false` sur un déploiement de Production.
 */
export function assistanceStricteActive(): boolean {
  return modeAssistance().strict;
}
