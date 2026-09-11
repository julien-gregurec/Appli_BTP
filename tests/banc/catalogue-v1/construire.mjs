// Construit le banc de recette de la bibliothèque d'articles (GP V1, lot B) : les VRAIS composants
// clients, empaquetés seuls, avec des données fictives, et le CSS compilé par la configuration Tailwind
// du projet. Aucune base, aucun serveur Next. Même méthode que tests/banc/editeur-v2.
//
//   node tests/banc/catalogue-v1/construire.mjs <dossier-de-sortie>
//
// La sortie (index.html, banc.js, banc.css) n'est jamais versionnée.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, "../../..");
const sortie = path.resolve(process.argv[2] ?? path.join(ici, "dist"));
await mkdir(sortie, { recursive: true });

await build({
  input: path.join(ici, "entree.tsx"),
  platform: "browser",
  resolve: { alias: { "@": path.join(racine, "src") } },
  transform: {
    jsx: { runtime: "automatic" },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  },
  output: { file: path.join(sortie, "banc.js"), format: "iife", minify: false },
});

const cssSource = await readFile(path.join(racine, "src/app/globals.css"), "utf8");
const css = await postcss([tailwind({ base: racine })]).process(cssSource, { from: path.join(racine, "src/app/globals.css") });
await writeFile(path.join(sortie, "banc.css"), css.css);

await writeFile(
  path.join(sortie, "index.html"),
  `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Banc de recette — bibliothèque d'articles V1</title>
<link rel="stylesheet" href="banc.css">
</head>
<body class="bg-white text-neutral-900">
<div id="racine"></div>
<script src="banc.js"></script>
</body>
</html>
`,
);
console.log(`Banc construit dans ${sortie}`);
