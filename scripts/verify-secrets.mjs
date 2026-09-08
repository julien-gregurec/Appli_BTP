import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const fichiers = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\u0000")
  .filter(Boolean)
  .filter((nom) => !nom.endsWith("package-lock.json"))
  .filter((nom) => !/\.(png|jpe?g|gif|webp|ico|pdf|mp4|wav|woff2?)$/i.test(nom));

const signatures = [
  { nom: "clé privée", motif: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { nom: "clé Stripe secrète", motif: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { nom: "secret webhook Stripe", motif: /\bwhsec_[A-Za-z0-9]{20,}\b/ },
  { nom: "clé OpenAI", motif: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { nom: "jeton GitHub", motif: /\bgh[opusr]_[A-Za-z0-9]{30,}\b/ },
  { nom: "JWT Supabase", motif: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  {
    nom: "secret déclaré NEXT_PUBLIC",
    motif: /\bNEXT_PUBLIC_(?:[A-Z0-9_]*(?:SECRET|PRIVATE|SERVICE_ROLE)[A-Z0-9_]*|OPENAI_API_KEY|STRIPE_SECRET_KEY)\s*=/,
  },
];

// EXCEPTIONS NOMMÉES, une par une, jamais un motif large.
//
// Un fichier qui TESTE un détecteur de secrets contient forcément des chaînes qui
// ressemblent à des secrets : c'est son objet même. Les exclure par chemin explicite
// vaut mieux que d'affaiblir les signatures ci-dessus, ce qui rendrait le scanner
// aveugle partout. Toute entrée ajoutée ici doit être justifiée en clair.
const EXCEPTIONS = new Map([
  [
    "apps/colors/src/lib/public-env-guard.test.ts",
    "Suite de tests du garde-fou d'environnement public de Colors : elle vérifie que "
      + "`ressembleAUnSecret()` reconnaît une clé privée et un JWT de service. Les valeurs "
      + "y sont factices (« AAAA », « signature ») et n'ouvrent aucun accès.",
  ],
]);

const alertes = [];
for (const fichier of fichiers) {
  if (EXCEPTIONS.has(fichier)) continue;
  let contenu;
  try {
    contenu = readFileSync(fichier, "utf8");
  } catch {
    continue;
  }
  for (const signature of signatures) {
    if (signature.motif.test(contenu)) alertes.push(`${fichier}: ${signature.nom} potentielle`);
  }
}

if (alertes.length) {
  console.error(`Secrets potentiels détectés (${alertes.length}) :\n- ${alertes.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `${fichiers.length} fichiers suivis contrôlés, aucun secret reconnu`
    + (EXCEPTIONS.size ? ` (${EXCEPTIONS.size} exception${EXCEPTIONS.size > 1 ? "s" : ""} nommée${EXCEPTIONS.size > 1 ? "s" : ""}).` : "."),
);
