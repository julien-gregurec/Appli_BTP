/**
 * Banc de recette de l'éditeur v2 : le VRAI composant `EditeurDevisV2`, hors de Next et sans base.
 * `?couts=1` simule un utilisateur autorisé à voir et gérer les coûts.
 */
import { createRoot } from "react-dom/client";
import { EditeurDevisV2 } from "@/components/devis/EditeurDevisV2";

const parametres = new URLSearchParams(window.location.search);
const couts = parametres.get("couts") === "1";
window.__banc = {
  droits: { voirCouts: couts, gererCouts: couts, modifierPrix: true, modifierUnite: true, modifierRemise: true },
  enregistrements: [],
  recherches: [],
};
window.__navigations = [];

createRoot(document.getElementById("racine")!).render(
  <main className="p-4 lg:p-6">
    <EditeurDevisV2
      devisId={null}
      clients={[
        { id: "c1", label: "Client Fictif SARL", adresse: "2 avenue du Test", codePostal: "00000", ville: "Testville", siret: null },
        { id: "c2", label: "Autre Client Fictif", adresse: null, codePostal: null, ville: null, siret: null },
      ]}
      chantiers={[{ id: "ch1", label: "Chantier fictif", clientId: "c1" }]}
      enteteInitiale={{
        client_id: "c1", chantier_id: null, date_emission: "2026-09-11", date_validite: "2026-10-11", conditions: null,
        notes_client: null, notes_internes: null, remise_globale: 0, filigrane: null,
      }}
      etatInitial={{ elements: [], origines: {} }}
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
