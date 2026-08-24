import { describe, expect, it } from "vitest";
import { resoudrePropositionDevis } from "./assistant";

const ENTREPRISE_ID = "ent-a";

function supabaseAvecClient(client: Record<string, unknown> | null) {
  return {
    from(table: string) {
      const requete: Record<string, unknown> = {};
      for (const methode of ["select", "eq"]) requete[methode] = () => requete;
      requete.maybeSingle = async () => (table === "clients" ? { data: client } : { data: null });
      return requete;
    },
  } as unknown as Parameters<typeof resoudrePropositionDevis>[0];
}

const CLIENT = { nom: "Dupont", prenom: "Jean", societe: null };

const inputBase = {
  client_id: "client-1",
  objet: "Cloisons bureaux",
  lignes: [
    { designation: "Cloison 72/48", type: "fourniture", quantite: 120, unite: "m²", prix_unitaire_ht: 45, source_prix: "catalogue", taux_tva: 20 },
  ],
  hypotheses: [],
};

describe("resoudrePropositionDevis", () => {
  it("1. demande simple -> proposition valide", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, inputBase);
    expect(res).not.toBeNull();
    expect(res!.clientId).toBe("client-1");
    expect(res!.objet).toBe("Cloisons bureaux");
    expect(res!.lignes).toHaveLength(1);
  });

  it("2. multi-lignes -> plusieurs lignes distinctes conservees, jamais fusionnees", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [
        { designation: "Cloison 72/48", type: "fourniture", quantite: 120, unite: "m²", prix_unitaire_ht: 45, source_prix: "catalogue", taux_tva: 20 },
        { designation: "Porte", type: "fourniture", quantite: 3, unite: "u", prix_unitaire_ht: 250, source_prix: "catalogue", taux_tva: 20 },
        { designation: "Faux plafond", type: "fourniture", quantite: 80, unite: "m²", prix_unitaire_ht: null, source_prix: "absent", taux_tva: 20 },
      ],
    });
    expect(res!.lignes).toHaveLength(3);
    expect(res!.lignes.map((l) => l.designation)).toEqual(["Cloison 72/48", "Porte", "Faux plafond"]);
  });

  it("3. client trouve -> nom compose correctement (societe prioritaire)", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient({ nom: "Dupont", prenom: "Jean", societe: "ACME BTP" }), ENTREPRISE_ID, true, inputBase);
    expect(res!.clientNom).toBe("ACME BTP");
  });

  it("3b. client trouve sans societe -> prenom nom", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, inputBase);
    expect(res!.clientNom).toBe("Jean Dupont");
  });

  it("4. aucun client_id fourni -> null (clarification)", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, { ...inputBase, client_id: undefined });
    expect(res).toBeNull();
  });

  it("5. client_id d'une autre entreprise (introuvable pour ce tenant) -> null", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(null), ENTREPRISE_ID, true, inputBase);
    expect(res).toBeNull();
  });

  it("6. prix fiable (catalogue) -> conserve tel quel avec sa source", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, inputBase);
    expect(res!.lignes[0].prixUnitaireHt).toBe(45);
    expect(res!.lignes[0].sourcePrix).toBe("catalogue");
  });

  it("7. prix historique -> conserve avec sa source, jamais requalifie en catalogue", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [{ designation: "Cloison", type: "fourniture", quantite: 10, unite: "m²", prix_unitaire_ht: 38, source_prix: "historique", taux_tva: 20 }],
    });
    expect(res!.lignes[0].prixUnitaireHt).toBe(38);
    expect(res!.lignes[0].sourcePrix).toBe("historique");
  });

  it("8. prix absent -> reste null, jamais transforme en 0 silencieusement", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [{ designation: "Cloison", type: "fourniture", quantite: 10, unite: "m²", prix_unitaire_ht: null, source_prix: "absent", taux_tva: 20 }],
    });
    expect(res!.lignes[0].prixUnitaireHt).toBeNull();
    expect(res!.lignes[0].sourcePrix).toBe("absent");
  });

  it("8b. le modele annonce une source catalogue/historique mais sans prix -> requalifiee en absent (jamais une fausse source pour un champ vide)", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [{ designation: "Cloison", type: "fourniture", quantite: 10, unite: "m²", prix_unitaire_ht: null, source_prix: "catalogue", taux_tva: 20 }],
    });
    expect(res!.lignes[0].sourcePrix).toBe("absent");
  });

  it("9. unite non reconnue -> repliee sur 'u' plutot que rejetee", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [{ designation: "Cloison", type: "fourniture", quantite: 10, unite: "planches", prix_unitaire_ht: 10, source_prix: "catalogue", taux_tva: 20 }],
    });
    expect(res!.lignes[0].unite).toBe("u");
  });

  it("10. quantite invalide (0 ou negative) -> ligne rejetee", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [
        { designation: "Zero", type: "fourniture", quantite: 0, unite: "u", prix_unitaire_ht: 10, source_prix: "catalogue", taux_tva: 20 },
        { designation: "Negative", type: "fourniture", quantite: -5, unite: "u", prix_unitaire_ht: 10, source_prix: "catalogue", taux_tva: 20 },
        { designation: "Valide", type: "fourniture", quantite: 1, unite: "u", prix_unitaire_ht: 10, source_prix: "catalogue", taux_tva: 20 },
      ],
    });
    expect(res!.lignes).toHaveLength(1);
    expect(res!.lignes[0].designation).toBe("Valide");
  });

  it("10b. toutes les lignes invalides -> proposition entiere rejetee (null)", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [{ designation: "Zero", type: "fourniture", quantite: 0, unite: "u", prix_unitaire_ht: 10, source_prix: "catalogue", taux_tva: 20 }],
    });
    expect(res).toBeNull();
  });

  it("11. remise ligne hors bornes -> clampee entre 0 et 100", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [{ ...inputBase.lignes[0], remise_ligne: 250 }],
    });
    expect(res!.lignes[0].remiseLigne).toBe(100);
  });

  it("12. TVA hors liste autorisee -> repliee sur 20", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [{ ...inputBase.lignes[0], taux_tva: 33 }],
    });
    expect(res!.lignes[0].tauxTva).toBe(20);
  });

  it("13. hypotheses signalees -> conservees, vides filtrees", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      hypotheses: ["Finition bandes incluse", "", "   "],
    });
    expect(res!.hypotheses).toEqual(["Finition bandes incluse"]);
  });

  it("14. objet vide -> null (clarification necessaire)", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, { ...inputBase, objet: "  " });
    expect(res).toBeNull();
  });

  it("15. aucune ligne fournie -> null", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, { ...inputBase, lignes: [] });
    expect(res).toBeNull();
  });

  it("16. permission gerer_devis absente -> null avant toute lecture", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, false, inputBase);
    expect(res).toBeNull();
  });

  it("17. plus de 40 lignes -> tronque a 40", async () => {
    const lignes = Array.from({ length: 50 }, (_, i) => ({ designation: `Ligne ${i}`, type: "fourniture", quantite: 1, unite: "u", prix_unitaire_ht: 1, source_prix: "catalogue", taux_tva: 20 }));
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, { ...inputBase, lignes });
    expect(res!.lignes).toHaveLength(40);
  });

  it("18. prix negatif fourni par le modele -> jamais conserve, traite comme absent", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [{ ...inputBase.lignes[0], prix_unitaire_ht: -10 }],
    });
    expect(res!.lignes[0].prixUnitaireHt).toBeNull();
    expect(res!.lignes[0].sourcePrix).toBe("absent");
  });

  it("19. type de ligne non reconnu -> replie sur 'forfait'", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, {
      ...inputBase,
      lignes: [{ ...inputBase.lignes[0], type: "type_invente" }],
    });
    expect(res!.lignes[0].type).toBe("forfait");
  });

  it("20. commentaire du modele -> transmis comme avertissement", async () => {
    const res = await resoudrePropositionDevis(supabaseAvecClient(CLIENT), ENTREPRISE_ID, true, { ...inputBase, commentaire: "Vérifie la surface exacte du plafond." });
    expect(res!.avertissement).toBe("Vérifie la surface exacte du plafond.");
  });
});
