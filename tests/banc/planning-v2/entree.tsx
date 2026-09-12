// Entrée du banc du planning v2 — données FICTIVES (semaine du 14 septembre 2026), aucune base.
import { createRoot } from "react-dom/client";
import { PlanningV2 } from "@/components/planning/PlanningV2";
import { instant, type Evenement, type Vue } from "@/lib/planning/modele";
import type { DonneesPlanningV2 } from "@/lib/planning/serveur";

window.__bancPlanning = { enregistrements: [], suppressions: [] };
window.__navigations = [];
const p = new URLSearchParams(window.location.search);
const vue = (p.get("vue") ?? "semaine") as Vue;
const jour = p.get("jour") ?? "2026-09-14";
const gerer = p.get("lecture") !== "1";

const ev = (id: string, titre: string, j: string, h1: number, h2: number, aff: Evenement["affectations"], extra: Partial<Evenement> = {}): Evenement => ({
  id, titre, type: "chantier", statut: "planifie", debut: instant(j, h1 * 60), fin: instant(j, h2 * 60), journeeEntiere: false, couleur: null,
  chantierId: "ch1", clientId: "cl1", adresse: "12 rue des Lilas, Ville fictive", notes: null, affectations: aff, ...extra,
});
const evenements: Evenement[] = [
  ev("e1", "Pose cuisine Dupont (fictif)", "2026-09-14", 8, 12, [{ employeId: "s1" }, { employeId: "s2" }, { ressourceId: "r1" }]),
  ev("e2", "Carrelage SDB Martin (fictif)", "2026-09-14", 13, 17, [{ employeId: "s1" }], { chantierId: "ch2", type: "chantier" }),
  ev("e3", "Livraison plaques", "2026-09-15", 7, 8, [{ employeId: "s3" }, { ressourceId: "r2" }], { type: "livraison", chantierId: "ch1" }),
  ev("e4", "Dépannage fuite (fictif)", "2026-09-15", 10, 11, [{ employeId: "s1" }], { type: "intervention", chantierId: null, adresse: "3 allée des Pins" }),
  ev("e5", "Équipe A — cloisons R+1", "2026-09-16", 8, 17, [{ equipeId: "q1" }, { ressourceId: "r1" }], { chantierId: "ch2" }),
  ev("e6", "Contrôle levage nacelle", "2026-09-16", 9, 11, [{ ressourceId: "r1" }, { employeId: "s3" }], { type: "autre", chantierId: null }),
  ev("e7", "Congé", "2026-09-17", 0, 0, [{ employeId: "s2" }], { type: "conge", journeeEntiere: true, debut: instant("2026-09-17", 0), fin: instant("2026-09-18", 0), chantierId: null, adresse: null }),
  ev("e8", "Réunion chantier Lefebvre", "2026-09-17", 14, 15, [{ employeId: "s2" }, { employeId: "s4" }], { type: "autre", chantierId: "ch3" }),
  ev("e9", "Formation habilitation élec.", "2026-09-18", 8, 17, [{ employeId: "s3" }, { employeId: "s4" }], { type: "formation", chantierId: null, adresse: "Centre de formation" }),
  ev("e10", "Rendez-vous client Nguyen", "2026-09-18", 10, 11, [{ employeId: "s4" }], { type: "rendez_vous", chantierId: null, clientId: "cl2", statut: "confirme" }),
  ev("e11", "Pose parquet Lefebvre", "2026-09-19", 8, 16, [{ equipeId: "q1" }], { chantierId: "ch3", statut: "confirme" }),
];
const donnees: DonneesPlanningV2 = {
  evenements, conflits: [],
  salaries: [{ id: "s1", nom: "Ali Poseur", actif: true }, { id: "s2", nom: "Bea Chef d’équipe", actif: true }, { id: "s3", nom: "Chris Livreur", actif: true }, { id: "s4", nom: "Dan Commercial", actif: true }],
  equipes: [{ id: "q1", nom: "Équipe A", couleur: "#0e7490", membres: ["s1", "s2"] }],
  ressources: [{ id: "r1", type: "nacelle", nom: "Nacelle 12 m", couleur: null, actif: true }, { id: "r2", type: "vehicule", nom: "Camion benne", couleur: null, actif: true }, { id: "r3", type: "machine", nom: "Mini-pelle", couleur: null, actif: true }],
  chantiers: [{ id: "ch1", nom: "Maison Dupont", clientId: "cl1", adresse: "12 rue des Lilas" }, { id: "ch2", nom: "Appartement Martin", clientId: "cl2", adresse: "8 av. du Port" }, { id: "ch3", nom: "Villa Lefebvre", clientId: "cl1", adresse: "1 chemin Vert" }],
  clients: [{ id: "cl1", nom: "Dupont Jean" }, { id: "cl2", nom: "Nguyen Marie" }],
  disponibilites: [{ employeId: "s3", jourSemaine: 0, debut: "08:00", fin: "17:00" }, { employeId: "s3", jourSemaine: 1, debut: "08:00", fin: "17:00" }],
  droits: { gerer, affecter: gerer }, permissions: gerer ? null : ["acces_planning"],
};
createRoot(document.getElementById("racine")!).render(<div className="p-4"><PlanningV2 donnees={donnees} jour={jour} vue={vue} /></div>);
