// ELSATIA — Pack opérateur V9 : contrôle de la clé IBAN k1 (Phase H).
//
// Ne lit JAMAIS une clé. Deux sources, toutes deux sans matériel secret :
//   1. l'inventaire d'environnement (env-scope.mjs) : présence / vacuité / scope des variables
//      BANK_DATA_ENCRYPTION_* ; seules ACTIVE_KEY_ID et WRITE_FORMAT (non secrètes) sont lues ;
//   2. facultatif, APRÈS migration 1112 : la sortie JSON de `npm run bank-keys -- status`
//      (identifiants de clés, statuts, booléen « attestée », contrôle du trousseau ; l'outil
//      ne produit jamais de clé ni d'empreinte en clair dans `registre`).
// Ne génère jamais de clé.

import { VERDICT } from "./constantes.mjs";

const ID = /^k[1-9][0-9]{0,5}$/;

/** Flux qui DOIVENT rester indisponibles tant que k1 manque (fail-closed du trousseau). */
export const FLUX_INDISPONIBLES_SANS_K1 = Object.freeze([
  "saisie et lecture des coordonnées bancaires (IBAN / BIC) des salariés et fournisseurs",
  "préparation et transmission des lots de virement (Powens) : l'IBAN est déchiffré à la transmission",
  "rotation / vérification des clés (`npm run bank-keys`) et contrôle DR « RESTAURATION_DECHIFFRABLE »",
]);

/**
 * @param {Map} inv   inventaire (lireInventaire)
 * @param {object|null} statut  JSON de `bank-keys status` (facultatif)
 */
export function evaluerIban(inv, statut = null) {
  const constats = [];
  const c = (ok, code, message, bloquant = true) => constats.push({ ok, code, message, bloquant });
  const k1 = inv.get("BANK_DATA_ENCRYPTION_KEY");
  const k1Preview = Boolean(k1?.scopes.has("preview"));
  const k1Vide = k1Preview && k1.valeurConnue && k1.vide;
  c(k1Preview && !k1Vide, "IBAN-K1-PRESENTE", !k1 ? "BANK_DATA_ENCRYPTION_KEY absente de l'inventaire" : !k1Preview ? "BANK_DATA_ENCRYPTION_KEY absente du scope Preview (WRONG_SCOPE)" : k1Vide ? "BANK_DATA_ENCRYPTION_KEY vide" : "BANK_DATA_ENCRYPTION_KEY présente en Preview (valeur non lue)");

  const trousseau = inv.get("BANK_DATA_ENCRYPTION_KEYS");
  const active = inv.get("BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID");
  const format = inv.get("BANK_DATA_ENCRYPTION_WRITE_FORMAT");
  if (trousseau?.scopes.has("preview")) {
    c(Boolean(active?.scopes.has("preview")), "IBAN-ACTIVE-ID", "BANK_DATA_ENCRYPTION_KEYS posée : BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID doit l'être aussi");
  }
  if (active?.scopes.has("preview") && active.valeurDrapeau !== undefined) {
    c(ID.test(active.valeurDrapeau), "IBAN-ACTIVE-FORME", "BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID de forme kN");
    if (!trousseau?.scopes.has("preview")) c(active.valeurDrapeau === "k1", "IBAN-ACTIVE-K1", "sans trousseau, la seule clé active possible est k1");
  }
  if (format?.scopes.has("preview") && format.valeurDrapeau !== undefined) {
    c(["v1", "v2"].includes(format.valeurDrapeau), "IBAN-FORMAT", "BANK_DATA_ENCRYPTION_WRITE_FORMAT ∈ {v1, v2}");
    if (format.valeurDrapeau === "v1" && active?.valeurDrapeau && active.valeurDrapeau !== "k1") c(false, "IBAN-FORMAT-ACTIVE", "format v1 exige la clé active k1");
  }

  // Registre en base (après 1112) : k1 enregistrée, attestée, active (ou une active connue de l'env).
  let attestation = "NON_VERIFIEE";
  if (statut) {
    const registre = Array.isArray(statut.registre) ? statut.registre : [];
    const r1 = registre.find((x) => x.cle_id === "k1");
    c(Boolean(r1), "IBAN-REGISTRE-K1", r1 ? `k1 au registre (statut ${r1.statut})` : "k1 absente du registre (migration 1112 non appliquée ?)");
    const actives = registre.filter((x) => x.statut === "active").map((x) => x.cle_id);
    c(actives.length === 1, "IBAN-REGISTRE-ACTIVE", `${actives.length} clé active au registre (${actives.join(", ") || "aucune"})`);
    const envCles = statut.environnement?.cles ?? [];
    if (actives.length === 1) c(envCles.includes(actives[0]), "IBAN-REGISTRE-ENV", `la clé active du registre (${actives[0]}) est servie par l'environnement`);
    if (r1) {
      attestation = r1.attestee ? "ATTESTEE" : "NON_ATTESTEE";
      c(r1.attestee === true, "IBAN-K1-ATTESTEE", r1.attestee ? "k1 attestée (empreinte de contrôle enregistrée)" : "k1 NON attestée : exécuter `npm run bank-keys -- register --key-id k1` dans l'environnement Preview", false);
    }
    if (statut.controle && typeof statut.controle.ok === "boolean") c(statut.controle.ok, "IBAN-CONTROLE", statut.controle.ok ? "contrôle du trousseau OK" : "contrôle du trousseau en échec (bank-keys status)");
    if (statut.erreur) c(false, "IBAN-OUTIL", `bank-keys a refusé : ${String(statut.code ?? statut.erreur)}`);
  }

  const bloquants = constats.filter((x) => !x.ok && x.bloquant);
  const k1Manquante = constats.some((x) => !x.ok && ["IBAN-K1-PRESENTE", "IBAN-REGISTRE-K1"].includes(x.code));
  const verdict = bloquants.length ? VERDICT.IBAN_KO : VERDICT.IBAN_OK;
  return {
    verdict,
    blocker: k1Manquante ? VERDICT.IBAN_BLOQUANT : null,
    attestation,
    constats,
    fluxIndisponibles: bloquants.length ? FLUX_INDISPONIBLES_SANS_K1 : [],
  };
}
