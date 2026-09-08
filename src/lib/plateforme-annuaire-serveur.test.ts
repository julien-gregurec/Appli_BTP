import { describe, expect, it, vi } from "vitest";
import {
  PLAFOND_MODE_DEGRADE,
  composerAnnuaire,
  construireLigneAnnuaire,
  type SourceAnnuaire,
} from "@/lib/plateforme-annuaire-serveur";
import { analyserRequeteAnnuaire, type LigneAnnuaire } from "@/lib/plateforme-annuaire";

const MAINTENANT = new Date("2026-09-08T12:00:00Z");

const VILLES = ["Nîmes", "Alès", "Montpellier", "Béziers", "Sète"];
const OFFRES = ["mini", "pro", "business", "entreprise"];

/** Parc synthétique déterministe, utilisé aussi pour les mesures de charge. */
function parc(taille: number): LigneAnnuaire[] {
  return Array.from({ length: taille }, (_, index) => {
    const jour = String((index % 28) + 1).padStart(2, "0");
    const enRetard = index % 7 === 0;
    const impaye = index % 23 === 0;
    return {
      id: `entreprise-${index}`,
      nom: index % 11 === 0 ? `Bâtiment Dupré ${index}` : `Entreprise ${index}`,
      raison_sociale: `SARL Société ${index}`,
      siret: String(10000000000000 + index),
      ville: VILLES[index % VILLES.length],
      code_postal: `300${String(index % 100).padStart(2, "0")}`,
      reference_interne: `CLI-${String(index).padStart(5, "0")}`,
      code_adhesion: `COD${index}`,
      proprietaire_nom: `Contact ${index}`,
      proprietaire_email: `contact${index}@exemple.fr`,
      telephone: `04660000${String(index % 100).padStart(2, "0")}`,
      created_at: `2026-0${(index % 8) + 1}-${jour}T09:00:00Z`,
      abonnement_statut: index % 5 === 0 ? "essai" : "actif",
      abonnement_offre: OFFRES[index % OFFRES.length],
      abonnement_periodicite: index % 3 === 0 ? "annuel" : "mensuel",
      abonnement_echeance: enRetard ? "2026-08-20" : "2026-10-20",
      abonnement_essai_fin: null,
      abonnement_annulation_prevue_at: null,
      prix_contractuel_ht: index % 13 === 0 ? null : 100 + (index % 40),
      remise_type: index % 17 === 0 ? "pourcentage" : null,
      remise_valeur: index % 17 === 0 ? 25 : null,
      remise_description: index % 17 === 0 ? "-25 %" : null,
      remise_duree_mois: index % 17 === 0 ? 3 : null,
      remise_appliquee_at: index % 17 === 0 ? "2026-08-01T00:00:00Z" : null,
      suspension_prevue_at: impaye ? "2026-09-25T00:00:00Z" : null,
      derniere_facture_statut: enRetard ? "open" : "paid",
      derniere_facture_url: null,
      montant_impaye_ht: null,
      nb_comptes_actifs: index % 50,
      nb_comptes_facturables: index % 50,
      nb_salaries: index % 60,
      modules_actifs: index % 2 === 0 ? ["pointage"] : [],
      applications_actives: ["gestion_pro"],
      option_ia_statut: null,
      derniere_activite: "2026-09-01T08:00:00Z",
      facturation_lisible: true,
    } satisfies LigneAnnuaire;
  });
}

function sourceDegradee(lignes: LigneAnnuaire[]): SourceAnnuaire {
  return {
    annuaireIndexe: async () => null,
    toutesLesEntreprises: async () => lignes,
  };
}

