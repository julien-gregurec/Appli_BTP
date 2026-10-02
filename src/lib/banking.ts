import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { chiffrerAvecTrousseau, dechiffrerAvecTrousseau, indexAveugleIban, lireTrousseauBancaire } from "@/lib/banking-keyring";

export type TypeOrdreBancaire = "salaire" | "note_frais" | "fournisseur";

export type OrdrePrestataireBancaire = {
  id: string;
  type: TypeOrdreBancaire;
  montant: number;
  libelle: string;
  iban: string;
  titulaire: string;
  prenom?: string | null;
  nom?: string | null;
  siret?: string | null;
};

export type EntreprisePayeur = {
  nom: string;
  raisonSociale?: string | null;
  siret: string;
  formeJuridique: string;
};

const nettoyer = (valeur: string) => valeur.replace(/\s+/g, "").toUpperCase();

export function normaliserIban(valeur: string) {
  return nettoyer(valeur);
}

export function ibanEstValide(valeur: string) {
  const iban = normaliserIban(valeur);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearrange = iban.slice(4) + iban.slice(0, 4);
  let reste = 0;
  for (const caractere of rearrange) {
    const fragment = /[A-Z]/.test(caractere) ? String(caractere.charCodeAt(0) - 55) : caractere;
    for (const chiffre of fragment) reste = (reste * 10 + Number(chiffre)) % 97;
  }
  return reste === 1;
}

export function normaliserBic(valeur: string) {
  return nettoyer(valeur);
}

export function bicEstValide(valeur: string) {
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normaliserBic(valeur));
}

// Chiffrement IBAN / BIC : trousseau versionné (src/lib/banking-keyring.ts). Relu à chaque
// appel : une rotation de variables d'environnement prend effet sans état en mémoire.
export function chiffrerDonneeBancaire(valeur: string) {
  return chiffrerAvecTrousseau(lireTrousseauBancaire(), valeur);
}

export function dechiffrerDonneeBancaire(valeur: string) {
  return dechiffrerAvecTrousseau(lireTrousseauBancaire(), valeur);
}

/**
 * Empreinte de l'IBAN stockée en `iban_hash`. Format v2 : index aveugle HMAC sous la clé
 * active (la base en déduit `iban_hash_cle` depuis le chiffré). Mode de compatibilité v1 :
 * SHA-256 historique, pour qu'un retour arrière du code reste possible.
 */
export function empreinteIban(iban: string) {
  const trousseau = lireTrousseauBancaire();
  if (trousseau.formatEcriture === "v1") return createHash("sha256").update(normaliserIban(iban)).digest("hex");
  return indexAveugleIban(trousseau, normaliserIban(iban));
}

export function finIban(iban: string) {
  return normaliserIban(iban).slice(-4);
}

export function powensEstConfigure() {
  return Boolean(process.env.POWENS_API_BASE_URL && process.env.POWENS_CLIENT_ID && process.env.POWENS_CLIENT_SECRET && process.env.POWENS_WEBVIEW_BASE_URL && process.env.NEXT_PUBLIC_APP_URL);
}

// Signature de l'état de paiement (valide 7 jours). Clé dédiée BANK_OAUTH_STATE_HMAC_KEY ;
// les replis historiques restent acceptés À LA VÉRIFICATION (états déjà émis) et ne servent à
// signer que si la clé dédiée est absente. Ainsi la rotation des clés de chiffrement bancaire
// n'invalide aucun état en cours.
function secretsEtatBancaire() {
  return [process.env.BANK_OAUTH_STATE_HMAC_KEY, process.env.BANK_DATA_ENCRYPTION_KEY, process.env.POWENS_CLIENT_SECRET]
    .map((valeur) => valeur?.trim() ?? "")
    .filter(Boolean);
}

