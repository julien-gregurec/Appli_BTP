import type { SupabaseClient } from "@supabase/supabase-js";
import { chiffrerSecret, dechiffrerSecret, estChiffreAvecCleCourante, versionCleCourante } from "@/lib/social/crypto";
import { ErreurSocial, type SocialProvider } from "@/lib/social/provider";
import { MetaConnector } from "@/lib/social/meta";
import { LinkedInConnector, rafraichirJetonLinkedIn } from "@/lib/social/linkedin";
import { journaliser } from "@/lib/social/audit";
import type { CompteSocial, Reseau } from "@/lib/social/types";

const COLONNES_COMPTE = "id,fournisseur,reseau,nom_compte,external_account_id,external_parent_id,nom_utilisateur,statut,scopes,connected_at,connecte_par,token_expires_at,refresh_expires_at,data_access_expires_at,derniere_verification_at,derniere_erreur";

export async function listerComptes(admin: SupabaseClient): Promise<CompteSocial[]> {
  const { data } = await admin.from("social_comptes").select(COLONNES_COMPTE).neq("statut", "revoque").order("reseau");
  return (data ?? []) as CompteSocial[];
}

export async function compteActif(admin: SupabaseClient, reseau: Reseau): Promise<CompteSocial | null> {
  const { data } = await admin.from("social_comptes").select(COLONNES_COMPTE).eq("reseau", reseau).neq("statut", "revoque").maybeSingle();
  return (data as CompteSocial | null) ?? null;
}

