#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_REF = "pgvvpqyjziyapbbkydmc";
const PROJECT_NAME = "elsatia-preview";
const COMPANY_ID = "1bfc5dc6-1979-408c-babc-ee15841f3d21";
const COMPANY_NAME = "ELSATIA — Recette Preview";
const MANAGER_EMAIL = "julien.gregurec@gmail.com";
const PERIOD_START = "2025-08-01";
const PERIOD_END = "2026-07-31";
const MARKER = "RECETTE_ELSATIA_PREVIEW_2025_2026";
const DOCUMENT_MARKER = "DOCUMENT FICTIF — RECETTE ELSATIA — SANS VALEUR CONTRACTUELLE";
const CONFIRMATION = `PEUPLER_${PROJECT_REF}_${COMPANY_ID}`;
const MAX_GENERATED_REFERENCE = 2_147_483_647;
const SEED_COMMAND_NUMBER_BASE = 3_000_000_000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BUSINESS_ROLES = [
  "Ouvrier",
  "Chef d’équipe",
  "Chef de chantier",
  "Conducteur de travaux",
  "Directeur travaux",
  "Administration",
  "RH",
  "Comptable",
  "Gérant",
];
const ALL_ROLES = [...BUSINESS_ROLES, "Compte dépôt"];

function abort(message) {
  throw new Error(`ARRÊT SÛR: ${message}`);
}

function parseArgs(argv) {
  const args = new Map();
  for (const value of argv.slice(2)) {
    if (!value.startsWith("--")) abort(`argument inattendu: ${value}`);
    const [key, ...rest] = value.slice(2).split("=");
    args.set(key, rest.length ? rest.join("=") : true);
  }
  const allowed = new Set(["dry-run", "live-readonly", "execute", "confirm", "json", "emit-sql"]);
  for (const key of args.keys()) if (!allowed.has(key)) abort(`option interdite: --${key}`);
  const emitSql = args.has("emit-sql") ? args.get("emit-sql") : null;
  if (emitSql !== null) {
    if (typeof emitSql !== "string" || !emitSql) abort("--emit-sql exige un chemin de fichier");
    if ([...args.keys()].some((key) => key !== "emit-sql")) abort("--emit-sql s'utilise seul");
    return { dryRun: false, liveReadonly: false, execute: false, json: false, emitSql };
  }
  const dryRun = args.has("dry-run");
  const execute = args.has("execute");
  if (dryRun === execute) abort("utiliser exactement un mode parmi --dry-run, --execute et --emit-sql");
  if (execute && args.get("confirm") !== CONFIRMATION) {
    abort(`confirmation d'exécution absente ou incorrecte`);
  }
  if (dryRun && args.has("confirm")) abort("--confirm est interdit avec --dry-run");
  if (args.has("live-readonly") && !dryRun) abort("--live-readonly exige --dry-run");
  return { dryRun, liveReadonly: args.has("live-readonly"), execute, json: args.has("json"), emitSql: null };
}

function stableId(kind, key) {
  const hex = crypto.createHash("sha256").update(`${MARKER}:${kind}:${key}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

function weekdays(start, end) {
  const result = [];
  for (let value = start; value <= end; value = addDays(value, 1)) {
    const day = new Date(`${value}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) result.push(value);
  }
  return result;
}

