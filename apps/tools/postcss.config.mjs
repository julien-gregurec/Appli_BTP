// Tools currently uses standard CSS / CSS Modules — no Tailwind, no PostCSS plugins.
// Without this file, Next's postcss config lookup (find-up) walks up past
// apps/tools and resolves the monorepo root's postcss.config.mjs instead
// (which belongs to Gestion Pro and requires @tailwindcss/postcss, a
// dependency apps/tools does not have — its own package-lock.json is
// isolated from root's). This file stops that lookup here. Proven by
// reproducing the leak with NEXT_PUBLIC_TOOLS_ENV=local (docs/qualification/
// ELSATIA_TOOLS_RESERVES_POSTCSS_ISOLATION_V1.md).
// If Tailwind (or any other plugin) is adopted, declare it explicitly here
// AND in apps/tools/package.json. Same pattern as apps/colors and apps/studio.
const config = {
  plugins: {},
};

export default config;
