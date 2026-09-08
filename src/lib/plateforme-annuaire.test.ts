import { describe, expect, it } from "vitest";
import {
  COLONNES_PAR_DEFAUT,
  FILTRES_VIDES,
  ONGLETS_ANNUAIRE,
  TAILLE_PAGE_PAR_DEFAUT,
  analyserRequeteAnnuaire,
  appliquerRemiseAffichage,
  comparerLignes,
  composerCout,
  finPrevueRemise,
  joursDeRetard,
  lienAnnuaire,
  ligneAppartientALOnglet,
  ligneCorrespondALaRecherche,
  ligneCorrespondAuxFiltres,
  normaliserColonnes,
  normaliserRecherche,
  normaliserSiret,
  resumeAnnuaire,
  serialiserRequeteAnnuaire,
  situationPaiement,
  trancheDeRetard,
  type ChampsRecherchables,
  type LigneAnnuaire,
} from "@/lib/plateforme-annuaire";

const MAINTENANT = new Date("2026-09-08T12:00:00Z");

function ligne(surcharge: Partial<LigneAnnuaire> = {}): LigneAnnuaire {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    nom: "Bâtiment Dupré",
    raison_sociale: "SARL Bâtiment Dupré",
    siret: "12345678900012",
    ville: "Nîmes",
    code_postal: "30000",
    reference_interne: "CLI-0001",
    code_adhesion: "ABCD1234",
    proprietaire_nom: "Amélie Dupré",
    proprietaire_email: "amelie@batiment-dupre.fr",
    telephone: "0466112233",
    created_at: "2026-01-15T09:00:00Z",
    abonnement_statut: "actif",
    abonnement_offre: "pro",
    abonnement_periodicite: "mensuel",
    abonnement_echeance: "2026-10-01",
    abonnement_essai_fin: null,
    abonnement_annulation_prevue_at: null,
    prix_contractuel_ht: 199,
    remise_type: null,
    remise_valeur: null,
    remise_description: null,
    remise_duree_mois: null,
    remise_appliquee_at: null,
    suspension_prevue_at: null,
    derniere_facture_statut: "paid",
    derniere_facture_url: null,
    montant_impaye_ht: null,
    nb_comptes_actifs: 12,
    nb_comptes_facturables: 12,
    nb_salaries: 18,
    modules_actifs: ["pointage"],
    applications_actives: ["gestion_pro"],
    option_ia_statut: null,
    derniere_activite: "2026-09-01T08:00:00Z",
    facturation_lisible: true,
    ...surcharge,
  };
}

function champs(surcharge: Partial<ChampsRecherchables> = {}): ChampsRecherchables {
  const base = ligne();
  return {
    nom: base.nom,
    raison_sociale: base.raison_sociale,
    siret: base.siret,
    email: base.proprietaire_email,
    telephone: base.telephone,
    proprietaire: base.proprietaire_nom,
    ville: base.ville,
    code_postal: base.code_postal,
    reference_interne: base.reference_interne,
    code_adhesion: base.code_adhesion,
    ...surcharge,
  };
}

describe("normalisation de recherche", () => {
  it("ignore la casse et les accents", () => {
    expect(normaliserRecherche("Éts. DUPRÉ")).toBe("ets dupre");
    expect(normaliserRecherche("Nîmes")).toBe("nimes");
  });

  it("préserve les caractères utiles à un e-mail", () => {
    expect(normaliserRecherche("Amélie@Bâtiment-Dupré.fr")).toBe("amelie@batiment-dupre.fr");
  });

  it("réduit un SIRET à ses chiffres", () => {
    expect(normaliserSiret("123 456 789 00012")).toBe("12345678900012");
    expect(normaliserSiret(null)).toBe("");
  });
});

