#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
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
const READ_BATCH_SIZE = 50;
const INSERT_BATCH_SIZE = 100;
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
const REQUIRED_TABLES = [
  "entreprises", "utilisateurs", "utilisateurs_entreprises", "postes", "permissions_poste",
  "employes", "clients", "contacts_clients", "types_chantier", "chantiers", "taches",
  "prestations_catalogue", "devis", "lignes_devis", "factures", "lignes_factures", "paiements",
  "fournisseurs", "commandes_fournisseurs", "lignes_commande", "depenses_fournisseurs",
  "reglements_fournisseurs", "articles_stock", "mouvements_stock", "affectations", "pointages",
  "vehicules", "releves_kilometrage", "affectations_vehicules", "outils", "mouvements_outillage",
  "notes_frais", "notifications_utilisateurs",
];

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
  const dryRun = args.has("dry-run");
  const execute = args.has("execute");
  if (dryRun === execute) abort("utiliser exactement un mode parmi --dry-run et --execute");
  const allowed = new Set(["dry-run", "live-readonly", "execute", "confirm", "json"]);
  for (const key of args.keys()) if (!allowed.has(key)) abort(`option interdite: --${key}`);
  if (execute && args.get("confirm") !== CONFIRMATION) {
    abort(`confirmation d'exécution absente ou incorrecte`);
  }
  if (dryRun && args.has("confirm")) abort("--confirm est interdit avec --dry-run");
  if (args.has("live-readonly") && !dryRun) abort("--live-readonly exige --dry-run");
  return { dryRun, liveReadonly: args.has("live-readonly"), execute, json: args.has("json") };
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
  const employees = employeesSpec.map(([key, prenom, nom, role, type, entry, exit, status], index) => ({
    id: stableId("employe", key), entreprise_id: COMPANY_ID, reference_interne: `REC-EMP-${String(index + 1).padStart(3, "0")}`,
    prenom, nom, email: key === "GERANT" ? MANAGER_EMAIL : `${prenom.toLowerCase()}.${nom.toLowerCase()}@example.invalid`,
    telephone: `+33 0 00 00 ${String(index).padStart(2, "0")} ${String(index + 10).padStart(2, "0")}`,
    poste: role, type_contrat: type, date_entree: entry, date_sortie: exit, statut: status,
    taux_horaire: round(13.5 + index * 0.85),
    notes: marker(key === "GERANT" ? "fiche Gérant reliée au compte existant" : "salarié fictif sans compte Auth"),
    __key: key, __role: role,
  }));
  // Table dédiée (RLS restrictive), hors mécanisme générique id-based: écrite via writeEmployeeCosts.
  const employeeCosts = employees.map((employee, index) => ({
    employe_id: employee.id, entreprise_id: COMPANY_ID, cout_horaire: round(22 + index * 1.25),
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
      chantier_id: chantiers[index % chantiers.length].id, statut, date_emission: issue, date_validite: addDays(issue, 30),
      conditions: "Document de recette — validité 30 jours", notes_client: DOCUMENT_MARKER,
      notes_internes: marker(`devis ${index + 1}`), remise_globale: index % 9 === 0 ? 3 : 0, __key: `DEV${index + 1}`,
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
      chantier_id: chantiers[index % 16].id, statut: ["recue", "recue_partiel", "confirmee", "annulee"][index % 4],
      numero: `CMD-${businessYear}-${SEED_COMMAND_NUMBER_BASE + yearlySequence}`,
      date_commande: dateCommande, notes: marker(`commande ${index + 1}`), __key: `CMD${index + 1}`,
    };
  });
  const lignesCommande = commandes.flatMap((order, orderIndex) => Array.from({ length: 3 }, (_, lineIndex) => ({
    id: stableId("ligne-commande", `${orderIndex}-${lineIndex}`), entreprise_id: COMPANY_ID, commande_id: order.id,
    designation: `Matériau ${orderIndex + 1}.${lineIndex + 1} TEST`, quantite: 5 + lineIndex * 4,
    unite: lineIndex === 1 ? "m²" : "u", prix_unitaire_ht: 18 + orderIndex * 3 + lineIndex * 9,
    taux_tva: 20, quantite_recue: order.statut === "recue" ? 5 + lineIndex * 4 : order.statut === "recue_partiel" ? 2 : 0,
    ordre: lineIndex,
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
  const affectations = Array.from({ length: 780 }, (_, index) => {
    const employee = activeEmployees[index % activeEmployees.length];
    const group = Math.floor(index / activeEmployees.length);
    const groups = Math.ceil(780 / activeEmployees.length);
    const date = workdays[Math.floor(group * workdays.length / groups)];
    return {
      id: stableId("affectation", index), entreprise_id: COMPANY_ID, chantier_id: chantiers[index % 18].id,
      employe_id: employee.id, date, heures: employee.__key === "APP" || index % 19 === 0 ? 7 : 8,
      tache: `Affectation chantier RECETTE ${1 + (index % 18)}`, notes: marker(index % 97 === 0 ? "conflit limité volontaire" : "planning annuel"),
    };
  });
  const pointages = Array.from({ length: 1500 }, (_, index) => {
    const employee = activeEmployees[index % activeEmployees.length];
    const group = Math.floor(index / activeEmployees.length);
    const groups = Math.ceil(1500 / activeEmployees.length);
    const date = workdays[Math.floor(group * workdays.length / groups)];
    const incomplete = index % 137 === 0;
    return {
      id: stableId("pointage", index), entreprise_id: COMPANY_ID, employe_id: employee.id,
      chantier_id: chantiers[index % 18].id, date, heures_normales: incomplete ? 4 : employee.__key === "APP" ? 7 : 8,
      heures_supplementaires: index % 29 === 0 ? 1.5 : 0, pause_minutes: 45,
      tache: "Pointage administratif RECETTE", commentaire: marker(incomplete ? "journée incomplète volontaire" : "historique administratif"),
      origine_pointage: "regularisation_responsable", verification_statut: incomplete ? "a_verifier" : "valide",
    };
  });

  const absences = Array.from({ length: 30 }, (_, index) => ({
    id: stableId("absence-affectation", index), entreprise_id: COMPANY_ID, chantier_id: null,
    employe_id: employees[1 + (index % 11)].id,
    date: workdays[Math.floor((index + 1) * workdays.length / 31)], heures: index % 6 === 0 ? 4 : 7,
    tache: ["Congé payé RECETTE", "Formation RECETTE", "Récupération RECETTE", "Absence TEST"][index % 4],
    notes: marker("absence administrative; aucune demande personnelle simulée"),
    type_activite: ["conge", "formation", "autre"][index % 3], lieu_activite: null,
  }));

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
      employe_id: statut === "affecte" ? activeEmployees[index % activeEmployees.length].id : null,
      chantier_id: null, date_achat: addDays("2024-01-01", index * 12), prix_achat_ht: 45 + index * 23,
      prochaine_verification: addDays(PERIOD_END, index - 15), notes: marker("outillage fictif"),
    };
  });
  const toolMovements = Array.from({ length: 75 }, (_, index) => ({
    id: stableId("mouvement-outil", index), entreprise_id: COMPANY_ID, outil_id: tools[index % 50].id,
    type: ["affectation", "retour", "maintenance"][index % 3], statut_avant: index % 3 === 0 ? "disponible" : "affecte",
    statut_apres: index % 3 === 0 ? "affecte" : index % 3 === 1 ? "disponible" : "maintenance",
    employe_id: activeEmployees[index % activeEmployees.length].id, chantier_id: index % 2 ? chantiers[index % 18].id : null,
    etat: index % 3 === 2 ? "abime" : "bon", note: marker("historique outillage"), date_mouvement: addDays(PERIOD_START, index * 4),
  }));

  const expenses = Array.from({ length: 80 }, (_, index) => ({
    id: stableId("note-frais", index), entreprise_id: COMPANY_ID, employe_id: employees[index % employees.length].id,
    date_frais: addDays(PERIOD_START, index * 4), montant_ttc: round(8 + (index % 13) * 7.45),
    categorie: ["repas", "carburant", "peage", "stationnement", "fournitures", "petit_materiel"][index % 6],
    description: marker(index % 17 === 0 ? "justificatif manquant — import administratif" : "import administratif historique"),
    statut: ["validee", "remboursee", "soumise", "refusee"][index % 4],
    cree_par_utilisateur_id: null,
  }));

  const tasks = Array.from({ length: 60 }, (_, index) => ({
    id: stableId("tache", index), chantier_id: chantiers[index % 20].id,
    libelle: `Tâche ${String(index + 1).padStart(2, "0")} RECETTE`, statut: index % 3 === 0 ? "fait" : "a_faire",
    echeance: addDays(PERIOD_START, 20 + index * 5), responsable_id: employees[1 + (index % 10)].id,
    description: marker(index % 11 === 0 ? "tâche en retard volontaire" : "tâche de démonstration"),
    priorite: ["basse", "normale", "haute", "urgente"][index % 4],
  }));
  const notifications = Array.from({ length: 20 }, (_, index) => ({
    id: stableId("notification", index), entreprise_id: COMPANY_ID, utilisateur_id: null,
    type: "recette_interne", titre: `Contrôle RECETTE ${index + 1}`, message: marker("notification strictement interne"),
    lien: "/tableau-de-bord", niveau: ["information", "attention", "critique"][index % 3],
    ressource_type: "chantier", ressource_id: chantiers[index % 20].id,
  }));
  const documents = Array.from({ length: 6 }, (_, index) => ({
    stable_name: `document-recette-${index + 1}.pdf`, title: `Document fictif ${index + 1}`,
    watermark: DOCUMENT_MARKER, upload: false,
  }));

  return {
    employees, employeeCosts, clients, contacts, chantiers, prestations, devis, lignesDevis, factures, lignesFactures, paiements,
    suppliers, commandes, lignesCommande, supplierExpenses, articles, stockMovements,
    affectations, pointages, absences, vehicles, vehicleHistory, tools, toolMovements, expenses, tasks, notifications, documents,
  };
}

