import { expect, test } from "@playwright/test";
import { rest, token, USERS } from "./helpers";

const resources = [
  ["clients", "nom"],
  ["chantiers", "nom"],
  ["devis", "numero"],
  ["factures", "numero"],
  ["pointages", "id"],
  ["notes_frais", "reference"],
  ["fournisseurs", "nom"],
  ["commandes_fournisseurs", "numero"],
  ["articles_stock", "designation"],
  ["conversations_internes", "titre"],
  ["messages_internes", "contenu"],
  ["journal_ia", "id"],
] as const;

for (const [table, marker] of resources) {
  test(`isolation REST A/B — ${table}`, async ({ request }) => {
    const a = await token(request, USERS.adminA);
    const response = await rest(request, a, table, `select=${marker}`);
    expect(response.status()).toBe(200);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("TEST_B_");
    expect(body).not.toContain("RECETTE_B_");
  });
}

test("ouvrier ne voit que ses pointages et notes", async ({ request }) => {
  const access = await token(request, USERS.workerA);
  const pointages = await rest(request, access, "pointages", "select=employe_id");
  expect(pointages.status()).toBe(200);
  const rows = (await pointages.json()) as Array<{ employe_id: string }>;
  expect(rows.length).toBeGreaterThan(0);
  expect(new Set(rows.map((row) => row.employe_id))).toEqual(
    new Set(["a2000000-0000-0000-0000-000000000002"]),
  );
  const expenses = await rest(request, access, "notes_frais", "select=employe_id");
  expect(expenses.status()).toBe(200);
  const expenseRows = (await expenses.json()) as Array<{ employe_id: string }>;
  expect(new Set(expenseRows.map((row) => row.employe_id))).toEqual(
    new Set(["a2000000-0000-0000-0000-000000000002"]),
  );
});
