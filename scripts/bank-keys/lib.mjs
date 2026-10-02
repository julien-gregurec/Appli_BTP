// ELSATIA — Outil opérateur des clés bancaires : adaptateurs (base, cryptographie).
// Rapport : docs/qualification/ELSATIA_BANKING_ENCRYPTION_KEY_ROTATION_V1.md.
//
// Aucune fonction de ce fichier n'affiche ni ne journalise une clé, un chiffré, un clair ou
// un IBAN. Les chiffrés transitent uniquement entre la base et le moteur (mémoire).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ID_CLE = /^k[1-9][0-9]{0,5}$/;
const FORMAT = /^v[12]$/;

/** Charge le trousseau et le moteur (TypeScript exécuté par Node en « strip types »). */
export async function chargerModules() {
  const trousseau = await import(pathToFileURL(path.join(RACINE, "src/lib/banking-keyring.ts")).href);
  const rotation = await import(pathToFileURL(path.join(RACINE, "src/lib/banking-rotation.ts")).href);
  const outils = {
    lireEntete: trousseau.lireEnteteChiffre,
    dechiffrer: trousseau.dechiffrerAvecTrousseau,
    chiffrer: trousseau.chiffrerAvecTrousseau,
    indexAveugle: trousseau.indexAveugleIban,
    empreinteHistorique: (iban) => createHash("sha256").update(iban).digest("hex"),
    empreinteControle: trousseau.empreinteControleCle,
  };
  return { trousseau, rotation, outils };
}

function exigerId(id) {
  if (!ID_CLE.test(String(id))) throw new Error("Identifiant de clé invalide");
  return id;
}
function exigerFormat(f) {
  if (!FORMAT.test(String(f))) throw new Error("Format invalide");
  return f;
}
function litteral(texte) {
  // Valeurs internes (identifiants validés, JSON base64url/uuid) : jamais de « $ ».
  if (String(texte).includes("$")) throw new Error("Valeur non sûre pour psql");
  return `$v$${texte}$v$`;
}

/**
 * Magasin PostgreSQL local via psql (harnais de qualification, restauration DR locale).
 * Les RPC sont appelées sous `set role service_role`, comme depuis PostgREST.
 */
export function magasinPsql({ db, psql = "psql", role = "service_role" }) {
  if (!db) throw new Error("Base psql absente");
  const executer = (sql) => {
    const r = spawnSync(psql, ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db], {
      input: `set role ${role};\n${sql}\n`,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    if (r.status !== 0) {
      // Message d'erreur PostgreSQL seul (jamais l'entrée, qui peut contenir des chiffrés).
      const ligne = (r.stderr || "").split("\n").find((l) => /ERROR|ERREUR/.test(l)) ?? "échec psql";
      throw Object.assign(new Error(ligne.replace(/^.*?(ERROR|ERREUR):\s*/, "")), { code: "BASE" });
    }
    // Une seule requête produit une sortie (json_agg peut s'étendre sur plusieurs lignes).
    const texte = r.stdout.trim();
    return texte ? JSON.parse(texte) : null;
  };
  return {
    async etat() {
      return executer("select public.cles_bancaires_etat();");
    },
    async lister(cible, format, apres, limite) {
      return executer(`select coalesce(json_agg(t), '[]') from public.chiffres_bancaires_a_rechiffrer(${litteral(exigerId(cible))}, ${litteral(exigerFormat(format))}, ${apres === null ? "null" : litteral(apres)}, ${Number(limite) | 0}) t;`);
    },
    async parcourir(apres, limite) {
      return executer(`select coalesce(json_agg(t), '[]') from public.chiffres_bancaires_parcourir(${apres === null ? "null" : litteral(apres)}, ${Number(limite) | 0}) t;`);
    },
    async appliquer(cible, format, lot) {
      return executer(`select public.chiffres_bancaires_rechiffrer_lot(${litteral(exigerId(cible))}, ${litteral(exigerFormat(format))}, ${litteral(JSON.stringify(lot))}::jsonb);`);
    },
    async rpc(nom, args) {
      const liste = Object.values(args).map((v) => (v === null ? "null" : litteral(v))).join(", ");
      if (!/^cles_bancaires_[a-z_]+$/.test(nom)) throw new Error("RPC inconnue");
      return executer(`select to_json(public.${nom}(${liste}));`);
    },
  };
}

/** Magasin Supabase (PostgREST, clé service_role) : Preview / Production. */
export function magasinSupabase(client) {
  const appel = async (nom, args) => {
    const { data, error } = await client.rpc(nom, args);
    if (error) throw Object.assign(new Error(error.message), { code: "BASE" });
    return data;
  };
  return {
    etat: () => appel("cles_bancaires_etat", {}),
    lister: (cible, format, apres, limite) => appel("chiffres_bancaires_a_rechiffrer", { p_cle_cible: exigerId(cible), p_format_cible: exigerFormat(format), p_apres: apres, p_limite: limite }),
    parcourir: (apres, limite) => appel("chiffres_bancaires_parcourir", { p_apres: apres, p_limite: limite }),
    appliquer: (cible, format, lot) => appel("chiffres_bancaires_rechiffrer_lot", { p_cle_cible: exigerId(cible), p_format_cible: exigerFormat(format), p_lot: lot }),
    rpc: (nom, args) => appel(nom, args),
  };
}

/** Résumé publiable d'un rapport : jamais de chiffré ni de clair (seulement ids et compteurs). */
export function resumer(objet) {
  return JSON.parse(JSON.stringify(objet, (cle, valeur) => (["chiffre", "ancien", "nouveau", "iban_hash"].includes(cle) ? undefined : valeur)));
}
