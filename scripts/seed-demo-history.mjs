import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MARKER = "HISTORIQUE_DEMO_LIRIA_2026";
const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function fail(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function one(table, filters, columns = "*") {
  let query = supabase.from(table).select(columns);
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { data, error } = await query.maybeSingle();
  fail(error, `Lecture ${table}`);
  return data;
}

async function upsert(table, row, onConflict) {
  const { data, error } = await supabase
    .from(table)
    .upsert(row, { onConflict })
    .select()
    .single();
  fail(error, `Écriture ${table}`);
  return data;
}

async function insert(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  fail(error, `Ajout ${table}`);
  return data;
}

async function update(table, id, values) {
  const { data, error } = await supabase
    .from(table)
    .update(values)
    .eq("id", id)
    .select()
    .single();
  fail(error, `Mise à jour ${table}`);
  return data;
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  fail(error, `Action ${name}`);
  return data;
}

const { data: context, error: contextError } = await supabase
  .rpc("dev_contexte_entreprise")
  .single();
fail(contextError, "Contexte entreprise");
const entrepriseId = context.entreprise_id;

const { data: types, error: typesError } = await supabase
  .from("types_chantier")
  .select("id,nom")
  .eq("entreprise_id", entrepriseId);
fail(typesError, "Types de chantier");
const typeId = Object.fromEntries(types.map((type) => [type.nom, type.id]));

const employeeRows = [
  ["DEMO-EMP-001", "Sofiane", "Benkacem", "Chef d'équipe cloisons", "cdi", "2025-09-01", 18.5, 29.5],
  ["DEMO-EMP-002", "Lucas", "Meyer", "Plaquiste", "cdi", "2026-01-05", 15.8, 25.2],
  ["DEMO-EMP-003", "Nicolas", "Schmitt", "Menuisier agenceur", "cdi", "2025-11-17", 17.2, 27.8],
  ["DEMO-EMP-004", "Enzo", "Martinez", "Apprenti polyvalent", "apprenti", "2026-02-02", 11.4, 18.9],
  ["DEMO-EMP-005", "Amine", "Haddad", "Peintre finisseur", "cdd", "2026-03-09", 16.1, 25.9],
];
const employees = {};
for (let i = 0; i < employeeRows.length; i += 1) {
  const [reference_interne, prenom, nom, poste, type_contrat, date_entree, taux_horaire, cout_horaire] = employeeRows[i];
  employees[reference_interne] = await upsert(
    "employes",
    {
      entreprise_id: entrepriseId,
      reference_interne,
      prenom,
      nom,
      poste,
      type_contrat,
      date_entree,
      taux_horaire,
      cout_horaire,
      telephone: `06 80 24 1${i} ${20 + i}`,
      email: `demo.${prenom.toLowerCase()}.${nom.toLowerCase()}@example.fr`,
      statut: "actif",
      notes: `${MARKER} — Équipe de démonstration`,
    },
    "entreprise_id,reference_interne",
  );
}

const clientRows = [
  ["DEMO-CLI-001", "professionnel", "Bureaux Rhénans", "12 rue du Commerce", "67000", "Strasbourg", "contact.bureaux-rhenans@example.fr", "03 88 00 10 21", 30],
  ["DEMO-CLI-002", "particulier", "Claire Hoffmann", "8 rue des Tilleuls", "67540", "Ostwald", "claire.hoffmann@example.fr", "06 71 20 44 18", 15],
  ["DEMO-CLI-003", "professionnel", "Cabinet Médical Kléber", "25 avenue des Vosges", "67000", "Strasbourg", "gestion.kleber@example.fr", "03 88 12 31 40", 30],
  ["DEMO-CLI-004", "syndic", "Syndic Alsace Habitat", "4 quai des Bateliers", "67000", "Strasbourg", "travaux.alsace-habitat@example.fr", "03 88 21 45 60", 45],
  ["DEMO-CLI-005", "professionnel", "Restaurant L'Atelier des Saveurs", "18 rue de la Gare", "67400", "Illkirch-Graffenstaden", "direction.atelier-saveurs@example.fr", "03 88 66 11 90", 30],
  ["DEMO-CLI-006", "particulier", "Marc et Julie Keller", "31 rue du Général de Gaulle", "67201", "Eckbolsheim", "famille.keller@example.fr", "06 62 14 73 52", 15],
  ["DEMO-CLI-007", "collectivite", "Maison des Associations", "2 place de la Mairie", "67380", "Lingolsheim", "services.techniques@example.fr", "03 88 78 12 00", 45],
];
const clients = {};
for (const [reference_interne, type, label, adresse_facturation, code_postal, ville, email, telephone, delai_paiement_jours] of clientRows) {
  const particulier = type === "particulier";
  const words = label.split(" ");
  clients[reference_interne] = await upsert(
    "clients",
    {
      entreprise_id: entrepriseId,
      reference_interne,
      type,
      nom: particulier ? words.at(-1) : null,
      prenom: particulier ? words.slice(0, -1).join(" ") : null,
      societe: particulier ? null : label,
      raison_sociale: particulier ? null : label,
      adresse_facturation,
      adresse_chantier_defaut: adresse_facturation,
      code_postal,
      ville,
      email,
      telephone,
      conditions_paiement: `Règlement à ${delai_paiement_jours} jours`,
      delai_paiement_jours,
      statut: "actif",
      notes: `${MARKER} — Coordonnées fictives réservées à la démonstration`,
    },
    "entreprise_id,reference_interne",
  );
}

const chantierRows = [
  ["DEMO-CHA-001", "Aménagement bureaux — Plateau République", "DEMO-CLI-001", "Rénovation", "termine", "2026-02-09", "2026-03-06", 28900, "DEMO-EMP-001", "16 avenue de la Paix", "Strasbourg", "67000"],
  ["DEMO-CHA-002", "Rénovation séjour et faux plafond", "DEMO-CLI-002", "Rénovation", "termine", "2026-03-16", "2026-04-03", 12800, "DEMO-EMP-005", "8 rue des Tilleuls", "Ostwald", "67540"],
  ["DEMO-CHA-003", "Cabines sanitaires et cloisons cabinet", "DEMO-CLI-003", "Rénovation", "termine", "2026-04-13", "2026-05-15", 21400, "DEMO-EMP-001", "25 avenue des Vosges", "Strasbourg", "67000"],
  ["DEMO-CHA-004", "Réfection parties communes — Résidence Orangerie", "DEMO-CLI-004", "Entretien", "en_cours", "2026-06-15", "2026-07-24", 35700, "DEMO-EMP-001", "7 rue de l'Orangerie", "Strasbourg", "67000"],
  ["DEMO-CHA-005", "Agencement accueil et panneaux décoratifs", "DEMO-CLI-005", "Rénovation", "en_cours", "2026-07-06", "2026-07-31", 18400, "DEMO-EMP-003", "18 rue de la Gare", "Illkirch-Graffenstaden", "67400"],
  ["DEMO-CHA-006", "Dressing sur mesure et sol stratifié", "DEMO-CLI-006", "Rénovation", "accepte", "2026-08-03", "2026-08-21", 14600, "DEMO-EMP-003", "31 rue du Général de Gaulle", "Eckbolsheim", "67201"],
  ["DEMO-CHA-007", "Cloisons modulaires — Salle polyvalente", "DEMO-CLI-007", "Neuf", "devis_envoye", "2026-09-07", "2026-10-02", 42500, "DEMO-EMP-001", "2 place de la Mairie", "Lingolsheim", "67380"],
  ["DEMO-CHA-008", "Réparation cloison après dégât des eaux", "DEMO-CLI-004", "Dépannage", "en_pause", "2026-07-01", "2026-07-15", 4800, "DEMO-EMP-002", "42 route de Schirmeck", "Strasbourg", "67200"],
];
const chantiers = {};
for (const [reference_interne, nom, clientRef, typeNom, statut, date_debut_prevue, date_fin_prevue, budget_previsionnel, responsableRef, adresse, ville, code_postal] of chantierRows) {
  chantiers[reference_interne] = await upsert(
    "chantiers",
    {
      entreprise_id: entrepriseId,
      reference_interne,
      client_id: clients[clientRef].id,
      nom,
      type_chantier_id: typeId[typeNom],
      statut,
      date_debut_prevue,
      date_fin_prevue,
      date_debut_reelle: ["termine", "en_cours", "en_pause"].includes(statut) ? date_debut_prevue : null,
      date_fin_reelle: statut === "termine" ? date_fin_prevue : null,
      budget_previsionnel,
      responsable_id: employees[responsableRef].id,
      adresse,
      ville,
      code_postal,
    },
    "entreprise_id,reference_interne",
  );
}

for (const [index, chantierRef] of chantierRows.map((row) => row[0]).entries()) {
  const taskRows = [
    ["Préparation et protection des zones", index < 3 ? "fait" : "a_faire"],
    ["Approvisionnement des matériaux", index < 5 ? "fait" : "a_faire"],
    ["Contrôle qualité et réception", index < 3 ? "fait" : "a_faire"],
  ];
  for (const [libelle, statut] of taskRows) {
    if (!(await one("taches", { chantier_id: chantiers[chantierRef].id, libelle }))) {
      await insert("taches", { chantier_id: chantiers[chantierRef].id, libelle, statut });
    }
  }
}

const quoteRows = [
  ["Q001", "DEMO-CHA-001", "accepte", "2026-01-28", "2026-02-28", [["Cloisons vitrées et ossature aluminium", "Fourniture et pose complète", "forfait", 1, "forfait", 13200, 0, 20], ["Cloisons pleines acoustiques", "Isolation renforcée", "fourniture", 86, "m²", 112, 0, 20], ["Pose et finitions", "Équipe de pose", "main_oeuvre", 96, "h", 52, 0, 20]]],
  ["Q002", "DEMO-CHA-002", "accepte", "2026-03-02", "2026-04-01", [["Faux plafond BA13", "Ossature, plaques et bandes", "forfait", 1, "forfait", 5900, 0, 10], ["Ratissage et peinture murs", "Préparation et deux couches", "main_oeuvre", 120, "m²", 31, 0, 10], ["Protection et nettoyage", null, "forfait", 1, "forfait", 620, 0, 10]]],
  ["Q003", "DEMO-CHA-003", "accepte", "2026-03-24", "2026-04-23", [["Cabines sanitaires stratifiées", "3 cabines avec quincaillerie", "fourniture", 3, "u", 3180, 0, 20], ["Cloisons hydrofuges", null, "forfait", 1, "forfait", 6800, 0, 20], ["Pose et réglages", null, "main_oeuvre", 72, "h", 54, 0, 20]]],
  ["Q004", "DEMO-CHA-004", "accepte", "2026-05-21", "2026-06-20", [["Réfection murs et plafonds", "Trois cages d'escalier", "forfait", 1, "forfait", 16900, 0, 10], ["Panneaux décoratifs halls", "Fourniture et pose", "fourniture", 6, "u", 1280, 0, 20], ["Main-d'œuvre complémentaire", null, "main_oeuvre", 140, "h", 52, 0, 10]]],
  ["Q005", "DEMO-CHA-005", "accepte", "2026-06-11", "2026-07-11", [["Banque d'accueil sur mesure", "Fabrication atelier et pose", "forfait", 1, "forfait", 8900, 0, 20], ["Panneaux muraux décoratifs", "Finition chêne naturel", "fourniture", 38, "m²", 168, 0, 20], ["Éclairage LED intégré", null, "fourniture", 1, "forfait", 1480, 0, 20]]],
  ["Q006", "DEMO-CHA-006", "accepte", "2026-06-30", "2026-07-30", [["Dressing sur mesure", "Façades décor chêne et accessoires", "forfait", 1, "forfait", 9400, 0, 20], ["Sol stratifié premium", "Sous-couche et plinthes incluses", "fourniture", 46, "m²", 69, 0, 10], ["Pose et finitions", null, "main_oeuvre", 32, "h", 52, 0, 10]]],
  ["Q007", "DEMO-CHA-007", "envoye", "2026-07-07", "2026-08-06", [["Cloisons modulaires pleines", "Affaiblissement acoustique 42 dB", "fourniture", 148, "m²", 176, 0, 20], ["Portes et vitrages", null, "forfait", 1, "forfait", 11200, 0, 20], ["Installation complète", null, "main_oeuvre", 104, "h", 54, 0, 20]]],
  ["Q008", "DEMO-CHA-008", "refuse", "2026-06-24", "2026-07-09", [["Dépose des parties sinistrées", null, "main_oeuvre", 18, "h", 52, 0, 10], ["Reconstruction cloison hydrofuge", null, "forfait", 1, "forfait", 3150, 0, 10]]],
];
const quotes = {};
for (const [key, chantierRef, statut, date_emission, date_validite, lines] of quoteRows) {
  const marker = `${MARKER}:${key}`;
  let quote = await one("devis", { entreprise_id: entrepriseId, notes_internes: marker });
  if (!quote) {
    const id = await rpc("creer_devis_brouillon", {
      p_entreprise_id: entrepriseId,
      p_devis: {
        client_id: chantiers[chantierRef].client_id,
        chantier_id: chantiers[chantierRef].id,
        date_emission,
        date_validite,
        conditions: "Validité 30 jours — acompte de 30 % à la commande",
        notes_client: "Merci pour votre confiance.",
        notes_internes: marker,
        remise_globale: 0,
      },
      p_lignes: lines.map(([designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva], ordre) => ({ designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre })),
    });
    quote = await update("devis", id, { statut });
  } else if (quote.statut !== statut) {
    quote = await update("devis", quote.id, { statut });
  }
  quotes[key] = quote;
}

const invoiceRows = [
  ["Q001", "simple", "2026-03-09", "2026-04-08", "payee", "2026-03-31"],
  ["Q002", "simple", "2026-04-06", "2026-04-21", "payee", "2026-04-20"],
  ["Q003", "simple", "2026-05-18", "2026-06-17", "payee", "2026-06-10"],
  ["Q004", "acompte", "2026-06-04", "2026-07-19", "payee_partiel", "2026-06-18"],
  ["Q005", "acompte", "2026-07-02", "2026-08-01", "envoyee", null],
];
const invoices = {};
for (const [quoteKey, type, date_emission, date_echeance, target, paymentDate] of invoiceRows) {
  let invoice = await one("factures", { entreprise_id: entrepriseId, devis_origine_id: quotes[quoteKey].id, type });
  if (!invoice) {
    const id = await rpc("creer_facture_depuis_devis", { p_devis_id: quotes[quoteKey].id, p_type: type });
    invoice = await update("factures", id, {
      statut: "envoyee",
      date_emission,
      date_echeance,
      notes_internes: `${MARKER}:INV-${quoteKey}`,
    });
  }
  if (paymentDate) {
    const reference = `${MARKER}:PAY-${quoteKey}`;
    if (!(await one("paiements", { facture_id: invoice.id, reference }))) {
      const amount = target === "payee" ? Number(invoice.montant_ttc) : Math.round(Number(invoice.montant_ttc) * 0.3 * 100) / 100;
      await insert("paiements", { facture_id: invoice.id, montant: amount, date: paymentDate, mode: "virement", reference });
    }
  }
  invoices[quoteKey] = invoice;
}

// Un devis récent encore en brouillon, utile pour tester la reprise d'édition.
if (!(await one("devis", { entreprise_id: entrepriseId, notes_internes: `${MARKER}:BROUILLON` }))) {
  await rpc("creer_devis_brouillon", {
    p_entreprise_id: entrepriseId,
    p_devis: {
      client_id: clients["DEMO-CLI-001"].id,
      chantier_id: null,
      date_emission: "2026-07-11",
      date_validite: "2026-08-10",
      conditions: "Étude en cours",
      notes_client: "Version de travail — non envoyée",
      notes_internes: `${MARKER}:BROUILLON`,
      remise_globale: 0,
    },
    p_lignes: [{ designation: "Étude agencement espace réunion", description: "Métré et proposition technique", type: "forfait", quantite: 1, unite: "forfait", prix_unitaire_ht: 1850, remise_ligne: 0, taux_tva: 20, ordre: 0 }],
  });
}

const planningRows = [
  ["2026-07-13", "DEMO-CHA-004", "DEMO-EMP-001", 8, "Pose panneaux décoratifs hall A"],
  ["2026-07-13", "DEMO-CHA-004", "DEMO-EMP-002", 8, "Préparation des supports"],
  ["2026-07-13", "DEMO-CHA-005", "DEMO-EMP-003", 8, "Pose banque d'accueil"],
  ["2026-07-13", "DEMO-CHA-005", "DEMO-EMP-004", 7, "Aide à la pose et finitions"],
  ["2026-07-14", "DEMO-CHA-005", "DEMO-EMP-003", 7, "Panneaux muraux décoratifs"],
  ["2026-07-15", "DEMO-CHA-004", "DEMO-EMP-001", 8, "Réfection cage d'escalier B"],
  ["2026-07-15", "DEMO-CHA-004", "DEMO-EMP-005", 8, "Peinture murs et plafonds"],
  ["2026-07-16", "DEMO-CHA-004", "DEMO-EMP-002", 8, "Cloisons et reprises"],
  ["2026-07-16", "DEMO-CHA-005", "DEMO-EMP-003", 8, "Réglages menuiserie"],
  ["2026-07-17", "DEMO-CHA-004", "DEMO-EMP-001", 7, "Contrôle qualité hebdomadaire"],
  ["2026-07-17", "DEMO-CHA-005", "DEMO-EMP-004", 7, "Nettoyage et levée de réserves"],
];
for (const [date, chantierRef, employeeRef, heures, tache] of planningRows) {
  const filters = { entreprise_id: entrepriseId, chantier_id: chantiers[chantierRef].id, employe_id: employees[employeeRef].id, date, tache };
  if (!(await one("affectations", filters))) await insert("affectations", { ...filters, heures, notes: MARKER });
}

const timeRows = [
  ["2026-02-12", "DEMO-CHA-001", "DEMO-EMP-001", 8, 0, "Implantation des cloisons"],
  ["2026-02-12", "DEMO-CHA-001", "DEMO-EMP-002", 8, 0, "Déchargement et ossatures"],
  ["2026-02-19", "DEMO-CHA-001", "DEMO-EMP-001", 8, 1, "Pose vitrages"],
  ["2026-03-18", "DEMO-CHA-002", "DEMO-EMP-005", 8, 0, "Préparation plafonds"],
  ["2026-03-26", "DEMO-CHA-002", "DEMO-EMP-005", 8, 0.5, "Peinture de finition"],
  ["2026-04-16", "DEMO-CHA-003", "DEMO-EMP-001", 8, 0, "Pose cloisons hydrofuges"],
  ["2026-04-23", "DEMO-CHA-003", "DEMO-EMP-002", 8, 1, "Montage cabines sanitaires"],
  ["2026-05-07", "DEMO-CHA-003", "DEMO-EMP-004", 7, 0, "Finitions et nettoyage"],
  ["2026-06-18", "DEMO-CHA-004", "DEMO-EMP-001", 8, 0, "Protection des circulations"],
  ["2026-06-25", "DEMO-CHA-004", "DEMO-EMP-005", 8, 0.5, "Ratissage cage A"],
  ["2026-07-07", "DEMO-CHA-005", "DEMO-EMP-003", 8, 0, "Montage banque d'accueil"],
  ["2026-07-08", "DEMO-CHA-005", "DEMO-EMP-004", 7, 0, "Préparation panneaux"],
  ["2026-07-09", "DEMO-CHA-004", "DEMO-EMP-002", 8, 0, "Reprises de cloisons"],
];
for (const [date, chantierRef, employeeRef, heures_normales, heures_supplementaires, tache] of timeRows) {
  const commentaire = `${MARKER}:${date}:${employeeRef}:${chantierRef}`;
  if (!(await one("pointages", { entreprise_id: entrepriseId, commentaire }))) {
    await insert("pointages", {
      entreprise_id: entrepriseId,
      employe_id: employees[employeeRef].id,
      chantier_id: chantiers[chantierRef].id,
      date,
      heures_normales,
      heures_supplementaires,
      pause_minutes: 45,
      tache,
      commentaire,
    });
  }
}

const supplierRows = [
  ["DEMO-FRN-001", "Point.P Strasbourg", "Matériaux et plaques", "commandes.pointp@example.fr", "03 88 30 12 10"],
  ["DEMO-FRN-002", "Sonepar Alsace", "Électricité et éclairage", "commandes.sonepar@example.fr", "03 88 40 22 60"],
  ["DEMO-FRN-003", "Würth Strasbourg", "Quincaillerie et outillage", "commercial.wurth@example.fr", "03 88 55 18 20"],
  ["DEMO-FRN-004", "Alsapan Pro", "Panneaux et décors", "pro.alsapan@example.fr", "03 89 20 10 80"],
  ["DEMO-FRN-005", "TotalEnergies Pro", "Carburant flotte", "cartes.pro@example.fr", "01 00 00 00 00"],
];
const suppliers = {};
for (const [reference, nom, notes, email, telephone] of supplierRows) {
  suppliers[reference] = await upsert("fournisseurs", { entreprise_id: entrepriseId, reference, nom, notes: `${MARKER} — ${notes}`, email, telephone, actif: true }, "entreprise_id,reference");
}

const stockRows = [
  ["BA13-STD", "Plaque BA13 standard 2500 x 1200", "u", 85, 20, 12.9, "Rack A1", "Placo", "376000000001"],
  ["BA13-HYDRO", "Plaque BA13 hydrofuge", "u", 42, 12, 19.8, "Rack A2", "Placo", "376000000002"],
  ["RAIL-R48", "Rail R48 — 3 m", "u", 110, 30, 3.25, "Rack B1", "Placo", "376000000003"],
  ["MONTANT-M48", "Montant M48 — 2,50 m", "u", 96, 25, 4.4, "Rack B2", "Placo", "376000000004"],
  ["LAINE-45", "Laine minérale acoustique 45 mm", "m²", 78, 20, 6.9, "Rack C1", "Isover", "376000000005"],
  ["ENDUIT-BANDE", "Enduit à joint 25 kg", "sac", 18, 6, 31.5, "Zone enduits", "Semin", "376000000006"],
  ["VIS-TTPC25", "Vis TTPC 25 mm — boîte 1000", "boîte", 14, 5, 18.2, "Casier V1", "Spit", "376000000007"],
  ["PAN-CHENE", "Panneau décoratif chêne naturel", "m²", 32, 8, 89, "Rack D1", "Alsapan", "376000000008"],
  ["PAN-NOYER", "Panneau décoratif noyer", "m²", 18, 6, 96, "Rack D2", "Alsapan", "376000000009"],
  ["SOL-STRAT-CHENE", "Sol stratifié chêne clair AC5", "m²", 64, 18, 24.8, "Rack E1", "Quick-Step", "376000000010"],
  ["PEINT-BLANC", "Peinture intérieure blanc velours 15 L", "pot", 9, 4, 94, "Zone peinture", "Tollens", "376000000011"],
  ["SILICONE-BLANC", "Silicone sanitaire blanc", "u", 21, 8, 7.8, "Casier C3", "Sika", "376000000012"],
];
const articles = {};
for (const [reference, designation, unite, initialQty, seuil_alerte, prix_achat_ht, emplacement, marque, code_barres] of stockRows) {
  articles[reference] = await upsert("articles_stock", { entreprise_id: entrepriseId, reference, designation, unite, seuil_alerte, prix_achat_ht, emplacement, marque, code_barres, actif: true }, "entreprise_id,reference");
  const motif = `${MARKER}:INITIAL:${reference}`;
  if (!(await one("mouvements_stock", { entreprise_id: entrepriseId, article_id: articles[reference].id, motif }))) {
    await insert("mouvements_stock", { entreprise_id: entrepriseId, article_id: articles[reference].id, type: "entree", quantite: initialQty, date: "2026-02-02", motif });
  }
}
const stockOutRows = [
  ["BA13-STD", "DEMO-CHA-001", 36, "2026-02-10"], ["RAIL-R48", "DEMO-CHA-001", 42, "2026-02-10"],
  ["MONTANT-M48", "DEMO-CHA-001", 38, "2026-02-10"], ["ENDUIT-BANDE", "DEMO-CHA-002", 5, "2026-03-17"],
  ["BA13-HYDRO", "DEMO-CHA-003", 18, "2026-04-14"], ["SILICONE-BLANC", "DEMO-CHA-003", 8, "2026-04-27"],
  ["PAN-CHENE", "DEMO-CHA-005", 14, "2026-07-06"], ["PEINT-BLANC", "DEMO-CHA-004", 4, "2026-06-22"],
];
for (const [articleRef, chantierRef, quantite, date] of stockOutRows) {
  const motif = `${MARKER}:SORTIE:${articleRef}:${chantierRef}`;
  if (!(await one("mouvements_stock", { entreprise_id: entrepriseId, article_id: articles[articleRef].id, motif }))) {
    await insert("mouvements_stock", { entreprise_id: entrepriseId, article_id: articles[articleRef].id, chantier_id: chantiers[chantierRef].id, type: "sortie", quantite, date, motif });
  }
}
for (const [articleRef, nom, reference, code_hex] of [["PAN-CHENE", "Chêne naturel", "CN-01", "#C89B6D"], ["PAN-CHENE", "Chêne miel", "CM-03", "#B77A3D"], ["PAN-NOYER", "Noyer classique", "NC-02", "#6B4423"], ["SOL-STRAT-CHENE", "Chêne clair", "SC-101", "#D8B98A"], ["SOL-STRAT-CHENE", "Chêne fumé", "SF-108", "#8B7355"]]) {
  await upsert("article_teintes", { entreprise_id: entrepriseId, article_id: articles[articleRef].id, nom, reference, code_hex, actif: true }, "article_id,nom");
}

const depot = await upsert("zones_depot", { entreprise_id: entrepriseId, code: "DEPOT-PRINCIPAL", nom: "Dépôt principal LIRIA", type: "depot", description: `${MARKER} — Stock central, racks et zone consommables`, actif: true }, "entreprise_id,code");
const rackPlaques = await upsert("zones_depot", { entreprise_id: entrepriseId, code: "RACK-PLAQUES", nom: "Rack plaques et ossatures", type: "rayonnage", description: MARKER, actif: true }, "entreprise_id,code");
const rackFinitions = await upsert("zones_depot", { entreprise_id: entrepriseId, code: "ARMOIRE-FINITIONS", nom: "Armoire peintures et finitions", type: "armoire", description: MARKER, actif: true }, "entreprise_id,code");
for (const reference of Object.keys(articles)) {
  const zone_id = ["BA13-STD", "BA13-HYDRO", "RAIL-R48", "MONTANT-M48", "LAINE-45"].includes(reference) ? rackPlaques.id : ["PEINT-BLANC", "ENDUIT-BANDE", "SILICONE-BLANC"].includes(reference) ? rackFinitions.id : depot.id;
  articles[reference] = await update("articles_stock", articles[reference].id, { zone_id });
}
let inventory = await one("inventaires", { entreprise_id: entrepriseId, commentaire: `${MARKER}:INVENTAIRE-JUIN` });
if (!inventory) {
  const inventoryId = await rpc("creer_inventaire_stock", { p_entreprise_id: entrepriseId, p_zone_id: null, p_commentaire: `${MARKER}:INVENTAIRE-JUIN` });
  const { data: inventoryLines, error: inventoryLinesError } = await supabase.from("lignes_inventaire").select("id,quantite_theorique").eq("inventaire_id", inventoryId);
  fail(inventoryLinesError, "Lignes d'inventaire");
  await rpc("enregistrer_comptage_inventaire", { p_entreprise_id: entrepriseId, p_inventaire_id: inventoryId, p_comptages: inventoryLines.map((line) => ({ ligne_id: line.id, quantite: line.quantite_theorique })), p_valider: true });
  inventory = await one("inventaires", { id: inventoryId });
}

const vehicleRows = [
  ["DEMO-AA-101-LC", "Renault", "Trafic L2H1", "utilitaire", "2022-06-15", 68420, "DEMO-EMP-001"],
  ["DEMO-BB-202-LC", "Peugeot", "Expert Standard", "utilitaire", "2023-03-20", 42180, "DEMO-EMP-003"],
  ["DEMO-CC-303-LC", "Citroën", "Berlingo Van", "utilitaire", "2021-11-08", 89650, "DEMO-EMP-002"],
];
const vehicles = {};
for (const [immatriculation, marque, modele, type, date_mise_circulation, finalKm, employeeRef] of vehicleRows) {
  let vehicle = await one("vehicules", { entreprise_id: entrepriseId, immatriculation });
  if (!vehicle) {
    vehicle = await insert("vehicules", {
      entreprise_id: entrepriseId, immatriculation, marque, modele, type, statut: "actif", date_mise_circulation,
      kilometrage: finalKm - 2400, employe_id: employees[employeeRef].id,
      controle_technique_echeance: "2027-03-31", assurance_echeance: "2027-01-15",
      prochain_entretien_date: "2026-10-15", prochain_entretien_km: finalKm + 8000, notes: MARKER,
    });
    for (const [date_releve, kilometrage] of [["2026-03-31", finalKm - 1800], ["2026-05-31", finalKm - 900], ["2026-07-10", finalKm]]) {
      await insert("releves_kilometrage", { entreprise_id: entrepriseId, vehicule_id: vehicle.id, date_releve, kilometrage, note: MARKER });
    }
  } else {
    vehicle = await update("vehicules", vehicle.id, { employe_id: employees[employeeRef].id });
  }
  vehicles[immatriculation] = vehicle;
}

const toolRows = [
  ["DEMO-OUT-001", "Visseuse à choc 18V", "electroportatif", "Makita", "DTD153", "DEMO-EMP-002", "DEMO-CHA-004", 189],
  ["DEMO-OUT-002", "Perforateur SDS+", "electroportatif", "Bosch Professional", "GBH 18V-26", "DEMO-EMP-001", "DEMO-CHA-004", 329],
  ["DEMO-OUT-003", "Scie plongeante", "electroportatif", "Festool", "TS 55", "DEMO-EMP-003", "DEMO-CHA-005", 645],
  ["DEMO-OUT-004", "Laser lignes 3 plans", "mesure", "DeWalt", "DCE089", "DEMO-EMP-001", null, 485],
  ["DEMO-OUT-005", "Aspirateur de chantier", "electroportatif", "Hilti", "VC 20", "DEMO-EMP-004", "DEMO-CHA-005", 520],
  ["DEMO-OUT-006", "Ponceuse girafe", "electroportatif", "Flex", "GE 7", "DEMO-EMP-005", "DEMO-CHA-004", 740],
  ["DEMO-OUT-007", "Cloueur gaz", "electroportatif", "Spit", "Pulsa 40P+", null, null, 690],
  ["DEMO-OUT-008", "Lève-plaque", "levage", "Mondelin", "Levpano 2", null, null, 425],
];
const tools = {};
for (const [reference, designation, categorie, marque, modele, employeeRef, chantierRef, prix_achat_ht] of toolRows) {
  let tool = await one("outils", { entreprise_id: entrepriseId, reference });
  if (!tool) {
    tool = await insert("outils", { entreprise_id: entrepriseId, reference, designation, categorie, marque, modele, statut: "disponible", etat: "bon", date_achat: "2026-02-05", prix_achat_ht, notes: MARKER });
    if (employeeRef || chantierRef) {
      await rpc("enregistrer_mouvement_outillage", { p_entreprise_id: entrepriseId, p_outil_id: tool.id, p_type: "affectation", p_employe_id: employeeRef ? employees[employeeRef].id : null, p_chantier_id: chantierRef ? chantiers[chantierRef].id : null, p_etat: "bon", p_note: `${MARKER} — Affectation actuelle` });
      tool = await one("outils", { id: tool.id });
    }
  }
  tools[reference] = tool;
}

const orderRows = [
  ["CMD01", "DEMO-FRN-001", "DEMO-CHA-004", "2026-06-08", "recue", [["Plaques BA13 standard", 60, "u", 12.9, 20], ["Rails et montants", 120, "u", 3.8, 20], ["Enduit à joint", 12, "sac", 31.5, 20]]],
  ["CMD02", "DEMO-FRN-004", "DEMO-CHA-005", "2026-06-22", "recue", [["Panneaux chêne naturel", 42, "m²", 89, 20], ["Chants assortis", 80, "ml", 3.2, 20]]],
  ["CMD03", "DEMO-FRN-002", "DEMO-CHA-005", "2026-06-29", "confirmee", [["Ruban LED 24V", 24, "ml", 18.4, 20], ["Alimentations et profilés", 1, "lot", 680, 20]]],
  ["CMD04", "DEMO-FRN-003", "DEMO-CHA-006", "2026-07-09", "envoyee", [["Quincaillerie dressing", 1, "lot", 1240, 20], ["Consommables de pose", 1, "lot", 360, 20]]],
];
const orders = {};
for (const [key, supplierRef, chantierRef, date_commande, targetStatus, lines] of orderRows) {
  const marker = `${MARKER}:${key}`;
  let order = await one("commandes_fournisseurs", { entreprise_id: entrepriseId, notes: marker });
  if (!order) {
    const id = await rpc("creer_commande_fournisseur", {
      p_entreprise_id: entrepriseId,
      p_commande: { fournisseur_id: suppliers[supplierRef].id, chantier_id: chantiers[chantierRef].id, date_commande, date_livraison_prevue: "2026-07-18", notes: marker },
      p_lignes: lines.map(([designation, quantite, unite, prix_unitaire_ht, taux_tva], ordre) => ({ designation, description: null, quantite, unite, prix_unitaire_ht, taux_tva, ordre })),
    });
    order = await one("commandes_fournisseurs", { id });
    await rpc("changer_statut_commande", { p_entreprise_id: entrepriseId, p_commande_id: id, p_statut: "envoyee" });
    if (["confirmee", "recue"].includes(targetStatus)) await rpc("changer_statut_commande", { p_entreprise_id: entrepriseId, p_commande_id: id, p_statut: "confirmee" });
    if (targetStatus === "recue") await rpc("changer_statut_commande", { p_entreprise_id: entrepriseId, p_commande_id: id, p_statut: "recue" });
    order = await one("commandes_fournisseurs", { id });
  }
  orders[key] = order;
}

const expenseRows = [
  ["PF-2026-0218", "DEMO-FRN-001", "DEMO-CHA-001", null, null, "materiaux", "2026-02-18", 6240, 1248, "payee"],
  ["PF-2026-0409", "DEMO-FRN-001", "DEMO-CHA-003", null, null, "materiaux", "2026-04-09", 4580, 916, "payee"],
  ["ALSA-2026-0630", "DEMO-FRN-004", "DEMO-CHA-005", null, null, "materiaux", "2026-06-30", 3994, 798.8, "payee_partiel"],
  ["WURTH-2026-0210", "DEMO-FRN-003", null, null, "DEMO-OUT-001", "outillage", "2026-02-10", 189, 37.8, "payee"],
  ["CARB-2026-05", "DEMO-FRN-005", "DEMO-CHA-004", "DEMO-AA-101-LC", null, "carburant", "2026-05-31", 486.2, 97.24, "payee"],
  ["CARB-2026-06", "DEMO-FRN-005", "DEMO-CHA-005", "DEMO-BB-202-LC", null, "carburant", "2026-06-30", 412.7, 82.54, "a_payer"],
];
for (const [numero_piece, supplierRef, chantierRef, vehicleRef, toolRef, categorie, date_piece, montant_ht, montant_tva, target] of expenseRows) {
  let expense = await one("depenses_fournisseurs", { entreprise_id: entrepriseId, fournisseur_id: suppliers[supplierRef].id, numero_piece });
  if (!expense) {
    expense = await insert("depenses_fournisseurs", {
      entreprise_id: entrepriseId, fournisseur_id: suppliers[supplierRef].id,
      chantier_id: chantierRef ? chantiers[chantierRef].id : null,
      vehicule_id: vehicleRef ? vehicles[vehicleRef].id : null,
      outil_id: toolRef ? tools[toolRef].id : null,
      numero_piece, categorie, date_piece, date_echeance: "2026-08-15", montant_ht, montant_tva,
      notes: `${MARKER} — Facture fournisseur de démonstration`,
    });
  }
  if (target !== "a_payer") {
    const reference = `${MARKER}:REG:${numero_piece}`;
    if (!(await one("reglements_fournisseurs", { depense_id: expense.id, reference }))) {
      const amount = target === "payee" ? Number(expense.montant_ttc) : Math.round(Number(expense.montant_ttc) * 0.5 * 100) / 100;
      await insert("reglements_fournisseurs", { entreprise_id: entrepriseId, depense_id: expense.id, montant: amount, date: date_piece, mode: "virement", reference });
    }
  }
}

for (const [libelle, supplierRef, categorie, periodicite, montant_ht, montant_tva, prochaine_echeance] of [
  ["Cartes carburant flotte", "DEMO-FRN-005", "carburant", "mensuelle", 520, 104, "2026-07-31"],
  ["Consommables et quincaillerie atelier", "DEMO-FRN-003", "outillage", "mensuelle", 240, 48, "2026-08-05"],
  ["Approvisionnement panneaux décoratifs", "DEMO-FRN-004", "materiaux", "trimestrielle", 2200, 440, "2026-09-01"],
]) {
  await upsert("charges_recurrentes", { entreprise_id: entrepriseId, libelle, fournisseur_id: suppliers[supplierRef].id, categorie, periodicite, montant_ht, montant_tva, prochaine_echeance, actif: true, notes: MARKER }, "entreprise_id,libelle");
}

for (const prestation of [
  ["Pose cloison modulaire", "Implantation, pose, réglage et finitions", "main_oeuvre", "m²", 62, 20],
  ["Fourniture panneau décoratif", "Panneau mural décoratif, décor au choix", "fourniture", "m²", 98, 20],
  ["Pose sol stratifié", "Sous-couche, pose et plinthes", "main_oeuvre", "m²", 34, 10],
  ["Installation cabine sanitaire", "Montage complet et réglage des portes", "forfait", "u", 890, 20],
  ["Déplacement et livraison chantier", "Forfait secteur Eurométropole", "deplacement", "forfait", 95, 20],
]) {
  const [designation, description, type, unite, prix_unitaire_ht, taux_tva] = prestation;
  await upsert("prestations_catalogue", { entreprise_id: entrepriseId, designation, description, type, unite, prix_unitaire_ht, taux_tva, actif: true }, "entreprise_id,designation");
}

// Replace only the intended business statuses after document automation has run.
for (const [reference, , , , statut] of chantierRows) {
  if (["en_cours", "en_pause", "accepte", "devis_envoye"].includes(statut)) {
    await update("chantiers", chantiers[reference].id, { statut });
  }
}

const tables = ["clients", "chantiers", "employes", "devis", "factures", "affectations", "pointages", "prestations_catalogue", "articles_stock", "mouvements_stock", "zones_depot", "inventaires", "fournisseurs", "commandes_fournisseurs", "vehicules", "outils", "depenses_fournisseurs", "charges_recurrentes"];
const counts = {};
for (const table of tables) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("entreprise_id", entrepriseId);
  fail(error, `Comptage ${table}`);
  counts[table] = count;
}
console.log(JSON.stringify({ entreprise: context.entreprise_nom, counts }, null, 2));
