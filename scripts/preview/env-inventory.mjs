#!/usr/bin/env node
/**
 * ELSATIA — Pack Preview : inventaire EXACT des variables par application, dérivé du manifeste
 * canonique (config/env-manifest.json). Hors ligne, lecture seule, AUCUNE valeur (le manifeste
 * n'en contient pas).
 *
 * Classes (cible preview) :
 *   REQUIRED     `required: true`, ou drapeau que le manifeste exige défini en preview
 *   CONDITIONAL  facultative, mais `required_when` (requise dès qu'une fonction est activée)
 *   OPTIONAL     le reste
 * Colonnes : public/serveur, secret, build/runtime, preview-only (absente de la cible production),
 * valeur imposée en preview (drapeau `expected.preview`, indicateurs d'environnement, mode Stripe),
 * valeurs admises (`allowed_values`),
 * interdite en preview (`forbidden_in`).
 *
 * Usage :
 *   node scripts/preview/env-inventory.mjs                     # Markdown, toutes les apps déployables
 *   node scripts/preview/env-inventory.mjs --app colors --json
 *   node scripts/preview/env-inventory.mjs --summary           # comptes par app seulement
 */
import { resolve } from "node:path";
import { loadJson, MANIFEST_PATH } from "../lib/env-manifest-core.mjs";
import { applicableVariables } from "../lib/env-manifest-preflight.mjs";
import { estPointEntree, lireOptions } from "./lib/preview-guard.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
export const APPS_PREVIEW = ["gestion_pro", "colors", "tools", "reserves", "studio", "studio_worker"];

export function classer(v, target = "preview") {
  if (v.required || v.flag?.must_be_defined_in?.includes(target)) return "REQUIRED";
  if (v.required_when) return "CONDITIONAL";
  return "OPTIONAL";
}

export function valeurImposee(v, target = "preview") {
  const attendu = v.flag?.expected?.[target];
  if (attendu === "true" || attendu === "false") return attendu;
  if (v.name === "ELSATIA_APPLICATION_ENV" || v.name === "NEXT_PUBLIC_TOOLS_ENV") return target;
  if (v.name === "STRIPE_WEBHOOK_EXPECTED_MODE") return "test";
  return "";
}

export function inventaire(manifest, app, target = "preview") {
  const ordre = { REQUIRED: 0, CONDITIONAL: 1, OPTIONAL: 2 };
  return applicableVariables(manifest, [app], target)
    .map((v) => ({
      name: v.name,
      classe: classer(v, target),
      public: v.visibility === "public",
      secret: v.secret,
      build: v.build_time,
      runtime: v.runtime,
      previewOnly: !v.environments.includes("production"),
      imposee: valeurImposee(v, target),
      interdite: Boolean(v.forbidden_in?.includes(target)),
      admises: v.allowed_values ?? [],
      condition: v.required_when ?? "",
      categorie: v.category,
      deprecated: v.deprecated,
    }))
    .sort((a, b) => ordre[a.classe] - ordre[b.classe] || a.name.localeCompare(b.name));
}

export function resume(lignes) {
  const c = (f) => lignes.filter(f).length;
  return {
    total: lignes.length,
    required: c((l) => l.classe === "REQUIRED"),
    conditional: c((l) => l.classe === "CONDITIONAL"),
    optional: c((l) => l.classe === "OPTIONAL"),
    previewOnly: c((l) => l.previewOnly),
    public: c((l) => l.public),
    secret: c((l) => l.secret),
    buildTime: c((l) => l.build),
  };
}

function markdown(manifest, apps) {
  const out = [
    "# ELSATIA — Inventaire des variables Preview (généré)",
    "",
    "> Généré par `npm run preview:env-inventory` depuis `config/env-manifest.json` — ne pas éditer à la main.",
    "> Aucune valeur. Classes : REQUIRED / CONDITIONAL / OPTIONAL (cible `preview`). Voir",
    "> `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md` §2.",
    "",
  ];
  out.push("| App | Total | Required | Conditional | Optional | Preview-only | Public | Secret | Build-time |");
  out.push("|---|---|---|---|---|---|---|---|---|");
  for (const app of apps) {
    const r = resume(inventaire(manifest, app));
    out.push(`| ${app} | ${r.total} | ${r.required} | ${r.conditional} | ${r.optional} | ${r.previewOnly} | ${r.public} | ${r.secret} | ${r.buildTime} |`);
  }
  for (const app of apps) {
    out.push("", `### ${app} — ${manifest.applications[app].label}`, "");
    out.push("| Variable | Classe | Public | Secret | Build | Preview-only | Valeur imposée preview | Valeurs admises | Interdite preview | Condition |");
    out.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const l of inventaire(manifest, app)) {
      const oui = (b) => (b ? "oui" : "");
      out.push(`| \`${l.name}\`${l.deprecated ? " *(dépréciée)*" : ""} | ${l.classe} | ${oui(l.public)} | ${oui(l.secret)} | ${oui(l.build)} | ${oui(l.previewOnly)} | ${l.imposee ? `\`${l.imposee}\`` : ""} | ${l.admises.join(", ")} | ${l.interdite ? "**oui**" : ""} | ${l.condition.replace(/\|/g, "/")} |`);
    }
  }
  return out.join("\n");
}

function main() {
  const o = lireOptions(process.argv.slice(2));
  const manifest = loadJson(ROOT, MANIFEST_PATH);
  const apps = typeof o.app === "string" ? o.app.split(",").map((s) => s.trim()) : APPS_PREVIEW;
  if (o.json) {
    console.log(JSON.stringify(Object.fromEntries(apps.map((a) => [a, { resume: resume(inventaire(manifest, a)), variables: inventaire(manifest, a) }])), null, 2));
  } else if (o.summary) {
    for (const a of apps) console.log(a.padEnd(14), JSON.stringify(resume(inventaire(manifest, a))));
  } else {
    console.log(markdown(manifest, apps));
  }
}

if (estPointEntree(import.meta.url)) main();
