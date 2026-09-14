import { describe, expect, it } from "vitest";
import {
  ajouterJours, blocsDeVue, changerLigne, deplacer, detecterConflits, instant, joursDeVue, jourDe, lignesDeVue, lundiDe, minutesDepuisMinuit, redimensionner,
  type Equipe, type Evenement,
} from "./modele";

const ev = (p: Partial<Evenement> & { id: string; debut: string; fin: string }): Evenement => ({
  titre: p.id, type: "chantier", statut: "planifie", journeeEntiere: false, couleur: null, chantierId: null, clientId: null, adresse: null, notes: null, affectations: [], ...p,
});
const equipes: Equipe[] = [{ id: "eq1", nom: "Équipe A", couleur: null, membres: ["s1", "s2"] }];

describe("dates Paris", () => {
  it("instant et lecture locale se répondent, été comme hiver", () => {
    expect(minutesDepuisMinuit(instant("2026-07-15", 8 * 60))).toBe(480);
    expect(minutesDepuisMinuit(instant("2026-01-15", 8 * 60))).toBe(480);
    expect(jourDe(instant("2026-03-29", 23 * 60 + 30))).toBe("2026-03-29");
    expect(instant("2026-07-15", 8 * 60)).toBe("2026-07-15T06:00:00.000Z");
    expect(instant("2026-01-15", 8 * 60)).toBe("2026-01-15T07:00:00.000Z");
  });
  it("semaine du lundi au dimanche, mois sur 5 ou 6 semaines", () => {
    expect(lundiDe("2026-09-12")).toBe("2026-09-07");
    expect(joursDeVue("semaine", "2026-09-12")).toEqual(["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"]);
    expect(joursDeVue("mois", "2026-09-12")[0]).toBe("2026-08-31");
    expect(joursDeVue("mois", "2026-09-12").length % 7).toBe(0);
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("projection en blocs", () => {
  const a = ev({ id: "a", debut: instant("2026-09-08", 480), fin: instant("2026-09-08", 720), affectations: [{ employeId: "s1" }] });
  const b = ev({ id: "b", debut: instant("2026-09-08", 600), fin: instant("2026-09-08", 840), affectations: [{ equipeId: "eq1" }] });
  const nuit = ev({ id: "n", debut: instant("2026-09-08", 22 * 60), fin: instant("2026-09-09", 2 * 60) });
  it("vue semaine : un bloc par jour couvert ; un évènement à cheval sur minuit en fait deux", () => {
    const blocs = blocsDeVue([a, nuit], "semaine", joursDeVue("semaine", "2026-09-08"), equipes);
    expect(blocs.filter((x) => x.evenement.id === "n").map((x) => [x.jour, x.debutMin, x.finMin])).toEqual([["2026-09-08", 1320, 1440], ["2026-09-09", 0, 120]]);
  });
  it("vue salarié : un évènement d'équipe apparaît sur chaque membre ; chevauchement → deux colonnes", () => {
    const blocs = blocsDeVue([a, b], "salarie", ["2026-09-08"], equipes);
    expect(blocs.filter((x) => x.ligne === "s:s1")).toHaveLength(2);
    expect(blocs.filter((x) => x.ligne === "s:s2")).toHaveLength(1);
    const s1 = blocs.filter((x) => x.ligne === "s:s1");
    expect(s1.map((x) => x.colonnes)).toEqual([2, 2]);
    expect(new Set(s1.map((x) => x.colonne)).size).toBe(2);
  });
  it("un évènement annulé n'est pas dessiné ; lignes de vue avec une ligne « sans »", () => {
    expect(blocsDeVue([{ ...a, statut: "annule" }], "jour", ["2026-09-08"], equipes)).toHaveLength(0);
    const lignes = lignesDeVue("chantier", [], { salaries: [], equipes, chantiers: [{ id: "c1", nom: "Villa" }], ressources: [] });
    expect(lignes.map((l) => l.cle)).toEqual(["c:c1", "c:"]);
  });
});

describe("conflits", () => {
  const a = ev({ id: "a", debut: instant("2026-09-08", 480), fin: instant("2026-09-08", 720), affectations: [{ employeId: "s1" }, { ressourceId: "r1" }] });
  const b = ev({ id: "b", debut: instant("2026-09-08", 600), fin: instant("2026-09-08", 840), affectations: [{ equipeId: "eq1" }, { ressourceId: "r1" }] });
  it("salarié en double (via l'équipe), ressource en double, sur les deux évènements", () => {
    const c = detecterConflits([a, b], { equipes });
    expect(c.filter((x) => x.type === "salarie_double").map((x) => `${x.evenementId}:${x.sujetId}`).sort()).toEqual(["a:s1", "b:s1"]);
    expect(c.filter((x) => x.type === "ressource_double")).toHaveLength(2);
  });
  it("pas de conflit sans chevauchement ; congé signalé comme tel ; surcharge au-delà du plafond", () => {
    const apres = ev({ id: "c", debut: instant("2026-09-08", 720), fin: instant("2026-09-08", 900), affectations: [{ employeId: "s1" }] });
    expect(detecterConflits([a, apres], { equipes })).toHaveLength(0);
    const conge = ev({ id: "k", type: "conge", journeeEntiere: true, debut: instant("2026-09-08", 0), fin: instant("2026-09-09", 0), affectations: [{ employeId: "s1" }] });
    expect(detecterConflits([a, conge], { equipes }).some((x) => x.type === "conge")).toBe(true);
    const long = ev({ id: "l", debut: instant("2026-09-08", 6 * 60), fin: instant("2026-09-08", 20 * 60), affectations: [{ employeId: "s1" }] });
    expect(detecterConflits([long], { equipes, plafondHeures: 10 }).some((x) => x.type === "surcharge")).toBe(true);
  });
  it("hors disponibilité déclarée", () => {
    const dispo = [{ employeId: "s1", jourSemaine: 1, debut: "08:00", fin: "12:00" }];
    const tard = ev({ id: "t", debut: instant("2026-09-08", 14 * 60), fin: instant("2026-09-08", 16 * 60), affectations: [{ employeId: "s1" }] });
    expect(detecterConflits([tard], { equipes, disponibilites: dispo }).map((x) => x.type)).toEqual(["hors_disponibilite"]);
    expect(detecterConflits([a], { equipes, disponibilites: dispo })).toHaveLength(0);
  });
});

describe("manipulations", () => {
  const a = ev({ id: "a", debut: instant("2026-09-08", 480), fin: instant("2026-09-08", 720), affectations: [{ employeId: "s1" }] });
  it("déplacer conserve la durée ; redimensionner arrondit au quart d'heure et ne passe pas minuit", () => {
    const d = deplacer(a, 90);
    expect(minutesDepuisMinuit(d.debut)).toBe(570);
    expect(minutesDepuisMinuit(d.fin)).toBe(810);
    expect(minutesDepuisMinuit(redimensionner(a, 823).fin)).toBe(825);
    expect(redimensionner(a, 1500).fin).toBe(instant("2026-09-09", 0));
    expect(minutesDepuisMinuit(redimensionner(a, 100).fin)).toBe(495);
  });
  it("changer de ligne remplace l'affectation, ou le chantier, jamais entre genres", () => {
    expect(changerLigne(a, "s:s1", "s:s2").affectations).toEqual([{ employeId: "s2" }]);
    expect(changerLigne(a, "s:s1", "s:").affectations).toEqual([]);
    expect(changerLigne({ ...a, chantierId: "c1" }, "c:c1", "c:c2").chantierId).toBe("c2");
    expect(changerLigne(a, "s:s1", "r:r1")).toBe(a);
  });
});

describe("empilement et charge", () => {
  const base = { type: "chantier" as const, statut: "planifie" as const, journeeEntiere: false, couleur: null, chantierId: null, clientId: null, adresse: null, notes: null };
  it("en vue semaine, deux évènements du même jour sans chevauchement s'empilent quand même", () => {
    const evs = [
      { ...base, id: "a", titre: "A", debut: instant("2026-09-14", 480), fin: instant("2026-09-14", 720), affectations: [{ employeId: "s1" }] },
      { ...base, id: "b", titre: "B", debut: instant("2026-09-14", 780), fin: instant("2026-09-14", 1020), affectations: [{ employeId: "s1" }] },
    ];
    const libres = blocsDeVue(evs, "salarie", ["2026-09-14"], []);
    expect(libres.map((b) => b.colonnes)).toEqual([1, 1]);
    const empiles = blocsDeVue(evs, "salarie", ["2026-09-14"], [], { empiler: true });
    expect(empiles.map((b) => [b.colonne, b.colonnes])).toEqual([[0, 2], [1, 2]]);
  });
  it("un congé journée entière ne compte pas comme surcharge", () => {
    const evs = [{ ...base, id: "c", titre: "Congé", type: "conge" as const, journeeEntiere: true, debut: instant("2026-09-17", 0), fin: instant("2026-09-18", 0), affectations: [{ employeId: "s2" }] }];
    expect(detecterConflits(evs, { equipes: [] })).toEqual([]);
  });
});
