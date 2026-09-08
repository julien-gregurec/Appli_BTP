/**
 * Sérialisation CSV de l'annuaire.
 *
 * Séparateur point-virgule et BOM UTF-8 : c'est ce qu'Excel en configuration
 * française ouvre sans boîte de dialogue d'import. Les valeurs sont toujours
 * encadrées de guillemets et une valeur commençant par `=`, `+`, `-` ou `@`
 * est préfixée d'une apostrophe, faute de quoi un nom d'entreprise pourrait
 * être interprété comme une formule à l'ouverture du fichier.
 */

import {
  COLONNES_ANNUAIRE,
  composerCout,
  situationPaiement,
  type CleColonneAnnuaire,
  type LigneAnnuaire,
} from "@/lib/plateforme-annuaire";
import { offreTarifaireParCle } from "@/lib/tarification";
import { MENTION_NON_DISPONIBLE } from "@/lib/plateforme-annuaire-format";

const SEPARATEUR = ";";
const BOM = "﻿";
const CARACTERES_FORMULE = new Set(["=", "+", "-", "@", "\t", "\r"]);

function echapper(valeur: string): string {
  const sur = CARACTERES_FORMULE.has(valeur.charAt(0)) ? `'${valeur}` : valeur;
  return `"${sur.replace(/"/g, '""')}"`;
}

function nombreFr(valeur: number | null): string {
  return valeur === null ? MENTION_NON_DISPONIBLE : String(valeur).replace(".", ",");
}

/** Valeur exportée d'une colonne. Aucune référence Stripe n'y transite. */
export function valeurExport(colonne: CleColonneAnnuaire, ligne: LigneAnnuaire, maintenant: Date): string {
  const cout = composerCout(ligne);
  switch (colonne) {
    case "nom": return ligne.nom;
    case "raison_sociale": return ligne.raison_sociale ?? "";
    case "siret": return ligne.siret ?? "";
    case "ville": return ligne.ville ?? "";
    case "reference": return ligne.reference_interne ?? ligne.code_adhesion ?? "";
    case "proprietaire": return ligne.proprietaire_nom ?? "";
    case "email": return ligne.proprietaire_email ?? "";
    case "date_inscription": return ligne.created_at?.slice(0, 10) ?? "";
    case "statut": return ligne.abonnement_statut;
    case "forfait": return ligne.abonnement_offre ? offreTarifaireParCle(ligne.abonnement_offre).nom : "";
    case "periodicite": return ligne.abonnement_periodicite ?? "";
    case "modules": return ligne.modules_actifs.join(" ");
    case "applications": return ligne.applications_actives.join(" ");
    case "comptes_actifs": return String(ligne.nb_comptes_actifs);
    case "comptes_inclus":
      return ligne.abonnement_offre ? String(offreTarifaireParCle(ligne.abonnement_offre).comptesInclus) : "";
    case "montant_public": return nombreFr(cout.tarifPublicHT);
    case "remise":
      return cout.remise
        ? `${cout.remise.type} ${cout.remise.valeur}${cout.remise.permanente ? " permanente" : ""}`
        : "";
    case "prix_souscrit": return nombreFr(cout.totalRecurrentHT);
    case "prochaine_echeance": return ligne.abonnement_echeance ?? "";
    case "statut_paiement": return situationPaiement(ligne, maintenant).libelle;
    case "montant_impaye": return nombreFr(ligne.montant_impaye_ht);
    case "derniere_activite": return ligne.derniere_activite?.slice(0, 10) ?? "";
  }
}

export function construireCsvAnnuaire(
  lignes: readonly LigneAnnuaire[],
  colonnes: readonly CleColonneAnnuaire[],
  maintenant: Date,
): string {
  const definitions = COLONNES_ANNUAIRE.filter((c) => colonnes.includes(c.cle));
  const entete = definitions.map((c) => echapper(c.libelle)).join(SEPARATEUR);
  const corps = lignes.map((ligne) =>
    definitions.map((c) => echapper(valeurExport(c.cle, ligne, maintenant))).join(SEPARATEUR),
  );
  return `${BOM}${[entete, ...corps].join("\r\n")}\r\n`;
}