describe("recherche sur une ligne", () => {
  it("trouve par nom commercial sans accent", () => {
    expect(ligneCorrespondALaRecherche(champs(), "batiment dupre")).toBe(true);
  });

  it("trouve par raison sociale différente du nom commercial", () => {
    expect(ligneCorrespondALaRecherche(champs({ nom: "Dupré Travaux" }), "sarl batiment")).toBe(true);
  });

  it("trouve par SIRET saisi avec des espaces", () => {
    expect(ligneCorrespondALaRecherche(champs(), "123 456 789")).toBe(true);
  });

  it("trouve par e-mail partiel", () => {
    expect(ligneCorrespondALaRecherche(champs(), "amelie@")).toBe(true);
  });

  it("trouve par ville, code postal et référence", () => {
    expect(ligneCorrespondALaRecherche(champs(), "nimes")).toBe(true);
    expect(ligneCorrespondALaRecherche(champs(), "30000")).toBe(true);
    expect(ligneCorrespondALaRecherche(champs(), "cli-0001")).toBe(true);
  });

  it("distingue deux noms proches", () => {
    expect(ligneCorrespondALaRecherche(champs({ nom: "Dupré Frères" }), "dupre freres")).toBe(true);
    expect(ligneCorrespondALaRecherche(champs({ nom: "Dupré Frères", raison_sociale: null, siret: null, email: null, telephone: null, proprietaire: null, ville: null, code_postal: null, reference_interne: null, code_adhesion: null }), "dupre pere")).toBe(false);
  });

  it("ne renvoie rien pour une recherche sans correspondance", () => {
    expect(ligneCorrespondALaRecherche(champs(), "zzzz-introuvable")).toBe(false);
  });

  it("accepte une recherche vide", () => {
    expect(ligneCorrespondALaRecherche(champs(), "")).toBe(true);
  });
});

describe("analyse de la requête d'URL", () => {
  it("applique les défauts sur une URL nue", () => {
    const requete = analyserRequeteAnnuaire({});
    expect(requete.onglet).toBe("toutes");
    expect(requete.page).toBe(1);
    expect(requete.taille).toBe(TAILLE_PAGE_PAR_DEFAUT);
    expect(requete.colonnes).toEqual([...COLONNES_PAR_DEFAUT]);
  });

  it("refuse un tri arbitraire venu de l'URL", () => {
    expect(analyserRequeteAnnuaire({ tri: "prix; drop table" }).tri).toBe("date_inscription");
  });

  it("refuse une taille de page arbitraire", () => {
    expect(analyserRequeteAnnuaire({ taille: "100000" }).taille).toBe(TAILLE_PAGE_PAR_DEFAUT);
  });

  it("refuse un onglet sans donnée source", () => {
    expect(analyserRequeteAnnuaire({ onglet: "archivees" }).onglet).toBe("toutes");
  });

  it("refuse une date d'URL malformée", () => {
    expect(analyserRequeteAnnuaire({ inscrit_du: "2026-13-45" }).filtres.inscritDu).toBe("");
    expect(analyserRequeteAnnuaire({ inscrit_du: "hier" }).filtres.inscritDu).toBe("");
    expect(analyserRequeteAnnuaire({ inscrit_du: "2026-02-01" }).filtres.inscritDu).toBe("2026-02-01");
  });

  it("borne une page négative", () => {
    expect(analyserRequeteAnnuaire({ page: "-4" }).page).toBe(1);
  });

  it("fait un aller-retour fidèle entre requête et URL", () => {
    const params = { q: "dupre", onglet: "impayes", tri: "montant", sens: "asc", taille: "50", forfait: "pro", retard: "7_30" };
    const requete = analyserRequeteAnnuaire(params);
    const rejoue = analyserRequeteAnnuaire(Object.fromEntries(serialiserRequeteAnnuaire(requete)));
    expect(rejoue).toEqual(requete);
  });

  it("n'écrit dans l'URL que ce qui s'écarte des défauts", () => {
    expect(serialiserRequeteAnnuaire(analyserRequeteAnnuaire({})).toString()).toBe("");
    expect(lienAnnuaire(analyserRequeteAnnuaire({}))).toBe("/plateforme/entreprises");
  });
});