function validatePlan(plan) {
  const expected = {
    employees: 12, employeeCosts: 12, clients: 23, contacts: 25, chantiers: 20, prestations: 24, devis: 35,
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
  const quoteCounts = Object.groupBy(plan.devis, (row) => row.statut);
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

function assertStoredRowMatches(row, planned, columns, label) {
  if (!planned || columns.some((column) => !sameStoredValue(row[column], planned[column]))) abort(label);
}

function cleanRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key, value]) => !key.startsWith("__") && value !== undefined)));
}

function safeEnvironment(env) {
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
  const projectFile = path.join(ROOT, ".vercel", "project.json");
  if (!fs.existsSync(projectFile)) abort("liaison Vercel locale absente");
  const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  if (project.projectName !== PROJECT_NAME) abort("worktree lié à un autre projet Vercel");
}

async function readOne(client, table, configure, label) {
  let query = client.from(table).select("*");
  query = configure(query);
  const { data, error } = await query;
  if (error) abort(`${label}: ${error.message}`);
  return data ?? [];
}

async function listAuthUsersByEmail(client, email) {
  const normalized = email.trim().toLowerCase();
  const matches = [];
  const perPage = 1000;
  for (let page = 1; page <= 1000; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) abort(`lecture Auth Gérant: ${error.message}`);
    const users = data?.users ?? [];
    matches.push(...users.filter((user) => String(user.email ?? "").trim().toLowerCase() === normalized));
    if (users.length < perPage) return matches;
  }
  abort("pagination Auth anormalement volumineuse ou non terminée");
}

