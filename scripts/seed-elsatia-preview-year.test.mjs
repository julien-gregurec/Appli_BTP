import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  INSERT_BATCH_SIZE,
  MANAGER_EMAIL,
  MANAGER_EMAIL_DEFAUT,
  MANAGER_EMAIL_SURCHARGE_VAR,
  READ_BATCH_SIZE,
  buildPlan,
  chunks,
  emitSeedInvoices,
  executionSteps,
  parseArgs,
  readRowsByIds,
  resolveManagerEmail,
  safeEnvironment,
  simulateInvoiceLifecycle,
  stableId,
  summary,
  validateCommandNumbers,
  validatePlan,
  validateSupplierExpenses,
  verifyManagerIdentity,
  writeOwned,
} from "./seed-elsatia-preview-year.mjs";

const COMPANY_ID = "1bfc5dc6-1979-408c-babc-ee15841f3d21";
const MANAGER_ROLE_ID = "role-gerant";
const EXECUTION_CONTEXT = {
  userId: "auth-manager",
  managerRoleId: MANAGER_ROLE_ID,
  roles: {
    Ouvrier: "role-ouvrier",
    "Chef d’équipe": "role-chef-equipe",
    "Chef de chantier": "role-chef-chantier",
    "Conducteur de travaux": "role-conducteur",
    "Directeur travaux": "role-directeur",
    Administration: "role-administration",
    RH: "role-rh",
    Comptable: "role-comptable",
    Gérant: MANAGER_ROLE_ID,
  },
};

function emptySimulationState() {
  return { tables: new Map(), automaticTaskSerial: 0 };
}

function cloneSimulationState(state) {
  return structuredClone(state);
}

function tableState(state, table) {
  if (!state.tables.has(table)) state.tables.set(table, new Map());
  return state.tables.get(table);
}

function synchronizeAutomaticQuoteTasks(state, quoteId) {
  const quote = tableState(state, "devis").get(quoteId);
  if (!quote || quote.statut !== "accepte" || !quote.chantier_id) return;
  const lines = [...tableState(state, "lignes_devis").values()].filter((line) => line.devis_id === quoteId);
  const tasks = tableState(state, "taches");
  for (const line of lines) {
    const existing = [...tasks.values()].find((task) => task.ligne_devis_id === line.id);
    if (existing) continue;
    state.automaticTaskSerial += 1;
    tasks.set(`auto-${state.automaticTaskSerial}`, {
      id: `auto-${state.automaticTaskSerial}`,
      chantier_id: quote.chantier_id,
      devis_id: quote.id,
      ligne_devis_id: line.id,
      automatic: true,
    });
  }
}

function simulatePass(initialState, sourcePlan, { failBefore = null, failDuring = null } = {}) {
  const state = cloneSimulationState(initialState);
  const plan = structuredClone(sourcePlan);
  const operations = [];
  for (const step of executionSteps(plan, EXECUTION_CONTEXT)) {
    if (step.key === failBefore) return { state, operations, failedBefore: step.key };
    const table = tableState(state, step.table);
    if (step.operation === "emit") {
      let updated = 0;
      for (const invoice of step.rows) {
        const stored = table.get(invoice.id);
        if (!stored || stored.statut !== "brouillon") continue;
        const lines = [...tableState(state, "lignes_factures").values()].filter((line) => line.facture_id === invoice.id);
        assert.equal(lines.length, 2);
        stored.statut = invoice.__emissionStatus;
        updated += 1;
      }
      operations.push({ key: step.key, table: step.table, inserted: 0, updated, skipped: step.rows.length - updated });
      continue;
    }
    const missingRows = step.rows.filter((source) => !table.has(source.id));
    if (failDuring?.key === step.key && missingRows.length > failDuring.after) {
      operations.push({ key: step.key, table: step.table, inserted: 0, updated: 0, skipped: step.rows.length - missingRows.length, atomicRollback: true });
      return { state, operations, failedDuring: step.key };
    }
    let inserted = 0;
    for (const source of missingRows) {
      const row = Object.fromEntries(Object.entries(source).filter(([key]) => !key.startsWith("__")));
      table.set(row.id, structuredClone(row));
      inserted += 1;
      if (step.table === "lignes_devis") synchronizeAutomaticQuoteTasks(state, row.devis_id);
    }
    operations.push({ key: step.key, table: step.table, inserted, updated: 0, skipped: step.rows.length - inserted });
  }
  return { state, operations, failedBefore: null, failedDuring: null };
}

function simulationSnapshot(state) {
  const tables = Object.fromEntries([...state.tables].map(([table, rows]) => [table, {
    count: rows.size,
    ids: [...rows.keys()].sort(),
  }]));
  const stock = {};
  for (const row of (state.tables.get("mouvements_stock") ?? new Map()).values()) {
    stock[row.article_id] = (stock[row.article_id] ?? 0) + (row.type === "entree" ? row.quantite : -row.quantite);
  }
  const kilometres = {};
  for (const row of (state.tables.get("releves_kilometrage") ?? new Map()).values()) {
    kilometres[row.vehicule_id] = Math.max(kilometres[row.vehicule_id] ?? 0, row.kilometrage);
  }
  const payments = {};
  for (const row of (state.tables.get("paiements") ?? new Map()).values()) {
    payments[row.facture_id] = Math.round(((payments[row.facture_id] ?? 0) + row.montant) * 100) / 100;
  }
  return { tables, stock, kilometres, payments };
}