describe("colonnes", () => {
  it("réintroduit la colonne du nom si elle est absente", () => {
    expect(normaliserColonnes(["statut", "forfait"])[0]).toBe("nom");
  });

  it("ignore une colonne inconnue", () => {
    expect(normaliserColonnes(["statut", "colonne_pirate"])).not.toContain("colonne_pirate");
  });
});

describe("situation de paiement", () => {
  it("ne conclut jamais « à jour » quand la facturation est illisible", () => {
    const situation = situationPaiement(ligne({ facturation_lisible: false }), MAINTENANT);
    expect(situation.cle).toBe("inconnu");
  });

  it("place l'impayé signalé au-dessus de tout état Stripe", () => {
    const situation = situationPaiement(
      ligne({ derniere_facture_statut: "paid", suspension_prevue_at: "2026-09-20T00:00:00Z" }),
      MAINTENANT,
    );
    expect(situation.cle).toBe("impaye");
  });

  it("distingue attente et retard selon l'échéance", () => {
    expect(situationPaiement(ligne({ derniere_facture_statut: "open", abonnement_echeance: "2026-10-01" }), MAINTENANT).cle).toBe("en_attente");
    expect(situationPaiement(ligne({ derniere_facture_statut: "open", abonnement_echeance: "2026-08-01" }), MAINTENANT).cle).toBe("retard");
  });

  it("ne présente pas un essai comme un paiement inconnu", () => {
    expect(situationPaiement(ligne({ abonnement_statut: "essai", derniere_facture_statut: null }), MAINTENANT).cle).toBe("sans_objet");
  });

  it("porte un libellé et une icône, jamais une couleur seule", () => {
    const situation = situationPaiement(ligne({ suspension_prevue_at: "2026-09-20T00:00:00Z" }), MAINTENANT);
    expect(situation.libelle).toBe("Impayé");
    expect(situation.icone.length).toBeGreaterThan(0);
  });
});

describe("tranches de retard", () => {
  it("calcule les jours écoulés depuis l'échéance", () => {
    expect(joursDeRetard("2026-09-01", MAINTENANT)).toBe(7);
    expect(joursDeRetard(null, MAINTENANT)).toBeNull();
  });

  it("range chaque durée dans sa tranche", () => {
    expect(trancheDeRetard(3)).toBe("moins_7");
    expect(trancheDeRetard(7)).toBe("7_30");
    expect(trancheDeRetard(45)).toBe("31_60");
    expect(trancheDeRetard(120)).toBe("plus_60");
    expect(trancheDeRetard(-2)).toBeNull();
  });
});

describe("onglets", () => {
  it("expose l'onglet archivées comme sans donnée source", () => {
    const archivees = ONGLETS_ANNUAIRE.find((o) => o.cle === "archivees");
    expect(archivees?.couverture).toBe("absente");
    expect(archivees?.reserve).toContain("archivee_at");
  });

  it("n'inscrit pas une entreprise impayée parmi les actives", () => {
    const impayee = ligne({ abonnement_statut: "actif", suspension_prevue_at: "2026-09-20T00:00:00Z" });
    expect(ligneAppartientALOnglet(impayee, "actives", MAINTENANT)).toBe(false);
    expect(ligneAppartientALOnglet(impayee, "impayes", MAINTENANT)).toBe(true);
  });

  it("place dans « à renouveler » une échéance sous 30 jours", () => {
    expect(ligneAppartientALOnglet(ligne({ abonnement_echeance: "2026-09-20" }), "a_renouveler", MAINTENANT)).toBe(true);
    expect(ligneAppartientALOnglet(ligne({ abonnement_echeance: "2027-01-01" }), "a_renouveler", MAINTENANT)).toBe(false);
  });

  it("compte une annulation programmée comme résiliée", () => {
    expect(ligneAppartientALOnglet(ligne({ abonnement_annulation_prevue_at: "2026-12-01T00:00:00Z" }), "resiliees", MAINTENANT)).toBe(true);
  });

  it("ne renvoie jamais de ligne dans l'onglet archivées", () => {
    expect(ligneAppartientALOnglet(ligne(), "archivees", MAINTENANT)).toBe(false);
  });
});

