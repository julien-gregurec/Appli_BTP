import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RoleApplicationReserves } from "@elsatia/application-access";

export type ContexteReserves = {
  userId: string;
  email: string | null;
  prenom: string | null;
  entrepriseId: string | null;
  entrepriseNom: string;
  estAdminPlateforme: boolean;
  roleReserves: RoleApplicationReserves | null;
};

type ContexteApplicationCourant = {
  utilisateur_id: string;
  prenom: string | null;
  entreprise_id: string | null;
  entreprise_nom: string;
  est_admin_plateforme: boolean;
};

// Le contexte vient du RPC partagé du socle multi-app : Réserves ne redéfinit ni
// l'identité, ni l'organisation active, ni la notion d'administrateur plateforme.
export const getContexteReserves = cache(async (): Promise<ContexteReserves> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("contexte_application_courant").maybeSingle();
  if (error) throw new Error("Contexte ELSATIA indisponible");
  const contexte = data as ContexteApplicationCourant | null;
  if (!contexte || contexte.utilisateur_id !== user.id) {
    redirect("/acces-refuse?motif=appartenance");
  }
  if (!contexte.entreprise_id && !contexte.est_admin_plateforme) {
    redirect("/acces-refuse?motif=appartenance");
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    prenom: contexte.prenom,
    entrepriseId: contexte.entreprise_id,
    entrepriseNom: contexte.entreprise_nom || "Votre organisation",
    estAdminPlateforme: contexte.est_admin_plateforme === true,
    roleReserves: null,
  };
});