function assertDate(value, label) {
  if (value < PERIOD_START || value > PERIOD_END) abort(`${label} hors période: ${value}`);
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function marker(label) {
  return `${MARKER} — ${label}`;
}

// Référence résolue par la base au moment de l'exécution (UUID du compte Gérant, postes de
// l'entreprise) : le plan reste déterministe et ne suppose aucun identifiant distant.
function contextRef(key) {
  return `{{${key}}}`;
}

function buildPlan() {
  const employeesSpec = [
    ["GERANT", "Julien", "Gregurec", "Gérant", "cdi", "2025-08-01", null, "actif"],
    ["COND", "Camille", "Durand", "Conducteur de travaux", "cdi", "2025-08-01", null, "actif"],
    ["AFF", "Morgan", "Leroy", "Directeur travaux", "cdi", "2025-08-01", null, "actif"],
    ["ADMIN", "Noémie", "Rivière", "Administration", "cdi", "2025-08-18", null, "actif"],
    ["CHEF1", "Sofiane", "Borel", "Chef d’équipe", "cdi", "2025-08-01", null, "actif"],
    ["CHEF2", "Ariane", "Colin", "Chef d’équipe", "cdi", "2025-09-01", null, "actif"],
    ["POSE1", "Lina", "Martin", "Ouvrier", "cdi", "2025-08-01", null, "actif"],
    ["POSE2", "Enzo", "Petit", "Ouvrier", "cdi", "2025-08-01", null, "actif"],
    ["POSE3", "Maël", "Roux", "Ouvrier", "cdi", "2025-08-01", null, "actif"],
    ["POSE4", "Inès", "Mercier", "Ouvrier", "cdd", "2026-01-05", null, "actif"],
    ["POSE5", "Nolan", "Faure", "Ouvrier", "cdd", "2025-08-01", "2026-04-30", "sorti"],
    ["APP", "Zoé", "Blanc", "Ouvrier", "apprenti", "2025-09-01", null, "actif"],
  ];
  // Un salarié sorti ne peut plus recevoir d'affectation (trg_affectation_employe_actif) : il
  // est créé actif, reçoit son historique pendant son contrat, puis sort par transition métier
  // (module employeeExits) — jamais l'inverse.
  const employees = employeesSpec.map(([key, prenom, nom, role, type, entry, exit, status], index) => ({
    id: stableId("employe", key), entreprise_id: COMPANY_ID, reference_interne: `REC-EMP-${String(index + 1).padStart(3, "0")}`,
    prenom, nom, email: key === "GERANT" ? MANAGER_EMAIL : `${prenom.toLowerCase()}.${nom.toLowerCase()}@example.invalid`,
    telephone: `+33 0 00 00 ${String(index).padStart(2, "0")} ${String(index + 10).padStart(2, "0")}`,
    poste: role, type_contrat: type, date_entree: entry, date_sortie: null, statut: "actif",
    __targetStatus: status, __targetExit: exit,
    // poste_id / utilisateur_id sont résolus par la base au moment de l'exécution (préflight).
    poste_id: contextRef(`poste:${role}`), utilisateur_id: key === "GERANT" ? contextRef("gerant") : null,
    notes: marker(key === "GERANT" ? "fiche Gérant reliée au compte existant" : "salarié fictif sans compte Auth"),
    __key: key, __role: role,
    // Depuis 20260818000205 et 20260922000328, le coût horaire et le taux facturé vivent dans
    // des tables dédiées à lecture restreinte (employes_cout_horaire, employes_taux_facture).
    __taux_horaire: round(13.5 + index * 0.85), __cout_horaire: round(22 + index * 1.25),
  }));
  const employeeRates = employees.map((employee) => ({
    employe_id: employee.id, entreprise_id: COMPANY_ID, taux_horaire: employee.__taux_horaire,
  }));
  const employeeCosts = employees.map((employee) => ({
    employe_id: employee.id, entreprise_id: COMPANY_ID, cout_horaire: employee.__cout_horaire,
  }));

  const clients = Array.from({ length: 23 }, (_, index) => {
    const status = index < 15 ? "actif" : index < 20 ? "prospect" : "inactif";
    const type = ["professionnel", "syndic", "promoteur", "collectivite"][index % 4];
    return {
      id: stableId("client", index), entreprise_id: COMPANY_ID,
      reference_interne: `REC-CLI-${String(index + 1).padStart(3, "0")}`, type,
      societe: `Société ${String.fromCharCode(65 + index)} TEST`, raison_sociale: `Société ${String.fromCharCode(65 + index)} RECETTE`,
      adresse_facturation: `${10 + index} rue de la Recette`, code_postal: `67${String(index).padStart(3, "0")}`,
      ville: "Ville TEST", adresse_chantier_defaut: `${40 + index} avenue Démonstration`,
      telephone: `+33 0 00 10 ${String(index).padStart(2, "0")} 00`, email: `contact${index + 1}@example.invalid`,
      conditions_paiement: index % 3 === 0 ? "30 jours" : "À réception", statut: status,
      notes: marker(`client ${status}`), __key: `C${index + 1}`,
    };
  });
  const contacts = Array.from({ length: 25 }, (_, index) => ({
    id: stableId("contact", index), client_id: clients[index % clients.length].id,
    nom: `Contact ${String(index + 1).padStart(2, "0")} TEST`, fonction: ["Direction", "Achats", "Architecte", "Syndic"][index % 4],
    telephone: `+33 0 00 20 ${String(index).padStart(2, "0")} 00`, email: `contact.personne${index + 1}@example.invalid`,
    principal: index < 23,
  }));

  const projectStatuses = [
    ...Array(8).fill("termine"), ...Array(5).fill("en_cours"), ...Array(3).fill("a_preparer"),
    ...Array(2).fill("en_pause"), "annule", "annule",
  ];
  const chantiers = projectStatuses.map((statut, index) => {
    const start = addDays(PERIOD_START, 8 + index * 15);
    const finish = addDays(start, 28 + (index % 5) * 10);
    return {
      id: stableId("chantier", index), entreprise_id: COMPANY_ID,
      reference_interne: `REC-CHA-${String(index + 1).padStart(3, "0")}`,
      client_id: clients[index % 20].id, nom: `Chantier ${String(index + 1).padStart(2, "0")} RECETTE`,
      adresse: `${100 + index} rue du Chantier TEST`, code_postal: `67${String(100 + index).slice(-3)}`, ville: "Ville TEST",
      statut, date_debut_prevue: start, date_fin_prevue: finish,
      date_debut_reelle: statut === "a_preparer" || statut === "annule" ? null : start,
      date_fin_reelle: statut === "termine" ? finish : null,
      budget_previsionnel: 8000 + index * 3250, responsable_id: employees[1 + (index % 2)].id,
      __key: `CHA${index + 1}`,
    };
  });

  const prestationNames = [
    "Main-d’œuvre pose", "Déplacement", "Étude et métrés", "Cloison pleine", "Cloison vitrée", "Porte stratifiée",
    "Porte vitrée", "Cabine sanitaire", "Panneau décoratif", "Sol stratifié", "Plinthe", "Accessoires de finition",
    "Consommables", "Location matériel", "Dépose existant", "Protection chantier", "Nettoyage fin chantier", "Pose vitrage",
    "Pose huisserie", "Traitement acoustique", "Renfort mural", "Forfait SAV", "Livraison", "Réunion technique",
  ];
  const prestations = prestationNames.map((designation, index) => ({
    id: stableId("prestation", index), entreprise_id: COMPANY_ID, designation: `${designation} — RECETTE`,
    type: ["main_oeuvre", "deplacement", "forfait", "fourniture"][index % 4],
    unite: ["h", "forfait", "m²", "ml", "u"][index % 5], prix_unitaire_ht: 25 + index * 17.5,
    taux_tva: [20, 10, 5.5][index % 3], actif: index !== 23,
  }));

  const quoteStatuses = [...Array(22).fill("accepte"), ...Array(6).fill("refuse"), ...Array(4).fill("expire"), ...Array(3).fill("envoye")];
  const devis = quoteStatuses.map((statut, index) => {
    const issue = addDays(PERIOD_START, index * 9);
    return {
      id: stableId("devis", index), entreprise_id: COMPANY_ID, client_id: clients[index % clients.length].id,
      // Créé en brouillon : un devis accepté verrouille ses lignes (verrouiller_lignes_devis_accepte).
      // Les lignes sont posées, puis le devis suit ses transitions métier jusqu'à __targetStatus.
      chantier_id: chantiers[index % chantiers.length].id, statut: "brouillon", date_emission: issue, date_validite: addDays(issue, 30),
      conditions: "Document de recette — validité 30 jours", notes_client: DOCUMENT_MARKER,
      notes_internes: marker(`devis ${index + 1}`), remise_globale: index % 9 === 0 ? 3 : 0, __key: `DEV${index + 1}`,
      __targetStatus: statut,
    };
  });
  const lignesDevis = devis.flatMap((quote, quoteIndex) => Array.from({ length: 3 }, (_, lineIndex) => ({
    id: stableId("ligne-devis", `${quoteIndex}-${lineIndex}`), devis_id: quote.id,
    designation: `${prestationNames[(quoteIndex + lineIndex) % prestationNames.length]} — RECETTE`,
    description: marker(`ligne devis ${quoteIndex + 1}/${lineIndex + 1}`),
    type: ["main_oeuvre", "fourniture", "forfait"][lineIndex], quantite: 2 + ((quoteIndex + lineIndex) % 8),
    unite: ["h", "m²", "forfait"][lineIndex], prix_unitaire_ht: 65 + quoteIndex * 12 + lineIndex * 45,
    remise_ligne: quoteIndex % 11 === 0 ? 5 : 0, taux_tva: lineIndex === 2 ? 10 : 20, ordre: lineIndex,
  })));

  const factures = Array.from({ length: 25 }, (_, index) => {
    const quote = devis[index % 22];
    const type = index >= 23 ? "avoir" : index % 7 === 0 ? "acompte" : index % 7 === 1 ? "situation" : index % 7 === 2 ? "finale" : "simple";
    const issue = addDays(quote.date_emission, 18 + (index % 4) * 7);
    // Les lignes ne sont modifiables qu'en brouillon. L'émission intervient donc
    // après leur insertion, puis les statuts de paiement sont dérivés des règlements.
    const emissionStatus = type === "avoir" ? "avoir_emis" : index >= 20 ? "en_retard" : "envoyee";
    return {
      id: stableId("facture", index), entreprise_id: COMPANY_ID, client_id: quote.client_id,
      chantier_id: quote.chantier_id, devis_origine_id: quote.id, type, statut: "brouillon",
      date_emission: issue, date_echeance: addDays(issue, 30), notes_client: DOCUMENT_MARKER,
      notes_internes: marker(`facture ${index + 1}`), __key: `FAC${index + 1}`, __emissionStatus: emissionStatus,
    };
  });
  const lignesFactures = factures.flatMap((invoice, invoiceIndex) => Array.from({ length: 2 }, (_, lineIndex) => ({
    id: stableId("ligne-facture", `${invoiceIndex}-${lineIndex}`), facture_id: invoice.id,
    designation: `${prestationNames[(invoiceIndex + lineIndex) % prestationNames.length]} — RECETTE`,
    description: marker(`ligne facture ${invoiceIndex + 1}/${lineIndex + 1}`),
    type: lineIndex ? "fourniture" : "main_oeuvre", quantite: 3 + (invoiceIndex % 6), unite: lineIndex ? "m²" : "h",
    prix_unitaire_ht: invoice.type === "avoir" ? 80 + invoiceIndex * 5 : 90 + invoiceIndex * 18 + lineIndex * 50,
    remise_ligne: 0, taux_tva: 20, ordre: lineIndex,
  })));
  const paiements = Array.from({ length: 20 }, (_, index) => {
    const invoiceLines = lignesFactures.filter((line) => line.facture_id === factures[index].id);
    const total = round(invoiceLines.reduce((sum, line) => sum + line.quantite * line.prix_unitaire_ht * (1 + line.taux_tva / 100), 0));
    return {
      id: stableId("paiement", index), facture_id: factures[index].id,
      montant: index >= 14 ? round(total * 0.45) : total,
      date: addDays(factures[index].date_emission, 12 + (index % 8)),
      mode: ["virement", "cheque", "cb", "especes"][index % 4], reference: `REC-PAY-${String(index + 1).padStart(3, "0")}-${MARKER}`,
    };
  });

  const suppliers = Array.from({ length: 9 }, (_, index) => ({
    id: stableId("fournisseur", index), entreprise_id: COMPANY_ID, reference: `REC-FOU-${String(index + 1).padStart(3, "0")}`,
    nom: `Fournisseur ${String.fromCharCode(65 + index)} TEST`, email: `fournisseur${index + 1}@example.invalid`,
    telephone: `+33 0 00 30 ${String(index).padStart(2, "0")} 00`, adresse: `${200 + index} rue Fournisseur TEST`,
    code_postal: `67${String(200 + index).slice(-3)}`, ville: "Ville TEST", notes: marker("fournisseur fictif"),
  }));
  const commandes = Array.from({ length: 18 }, (_, index) => {
    const dateCommande = addDays(PERIOD_START, 12 + index * 17);
    const businessYear = dateCommande.slice(0, 4);
    const yearlySequence = (index % 9) + 1;
    return {
      id: stableId("commande", index), entreprise_id: COMPANY_ID, fournisseur_id: suppliers[index % 9].id,
      // Créée en brouillon : une commande envoyée est verrouillée (20260926000506, PO-1) et son
      // identité imprimée est figée en quittant le brouillon (20260927000507). Les lignes sont
      // posées en brouillon, puis la commande suit les transitions métier (envoi, confirmation,
      // réception par le moteur canonique) jusqu'à __targetStatus.
      chantier_id: chantiers[index % 16].id, statut: "brouillon",
      numero: `CMD-${businessYear}-${SEED_COMMAND_NUMBER_BASE + yearlySequence}`,
      date_commande: dateCommande, notes: marker(`commande ${index + 1}`), __key: `CMD${index + 1}`,
      __targetStatus: ["recue", "recue_partiel", "confirmee", "annulee"][index % 4],
    };
  });
  const lignesCommande = commandes.flatMap((order, orderIndex) => Array.from({ length: 3 }, (_, lineIndex) => ({
    id: stableId("ligne-commande", `${orderIndex}-${lineIndex}`), entreprise_id: COMPANY_ID, commande_id: order.id,
    designation: `Matériau ${orderIndex + 1}.${lineIndex + 1} TEST`, quantite: 5 + lineIndex * 4,
    unite: lineIndex === 1 ? "m²" : "u", prix_unitaire_ht: 18 + orderIndex * 3 + lineIndex * 9,
    taux_tva: 20, quantite_recue: 0, ordre: lineIndex,
    __targetRecue: order.__targetStatus === "recue" ? 5 + lineIndex * 4 : order.__targetStatus === "recue_partiel" ? 2 : 0,
  })));
  const supplierExpenses = Array.from({ length: 30 }, (_, index) => {
    const command = index < commandes.length ? commandes[index] : null;
    return {
      id: stableId("depense-fournisseur", index), entreprise_id: COMPANY_ID, fournisseur_id: suppliers[index % 9].id,
      chantier_id: command ? command.chantier_id : chantiers[index % 18].id, commande_id: command?.id ?? null,
      numero_piece: `REC-DF-${String(index + 1).padStart(4, "0")}`, categorie: ["materiaux", "location", "transport", "outillage"][index % 4],
      date_piece: addDays(PERIOD_START, 10 + index * 11), date_echeance: addDays(PERIOD_START, 40 + index * 11),
      montant_ht: 180 + index * 37, montant_tva: round((180 + index * 37) * 0.2), notes: marker("dépense fournisseur"),
    };
  });

  const articles = Array.from({ length: 30 }, (_, index) => ({
    id: stableId("article", index), entreprise_id: COMPANY_ID, reference: `REC-ART-${String(index + 1).padStart(3, "0")}`,
    designation: `Article stock ${String(index + 1).padStart(2, "0")} TEST`, unite: ["u", "m²", "ml"][index % 3],
    quantite_stock: 0, seuil_alerte: 5 + (index % 5), prix_achat_ht: 4 + index * 2.75,
    prix_vente_ht: 7 + index * 4.25, emplacement: `RECETTE-R${1 + (index % 5)}`, actif: index !== 29,
  }));
  const stockMovements = Array.from({ length: 100 }, (_, index) => ({
    id: stableId("mouvement-stock", index), entreprise_id: COMPANY_ID, article_id: articles[index % 30].id,
    chantier_id: index < 70 ? chantiers[index % 18].id : null,
    type: index < 60 ? "entree" : "sortie", quantite: index < 60 ? 12 : 3,
    date: addDays(PERIOD_START, 3 + index * 3), motif: marker(index < 60 ? "entrée stock" : "sortie chantier"),
  }));

  const workdays = weekdays(PERIOD_START, PERIOD_END);
  const activeEmployees = employees.filter((employee) => employee.__key !== "ADMIN" && employee.__key !== "GERANT");
  // Historique borné au contrat : aucune activité avant l'entrée ni après la sortie.
  const underContract = (employee, date) => employee.date_entree <= date && (!employee.__targetExit || date <= employee.__targetExit);
  const fieldStaffOn = (date) => activeEmployees.filter((employee) => underContract(employee, date));
  const staffOn = (date) => employees.filter((employee) => underContract(employee, date));
  // Couples (jour ouvré, salarié sous contrat) répartis uniformément sur l'année, sans doublon.
  const spreadPairs = (count) => {
    const pairs = workdays.flatMap((date) => fieldStaffOn(date).map((employee) => ({ date, employee })));
    if (pairs.length < count) abort("historique de planning impossible à répartir");
    return Array.from({ length: count }, (_, index) => pairs[Math.floor(index * pairs.length / count)]);
  };
  const affectationPairs = spreadPairs(780);
  const affectations = Array.from({ length: 780 }, (_, index) => {
    const { date, employee } = affectationPairs[index];
    return {
      id: stableId("affectation", index), entreprise_id: COMPANY_ID, chantier_id: chantiers[index % 18].id,
      employe_id: employee.id, date, heures: employee.__key === "APP" || index % 19 === 0 ? 7 : 8,
      tache: `Affectation chantier RECETTE ${1 + (index % 18)}`, notes: marker(index % 97 === 0 ? "conflit limité volontaire" : "planning annuel"),
    };
  });
  const pointagePairs = spreadPairs(1500);
  const pointages = Array.from({ length: 1500 }, (_, index) => {
    const { date, employee } = pointagePairs[index];
    const incomplete = index % 137 === 0;
    return {
      id: stableId("pointage", index), entreprise_id: COMPANY_ID, employe_id: employee.id,
      chantier_id: chantiers[index % 18].id, date, heures_normales: incomplete ? 4 : employee.__key === "APP" ? 7 : 8,
      heures_supplementaires: index % 29 === 0 ? 1.5 : 0, pause_minutes: 45,
      tache: "Pointage administratif RECETTE", commentaire: marker(incomplete ? "journée incomplète volontaire" : "historique administratif"),
      origine_pointage: "regularisation_responsable", verification_statut: incomplete ? "a_verifier" : "valide",
    };
  });

  const absences = Array.from({ length: 30 }, (_, index) => {
    const date = workdays[Math.floor((index + 1) * workdays.length / 31)];
    const eligible = staffOn(date).filter((employee) => employee.__key !== "GERANT");
    return {
    id: stableId("absence-affectation", index), entreprise_id: COMPANY_ID, chantier_id: null,
    employe_id: eligible[index % eligible.length].id,
    date, heures: index % 6 === 0 ? 4 : 7,
    tache: ["Congé payé RECETTE", "Formation RECETTE", "Récupération RECETTE", "Absence TEST"][index % 4],
    notes: marker("absence administrative; aucune demande personnelle simulée"),
    type_activite: ["conge", "formation", "autre"][index % 3], lieu_activite: null,
    };
  });

  const vehicles = Array.from({ length: 6 }, (_, index) => ({
    id: stableId("vehicule", index), entreprise_id: COMPANY_ID,
    immatriculation: `TEST-${String(index + 1).padStart(3, "0")}-ZZ`, marque: "MARQUE TEST", modele: `Modèle RECETTE ${index + 1}`,
    type: index === 4 ? "voiture" : index === 5 ? "autre" : "utilitaire",
    statut: index === 5 ? "hors_service" : index === 3 ? "maintenance" : "actif",
    date_mise_circulation: addDays("2020-01-01", index * 180), kilometrage: 0,
    controle_technique_echeance: addDays(PERIOD_END, index * 20 - 30), assurance_echeance: addDays(PERIOD_END, index * 25),
    prochain_entretien_date: addDays(PERIOD_END, index * 12 - 10), notes: marker("véhicule fictif; immatriculation non réelle"),
  }));
  const vehicleHistory = Array.from({ length: 45 }, (_, index) => ({
    id: stableId("releve-km", index), entreprise_id: COMPANY_ID, vehicule_id: vehicles[index % 6].id,
    date_releve: addDays(PERIOD_START, index * 7), kilometrage: 5000 + (index % 6) * 10000 + Math.floor(index / 6) * 1200,
    note: marker("relevé kilométrique"),
  }));

  const tools = Array.from({ length: 50 }, (_, index) => {
    const statut = index === 47 ? "perdu" : index >= 44 ? "maintenance" : index % 4 === 0 ? "affecte" : "disponible";
    return {
      id: stableId("outil", index), entreprise_id: COMPANY_ID, reference: `REC-OUT-${String(index + 1).padStart(3, "0")}`,
      designation: `Équipement ${String(index + 1).padStart(2, "0")} TEST`,
      categorie: ["electroportatif", "manuel", "mesure", "securite", "levage", "autre"][index % 6],
      marque: "MARQUE TEST", modele: `REC-${index + 1}`, numero_serie: `SERIE-TEST-${String(index + 1).padStart(4, "0")}`,
      statut, etat: statut === "maintenance" ? "abime" : statut === "perdu" ? "usage" : "bon",
      employe_id: statut === "affecte" ? fieldStaffOn(PERIOD_END)[index % fieldStaffOn(PERIOD_END).length].id : null,
      chantier_id: null, date_achat: addDays("2024-01-01", index * 12), prix_achat_ht: 45 + index * 23,
      prochaine_verification: addDays(PERIOD_END, index - 15), notes: marker("outillage fictif"),
    };
  });
  const toolMovements = Array.from({ length: 75 }, (_, index) => {
    const date = addDays(PERIOD_START, index * 4);
    return {
      id: stableId("mouvement-outil", index), entreprise_id: COMPANY_ID, outil_id: tools[index % 50].id,
      type: ["affectation", "retour", "maintenance"][index % 3], statut_avant: index % 3 === 0 ? "disponible" : "affecte",
      statut_apres: index % 3 === 0 ? "affecte" : index % 3 === 1 ? "disponible" : "maintenance",
      employe_id: fieldStaffOn(date)[index % fieldStaffOn(date).length].id, chantier_id: index % 2 ? chantiers[index % 18].id : null,
      etat: index % 3 === 2 ? "abime" : "bon", note: marker("historique outillage"), date_mouvement: date,
    };
  });

  const expenses = Array.from({ length: 80 }, (_, index) => ({
    id: stableId("note-frais", index), entreprise_id: COMPANY_ID,
    employe_id: staffOn(addDays(PERIOD_START, index * 4))[index % staffOn(addDays(PERIOD_START, index * 4)).length].id,
    date_frais: addDays(PERIOD_START, index * 4), montant_ttc: round(8 + (index % 13) * 7.45),
    categorie: ["repas", "carburant", "peage", "stationnement", "fournitures", "petit_materiel"][index % 6],
    description: marker(index % 17 === 0 ? "justificatif manquant — import administratif" : "import administratif historique"),
    statut: ["validee", "remboursee", "soumise", "refusee"][index % 4],
    cree_par_utilisateur_id: contextRef("gerant"),
  }));

  const tasks = Array.from({ length: 60 }, (_, index) => ({
    id: stableId("tache", index), chantier_id: chantiers[index % 20].id,
    libelle: `Tâche ${String(index + 1).padStart(2, "0")} RECETTE`, statut: index % 3 === 0 ? "fait" : "a_faire",
    echeance: addDays(PERIOD_START, 20 + index * 5), responsable_id: employees[1 + (index % 10)].id,
    description: marker(index % 11 === 0 ? "tâche en retard volontaire" : "tâche de démonstration"),
    priorite: ["basse", "normale", "haute", "urgente"][index % 4],
  }));
  const notifications = Array.from({ length: 20 }, (_, index) => ({
    id: stableId("notification", index), entreprise_id: COMPANY_ID, utilisateur_id: contextRef("gerant"),
    type: "recette_interne", titre: `Contrôle RECETTE ${index + 1}`, message: marker("notification strictement interne"),
    lien: "/tableau-de-bord", niveau: ["information", "attention", "critique"][index % 3],
    ressource_type: "chantier", ressource_id: chantiers[index % 20].id,
  }));
  const documents = Array.from({ length: 6 }, (_, index) => ({
    stable_name: `document-recette-${index + 1}.pdf`, title: `Document fictif ${index + 1}`,
    watermark: DOCUMENT_MARKER, upload: false,
  }));

  return {
    employees, employeeRates, employeeCosts, clients, contacts, chantiers, prestations, devis, lignesDevis, factures, lignesFactures, paiements,
    suppliers, commandes, lignesCommande, supplierExpenses, articles, stockMovements,
    affectations, pointages, absences, vehicles, vehicleHistory, tools, toolMovements, expenses, tasks, notifications, documents,
  };
}

function validatePlan(plan) {
  const expected = {
    employees: 12, clients: 23, contacts: 25, chantiers: 20, prestations: 24, devis: 35,
    factures: 25, paiements: 20, suppliers: 9, commandes: 18, supplierExpenses: 30,
    articles: 30, stockMovements: 100, affectations: 780, pointages: 1500, absences: 30,
    vehicles: 6, vehicleHistory: 45, tools: 50, toolMovements: 75, expenses: 80, tasks: 60,
    notifications: 20, documents: 6,
  };
  for (const [key, count] of Object.entries(expected)) {
    if (plan[key].length !== count) abort(`volume ${key}: ${plan[key].length}, attendu ${count}`);
  }
  const ids = new Set();
  for (const rows of Object.values(plan)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row.id) {
        if (ids.has(row.id)) abort(`identifiant stable dupliqué: ${row.id}`);
        ids.add(row.id);
      }
      const boundedDateFields = new Set([
        "date", "date_emission", "date_validite", "date_echeance", "date_commande", "date_piece",
        "date_frais", "date_releve", "date_mouvement", "echeance", "date_debut_prevue", "date_fin_prevue",
        "date_debut_reelle", "date_fin_reelle",
      ]);
      for (const [key, value] of Object.entries(row)) {
        if (boundedDateFields.has(key) && typeof value === "string" && /^202[56]-/.test(value)) {
          assertDate(value, `${key} (${row.id ?? "sans id"})`);
        }
      }
      const serialized = JSON.stringify(row);
      if (/\b(?:sk_live|pk_live|whsec_|eyJ[A-Za-z0-9_-]{10,})/i.test(serialized)) abort("secret potentiel dans le plan");
      if (/\.(?:fr|com|net|org)\b/i.test(serialized) && !serialized.includes(MANAGER_EMAIL)) abort("domaine réel détecté");
    }
  }
  const depositAssignments = plan.employees.filter((row) => row.__role === "Compte dépôt");
  if (depositAssignments.length) abort("Compte dépôt attribué à une fiche salarié");
  if (plan.employees.filter((row) => row.email === MANAGER_EMAIL).length !== 1) abort("fiche Gérant non unique");
  if (plan.employeeRates.length !== plan.employees.length || plan.employeeCosts.length !== plan.employees.length) {
    abort("taux ou coûts horaires non alignés sur les salariés");
  }
  if (plan.devis.some((row) => row.statut !== "brouillon") || plan.commandes.some((row) => row.statut !== "brouillon")
      || plan.factures.some((row) => row.statut !== "brouillon")) {
    abort("devis, factures et commandes doivent être insérés en brouillon avant leurs lignes");
  }
  if (plan.lignesCommande.some((row) => row.quantite_recue !== 0 || row.__targetRecue > row.quantite)) {
    abort("réception de commande préparée hors transition métier");
  }
  const employeesById = new Map(plan.employees.map((row) => [row.id, row]));
  const historyDates = [
    ...plan.affectations.map((row) => [row.employe_id, row.date]), ...plan.absences.map((row) => [row.employe_id, row.date]),
    ...plan.pointages.map((row) => [row.employe_id, row.date]), ...plan.toolMovements.map((row) => [row.employe_id, row.date_mouvement]),
    ...plan.expenses.map((row) => [row.employe_id, row.date_frais]),
  ];
  for (const [employeeId, date] of historyDates) {
    const employee = employeesById.get(employeeId);
    if (!employee || date < employee.date_entree || (employee.__targetExit && date > employee.__targetExit)) {
      abort("activité préparée hors du contrat du salarié");
    }
  }
  const quoteCounts = Object.groupBy(plan.devis, (row) => row.__targetStatus);
  if (quoteCounts.accepte?.length !== 22 || quoteCounts.refuse?.length !== 6 || quoteCounts.expire?.length !== 4 || quoteCounts.envoye?.length !== 3) {
    abort("répartition des devis incorrecte");
  }
  const quoteTotals = plan.devis.map((quote) => round(plan.lignesDevis.filter((line) => line.devis_id === quote.id).reduce(
    (sum, line) => sum + line.quantite * line.prix_unitaire_ht * (1 - line.remise_ligne / 100) * (1 + line.taux_tva / 100), 0,
  ) * (1 - quote.remise_globale / 100)));
  if (quoteTotals.some((total) => !Number.isFinite(total) || total <= 0)) abort("total de devis invalide");
  validateCommandNumbers(plan.commandes);
  validateSupplierExpenses(plan);
  const invoiceLifecycle = simulateInvoiceLifecycle(plan);
  if (invoiceLifecycle.some((invoice) => !invoice.initiallyValid)) abort("statut initial de facture incompatible avec montant_paye=0");
  const finalStatuses = Object.groupBy(invoiceLifecycle, (invoice) => invoice.finalStatus);
  if (finalStatuses.payee?.length !== 14 || finalStatuses.payee_partiel?.length !== 6
      || finalStatuses.en_retard?.length !== 3 || finalStatuses.avoir_emis?.length !== 2) {
    abort("répartition finale des statuts de factures incorrecte");
  }
  for (const payment of plan.paiements) {
    const total = round(plan.lignesFactures.filter((line) => line.facture_id === payment.facture_id).reduce(
      (sum, line) => sum + line.quantite * line.prix_unitaire_ht * (1 - line.remise_ligne / 100) * (1 + line.taux_tva / 100), 0,
    ));
    if (payment.montant <= 0 || payment.montant > total) abort("règlement incohérent avec la facture");
  }
  const pointageDates = plan.pointages.map((row) => row.date).sort();
  if (pointageDates[0] > "2025-08-08" || pointageDates.at(-1) < "2026-07-01") abort("pointages insuffisamment répartis sur l'année");
  for (const row of plan.stockMovements) {
    const articleIndex = plan.articles.findIndex((article) => article.id === row.article_id);
    const previous = plan.stockMovements.filter((other) => other.article_id === row.article_id && other.date <= row.date && other.id !== row.id);
    const balance = previous.reduce((sum, movement) => sum + (movement.type === "entree" ? movement.quantite : -movement.quantite), 0);
    if (row.type === "sortie" && balance < row.quantite) abort(`stock négatif préparé pour article ${articleIndex + 1}`);
  }
  return expected;
}

