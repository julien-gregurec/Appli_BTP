// Banc de test du chiffrement bancaire : IBAN fictifs et magasin mémoire qui reproduit la
// sémantique des RPC de 20261002001112_banking_encryption_key_rotation_v1 (registre, garde,
// curseur, compare-and-swap, lot atomique). Données de test uniquement.
import { createHash } from "node:crypto";
import {
  chiffrerAvecTrousseau,
  dechiffrerAvecTrousseau,
  empreinteControleCle,
  indexAveugleIban,
  lireEnteteChiffre,
  type FormatEcriture,
} from "@/lib/banking-keyring";
import type { EtatRegistre, LigneInventaire, MagasinRotation, MiseAJourChiffre, PrimitivesTrousseau, RessourceBancaire, ColonneBancaire, ValeurChiffree } from "@/lib/banking-rotation";

/** IBAN français fictif à clé de contrôle valide (code banque 99999, inexistant). */
export function ibanTest(n: number) {
  const bban = `9999900001${String(n).padStart(11, "0")}00`;
  const num = `${bban}152700`; // « FR00 » réarrangé : F=15, R=27
  let reste = 0;
  for (const c of num) reste = (reste * 10 + Number(c)) % 97;
  return `FR${String(98 - reste).padStart(2, "0")}${bban}`;
}

export const outilsTrousseau: PrimitivesTrousseau = {
  lireEntete: lireEnteteChiffre,
  dechiffrer: dechiffrerAvecTrousseau,
  chiffrer: chiffrerAvecTrousseau,
  indexAveugle: indexAveugleIban,
  empreinteHistorique: (iban) => createHash("sha256").update(iban).digest("hex"),
  empreinteControle: empreinteControleCle,
};

type Ligne = { ressource: RessourceBancaire; id: string; iban_chiffre: string; bic_chiffre: string | null; iban_hash?: string };
type Cle = { cle_id: string; statut: string; empreinte_controle: string | null };

function entete(v: string | null) {
  if (v === null) return null;
  try {
    return lireEnteteChiffre(v);
  } catch {
    return null;
  }
}

export class MagasinMemoire implements MagasinRotation {
  lignes: Ligne[] = [];
  cles = new Map<string, Cle>([["k1", { cle_id: "k1", statut: "active", empreinte_controle: null }]]);
  journal: Record<string, unknown>[] = [];
  /** Injection de pannes : appelée avant (« avant ») / après (« apres ») la validation d'un lot. */
  panne?: (moment: "avant" | "apres", numeroLot: number) => void;
  private lotsAppliques = 0;

  ajouter(ligne: Ligne) {
    this.exigerEcrivable(ligne.iban_chiffre);
    this.exigerEcrivable(ligne.bic_chiffre);
    this.lignes.push(ligne);
  }

  private exigerEcrivable(v: string | null) {
    const e = entete(v);
    if (!e) return;
    const cle = this.cles.get(e.cle);
    if (!cle || !["preparee", "active", "dechiffrement"].includes(cle.statut)) throw Object.assign(new Error(`clé ${e.cle} non inscriptible`), { code: "BANK_KEY_NOT_WRITABLE" });
  }

  enregistrer(id: string, empreinte: string) {
    const c = this.cles.get(id);
    if (!c) this.cles.set(id, { cle_id: id, statut: "preparee", empreinte_controle: empreinte });
    else if (!c.empreinte_controle) c.empreinte_controle = empreinte;
    else if (c.empreinte_controle !== empreinte) throw new Error("BANK_KEY_FINGERPRINT_MISMATCH");
  }

  activer(id: string) {
    const c = this.cles.get(id);
    if (!c || !["preparee", "dechiffrement"].includes(c.statut) || !c.empreinte_controle) throw new Error("activation interdite");
    for (const k of this.cles.values()) if (k.statut === "active") k.statut = "dechiffrement";
    c.statut = "active";
  }

  compromettre(id: string) {
    const c = this.cles.get(id)!;
    if (c.statut === "active") throw new Error("clé active");
    c.statut = "compromise";
  }