function invoiceEmissionClient(plan) {
  const totals = new Map(simulateInvoiceLifecycle(plan).map((invoice) => [invoice.id, invoice.total]));
  const rows = new Map(plan.factures.map((invoice) => [invoice.id, {
    id: invoice.id,
    entreprise_id: COMPANY_ID,
    notes_internes: invoice.notes_internes,
    statut: "brouillon",
    montant_ttc: totals.get(invoice.id),
    montant_paye: 0,
    type: invoice.type,
    date_echeance: invoice.date_echeance,
  }]));
  const updates = [];
  return {
    rows,
    updates,
    from(table) {
      assert.equal(table, "factures");
      let updatePayload = null;
      const filters = {};
      const builder = {
        select() {
          if (!updatePayload) return builder;
          const row = rows.get(filters.id);
          if (!row || row.statut !== filters.statut) return Promise.resolve({ data: [], error: null });
          Object.assign(row, updatePayload);
          updates.push({ id: row.id, ...updatePayload });
          return Promise.resolve({ data: [{ id: row.id }], error: null });
        },
        in(column, ids) {
          assert.equal(column, "id");
          return Promise.resolve({ data: ids.map((id) => rows.get(id)).filter(Boolean), error: null });
        },
        update(payload) { updatePayload = payload; return builder; },
        eq(column, value) { filters[column] = value; return builder; },
      };
      return builder;
    },
  };
}

