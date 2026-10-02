import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vérification statique du HOTFIX 813 : `plateforme_annuaire_entreprises` en lecture pure.
// N'ouvre aucune connexion : lit le fichier de migration. Le comportement réel (transaction
// lecture seule, onglets, filtres) est prouvé par supabase/tests/plateforme_annuaire_lecture_pure.test.sql.
const racine = resolve(import.meta.dirname, "../..");
const sql = readFileSync(
  resolve(racine, "supabase/migrations/20261002000813_plateforme_annuaire_lecture_pure.sql"),
  "utf8",
);
const corps = sql.slice(sql.indexOf("as $$"), sql.lastIndexOf("$$;"));
const sansCommentaires = corps.replace(/--[^\n]*/g, "");

describe("HOTFIX 813 : annuaire plateforme en lecture pure (vérification statique)", () => {
  it("redéfinit la fonction avec la même signature, STABLE et SECURITY DEFINER", () => {
    expect(sql).toContain("create or replace function public.plateforme_annuaire_entreprises(");
    expect(sql).toMatch(/\n\s*security definer\n\s*stable\n/);
    expect(sql).toContain(
      "grant execute on function public.plateforme_annuaire_entreprises(text,text,text,text,integer,integer,jsonb)\n  to authenticated;",
    );
  });

  it("n'appelle plus appliquer_suspensions_impayes() ni aucune écriture", () => {
    expect(sansCommentaires).not.toMatch(/appliquer_suspensions_impayes/);
    expect(sansCommentaires).not.toMatch(/\b(update|insert|delete)\s+(into\s+|from\s+)?public\./i);
  });

  it("calcule le statut effectif avec le prédicat exact du cron", () => {
    expect(sansCommentaires.replace(/\s+/g, " ")).toContain(
      "case when e.suspension_prevue_at is not null and e.suspension_prevue_at <= v_maintenant " +
        "and e.abonnement_statut not in ('suspendu', 'annule') then 'suspendu' else e.abonnement_statut end as statut_effectif",
    );
  });

  it("utilise le statut effectif dans les onglets, le filtre et le champ renvoyé", () => {
    expect(sansCommentaires).not.toMatch(/\bb\.abonnement_statut\b/);
    expect(sansCommentaires).toContain("p_onglet = 'actives'          and b.statut_effectif = 'actif'");
    expect(sansCommentaires).toContain("p_onglet = 'essais'           and b.statut_effectif = 'essai'");
    expect(sansCommentaires).toContain("p_onglet = 'suspendues'       and b.statut_effectif = 'suspendu'");
    expect(sansCommentaires).toContain("p_onglet = 'resiliees'        and (b.statut_effectif = 'annule'");
    expect(sansCommentaires).toContain("b.statut_effectif = p_filtres->>'statutAbonnement'");
    expect(sansCommentaires).toContain("'abonnement_statut', p.statut_effectif,");
  });
});
