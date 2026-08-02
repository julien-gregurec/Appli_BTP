import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vérification statique de la migration ELS-REC-004 (conversion des préfixes QR LGP-* ->
// ELS-* + compatibilité SQL transitoire des RPC de la borne stock). N'exécute aucune
// requête SQL et n'ouvre aucune connexion à une base : lit le fichier de migration et
// contrôle sa forme et sa structure, sans jamais l'appliquer. La migration réelle reste
// sous supabase/migrations/, jamais modifiée rétroactivement (20260713000068,
// 20260715000081 et 20260717000097 restent intacts).
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

// Positions des 9 étapes attendues, dans l'ordre où elles doivent apparaître dans le
// fichier.
const indexNormalisation = sql.indexOf("create or replace function public.normaliser_code_identification");
const indexValidationTemporaire = sql.indexOf("^(LGP|ELS)-[A-Z]{2,4}-[A-Z0-9]{6,16}$");
const indexGenerationFuture = sql.indexOf("v_code:='ELS-'||v_prefix");
const indexIdentifiantEmploye = sql.indexOf("create or replace function public.identifiant_employe_depuis_qr_borne");
const indexEnregistrerMouvement = sql.indexOf("create or replace function public.enregistrer_mouvement_stock_borne_v4");
const indexControleCollisions = sql.indexOf("-- 6) Contrôle GLOBAL des collisions");
const indexConversion = sql.indexOf("update public.codes_identification cible");
const indexGardeFouRestant = sql.indexOf("-- 8) Garde-fou explicite");
const indexValidationDefinitive = sql.lastIndexOf("^ELS-[A-Z]{2,4}-[A-Z0-9]{6,16}$");

const blocNormalisation = sql.slice(indexNormalisation, indexValidationTemporaire);
const blocIdentifiantEmploye = sql.slice(indexIdentifiantEmploye, indexEnregistrerMouvement);
const blocEnregistrerMouvement = sql.slice(indexEnregistrerMouvement, indexControleCollisions);

describe("migration ELS-REC-004 : conversion des préfixes QR LGP-* vers ELS-* (vérification statique)", () => {
  it("est un SQL syntaxiquement plausible : blocs $$ équilibrés, pas d'octet nul, non vide", () => {
    expect(sql.trim().length).toBeGreaterThan(0);
    expect(sql.includes("\0")).toBe(false);
    const nombreDeDelimiteurs = (sql.match(/\$\$/g) ?? []).length;
    expect(nombreDeDelimiteurs % 2).toBe(0);
    expect(nombreDeDelimiteurs).toBeGreaterThan(0);
  });

  it("ne modifie ni ne remplace les fichiers de migration historiques (contenu resté intact)", () => {
    const codesQr = readFileSync(resolve(racine, "supabase/migrations/20260713000068_codes_qr_borne_stock_securisee.sql"), "utf8");
    expect(codesQr).toContain("v_code:='LGP-'||v_prefix");
    expect(codesQr).toContain("^LGP-[A-Z]{2,4}-[A-Z0-9]{6,16}$");
    const securiteTerrain = readFileSync(resolve(racine, "supabase/migrations/20260715000081_securite_terrain_alertes_personnalisation.sql"), "utf8");
    expect(securiteTerrain).toContain("upper(c.code)=upper(btrim(p_code))");
    const scannerUniversel = readFileSync(resolve(racine, "supabase/migrations/20260717000097_scanner_universel_destinations_stock.sql"), "utf8");
    expect(scannerUniversel).toContain("upper(a.reference)=upper(btrim(p_code_article))");
  });

  it("respecte l'ordre exact des 9 étapes : chacune apparaît, dans cet ordre, une seule fois là où c'est attendu", () => {
    expect(indexNormalisation).toBeGreaterThan(-1);
    expect(indexValidationTemporaire).toBeGreaterThan(indexNormalisation);
    expect(indexGenerationFuture).toBeGreaterThan(indexValidationTemporaire);
    expect(indexIdentifiantEmploye).toBeGreaterThan(indexGenerationFuture);
    expect(indexEnregistrerMouvement).toBeGreaterThan(indexIdentifiantEmploye);
    expect(indexControleCollisions).toBeGreaterThan(indexEnregistrerMouvement);
    expect(indexConversion).toBeGreaterThan(indexControleCollisions);
    expect(indexGardeFouRestant).toBeGreaterThan(indexConversion);
    expect(indexValidationDefinitive).toBeGreaterThan(indexGardeFouRestant);
  });

  describe("étape 1 : normaliser_code_identification", () => {
    it("gère explicitement NULL et retombe sur upper(btrim(...)) pour toute valeur non concernée", () => {
      expect(blocNormalisation).toContain("when p_code is null then null");
      expect(blocNormalisation).toContain("else upper(btrim(p_code))");
    });

    it("convertit exactement les 5 préfixes attendus, avec le bon décalage de suffixe (length(ancien)+1)", () => {
      // Extrait chaque branche WHEN ... LIKE 'ANCIEN%' THEN 'NOUVEAU' || substr(..., N)
      const branches = [...blocNormalisation.matchAll(
        /like '([A-Z-]+)%' +then '([A-Z-]+)' +\|\| substr\(upper\(btrim\(p_code\)\), (\d+)\)/g,
      )].map((m) => [m[1], m[2], Number(m[3])] as const);
      expect(branches).toHaveLength(5);
      for (const [i, [ancien, nouveau]] of PREFIXES_ATTENDUS.entries()) {
        expect(branches[i][0]).toBe(ancien);
        expect(branches[i][1]).toBe(nouveau);
        expect(branches[i][2]).toBe(ancien.length + 1); // longueur du préfixe retiré exactement
      }
    });

    it("est idempotente sur un code déjà ELS-* : aucune branche WHEN ne teste un préfixe ELS-*, seul LGP-* est réécrit", () => {
      expect(blocNormalisation).not.toMatch(/like 'ELS-/);
    });

    it("est IMMUTABLE et sans dépendance aux données (aucune référence à une table)", () => {
      expect(blocNormalisation).toMatch(/language sql immutable/);
      expect(blocNormalisation).not.toMatch(/\bfrom\s+public\./i);
    });
  });

  describe("étape 4 : identifiant_employe_depuis_qr_borne normalisé", () => {
    it("préserve exactement la signature, le type de retour, le langage, STABLE, SECURITY DEFINER et search_path de 20260715000081", () => {
      expect(blocIdentifiantEmploye).toContain(
        "create or replace function public.identifiant_employe_depuis_qr_borne(p_entreprise_id uuid,p_code text) returns text",
      );
      expect(blocIdentifiantEmploye).toMatch(/language plpgsql security definer stable set search_path=public\b/);
    });

    it("préserve le contrôle d'autorisation (membre actif + permission utiliser_borne_stock)", () => {
      expect(blocIdentifiantEmploye).toContain("public.est_membre_actif(p_entreprise_id)");
      expect(blocIdentifiantEmploye).toContain("public.a_permission(p_entreprise_id,'utiliser_borne_stock')");
    });

    it("utilise effectivement la normalisation et ne compare plus la seule valeur brute", () => {
      expect(blocIdentifiantEmploye).toContain("upper(c.code)=public.normaliser_code_identification(p_code)");
      expect(blocIdentifiantEmploye).not.toMatch(/upper\(c\.code\)\s*=\s*upper\(btrim\(p_code\)\)/);
    });
  });

  describe("étape 5 : enregistrer_mouvement_stock_borne_v4 normalisé", () => {
    it("préserve exactement la signature à 14 paramètres (ordre et valeurs par défaut), le type de retour, SECURITY DEFINER et search_path=public,extensions de 20260717000097", () => {
      expect(blocEnregistrerMouvement).toContain(
        "p_entreprise_id uuid,p_identifiant_employe text,p_mot_de_passe text,\n  p_code_article text,p_type text,p_quantite numeric,p_chantier_id uuid default null,\n  p_code_chantier text default null,p_vehicule_id uuid default null,p_code_vehicule text default null,\n  p_outil_id uuid default null,p_code_outil text default null,p_teinte_id uuid default null,p_motif text default null",
      );
      expect(blocEnregistrerMouvement).toContain(") returns uuid language plpgsql security definer set search_path=public,extensions as $$");
    });

    it("préserve la logique métier étrangère au préfixe : anti-brute-force, mot de passe personnel (crypt), droit de poste, contrainte d'une seule destination", () => {
      expect(blocEnregistrerMouvement).toContain("v_echecs>=8");
      expect(blocEnregistrerMouvement).toContain("crypt(coalesce(p_mot_de_passe,''),code_stock_hash)=code_stock_hash");
      expect(blocEnregistrerMouvement).toContain("pp.cle_permission=v_droit and pp.autorise");
      expect(blocEnregistrerMouvement).toContain("v_destinations>1 then raise exception 'Une seule destination est autorisée par mouvement'");
    });

    it("ne touche pas à la comparaison de l'identifiant salarié personnel (schéma indépendant des codes QR, ne doit jamais être normalisé)", () => {
      expect(blocEnregistrerMouvement).toContain(
        "upper(btrim(coalesce(p_identifiant_employe,''))) in (upper(identifiant_interne),upper(reference_interne),upper(numero_inscription))",
      );
    });

    it("utilise la normalisation pour les 4 codes scannés (article, chantier, véhicule, outil) et ne compare plus jamais leur seule valeur brute", () => {
      for (const param of ["p_code_article", "p_code_chantier", "p_code_vehicule", "p_code_outil"]) {
        expect(blocEnregistrerMouvement).not.toMatch(new RegExp(`upper\\(btrim\\(${param}\\)\\)`));
      }
      const occurrencesArticle = (blocEnregistrerMouvement.match(/public\.normaliser_code_identification\(p_code_article\)/g) ?? []).length;
      expect(occurrencesArticle).toBe(4); // référence + code-barres + codes_identification + audit code_scan_utilise
      for (const param of ["p_code_chantier", "p_code_vehicule", "p_code_outil"]) {
        expect(blocEnregistrerMouvement).toContain(`upper(code)=public.normaliser_code_identification(${param})`);
      }
    });

    it("code_scan_utilise (colonne d'audit) utilise désormais la même normalisation que la recherche, comportement documenté", () => {
      expect(blocEnregistrerMouvement).toContain("true,public.normaliser_code_identification(p_code_article)");
    });
  });

  it("étape 6 : le contrôle de collision est un SELECT pur, placé avant le premier UPDATE, portant sur l'ensemble du jeu de données", () => {
    const blocCollision = sql.slice(indexControleCollisions, indexConversion);
    const sansCommentaires = blocCollision.replace(/--.*$/gm, "");
    expect(blocCollision).toContain("where exists (");
    expect(blocCollision).toContain("upper(c2.code) = upper(conv.nouveau_code)");
    expect(sansCommentaires).not.toMatch(/\bupdate\s+public\./i);
    expect(sansCommentaires).not.toMatch(/\binsert\s+into\b/i);
  });

  it("étape 6 : la comparaison de collision est bornée à l'entreprise, insensible à la casse, et exclut la ligne elle-même", () => {
    const blocCollision = sql.slice(indexControleCollisions, indexConversion);
    expect(blocCollision).toContain("c2.entreprise_id = conv.entreprise_id");
    expect(blocCollision).toContain("c2.id <> conv.id");
  });

  it("étape 7 : la conversion en masse est un UPDATE...FROM unique (pas de boucle ligne à ligne), donc atomique", () => {
    const blocConversion = sql.slice(indexConversion, indexGardeFouRestant);
    expect(blocConversion).not.toMatch(/\bfor\b[\s\S]*\bin\b[\s\S]*\bloop\b/i);
    expect((blocConversion.match(/\bupdate\b/gi) ?? []).length).toBe(1);
  });

  it("étape 8 : un garde-fou explicite vérifie qu'aucun code LGP-* connu ne subsiste après la conversion", () => {
    const blocGardeFou = sql.slice(indexGardeFouRestant, indexValidationDefinitive);
    for (const [ancien] of PREFIXES_ATTENDUS) {
      expect(blocGardeFou).toContain(`code like '${ancien}%'`);
    }
  });

  it("étape 9 : la validation SQL finale n'accepte plus que ELS-* pour les nouvelles lignes, plus aucune trace de LGP dans son motif", () => {
    const blocFinal = sql.slice(indexGardeFouRestant);
    expect(blocFinal).toContain("^ELS-[A-Z]{2,4}-[A-Z0-9]{6,16}$");
    expect(blocFinal).not.toMatch(/\^\(LGP\|ELS\)/);
    expect(blocFinal).not.toMatch(/\^LGP-/);
  });

  it("limite strictement la conversion des lignes stockées (étapes 6 et 7) aux 5 préfixes connus, sans en omettre ni en ajouter", () => {
    const blocsValues = [...sql.slice(indexControleCollisions).matchAll(/join \(values([\s\S]*?)\) as p\(ancien,nouveau\)/g)];
    expect(blocsValues.length).toBe(2); // étape 6 (collisions) + étape 7 (conversion)
    for (const bloc of blocsValues) {
      const paires = [...bloc[1].matchAll(/\('([^']+)','([^']+)'\)/g)].map((m) => [m[1], m[2]]);
      expect(paires).toEqual(PREFIXES_ATTENDUS.map(([a, b]) => [a, b]));
    }
  });

  it("préserve le suffixe au caractère près pour chaque préfixe dans la conversion des lignes stockées (longueur du préfixe retirée exactement, jamais un nombre fixe)", () => {
    const occurrences = sql.slice(indexControleCollisions).match(/substr\(src\.code, length\(p\.ancien\) \+ 1\)/g) ?? [];
    expect(occurrences.length).toBe(2); // étape 6 (calcul cible) + étape 7 (conversion)
  });

  it("est idempotente par construction : la conversion des lignes stockées ne porte que sur les codes encore au format LGP-*", () => {
    expect(sql.slice(indexControleCollisions)).toMatch(/on src\.code like p\.ancien \|\| '%'/);
  });

  it("ne touche à aucune autre table métier (mouvements_stock.code_scan_utilise laissé en historique, seul codes_identification est écrit)", () => {
    expect(sql).not.toMatch(/update public\.mouvements_stock/i);
    expect(sql).not.toMatch(/alter table\b/i);
    expect(sql.toLowerCase()).not.toContain("drop table");
    expect(sql.toLowerCase()).not.toContain("delete from");
  });

  it("recense explicitement les versions historiques mortes du RPC borne stock (v1/v2/v3) sans les modifier", () => {
    expect(sql).toMatch(/enregistrer_mouvement_stock_borne\s*\/\s*_v2\s*\/\s*_v3/);
    expect(sql).not.toContain("create or replace function public.enregistrer_mouvement_stock_borne(");
    expect(sql).not.toContain("create or replace function public.enregistrer_mouvement_stock_borne_v2");
    expect(sql).not.toContain("create or replace function public.enregistrer_mouvement_stock_borne_v3");
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