export function creerEtatPaiementBancaire(lotId: string, entrepriseId: string) {
  const [secret] = secretsEtatBancaire();
  if (!secret) throw new Error("Signature bancaire non configurée");
  const corps = Buffer.from(JSON.stringify({ lotId, entrepriseId, expireAt: Date.now() + 7 * 24 * 60 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(corps).digest("base64url");
  return `${corps}.${signature}`;
}

export function verifierEtatPaiementBancaire(etat: string) {
  const secrets = secretsEtatBancaire();
  const [corps, signature] = etat.split(".");
  if (!secrets.length || !corps || !signature) return null;
  const a = Buffer.from(signature);
  const signe = secrets.some((secret) => {
    const b = Buffer.from(createHmac("sha256", secret).update(corps).digest("base64url"));
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!signe) return null;
  try {
    const valeur = JSON.parse(Buffer.from(corps, "base64url").toString("utf8")) as { lotId?: string; entrepriseId?: string; expireAt?: number };
    if (!valeur.lotId || !valeur.entrepriseId || !valeur.expireAt || valeur.expireAt < Date.now()) return null;
    return valeur as { lotId: string; entrepriseId: string; expireAt: number };
  } catch {
    return null;
  }
}

const basePowens = () => {
  const valeur = process.env.POWENS_API_BASE_URL?.replace(/\/$/, "");
  if (!valeur) throw new Error("POWENS_API_BASE_URL n’est pas configurée");
  return valeur;
};

async function jetonPowens() {
  const clientId = process.env.POWENS_CLIENT_ID;
  const clientSecret = process.env.POWENS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Identifiants Powens absents");
  const reponse = await fetch(`${basePowens()}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "payments:admin" }),
    cache: "no-store",
  });
  const donnees = await reponse.json() as { token?: string; error?: string; error_description?: string };
  if (!reponse.ok || !donnees.token) throw new Error(donnees.error_description || donnees.error || "Powens a refusé l’authentification");
  return donnees.token;
}

export async function initierLotPowens(params: {
  lotId: string;
  entrepriseId: string;
  dateExecution: string;
  entreprise: EntreprisePayeur;
  ordres: OrdrePrestataireBancaire[];
}) {
  if (!powensEstConfigure()) throw new Error("Le prestataire bancaire Powens n’est pas configuré");
  if (!params.entreprise.siret || !/^\d{14}$/.test(params.entreprise.siret.replace(/\s/g, ""))) throw new Error("Le SIRET de l’entreprise est obligatoire pour le virement bancaire");
  if (!params.entreprise.formeJuridique.trim()) throw new Error("La forme juridique de l’entreprise est obligatoire pour le virement bancaire");
  if (!params.ordres.length) throw new Error("Le lot ne contient aucun virement");
  const fournisseurSansSiret = params.ordres.find((ordre) => ordre.type === "fournisseur" && !/^\d{14}$/.test(ordre.siret?.replace(/\s/g, "") ?? ""));
  if (fournisseurSansSiret) throw new Error(`Le SIRET du fournisseur « ${fournisseurSansSiret.titulaire} » est obligatoire avant transmission`);
  const token = await jetonPowens();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, "");
  const etat = creerEtatPaiementBancaire(params.lotId, params.entrepriseId);
  const dateAujourdhui = new Date().toISOString().slice(0, 10);
  const executionDifferee = params.dateExecution > dateAujourdhui;
  const instructions = params.ordres.map((ordre) => ({
    label: ordre.libelle.slice(0, 140),
    amount: Number(ordre.montant.toFixed(2)),
    currency: "EUR",
    execution_date_type: executionDifferee ? "deferred" : "first_open_day",
    ...(executionDifferee ? { execution_date: params.dateExecution } : {}),
    beneficiary: { scheme_name: "iban", identification: ordre.iban, label: ordre.titulaire },
    beneficiary_identity: ordre.type === "fournisseur"
      ? { kind: "corporate", org_name: ordre.titulaire, ...(ordre.siret ? { scheme_name: "siret", identification: ordre.siret.replace(/\s/g, "") } : {}) }
      : { kind: "individual", first_name: ordre.prenom || "Salarié", last_name: ordre.nom || ordre.titulaire },
  }));
  const reponse = await fetch(`${basePowens()}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      client_redirect_uri: `${appUrl}/api/paiements-bancaires/powens/callback`,
      client_state: etat,
      instructions,
      payer_identity: {
        kind: "corporate",
        org_name: params.entreprise.raisonSociale || params.entreprise.nom,
        org_legal_status: params.entreprise.formeJuridique.trim(),
        scheme_name: "siren",
        identification: params.entreprise.siret.replace(/\s/g, "").slice(0, 9),
      },
    }),
    cache: "no-store",
  });
  const paiement = await reponse.json() as { id?: string | number; state?: string; error_description?: string; error?: string };
  if (!reponse.ok || !paiement.id) throw new Error(paiement.error_description || paiement.error || "Powens a refusé le lot de virements");
  const paiementId = String(paiement.id);
  const scoped = await fetch(`${basePowens()}/payments/${encodeURIComponent(paiementId)}/scopedtoken`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: ["payments:validate"] }),
    cache: "no-store",
  });
  const scopedData = await scoped.json() as { token?: string; error_description?: string; error?: string };
  if (!scoped.ok || !scopedData.token) throw new Error(scopedData.error_description || scopedData.error || "Powens n’a pas créé la validation bancaire");
  const webview = new URL(process.env.POWENS_WEBVIEW_BASE_URL!);
  webview.searchParams.set("client_id", process.env.POWENS_CLIENT_ID!);
  webview.searchParams.set("redirect_uri", `${appUrl}/api/paiements-bancaires/powens/callback`);
  webview.searchParams.set("state", etat);
  webview.searchParams.set("code", scopedData.token);
  webview.searchParams.set("payment_id", paiementId);
  return { paiementId, statut: paiement.state || "created", consentUrl: webview.toString() };
}

export async function obtenirPaiementPowens(paiementId: string) {
  const token = await jetonPowens();
  const reponse = await fetch(`${basePowens()}/payments/${encodeURIComponent(paiementId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const donnees = await reponse.json() as { state?: string; error_description?: string; error?: string };
  if (!reponse.ok || !donnees.state) throw new Error(donnees.error_description || donnees.error || "Statut bancaire indisponible");
  return donnees;
}