function invoiceTotal(plan, factureId) {
  return round(plan.lignesFactures.filter((line) => line.facture_id === factureId).reduce(
    (sum, line) => sum + line.quantite * line.prix_unitaire_ht * (1 - line.remise_ligne / 100) * (1 + line.taux_tva / 100), 0,
  ));
}

function paymentDerivedStatus(invoice, total, paid, asOf = "2026-08-02") {
  if (["brouillon", "annulee", "avoir_emis"].includes(invoice.statut)) return invoice.statut;
  if (paid >= total && total > 0) return "payee";
  if (paid > 0) return "payee_partiel";
  if (invoice.date_echeance && invoice.date_echeance < asOf) return "en_retard";
  return "envoyee";
}

function simulateInvoiceLifecycle(plan, asOf = "2026-08-02") {
  const paymentsByInvoice = Object.groupBy(plan.paiements, (payment) => payment.facture_id);
  return plan.factures.map((invoice) => {
    const total = invoiceTotal(plan, invoice.id);
    const paid = round((paymentsByInvoice[invoice.id] ?? []).reduce((sum, payment) => sum + payment.montant, 0));
    const initiallyValid = invoice.statut === "brouillon";
    const emittedInvoice = { ...invoice, statut: invoice.__emissionStatus };
    return {
      id: invoice.id,
      type: invoice.type,
      insertionStatus: invoice.statut,
      prePaymentStatus: invoice.__emissionStatus,
      initiallyValid,
      total,
      paid,
      balance: round(total - paid),
      paymentCount: (paymentsByInvoice[invoice.id] ?? []).length,
      finalStatus: paymentDerivedStatus(emittedInvoice, total, paid, asOf),
      dateEcheance: invoice.date_echeance,
    };
  });
}

