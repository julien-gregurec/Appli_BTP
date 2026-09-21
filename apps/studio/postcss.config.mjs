// Studio currently uses standard CSS — no Tailwind, no PostCSS plugins.
// Without this file, Next's postcss config lookup (find-up) walks up past
// apps/studio and resolves the monorepo root's postcss.config.mjs instead
// (which belongs to Gestion Pro and requires @tailwindcss/postcss, a
// dependency apps/studio does not have — its own package-lock.json is
// isolated from root's). This file stops that lookup here.
// If Tailwind (or any other plugin) is adopted, declare it explicitly here
// AND in apps/studio/package.json. Same pattern as apps/colors/postcss.config.mjs.
const config = {
  plugins: {},
};

export default config;
