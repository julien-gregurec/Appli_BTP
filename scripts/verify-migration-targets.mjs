#!/usr/bin/env node
/**
 * ELSATIA — Séparation des cibles de migration : projet Supabase PARTAGÉ (GP, identité centrale)
 * vs projet Supabase DÉDIÉ Studio (décision B + I1).
 *
 *   supabase/migrations              → projet partagé  (supabase db push depuis la racine)
 *   apps/studio/supabase/migrations  → projet Studio   (supabase db push --workdir apps/studio)
 *
 * Invariants (apps/studio/supabase/migration-targets.json) :
 *   T1  chaque migration Studio est classée une seule fois (copie gelée OU dédiée), et existe ;
 *   T2  une copie gelée est identique octet pour octet à sa source de la racine ;
 *   T3  la racine ne contient AUCUNE autre migration Studio que les copies gelées (rien de nouveau) ;
 *   T4  une migration dédiée n'existe PAS à la racine ;
 *   T5  aucune migration de la racine ne touche le schéma dédié `studio_identity` ;
 *   T6  aucune migration Studio ne touche un objet du projet partagé (identité centrale, GP) ;
 *   T7  les deux config.toml portent des project_id distincts ;
 *   T8  noms `14chiffres_nom.sql`, horodatages uniques côté Studio.
 *
 * Sortie : 0 si conforme, 1 sinon. Ne se connecte à rien.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STUDIO_NAME = /_studio_/;
const SHARED_ONLY_MARKERS = [
  /\belsatia_identity_/i,
  /\butilisateurs_entreprises\b/i,
  /\bapplications_elsatia\b/i,
  /\bpublic\.entreprises\b/i,
];
const DEDICATED_ONLY_MARKER = /\bstudio_identity\b/i;

function sqlFiles(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".sql")).sort() : [];
}
function projectId(toml) {
  return /^\s*project_id\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? null;
}

export function checkMigrationTargets(root) {
  const errors = [];
  const sharedDir = join(root, "supabase/migrations");
  const studioDir = join(root, "apps/studio/supabase/migrations");
  const targets = JSON.parse(readFileSync(join(root, "apps/studio/supabase/migration-targets.json"), "utf8"));
  const frozen = targets.frozen_shared_copies.files;
  const dedicated = targets.dedicated_only.files;
  const shared = sqlFiles(sharedDir);
  const studio = sqlFiles(studioDir);

  const listed = [...frozen, ...dedicated];
  for (const name of listed)
    if (listed.indexOf(name) !== listed.lastIndexOf(name)) errors.push(`T1 ${name} : classé deux fois`);
  for (const name of studio)
    if (!listed.includes(name)) errors.push(`T1 ${name} : migration Studio non classée (copie gelée ou dédiée ?)`);
  for (const name of listed)
    if (!studio.includes(name)) errors.push(`T1 ${name} : classée mais absente de apps/studio/supabase/migrations`);

  for (const name of frozen) {
    if (!shared.includes(name)) {
      errors.push(`T2 ${name} : copie gelée sans source à la racine`);
      continue;
    }
    if (studio.includes(name) && !readFileSync(join(sharedDir, name)).equals(readFileSync(join(studioDir, name))))
      errors.push(`T2 ${name} : diverge de supabase/migrations (les migrations Studio de la racine sont gelées)`);
  }

  for (const name of shared)
    if (STUDIO_NAME.test(name) && !frozen.includes(name))
      errors.push(`T3 ${name} : nouvelle migration Studio à la racine — elle partirait sur le projet PARTAGÉ ; la placer dans apps/studio/supabase/migrations`);

  for (const name of dedicated)
    if (shared.includes(name)) errors.push(`T4 ${name} : migration du projet dédié Studio présente dans supabase/migrations`);

  for (const name of shared)
    if (DEDICATED_ONLY_MARKER.test(readFileSync(join(sharedDir, name), "utf8")))
      errors.push(`T5 ${name} : référence au schéma dédié studio_identity dans le train du projet partagé`);

  for (const name of studio) {
    const sql = readFileSync(join(studioDir, name), "utf8");
    for (const marker of SHARED_ONLY_MARKERS)
      if (marker.test(sql)) errors.push(`T6 ${name} : objet du projet partagé (${marker.source}) dans une migration Studio`);
  }

  const sharedId = projectId(readFileSync(join(root, "supabase/config.toml"), "utf8"));
  const studioId = projectId(readFileSync(join(root, "apps/studio/supabase/config.toml"), "utf8"));
  if (!sharedId || !studioId || sharedId === studioId)
    errors.push(`T7 project_id identiques ou absents (racine=${sharedId}, studio=${studioId})`);

  const stamps = new Map();
  for (const name of studio) {
    const m = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(name);
    if (!m) errors.push(`T8 ${name} : nom attendu 14_chiffres_description.sql`);
    else if (stamps.has(m[1])) errors.push(`T8 ${name} : horodatage déjà utilisé par ${stamps.get(m[1])}`);
    else stamps.set(m[1], name);
  }

  return { errors, counts: { shared: shared.length, studio: studio.length, frozen: frozen.length, dedicated: dedicated.length } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { errors, counts } = checkMigrationTargets(resolve(import.meta.dirname, ".."));
  if (errors.length) {
    console.error(`Cibles de migration invalides (${errors.length}) :\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(
    `Cibles de migration OK : partagé ${counts.shared} · Studio dédié ${counts.studio} (${counts.frozen} copies gelées + ${counts.dedicated} dédiées).`,
  );
}
