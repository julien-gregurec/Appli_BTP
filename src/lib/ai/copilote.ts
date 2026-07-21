import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutilIA } from "@/lib/ai/provider";
import { calculerRentabiliteChantiers } from "@/lib/rentabilite";

type Supabase = SupabaseClient;

async function rechercher(supabase: Supabase, entrepriseId: string, input: { terme: string }) {
  const terme = `%${input.terme.trim()}%`;
  const [clients, chantiers, devis, factures] = await Promise.all([
    supabase.from("clients").select("id, nom, prenom, societe").eq("entreprise_id", entrepriseId).or(`nom.ilike.${terme},prenom.ilike.${terme},societe.ilike.${terme}`).limit(5),
    supabase.from("chantiers").select("id, nom, ville, statut").eq("entreprise_id", entrepriseId).ilike("nom", terme).limit(5),
    supabase.from("devis").select("id, numero, statut, montant_ttc, client_id, clients(nom, societe)").eq("entreprise_id", entrepriseId).ilike("numero", terme).limit(5),
    supabase.from("factures").select("id, numero, statut, montant_ttc, client_id, clients(nom, societe)").eq("entreprise_id", entrepriseId).ilike("numero", terme).limit(5),
  ]);
  return {
    clients: clients.data ?? [],
    chantiers: chantiers.data ?? [],
    devis: devis.data ?? [],
    factures: factures.data ?? [],
  };
}

async function chantiersEnRetard(supabase: Supabase, entrepriseId: string) {
  const { data } = await supabase
    .from("chantiers")
    .select("id, nom, ville, statut, date_fin_prevue")
    .eq("entreprise_id", entrepriseId)
    .in("statut", ["a_preparer", "en_attente_validation", "en_commande_materiel", "en_cours", "en_pause"])
    .lt("date_fin_prevue", new Date().toISOString().slice(0, 10))
    .order("date_fin_prevue")
    .limit(20);
  return data ?? [];
}

async function absencesDuJour(supabase: Supabase, entrepriseId: string) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("demandes_conges")
    .select("id, type_conge, date_debut, date_fin, employes(nom, prenom)")
    .eq("entreprise_id", entrepriseId)
    .eq("statut", "approuvee")
    .lte("date_debut", aujourdhui)
    .gte("date_fin", aujourdhui);
  return data ?? [];
}

async function facturesImpayees(supabase: Supabase, entrepriseId: string) {
  const { data } = await supabase
    .from("factures")
    .select("id, numero, statut, montant_ttc, montant_paye, date_echeance, clients(nom, societe)")
    .eq("entreprise_id", entrepriseId)
    .in("statut", ["envoyee", "en_retard"])
    .order("date_echeance")
    .limit(20);
  return data ?? [];
}

async function devisEnAttente(supabase: Supabase, entrepriseId: string) {
  const seuil = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("devis")
    .select("id, numero, montant_ttc, date_emission, clients(nom, societe)")
    .eq("entreprise_id", entrepriseId)
    .eq("statut", "envoye")
    .lt("date_emission", seuil)
    .order("date_emission")
    .limit(20);
  return data ?? [];
}

async function stockFaible(supabase: Supabase, entrepriseId: string) {
  const { data } = await supabase
    .from("articles_stock")
    .select("id, reference, designation, quantite_stock, seuil_alerte, unite")
    .eq("entreprise_id", entrepriseId)
    .eq("actif", true)
    .order("designation");
  return (data ?? []).filter((a) => Number(a.quantite_stock) <= Number(a.seuil_alerte)).slice(0, 20);
}

async function vehiculesEntretien(supabase: Supabase, entrepriseId: string) {
  const dans30Jours = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("vehicules")
    .select("id, immatriculation, marque, modele, controle_technique_echeance, assurance_echeance, prochain_entretien_date")
    .eq("entreprise_id", entrepriseId)
    .eq("statut", "actif");
  return (data ?? []).filter(
    (v) =>
      (v.controle_technique_echeance && v.controle_technique_echeance <= dans30Jours) ||
      (v.assurance_echeance && v.assurance_echeance <= dans30Jours) ||
      (v.prochain_entretien_date && v.prochain_entretien_date <= dans30Jours),
  );
}