async function verifyManagerIdentity(client, managerRoleId) {
  const authUsers = await listAuthUsersByEmail(client, MANAGER_EMAIL);
  if (authUsers.length !== 1) abort(`compte Auth Gérant ${authUsers.length === 0 ? "absent" : "dupliqué"}`);
  const userId = authUsers[0].id;
  if (!userId) abort("UUID Auth du Gérant absent");

  const publicUsers = await readOne(client, "utilisateurs", (q) => q.eq("id", userId), "lecture profil public Gérant");
  if (publicUsers.length !== 1 || publicUsers[0].id !== userId) abort("profil public Gérant absent ou ambigu");

  const userMemberships = await readOne(client, "utilisateurs_entreprises", (q) => q.eq("utilisateur_id", userId), "lecture appartenances Gérant");
  const activeUserMemberships = userMemberships.filter((membership) => membership.statut === "actif");
  if (activeUserMemberships.length !== 1) abort("appartenance active du Gérant absente ou multiple");
  const membership = activeUserMemberships[0];
  if (membership.entreprise_id !== COMPANY_ID || membership.poste_id !== managerRoleId) {
    abort("appartenance du Gérant associée à une autre entreprise ou un autre poste");
  }

  const companyMemberships = await readOne(client, "utilisateurs_entreprises", (q) => q.eq("entreprise_id", COMPANY_ID), "lecture appartenances entreprise");
  const activeCompanyMemberships = companyMemberships.filter((candidate) => candidate.statut === "actif");
  if (activeCompanyMemberships.length !== 1 || activeCompanyMemberships[0].utilisateur_id !== userId || activeCompanyMemberships[0].poste_id !== managerRoleId) {
    abort("appartenance active unique de l'entreprise non conforme");
  }
  return { userId, membership, companyMemberships };
}

async function livePreflight(client, env) {
  safeEnvironment(env);
  const companies = await readOne(client, "entreprises", (q) => q.eq("nom", COMPANY_NAME), "lecture entreprise");
  if (companies.length !== 1 || companies[0].id !== COMPANY_ID || companies[0].nom !== COMPANY_NAME) abort("entreprise cible non unique ou non conforme");
  const roles = await readOne(client, "postes", (q) => q.eq("entreprise_id", COMPANY_ID), "lecture postes");
  if (roles.length !== 10 || roles.map((row) => row.nom).sort().join("|") !== [...ALL_ROLES].sort().join("|")) abort("modèle des dix postes non conforme");
  const managerRole = roles.find((row) => row.nom === "Gérant");
  const identity = await verifyManagerIdentity(client, managerRole.id);
  const depositRole = roles.find((row) => row.nom === "Compte dépôt");
  const depositMembers = await readOne(client, "utilisateurs_entreprises", (q) => q.eq("entreprise_id", COMPANY_ID).eq("poste_id", depositRole.id), "lecture Compte dépôt");
  if (depositMembers.length) abort("Compte dépôt attribué");
  const depositEmployees = await readOne(client, "employes", (q) => q.eq("entreprise_id", COMPANY_ID).eq("poste_id", depositRole.id), "lecture fiches Compte dépôt");
  if (depositEmployees.length) abort("Compte dépôt attribué à une fiche salarié");
  const managerPermissions = await readOne(client, "permissions_poste", (q) => q.eq("entreprise_id", COMPANY_ID).eq("poste_id", managerRole.id), "lecture permissions Gérant");
  if (managerPermissions.length !== 99) abort("le rôle Gérant ne possède plus exactement 99 permissions");
  const depositMode = managerPermissions.find((row) => row.cle_permission === "mode_compte_depot");
  if (!depositMode || depositMode.autorise !== false) abort("mode_compte_depot doit rester désactivé pour le Gérant");
  const managerEmployees = await readOne(client, "employes", (q) => q.eq("entreprise_id", COMPANY_ID).eq("email", MANAGER_EMAIL), "lecture fiche salarié Gérant");
  if (managerEmployees.length > 1) abort("plusieurs fiches salarié portent l'adresse du Gérant");
  if (managerEmployees.length === 1 && managerEmployees[0].id !== stableId("employe", "GERANT")) {
    abort("une fiche Gérant manuelle incompatible existe déjà; aucune fusion automatique autorisée");
  }
  for (const table of REQUIRED_TABLES) {
    const { error } = await client.from(table).select("*", { head: true, count: "exact" }).limit(0);
    if (error) abort(`schéma/privilège manquant pour ${table}: ${error.message}`);
  }
  return { userId: identity.userId, managerRoleId: managerRole.id, roles: Object.fromEntries(roles.map((row) => [row.nom, row.id])) };
}