function validateCommandNumbers(commands, existing = []) {
  const numbers = new Set();
  const plannedByNumber = new Map(commands.map((command) => [command.numero, command]));
  for (const command of commands) {
    const match = /^CMD-(\d{4})-(\d+)$/.exec(command.numero ?? "");
    if (!match) abort("format de numéro de commande non canonique");
    if (match[1] !== command.date_commande.slice(0, 4)) abort("année métier incohérente dans le numéro de commande");
    if (Number(match[2]) <= MAX_GENERATED_REFERENCE) abort("numéro de recette dans la plage du compteur applicatif");
    if (numbers.has(command.numero)) abort("numéro de commande préparé en doublon");
    numbers.add(command.numero);
  }
  for (const row of existing) {
    const planned = plannedByNumber.get(row.numero);
    if (planned && row.id !== planned.id) abort("collision avec un numéro de commande manuel");
  }
  return { count: numbers.size, reservedAbove: MAX_GENERATED_REFERENCE };
}

function validateSupplierExpenses(plan, existing = []) {
  const commandsById = new Map(plan.commandes.map((command) => [command.id, command]));
  const plannedById = new Map(plan.supplierExpenses.map((expense) => [expense.id, expense]));
  const plannedByUniqueKey = new Map();
  let linkedToCommands = 0;
  for (const expense of plan.supplierExpenses) {
    const uniqueKey = `${expense.entreprise_id}:${expense.fournisseur_id}:${expense.numero_piece}`;
    if (plannedByUniqueKey.has(uniqueKey)) abort("clé unique de dépense fournisseur préparée en doublon");
    plannedByUniqueKey.set(uniqueKey, expense);
    if (!expense.commande_id) continue;
    linkedToCommands += 1;
    const command = commandsById.get(expense.commande_id);
    if (!command) abort("dépense liée à une commande déterministe absente");
    if (expense.entreprise_id !== command.entreprise_id || expense.fournisseur_id !== command.fournisseur_id) {
      abort("dépense incompatible avec l'entreprise ou le fournisseur de sa commande");
    }
    if (expense.chantier_id !== command.chantier_id) abort("dépense incompatible avec le chantier de sa commande");
  }
  for (const row of existing) {
    const plannedByRowId = plannedById.get(row.id);
    const uniqueKey = `${row.entreprise_id}:${row.fournisseur_id}:${row.numero_piece}`;
    const plannedByRowKey = plannedByUniqueKey.get(uniqueKey);
    if (!plannedByRowId && plannedByRowKey) abort("collision avec une dépense fournisseur manuelle");
    if (!plannedByRowId) continue;
    const comparableColumns = [
      "entreprise_id", "fournisseur_id", "chantier_id", "commande_id", "numero_piece", "categorie",
      "date_piece", "date_echeance", "montant_ht", "montant_tva", "notes",
    ];
    if (comparableColumns.some((column) => !sameStoredValue(row[column], plannedByRowId[column]))
        || !String(row.notes ?? "").includes(MARKER)) {
      abort("dépense fournisseur déterministe existante incompatible");
    }
  }
  return {
    count: plan.supplierExpenses.length,
    linkedToCommands,
    withoutCommand: plan.supplierExpenses.length - linkedToCommands,
    existingDeterministicExpenses: existing.filter((row) => plannedById.has(row.id)).length,
  };
}

