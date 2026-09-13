/**
 * Banc de recette de l'éditeur v2 : le VRAI composant `EditeurDevisV2`, hors de Next et sans base.
 * `?couts=1` simule un utilisateur autorisé à voir et gérer les coûts.
 */
import { createRoot } from "react-dom/client";
import { EditeurDevisV2 } from "@/components/devis/EditeurDevisV2";
import { elementsFictifs } from "@/lib/devis/fixtures/document-fictif";

const parametres = new URLSearchParams(window.location.search);
// Presse-papier système simulé (le banc est servi en file:// : l'API réelle y est indisponible ou refusée).
// Même contrat que navigator.clipboard, mémoire par page : le partage entre onglets passe par le repli
// localStorage de l'éditeur, exactement comme dans un navigateur qui refuse la lecture du presse-papier.
{
  let contenu = "";
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { contenu = t; }, readText: async () => contenu } });
}
const couts = parametres.get("couts") === "1";
// Banc de performance (GP V1, lot H) : `?lignes=500` ouvre l'éditeur avec autant de lignes fictives.
const nbLignes = Math.max(0, Math.min(2000, Number(parametres.get("lignes") ?? 0) || 0));
window.__banc = {
  droits: { voirCouts: couts, gererCouts: couts, modifierPrix: true, modifierUnite: true, modifierRemise: true },
  enregistrements: [],
  recherches: [],
  refus: null,
  tentatives: 0,
};
window.__navigations = [];

createRoot(document.getElementById("racine")!).render(
  <main className="p-4 lg:p-6">
    <EditeurDevisV2
      devisId={null}
      entrepriseId="e-banc"
      clients={[
        { id: "c1", label: "Client Fictif SARL", adresse: "2 avenue du Test", codePostal: "00000", ville: "Testville", siret: null },
        { id: "c2", label: "Autre Client Fictif", adresse: null, codePostal: null, ville: null, siret: null },
      ]}
      chantiers={[{ id: "ch1", label: "Chantier fictif", clientId: "c1" }]}
      enteteInitiale={{
        client_id: "c1", chantier_id: null, date_emission: "2026-09-11", date_validite: "2026-10-11", conditions: null,
        notes_client: null, notes_internes: null, remise_globale: 0, filigrane: null,
      }}
      etatInitial={{ elements: nbLignes > 0 ? elementsFictifs({ lignesLibres: nbLignes, ouvrage: false }) : [], origines: {} }}
      emetteur={{
        nom: "Entreprise Fictive BTP", raisonSociale: "Entreprise Fictive BTP SARL", siret: "000 000 000 00000",
        adresse: "1 rue de l’Exemple", codePostal: "00000", ville: "Villefictive", logoUrl: null,
        assuranceDecennaleNumero: "DEC-FICTIVE-0001", assuranceDecennaleAssureur: "Assureur fictif",
        assuranceRcProNumero: null, tauxPenalitesRetard: null, texteEntete: null, textePiedPage: null,
      }}
      style={{}}
      filigranesEntreprise={{ defaut: null, brouillon: { type: "texte", preset: "BROUILLON" } }}
      logoDisponible={false}
      droits={window.__banc.droits}
      seuilTauxMarquePct={30}
      nomProduit="ELSATIA"
    />
  </main>,
);