export async function enregistrerCompte(
  admin: SupabaseClient,
  compte: {
    fournisseur: "meta" | "linkedin";
    reseau: Reseau;
    nom_compte: string;
    external_account_id: string;
    external_parent_id?: string | null;
    nom_utilisateur?: string | null;
    scopes: string[];
    token_expires_at: string | null;
    refresh_expires_at?: string | null;
    data_access_expires_at?: string | null;
    connecte_par: string;
  },
  jeton: string,
  refresh: string | null,
) {
  // Un seul compte officiel par réseau : l'ancien est révoqué localement.
  await admin.from("social_comptes").update({ statut: "revoque" }).eq("reseau", compte.reseau).neq("external_account_id", compte.external_account_id).neq("statut", "revoque");
  const { data, error } = await admin
    .from("social_comptes")
    .upsert(
      {
        ...compte,
        external_parent_id: compte.external_parent_id ?? null,
        nom_utilisateur: compte.nom_utilisateur ?? null,
        refresh_expires_at: compte.refresh_expires_at ?? null,
        data_access_expires_at: compte.data_access_expires_at ?? null,
        statut: "connecte",
        connected_at: new Date().toISOString(),
        derniere_verification_at: new Date().toISOString(),
        derniere_erreur: null,
      },
      { onConflict: "reseau,external_account_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Enregistrement du compte impossible");
  const { error: erreurJeton } = await admin.from("social_identifiants").upsert({
    compte_id: data.id,
    jeton_chiffre: chiffrerSecret(jeton),
    refresh_chiffre: refresh ? chiffrerSecret(refresh) : null,
    cle_version: versionCleCourante(),
    updated_at: new Date().toISOString(),
  });
  if (erreurJeton) throw new Error(erreurJeton.message);
  return data.id as string;
}

async function lireJetons(admin: SupabaseClient, compteId: string) {
  const { data } = await admin.from("social_identifiants").select("jeton_chiffre,refresh_chiffre").eq("compte_id", compteId).maybeSingle();
  if (!data) throw new ErreurSocial("jeton_expire", "Aucun jeton enregistré : reconnecter le compte");
  return { jeton: dechiffrerSecret(data.jeton_chiffre), refresh: data.refresh_chiffre ? dechiffrerSecret(data.refresh_chiffre) : null };
}

/** Marque un compte à reconnecter après une erreur d'authentification. */
export async function signalerErreurCompte(admin: SupabaseClient, compteId: string, erreur: unknown) {
  const code = erreur instanceof ErreurSocial ? erreur.code : "inconnu";
  const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
  const statut = code === "jeton_expire" ? "a_reconnecter" : code === "permission" ? "erreur" : undefined;
  await admin.from("social_comptes").update({ derniere_erreur: message.slice(0, 1000), ...(statut ? { statut } : {}) }).eq("id", compteId);
}

/**
 * Connecteur prêt à l'emploi pour le compte officiel d'un réseau.
 * Rafraîchit le jeton LinkedIn s'il expire dans moins de 7 jours et qu'un
 * jeton de rafraîchissement existe.
 */
export async function connecteurPour(admin: SupabaseClient, reseau: Reseau): Promise<{ compte: CompteSocial; connecteur: SocialProvider }> {
  const compte = await compteActif(admin, reseau);
  if (!compte) throw new ErreurSocial("non_configure", `Aucun compte ${reseau} connecté`);
  if (compte.statut === "a_reconnecter" || compte.statut === "expire") throw new ErreurSocial("jeton_expire", `Le compte ${compte.nom_compte} doit être reconnecté`);
  let { jeton, refresh } = await lireJetons(admin, compte.id);

  if (compte.token_expires_at && new Date(compte.token_expires_at).getTime() < Date.now()) {
    if (compte.fournisseur === "linkedin" && refresh) {
      ({ jeton, refresh } = await renouvelerLinkedIn(admin, compte, refresh));
    } else {
      await admin.from("social_comptes").update({ statut: "expire" }).eq("id", compte.id);
      throw new ErreurSocial("jeton_expire", `Le jeton ${compte.nom_compte} a expiré : reconnecter le compte`);
    }
  } else if (compte.fournisseur === "linkedin" && refresh && compte.token_expires_at && new Date(compte.token_expires_at).getTime() - Date.now() < 7 * 86400_000) {
    ({ jeton, refresh } = await renouvelerLinkedIn(admin, compte, refresh));
  }

  const connecteur: SocialProvider =
    compte.fournisseur === "linkedin"
      ? new LinkedInConnector(compte.external_account_id, jeton, compte.scopes)
      : new MetaConnector(
          {
            reseau: compte.reseau as "facebook" | "instagram",
            externalAccountId: compte.external_account_id,
            pageId: compte.reseau === "instagram" ? compte.external_parent_id ?? "" : compte.external_account_id,
            scopes: compte.scopes,
          },
          jeton,
        );
  return { compte, connecteur };
}

async function renouvelerLinkedIn(admin: SupabaseClient, compte: CompteSocial, refresh: string) {
  const nouveaux = await rafraichirJetonLinkedIn(refresh);
  const refreshFinal = nouveaux.refresh ?? refresh;
  await admin.from("social_identifiants").update({ jeton_chiffre: chiffrerSecret(nouveaux.jeton), refresh_chiffre: chiffrerSecret(refreshFinal), cle_version: versionCleCourante(), updated_at: new Date().toISOString() }).eq("compte_id", compte.id);
  await admin.from("social_comptes").update({ token_expires_at: nouveaux.expireAt, refresh_expires_at: nouveaux.refreshExpireAt ?? compte.refresh_expires_at, statut: "connecte", derniere_erreur: null }).eq("id", compte.id);
  await journaliser(admin, { acteur: "système", action: "jeton_renouvele", reseau: "linkedin", objetId: compte.id });
  return { jeton: nouveaux.jeton, refresh: refreshFinal };
}

/** Rotation de clé : rechiffre tous les jetons avec la clé courante. */
export async function rechiffrerJetons(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from("social_identifiants").select("compte_id,jeton_chiffre,refresh_chiffre");
  let total = 0;
  for (const ligne of data ?? []) {
    if (estChiffreAvecCleCourante(ligne.jeton_chiffre) && (!ligne.refresh_chiffre || estChiffreAvecCleCourante(ligne.refresh_chiffre))) continue;
    await admin
      .from("social_identifiants")
      .update({
        jeton_chiffre: chiffrerSecret(dechiffrerSecret(ligne.jeton_chiffre)),
        refresh_chiffre: ligne.refresh_chiffre ? chiffrerSecret(dechiffrerSecret(ligne.refresh_chiffre)) : null,
        cle_version: versionCleCourante(),
        updated_at: new Date().toISOString(),
      })
      .eq("compte_id", ligne.compte_id);
    total++;
  }
  return total;
}

export async function jetonDuCompte(admin: SupabaseClient, compteId: string) {
  return (await lireJetons(admin, compteId)).jeton;
}

export function joursAvantExpiration(compte: Pick<CompteSocial, "token_expires_at">): number | null {
  if (!compte.token_expires_at) return null;
  return Math.floor((new Date(compte.token_expires_at).getTime() - Date.now()) / 86400_000);
}
