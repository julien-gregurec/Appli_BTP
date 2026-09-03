// ELSATIA Tools utilise du CSS standard — aucun Tailwind, aucun plugin PostCSS.
// Ce fichier isole la configuration PostCSS de l'app pour un déploiement Web
// autonome (Root Directory = apps/tools) : sans lui, Next remonte jusqu'à la
// configuration racine du monorepo (@tailwindcss/postcss) qui n'est pas installée
// dans les dépendances de apps/tools. Même correctif que apps/colors/postcss.config.mjs.
// Si Tailwind ou un plugin est adopté, le déclarer ici ET dans apps/tools/package.json.
const config = {
  plugins: {},
};

export default config;