function managerClient({ authPages, publicUsers, memberships }) {
  const queries = [];
  return {
    queries,
    auth: {
      admin: {
        async listUsers({ page, perPage }) {
          queries.push({ source: "auth", page, perPage });
          return { data: { users: authPages[page - 1] ?? [] }, error: null };
        },
      },
    },
    from(table) {
      const filters = {};
      const builder = {
        select() { return builder; },
        eq(column, value) { filters[column] = value; return builder; },
        then(resolve) {
          const source = table === "utilisateurs" ? publicUsers : memberships;
          const data = source.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
          queries.push({ source: table, filters: { ...filters } });
          resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
}

function validManager(overrides = {}) {
  const authUser = { id: "auth-manager", email: "  JULIEN@ELSATIA.FR " };
  return managerClient({
    authPages: [[authUser]],
    publicUsers: [{ id: authUser.id, nom: "Gregurec" }],
    memberships: [{ utilisateur_id: authUser.id, entreprise_id: COMPANY_ID, poste_id: MANAGER_ROLE_ID, statut: "actif" }],
    ...overrides,
  });
}

function ownedRowsClient(initialRows = [], options = {}) {
  const stored = new Map(initialRows.map((row) => [row.id, structuredClone(row)]));
  const calls = { reads: [], inserts: [] };
  let readIndex = 0;
  let insertIndex = 0;
  return {
    stored,
    calls,
    from(table) {
      return {
        select(columns) {
          return {
            in(column, ids) {
              const current = readIndex++;
              calls.reads.push({ table, columns, column, ids: [...ids] });
              if (options.readErrorBatch === current) return Promise.resolve({ data: null, error: { message: `HTTP lecture lot ${current + 1}` } });
              let data = ids.map((id) => stored.get(id)).filter(Boolean).map((row) => structuredClone(row));
              if (options.reverseRead) data.reverse();
              if (options.transformRead) data = options.transformRead(data, ids, current);
              return Promise.resolve({ data, error: null });
            },
          };
        },
        insert(rows) {
          const current = insertIndex++;
          calls.inserts.push({ table, rows: structuredClone(rows) });
          if (options.insertErrorBatch === current) return Promise.resolve({ error: { message: `HTTP insertion lot ${current + 1}` } });
          for (const row of rows) stored.set(row.id, structuredClone(row));
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function planStep(key) {
  const plan = buildPlan();
  return executionSteps(plan, EXECUTION_CONTEXT).find((step) => step.key === key);
}

const previewEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://pgvvpqyjziyapbbkydmc.supabase.co",
  SUPABASE_PROJECT_REF: "pgvvpqyjziyapbbkydmc",
  ELSATIA_SUPABASE_PROJECT_NAME: "elsatia-preview",
  FEATURE_BOUTIQUE_ENABLED: "false",
  FEATURE_AI_ENABLED: "false",
  FEATURE_CRONS_ENABLED: "false",
  NEXT_PUBLIC_APP_URL: "https://elsatia-preview.example.invalid",
};

test("le plan est déterministe et respecte tous les volumes validés", () => {
  const first = buildPlan();
  const second = buildPlan();
  const volumes = validatePlan(first);
  assert.deepEqual(first, second);
  assert.equal(volumes.pointages, 1500);
  assert.equal(volumes.affectations, 780);
  assert.equal(first.employees.filter((row) => row.email === MANAGER_EMAIL).length, 1);
  assert.equal(MANAGER_EMAIL, "julien@elsatia.fr");
  assert.equal(first.employees.filter((row) => row.email === "julien.gregurec@gmail.com").length, 0);
  assert.equal(first.employees.filter((row) => row.__role === "Compte dépôt").length, 0);
  assert.equal(new Set(first.pointages.map((row) => row.id)).size, 1500);
});

test("resolveManagerEmail : adresse officielle par défaut quand la surcharge est absente", () => {
  assert.equal(MANAGER_EMAIL_DEFAUT, "julien@elsatia.fr");
  assert.equal(MANAGER_EMAIL_SURCHARGE_VAR, "ELSATIA_PREVIEW_MANAGER_EMAIL");
  assert.equal(resolveManagerEmail({}), "julien@elsatia.fr");
  assert.equal(resolveManagerEmail({ AUTRE: "x" }), MANAGER_EMAIL_DEFAUT);
  // La constante figée du module reflète bien le défaut officiel.
  assert.equal(MANAGER_EMAIL, MANAGER_EMAIL_DEFAUT);
});

test("resolveManagerEmail : surcharge valide honorée et normalisée (espaces + majuscules)", () => {
  assert.equal(
    resolveManagerEmail({ [MANAGER_EMAIL_SURCHARGE_VAR]: "recette@elsatia.fr" }),
    "recette@elsatia.fr",
  );
  assert.equal(
    resolveManagerEmail({ [MANAGER_EMAIL_SURCHARGE_VAR]: "  Recette.Preview@ELSATIA.FR  " }),
    "recette.preview@elsatia.fr",
  );
});

test("resolveManagerEmail : refus d'une valeur vide ou uniquement des espaces", () => {
  for (const brut of ["", "   ", "\t", "\n"]) {
    assert.throws(
      () => resolveManagerEmail({ [MANAGER_EMAIL_SURCHARGE_VAR]: brut }),
      /ARRÊT SÛR: ELSATIA_PREVIEW_MANAGER_EMAIL est défini mais vide/,
    );
  }
});

test("resolveManagerEmail : refus d'une adresse invalide, sans exposer la valeur reçue", () => {
  for (const brut of ["pas-un-email", "a@b", "a@b@c.fr", "x@y.", "@elsatia.fr", "secret sk_live_ABC@x"]) {
    assert.throws(() => resolveManagerEmail({ [MANAGER_EMAIL_SURCHARGE_VAR]: brut }), (error) => {
      assert.match(error.message, /ARRÊT SÛR: ELSATIA_PREVIEW_MANAGER_EMAIL n'est pas une adresse e-mail valide/);
      assert.doesNotMatch(error.message, /sk_live|pas-un-email|@b@c/);
      return true;
    });
  }
});

test("resolveManagerEmail : aucun retour implicite vers l'ancienne adresse", () => {
  assert.notEqual(resolveManagerEmail({}), "julien.gregurec@gmail.com");
  assert.throws(
    () => resolveManagerEmail({ [MANAGER_EMAIL_SURCHARGE_VAR]: "" }),
    /est défini mais vide/,
  );
  // Une surcharge invalide s'arrête, elle ne retombe jamais sur un défaut caché.
  assert.throws(
    () => resolveManagerEmail({ [MANAGER_EMAIL_SURCHARGE_VAR]: "invalide" }),
    /n'est pas une adresse e-mail valide/,
  );
  const source = fs.readFileSync(new URL("./seed-elsatia-preview-year.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /julien\.gregurec@gmail\.com/);
});

test("la garde Production reste indépendante de la surcharge du Gérant", () => {
  const previewEnv = {
    NEXT_PUBLIC_SUPABASE_URL: "https://pgvvpqyjziyapbbkydmc.supabase.co",
    SUPABASE_PROJECT_REF: "pgvvpqyjziyapbbkydmc",
    ELSATIA_SUPABASE_PROJECT_NAME: "elsatia-preview",
    FEATURE_BOUTIQUE_ENABLED: "false",
    FEATURE_AI_ENABLED: "false",
    FEATURE_CRONS_ENABLED: "false",
    NEXT_PUBLIC_APP_URL: "https://elsatia-preview.example.invalid",
    [MANAGER_EMAIL_SURCHARGE_VAR]: "recette@elsatia.fr",
  };
  assert.throws(
    () => safeEnvironment({ ...previewEnv, NEXT_PUBLIC_SUPABASE_URL: "https://exhvuzegsefmoguxoiak.supabase.co" }),
    /hors cible Preview/,
  );
  assert.throws(() => safeEnvironment({ ...previewEnv, VERCEL_ENV: "production" }), /Production/);
});

test("le découpage couvre les frontières 0, 1, 50, 51, 810 et 1 500 sans lot vide", () => {
  assert.equal(READ_BATCH_SIZE, 50);
  assert.equal(INSERT_BATCH_SIZE, 100);
  for (const [count, expected] of [[0, 0], [1, 1], [50, 1], [51, 2], [810, 17], [1500, 30]]) {
    const values = Array.from({ length: count }, (_, index) => `id-${index}`);
    const batches = chunks(values, READ_BATCH_SIZE);
    assert.equal(batches.length, expected);
    assert.equal(batches.flat().length, count);
    assert.ok(batches.every((batch) => batch.length > 0 && batch.length <= READ_BATCH_SIZE));
  }
});

test("les lectures bornées dédupliquent les entrées et réunissent tous les lots malgré un ordre inversé", async () => {
  const rows = Array.from({ length: 810 }, (_, index) => ({
    id: `id-${index}`,
    entreprise_id: COMPANY_ID,
    commentaire: `ligne-${index}`,
  }));
  const client = ownedRowsClient(rows, { reverseRead: true });
  assert.deepEqual(await readRowsByIds(client, "pointages", [], "id,commentaire"), []);
  assert.equal(client.calls.reads.length, 0);

  const ids = [...rows.map((row) => row.id), rows[3].id, rows[200].id];
  const result = await readRowsByIds(client, "pointages", ids, "id,commentaire");
  assert.equal(result.length, 810);
  assert.equal(new Set(result.map((row) => row.id)).size, 810);
  assert.equal(client.calls.reads.length, 17);
  assert.ok(client.calls.reads.every((call) => call.ids.length <= READ_BATCH_SIZE));
  assert.ok(client.calls.reads.every((call) => call.columns.includes("entreprise_id")));
});

test("une ligne absente reste absente, mais toute erreur de lot est propagée avant insertion", async () => {
  const rows = Array.from({ length: 120 }, (_, index) => ({ id: `id-${index}`, entreprise_id: COMPANY_ID }));
  const missingClient = ownedRowsClient(rows.slice(0, 119));
  const missing = await readRowsByIds(missingClient, "pointages", rows.map((row) => row.id), "id");
  assert.equal(missing.length, 119);

  for (const readErrorBatch of [0, 1]) {
    const client = ownedRowsClient([], { readErrorBatch });
    await assert.rejects(
      () => writeOwned(client, "pointages", rows, { insertOnly: true }),
      new RegExp(`lecture lot ${readErrorBatch + 1}`),
    );
    assert.equal(client.calls.inserts.length, 0);
    assert.equal(client.stored.size, 0);
  }
});

test("les lectures refusent UUID inattendu, doublon retourné et autre entreprise", async () => {
  const base = [{ id: "id-1", entreprise_id: COMPANY_ID, commentaire: "RECETTE_ELSATIA_PREVIEW_2025_2026" }];
  const cases = [
    {
      transformRead: (data) => [...data, { ...base[0], id: "id-inattendu" }],
      expected: /UUID inattendu/,
    },
    {
      transformRead: (data) => [...data, structuredClone(data[0])],
      expected: /UUID retourné en doublon/,
    },
    {
      transformRead: (data) => data.map((row) => ({ ...row, entreprise_id: "autre-entreprise" })),
      expected: /autre entreprise/,
    },
  ];
  for (const scenario of cases) {
    const client = ownedRowsClient(base, scenario);
    await assert.rejects(() => readRowsByIds(client, "pointages", [base[0].id], "id,commentaire"), scenario.expected);
  }
});

test("les 780 affectations et 30 absences utilisent 17 lectures et 9 insertions bornées", async () => {
  const affectations = planStep("affectations").rows;
  const absences = planStep("absences").rows;
  const client = ownedRowsClient();
  await writeOwned(client, "affectations", affectations, { insertOnly: true });
  await writeOwned(client, "affectations", absences, { insertOnly: true });
  assert.equal(client.stored.size, 810);
  assert.equal(client.calls.reads.length, 17);
  assert.equal(client.calls.inserts.length, 9);
  assert.deepEqual(client.calls.inserts.map((call) => call.rows.length), [100, 100, 100, 100, 100, 100, 100, 80, 30]);
  assert.ok(client.calls.inserts.every((call) => call.rows.length <= INSERT_BATCH_SIZE));
});

test("les 1 500 pointages utilisent 30 lectures puis 15 insertions bornées", async () => {
  const pointages = planStep("pointages").rows;
  const client = ownedRowsClient();
  await writeOwned(client, "pointages", pointages, { insertOnly: true });
  assert.equal(client.stored.size, 1500);
  assert.equal(client.calls.reads.length, 30);
  assert.equal(client.calls.inserts.length, 15);
  assert.ok(client.calls.inserts.every((call) => call.rows.length === INSERT_BATCH_SIZE));
});

test("un échec d'insertion interrompt les lots suivants et la reprise des affectations n'insère que les UUID manquants", async () => {
  const rows = planStep("affectations").rows;
  const failed = ownedRowsClient([], { insertErrorBatch: 2 });
  await assert.rejects(() => writeOwned(failed, "affectations", rows, { insertOnly: true }), /insertion affectations lot 3\/8/);
  assert.equal(failed.calls.inserts.length, 3);
  assert.equal(failed.stored.size, 200);

  const resumed = ownedRowsClient([...failed.stored.values()]);
  await writeOwned(resumed, "affectations", rows, { insertOnly: true });
  assert.equal(resumed.stored.size, 780);
  assert.equal(resumed.calls.reads.length, 16);
  assert.deepEqual(resumed.calls.inserts.map((call) => call.rows.length), [100, 100, 100, 100, 100, 80]);

  const second = ownedRowsClient([...resumed.stored.values()]);
  await writeOwned(second, "affectations", rows, { insertOnly: true });
  assert.equal(second.calls.inserts.length, 0);
  assert.equal(second.stored.size, 780);
});

test("la reprise après un arrêt au milieu des pointages est idempotente", async () => {
  const rows = planStep("pointages").rows;
  const failed = ownedRowsClient([], { insertErrorBatch: 4 });
  await assert.rejects(() => writeOwned(failed, "pointages", rows, { insertOnly: true }), /insertion pointages lot 5\/15/);
  assert.equal(failed.stored.size, 400);

  const resumed = ownedRowsClient([...failed.stored.values()]);
  await writeOwned(resumed, "pointages", rows, { insertOnly: true });
  assert.equal(resumed.stored.size, 1500);
  assert.equal(resumed.calls.inserts.length, 11);

  const second = ownedRowsClient([...resumed.stored.values()]);
  await writeOwned(second, "pointages", rows, { insertOnly: true });
  assert.equal(second.calls.inserts.length, 0);
});

test("un échec avant le premier lot d'insertion ne conserve aucune ligne", async () => {
  const rows = planStep("affectations").rows;
  const client = ownedRowsClient([], { insertErrorBatch: 0 });
  await assert.rejects(() => writeOwned(client, "affectations", rows, { insertOnly: true }), /insertion affectations lot 1\/8/);
  assert.equal(client.stored.size, 0);
  assert.equal(client.calls.inserts.length, 1);
});

test("les dépenses et mouvements de stock existants sont comparés intégralement et jamais rejoués", async () => {
  const expenses = planStep("supplierExpenses").rows;
  const stock = planStep("stockMovements").rows;
  const expenseClient = ownedRowsClient(expenses);
  const stockClient = ownedRowsClient(stock);
  await writeOwned(expenseClient, "depenses_fournisseurs", expenses, { insertOnly: true });
  await writeOwned(stockClient, "mouvements_stock", stock, { insertOnly: true });
  assert.equal(expenseClient.calls.inserts.length, 0);
  assert.equal(stockClient.calls.inserts.length, 0);
  assert.equal(stockClient.stored.size, 100);

  const incompatible = structuredClone(stock);
  incompatible[0].quantite += 1;
  const collision = ownedRowsClient(incompatible);
  await assert.rejects(
    () => writeOwned(collision, "mouvements_stock", stock, { insertOnly: true }),
    /donnée déterministe existante incompatible/,
  );
  assert.equal(collision.calls.inserts.length, 0);
});

test("la séquence des factures reproduit les statuts métier après les règlements", () => {
  const plan = buildPlan();
  const lifecycle = simulateInvoiceLifecycle(plan);
  assert.equal(lifecycle.length, 25);
  assert.ok(lifecycle.every((invoice) => invoice.initiallyValid));
  assert.ok(lifecycle.every((invoice) => invoice.insertionStatus === "brouillon"));
  assert.ok(lifecycle.filter((invoice) => invoice.paymentCount > 0).every((invoice) => invoice.prePaymentStatus === "envoyee"));
  assert.ok(lifecycle.filter((invoice) => invoice.paymentCount === 0 && invoice.type !== "avoir").every((invoice) => invoice.prePaymentStatus === "en_retard"));
  assert.ok(lifecycle.filter((invoice) => invoice.type === "avoir").every((invoice) => invoice.prePaymentStatus === "avoir_emis" && invoice.paymentCount === 0));
  assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(lifecycle, (invoice) => invoice.finalStatus)).map(([status, rows]) => [status, rows.length])), {
    payee: 14,
    payee_partiel: 6,
    en_retard: 3,
    avoir_emis: 2,
  });
  assert.ok(lifecycle.filter((invoice) => invoice.finalStatus === "payee").every((invoice) => invoice.paid === invoice.total && invoice.balance === 0));
  assert.ok(lifecycle.filter((invoice) => invoice.finalStatus === "payee_partiel").every((invoice) => invoice.paid > 0 && invoice.paid < invoice.total && invoice.balance > 0));
  assert.ok(lifecycle.every((invoice) => invoice.total > 0));
  assert.equal(lifecycle.reduce((sum, invoice) => sum + invoice.paymentCount, 0), 20);
});

test("les 25 factures sont insérables en groupe avec montant_paye nul", () => {
  const lifecycle = simulateInvoiceLifecycle(buildPlan());
  assert.ok(lifecycle.every((invoice) => invoice.insertionStatus === "brouillon"));
  assert.equal(lifecycle.filter((invoice) => ["payee", "payee_partiel"].includes(invoice.prePaymentStatus)).length, 0);
  assert.equal(lifecycle.filter((invoice) => !invoice.initiallyValid).length, 0);
});

test("l'émission réelle ne met à jour que les brouillons complets et devient sans effet au second passage", async () => {
  const plan = buildPlan();
  const client = invoiceEmissionClient(plan);
  await emitSeedInvoices(client, plan.factures);
  assert.equal(client.updates.length, 25);
  assert.equal([...client.rows.values()].filter((invoice) => invoice.statut === "envoyee").length, 20);
  assert.equal([...client.rows.values()].filter((invoice) => invoice.statut === "en_retard").length, 3);
  assert.equal([...client.rows.values()].filter((invoice) => invoice.statut === "avoir_emis").length, 2);
  await emitSeedInvoices(client, plan.factures);
  assert.equal(client.updates.length, 25);
});

test("les commandes 2025 et 2026 utilisent des numéros canoniques stables hors de la plage du compteur", () => {
  const first = buildPlan().commandes;
  const second = buildPlan().commandes;
  assert.deepEqual(first.map((row) => row.numero), second.map((row) => row.numero));
  assert.equal(first.filter((row) => row.date_commande.startsWith("2025-")).length, 9);
  assert.equal(first.filter((row) => row.date_commande.startsWith("2026-")).length, 9);
  assert.equal(new Set(first.map((row) => row.numero)).size, 18);
  for (const command of first) {
    const match = /^CMD-(\d{4})-(\d+)$/.exec(command.numero);
    assert.ok(match);
    assert.equal(match[1], command.date_commande.slice(0, 4));
    assert.ok(Number(match[2]) > 2_147_483_647);
  }
  assert.deepEqual(validateCommandNumbers(first), { count: 18, reservedAbove: 2_147_483_647 });
});

test("une collision de numéro avec une commande manuelle provoque un arrêt sûr", () => {
  const commands = buildPlan().commandes;
  assert.throws(
    () => validateCommandNumbers(commands, [{ id: "commande-manuelle", numero: commands[0].numero }]),
    /collision avec un numéro de commande manuel/,
  );
  assert.doesNotThrow(() => validateCommandNumbers(commands, [{ id: commands[0].id, numero: commands[0].numero }]));
});

test("les 18 dépenses liées reprennent explicitement le chantier et le fournisseur de leur commande", () => {
  const plan = buildPlan();
  const commands = new Map(plan.commandes.map((command) => [command.id, command]));
  const linked = plan.supplierExpenses.filter((expense) => expense.commande_id);
  const unlinked = plan.supplierExpenses.filter((expense) => !expense.commande_id);
  assert.equal(linked.length, 18);
  assert.equal(unlinked.length, 12);
  for (const expense of linked) {
    const command = commands.get(expense.commande_id);
    assert.ok(command);
    assert.equal(expense.chantier_id, command.chantier_id);
    assert.equal(expense.fournisseur_id, command.fournisseur_id);
  }
  assert.ok(unlinked.every((expense) => expense.chantier_id));
  assert.deepEqual(validateSupplierExpenses(plan), {
    count: 30,
    linkedToCommands: 18,
    withoutCommand: 12,
    existingDeterministicExpenses: 0,
  });
});

test("les anciennes incohérences des indices 16 et 17 sont détectées puis corrigées par la commande", () => {
  const plan = buildPlan();
  const broken = structuredClone(plan);
  broken.supplierExpenses[16].chantier_id = broken.chantiers[16].id;
  broken.supplierExpenses[17].chantier_id = broken.chantiers[17].id;
  assert.notEqual(broken.supplierExpenses[16].chantier_id, broken.commandes[16].chantier_id);
  assert.notEqual(broken.supplierExpenses[17].chantier_id, broken.commandes[17].chantier_id);
  assert.throws(() => validateSupplierExpenses(broken), /chantier de sa commande/);
  for (const index of [16, 17]) broken.supplierExpenses[index].chantier_id = broken.commandes[index].chantier_id;
  assert.doesNotThrow(() => validateSupplierExpenses(broken));
});

test("un chantier vide ou une commande sans chantier suivent une règle explicite", () => {
  const plan = buildPlan();
  const missingExpenseProject = structuredClone(plan);
  missingExpenseProject.supplierExpenses[0].chantier_id = null;
  assert.throws(() => validateSupplierExpenses(missingExpenseProject), /chantier de sa commande/);

  const commandWithoutProject = structuredClone(plan);
  commandWithoutProject.commandes[0].chantier_id = null;
  commandWithoutProject.supplierExpenses[0].chantier_id = null;
  assert.doesNotThrow(() => validateSupplierExpenses(commandWithoutProject));

  const unlinked = structuredClone(plan);
  assert.equal(unlinked.supplierExpenses[20].commande_id, null);
  unlinked.supplierExpenses[20].chantier_id = unlinked.chantiers[19].id;
  assert.doesNotThrow(() => validateSupplierExpenses(unlinked));
});

test("une dépense existante conforme est ignorée, mais une collision ou une relation altérée est refusée", () => {
  const plan = buildPlan();
  const existing = structuredClone(plan.supplierExpenses[0]);
  const before = structuredClone(existing);
  assert.equal(validateSupplierExpenses(plan, [existing]).existingDeterministicExpenses, 1);
  assert.deepEqual(existing, before);

  assert.throws(
    () => validateSupplierExpenses(plan, [{ ...existing, chantier_id: plan.chantiers[19].id }]),
    /déterministe existante incompatible/,
  );
  assert.throws(
    () => validateSupplierExpenses(plan, [{ ...existing, montant_ht: existing.montant_ht + 1 }]),
    /déterministe existante incompatible/,
  );
  assert.throws(
    () => validateSupplierExpenses(plan, [{ ...existing, id: "depense-manuelle" }]),
    /collision avec une dépense fournisseur manuelle/,
  );
});

test("une incohérence de dépense arrête la préparation avant toute écriture simulée", () => {
  const plan = buildPlan();
  const current = simulatePass(emptySimulationState(), plan, { failBefore: "supplierExpenses" });
  const before = simulationSnapshot(current.state);
  const broken = structuredClone(plan);
  broken.supplierExpenses[16].chantier_id = broken.chantiers[16].id;
  assert.throws(() => simulatePass(current.state, broken), /chantier de sa commande/);
  assert.deepEqual(simulationSnapshot(current.state), before);
  assert.equal(tableState(current.state, "depenses_fournisseurs").size, 0);
});

test("le lot des 30 dépenses est atomique, puis la reprise poursuit les modules suivants", () => {
  const plan = buildPlan();
  const current = simulatePass(emptySimulationState(), plan, { failBefore: "supplierExpenses" });
  assert.equal(tableState(current.state, "commandes_fournisseurs").size, 18);
  assert.equal(tableState(current.state, "lignes_commande").size, 54);
  const failed = simulatePass(current.state, plan, { failDuring: { key: "supplierExpenses", after: 16 } });
  assert.equal(failed.failedDuring, "supplierExpenses");
  assert.equal(failed.operations.at(-1).atomicRollback, true);
  assert.equal(tableState(failed.state, "depenses_fournisseurs").size, 0);

  const resumed = simulatePass(failed.state, plan);
  assert.equal(resumed.operations.find((operation) => operation.key === "commandes").inserted, 0);
  assert.equal(resumed.operations.find((operation) => operation.key === "lignesCommande").inserted, 0);
  assert.equal(resumed.operations.find((operation) => operation.key === "supplierExpenses").inserted, 30);
  assert.equal(tableState(resumed.state, "mouvements_stock").size, 100);
  assert.equal(tableState(resumed.state, "pointages").size, 1500);
  assert.equal(tableState(resumed.state, "notifications_utilisateurs").size, 20);
});

test("une reprise avec un sous-ensemble de dépenses ne crée que les UUID manquants", () => {
  const plan = buildPlan();
  const current = simulatePass(emptySimulationState(), plan, { failBefore: "supplierExpenses" });
  const expenses = tableState(current.state, "depenses_fournisseurs");
  for (const row of plan.supplierExpenses.slice(0, 7)) expenses.set(row.id, structuredClone(row));
  const preserved = structuredClone([...expenses.values()]);
  const resumed = simulatePass(current.state, plan);
  const operation = resumed.operations.find((entry) => entry.key === "supplierExpenses");
  assert.deepEqual({ inserted: operation.inserted, skipped: operation.skipped, updated: operation.updated }, { inserted: 23, skipped: 7, updated: 0 });
  assert.deepEqual([...tableState(resumed.state, "depenses_fournisseurs").values()].slice(0, 7), preserved);
  const second = simulatePass(resumed.state, plan);
  assert.ok(second.operations.every((entry) => entry.inserted === 0 && entry.updated === 0));
  assert.deepEqual(simulationSnapshot(second.state), simulationSnapshot(resumed.state));
});

test("un arrêt après les dépenses reprend sans double effet sur les stocks ou valeurs cumulatives", () => {
  const plan = buildPlan();
  const stopped = simulatePass(emptySimulationState(), plan, { failBefore: "stockMovements" });
  assert.equal(tableState(stopped.state, "depenses_fournisseurs").size, 30);
  assert.equal(tableState(stopped.state, "mouvements_stock").size, 0);
  const completed = simulatePass(stopped.state, plan);
  const snapshot = simulationSnapshot(completed.state);
  assert.equal(tableState(completed.state, "mouvements_stock").size, 100);
  assert.equal(tableState(completed.state, "affectations").size, 810);
  assert.equal(tableState(completed.state, "releves_kilometrage").size, 45);
  assert.equal(tableState(completed.state, "mouvements_outillage").size, 75);
  const second = simulatePass(completed.state, plan);
  assert.ok(second.operations.every((entry) => entry.inserted === 0 && entry.updated === 0));
  assert.deepEqual(simulationSnapshot(second.state), snapshot);
});

test("la reprise depuis l'état distant actuel préserve tous les modules déjà terminés", () => {
  const plan = buildPlan();
  const current = simulatePass(emptySimulationState(), plan, { failBefore: "supplierExpenses" });
  const protectedTables = ["factures", "lignes_factures", "paiements", "taches", "chantiers", "commandes_fournisseurs", "lignes_commande"];
  const before = Object.fromEntries(protectedTables.map((table) => [table, structuredClone([...tableState(current.state, table)] )]));
  const resumed = simulatePass(current.state, plan);
  for (const table of protectedTables) assert.deepEqual([...tableState(resumed.state, table)], before[table]);
  assert.equal(resumed.operations.find((operation) => operation.key === "invoiceEmission").updated, 0);
  assert.equal(resumed.operations.find((operation) => operation.key === "paiements").inserted, 0);
  assert.equal(resumed.operations.find((operation) => operation.key === "tasks").inserted, 0);
  assert.deepEqual(
    [...tableState(resumed.state, "commandes_fournisseurs").values()].map((row) => row.numero),
    plan.commandes.map((row) => row.numero),
  );
});

test("toutes les créations sont insert-only et la seule mise à jour est l'émission contrôlée", () => {
  const steps = executionSteps(buildPlan(), EXECUTION_CONTEXT);
  assert.ok(steps.length > 20);
  assert.ok(steps.filter((step) => step.operation === "insert").every((step) => step.insertOnly === true));
  assert.deepEqual(steps.filter((step) => step.operation === "emit").map((step) => step.key), ["invoiceEmission"]);
  const insertionRows = steps.filter((step) => step.operation === "insert").flatMap((step) => step.rows);
  assert.equal(new Set(insertionRows.map((row) => row.id)).size, insertionRows.length);
});

test("une exécution vierge, l'arrêt aux factures puis deux reprises restent idempotents", () => {
  const plan = buildPlan();
  const virgin = simulatePass(emptySimulationState(), plan);
  assert.equal(virgin.failedBefore, null);
  assert.equal(tableState(virgin.state, "factures").size, 25);
  assert.equal(tableState(virgin.state, "paiements").size, 20);
  assert.equal(virgin.operations.find((operation) => operation.key === "invoiceEmission").updated, 25);
  assert.equal([...tableState(virgin.state, "taches").values()].filter((task) => task.automatic).length, 66);

  const interrupted = simulatePass(emptySimulationState(), plan, { failBefore: "factures" });
  assert.equal(interrupted.failedBefore, "factures");
  assert.equal(tableState(interrupted.state, "employes").size, 12);
  assert.equal(tableState(interrupted.state, "clients").size, 23);
  assert.equal(tableState(interrupted.state, "contacts_clients").size, 25);
  assert.equal(tableState(interrupted.state, "chantiers").size, 20);
  assert.equal(tableState(interrupted.state, "prestations_catalogue").size, 24);
  assert.equal(tableState(interrupted.state, "devis").size, 35);
  assert.equal(tableState(interrupted.state, "lignes_devis").size, 105);
  assert.equal(tableState(interrupted.state, "fournisseurs").size, 9);
  assert.equal(tableState(interrupted.state, "articles_stock").size, 30);
  assert.equal(tableState(interrupted.state, "vehicules").size, 6);
  assert.equal(tableState(interrupted.state, "outils").size, 50);
  assert.equal(tableState(interrupted.state, "taches").size, 126);
  assert.equal(tableState(interrupted.state, "factures").size, 0);

  const resumed = simulatePass(interrupted.state, plan);
  const resumedSnapshot = simulationSnapshot(resumed.state);
  assert.ok(resumed.operations.filter((operation) => operation.key === "devis" || operation.key === "lignesDevis").every((operation) => operation.inserted === 0));
  assert.equal([...tableState(resumed.state, "taches").values()].filter((task) => task.automatic).length, 66);
  assert.equal(tableState(resumed.state, "mouvements_stock").size, 100);
  assert.equal(tableState(resumed.state, "pointages").size, 1500);
  assert.equal(tableState(resumed.state, "affectations").size, 810);

  const secondResume = simulatePass(resumed.state, plan);
  assert.ok(secondResume.operations.every((operation) => operation.inserted === 0 && operation.updated === 0));
  assert.deepEqual(simulationSnapshot(secondResume.state), resumedSnapshot);
  assert.equal([...tableState(secondResume.state, "taches").values()].filter((task) => task.automatic).length, 66);
});

test("la reprise depuis l'état distant actuel ne réémet rien et crée atomiquement commandes et lignes", () => {
  const plan = buildPlan();
  const current = simulatePass(emptySimulationState(), plan, { failBefore: "commandes" });
  assert.equal(tableState(current.state, "factures").size, 25);
  assert.equal(tableState(current.state, "paiements").size, 20);
  assert.equal(tableState(current.state, "commandes_fournisseurs").size, 0);
  const resumed = simulatePass(current.state, plan);
  const commandsOperation = resumed.operations.find((operation) => operation.key === "commandes");
  const linesOperation = resumed.operations.find((operation) => operation.key === "lignesCommande");
  assert.deepEqual({ inserted: commandsOperation.inserted, updated: commandsOperation.updated }, { inserted: 18, updated: 0 });
  assert.deepEqual({ inserted: linesOperation.inserted, updated: linesOperation.updated }, { inserted: 54, updated: 0 });
  assert.equal(resumed.operations.find((operation) => operation.key === "invoiceEmission").updated, 0);
  assert.equal(resumed.operations.find((operation) => operation.key === "paiements").inserted, 0);
  assert.equal(resumed.operations.find((operation) => operation.key === "tasks").inserted, 0);
  assert.ok([...tableState(resumed.state, "lignes_commande").values()].every((line) => tableState(resumed.state, "commandes_fournisseurs").has(line.commande_id)));

  const stoppedAfterCommands = simulatePass(current.state, plan, { failBefore: "lignesCommande" });
  assert.equal(tableState(stoppedAfterCommands.state, "commandes_fournisseurs").size, 18);
  assert.equal(tableState(stoppedAfterCommands.state, "lignes_commande").size, 0);
  const resumedLines = simulatePass(stoppedAfterCommands.state, plan);
  assert.equal(resumedLines.operations.find((operation) => operation.key === "commandes").inserted, 0);
  assert.equal(resumedLines.operations.find((operation) => operation.key === "lignesCommande").inserted, 54);
  const secondPass = simulatePass(resumedLines.state, plan);
  assert.ok(secondPass.operations.every((operation) => operation.inserted === 0 && operation.updated === 0));
  assert.deepEqual(simulationSnapshot(secondPass.state), simulationSnapshot(resumedLines.state));
});

test("les identifiants stables ne changent pas et sont des UUID", () => {
  assert.equal(stableId("client", 1), stableId("client", 1));
  assert.notEqual(stableId("client", 1), stableId("client", 2));
  assert.match(stableId("client", 1), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("le mode d'exécution exige la confirmation exacte", () => {
  assert.deepEqual(parseArgs(["node", "script", "--dry-run"]), { dryRun: true, liveReadonly: false, execute: false, json: false });
  assert.deepEqual(parseArgs(["node", "script", "--dry-run", "--live-readonly"]), { dryRun: true, liveReadonly: true, execute: false, json: false });
  assert.throws(() => parseArgs(["node", "script", "--execute"]), /confirmation/);
  assert.throws(() => parseArgs(["node", "script", "--dry-run", "--confirm=x"]), /interdit/);
  assert.throws(() => parseArgs(["node", "script", "--dry-run", "--force"]), /option interdite/);
  assert.throws(() => parseArgs(["node", "script", "--execute", "--live-readonly"]), /confirmation|exige/);
});

test("les garde-fous refusent une autre cible ou un mode Production", () => {
  assert.doesNotThrow(() => safeEnvironment(previewEnv));
  assert.throws(() => safeEnvironment({ ...previewEnv, SUPABASE_PROJECT_REF: "autre" }), /incorrect/);
  assert.throws(() => safeEnvironment({ ...previewEnv, NEXT_PUBLIC_SUPABASE_URL: "https://autre.supabase.co" }), /hors cible/);
  assert.throws(() => safeEnvironment({ ...previewEnv, FEATURE_AI_ENABLED: "true" }), /garde-fou/);
  assert.throws(() => safeEnvironment({ ...previewEnv, VERCEL_ENV: "production" }), /Production/);
  assert.throws(() => safeEnvironment({ ...previewEnv, STRIPE_SECRET_KEY: ["sk", "live", "interdit"].join("_") }), /Stripe Live/);
});

test("le dry-run annoncé ne contient aucun effet externe", () => {
  const plan = buildPlan();
  const report = summary(plan, validatePlan(plan));
  assert.deepEqual(report.externalEffects, { emails: 0, push: 0, stripe: 0, powens: 0, ai: 0, crons: 0 });
  assert.equal(report.documents.uploaded, 0);
  const source = fs.readFileSync(new URL("./seed-elsatia-preview-year.mjs", import.meta.url), "utf8");
  const dryRunBranch = source.slice(source.indexOf("if (options.dryRun)"), source.indexOf("const context = await livePreflight"));
  assert.doesNotMatch(dryRunBranch, /executePlan|\.insert\(|\.upsert\(|\.rpc\(/);
});

test("le Gérant est identifié via Auth puis par son UUID public, jamais par utilisateurs.email", async () => {
  const client = validManager();
  const result = await verifyManagerIdentity(client, MANAGER_ROLE_ID);
  assert.equal(result.userId, "auth-manager");
  assert.ok(client.queries.some((query) => query.source === "auth"));
  assert.deepEqual(client.queries.find((query) => query.source === "utilisateurs")?.filters, { id: "auth-manager" });
  const source = fs.readFileSync(new URL("./seed-elsatia-preview-year.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\(["']utilisateurs["']\)[\s\S]{0,160}eq\(["']email["']/);
});

test("zéro ou plusieurs correspondances Auth provoquent un arrêt sûr", async () => {
  await assert.rejects(() => verifyManagerIdentity(validManager({ authPages: [[]] }), MANAGER_ROLE_ID), /Auth Gérant absent/);
  await assert.rejects(() => verifyManagerIdentity(validManager({
    authPages: [[
      { id: "auth-1", email: "julien@elsatia.fr" },
      { id: "auth-2", email: "JULIEN@ELSATIA.FR" },
    ]],
  }), MANAGER_ROLE_ID), /Auth Gérant dupliqué/);
});

test("la pagination Auth est parcourue jusqu'à la correspondance unique", async () => {
  const fillers = Array.from({ length: 1000 }, (_, index) => ({ id: `filler-${index}`, email: `filler${index}@example.invalid` }));
  const client = validManager({ authPages: [fillers, [{ id: "auth-manager", email: "julien@elsatia.fr" }]] });
  const result = await verifyManagerIdentity(client, MANAGER_ROLE_ID);
  assert.equal(result.userId, "auth-manager");
  assert.deepEqual(client.queries.filter((query) => query.source === "auth").map((query) => query.page), [1, 2]);
});

test("un profil public absent ou ambigu provoque un arrêt sûr", async () => {
  await assert.rejects(() => verifyManagerIdentity(validManager({ publicUsers: [] }), MANAGER_ROLE_ID), /profil public Gérant absent ou ambigu/);
  await assert.rejects(() => verifyManagerIdentity(validManager({
    publicUsers: [{ id: "auth-manager" }, { id: "auth-manager" }],
  }), MANAGER_ROLE_ID), /profil public Gérant absent ou ambigu/);
});

test("toute appartenance absente, multiple, inactive ou incorrecte est refusée", async () => {
  const cases = [
    { memberships: [], expected: /absente ou multiple/ },
    { memberships: [
      { utilisateur_id: "auth-manager", entreprise_id: COMPANY_ID, poste_id: MANAGER_ROLE_ID, statut: "actif" },
      { utilisateur_id: "auth-manager", entreprise_id: "autre-entreprise", poste_id: MANAGER_ROLE_ID, statut: "actif" },
    ], expected: /absente ou multiple/ },
    { memberships: [{ utilisateur_id: "auth-manager", entreprise_id: COMPANY_ID, poste_id: MANAGER_ROLE_ID, statut: "desactive" }], expected: /absente ou multiple/ },
    { memberships: [{ utilisateur_id: "auth-manager", entreprise_id: COMPANY_ID, poste_id: "mauvais-poste", statut: "actif" }], expected: /autre entreprise ou un autre poste/ },
  ];
  for (const scenario of cases) {
    await assert.rejects(() => verifyManagerIdentity(validManager({ memberships: scenario.memberships }), MANAGER_ROLE_ID), scenario.expected);
  }
});
