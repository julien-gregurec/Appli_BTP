import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vérification statique de la migration ELS-REC-004 (conversion des préfixes QR LGP-* ->
// ELS-*). N'exécute aucune requête SQL : lit le fichier de migration et contrôle sa forme,
// sans jamais l'appliquer à une base. La migration réelle reste sous
// supabase/migrations/, jamais modifiée rétroactivement (20260713000068 est intact).
const racine = resolve(import.meta.dirname, "../..");
const cheminMigration = resolve(racine, "supabase/migrations/20260802000195_migration_prefixe_qr_lgp_vers_els.sql");
const sql = readFileSync(cheminMigration, "utf8");

const PREFIXES_ATTENDUS = [
  ["LGP-EMP-", "ELS-EMP-"],
  ["LGP-ART-", "ELS-ART-"],
  ["LGP-CH-", "ELS-CH-"],
  ["LGP-VEH-", "ELS-VEH-"],
  ["LGP-OUT-", "ELS-OUT-"],
] as const;

// Position des 6 étapes attendues, dans l'ordre où elles doivent apparaître dans le
// fichier : validation temporaire double format -> génération future ELS-* -> contrôle
// global des collisions -> conversion en masse -> garde-fou "plus aucun LGP-*" ->
// validation SQL définitive strictement ELS-*.
const indexValidationTemporaire = sql.indexOf("^(LGP|ELS)-[A-Z]{2,4}-[A-Z0-9]{6,16}$");
const indexGenerationFuture = sql.indexOf("v_code:='ELS-'||v_prefix");
const indexControleCollisions = sql.indexOf("Migration QR LGP->ELS annulée avant toute modification");
const indexConversion = sql.indexOf("update public.codes_identification cible");
const indexGardeFouRestant = sql.indexOf("Migration QR LGP->ELS incomplète");
const indexValidationDefinitive = sql.lastIndexOf("^ELS-[A-Z]{2,4}-[A-Z0-9]{6,16}$");

describe("migration ELS-REC-004 : conversion des préfixes QR LGP-* vers ELS-* (vérification statique)", () => {
  it("est un SQL syntaxiquement plausible : blocs $$ équilibrés, pas d'octet nul, non vide", () => {
    expect(sql.trim().length).toBeGreaterThan(0);
    expect(sql.includes("\0")).toBe(false);
    const nombreDeDelimiteurs = (sql.match(/\$\$/g) ?? []).length;
    expect(nombreDeDelimiteurs % 2).toBe(0);
    expect(nombreDeDelimiteurs).toBeGreaterThan(0);
  });

  it("ne modifie ni ne remplace le fichier de la migration historique 20260713000068 (contenu resté intact)", () => {
    const historique = readFileSync(resolve(racine, "supabase/migrations/20260713000068_codes_qr_borne_stock_securisee.sql"), "utf8");
    expect(historique).toContain("v_code:='LGP-'||v_prefix");
    expect(historique).toContain("^LGP-[A-Z]{2,4}-[A-Z0-9]{6,16}$");
  });

  it("fait générer exclusivement des codes ELS-* pour les nouvelles ressources", () => {
    expect(sql).toContain("v_code:='ELS-'||v_prefix");
    expect(sql).not.toContain("v_code:='LGP-'||v_prefix");
  });

  it("respecte l'ordre exact des 6 étapes : chacune apparaît, dans cet ordre, une seule fois là où c'est attendu", () => {
    expect(indexValidationTemporaire).toBeGreaterThan(-1);
    expect(indexGenerationFuture).toBeGreaterThan(indexValidationTemporaire);
    expect(indexControleCollisions).toBeGreaterThan(indexGenerationFuture);
    expect(indexConversion).toBeGreaterThan(indexControleCollisions);
    expect(indexGardeFouRestant).toBeGreaterThan(indexConversion);
    expect(indexValidationDefinitive).toBeGreaterThan(indexGardeFouRestant);
  });

  it("étape 1 : accepte temporairement les deux formats LGP-* et ELS-* à l'écriture, uniquement le temps de la conversion", () => {
    // Une seule occurrence du motif double-format : la validation ne doit pas rester
    // permissive ailleurs dans le fichier (sinon l'étape 6 ne la resserre pas vraiment).
    const occurrences = sql.match(/\^\(LGP\|ELS\)-\[A-Z\]\{2,4\}-\[A-Z0-9\]\{6,16\}\$/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it("étape 3 : le contrôle de collision est un SELECT pur, placé avant le premier UPDATE, portant sur l'ensemble du jeu de données", () => {
    const blocCollision = sql.slice(sql.indexOf("-- 3) Contrôle GLOBAL des collisions"), indexConversion);
    // Retire les commentaires SQL avant de chercher une instruction d'écriture réelle :
    // le texte du commentaire de l'étape 3 mentionne lui-même le mot "UPDATE" en le
    // décrivant, ce qui ne doit pas être confondu avec une véritable instruction SQL.
    const sansCommentaires = blocCollision.replace(/--.*$/gm, "");
    expect(blocCollision).toContain("where exists (");
    expect(blocCollision).toContain("upper(c2.code) = upper(conv.nouveau_code)");
    expect(sansCommentaires).not.toMatch(/\bupdate\s+public\./i);
    expect(sansCommentaires).not.toMatch(/\binsert\s+into\b/i);
  });

  it("étape 3 : la comparaison de collision est bornée à l'entreprise, insensible à la casse, et exclut la ligne elle-même", () => {
    const blocCollision = sql.slice(indexControleCollisions - 2000, indexConversion);
    expect(blocCollision).toContain("c2.entreprise_id = conv.entreprise_id");
    expect(blocCollision).toContain("c2.id <> conv.id");
  });

  it("étape 4 : la conversion en masse est un UPDATE...FROM unique (pas de boucle ligne à ligne), donc atomique", () => {
    const blocConversion = sql.slice(indexConversion, indexGardeFouRestant);
    expect(blocConversion).not.toMatch(/\bfor\b[\s\S]*\bin\b[\s\S]*\bloop\b/i);
    expect((blocConversion.match(/\bupdate\b/gi) ?? []).length).toBe(1);
  });

  it("étape 5 : un garde-fou explicite vérifie qu'aucun code LGP-* connu ne subsiste après la conversion", () => {
    const blocGardeFou = sql.slice(sql.indexOf("-- 5) Garde-fou explicite"), indexValidationDefinitive);
    for (const [ancien] of PREFIXES_ATTENDUS) {
      expect(blocGardeFou).toContain(`code like '${ancien}%'`);
    }
  });

  it("étape 6 : la validation SQL finale n'accepte plus que ELS-*, plus aucune trace de LGP dans son motif", () => {
    const blocFinal = sql.slice(indexGardeFouRestant);
    expect(blocFinal).toContain("^ELS-[A-Z]{2,4}-[A-Z0-9]{6,16}$");
    expect(blocFinal).not.toMatch(/\^\(LGP\|ELS\)/);
    expect(blocFinal).not.toMatch(/\^LGP-/);
  });

  it("limite strictement la conversion (étape 3 et étape 4) aux 5 préfixes connus, sans en omettre ni en ajouter", () => {
    const blocsValues = [...sql.matchAll(/join \(values([\s\S]*?)\) as p\(ancien,nouveau\)/g)];
    expect(blocsValues.length).toBeGreaterThanOrEqual(2); // étape 3 (collisions) + étape 4 (conversion)
    for (const bloc of blocsValues) {
      const paires = [...bloc[1].matchAll(/\('([^']+)','([^']+)'\)/g)].map((m) => [m[1], m[2]]);
      expect(paires).toEqual(PREFIXES_ATTENDUS.map(([a, b]) => [a, b]));
    }
  });

  it("préserve le suffixe au caractère près pour chaque préfixe (longueur du préfixe retirée exactement, jamais un nombre fixe)", () => {
    const occurrences = sql.match(/substr\(src\.code, length\(p\.ancien\) \+ 1\)/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2); // étape 3 (calcul cible) + étape 4 (conversion)
  });

  it("est idempotente par construction : la conversion ne porte que sur les codes encore au format LGP-*", () => {
    expect(sql).toMatch(/on src\.code like p\.ancien \|\| '%'/);
  });

  it("ne touche à aucune autre table (mouvements_stock.code_scan_utilise laissé en historique)", () => {
    expect(sql).not.toMatch(/update public\.mouvements_stock/i);
    expect(sql).not.toMatch(/alter table (?!public\.codes_identification)/i);
    expect(sql.toLowerCase()).not.toContain("drop table");
    expect(sql.toLowerCase()).not.toContain("delete from");
  });

  it("les scripts de seed ELSATIA Preview restent strictement inchangés (empreintes déjà vérifiées)", () => {
    const empreinte = (chemin: string) => createHash("sha256").update(readFileSync(resolve(racine, chemin))).digest("hex");
    expect(empreinte("scripts/seed-elsatia-preview-year.mjs")).toBe(
      "6ebc261878f0243289c52d4e0382d1bb77e39eec578617812bd9342149fd2803",
    );
    expect(empreinte("scripts/seed-elsatia-preview-year.test.mjs")).toBe(
      "e0ca3867c25ac2447342075999905783e29f54f1a8136312b4df328813227738",
    );
  });
});