function sameStoredValue(stored, planned) {
  if (stored == null || planned == null) return stored == null && planned == null;
  if (typeof planned === "number") return Number(stored) === planned;
  return stored === planned;
}

function cleanRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key, value]) => !key.startsWith("__") && value !== undefined)));
}

function linkedProjectRef(root = ROOT) {
  const file = path.join(root, "supabase", ".temp", "project-ref");
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8").trim();
}

function vercelProjectName(root = ROOT) {
  const projectFile = path.join(root, ".vercel", "project.json");
  if (!fs.existsSync(projectFile)) return null;
  return JSON.parse(fs.readFileSync(projectFile, "utf8")).projectName ?? null;
}

// Liaisons locales injectables pour les tests ; en exécution réelle elles sont lues sur disque.
function safeEnvironment(env, { linkedRef = linkedProjectRef(), vercelProject = vercelProjectName() } = {}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) abort("NEXT_PUBLIC_SUPABASE_URL absent");
  let parsed;
  try { parsed = new URL(url); } catch { abort("URL Supabase invalide"); }
  if (parsed.protocol !== "https:" || parsed.hostname !== `${PROJECT_REF}.supabase.co`) abort("URL Supabase hors cible Preview");
  if (env.SUPABASE_PROJECT_REF !== PROJECT_REF) abort("SUPABASE_PROJECT_REF absent ou incorrect");
  if (env.ELSATIA_SUPABASE_PROJECT_NAME !== PROJECT_NAME) abort("nom du projet Preview absent ou incorrect");
  if (env.FEATURE_BOUTIQUE_ENABLED !== "false" || env.FEATURE_AI_ENABLED !== "false" || env.FEATURE_CRONS_ENABLED !== "false") {
    abort("garde-fou Preview désactivé ou indéterminé");
  }
  if (env.VERCEL_ENV === "production" || /elsatia\.fr|liria/i.test(env.NEXT_PUBLIC_APP_URL ?? "")) abort("environnement Production ou historique détecté");
  for (const [key, value] of Object.entries(env)) {
    if (key.includes("STRIPE") && typeof value === "string" && /^(?:sk|pk)_live_/.test(value)) abort("secret Stripe Live détecté");
  }
  if (!vercelProject) abort("liaison Vercel locale absente");
  if (vercelProject !== PROJECT_NAME) abort("worktree lié à un autre projet Vercel");
  // L'exécution passe par `supabase db query --linked` : le projet réellement lié par la CLI
  // doit être la Preview, indépendamment des variables d'environnement (même règle que
  // scripts/garde-scripts-production.mjs).
  if (linkedRef !== PROJECT_REF) abort("projet lié par la CLI Supabase absent ou différent de la Preview");
}

// ═══════════════════════════════════════════════════════════════════════
// Exécution SQL
// ═══════════════════════════════════════════════════════════════════════
//
// Depuis la réconciliation ACL canonique (20260902000255), `service_role` n'a plus aucun
// droit sur les tables métier (employes, clients, devis, factures, commandes…) : l'ancien
// peuplement par PostgREST en service_role est refusé dès la lecture. Rendre ces droits
// pour un seed serait une régression de sécurité. Le seed produit donc un script SQL
// déterministe, exécuté comme les autres scripts de recette Preview par
// `supabase db query --linked` (rôle postgres), après les mêmes gardes de cible.
//
// Contrat du script :
//   - préflight en lecture seule (entreprise, postes, compte Gérant, capacité, collisions)
//     avant toute écriture, rejoué à chaque exécution ;
//   - un module = une transaction : une interruption laisse des modules entiers, jamais
//     un module à moitié écrit ; la reprise ré-exécute le script complet ;
//   - insertion seulement des UUID déterministes absents (jamais d'UPDATE de donnée
//     existante), puis contrôle de chaque ligne présente (entreprise, marqueur, valeurs) ;
//   - les documents sont créés en brouillon, lignes posées, puis suivent leurs transitions
//     métier (devis envoyé → accepté/refusé/expiré, facture émise, commande envoyée →
//     confirmée → réceptionnée par le moteur canonique) : aucun trigger n'est désactivé,
//     aucun garde n'est contourné.

const JSON_TAG = "$seed_json$";

const MODULE_DEFINITIONS = [
  // clé du plan, table, colonne clé, [colonne marqueur, marqueur], entreprise ?, colonnes comparées
  ["employees", "employes", "id", ["notes", MARKER], true, ["reference_interne", "email", "date_entree"]],
  ["employeeRates", "employes_taux_facture", "employe_id", null, true, ["taux_horaire"]],
  ["employeeCosts", "employes_cout_horaire", "employe_id", null, true, ["cout_horaire"]],
  ["clients", "clients", "id", ["notes", MARKER], true, ["reference_interne"]],
  ["contacts", "contacts_clients", "id", ["nom", "TEST"], false, ["client_id"]],
  ["prestations", "prestations_catalogue", "id", ["designation", "RECETTE"], true, null],
  ["suppliers", "fournisseurs", "id", ["notes", MARKER], true, ["reference"]],
  ["articles", "articles_stock", "id", ["reference", "REC-ART-"], true, null],
  ["vehicles", "vehicules", "id", ["notes", MARKER], true, ["immatriculation"]],
  ["tools", "outils", "id", ["notes", MARKER], true, ["reference"]],
  ["chantiers", "chantiers", "id", ["reference_interne", "REC-CHA-"], true, ["client_id"]],
  ["tasks", "taches", "id", ["description", MARKER], false, ["chantier_id"]],
  ["devis", "devis", "id", ["notes_internes", MARKER], true, ["client_id", "chantier_id", "date_emission"]],
  ["lignesDevis", "lignes_devis", "id", ["description", MARKER], false, ["devis_id", "quantite", "prix_unitaire_ht", "taux_tva"]],
  ["devisTransitions"],
  ["factures", "factures", "id", ["notes_internes", MARKER], true, ["client_id", "devis_origine_id", "type", "date_emission"]],
  ["lignesFactures", "lignes_factures", "id", ["description", MARKER], false, ["facture_id", "quantite", "prix_unitaire_ht", "taux_tva"]],
  ["invoiceEmission"],
  ["paiements", "paiements", "id", ["reference", MARKER], false, ["facture_id", "montant", "date"]],
  ["commandes", "commandes_fournisseurs", "id", ["notes", MARKER], true, ["fournisseur_id", "chantier_id", "numero", "date_commande"]],
  ["lignesCommande", "lignes_commande", "id", ["designation", "TEST"], true,
    ["commande_id", "designation", "quantite", "unite", "prix_unitaire_ht", "taux_tva", "ordre"]],
  ["commandeTransitions"],
  ["supplierExpenses", "depenses_fournisseurs", "id", ["notes", MARKER], true, "strict"],
  ["employeeReentry"],
  ["stockMovements", "mouvements_stock", "id", ["motif", MARKER], true, "strict"],
  ["affectations", "affectations", "id", ["notes", MARKER], true, "strict"],
  ["absences", "affectations", "id", ["notes", MARKER], true, "strict"],
  ["pointages", "pointages", "id", ["commentaire", MARKER], true, "strict"],
  ["vehicleHistory", "releves_kilometrage", "id", ["note", MARKER], true, "strict"],
  ["toolMovements", "mouvements_outillage", "id", ["note", MARKER], true, "strict"],
  ["expenses", "notes_frais", "id", ["description", MARKER], true, "strict"],
  ["notifications", "notifications_utilisateurs", "id", ["message", MARKER], true, "strict"],
  ["employeeExits"],
  ["verification"],
];

// Colonnes strictes calculées par un trigger métier au moment de l'insertion : elles ne font
// pas partie du contrat de comparaison (la base, pas le seed, en est la source de vérité).
const TRIGGER_DERIVED_COLUMNS = {
  depenses_fournisseurs: ["date_echeance", "montant_tva"],
};

const DEVIS_PATHS = {
  envoye: ["envoye"],
  accepte: ["envoye", "accepte"],
  refuse: ["envoye", "refuse"],
  expire: ["envoye", "expire"],
};

const COMMAND_PATHS = {
  // statut cible → statuts traversés depuis le brouillon (réception incluse).
  confirmee: ["envoyee", "confirmee"],
  recue_partiel: ["envoyee", "confirmee", "reception"],
  recue: ["envoyee", "confirmee", "reception"],
  annulee: ["envoyee", "annulee"],
};

