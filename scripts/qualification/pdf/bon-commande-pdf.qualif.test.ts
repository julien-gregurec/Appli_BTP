// Qualification PDF du bon de commande (RD-2, migration 20260927000508).
//
// Entrée : BON_COMMANDE_PDF_JSON = fichier écrit par scripts/qualification/rgpd-residual-debt-v1.sh,
// lignes RÉELLES lues en base (commande, lignes, fiche fournisseur, fiche entreprise), deux
// fois : avant et après modification des fiches fournisseur et entreprise.
// Rendu : mêmes composant et mapping que /imprimer/commandes/[id] (identiteBonCommande →
// DocumentImprimable), imprimé en PDF A4 par Chromium comme src/lib/pdf/generer.ts, texte
// extrait du PDF (unpdf).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser } from "playwright-core";
import { extractText, getDocumentProxy } from "unpdf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DocumentImprimable, type EntrepriseEntete } from "@/components/DocumentImprimable";
import { identiteBonCommande } from "@/lib/commande-document";

type Ligne = { designation: string; description: string | null; quantite: number; unite: string; prix_unitaire_ht: number; taux_tva: number };
type Commande = Record<string, unknown> & { id: string; numero: string; statut: string; date_commande: string; date_livraison_prevue: string | null; montant_ht: number; montant_tva: number; montant_ttc: number };
type Etat = { commandes: Array<{ commande: Commande; lignes: Ligne[]; fournisseur: Record<string, string | null> | null }>; entreprise: EntrepriseEntete };
type Entree = { avant: Etat; apres: Etat; ancien: { fournisseur: string; siret_entreprise: string }; nouveau: { fournisseur: string; siret_entreprise: string }; sortie: string };

const entree: Entree = JSON.parse(readFileSync(process.env.BON_COMMANDE_PDF_JSON ?? "", "utf8"));
let navigateur: Browser;

beforeAll(async () => {
  navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
});
afterAll(async () => { await navigateur?.close(); });

async function pdfTexte(etat: Etat, numero: string): Promise<{ texte: string; html: string }> {
  const c = etat.commandes.find((x) => x.commande.numero === numero);
  if (!c) throw new Error(`commande ${numero} absente`);
  const identite = identiteBonCommande({ commande: c.commande, ficheFournisseur: c.fournisseur, ficheEntreprise: etat.entreprise, nomEntrepriseParDefaut: "" });
  const html = renderToStaticMarkup(createElement(DocumentImprimable, {
    typeDoc: "Bon de commande", numero: c.commande.numero, dateEmission: c.commande.date_commande,
    dateSecondaire: c.commande.date_livraison_prevue ? { label: "Livraison souhaitée le", valeur: c.commande.date_livraison_prevue } : null,
    entreprise: identite.emetteur, client: identite.destinataire,
    lignes: c.lignes.map((l) => ({ ...l, remise_ligne: 0 })),
    montantHt: c.commande.montant_ht, montantTva: c.commande.montant_tva, montantTtc: c.commande.montant_ttc,
    estFacture: false, signatures: [],
  }));
  const page = await navigateur.newPage();
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
  const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" } });
  await page.close();
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: true });
  return { texte: text.replace(/\s+/g, " ").trim(), html };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const resultats: Array<Record<string, unknown>> = [];
afterAll(() => { writeFileSync(entree.sortie, JSON.stringify(resultats, null, 2)); });

describe("PDF du bon de commande — données réelles, avant/après modification des fiches", () => {
  const engagees = entree.avant.commandes.filter((c) => c.commande.statut !== "brouillon").map((c) => c.commande.numero);
  const brouillons = entree.avant.commandes.filter((c) => c.commande.statut === "brouillon").map((c) => c.commande.numero);

  it("le jeu contient des commandes envoyées/reçues et au moins un brouillon", () => {
    expect(engagees.length).toBeGreaterThan(0);
    expect(brouillons.length).toBeGreaterThan(0);
  });

  it.each(engagees)("commande %s : PDF historique identique, ancienne identité imprimée", async (numero) => {
    const avant = await pdfTexte(entree.avant, numero);
    const apres = await pdfTexte(entree.apres, numero);
    resultats.push({ numero, statut: "engagee", sha_texte_avant: sha(avant.texte), sha_texte_apres: sha(apres.texte), identique: avant.texte === apres.texte });
    expect(apres.texte).toBe(avant.texte);
    expect(apres.html).toBe(avant.html);
    expect(apres.texte).toContain(entree.ancien.fournisseur);
    expect(apres.texte).not.toContain(entree.nouveau.fournisseur);
    expect(apres.texte).toContain(entree.ancien.siret_entreprise);
    expect(apres.texte).not.toContain(entree.nouveau.siret_entreprise);
  });

  it.each(brouillons)("brouillon %s : le PDF suit les fiches à jour", async (numero) => {
    const avant = await pdfTexte(entree.avant, numero);
    const apres = await pdfTexte(entree.apres, numero);
    resultats.push({ numero, statut: "brouillon", sha_texte_avant: sha(avant.texte), sha_texte_apres: sha(apres.texte), identique: avant.texte === apres.texte });
    expect(apres.texte).toContain(entree.nouveau.fournisseur);
    expect(avant.texte).toContain(entree.ancien.fournisseur);
  });
});
