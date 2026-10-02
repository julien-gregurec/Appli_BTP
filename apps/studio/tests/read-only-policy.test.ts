// Politique lecture seule (droit Studio retiré, compte ELSATIA actif) : garde STATIQUE. Toute
// écriture Studio (RPC mutatrice, écriture directe de table ou de Storage) doit être précédée,
// dans la même unité de code, d'une garde d'écriture. Une nouvelle RPC doit être classée ici.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const WRITE_RPCS = new Set([
  "studio_create_workspace", "studio_rename_workspace", "studio_archive_workspace", "studio_set_member",
  "studio_create_project", "studio_save_project", "studio_project_lifecycle", "studio_duplicate_project",
  "studio_set_project_cover", "studio_remove_project_media", "studio_order_project_media",
  "studio_reserve_media", "studio_finish_media", "studio_delete_media",
  "studio_save_timeline", "studio_activate_timeline", "studio_delete_timeline", "studio_save_editor",
  "studio_request_render", "studio_request_editor_render", "studio_cancel_render",
  "studio_request_analysis", "studio_cancel_analysis",
  // Lot post-H (ELSATIA_STUDIO_POST_H_PORT_V1.md §7).
  "studio_save_brand_kit", "studio_attach_brand_logo", "studio_create_render_share",
  "studio_invite_member", "studio_accept_invitation",
]);
// Révocations (lot post-H) : réduisent l'exposition (lien public, invitation). Admises en lecture
// seule, donc SANS garde d'écriture applicative ; la base les borne au chemin user_callable
// exposure_revocation (UPDATE des seules tables de partage/invitation, compte bloqué refusé).
const REVOCATION_RPCS = new Set(["studio_revoke_render_share", "studio_revoke_invitation"]);
// Résolution publique (page /s/[token], page d'invitation avant connexion) : clé service, fonctions
// STABLE (lecture seule), hachage du secret comme seule donnée d'entrée.
const PUBLIC_RESOLVE_RPCS = new Set(["studio_resolve_render_share", "studio_resolve_invitation"]);
const READ_RPCS = new Set([
  "studio_dashboard_stats", "studio_project_summaries", "studio_list_project_media", "studio_project_media_stats",
  "studio_get_timeline", "studio_list_analysis", "studio_my_role", "studio_identity_session_status",
  "studio_workspace_usage", "studio_get_brand_kit", "studio_list_brand_logo_candidates",
  "studio_list_render_shares", "studio_list_invitations",
  // Mode sûr (migration dédiée 20260929180000) : lectures STABLE, compteurs seulement.
  "incident_worker_sante",
]);
// Clé service, bornées EN BASE à un chemin système déclaré (studio_guard.system_paths) : jamais
// appelées pour le compte d'un utilisateur, pas de garde applicative requise (la base les borne).
const SYSTEM_RPCS = new Set([
  "studio_fail_media",
  "studio_erasure_due", "studio_erasure_prepare", "studio_erasure_execute", "studio_erasure_storage_batch",
  "studio_erasure_storage_done", "studio_erasure_finalize", "studio_erasure_confirm_auth_deleted",
  // Export RGPD (demande signée de la plateforme) : chemin système rgpd_export, lecture des données.
  "studio_export_consume", "studio_export_subject",
]);
const GUARD = /authorize(?:Project|Asset)\([^()]*,\s*true\)|writableContext\(\)|requireWritableStudioUser\(\)|canWrite\(/;
const DIRECT_WRITE = /\.(?:insert|update|upsert|createSignedUploadUrl|upload)\(\s*[{"'a-z]/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(resolve(dir, e.name)) : /\.tsx?$/.test(e.name) ? [resolve(dir, e.name)] : [],
  );
}
// Unités : fonctions de premier niveau (le contrôle ne traverse jamais deux fonctions).
function units(code: string): string[] {
  return code.split(/\n(?=(?:export\s+)?(?:async\s+)?function\s|export\s+const\s+\w+\s*=|const\s+\w+\s*=\s*(?:cache\()?async)/);
}

it("toute RPC appelée par Studio est classée lecture ou écriture", () => {
  for (const file of sources(resolve("src"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/\.rpc\(\s*"([a-z_]+)"/g))
      expect(
        WRITE_RPCS.has(m[1]) || READ_RPCS.has(m[1]) || SYSTEM_RPCS.has(m[1]) || REVOCATION_RPCS.has(m[1]) || PUBLIC_RESOLVE_RPCS.has(m[1]),
        `${file} : RPC non classée ${m[1]}`,
      ).toBe(true);
  }
});

it("chaque écriture est précédée d'une garde d'écriture dans la même fonction", () => {
  const unguarded: string[] = [];
  let writes = 0;
  for (const file of sources(resolve("src"))) {
    if (file.endsWith("identity.ts")) continue; // clé service du pont, hors requêtes utilisateur
    for (const unit of units(readFileSync(file, "utf8"))) {
      const sites = [
        ...[...unit.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].filter((m) => WRITE_RPCS.has(m[1])).map((m) => ({ at: m.index!, what: m[1] })),
        ...[...unit.matchAll(new RegExp(DIRECT_WRITE, "g"))].map((m) => ({ at: m.index!, what: m[0] })),
      ].filter(({ what }) => !/^\.update\(\s*[a-z]/.test(what)); // autosave client (pas de réseau Supabase)
      for (const site of sites) {
        writes++;
        if (!GUARD.test(unit.slice(0, site.at))) unguarded.push(`${file.replace(resolve("src"), "src")} : ${site.what}`);
      }
    }
  }
  expect(unguarded).toEqual([]);
  expect(writes).toBeGreaterThanOrEqual(WRITE_RPCS.size);
});

it("les RPC système ne sont appelées que par les modules serveur à clé service", () => {
  for (const file of sources(resolve("src"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/\.rpc\(\s*"([a-z_]+)"/g))
      if (SYSTEM_RPCS.has(m[1]))
        expect(/media-service\.ts$|erasure-runner\.ts$|rgpd-export-service\.ts$/.test(file), `${file} : RPC système ${m[1]} hors module serveur`).toBe(true);
  }
});

it("les résolutions publiques et révocations post-H restent dans leurs modules serveur", () => {
  for (const file of sources(resolve("src"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/\.rpc\(\s*"([a-z_]+)"/g)) {
      if (PUBLIC_RESOLVE_RPCS.has(m[1]) || REVOCATION_RPCS.has(m[1]))
        expect(/lib\/(?:shares|invitations)\.ts$/.test(file), `${file} : ${m[1]} hors module serveur`).toBe(true);
    }
  }
});
