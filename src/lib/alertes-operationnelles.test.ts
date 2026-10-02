import { describe, expect, it } from "vitest";
import {
  construireAlertes,
  filtrerAlertes,
  lireEtatAlertes,
  pageAlertes,
  repartirAlertes,
  resumerAlertes,
  type SourcesAlertes, alertesDepassement, sourcesDepuisLectures } from "./alertes-operationnelles";

// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 : le centre d'alertes n'envoie plus qu'un résumé et une
// première page. Ces tests prouvent qu'aucune alerte n'est perdue (pagination complète, sans
// doublon, dans l'ordre d'avant) et que l'état utilisateur est lu au-delà de 1 000 lignes.

const AUJOURDHUI = "2026-09-30";
const vide: SourcesAlertes = { facturesAlertes: [], devisAlertes: [], relancesEnEchec: [], articles: [], vehicules: [], outils: [], commandes: [] };

function sourcesVolumineuses(n: number): SourcesAlertes {
  return {
    ...vide,
    facturesAlertes: Array.from({ length: n }, (_, i) => ({
      id: `f${String(i).padStart(5, "0")}`, numero: `F-${i}`, montant_ttc: 1200, montant_paye: 200,
      date_echeance: `2026-${String(1 + (i % 9)).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}`,
      client: { nom: "Durand", prenom: "Luc", societe: null },
    })),
    devisAlertes: Array.from({ length: n / 2 }, (_, i) => ({ id: `d${i}`, numero: `D-${i}`, montant_ttc: 500, date_validite: "2026-10-03" })),
    articles: [{ id: "a1", reference: "VIS", designation: "Vis 4x40", quantite_stock: 0, seuil_alerte: 10, unite: "u" }],
  };
}

describe("construireAlertes", () => {
  it("critiques d'abord, puis par date ; mêmes textes et signature qu'avant", () => {
    const alertes = construireAlertes({
      ...vide,
      devisAlertes: [{ id: "d1", numero: "D-1", montant_ttc: 500, date_validite: "2026-10-02" }],
      facturesAlertes: [{ id: "f1", numero: "F-1", montant_ttc: 1000, montant_paye: 400, date_echeance: "2026-09-01", client: { nom: "Durand", prenom: "Luc", societe: null } }],
      articles: [{ id: "a1", reference: "VIS", designation: "Vis", quantite_stock: 3, seuil_alerte: 10, unite: "u" }],
    }, AUJOURDHUI, true);
    expect(alertes.map((a) => a.id)).toEqual(["facture-f1", "devis-d1", "stock-a1"]);
    expect(alertes[0]).toMatchObject({ niveau: "critique", titre: "F-1 à encaisser", href: "/factures/f1" });
    expect(alertes[0].detail).toContain("Luc Durand · reste");
    expect(alertes[0].signature).toBe(["critique", "2026-09-01", alertes[0].titre, alertes[0].detail].join("|"));
    expect(alertes[1].detail).toContain("Montant");
  });

  it("sans droit financier : aucun montant", () => {
    const [alerte] = construireAlertes({ ...vide, devisAlertes: [{ id: "d1", numero: "D-1", montant_ttc: 500, date_validite: "2026-10-02" }] }, AUJOURDHUI, false);
    expect(alerte.detail).toBe("Validité à contrôler");
  });
});