describe("filtres", () => {
  it("filtre par forfait, module et application", () => {
    expect(ligneCorrespondAuxFiltres(ligne(), { ...FILTRES_VIDES, forfait: "pro" }, MAINTENANT)).toBe(true);
    expect(ligneCorrespondAuxFiltres(ligne(), { ...FILTRES_VIDES, forfait: "mini" }, MAINTENANT)).toBe(false);
    expect(ligneCorrespondAuxFiltres(ligne(), { ...FILTRES_VIDES, module: "stock" }, MAINTENANT)).toBe(false);
    expect(ligneCorrespondAuxFiltres(ligne(), { ...FILTRES_VIDES, application: "gestion_pro" }, MAINTENANT)).toBe(true);
  });

  it("filtre par ville sans tenir compte des accents", () => {
    expect(ligneCorrespondAuxFiltres(ligne(), { ...FILTRES_VIDES, ville: "nimes" }, MAINTENANT)).toBe(true);
  });

  it("filtre par présence de remise", () => {
    const remisee = ligne({ remise_type: "pourcentage", remise_valeur: 50, remise_description: "-50 % 2 mois" });
    expect(ligneCorrespondAuxFiltres(remisee, { ...FILTRES_VIDES, remise: "oui" }, MAINTENANT)).toBe(true);
    expect(ligneCorrespondAuxFiltres(ligne(), { ...FILTRES_VIDES, remise: "oui" }, MAINTENANT)).toBe(false);
  });

  it("ne retient dans une tranche de retard que les lignes réellement en retard", () => {
    const enRetard = ligne({ derniere_facture_statut: "open", abonnement_echeance: "2026-08-25" });
    expect(ligneCorrespondAuxFiltres(enRetard, { ...FILTRES_VIDES, trancheRetard: "7_30" }, MAINTENANT)).toBe(true);
    expect(ligneCorrespondAuxFiltres(ligne(), { ...FILTRES_VIDES, trancheRetard: "7_30" }, MAINTENANT)).toBe(false);
  });

  it("borne les comptes actifs", () => {
    expect(ligneCorrespondAuxFiltres(ligne(), { ...FILTRES_VIDES, comptesMin: 20 }, MAINTENANT)).toBe(false);
    expect(ligneCorrespondAuxFiltres(ligne(), { ...FILTRES_VIDES, comptesMax: 20 }, MAINTENANT)).toBe(true);
  });
});

