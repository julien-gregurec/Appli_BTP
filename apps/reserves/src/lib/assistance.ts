import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { BandeauAssistance } from "@elsatia/platform-support-comms";
import { construireBandeauAssistance } from "@elsatia/platform-support-comms";

/**
 * Bandeau « Session d'assistance ELSATIA » pour cette application.
 *
 * Le contrat est porté par la base : `assistance_bandeau(code)` ne répond que si une
 * session est ouverte ET que CETTE application a été explicitement sélectionnée. Une
 * session ouverte sur Gestion Pro ne peint donc rien ici, ce qui est exactement la
 * garantie attendue.
 *
 * Tant que la migration proposée n'est pas appliquée (aucun numéro de ledger réservé,
 * voir `docs/migrations-proposees/`), la fonction n'existe pas : on renvoie `null`
 * plutôt que de faire tomber la coquille de l'application.
 */
const CODE_APPLICATION = "reserves";

type BandeauRpc = {
  session_id: string;
  entreprise_id: string;
  entreprise_nom: string | null;
  application_code: string;
  application_nom: string | null;
  motif_public: string;
  perimetre: string;
  acteur_email: string;
  ouverte_at: string;
  expire_at: string;
};

export const lireBandeauAssistance = cache(async (): Promise<BandeauAssistance | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assistance_bandeau", {
    p_application_code: CODE_APPLICATION,
  });
  // PGRST202 / 42883 : la fonction n'est pas encore en base. Toute autre erreur remonte.
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error("Contrat d’assistance indisponible");
  }
  if (!data) return null;

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
      perimetre: "lecture_seule",
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
    brut.application_nom ?? CODE_APPLICATION,
    new Date(),
  );
  // Le libellé public vient du serveur : la catégorie exacte du motif ne redescend jamais.
  return { ...bandeau, motif: brut.motif_public };
});
