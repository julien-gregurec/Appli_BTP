// Reserves currently uses standard CSS — no Tailwind, no PostCSS plugins.
// Without this file, Next's postcss config lookup (find-up, used by both the
// webpack and Turbopack pipelines) walks up past apps/reserves and resolves
// the monorepo root's postcss.config.mjs instead (which belongs to Gestion
// Pro and requires @tailwindcss/postcss, a dependency apps/reserves does not
// have — its own package-lock.json is isolated from root's). This file stops
// that lookup here. Proven by reproducing the leak with
// ELSATIA_APPLICATION_ENV=local (docs/qualification/
// ELSATIA_TOOLS_RESERVES_POSTCSS_ISOLATION_V1.md).
// If Tailwind (or any other plugin) is adopted, declare it explicitly here
// AND in apps/reserves/package.json. Same pattern as apps/colors and apps/studio.
const config = {
  plugins: {},
};

export default config;