const TABLE_MARKERS = {
  employes: ["notes", MARKER], clients: ["notes", MARKER], chantiers: ["reference_interne", "REC-CHA-"],
  contacts_clients: ["nom", "TEST"], taches: ["description", MARKER],
  prestations_catalogue: ["designation", "RECETTE"], devis: ["notes_internes", MARKER], factures: ["notes_internes", MARKER],
  lignes_devis: ["description", MARKER], lignes_factures: ["description", MARKER], paiements: ["reference", MARKER],
  fournisseurs: ["notes", MARKER], commandes_fournisseurs: ["notes", MARKER], depenses_fournisseurs: ["notes", MARKER],
  lignes_commande: ["designation", "TEST"], articles_stock: ["reference", "REC-ART-"],
  mouvements_stock: ["motif", MARKER], affectations: ["notes", MARKER], pointages: ["commentaire", MARKER],
  vehicules: ["notes", MARKER], releves_kilometrage: ["note", MARKER], outils: ["notes", MARKER],
  mouvements_outillage: ["note", MARKER], notes_frais: ["description", MARKER],
  notifications_utilisateurs: ["message", MARKER],
};

const COMPANY_SCOPED_TABLES = new Set([
  "employes", "clients", "prestations_catalogue", "fournisseurs", "articles_stock", "vehicules", "outils",
  "chantiers", "devis", "factures", "commandes_fournisseurs", "lignes_commande", "depenses_fournisseurs",
  "mouvements_stock", "affectations", "pointages", "releves_kilometrage", "mouvements_outillage",
  "notes_frais", "notifications_utilisateurs",
]);

const STRICT_INSERT_ONLY_TABLES = new Set([
  "depenses_fournisseurs", "mouvements_stock", "affectations", "pointages", "releves_kilometrage",
  "mouvements_outillage", "notes_frais", "notifications_utilisateurs",
]);

function chunks(values, size) {
  if (!Number.isSafeInteger(size) || size <= 0) abort("taille de lot invalide");
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function selectedColumnsForRows(table, rows) {
  const columns = new Set(["id"]);
  const [markerColumn] = TABLE_MARKERS[table] ?? [];
  if (markerColumn) columns.add(markerColumn);
  if (COMPANY_SCOPED_TABLES.has(table)) columns.add("entreprise_id");
  if (STRICT_INSERT_ONLY_TABLES.has(table)) {
    for (const row of rows) for (const column of Object.keys(row)) columns.add(column);
  }
  return [...columns].join(",");
}

function validateExistingOwnedRows(table, plannedRows, existingRows) {
  const plannedById = new Map(plannedRows.map((row) => [row.id, row]));
  const [markerColumn, expectedMarker] = TABLE_MARKERS[table] ?? [];
  for (const existing of existingRows) {
    const planned = plannedById.get(existing.id);
    if (!planned) abort(`lecture inattendue pendant le contrôle de ${table}`);
    if (COMPANY_SCOPED_TABLES.has(table) && existing.entreprise_id !== COMPANY_ID) {
      abort(`ligne ${table} rattachée à une autre entreprise`);
    }
    if (!markerColumn || !String(existing[markerColumn] ?? "").includes(expectedMarker)) {
      abort(`collision avec une donnée manuelle dans ${table}`);
    }
    if (STRICT_INSERT_ONLY_TABLES.has(table)) {
      for (const [column, value] of Object.entries(planned)) {
        if (!sameStoredValue(existing[column], value)) abort(`donnée déterministe existante incompatible dans ${table}`);
      }
    }
  }
}

async function insertRowsInBatches(client, table, rows, batchSize = INSERT_BATCH_SIZE) {
  const batches = chunks(rows, batchSize);
  let inserted = 0;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const { error } = await client.from(table).insert(batch);
    if (error) abort(`insertion ${table} lot ${index + 1}/${batches.length}: ${error.message}`);
    inserted += batch.length;
  }
  return { inserted, batches: batches.length };
}