async function heuresSupplementairesSemaine(supabase: Supabase, entrepriseId: string) {
  const maintenant = new Date();
  const jour = maintenant.getDay() || 7;
  const lundi = new Date(maintenant);
  lundi.setDate(maintenant.getDate() - jour + 1);
  const { data } = await supabase
    .from("pointages")
    .select("employe_id, heures_supplementaires, employes(nom, prenom)")
    .eq("entreprise_id", entrepriseId)
    .gte("date", lundi.toISOString().slice(0, 10))
    .gt("heures_supplementaires", 0);
  const parEmploye = new Map<string, { nom: string; total: number }>();
  for (const p of data ?? []) {
    const employe = p.employes as unknown as { nom: string; prenom: string } | null;
    const nom = employe ? `${employe.prenom} ${employe.nom}` : "Employé";
    const existant = parEmploye.get(p.employe_id) ?? { nom, total: 0 };
    existant.total += Number(p.heures_supplementaires);
    parEmploye.set(p.employe_id, existant);
  }
  return [...parEmploye.values()].sort((a, b) => b.total - a.total);
}

async function rentabiliteChantiers(supabase: Supabase, entrepriseId: string) {
  const lignes = await calculerRentabiliteChantiers(supabase, entrepriseId);
  return lignes
    .filter((l) => l.factureHt > 0 || l.coutMainOeuvre > 0 || l.coutAchats > 0 || l.coutSousTraitance > 0)
    .sort((a, b) => a.marge - b.marge)
    .slice(0, 30);
}

async function chercherEmploye(supabase: Supabase, entrepriseId: string, input: { terme: string }) {
  const { data } = await supabase
    .from("employes")
    .select("id, nom, prenom, poste")
    .eq("entreprise_id", entrepriseId)
    .eq("statut", "actif")
    .or(`nom.ilike.%${input.terme}%,prenom.ilike.%${input.terme}%`)
    .limit(5);
  return data ?? [];
}

async function chercherChantierParNom(supabase: Supabase, entrepriseId: string, input: { terme: string }) {
  const { data } = await supabase
    .from("chantiers")
    .select("id, nom, ville, statut")
    .eq("entreprise_id", entrepriseId)
    .ilike("nom", `%${input.terme}%`)
    .limit(5);
  return data ?? [];
}

async function verifierDisponibiliteEmploye(supabase: Supabase, entrepriseId: string, input: { employe_id: string; date: string }) {
  const [{ data: affectations }, { data: conge }, { data: habilitations }] = await Promise.all([
    supabase.from("affectations").select("heures, tache, chantier_id, type_activite").eq("entreprise_id", entrepriseId).eq("employe_id", input.employe_id).eq("date", input.date),
    supabase.from("demandes_conges").select("type_conge").eq("entreprise_id", entrepriseId).eq("employe_id", input.employe_id).eq("statut", "approuvee").lte("date_debut", input.date).gte("date_fin", input.date).maybeSingle(),
    supabase.from("habilitations_employe").select("type, libelle, date_expiration").eq("entreprise_id", entrepriseId).eq("employe_id", input.employe_id),
  ]);
  return {
    deja_affecte_ce_jour: affectations ?? [],
    heures_deja_prevues: (affectations ?? []).reduce((s, a) => s + Number(a.heures), 0),
    en_conge_ce_jour: conge ? conge.type_conge : null,
    habilitations: habilitations ?? [],
  };
}

