import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LIBELLES_STATUT, STATUTS_RESERVE, TRANSITIONS_RESERVE,
  estEnRetard, estStatutTermine, peutDemanderLevee,
  transitionAutorisee, transitionsPossibles,
} from "./workflow";

const MIGRATION = fileURLToPath(
  new URL("../../../../supabase/migrations/20260906000268_reserves_v1_foundation_workflow_v1.sql", import.meta.url),
);

describe("machine à états des réserves", () => {
  // Le miroir TypeScript n'a de valeur que s'il reste fidèle à la matrice SQL. Ce test
  // lit la migration elle-même : une transition ajoutée en base sans être reportée ici
  // (ou l'inverse) fait échouer la vérification.
  it("reste aligné sur la matrice de la migration", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const bloc = sql.split("insert into public.reserves_transitions")[1].split(";")[0];
    const lignes = [...bloc.matchAll(/\('([a-z_]+)','([a-z_]+)','([a-z]+)','([a-z_]+)',(true|false)\)/g)];

    expect(lignes.length).toBe(TRANSITIONS_RESERVE.length);
    for (const [, avant, apres, acteur, action, commentaire] of lignes) {
      const miroir = TRANSITIONS_RESERVE.find(
        (t) => t.statutAvant === avant && t.statutApres === apres && t.acteur === acteur,
      );
      expect(miroir, `transition ${avant}→${apres} (${acteur}) absente du miroir`).toBeDefined();
      expect(miroir!.action).toBe(action);
      expect(miroir!.commentaireObligatoire).toBe(commentaire === "true");
    }
  });

  it("n'autorise aucun raccourci vers la levée", () => {
    expect(transitionAutorisee("emise", "levee", "hote")).toBe(false);
    expect(transitionAutorisee("assignee", "levee", "hote")).toBe(false);
    expect(transitionAutorisee("acceptee", "levee", "hote")).toBe(false);
    expect(transitionAutorisee("levee_demandee", "levee", "hote")).toBe(true);
  });

  it("sépare les gestes de l'hôte et ceux de l'entreprise intervenante", () => {
    expect(transitionAutorisee("assignee", "acceptee", "hote")).toBe(false);
    expect(transitionAutorisee("assignee", "acceptee", "intervenant")).toBe(true);
    expect(transitionAutorisee("levee_demandee", "levee", "intervenant")).toBe(false);
    expect(transitionAutorisee("levee_demandee", "levee_refusee", "intervenant")).toBe(false);
  });

  it("laisse une sortie à chaque état non terminal", () => {
    for (const statut of STATUTS_RESERVE) {
      const sorties = [
        ...transitionsPossibles(statut, "hote"),
        ...transitionsPossibles(statut, "intervenant"),
      ];
      if (statut === "annulee") expect(sorties).toHaveLength(0);
      else expect(sorties.length).toBeGreaterThan(0);
    }
  });

  it("exige un motif là où la base l'exige", () => {
    const refus = TRANSITIONS_RESERVE.find((t) => t.action === "refus_responsabilite");
    const leveeRefusee = TRANSITIONS_RESERVE.find((t) => t.action === "levee_refusee");
    const reouverture = TRANSITIONS_RESERVE.find((t) => t.action === "reouverture");
    expect(refus?.commentaireObligatoire).toBe(true);
    expect(leveeRefusee?.commentaireObligatoire).toBe(true);
    expect(reouverture?.commentaireObligatoire).toBe(true);
  });

  it("libelle chaque statut", () => {
    for (const statut of STATUTS_RESERVE) {
      expect(LIBELLES_STATUT[statut]).toBeTruthy();
    }
  });

  it("identifie les états terminaux", () => {
    expect(estStatutTermine("levee")).toBe(true);
    expect(estStatutTermine("annulee")).toBe(true);
    expect(estStatutTermine("levee_demandee")).toBe(false);
  });
});

describe("photo obligatoire pour la levée", () => {
  const base = { statut: "acceptee" as const, photoObligatoireLevee: true, nbPhotosTravaux: 0 };

  it("bloque la demande tant que la preuve manque, réserve par réserve", () => {
    expect(peutDemanderLevee(base).possible).toBe(false);
    expect(peutDemanderLevee(base).motif).toMatch(/photo/i);
  });

  it("laisse passer dès qu'une photo de travaux existe", () => {
    expect(peutDemanderLevee({ ...base, nbPhotosTravaux: 1 }).possible).toBe(true);
  });

  it("n'exige rien sur une réserve qui ne le demande pas", () => {
    expect(peutDemanderLevee({ ...base, photoObligatoireLevee: false }).possible).toBe(true);
  });

  it("refuse quand l'état ne permet pas la demande, photo ou non", () => {
    const resultat = peutDemanderLevee({ ...base, statut: "assignee", nbPhotosTravaux: 3 });
    expect(resultat.possible).toBe(false);
    expect(resultat.motif).toMatch(/état actuel/i);
  });
});

describe("retard", () => {
  const jour = new Date("2026-09-06T10:00:00Z");

  it("compte une échéance dépassée sur une réserve encore ouverte", () => {
    expect(estEnRetard({ statut: "assignee", echeance: "2026-09-05" }, jour)).toBe(true);
  });

  it("ne compte ni les réserves levées ni les annulées", () => {
    expect(estEnRetard({ statut: "levee", echeance: "2026-09-05" }, jour)).toBe(false);
    expect(estEnRetard({ statut: "annulee", echeance: "2026-09-05" }, jour)).toBe(false);
  });

  it("ne compte pas une échéance du jour ni une réserve sans échéance", () => {
    expect(estEnRetard({ statut: "assignee", echeance: "2026-09-06" }, jour)).toBe(false);
    expect(estEnRetard({ statut: "assignee", echeance: null }, jour)).toBe(false);
  });
});