  retirer(id: string) {
    const restants = this.sources().filter((s) => entete(s.chiffre)?.cle === id).length;
    if (restants) throw Object.assign(new Error(`BANK_KEY_STILL_IN_USE ${restants}`), { code: "BANK_KEY_STILL_IN_USE" });
    this.cles.get(id)!.statut = "retiree";
  }

  sources(): ValeurChiffree[] {
    const out: ValeurChiffree[] = [];
    for (const l of this.lignes) {
      for (const colonne of ["iban_chiffre", "bic_chiffre"] as ColonneBancaire[]) {
        const chiffre = l[colonne];
        if (chiffre !== null) out.push({ ressource: l.ressource, id: l.id, colonne, chiffre, curseur: `${l.ressource}/${l.id}/${colonne}` });
      }
    }
    return out.sort((a, b) => (a.curseur < b.curseur ? -1 : a.curseur > b.curseur ? 1 : 0));
  }

  async etat(): Promise<EtatRegistre> {
    const inventaire = new Map<string, LigneInventaire>();
    for (const s of this.sources()) {
      const e = entete(s.chiffre);
      const cle = e?.cle ?? null;
      const ligne: LigneInventaire = { ressource: s.ressource, colonne: s.colonne, format: e?.format ?? "illisible", cle_id: cle, statut_cle: cle ? this.cles.get(cle)?.statut ?? "non_enregistree" : null, nombre: 0 };
      const k = JSON.stringify([ligne.ressource, ligne.colonne, ligne.format, ligne.cle_id]);
      const existant = inventaire.get(k) ?? ligne;
      existant.nombre += 1;
      inventaire.set(k, existant);
    }
    const cles = [...this.cles.values()].map((c) => ({ ...c }));
    return { active: cles.find((c) => c.statut === "active")?.cle_id ?? null, cles, inventaire: [...inventaire.values()] };
  }

  private exigerCible(cible: string, format: FormatEcriture) {
    if (this.cles.get(cible)?.statut !== "active") throw Object.assign(new Error("BANK_KEY_TARGET_NOT_ACTIVE"), { code: "BASE" });
    if (format === "v1" && cible !== "k1") throw new Error("Format cible invalide");
  }

  async lister(cible: string, format: FormatEcriture, apres: string | null, limite: number) {
    this.exigerCible(cible, format);
    return this.sources()
      .filter((s) => {
        const e = entete(s.chiffre);
        return e && (e.cle !== cible || e.format !== format) && (apres === null || s.curseur > apres);
      })
      .slice(0, limite);
  }

  async parcourir(apres: string | null, limite: number) {
    return this.sources().filter((s) => apres === null || s.curseur > apres).slice(0, limite);
  }

  async appliquer(cible: string, format: FormatEcriture, lot: MiseAJourChiffre[]) {
    this.exigerCible(cible, format);
    this.lotsAppliques += 1;
    this.panne?.("avant", this.lotsAppliques);
    // Transaction : on valide tout sur une copie puis on remplace.
    const copie = this.lignes.map((l) => ({ ...l }));
    let rechiffres = 0;
    let conflits = 0;
    for (const m of lot) {
      const e = entete(m.nouveau);
      if (!e || e.cle !== cible || e.format !== format) throw new Error("Nouvelle valeur hors cible");
      if (m.ressource === "coordonnees_bancaires" && m.colonne === "iban_chiffre" && !/^[0-9a-f]{64}$/.test(m.iban_hash ?? "")) throw new Error("Index aveugle IBAN requis");
      const l = copie.find((x) => x.ressource === m.ressource && x.id === m.id);
      if (l && l[m.colonne] === m.ancien) {
        l[m.colonne] = m.nouveau;
        if (m.iban_hash) l.iban_hash = m.iban_hash;
        rechiffres += 1;
      } else conflits += 1;
    }
    this.lignes = copie;
    this.journal.push({ action: "rechiffrement_lot", cle_id: cible, rechiffres, conflits });
    this.panne?.("apres", this.lotsAppliques);
    return { rechiffres, conflits };
  }
}
