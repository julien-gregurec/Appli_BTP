#!/usr/bin/env node
// ELSATIA — Outil opérateur des clés du chiffrement bancaire (IBAN / BIC).
// Rapport : docs/qualification/ELSATIA_BANKING_ENCRYPTION_KEY_ROTATION_V1.md (§5, §9, §10).
//
//   npm run bank-keys -- status                         registre, inventaire, contrôle du trousseau
//   npm run bank-keys -- fingerprint --key-id k2        empreinte de contrôle (KCV) d'une clé de l'env
//   npm run bank-keys -- register --key-id k2           enregistre (ou atteste k1) l'empreinte en base
//   npm run bank-keys -- activate --key-id k2 --yes     active k2 (l'ancienne passe en déchiffrement)
//   npm run bank-keys -- rotate [--batch 200] [--max-batches N]
//                                                       rechiffre vers la clé active ; reprenable
//   npm run bank-keys -- verify [--strict]              déchiffre TOUT sans écrire (DR, restauration)
//   npm run bank-keys -- compromise --key-id k1 --reason "…" --yes
//   npm run bank-keys -- retire --key-id k1 --yes       retrait définitif (0 donnée restante exigée)
//
// Cible base : --psql-db <base locale> (harnais, DR local) OU NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY (Preview / Production). Trousseau : variables BANK_DATA_ENCRYPTION_*
// de l'environnement du processus (jamais d'argument de ligne de commande, jamais affichées).
//
// Sortie : une ligne JSON par événement, sans clé, chiffré, clair ni IBAN.
// Codes : 0 succès ; 1 échec / incomplet ; 2 usage ; 3 refus (contrôle du trousseau).
import { chargerModules, magasinPsql, magasinSupabase, resumer } from "./lib.mjs";

const args = process.argv.slice(2);
const commande = args[0];
const opt = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
const drapeau = (nom) => args.includes(nom);
const sortie = (objet) => console.log(JSON.stringify(resumer(objet)));
const arreter = (code, objet) => { sortie(objet); process.exit(code); };

const COMMANDES = ["status", "fingerprint", "register", "activate", "rotate", "verify", "compromise", "retire"];
if (!COMMANDES.includes(commande)) arreter(2, { erreur: "usage", commandes: COMMANDES });

const { trousseau: T, rotation: R, outils } = await chargerModules();

let trousseau;
try {
  trousseau = T.lireTrousseauBancaire(process.env);
} catch (cause) {
  arreter(3, { erreur: "trousseau", code: cause.code ?? "ECHEC", message: cause.message });
}

const cleId = opt("--key-id");
if (["fingerprint", "register", "activate", "compromise", "retire"].includes(commande) && !/^k[1-9][0-9]{0,5}$/.test(cleId ?? "")) {
  arreter(2, { erreur: "--key-id kN obligatoire" });
}
if (["activate", "compromise", "retire"].includes(commande) && !drapeau("--yes")) {
  arreter(2, { erreur: "opération de registre : confirmer avec --yes" });
}

if (commande === "fingerprint") {
  if (!trousseau.cle(cleId)) arreter(3, { erreur: `clé ${cleId} absente du trousseau` });
  arreter(0, { cle_id: cleId, empreinte_controle: outils.empreinteControle(trousseau, cleId) });
}

async function magasin() {
  const db = opt("--psql-db");
  if (db) return magasinPsql({ db });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) arreter(2, { erreur: "--psql-db ou NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis" });
  const { createClient } = await import("@supabase/supabase-js");
  return magasinSupabase(createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } }));
}

const m = await magasin();
try {
  if (commande === "status") {
    const etat = await m.etat();
    const controle = R.controlerTrousseau(etat, trousseau, outils, { strict: drapeau("--strict") });
    arreter(controle.ok ? 0 : 3, {
      environnement: { active: trousseau.active, format_ecriture: trousseau.formatEcriture, cles: trousseau.identifiants },
      registre: etat.cles.map((c) => ({ cle_id: c.cle_id, statut: c.statut, attestee: Boolean(c.empreinte_controle) })),
      inventaire: etat.inventaire,
      controle,
    });
  }

  if (commande === "register") {
    if (!trousseau.cle(cleId)) arreter(3, { erreur: `clé ${cleId} absente du trousseau` });
    const resultat = await m.rpc("cles_bancaires_enregistrer", { p_cle_id: cleId, p_empreinte: outils.empreinteControle(trousseau, cleId) });
    arreter(0, { cle_id: cleId, resultat });
  }

  if (commande === "activate") {
    // L'environnement doit déjà servir cette clé et la présenter à l'identique du registre.
    if (trousseau.active !== cleId) arreter(3, { erreur: `BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID doit valoir ${cleId} avant l'activation en base` });
    const etat = await m.etat();
    const enregistree = etat.cles.find((c) => c.cle_id === cleId);
    if (!enregistree?.empreinte_controle || enregistree.empreinte_controle !== outils.empreinteControle(trousseau, cleId)) {
      arreter(3, { erreur: `clé ${cleId} non enregistrée ou empreinte différente` });
    }
    const resultat = await m.rpc("cles_bancaires_activer", { p_cle_id: cleId });
    arreter(0, { cle_id: cleId, resultat });
  }

  if (commande === "rotate") {
    const tailleLot = Number(opt("--batch") ?? 200);
    const maxLots = opt("--max-batches") === undefined ? undefined : Number(opt("--max-batches"));
    const rapport = await R.executerRechiffrement({ magasin: m, trousseau, outils, tailleLot, maxLots, surLot: (p) => sortie({ progression: p }) });
    arreter(rapport.statut === "termine" ? 0 : 1, { rapport });
  }

  if (commande === "verify") {
    const etat = await m.etat();
    const controle = R.controlerTrousseau(etat, trousseau, outils, { strict: drapeau("--strict") });
    const verification = await R.verifierDechiffrement({ magasin: m, trousseau, outils });
    const ok = controle.ok && verification.ok && (!drapeau("--strict") || verification.illisibles === 0);
    arreter(ok ? 0 : 3, { verdict: ok ? "RESTAURATION_DECHIFFRABLE" : "RESTAURATION_NON_DECHIFFRABLE", controle, verification });
  }

  if (commande === "compromise") {
    const motif = opt("--reason");
    if (!motif) arreter(2, { erreur: "--reason obligatoire" });
    const resultat = await m.rpc("cles_bancaires_compromettre", { p_cle_id: cleId, p_motif: motif });
    arreter(0, { cle_id: cleId, resultat });
  }

  if (commande === "retire") {
    const resultat = await m.rpc("cles_bancaires_retirer", { p_cle_id: cleId });
    arreter(0, { cle_id: cleId, resultat, rappel: `retirer ${cleId} de BANK_DATA_ENCRYPTION_KEYS (et BANK_DATA_ENCRYPTION_KEY si k1) puis redéployer` });
  }
} catch (cause) {
  arreter(cause.code === "TROUSSEAU_REFUSE" ? 3 : 1, { erreur: commande, code: cause.code ?? "ECHEC", message: cause.message });
}
