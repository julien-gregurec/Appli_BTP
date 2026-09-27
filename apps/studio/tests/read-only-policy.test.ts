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
]);
const READ_RPCS = new Set([
  "studio_dashboard_stats", "studio_project_summaries", "studio_list_project_media", "studio_project_media_stats",
  "studio_get_timeline", "studio_list_analysis", "studio_my_role", "studio_identity_session_status",
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
      expect(WRITE_RPCS.has(m[1]) || READ_RPCS.has(m[1]), `${file} : RPC non classée ${m[1]}`).toBe(true);
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