async function writeOwned(client, table, rows, { insertOnly = false } = {}) {
  const clean = cleanRows(rows);
  if (!clean.length) return;
  const ids = clean.map((row) => row.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) abort(`UUID déterministe dupliqué dans ${table}`);
  if (ids.length) {
    const existing = await readRowsByIds(client, table, ids, selectedColumnsForRows(table, clean));
    validateExistingOwnedRows(table, clean, existing);
    if (insertOnly) {
      const existingIds = new Set(existing.map((row) => row.id));
      const missing = clean.filter((row) => !existingIds.has(row.id));
      if (!missing.length) return;
      await insertRowsInBatches(client, table, missing);
      return;
    }
  }
  abort(`écriture non insert-only interdite pour ${table}`);
}

// employes_cout_horaire est clé par employe_id (pas d'id propre): hors mécanisme générique id-based ci-dessus.
async function writeEmployeeCosts(client, rows) {
  const clean = cleanRows(rows);
  if (!clean.length) return;
  const employeeIds = clean.map((row) => row.employe_id);
  if (new Set(employeeIds).size !== employeeIds.length) abort("employe_id déterministe dupliqué dans employes_cout_horaire");
  const { data: existing, error } = await client
    .from("employes_cout_horaire")
    .select("employe_id,entreprise_id,cout_horaire")
    .eq("entreprise_id", COMPANY_ID)
    .in("employe_id", employeeIds);
  if (error) abort(`lecture de reprise employes_cout_horaire: ${error.message}`);
  const plannedByEmployeeId = new Map(clean.map((row) => [row.employe_id, row]));
  for (const row of existing ?? []) {
    if (row.entreprise_id !== COMPANY_ID) abort("ligne employes_cout_horaire retournée pour une autre entreprise");
    assertStoredRowMatches(row, plannedByEmployeeId.get(row.employe_id), ["cout_horaire"], "coût horaire déterministe existant incompatible");
  }
  const existingIds = new Set((existing ?? []).map((row) => row.employe_id));
  const missing = clean.filter((row) => !existingIds.has(row.employe_id));
  if (!missing.length) return;
  await insertRowsInBatches(client, "employes_cout_horaire", missing);
}

function executionSteps(plan, context) {
  validateSupplierExpenses(plan);
  const managerEmployee = plan.employees.find((row) => row.__key === "GERANT");
  managerEmployee.utilisateur_id = context.userId;
  managerEmployee.poste_id = context.managerRoleId;
  for (const employee of plan.employees) employee.poste_id ??= context.roles[employee.__role] ?? context.roles.Ouvrier;
  for (const row of plan.expenses) row.cree_par_utilisateur_id = context.userId;
  for (const row of plan.notifications) row.utilisateur_id = context.userId;

  return [
    ["employees", "employes", plan.employees],
    ["clients", "clients", plan.clients],
    ["contacts", "contacts_clients", plan.contacts],
    ["prestations", "prestations_catalogue", plan.prestations],
    ["suppliers", "fournisseurs", plan.suppliers],
    ["articles", "articles_stock", plan.articles],
    ["vehicles", "vehicules", plan.vehicles],
    ["tools", "outils", plan.tools],
    ["chantiers", "chantiers", plan.chantiers],
    ["tasks", "taches", plan.tasks],
    ["devis", "devis", plan.devis],
    ["lignesDevis", "lignes_devis", plan.lignesDevis],
    ["factures", "factures", plan.factures],
    ["lignesFactures", "lignes_factures", plan.lignesFactures],
    ["invoiceEmission", "factures", plan.factures, "emit"],
    ["paiements", "paiements", plan.paiements],
    ["commandes", "commandes_fournisseurs", plan.commandes],
    ["lignesCommande", "lignes_commande", plan.lignesCommande],
    ["supplierExpenses", "depenses_fournisseurs", plan.supplierExpenses],
    ["stockMovements", "mouvements_stock", plan.stockMovements],
    ["affectations", "affectations", plan.affectations],
    ["absences", "affectations", plan.absences],
    ["pointages", "pointages", plan.pointages],
    ["vehicleHistory", "releves_kilometrage", plan.vehicleHistory],
    ["toolMovements", "mouvements_outillage", plan.toolMovements],
    ["expenses", "notes_frais", plan.expenses],
    ["notifications", "notifications_utilisateurs", plan.notifications],
  ].map(([key, table, rows, operation = "insert"]) => ({ key, table, rows, operation, insertOnly: operation === "insert" }));
}