describe("mode dégradé", () => {
  it("annonce le mode et la couverture réduite de la recherche", async () => {
    const resultat = await composerAnnuaire(sourceDegradee(parc(10)), analyserRequeteAnnuaire({}), MAINTENANT);
    expect(resultat.mode).toBe("degrade");
    expect(resultat.avertissements[0]).toContain("Index serveur non déployé");
    expect(resultat.champsRecherche).toEqual(["nom", "reference_interne", "code_adhesion"]);
  });

  it("pagine côté serveur et ne renvoie jamais plus d'une page", async () => {
    const resultat = await composerAnnuaire(sourceDegradee(parc(500)), analyserRequeteAnnuaire({}), MAINTENANT);
    expect(resultat.total).toBe(500);
    expect(resultat.lignes).toHaveLength(25);
    expect(resultat.pages).toBe(20);
  });

  it("respecte la taille de page demandée, dans les valeurs autorisées", async () => {
    const resultat = await composerAnnuaire(
      sourceDegradee(parc(500)),
      analyserRequeteAnnuaire({ taille: "100" }),
      MAINTENANT,
    );
    expect(resultat.lignes).toHaveLength(100);
  });

  it("ramène une page hors bornes à la dernière page réelle", async () => {
    const resultat = await composerAnnuaire(
      sourceDegradee(parc(30)),
      analyserRequeteAnnuaire({ page: "99" }),
      MAINTENANT,
    );
    expect(resultat.page).toBe(2);
    expect(resultat.lignes.length).toBeGreaterThan(0);
  });

  it("compte les onglets sur le jeu filtré complet, pas sur la page", async () => {
    const lignes = parc(500);
    const resultat = await composerAnnuaire(sourceDegradee(lignes), analyserRequeteAnnuaire({}), MAINTENANT);
    const essais = lignes.filter((l) => l.abonnement_statut === "essai").length;
    expect(resultat.compteursOnglets.essais).toBe(essais);
    expect(essais).toBeGreaterThan(resultat.lignes.length);
  });

  it("laisse le compteur de l'onglet archivées non renseigné", async () => {
    const resultat = await composerAnnuaire(sourceDegradee(parc(10)), analyserRequeteAnnuaire({}), MAINTENANT);
    expect(resultat.compteursOnglets.archivees).toBeNull();
  });

  it("applique recherche, filtre et tri avant de paginer", async () => {
    const resultat = await composerAnnuaire(
      sourceDegradee(parc(500)),
      analyserRequeteAnnuaire({ q: "dupre", tri: "nom", sens: "asc" }),
      MAINTENANT,
    );
    expect(resultat.total).toBeGreaterThan(0);
    expect(resultat.lignes.every((l) => l.nom.includes("Dupré"))).toBe(true);
    const noms = resultat.lignes.map((l) => l.nom);
    expect([...noms].sort((a, b) => a.localeCompare(b, "fr"))).toEqual(noms);
  });

  it("renvoie une page vide et un total nul pour une recherche sans résultat", async () => {
    const resultat = await composerAnnuaire(
      sourceDegradee(parc(200)),
      analyserRequeteAnnuaire({ q: "zzzz-introuvable" }),
      MAINTENANT,
    );
    expect(resultat.total).toBe(0);
    expect(resultat.lignes).toHaveLength(0);
    expect(resultat.erreur).toBeNull();
  });

  it("refuse de servir un parc au-delà du plafond du mode dégradé", async () => {
    const resultat = await composerAnnuaire(
      sourceDegradee(parc(PLAFOND_MODE_DEGRADE + 1)),
      analyserRequeteAnnuaire({}),
      MAINTENANT,
    );
    expect(resultat.lignes).toHaveLength(0);
    expect(resultat.erreur).toContain("dépassent le plafond");
    expect(resultat.resume).toBeNull();
  });

  it("marque la facturation illisible dès qu'une seule ligne l'est", async () => {
    const lignes = parc(10);
    lignes[3] = { ...lignes[3], facturation_lisible: false };
    const resultat = await composerAnnuaire(sourceDegradee(lignes), analyserRequeteAnnuaire({}), MAINTENANT);
    expect(resultat.facturationLisible).toBe(false);
  });
});

