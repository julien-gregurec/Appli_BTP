/**
 * Amorçage des OBJETS de la recette V4 (plan + photos) dans le stockage local.
 *
 * Les lignes de la base sont posées par `prepare-reserves-v4-listes.sql` ; ce script
 * dépose les fichiers correspondants. Sans eux, le document détaillé référencerait des
 * images inexistantes et l'option « avec / sans photos » ne serait pas éprouvée.
 *
 * Les chemins suivent la convention imposée par les politiques de stockage :
 *   photos : {entreprise}/{chantier}/{réserve}/{fichier}
 *   plans  : {entreprise}/{chantier}/{plan}/{fichier}
 * Un chemin qui ne décrit pas ce triplet est refusé à la LECTURE : l'URL signée n'est
 * alors jamais émise et l'image manque silencieusement dans le document.
 *
 * Strictement local : le script refuse toute URL qui n'est pas 127.0.0.1.
 */
import sharp from "sharp";

const URL_SUPABASE = process.env.E2E_SUPABASE_URL;
const CLE_SERVICE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SUPABASE?.startsWith("http://127.0.0.1") || !CLE_SERVICE) {
  throw new Error(
    "Amorçage strictement local : définir E2E_SUPABASE_URL (127.0.0.1) et E2E_SUPABASE_SERVICE_ROLE_KEY",
  );
}

const ENTREPRISE = "a0000000-0000-0000-0000-000000000001";
const CHANTIER = "e0000000-0000-0000-0000-000000000001";
const PLAN = "e3000000-0000-0000-0000-000000000002";

async function deposer(bucket, chemin, corps, type) {
  const reponse = await fetch(
    `${URL_SUPABASE}/storage/v1/object/${bucket}/${chemin}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLE_SERVICE}`,
        "Content-Type": type,
        "x-upsert": "true",
      },
      body: corps,
    },
  );
  if (!reponse.ok) {
    throw new Error(`Dépôt refusé (${reponse.status}) sur ${bucket}/${chemin} : ${await reponse.text()}`);
  }
  console.log(`  ✓ ${bucket}/${chemin} (${corps.length} o)`);
}

/** Faux plan d'étage : lisible, léger, et sans rapport avec un chantier réel. */
async function planEtage() {
  const L = 1200, H = 850;
  const lignes = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
    <rect width="${L}" height="${H}" fill="#ffffff"/>
    <g stroke="#c9d2dd" stroke-width="1">
      ${lignes(24, (i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="${H}"/>`)}
      ${lignes(17, (i) => `<line x1="0" y1="${i * 50}" x2="${L}" y2="${i * 50}"/>`)}
    </g>
    <g stroke="#1a1a1a" stroke-width="6" fill="none">
      <rect x="60" y="60" width="1080" height="730"/>
      <line x1="60" y1="420" x2="1140" y2="420"/>
      <line x1="480" y1="60" x2="480" y2="420"/>
      <line x1="820" y1="420" x2="820" y2="790"/>
    </g>
    <g font-family="Helvetica,Arial" font-size="30" fill="#333">
      <text x="200" y="250">Salle 101</text><text x="700" y="250">Salle 104</text>
      <text x="250" y="620">Couloir Nord</text><text x="900" y="620">Aile Est</text>
    </g>
    <text x="60" y="835" font-family="Helvetica,Arial" font-size="24" fill="#666">
      RECETTE — Plan R+1 (document de test)</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Photo de chantier factice, compressée comme le fait la capture terrain. */
async function photo(libelle, fond) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200">
    <text x="80" y="620" font-family="Helvetica,Arial" font-size="90" fill="#ffffff">${libelle}</text>
  </svg>`;
  return sharp({ create: { width: 1600, height: 1200, channels: 3, background: fond } })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

console.log("Amorçage des objets de recette V4 :");
await deposer("reserves-plans", `${ENTREPRISE}/${CHANTIER}/${PLAN}/plan-r1.png`,
  await planEtage(), "image/png");

const PHOTOS = [
  ["e5000000-0000-0000-0000-000000000101", "photo-constat.jpg", "Constat — RECETTE", "#8a6b4a"],
  ["e5000000-0000-0000-0000-000000000103", "photo-travaux.jpg", "Travaux — RECETTE", "#4a6b8a"],
  ["e5000000-0000-0000-0000-000000000104", "photo-levee.jpg", "Levée — RECETTE", "#4a8a5f"],
];
for (const [reserve, fichier, libelle, fond] of PHOTOS) {
  await deposer("reserves-photos", `${ENTREPRISE}/${CHANTIER}/${reserve}/${fichier}`,
    await photo(libelle, fond), "image/jpeg");
}
console.log("Amorçage terminé.");