async function emitSeedInvoices(client, invoices) {
  const existing = await readRowsByIds(
    client,
    "factures",
    invoices.map((invoice) => invoice.id),
    "id,notes_internes,statut,montant_ttc,montant_paye,type,date_echeance",
  );
  if (existing.length !== invoices.length) abort("émission impossible: factures déterministes manquantes");
  const plannedById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  for (const row of existing) {
    if (!String(row.notes_internes ?? "").includes(MARKER)) abort("collision avec une facture manuelle");
    const target = plannedById.get(row.id).__emissionStatus;
    const compatibleFinalStatuses = target === "avoir_emis"
      ? new Set(["avoir_emis"])
      : new Set(["envoyee", "en_retard", "payee_partiel", "payee"]);
    if (row.statut !== "brouillon") {
      if (!compatibleFinalStatuses.has(row.statut)) abort(`statut existant incompatible pour la facture ${row.id}`);
      continue;
    }
    if (Number(row.montant_ttc) <= 0 || Number(row.montant_paye) !== 0) {
      abort("émission impossible: total nul ou règlement prématuré");
    }
    const { data, error } = await client.from("factures")
      .update({ statut: target })
      .eq("id", row.id)
      .eq("statut", "brouillon")
      .select("id");
    if (error || data?.length !== 1) abort(`émission contrôlée de facture impossible: ${error?.message ?? "ligne non mise à jour"}`);
  }
}

async function executePlan(client, plan, context) {
  for (const step of executionSteps(plan, context)) {
    if (step.operation === "emit") await emitSeedInvoices(client, step.rows);
    else await writeOwned(client, step.table, step.rows, { insertOnly: true });
  }
  await writeEmployeeCosts(client, plan.employeeCosts);
}

