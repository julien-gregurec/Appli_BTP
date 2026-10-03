import type { SupabaseClient } from "@supabase/supabase-js";
import { connecteurPour, jetonDuCompte } from "@/lib/social/comptes";
import { graphGet, inspecterJetonMeta } from "@/lib/social/meta";
import { inspecterJetonLinkedIn, lectureLinkedIn, urnOrganisation } from "@/lib/social/linkedin";
import type { CompteSocial } from "@/lib/social/types";

// Diagnostic d'un compte connecté : UNIQUEMENT des lectures (GET, introspection).
// Aucune écriture, aucune publication, quel que soit le mode.

export type EtapeDiagnostic = { libelle: string; ok: boolean; detail: string };
export type Diagnostic = {
  date: string;
  reseau: string;
  identite: { nom: string | null; idExterne: string; lien: string | null };
  permissions: string[];
  expiration: { jeton: string | null; accesDonnees: string | null };
  etapes: EtapeDiagnostic[];
  ok: boolean;
};

async function etape(etapes: EtapeDiagnostic[], libelle: string, fn: () => Promise<string>) {
  try {
    etapes.push({ libelle, ok: true, detail: await fn() });
  } catch (e) {
    etapes.push({ libelle, ok: false, detail: e instanceof Error ? e.message : "Erreur" });
  }
}

const SCOPES_ESSENTIELS: Record<string, string[]> = {
  facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
  instagram: ["instagram_basic", "instagram_content_publish"],
  linkedin: ["w_organization_social", "r_organization_social", "rw_organization_admin"],
};

export async function diagnostiquerCompte(admin: SupabaseClient, compte: CompteSocial): Promise<Diagnostic> {
  const etapes: EtapeDiagnostic[] = [];
  const jeton = await jetonDuCompte(admin, compte.id);
  const d: Diagnostic = {
    date: new Date().toISOString(),
    reseau: compte.reseau,
    identite: { nom: null, idExterne: compte.external_account_id, lien: null },
    permissions: compte.scopes,
    expiration: { jeton: compte.token_expires_at, accesDonnees: compte.data_access_expires_at },
    etapes,
    ok: false,
  };

  if (compte.fournisseur === "meta") {
    await etape(etapes, "Jeton (debug_token)", async () => {
      const info = await inspecterJetonMeta(jeton);
      if (!info.valide) throw new Error("Jeton invalide ou révoqué");
      d.permissions = info.scopes;
      d.expiration = { jeton: info.expireAt, accesDonnees: info.dataAccessExpireAt };
      const cible = compte.external_account_id;
      const surRessource = info.scopesParRessource.filter((g) => g.ressources.length === 0 || g.ressources.includes(cible) || (compte.external_parent_id ? g.ressources.includes(compte.external_parent_id) : false)).map((g) => g.scope);
      return `valide, type ${info.type ?? "?"}, ${info.expireAt ? `expire le ${info.expireAt}` : "sans expiration fixe"}${info.dataAccessExpireAt ? `, accès aux données jusqu’au ${info.dataAccessExpireAt}` : ""} ; permissions sur ce compte : ${surRessource.join(", ") || "aucune déclarée par ressource"}`;
    });
    if (compte.reseau === "facebook") {
      await etape(etapes, "Identité de la Page", async () => {
        const page = await graphGet<{ id: string; name: string; link?: string; followers_count?: number; fan_count?: number }>(compte.external_account_id, jeton, { fields: "id,name,link,followers_count,fan_count" });
        if (page.id !== compte.external_account_id) throw new Error(`ID inattendu : ${page.id}`);
        d.identite = { nom: page.name, idExterne: page.id, lien: page.link ?? `https://www.facebook.com/${page.id}` };
        return `${page.name} (ID ${page.id}), ${page.followers_count ?? page.fan_count ?? "n/d"} abonnés`;
      });
    } else {
      await etape(etapes, "Identité du compte Instagram", async () => {
        const ig = await graphGet<{ id: string; username?: string; name?: string; followers_count?: number; media_count?: number }>(compte.external_account_id, jeton, { fields: "id,username,name,followers_count,media_count" });
        if (ig.id !== compte.external_account_id) throw new Error(`ID inattendu : ${ig.id}`);
        d.identite = { nom: ig.username ? `@${ig.username}` : ig.name ?? null, idExterne: ig.id, lien: ig.username ? `https://www.instagram.com/${ig.username}/` : null };
        return `@${ig.username ?? "?"} (ID ${ig.id}), ${ig.followers_count ?? "n/d"} abonnés, ${ig.media_count ?? "n/d"} médias, Page liée ${compte.external_parent_id}`;
      });
      await etape(etapes, "Quota de publication Instagram (lecture)", async () => {
        const q = await graphGet<{ data?: Array<{ quota_usage?: number; config?: { quota_total?: number; quota_duration?: number } }> }>(`${compte.external_account_id}/content_publishing_limit`, jeton, { fields: "quota_usage,config" });
        const ligne = q.data?.[0];
        return `${ligne?.quota_usage ?? 0} / ${ligne?.config?.quota_total ?? 100} publications sur ${Math.round((ligne?.config?.quota_duration ?? 86400) / 3600)} h`;
      });
    }
  } else {
    await etape(etapes, "Jeton (introspection)", async () => {
      const info = await inspecterJetonLinkedIn(jeton);
      if (!info.actif) throw new Error(`Jeton ${info.statut ?? "inactif"}`);
      if (info.scopes.length) d.permissions = info.scopes;
      d.expiration = { jeton: info.expireAt ?? compte.token_expires_at, accesDonnees: null };
      return `actif, expire le ${info.expireAt ?? compte.token_expires_at ?? "?"} ; renouvellement automatique : ${compte.refresh_expires_at ? `possible jusqu’au ${compte.refresh_expires_at}` : "non accordé par LinkedIn (reconnexion tous les 60 jours)"}`;
    });
    await etape(etapes, "Identité de l’organisation", async () => {
      const org = await lectureLinkedIn<{ id: number; localizedName?: string; vanityName?: string }>(`organizations/${compte.external_account_id}`, jeton);
      d.identite = { nom: org.localizedName ?? null, idExterne: urnOrganisation(compte.external_account_id), lien: org.vanityName ? `https://www.linkedin.com/company/${org.vanityName}/` : null };
      return `${org.localizedName ?? "?"} (${urnOrganisation(compte.external_account_id)})`;
    });
  }

  await etape(etapes, "Lecture des publications récentes", async () => {
    const { connecteur } = await connecteurPour(admin, compte.reseau);
    const posts = await connecteur.getPosts(3);
    return `${posts.length} publication(s) lue(s)`;
  });
  await etape(etapes, "Lecture du nombre d’abonnés", async () => {
    const { connecteur } = await connecteurPour(admin, compte.reseau);
    return `${(await connecteur.getFollowers()) ?? "non fourni"}`;
  });
  await etape(etapes, "Permissions essentielles", async () => {
    const manquantes = SCOPES_ESSENTIELS[compte.reseau].filter((s) => !d.permissions.includes(s));
    if (manquantes.length) throw new Error(`manquantes : ${manquantes.join(", ")}`);
    return "toutes présentes";
  });

  d.ok = etapes.every((e) => e.ok);
  return d;
}