describe("coût", () => {
  it("sépare le tarif public du prix souscrit", () => {
    const cout = composerCout(ligne({ prix_contractuel_ht: 149 }));
    expect(cout.prixSouscritHT).toBe(149);
    expect(cout.tarifPublicHT).not.toBeNull();
    expect(cout.tarifPublicHT).not.toBe(149);
  });

  it("renvoie « non disponible » sans prix contractuel", () => {
    const cout = composerCout(ligne({ prix_contractuel_ht: null }));
    expect(cout.prixSouscritHT).toBeNull();
    expect(cout.totalRecurrentHT).toBeNull();
    expect(cout.revenuMensuelEquivalentHT).toBeNull();
    expect(cout.indisponible.join(" ")).toContain("prix contractuel");
  });

  it("applique une remise en pourcentage au prix souscrit", () => {
    const cout = composerCout(ligne({ prix_contractuel_ht: 200, remise_type: "pourcentage", remise_valeur: 50 }));
    expect(cout.totalRecurrentHT).toBe(100);
  });

  it("applique une remise en montant sans jamais passer sous zéro", () => {
    expect(appliquerRemiseAffichage(80, { type: "montant", valeur: 120, description: null, dureeMois: null, debut: null, finPrevue: null, permanente: true })).toBe(0);
  });

  it("n'applique pas une remise dont le type est inexploitable", () => {
    const cout = composerCout(ligne({ prix_contractuel_ht: 200, remise_description: "geste commercial historique" }));
    expect(cout.totalRecurrentHT).toBe(200);
    expect(cout.remise?.type).toBe("inconnue");
    expect(cout.indisponible.join(" ")).toContain("remise sans type");
  });

  it("ramène un abonnement annuel à son équivalent mensuel", () => {
    const cout = composerCout(ligne({ abonnement_periodicite: "annuel", prix_contractuel_ht: 1200 }));
    expect(cout.revenuMensuelEquivalentHT).toBe(100);
  });

  it("déduit la fin d'une remise à durée limitée", () => {
    const fin = finPrevueRemise(ligne({ remise_appliquee_at: "2026-01-15T00:00:00Z", remise_duree_mois: 2 }));
    expect(fin?.slice(0, 7)).toBe("2026-03");
  });

  it("ne déduit aucune fin pour une remise permanente", () => {
    expect(finPrevueRemise(ligne({ remise_appliquee_at: "2026-01-15T00:00:00Z", remise_duree_mois: null }))).toBeNull();
  });
});

describe("résumé", () => {
  it("n'établit aucun revenu quand aucun prix contractuel n'est connu", () => {
    const resume = resumeAnnuaire([ligne({ prix_contractuel_ht: null })], MAINTENANT);
    const mrr = resume.find((i) => i.cle === "mrr");
    expect(mrr?.valeur).toBeNull();
    expect(mrr?.note).toContain("aucun prix contractuel");
  });

  it("additionne les prix souscrits, pas les tarifs publics", () => {
    const resume = resumeAnnuaire(
      [ligne({ prix_contractuel_ht: 100 }), ligne({ id: "2", prix_contractuel_ht: 50 })],
      MAINTENANT,
    );
    expect(resume.find((i) => i.cle === "mrr")?.valeur).toBe(150);
  });

  it("signale les entreprises exclues du calcul du revenu", () => {
    const resume = resumeAnnuaire(
      [ligne({ prix_contractuel_ht: 100 }), ligne({ id: "2", prix_contractuel_ht: null })],
      MAINTENANT,
    );
    expect(resume.find((i) => i.cle === "mrr")?.note).toContain("1 sans prix contractuel");
  });

  it("laisse le montant d'impayé non disponible tant qu'il n'est pas agrégé", () => {
    const resume = resumeAnnuaire([ligne()], MAINTENANT);
    expect(resume.find((i) => i.cle === "impayes")?.note).toContain("non disponible");
  });
});

describe("tri", () => {
  it("range les valeurs absentes en fin de liste dans les deux sens", () => {
    const avec = ligne({ id: "a", abonnement_echeance: "2026-10-01" });
    const sans = ligne({ id: "b", abonnement_echeance: null });
    expect([sans, avec].sort(comparerLignes("prochaine_echeance", "asc"))[0].id).toBe("a");
    expect([sans, avec].sort(comparerLignes("prochaine_echeance", "desc"))[0].id).toBe("a");
  });

  it("trie par nom sans tenir compte des accents", () => {
    const lignes = [ligne({ id: "z", nom: "Zèbre" }), ligne({ id: "a", nom: "Éts Alpha" })];
    expect(lignes.sort(comparerLignes("nom", "asc"))[0].id).toBe("a");
  });

  it("trie par revenu mensuel équivalent", () => {
    const lignes = [
      ligne({ id: "petit", prix_contractuel_ht: 50 }),
      ligne({ id: "gros", prix_contractuel_ht: 500 }),
    ];
    expect(lignes.sort(comparerLignes("montant", "desc"))[0].id).toBe("gros");
  });
});