export const OUTILS_COPILOTE: OutilIA[] = [
  {
    nom: "rechercher",
    description: "Recherche un client, chantier, devis ou facture par nom/numéro approximatif.",
    parametres: {
      type: "object",
      properties: { terme: { type: "string", description: "Nom, société ou numéro à rechercher" } },
      required: ["terme"],
    },
  },
  {
    nom: "chantiers_en_retard",
    description: "Liste les chantiers actifs dont la date de fin prévue est dépassée.",
    parametres: { type: "object", properties: {} },
  },
  {
    nom: "absences_du_jour",
    description: "Liste les employés en congé approuvé aujourd'hui.",
    parametres: { type: "object", properties: {} },
  },
  {
    nom: "factures_impayees",
    description: "Liste les factures envoyées ou en retard de paiement.",
    parametres: { type: "object", properties: {} },
  },
  {
    nom: "devis_en_attente",
    description: "Liste les devis envoyés depuis plus de 7 jours sans réponse du client.",
    parametres: { type: "object", properties: {} },
  },
  {
    nom: "stock_faible",
    description: "Liste les articles de stock dont la quantité est sous le seuil d'alerte.",
    parametres: { type: "object", properties: {} },
  },
  {
    nom: "vehicules_entretien",
    description: "Liste les véhicules dont le contrôle technique, l'assurance ou l'entretien arrive à échéance sous 30 jours.",
    parametres: { type: "object", properties: {} },
  },
  {
    nom: "heures_supplementaires_semaine",
    description: "Liste les employés ayant fait des heures supplémentaires cette semaine, du plus au moins.",
    parametres: { type: "object", properties: {} },
  },
  {
    nom: "rentabilite_chantiers",
    description:
      "Liste la rentabilité de chaque chantier (facturé HT, coût main-d'œuvre, achats, sous-traitance, marge, taux de marge), " +
      "du moins rentable au plus rentable. Utilise cet outil pour toute question sur la marge, le résultat, les coûts ou la rentabilité d'un ou plusieurs chantiers.",
    parametres: { type: "object", properties: {} },
  },
  {
    nom: "chercher_employe",
    description: "Recherche un employé actif par nom ou prénom approximatif, pour obtenir son identifiant.",
    parametres: {
      type: "object",
      properties: { terme: { type: "string" } },
      required: ["terme"],
    },
  },
  {
    nom: "chercher_chantier_planning",
    description: "Recherche un chantier par nom approximatif, pour obtenir son identifiant.",
    parametres: {
      type: "object",
      properties: { terme: { type: "string" } },
      required: ["terme"],
    },
  },
  {
    nom: "verifier_disponibilite_employe",
    description: "Vérifie si un employé est déjà affecté, en congé, et liste ses habilitations, pour une date donnée (AAAA-MM-JJ). À utiliser avant toute proposition d'affectation.",
    parametres: {
      type: "object",
      properties: {
        employe_id: { type: "string" },
        date: { type: "string", description: "Date au format AAAA-MM-JJ" },
      },
      required: ["employe_id", "date"],
    },
  },
  {
    nom: "proposer_affectation",
    description:
      "Termine la conversation en proposant à l'utilisateur une affectation précise, pour validation manuelle. " +
      "N'écrit rien en base : c'est une proposition seulement. À utiliser uniquement après avoir identifié l'employé et le chantier " +
      "(via chercher_employe / chercher_chantier_planning) et vérifié la disponibilité (verifier_disponibilite_employe).",
    parametres: {
      type: "object",
      properties: {
        employe_id: { type: "string" },
        chantier_id: { type: "string" },
        date: { type: "string", description: "Date au format AAAA-MM-JJ" },
        heures: { type: "number" },
        tache: { type: "string", description: "Description courte de la tâche, ou chaîne vide" },
        commentaire: { type: "string", description: "Ce que tu veux dire à l'utilisateur avant de lui proposer cette affectation (ex. avertissement si l'employé a déjà des heures ce jour-là)" },
      },
      required: ["employe_id", "chantier_id", "date", "heures"],
    },
  },
];

export async function executerOutilCopilote(
  supabase: Supabase,
  entrepriseId: string,
  nom: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (nom) {
    case "rechercher":
      return rechercher(supabase, entrepriseId, input as { terme: string });
    case "chantiers_en_retard":
      return chantiersEnRetard(supabase, entrepriseId);
    case "absences_du_jour":
      return absencesDuJour(supabase, entrepriseId);
    case "factures_impayees":
      return facturesImpayees(supabase, entrepriseId);
    case "devis_en_attente":
      return devisEnAttente(supabase, entrepriseId);
    case "stock_faible":
      return stockFaible(supabase, entrepriseId);
    case "vehicules_entretien":
      return vehiculesEntretien(supabase, entrepriseId);
    case "heures_supplementaires_semaine":
      return heuresSupplementairesSemaine(supabase, entrepriseId);
    case "rentabilite_chantiers":
      return rentabiliteChantiers(supabase, entrepriseId);
    case "chercher_employe":
      return chercherEmploye(supabase, entrepriseId, input as { terme: string });
    case "chercher_chantier_planning":
      return chercherChantierParNom(supabase, entrepriseId, input as { terme: string });
    case "verifier_disponibilite_employe":
      return verifierDisponibiliteEmploye(supabase, entrepriseId, input as { employe_id: string; date: string });
    default:
      return { error: `Outil inconnu : ${nom}` };
  }
}