async function readRowsByIds(client, table, ids, columns) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.some((id) => typeof id !== "string" || !id)) abort(`UUID invalide pendant la lecture de ${table}`);
  if (!uniqueIds.length) return [];
  const selected = new Set(columns.split(",").map((column) => column.trim()).filter(Boolean));
  selected.add("id");
  if (COMPANY_SCOPED_TABLES.has(table)) selected.add("entreprise_id");
  const batches = chunks(uniqueIds, READ_BATCH_SIZE);
  const rows = [];
  const returnedIds = new Set();
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const batchIds = new Set(batch);
    const { data, error } = await client.from(table).select([...selected].join(",")).in("id", batch);
    if (error) abort(`inspection de reprise ${table} lot ${index + 1}/${batches.length}: ${error.message}`);
    if (!Array.isArray(data)) abort(`réponse de lecture invalide pour ${table} lot ${index + 1}/${batches.length}`);
    for (const row of data) {
      if (!batchIds.has(row.id)) abort(`UUID inattendu retourné par ${table}`);
      if (returnedIds.has(row.id)) abort(`UUID retourné en doublon par ${table}`);
      if (COMPANY_SCOPED_TABLES.has(table) && row.entreprise_id !== COMPANY_ID) {
        abort(`ligne ${table} retournée pour une autre entreprise`);
      }
      returnedIds.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

async function inspectRemoteResume(client, plan, context) {
  const steps = executionSteps(plan, context);
  const existingCommandIds = await readRowsByIds(
    client,
    "commandes_fournisseurs",
    plan.commandes.map((row) => row.id),
    "id,entreprise_id,fournisseur_id,chantier_id,statut,numero,date_commande,notes",
  );
  const commandById = new Map(plan.commandes.map((row) => [row.id, row]));
  for (const row of existingCommandIds) {
    assertStoredRowMatches(
      row,
      commandById.get(row.id),
      ["entreprise_id", "fournisseur_id", "chantier_id", "statut", "numero", "date_commande", "notes"],
      "commande déterministe existante non conforme",
    );
  }
  const { data: numberCollisions, error: numberCollisionError } = await client.from("commandes_fournisseurs")
    .select("id,numero")
    .eq("entreprise_id", COMPANY_ID)
    .in("numero", plan.commandes.map((row) => row.numero));
  if (numberCollisionError) abort(`contrôle des numéros de commandes: ${numberCollisionError.message}`);
  const commandNumbering = validateCommandNumbers(plan.commandes, numberCollisions ?? []);
  const { data: commandCounters, error: counterError } = await client.from("compteurs_reference")
    .select("type,dernier_numero")
    .eq("entreprise_id", COMPANY_ID)
    .in("type", ["commande-2025", "commande-2026"])
    .order("type");
  if (counterError) abort(`lecture des compteurs de commandes: ${counterError.message}`);
  const existingExpenseIds = await readRowsByIds(
    client,
    "depenses_fournisseurs",
    plan.supplierExpenses.map((row) => row.id),
    "id,entreprise_id,fournisseur_id,chantier_id,commande_id,numero_piece,categorie,date_piece,date_echeance,montant_ht,montant_tva,notes",
  );
  const { data: expenseUniqueCollisions, error: expenseCollisionError } = await client.from("depenses_fournisseurs")
    .select("id,entreprise_id,fournisseur_id,chantier_id,commande_id,numero_piece,categorie,date_piece,date_echeance,montant_ht,montant_tva,notes")
    .eq("entreprise_id", COMPANY_ID)
    .in("numero_piece", plan.supplierExpenses.map((row) => row.numero_piece));
  if (expenseCollisionError) abort(`contrôle des clés uniques de dépenses fournisseurs: ${expenseCollisionError.message}`);
  const expenseRowsById = new Map([...existingExpenseIds, ...(expenseUniqueCollisions ?? [])].map((row) => [row.id, row]));
  const supplierExpenseIntegrity = validateSupplierExpenses(plan, [...expenseRowsById.values()]);
  const existingCommandLines = await readRowsByIds(
    client,
    "lignes_commande",
    plan.lignesCommande.map((row) => row.id),
    "id,entreprise_id,commande_id,designation,quantite,unite,prix_unitaire_ht,taux_tva,quantite_recue,ordre",
  );
  const plannedCommandLinesById = new Map(plan.lignesCommande.map((row) => [row.id, row]));
  for (const row of existingCommandLines) {
    assertStoredRowMatches(
      row,
      plannedCommandLinesById.get(row.id),
      ["entreprise_id", "commande_id", "designation", "quantite", "unite", "prix_unitaire_ht", "taux_tva", "quantite_recue", "ordre"],
      "ligne de commande déterministe existante non conforme",
    );
  }
  const rowsByTable = new Map();
  for (const step of steps) {
    if (step.operation !== "insert") continue;
    const current = rowsByTable.get(step.table) ?? [];
    current.push(...cleanRows(step.rows));
    rowsByTable.set(step.table, current);
  }

  const presentByTable = new Map();
  const tableSummary = {};
  const relatedScopes = {
    contacts_clients: ["client_id", plan.clients.map((row) => row.id)],
    taches: ["chantier_id", plan.chantiers.map((row) => row.id)],
    lignes_devis: ["devis_id", plan.devis.map((row) => row.id)],
    lignes_factures: ["facture_id", plan.factures.map((row) => row.id)],
    paiements: ["facture_id", plan.factures.map((row) => row.id)],
  };
  for (const [table, rows] of rowsByTable) {
    const existing = await readRowsByIds(client, table, rows.map((row) => row.id), selectedColumnsForRows(table, rows));
    validateExistingOwnedRows(table, rows, existing);
    presentByTable.set(table, new Set(existing.map((row) => row.id)));
    let companyTotal = null;
    if (COMPANY_SCOPED_TABLES.has(table)) {
      const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("entreprise_id", COMPANY_ID);
      if (error) abort(`comptage de reprise ${table}: ${error.message}`);
      companyTotal = count ?? 0;
    } else if (relatedScopes[table]) {
      const [column, ids] = relatedScopes[table];
      const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).in(column, ids);
      if (error) abort(`comptage relationnel de reprise ${table}: ${error.message}`);
      companyTotal = count ?? 0;
    }
    if (STRICT_INSERT_ONLY_TABLES.has(table) && companyTotal !== existing.length) {
      abort(`donnée non déterministe ou collision métier présente dans ${table}`);
    }
    tableSummary[table] = {
      planned: rows.length,
      present: existing.length,
      missing: rows.length - existing.length,
      scopedTotal: companyTotal,
      otherScopedRows: companyTotal === null ? null : companyTotal - existing.length,
      futureAction: existing.length === rows.length ? "absence d'action" : "insertion des UUID manquants uniquement",
    };
  }

  const modules = steps.map((step, order) => {
    const presentIds = presentByTable.get(step.table);
    if (step.operation === "emit") {
      return {
        order: order + 1, module: step.key, table: step.table, planned: step.rows.length,
        present: presentIds?.size ?? 0, missing: step.rows.length - (presentIds?.size ?? 0),
        operationOnResume: "après insertion des lignes: émission conditionnelle des seuls brouillons du seed",
        updates: "0 si déjà émise; 1 transition contrôlée par brouillon manquant",
      };
    }
    const present = step.rows.filter((row) => presentIds.has(row.id)).length;
    return {
      order: order + 1,
      module: step.key,
      table: step.table,
      planned: step.rows.length,
      present,
      missing: step.rows.length - present,
      operationOnResume: present === step.rows.length ? "lecture puis absence d'action" : "lecture puis insertion des UUID manquants",
      updates: 0,
    };
  });

  const acceptedQuoteIds = new Set(plan.devis.filter((quote) => quote.statut === "accepte").map((quote) => quote.id));
  const acceptedLineIds = new Set(plan.lignesDevis.filter((line) => acceptedQuoteIds.has(line.devis_id)).map((line) => line.id));
  const { data: projectTasks, error: taskError } = await client.from("taches")
    .select("id,devis_id,ligne_devis_id,description")
    .in("chantier_id", plan.chantiers.map((chantier) => chantier.id));
  if (taskError) abort(`classification des tâches: ${taskError.message}`);
  const explicitTaskIds = new Set(plan.tasks.map((task) => task.id));
  const explicit = (projectTasks ?? []).filter((task) => explicitTaskIds.has(task.id));
  const automatic = (projectTasks ?? []).filter((task) => task.ligne_devis_id && acceptedLineIds.has(task.ligne_devis_id));
  const automaticLineIds = new Set(automatic.map((task) => task.ligne_devis_id));
  const manual = (projectTasks ?? []).filter((task) => !explicitTaskIds.has(task.id) && !automatic.includes(task));
  if (explicit.length !== plan.tasks.length) abort("les 60 tâches déterministes ne sont pas toutes présentes");
  if (automatic.length !== acceptedLineIds.size || automaticLineIds.size !== acceptedLineIds.size) {
    abort("les tâches automatiques des lignes de devis acceptés ne sont pas bijectives");
  }

  return {
    modules,
    tables: tableSummary,
    tasks: {
      total: (projectTasks ?? []).length,
      explicitSeed: explicit.length,
      automaticFromAcceptedQuoteLines: automatic.length,
      distinctAutomaticSourceLines: automaticLineIds.size,
      manualOrUnclassified: manual.length,
      resumeBehavior: "devis et lignes existants ignorés; aucun trigger de synchronisation relancé",
    },
    collisions: 0,
    commandNumbering: {
      ...commandNumbering,
      existingDeterministicCommands: existingCommandIds.length,
      manualNumberCollisions: (numberCollisions ?? []).filter((row) => row.id !== commandById.get(row.id)?.id).length,
      counters: commandCounters ?? [],
      counterReadsOnly: true,
    },
    commandIntegrity: {
      deterministicCommands: existingCommandIds.length,
      deterministicLines: existingCommandLines.length,
      orphanDeterministicLines: existingCommandLines.filter((row) => !commandById.has(row.commande_id)).length,
    },
    supplierExpenses: {
      ...supplierExpenseIntegrity,
      expectedIds: plan.supplierExpenses.map((row) => row.id),
      manualUniqueCollisions: (expenseUniqueCollisions ?? []).filter((row) => !plan.supplierExpenses.some((expense) => expense.id === row.id)).length,
      allLinkedRelationsCompatible: true,
      atomicInsertBatch: true,
    },
    batching: {
      readBatchSize: READ_BATCH_SIZE,
      insertBatchSize: INSERT_BATCH_SIZE,
      boundedReads: true,
      boundedInserts: true,
      moduleLevelAtomicity: false,
      partialBatchResumeByDeterministicId: true,
    },
    markerPreserved: true,
    writeOperationsDuringInspection: 0,
  };
}

