/**
 * Documents FICTIFS de recette pour le moteur de présentation v2 (aperçu, pagination, PDF).
 * Entreprise, client et montants sont inventés.
 */
import { resoudreFiligrane, type Filigrane } from "@/lib/devis/filigrane";
import type { SourceDocument } from "@/lib/devis/document-modele";
import { instancierOuvrage, type ModePresentation } from "@/lib/devis/ouvrages";
import type { ElementDevis } from "@/lib/devis/presentation";
import { plancherChauffantFictif } from "@/lib/devis/fixtures/plancher-chauffant-fictif";

export function elementsFictifs(o: { lignesLibres?: number; mode?: ModePresentation; ouvrage?: boolean } = {}): ElementDevis[] {
  const elements: ElementDevis[] = [];
  for (let i = 0; i < (o.lignesLibres ?? 2); i += 1) {
    elements.push({
      type: "ligne",
      ordre: i + 1,
      ligne: {
        cle: `l${i + 1}`,
        designation: `Prestation fictive n° ${i + 1}`,
        description: i % 3 === 0 ? "Description fictive destinée au client, sur une ou deux lignes selon la largeur." : null,
        type: "forfait",
        quantite: 1 + (i % 4),
        unite: "u",
        prixUnitaireHt: 100 + i,
        remiseLignePct: 0,
        tauxTva: i % 5 === 0 ? 10 : 20,
      },
    });
  }
  if (o.ouvrage !== false) {
    const issue = instancierOuvrage(plancherChauffantFictif(), {
      cle: "ouv1",
      ordre: 1000,
      quantitePrincipale: 120,
      saisies: { bande: 44 },
      mode: o.mode ?? "eclate",
    });
    if (issue.etat !== "pret") throw new Error(issue.motif);
    elements.push({ type: "ouvrage", ordre: 1000, instance: issue.instance });
  }
  return elements;
}

export function sourceFictive(p: Partial<SourceDocument> & { lignesLibres?: number; mode?: ModePresentation; filigrane?: SourceDocument["filigrane"]; filigraneDocument?: Partial<Filigrane> } = {}): SourceDocument {
  const typeDocument = p.typeDocument ?? "devis";
  const statut = p.statut ?? "brouillon";
  return {
    typeDocument,
    titre: typeDocument === "devis" ? "Devis" : "Facture",
    statut,
    numero: p.numero ?? null,
    dateEmission: p.dateEmission ?? "2026-09-11",
    dateSecondaire: p.dateSecondaire ?? (typeDocument === "devis" ? { libelle: "Valable jusqu’au", valeur: "2026-10-11" } : null),
    emetteur: p.emetteur ?? {
      nom: "Entreprise Fictive BTP",
      raisonSociale: "Entreprise Fictive BTP SARL",
      siret: "000 000 000 00000",
      adresse: "1 rue de l’Exemple",
      codePostal: "00000",
      ville: "Villefictive",
      logoUrl: null,
      assuranceDecennaleNumero: "DEC-FICTIVE-0001",
      assuranceDecennaleAssureur: "Assureur fictif",
      assuranceRcProNumero: "RC-FICTIVE-0001",
      tauxPenalitesRetard: null,
      texteEntete: null,
      textePiedPage: "Mentions de pied de page fictives.",
    },
    style: p.style ?? null,
    destinataire: p.destinataire ?? { nomAffiche: "Client Fictif", adresse: "2 avenue du Test", codePostal: "00000", ville: "Testville", siret: null },
    elements: p.elements ?? elementsFictifs({ lignesLibres: p.lignesLibres, mode: p.mode }),
    remiseGlobalePct: p.remiseGlobalePct ?? 0,
    totauxEnregistres: p.totauxEnregistres ?? null,
    conditions: p.conditions ?? "Acompte de 30 % à la commande (condition fictive).",
    notesClient: p.notesClient ?? null,
    filigrane: p.filigrane ?? resoudreFiligrane({ typeDocument, statut, document: p.filigraneDocument }),
    duplicata: p.duplicata ?? null,
    nomProduit: p.nomProduit ?? "ELSATIA",
    references: p.references ?? null,
    cgv: p.cgv ?? null,
  };
}