describe("mode indexé", () => {
  it("est préféré dès que la RPC répond", async () => {
    const lignes = parc(30);
    const source: SourceAnnuaire = {
      annuaireIndexe: async () => ({ lignes: lignes.slice(0, 25), total: 4_812, resume: null }),
      toutesLesEntreprises: vi.fn(async () => lignes),
    };
    const resultat = await composerAnnuaire(source, analyserRequeteAnnuaire({}), MAINTENANT);
    expect(resultat.mode).toBe("index_serveur");
    expect(resultat.total).toBe(4_812);
    expect(resultat.pages).toBe(Math.ceil(4_812 / 25));
    expect(resultat.avertissements).toHaveLength(0);
    expect(source.toutesLesEntreprises).not.toHaveBeenCalled();
  });

  it("couvre alors tous les champs de recherche", async () => {
    const source: SourceAnnuaire = {
      annuaireIndexe: async () => ({ lignes: [], total: 0, resume: null }),
      toutesLesEntreprises: async () => [],
    };
    const resultat = await composerAnnuaire(source, analyserRequeteAnnuaire({}), MAINTENANT);
    expect(resultat.champsRecherche).toContain("siret");
    expect(resultat.champsRecherche).toContain("ville");
  });
});

describe("construction d'une ligne", () => {
  it("n'invente jamais de montant d'impayé", () => {
    const ligne = construireLigneAnnuaire({ id: "x", nom: "Test" }, { facturationLisible: true });
    expect(ligne.montant_impaye_ht).toBeNull();
    expect(ligne.prix_contractuel_ht).toBeNull();
  });

  it("préfère le code offre de l'abonnement contractuel quand l'entreprise n'en porte pas", () => {
    const ligne = construireLigneAnnuaire(
      { id: "x", nom: "Test" },
      { abonnement: { code_offre: "business", periodicite: "annuel", prix_contractuel_ht: 1200 }, facturationLisible: true },
    );
    expect(ligne.abonnement_offre).toBe("business");
    expect(ligne.abonnement_periodicite).toBe("annuel");
    expect(ligne.prix_contractuel_ht).toBe(1200);
  });

  it("propage l'illisibilité de la facturation", () => {
    const ligne = construireLigneAnnuaire({ id: "x", nom: "Test" }, { facturationLisible: false });
    expect(ligne.facturation_lisible).toBe(false);
  });
});

describe("charge", () => {
  it("compose une page sur 500 entreprises en moins de 250 ms", async () => {
    const lignes = parc(500);
    const debut = performance.now();
    const resultat = await composerAnnuaire(
      sourceDegradee(lignes),
      analyserRequeteAnnuaire({ q: "dupre", tri: "montant", sens: "desc" }),
      MAINTENANT,
    );
    const duree = performance.now() - debut;
    expect(resultat.lignes.length).toBeGreaterThan(0);
    expect(duree).toBeLessThan(250);
  });

  it("refuse 5 000 entreprises en mode dégradé au lieu de les servir lentement", async () => {
    const lignes = parc(5_000);
    const debut = performance.now();
    const resultat = await composerAnnuaire(sourceDegradee(lignes), analyserRequeteAnnuaire({}), MAINTENANT);
    const duree = performance.now() - debut;
    // `toLocaleString("fr-FR")` sépare les milliers par une espace insécable
    // fine : on compare donc sur les chiffres, pas sur la mise en forme.
    expect(resultat.erreur?.replace(/\s/g, " ")).toContain("5 000 entreprises dépassent le plafond");
    expect(duree).toBeLessThan(250);
  });

  it("sert 5 000 entreprises sans dégradation par le chemin indexé", async () => {
    const lignes = parc(5_000);
    const source: SourceAnnuaire = {
      annuaireIndexe: async (requete) => ({
        lignes: lignes.slice((requete.page - 1) * requete.taille, requete.page * requete.taille),
        total: lignes.length,
        resume: null,
      }),
      toutesLesEntreprises: async () => {
        throw new Error("le chemin indexé ne doit jamais lire la table entière");
      },
    };
    const debut = performance.now();
    const resultat = await composerAnnuaire(source, analyserRequeteAnnuaire({ page: "150" }), MAINTENANT);
    const duree = performance.now() - debut;
    expect(resultat.total).toBe(5_000);
    expect(resultat.lignes).toHaveLength(25);
    expect(duree).toBeLessThan(100);
  });
});