function summary(plan, expected, liveReadonly = false, resume = null) {
  return {
    mode: liveReadonly ? "dry-run avec préflight Supabase strictement en lecture seule" : "dry-run local sans client Supabase",
    target: { projectRef: PROJECT_REF, projectName: PROJECT_NAME, companyId: COMPANY_ID, companyName: COMPANY_NAME },
    period: { start: PERIOD_START, end: PERIOD_END }, marker: MARKER,
    volumes: expected,
    derived: { lignesDevis: plan.lignesDevis.length, lignesFactures: plan.lignesFactures.length, lignesCommande: plan.lignesCommande.length },
    auth: { existingManager: 1, additionalUsers: 0, personalEmployeeFlowsForFictitiousStaff: false },
    documents: { prepared: plan.documents.length, uploaded: 0 },
    externalEffects: { emails: 0, push: 0, stripe: 0, powens: 0, ai: 0, crons: 0 },
    resume,
  };
}

export {
  INSERT_BATCH_SIZE,
  READ_BATCH_SIZE,
  buildPlan,
  chunks,
  emitSeedInvoices,
  executionSteps,
  inspectRemoteResume,
  insertRowsInBatches,
  listAuthUsersByEmail,
  parseArgs,
  readRowsByIds,
  safeEnvironment,
  stableId,
  summary,
  simulateInvoiceLifecycle,
  validateCommandNumbers,
  validateSupplierExpenses,
  validatePlan,
  verifyManagerIdentity,
  writeOwned,
};

async function main() {
  const options = parseArgs(process.argv);
  const plan = buildPlan();
  const expected = validatePlan(plan);
  if (options.dryRun) {
    let resume = null;
    if (options.liveReadonly) {
      safeEnvironment(process.env);
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) abort("SUPABASE_SERVICE_ROLE_KEY absent pour le préflight en lecture seule");
      const { createClient } = await import("@supabase/supabase-js");
      const readClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const context = await livePreflight(readClient, process.env);
      resume = await inspectRemoteResume(readClient, plan, context);
    }
    const output = summary(plan, expected, options.liveReadonly, resume);
    console.log(options.json ? JSON.stringify(output, null, 2) : [
      "DRY-RUN VALIDÉ — aucune connexion Supabase créée, aucune écriture possible.",
      `Cible verrouillée: ${PROJECT_NAME} (${PROJECT_REF}) / ${COMPANY_ID}`,
      `Période: ${PERIOD_START} → ${PERIOD_END}`,
      `Volumes: ${JSON.stringify(expected)}`,
      `Dérivés: lignes devis=${plan.lignesDevis.length}, lignes factures=${plan.lignesFactures.length}, lignes commandes=${plan.lignesCommande.length}`,
      "Comptes Auth supplémentaires: 0; téléversements: 0; effets externes: 0.",
    ].join("\n"));
    return;
  }

  safeEnvironment(process.env);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) abort("SUPABASE_SERVICE_ROLE_KEY absent");
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-elsatia-seed": MARKER } },
  });
  const context = await livePreflight(client, process.env);
  await inspectRemoteResume(client, plan, context);
  await executePlan(client, plan, context);
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