describe("pagination du centre d'alertes", () => {
  const supabaseSansDelegation = {
    from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }) }),
  } as never;

  it("parcourt TOUTES les alertes, sans doublon ni trou, dans l'ordre complet", async () => {
    const alertes = construireAlertes(sourcesVolumineuses(2000), AUJOURDHUI, true);
    const centre = repartirAlertes(alertes, { masquages: [], delegations: [] });
    expect(centre.actives.length).toBe(3001);
    const vues: string[] = [];
    for (let debut = 0; debut < centre.actives.length; debut += 30) {
      const page = await pageAlertes(supabaseSansDelegation, "e", centre, { filtre: "toutes", debut, nombre: 30, employeCourantId: null, utilisateurCourantId: "u" });
      expect(page.total).toBe(3001);
      vues.push(...page.alertes.map((a) => a.id));
    }
    expect(vues).toEqual(centre.actives.map((a) => a.id));
    expect(new Set(vues).size).toBe(3001);
  });

  it("borne la taille d'une page (200 au plus) et les bornes invalides", async () => {
    const centre = repartirAlertes(construireAlertes(sourcesVolumineuses(1000), AUJOURDHUI, true), { masquages: [], delegations: [] });
    const page = await pageAlertes(supabaseSansDelegation, "e", centre, { filtre: "toutes", debut: -5, nombre: 10_000, employeCourantId: null, utilisateurCourantId: "u" });
    expect(page.alertes.length).toBe(200);
    expect(page.alertes[0].id).toBe(centre.actives[0].id);
  });

  it("ignorées (signature identique), filtres de délégation et résumé exacts", () => {
    const alertes = construireAlertes(sourcesVolumineuses(100), AUJOURDHUI, true);
    const [a, b, c, d] = alertes;
    const centre = repartirAlertes(alertes, {
      masquages: [{ alerte_cle: a.id, signature: a.signature }, { alerte_cle: b.id, signature: "ancienne" }],
      delegations: [
        { alerte_cle: c.id, employe_id: "emp-moi", delegue_par_user_id: "autre" },
        { alerte_cle: d.id, employe_id: "emp-x", delegue_par_user_id: "moi" },
        { alerte_cle: a.id, employe_id: "emp-moi", delegue_par_user_id: "moi" }, // ignorée : hors actives
        { alerte_cle: "disparue", employe_id: "emp-moi", delegue_par_user_id: "moi" },
      ],
    });
    expect(centre.ignorees.map((x) => x.id)).toEqual([a.id]);
    expect(centre.actives.some((x) => x.id === b.id)).toBe(true); // signature changée : réapparaît
    expect(filtrerAlertes(centre, "mes_alertes", "emp-moi", "moi").map((x) => x.id)).toEqual([c.id]);
    expect(filtrerAlertes(centre, "deleguees_par_moi", "emp-moi", "moi").map((x) => x.id)).toEqual([d.id]);
    expect(filtrerAlertes(centre, "mes_alertes", null, "moi")).toEqual([]);
    const resume = resumerAlertes(centre, "emp-moi", "moi");
    expect(resume).toMatchObject({ total: alertes.length - 1, ignorees: 1, delegationsActives: 2, mesAlertes: 1, delegueesParMoi: 1 });
    expect(resume.critiques).toBe(centre.actives.filter((x) => x.niveau === "critique").length);
    expect(resume.domaines.sort()).toEqual(["Commercial", "Facturation", "Stock"]);
  });

  it("détail des délégations lu pour les seules alertes de la page (URL bornée)", async () => {
    const alertes = construireAlertes(sourcesVolumineuses(200), AUJOURDHUI, true);
    const centre = repartirAlertes(alertes, {
      masquages: [],
      delegations: alertes.map((x) => ({ alerte_cle: x.id, employe_id: "e1", delegue_par_user_id: "u1" })),
    });
    const demandes: string[][] = [];
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ in: async (_: string, cles: string[]) => {
        demandes.push(cles);
        return { data: cles.map((cle) => ({ alerte_cle: cle, employe_id: "e1", delegue_par_user_id: "u1", delegue_at: "2026-09-01T10:00:00Z", commentaire: null, employe: { prenom: "Ana", nom: "Roy" }, delegue_par: [{ prenom: "Max", nom: "Lin" }] })) };
      } }) }) }),
    } as never;
    const page = await pageAlertes(supabase, "e", centre, { filtre: "toutes", debut: 30, nombre: 30, employeCourantId: null, utilisateurCourantId: "u" });
    expect(demandes).toHaveLength(1);
    expect(demandes[0]).toEqual(alertes.slice(30, 60).map((x) => x.id));
    expect(page.delegations[alertes[30].id]).toMatchObject({ employePrenom: "Ana", deleguePar: "Max Lin", delegueParUserId: "u1" });
  });
});

describe("lireEtatAlertes", () => {
  it("lit masquages et délégations par lots au-delà de max_rows (1 000)", async () => {
    const lignes = (table: string) => Array.from({ length: table.includes("ignorees") ? 2500 : 1000 }, (_, i) => ({ alerte_cle: `k${i}`, signature: "s", employe_id: "e", delegue_par_user_id: "u" }));
    const plages: Record<string, [number, number][]> = {};
    const supabase = {
      from: (table: string) => {
        const requete = {
          select: () => requete, eq: () => requete, order: () => requete,
          range: async (de: number, a: number) => {
            (plages[table] ??= []).push([de, a]);
            return { data: lignes(table).slice(de, a + 1), error: null };
          },
        };
        return requete;
      },
    } as never;
    const etat = await lireEtatAlertes(supabase, "e", "u");
    expect(etat.masquages).toHaveLength(2500);
    expect(etat.delegations).toHaveLength(1000);
    expect(plages.alertes_operationnelles_ignorees).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(plages.alertes_operationnelles_delegations).toEqual([[0, 999], [1000, 1999]]);
  });
});

// Train canonique V9 — convergence GP residual data correctness × capacité pages lourdes :
// le centre d'alertes (pagination) est alimenté par les sources calculées en base et bornées,
// et un dépassement de borne reste visible (« N autres … »), sur la première page comme sur les suivantes.
describe("V9 — sources bornées en base et dépassement visible", () => {
  const voir = { flotte: true, outillage: true };
  const stock = { nb: 52, nbRuptures: 3, articles: [{ id: "a1", reference: "R1", designation: "Vis", quantite_stock: 0, seuil_alerte: 5, unite: "u" }] };
  const parc = {
    nbVehicules: 201, vehicules: [{ id: "v1", immatriculation: "AA-1", marque: "M", modele: "X", kilometrage: 10, controle_technique_echeance: "2026-10-01", assurance_echeance: null, prochain_entretien_date: null, prochain_entretien_km: null }],
    nbOutils: 1, outils: [{ id: "o1", reference: "O1", designation: "Perfo", prochaine_verification: "2026-10-05" }],
  };

  it("alertes « N autres » pour stock et flotte, aucune quand tout est affiché", () => {
    expect(alertesDepassement(voir, stock, parc).map((a) => [a.id, a.titre])).toEqual([
      ["stock-autres", "51 autres articles sous le seuil"],
      ["flotte-autres", "200 autres véhicules à échéance"],
    ]);
    expect(alertesDepassement({ flotte: false, outillage: true }, null, parc)).toEqual([]);
  });

  it("le centre d'alertes inclut les sources en base et les dépassements, droits respectés", () => {
    const sources = sourcesDepuisLectures({ voir: { flotte: false, outillage: true }, indicateurs: {}, relancesEnEchec: [], stock, parc, commandes: [] });
    expect(sources.vehicules).toEqual([]);
    const ids = construireAlertes(sources, "2026-10-02", true).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["stock-a1", "outil-o1", "stock-autres"]));
    expect(ids).not.toContain("flotte-autres");
    expect(ids.some((id) => id.startsWith("ct-"))).toBe(false);
  });
});