function jsonLiteral(value) {
  const text = JSON.stringify(value);
  if (text.includes(JSON_TAG)) abort("marqueur de citation SQL présent dans les données");
  return `${JSON_TAG}${text}${JSON_TAG}`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(values) {
  return `array[${values.map(sqlText).join(", ")}]::text[]`;
}

function plannedColumns(rows) {
  const columns = new Set();
  for (const row of rows) for (const column of Object.keys(row)) columns.add(column);
  return [...columns];
}

function executionModules(plan) {
  validateSupplierExpenses(plan);
  return MODULE_DEFINITIONS.map(([key, table, keyColumn, markerSpec, scoped, compare]) => {
    if (!table) return { key, kind: key };
    const rows = cleanRows(plan[key]);
    const columns = plannedColumns(rows);
    let compared = compare;
    if (compare === "strict") {
      const derived = new Set(TRIGGER_DERIVED_COLUMNS[table] ?? []);
      compared = columns.filter((column) => !derived.has(column));
    }
    return {
      key, kind: "insert", table, keyColumn, rows, columns,
      markerColumn: markerSpec?.[0] ?? null, marker: markerSpec?.[1] ?? null,
      scoped, compared: compared ?? [],
    };
  });
}

function preambleSql() {
  return `-- ${MARKER} — script généré par scripts/seed-elsatia-preview-year.mjs
-- ${DOCUMENT_MARKER}
-- Cible verrouillée : ${PROJECT_NAME} (${PROJECT_REF}) / entreprise ${COMPANY_ID}.
-- Un module = une transaction. Rejouable : seuls les UUID déterministes absents sont insérés.
set statement_timeout = '15min';
set client_min_messages = warning;
-- Une seule exécution à la fois : une relance pendant qu'une exécution interrompue (client
-- coupé, backend encore actif) termine son module attend la fin de celle-ci au lieu de la
-- concurrencer. Verrou de session, libéré à la déconnexion.
select pg_advisory_lock(hashtext(${"'"}${MARKER}${"'"})) is null as verrou_seed;

create temp table if not exists seed_contexte (cle text primary key, valeur text not null);

create or replace function pg_temp.seed_resoudre(p_lignes text) returns jsonb
language plpgsql as $f$
declare
  v_texte text := p_lignes;
  v record;
begin
  for v in select cle, valeur from pg_temp.seed_contexte loop
    v_texte := replace(v_texte, '{{' || v.cle || '}}', v.valeur);
  end loop;
  if v_texte like '%{{%}}%' then
    raise exception 'ARRÊT SÛR: référence de contexte non résolue dans le plan';
  end if;
  return v_texte::jsonb;
end;
$f$;

-- Insertion des seules lignes déterministes absentes, puis contrôle de TOUTES les lignes
-- du plan présentes en base : entreprise, marqueur de recette, valeurs comparées.
create or replace function pg_temp.seed_inserer(
  p_table text, p_cle text, p_lignes jsonb, p_colonnes text[], p_comparees text[],
  p_marqueur_col text, p_marqueur text, p_entreprise uuid
) returns integer
language plpgsql as $f$
declare
  v_cols text;
  v_insere integer;
  v_n integer;
  v_attendu integer := jsonb_array_length(p_lignes);
begin
  select string_agg(format('%I', c), ', ') into v_cols from unnest(p_colonnes) c;
  execute format(
    'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) p
      where not exists (select 1 from public.%1$I t where t.%3$I = p.%3$I)',
    p_table, v_cols, p_cle) using p_lignes;
  get diagnostics v_insere = row_count;

  execute format(
    'select count(*) from jsonb_populate_recordset(null::public.%1$I, $1) p join public.%1$I t on t.%2$I = p.%2$I',
    p_table, p_cle) into v_n using p_lignes;
  if v_n <> v_attendu then
    raise exception 'ARRÊT SÛR: % ligne(s) déterministe(s) absente(s) dans % après insertion', v_attendu - v_n, p_table;
  end if;

  if p_entreprise is not null then
    execute format(
      'select count(*) from jsonb_populate_recordset(null::public.%1$I, $1) p join public.%1$I t on t.%2$I = p.%2$I
        where t.entreprise_id is distinct from $2',
      p_table, p_cle) into v_n using p_lignes, p_entreprise;
    if v_n > 0 then raise exception 'ARRÊT SÛR: ligne % rattachée à une autre entreprise', p_table; end if;
  end if;

  if p_marqueur_col is not null then
    execute format(
      'select count(*) from jsonb_populate_recordset(null::public.%1$I, $1) p join public.%1$I t on t.%2$I = p.%2$I
        where strpos(coalesce(t.%3$I::text, ''''), $2) = 0',
      p_table, p_cle, p_marqueur_col) into v_n using p_lignes, p_marqueur;
    if v_n > 0 then raise exception 'ARRÊT SÛR: collision avec une donnée manuelle dans %', p_table; end if;
  end if;

  if coalesce(array_length(p_comparees, 1), 0) > 0 then
    execute format(
      'select count(*) from jsonb_populate_recordset(null::public.%1$I, $1) p join public.%1$I t on t.%2$I = p.%2$I
        where (select jsonb_object_agg(c, to_jsonb(t) -> c) from unnest($2::text[]) c)
              is distinct from (select jsonb_object_agg(c, to_jsonb(p) -> c) from unnest($2::text[]) c)',
      p_table, p_cle) into v_n using p_lignes, p_comparees;
    if v_n > 0 then
      raise exception 'ARRÊT SÛR: % donnée(s) déterministe(s) existante(s) incompatible(s) dans %', v_n, p_table;
    end if;
  end if;
  return v_insere;
end;
$f$;
`;
}

function preflightSql(plan) {
  const plannedActive = plan.employees.filter((row) => row.statut !== "sorti").map((row) => row.id);
  const strictTables = [...new Set(MODULE_DEFINITIONS.filter((definition) => definition[5] === "strict").map((definition) => definition[1]))];
  const strictIds = Object.fromEntries(strictTables.map((table) => [table, MODULE_DEFINITIONS
    .filter((definition) => definition[1] === table)
    .flatMap((definition) => plan[definition[0]].map((row) => row.id))]));
  return `-- @preflight
begin;
do $preflight$
declare
  v_entreprises integer;
  v_postes text;
  v_gerant_poste uuid;
  v_depot_poste uuid;
  v_uid uuid;
  v_n integer;
  v_catalogue integer;
  v_actifs integer;
  v_capacite integer;
  v_table text;
  v_ids jsonb := ${jsonLiteral(strictIds)}::jsonb;
begin
  select count(*) into v_entreprises from public.entreprises where nom = ${sqlText(COMPANY_NAME)};
  if v_entreprises <> 1 or not exists (select 1 from public.entreprises where id = ${sqlText(COMPANY_ID)} and nom = ${sqlText(COMPANY_NAME)}) then
    raise exception 'ARRÊT SÛR: entreprise cible non unique ou non conforme';
  end if;

  select string_agg(nom, '|' order by nom) into v_postes from public.postes where entreprise_id = ${sqlText(COMPANY_ID)};
  if v_postes is distinct from (select string_agg(n, '|' order by n) from unnest(${sqlTextArray(ALL_ROLES)}) n) then
    raise exception 'ARRÊT SÛR: modèle des dix postes non conforme';
  end if;
  select id into v_gerant_poste from public.postes where entreprise_id = ${sqlText(COMPANY_ID)} and nom = 'Gérant';
  select id into v_depot_poste from public.postes where entreprise_id = ${sqlText(COMPANY_ID)} and nom = 'Compte dépôt';

  -- Gérant : identifié par Auth (adresse normalisée), puis par son UUID, jamais par utilisateurs.email.
  select count(*) into v_n from auth.users where lower(btrim(email)) = ${sqlText(MANAGER_EMAIL)};
  if v_n <> 1 then raise exception 'ARRÊT SÛR: compte Auth Gérant %', case when v_n = 0 then 'absent' else 'dupliqué' end; end if;
  select id into v_uid from auth.users where lower(btrim(email)) = ${sqlText(MANAGER_EMAIL)};
  if not exists (select 1 from public.utilisateurs where id = v_uid) then
    raise exception 'ARRÊT SÛR: profil public Gérant absent';
  end if;
  select count(*) into v_n from public.utilisateurs_entreprises where utilisateur_id = v_uid and statut = 'actif';
  if v_n <> 1 then raise exception 'ARRÊT SÛR: appartenance active du Gérant absente ou multiple'; end if;
  if not exists (select 1 from public.utilisateurs_entreprises where utilisateur_id = v_uid and statut = 'actif'
                   and entreprise_id = ${sqlText(COMPANY_ID)} and poste_id = v_gerant_poste) then
    raise exception 'ARRÊT SÛR: appartenance du Gérant associée à une autre entreprise ou un autre poste';
  end if;
  select count(*) into v_n from public.utilisateurs_entreprises where entreprise_id = ${sqlText(COMPANY_ID)} and statut = 'actif';
  if v_n <> 1 then raise exception 'ARRÊT SÛR: appartenance active unique de l''entreprise non conforme'; end if;

  if exists (select 1 from public.utilisateurs_entreprises where entreprise_id = ${sqlText(COMPANY_ID)} and poste_id = v_depot_poste)
     or exists (select 1 from public.employes where entreprise_id = ${sqlText(COMPANY_ID)} and poste_id = v_depot_poste) then
    raise exception 'ARRÊT SÛR: Compte dépôt attribué';
  end if;

  -- Le Gérant porte tout le catalogue des permissions, sauf mode_compte_depot. Le catalogue
  -- grandit avec les migrations (99 → 100 en 20260819000216) : la référence est la base.
  select count(*) into v_catalogue from public.permissions_disponibles;
  select count(*) into v_n from public.permissions_poste where entreprise_id = ${sqlText(COMPANY_ID)} and poste_id = v_gerant_poste;
  if v_n <> v_catalogue then raise exception 'ARRÊT SÛR: le rôle Gérant ne couvre pas exactement le catalogue des permissions (% / %)', v_n, v_catalogue; end if;
  select count(*) into v_n from public.permissions_poste where entreprise_id = ${sqlText(COMPANY_ID)} and poste_id = v_gerant_poste and autorise;
  if v_n <> v_catalogue - 1 or not exists (
       select 1 from public.permissions_poste where entreprise_id = ${sqlText(COMPANY_ID)} and poste_id = v_gerant_poste
         and cle_permission = 'mode_compte_depot' and autorise = false) then
    raise exception 'ARRÊT SÛR: mode_compte_depot doit rester le seul droit désactivé du Gérant';
  end if;

  select count(*) into v_n from public.employes where entreprise_id = ${sqlText(COMPANY_ID)} and lower(btrim(email)) = ${sqlText(MANAGER_EMAIL)};
  if v_n > 1 then raise exception 'ARRÊT SÛR: plusieurs fiches salarié portent l''adresse du Gérant'; end if;
  if v_n = 1 and not exists (select 1 from public.employes where id = ${sqlText(stableId("employe", "GERANT"))}) then
    raise exception 'ARRÊT SÛR: une fiche Gérant manuelle incompatible existe déjà; aucune fusion automatique autorisée';
  end if;

  -- Capacité de personnes (trg_capacite_personnes_actives) : vérifiée avant toute écriture.
  select count(*) into v_actifs from public.employes e
   where e.entreprise_id = ${sqlText(COMPANY_ID)} and e.statut is distinct from 'sorti'
     and e.compte_application_statut is distinct from 'ferme'
     and e.id <> all(${sqlTextArray(plannedActive)}::uuid[]);
  v_capacite := public.capacite_personnes_totale(${sqlText(COMPANY_ID)});
  if v_actifs + ${plannedActive.length} > v_capacite then
    raise exception 'ARRÊT SÛR: capacité de personnes insuffisante (% actives hors seed + ${plannedActive.length} prévues > %). Un opérateur plateforme doit ajuster la capacité avant le peuplement.', v_actifs, v_capacite;
  end if;

  -- Numéros de commande et pièces fournisseurs : aucune collision avec une donnée manuelle.
  if exists (select 1 from public.commandes_fournisseurs c
              where c.entreprise_id = ${sqlText(COMPANY_ID)} and c.numero = any(${sqlTextArray(plan.commandes.map((row) => row.numero))})
                and c.id <> all(${sqlTextArray(plan.commandes.map((row) => row.id))}::uuid[])) then
    raise exception 'ARRÊT SÛR: collision avec un numéro de commande manuel';
  end if;
  if exists (select 1 from public.depenses_fournisseurs d
              where d.entreprise_id = ${sqlText(COMPANY_ID)} and d.numero_piece = any(${sqlTextArray(plan.supplierExpenses.map((row) => row.numero_piece))})
                and d.id <> all(${sqlTextArray(plan.supplierExpenses.map((row) => row.id))}::uuid[])) then
    raise exception 'ARRÊT SÛR: collision avec une dépense fournisseur manuelle';
  end if;

  -- Tables historisées strictement insert-only : aucune ligne étrangère au seed dans
  -- l'entreprise, sinon la reprise pourrait mélanger saisie réelle et recette.
  for v_table in select jsonb_object_keys(v_ids) loop
    execute format('select count(*) from public.%I t where t.entreprise_id = $1 and t.id <> all($2) and %s',
                   v_table, case v_table when 'notifications_utilisateurs' then 'coalesce(t.type, '''') = ''recette_interne''' else 'true' end)
      into v_n
      using ${sqlText(COMPANY_ID)}::uuid, array(select jsonb_array_elements_text(v_ids -> v_table))::uuid[];
    if v_n > 0 then
      raise exception 'ARRÊT SÛR: donnée non déterministe ou collision métier présente dans % (% ligne(s))', v_table, v_n;
    end if;
  end loop;

  delete from pg_temp.seed_contexte;
  insert into pg_temp.seed_contexte values ('gerant', v_uid::text);
  insert into pg_temp.seed_contexte select 'poste:' || nom, id::text from public.postes where entreprise_id = ${sqlText(COMPANY_ID)};
end;
$preflight$;
commit;
`;
}

function insertModuleSql(module) {
  const lines = jsonLiteral(module.rows);
  return `select pg_temp.seed_inserer(${sqlText(module.table)}, ${sqlText(module.keyColumn)},
  pg_temp.seed_resoudre(${lines}),
  ${sqlTextArray(module.columns)}, ${sqlTextArray(module.compared)},
  ${module.markerColumn ? sqlText(module.markerColumn) : "null"}, ${module.marker ? sqlText(module.marker) : "null"},
  ${module.scoped ? `${sqlText(COMPANY_ID)}::uuid` : "null"}) as ${module.key.toLowerCase()}_inseres;`;
}

function devisTransitionsSql(plan) {
  const targets = plan.devis.map((row) => ({ id: row.id, cible: row.__targetStatus, chemin: DEVIS_PATHS[row.__targetStatus] }));
  if (targets.some((row) => !row.chemin)) abort("statut cible de devis sans transition métier");
  return `do $devis$
declare
  v record;
  v_statut text;
  v_debut integer;
  v_n integer;
begin
  for v in select * from jsonb_to_recordset(${jsonLiteral(targets)}::jsonb) as x(id uuid, cible text, chemin text[]) loop
    select statut into v_statut from public.devis where id = v.id;
    if v_statut is null then raise exception 'ARRÊT SÛR: devis déterministe absent avant transition'; end if;
    -- Reprise : le devis doit se trouver sur le chemin brouillon → … → cible.
    v_debut := case when v_statut = 'brouillon' then 1 else array_position(v.chemin, v_statut) + 1 end;
    if v_debut is null then
      raise exception 'ARRÊT SÛR: devis % dans un statut incompatible (% pour %)', v.id, v_statut, v.cible;
    end if;
    for i in v_debut..coalesce(array_length(v.chemin, 1), 0) loop
      update public.devis set statut = v.chemin[i] where id = v.id and statut = v_statut;
      get diagnostics v_n = row_count;
      if v_n <> 1 then raise exception 'ARRÊT SÛR: transition concurrente du devis %', v.id; end if;
      v_statut := v.chemin[i];
    end loop;
    if v_statut <> v.cible then raise exception 'ARRÊT SÛR: devis % non amené à %', v.id, v.cible; end if;
  end loop;
end;
$devis$;`;
}

function invoiceEmissionSql(plan) {
  const targets = plan.factures.map((row) => ({ id: row.id, cible: row.__emissionStatus }));
  return `do $emission$
declare
  v record;
  v_facture record;
begin
  for v in select * from jsonb_to_recordset(${jsonLiteral(targets)}::jsonb) as x(id uuid, cible text) loop
    select statut, montant_ttc, montant_paye into v_facture from public.factures where id = v.id for update;
    if not found then raise exception 'ARRÊT SÛR: émission impossible, facture déterministe absente'; end if;
    if v_facture.statut <> 'brouillon' then
      if (v.cible = 'avoir_emis' and v_facture.statut <> 'avoir_emis')
         or (v.cible <> 'avoir_emis' and v_facture.statut not in ('envoyee', 'en_retard', 'payee_partiel', 'payee')) then
        raise exception 'ARRÊT SÛR: statut existant incompatible pour la facture %', v.id;
      end if;
      continue;
    end if;
    if v_facture.montant_ttc <= 0 or v_facture.montant_paye <> 0 then
      raise exception 'ARRÊT SÛR: émission impossible, total nul ou règlement prématuré';
    end if;
    update public.factures set statut = v.cible where id = v.id and statut = 'brouillon';
  end loop;
end;
$emission$;`;
}

function commandeTransitionsSql(plan) {
  const linesByCommand = Object.groupBy(plan.lignesCommande, (row) => row.commande_id);
  const targets = plan.commandes.map((row) => ({
    id: row.id,
    cible: row.__targetStatus,
    chemin: COMMAND_PATHS[row.__targetStatus],
    reception: (linesByCommand[row.id] ?? []).map((line) => ({ ligne_id: line.id, quantite_recue: line.__targetRecue })),
  }));
  if (targets.some((row) => !row.chemin)) abort("statut cible de commande sans transition métier");
  return `do $commandes$
declare
  v record;
  v_statut text;
  v_etape text;
  v_ordre text[] := array['brouillon', 'envoyee', 'confirmee', 'recue_partiel', 'recue'];
begin
  for v in select * from jsonb_to_recordset(${jsonLiteral(targets)}::jsonb)
             as x(id uuid, cible text, chemin text[], reception jsonb) loop
    select statut into v_statut from public.commandes_fournisseurs where id = v.id;
    if v_statut is null then raise exception 'ARRÊT SÛR: commande déterministe absente avant transition'; end if;
    if v_statut = v.cible then continue; end if;
    if v_statut = 'annulee' or v_statut = 'recue' then
      raise exception 'ARRÊT SÛR: commande % dans un statut final incompatible (% pour %)', v.id, v_statut, v.cible;
    end if;
    foreach v_etape in array v.chemin loop
      if v_etape = 'reception' then
        -- Moteur canonique de réception (20260922000322) : quantités cumulées cibles,
        -- mouvement de stock pour les lignes reliées à un article, statut recalculé.
        if v_statut in ('envoyee', 'confirmee', 'recue_partiel') then
          v_statut := public.enregistrer_reception_commande_interne(${sqlText(COMPANY_ID)}::uuid, v.id, v.reception, null);
        end if;
      elsif v_etape = 'annulee' then
        if v_statut <> 'annulee' then
          perform public.changer_statut_commande_interne(${sqlText(COMPANY_ID)}::uuid, v.id, 'annulee');
          v_statut := 'annulee';
        end if;
      elsif array_position(v_ordre, v_statut) < array_position(v_ordre, v_etape) then
        perform public.changer_statut_commande_interne(${sqlText(COMPANY_ID)}::uuid, v.id, v_etape);
        v_statut := v_etape;
      end if;
    end loop;
    select statut into v_statut from public.commandes_fournisseurs where id = v.id;
    if v_statut <> v.cible then raise exception 'ARRÊT SÛR: commande % non amenée à % (statut %)', v.id, v.cible, v_statut; end if;
  end loop;
end;
$commandes$;`;
}

function employeeReentrySql(plan) {
  // Reprise d'un état où le salarié est déjà sorti sans son historique (ancien seed) : il est
  // réintégré le temps d'insérer ses affectations, puis ressort au module employeeExits.
  const history = [...plan.affectations, ...plan.absences];
  const targets = plan.employees.filter((row) => row.__targetStatus !== "actif").map((row) => ({
    id: row.id, affectations: history.filter((item) => item.employe_id === row.id).map((item) => item.id),
  }));
  return `do $reentry$
declare
  v record;
begin
  for v in select * from jsonb_to_recordset(${jsonLiteral(targets)}::jsonb) as x(id uuid, affectations uuid[]) loop
    if exists (select 1 from public.employes where id = v.id and statut = 'sorti')
       and exists (select 1 from unnest(v.affectations) a(id) where not exists (select 1 from public.affectations t where t.id = a.id)) then
      update public.employes set statut = 'actif', date_sortie = null where id = v.id and statut = 'sorti';
    end if;
  end loop;
end;
$reentry$;`;
}

function employeeExitsSql(plan) {
  const targets = plan.employees.filter((row) => row.__targetStatus !== "actif")
    .map((row) => ({ id: row.id, statut: row.__targetStatus, date_sortie: row.__targetExit }));
  return `do $sorties$
declare
  v record;
begin
  for v in select * from jsonb_to_recordset(${jsonLiteral(targets)}::jsonb) as x(id uuid, statut text, date_sortie date) loop
    update public.employes set statut = v.statut, date_sortie = v.date_sortie where id = v.id and statut = 'actif';
    if not exists (select 1 from public.employes where id = v.id and statut = v.statut and date_sortie = v.date_sortie) then
      raise exception 'ARRÊT SÛR: sortie du salarié % non appliquée', v.id;
    end if;
  end loop;
end;
$sorties$;`;
}

function verificationSql(plan) {
  const acceptedQuoteIds = plan.devis.filter((quote) => quote.__targetStatus === "accepte").map((quote) => quote.id);
  const expectedReception = plan.lignesCommande.map((line) => ({ id: line.id, quantite_recue: line.__targetRecue }));
  const lifecycle = simulateInvoiceLifecycle(plan).map((invoice) => ({ id: invoice.id, attendu: invoice.finalStatus }));
  return `do $verification$
declare
  v_n integer;
begin
  -- Tâches : les 60 tâches explicites, plus exactement une tâche automatique par ligne de devis accepté.
  select count(*) into v_n from public.taches where id = any(${sqlTextArray(plan.tasks.map((task) => task.id))}::uuid[]);
  if v_n <> ${plan.tasks.length} then raise exception 'ARRÊT SÛR: les ${plan.tasks.length} tâches déterministes ne sont pas toutes présentes'; end if;
  select count(*) into v_n from (
    select l.id from public.lignes_devis l
     where l.devis_id = any(${sqlTextArray(acceptedQuoteIds)}::uuid[])
       and (select count(*) from public.taches t where t.ligne_devis_id = l.id) <> 1) x;
  if v_n > 0 then raise exception 'ARRÊT SÛR: les tâches automatiques des lignes de devis acceptés ne sont pas bijectives'; end if;

  -- Réceptions : quantités cumulées cibles atteintes par le moteur canonique.
  select count(*) into v_n from jsonb_to_recordset(${jsonLiteral(expectedReception)}::jsonb) as x(id uuid, quantite_recue numeric)
    join public.lignes_commande l on l.id = x.id where l.quantite_recue <> x.quantite_recue;
  if v_n > 0 then raise exception 'ARRÊT SÛR: % ligne(s) de commande sans la réception attendue', v_n; end if;

  -- Factures : statuts dérivés des règlements identiques à la simulation du plan.
  select count(*) into v_n from jsonb_to_recordset(${jsonLiteral(lifecycle)}::jsonb) as x(id uuid, attendu text)
    join public.factures f on f.id = x.id where f.statut <> x.attendu;
  if v_n > 0 then raise exception 'ARRÊT SÛR: % facture(s) hors du statut attendu après règlements', v_n; end if;
end;
$verification$;`;
}

function buildExecutionSql(plan) {
  const parts = [preambleSql(), preflightSql(plan)];
  for (const step of executionModules(plan)) {
    let body;
    if (step.kind === "insert") body = insertModuleSql(step);
    else if (step.kind === "devisTransitions") body = devisTransitionsSql(plan);
    else if (step.kind === "invoiceEmission") body = invoiceEmissionSql(plan);
    else if (step.kind === "commandeTransitions") body = commandeTransitionsSql(plan);
    else if (step.kind === "employeeReentry") body = employeeReentrySql(plan);
    else if (step.kind === "employeeExits") body = employeeExitsSql(plan);
    else if (step.kind === "verification") body = verificationSql(plan);
    else abort(`module inconnu: ${step.kind}`);
    parts.push(`-- @module ${step.key}\nbegin;\n${body}\ncommit;\n`);
  }
  parts.push(`-- @summary
select json_build_object(
  'entreprise', ${sqlText(COMPANY_ID)},
  'employes', (select count(*) from public.employes where entreprise_id = ${sqlText(COMPANY_ID)}),
  'devis', (select count(*) from public.devis where entreprise_id = ${sqlText(COMPANY_ID)}),
  'factures', (select count(*) from public.factures where entreprise_id = ${sqlText(COMPANY_ID)}),
  'commandes', (select json_object_agg(statut, n) from (select statut, count(*) n from public.commandes_fournisseurs
                 where entreprise_id = ${sqlText(COMPANY_ID)} group by statut) c),
  'pointages', (select count(*) from public.pointages where entreprise_id = ${sqlText(COMPANY_ID)})
) as ${MARKER.toLowerCase()};
`);
  return parts.join("\n");
}

function buildPreflightSql(plan) {
  // Lecture seule : la transaction est refusée par la base à la moindre écriture.
  return `${preambleSql()}\n${preflightSql(plan).replace("begin;", "begin read only;").replace(/commit;\s*$/, "rollback;\n")}
select json_build_object('preflight', 'OK', 'entreprise', ${sqlText(COMPANY_ID)}) as ${MARKER.toLowerCase()};
`;
}

function summary(plan, expected, liveReadonly = false) {
  return {
    mode: liveReadonly ? "dry-run avec préflight SQL en lecture seule sur la Preview liée" : "dry-run local sans connexion",
    target: { projectRef: PROJECT_REF, projectName: PROJECT_NAME, companyId: COMPANY_ID, companyName: COMPANY_NAME },
    period: { start: PERIOD_START, end: PERIOD_END }, marker: MARKER,
    volumes: expected,
    derived: { lignesDevis: plan.lignesDevis.length, lignesFactures: plan.lignesFactures.length, lignesCommande: plan.lignesCommande.length },
    auth: { existingManager: 1, additionalUsers: 0, personalEmployeeFlowsForFictitiousStaff: false },
    documents: { prepared: plan.documents.length, uploaded: 0 },
    execution: {
      channel: "supabase db query --linked (rôle postgres), jamais service_role",
      modules: executionModules(plan).map((module) => module.key),
      moduleLevelAtomicity: true,
      resume: "rejouer le script complet : seuls les UUID absents sont insérés, les transitions reprennent où elles se sont arrêtées",
    },
    externalEffects: { emails: 0, push: 0, stripe: 0, powens: 0, ai: 0, crons: 0 },
  };
}

function runLinkedSql(sql, label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elsatia-preview-seed-"));
  const file = path.join(directory, `${label}.sql`);
  try {
    fs.writeFileSync(file, sql, { mode: 0o600 });
    execFileSync("npx", ["supabase", "db", "query", "--linked", "--file", file], { cwd: ROOT, stdio: "inherit" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export {
  COMMAND_PATHS,
  DEVIS_PATHS,
  MARKER,
  buildExecutionSql,
  buildPlan,
  buildPreflightSql,
  executionModules,
  parseArgs,
  safeEnvironment,
  simulateInvoiceLifecycle,
  stableId,
  summary,
  validateCommandNumbers,
  validatePlan,
  validateSupplierExpenses,
};

async function main() {
  const options = parseArgs(process.argv);
  const plan = buildPlan();
  const expected = validatePlan(plan);
  if (options.emitSql) {
    // Aucune connexion : écrit le script déterministe pour relecture ou pour le harnais local
    // (scripts/seeds/verify-seeds.mjs). Le script se garde lui-même par son préflight.
    fs.writeFileSync(options.emitSql, buildExecutionSql(plan));
    console.log(`Script SQL écrit dans ${options.emitSql} (aucune connexion, aucune écriture distante).`);
    return;
  }
  if (options.dryRun) {
    if (options.liveReadonly) {
      safeEnvironment(process.env);
      runLinkedSql(buildPreflightSql(plan), "preflight");
    }
    const output = summary(plan, expected, options.liveReadonly);
    console.log(options.json ? JSON.stringify(output, null, 2) : [
      options.liveReadonly
        ? "DRY-RUN VALIDÉ — préflight exécuté en transaction lecture seule, aucune écriture."
        : "DRY-RUN VALIDÉ — aucune connexion créée, aucune écriture possible.",
      `Cible verrouillée: ${PROJECT_NAME} (${PROJECT_REF}) / ${COMPANY_ID}`,
      `Période: ${PERIOD_START} → ${PERIOD_END}`,
      `Volumes: ${JSON.stringify(expected)}`,
      `Dérivés: lignes devis=${plan.lignesDevis.length}, lignes factures=${plan.lignesFactures.length}, lignes commandes=${plan.lignesCommande.length}`,
      "Comptes Auth supplémentaires: 0; téléversements: 0; effets externes: 0.",
    ].join("\n"));
    return;
  }

  safeEnvironment(process.env);
  runLinkedSql(buildExecutionSql(plan), "execution");
  console.log("Peuplement Preview terminé; contrôler les volumes avant toute nouvelle action.");
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    const safe = String(error?.message ?? error).replace(/(?:sk|pk)_[a-z]+_[A-Za-z0-9]+|eyJ[A-Za-z0-9_.-]+/g, "[SECRET MASQUÉ]");
    console.error(safe);
    process.exitCode = 1;
  });
}
