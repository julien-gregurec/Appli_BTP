import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutilIA } from "@/lib/ai/provider";
import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";
import { calculerRentabiliteChantiers } from "@/lib/rentabilite";

type Supabase = SupabaseClient;

// Recherche insensible aux accents/majuscules et robuste aux noms multi-mots
// ("Lucas Morel" doit matcher prenom="Lucas" nom="Morel" meme si aucun des deux
// champs pris seul ne contient la chaine complete). Filtrage des marques
// diacritiques par point de code (768-879 = plage Unicode "Combining Diacritical
// Marks") plutot que par regex accentuee, pour eviter tout risque d'encodage.
function normaliser(valeur: string): string {
  const decompose = valeur.normalize("NFD");
  let resultat = "";
  for (const caractere of decompose) {
    const code = caractere.codePointAt(0) ?? 0;
    if (code < 768 || code > 879) resultat += caractere;
  }
  return resultat.toLowerCase().trim();
}

function correspondTousLesMots(texte: string, terme: string): boolean {
  const mots = normaliser(terme).split(/\s+/).filter(Boolean);
  const cible = normaliser(texte);
  return mots.length > 0 && mots.every((mot) => cible.includes(mot));
}

async function rechercher(supabase: Supabase, entrepriseId: string, permissions: string[] | null, input: { terme: string }) {
  const chercherDevis = permissions === null || permissions.includes("acces_devis");
  const chercherFactures = permissions === null || permissions.includes("acces_factures");
  const [{ data: clients }, { data: chantiers }, devisResultat, facturesResultat] = await Promise.all([
    supabase.from("clients").select("id, nom, prenom, societe").eq("entreprise_id", entrepriseId).limit(300),
    supabase.from("chantiers").select("id, nom, ville, statut").eq("entreprise_id", entrepriseId).limit(300),
    chercherDevis
      ? supabase.from("devis").select("id, numero, statut, montant_ttc, client_id, clients!devis_client_id_fkey(nom, societe)").eq("entreprise_id", entrepriseId).ilike("numero", `%${input.terme.trim()}%`).limit(5)
      : Promise.resolve({ data: null }),
    chercherFactures
      ? supabase.from("factures").select("id, numero, statut, montant_ttc, client_id, clients!factures_client_id_fkey(nom, societe)").eq("entreprise_id", entrepriseId).ilike("numero", `%${input.terme.trim()}%`).limit(5)
      : Promise.resolve({ data: null }),
  ]);
  return {
    clients: (clients ?? []).filter((c) => correspondTousLesMots(`${c.prenom ?? ""} ${c.nom ?? ""} ${c.societe ?? ""}`, input.terme)).slice(0, 5),
    chantiers: (chantiers ?? []).filter((c) => correspondTousLesMots(c.nom, input.terme)).slice(0, 5),
    devis: devisResultat.data ?? [],
    factures: facturesResultat.data ?? [],
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
    .select("id, numero, statut, montant_ttc, montant_paye, date_echeance, clients!factures_client_id_fkey(nom, societe)")
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
    .select("id, numero, montant_ttc, date_emission, clients!devis_client_id_fkey(nom, societe)")
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
    .limit(300);
  return (data ?? []).filter((e) => correspondTousLesMots(`${e.prenom ?? ""} ${e.nom ?? ""}`, input.terme)).slice(0, 5);
}

async function chercherChantierParNom(supabase: Supabase, entrepriseId: string, input: { terme: string }) {
  const { data } = await supabase
    .from("chantiers")
    .select("id, nom, ville, statut")
    .eq("entreprise_id", entrepriseId)
    .limit(300);
  return (data ?? []).filter((c) => correspondTousLesMots(c.nom, input.terme)).slice(0, 5);
}

// AI-LAUNCH-V1B, outil manquant depuis V1 (§17). Contrainte de modele de donnees decouverte en
// l'implementant : la table `affectations` a ete deliberement redessinee (migration
// 20260710000011, "Refonte Planning : modele 'affectation heures'... Remplace l'agenda
// debut/fin par : un ouvrier affecte a un chantier, une date, un nombre d'heures") pour NE PLUS
// avoir d'heure de debut/fin, uniquement une date et une duree en heures. Un "creneau" au sens
// de ce produit est donc une DATE ou chaque employe demande a assez de marge restante ce jour-la
// pour la duree demandee, jamais un horaire precis (ex. "10h-11h") : proposer une heure precise
// serait une donnee inventee (§13, ne jamais halluciner). Convention documentee ici en l'absence
// de toute regle de disponibilite existante (aucune table horaires_entreprise/horaires_salaries
// dans le schema) : capacite journaliere = 7h, reprise du defaut deja utilise par la colonne
// `affectations.heures` (default 7) plutot qu'un chiffre invente.
const CAPACITE_JOURNALIERE_HEURES = 7;
const MAX_CRENEAUX_PROPOSES = 3;
const MAX_JOURS_BALAYES = 31;

async function proposerCreneauxPlanning(
  supabase: Supabase,
  entrepriseId: string,
  input: { employe_ids?: unknown; duree_heures?: unknown; date_debut?: unknown; date_fin?: unknown },
) {
  const employeIds = [...new Set((Array.isArray(input.employe_ids) ? input.employe_ids : []).map((v) => String(v)).filter(Boolean))];
  const dureeHeures = Number(input.duree_heures);
  const dateDebut = String(input.date_debut ?? "");
  const dateFin = String(input.date_fin ?? "");
  if (!employeIds.length || !dureeHeures || dureeHeures <= 0 || dureeHeures > CAPACITE_JOURNALIERE_HEURES) {
    return { error: "Paramètres invalides : au moins un employé, une durée entre 0 et 7 h, une période de dates." };
  }
  if (!dateDebut || !dateFin || dateFin < dateDebut) {
    return { error: "Période invalide." };
  }

  const { data: employes } = await supabase.from("employes").select("id, nom, prenom").in("id", employeIds).eq("entreprise_id", entrepriseId).eq("statut", "actif");
  if (!employes || employes.length !== employeIds.length) {
    return { error: "Un ou plusieurs employés sont introuvables ou inactifs." };
  }
  const nomsParId = new Map(employes.map((e) => [e.id, `${e.prenom} ${e.nom}`]));

  const [{ data: affectations }, { data: conges }] = await Promise.all([
    supabase.from("affectations").select("employe_id, date, heures").in("employe_id", employeIds).eq("entreprise_id", entrepriseId).gte("date", dateDebut).lte("date", dateFin),
    supabase.from("demandes_conges").select("employe_id, date_debut, date_fin").in("employe_id", employeIds).eq("entreprise_id", entrepriseId).eq("statut", "approuvee").lte("date_debut", dateFin).gte("date_fin", dateDebut),
  ]);

  const heuresParEmployeEtJour = new Map<string, number>();
  for (const a of affectations ?? []) {
    const cle = `${a.employe_id}|${a.date}`;
    heuresParEmployeEtJour.set(cle, (heuresParEmployeEtJour.get(cle) ?? 0) + Number(a.heures));
  }
  const congesParEmploye = new Map<string, Array<{ debut: string; fin: string }>>();
  for (const c of conges ?? []) {
    const liste = congesParEmploye.get(c.employe_id) ?? [];
    liste.push({ debut: c.date_debut, fin: c.date_fin });
    congesParEmploye.set(c.employe_id, liste);
  }
  const enConge = (employeId: string, date: string) => (congesParEmploye.get(employeId) ?? []).some((c) => c.debut <= date && date <= c.fin);

  const creneaux: Array<{ date: string; employes: Array<{ id: string; nom: string; heures_deja_prevues: number; marge_restante: number }> }> = [];
  const debut = new Date(`${dateDebut}T00:00:00Z`);
  const fin = new Date(`${dateFin}T00:00:00Z`);
  for (let jour = new Date(debut), compteur = 0; jour <= fin && compteur < MAX_JOURS_BALAYES && creneaux.length < MAX_CRENEAUX_PROPOSES; jour.setUTCDate(jour.getUTCDate() + 1), compteur++) {
    const date = jour.toISOString().slice(0, 10);
    if (employeIds.some((id) => enConge(id, date))) continue;
    const disponibilites = employeIds.map((id) => {
      const dejaPrevues = heuresParEmployeEtJour.get(`${id}|${date}`) ?? 0;
      return { id, nom: nomsParId.get(id)!, heures_deja_prevues: dejaPrevues, marge_restante: Math.max(0, CAPACITE_JOURNALIERE_HEURES - dejaPrevues) };
    });
    if (disponibilites.every((d) => d.marge_restante >= dureeHeures)) {
      creneaux.push({ date, employes: disponibilites });
    }
  }

  return {
    duree_demandee_heures: dureeHeures,
    capacite_journaliere_heures: CAPACITE_JOURNALIERE_HEURES,
    creneaux,
    note: creneaux.length === 0 ? "Aucun jour disponible pour tous les employés demandés sur cette période." : null,
  };
}

// IA-DEVIS-V1 §5 : source de prix "fiable" — catalogue de prestations de l'entreprise.
async function rechercherPrestationsDevis(supabase: Supabase, entrepriseId: string, input: { terme: string }) {
  const { data } = await supabase
    .from("prestations_catalogue")
    .select("id, designation, description, type, unite, prix_unitaire_ht, taux_tva")
    .eq("entreprise_id", entrepriseId)
    .eq("actif", true)
    .limit(300);
  // Chevauchement (designationsProches), pas correspondTousLesMots : le terme recherché par
  // le modèle est souvent plus long/descriptif que la désignation catalogue elle-même (ex.
  // "Cloison 72/48 avec isolation laine de verre 45mm" contre une prestation enregistrée
  // "Cloison 72/48 avec isolation") — exiger que TOUS les mots du terme soient présents dans
  // la désignation aurait échoué sur ce cas précis, comme observé en recette réelle pour la
  // recherche de prix historique (voir designationsProches ci-dessous).
  return (data ?? [])
    .filter((p) => designationsProches(`${p.designation ?? ""} ${p.description ?? ""}`, input.terme))
    .slice(0, 10);
}

// Mots trop génériques pour être significatifs dans un rapprochement de désignations BTP
// (articles, prépositions, et les participes "fourni(e)(s)"/"posé(e)(s)" quasi systématiques
// dans les libellés de prestation, qui matcheraient presque tout sans discriminer).
const MOTS_VIDES_DESIGNATION = new Set([
  "de", "du", "des", "le", "la", "les", "un", "une", "et", "à", "a", "au", "aux",
  "avec", "pour", "sur", "en", "fourni", "fournie", "fournis", "fournies",
  "pose", "posee", "poses", "posees",
]);

function motsSignificatifs(valeur: string): Set<string> {
  return new Set(normaliser(valeur).split(/\s+/).filter((mot) => mot.length >= 3 && !MOTS_VIDES_DESIGNATION.has(mot)));
}

// Chevauchement plutôt qu'inclusion stricte dans un sens ou l'autre : une désignation de
// catalogue/historique ("Faux plafond") est souvent plus courte que ce que demande
// l'utilisateur ou reformule le modèle ("Faux plafond fourni et posé, dalles 600x600"), donc
// ni `A contient B` ni `B contient A` ne matchent de façon fiable — un ILIKE directionnel
// avait échoué exactement sur ce cas en recette réelle IA-DEVIS-V1.
function designationsProches(a: string, b: string): boolean {
  const motsA = motsSignificatifs(a);
  for (const mot of motsSignificatifs(b)) if (motsA.has(mot)) return true;
  return false;
}

// IA-DEVIS-V1 §5/§7 : source de prix "historique" — dernières lignes de devis de
// l'entreprise correspondant à la désignation, sans exposer le devis complet ni le nom du
// client (§38, confidentialité) : uniquement prix/unité/TVA/numéro/date, le strict
// nécessaire pour que le modèle propose un prix et le signale comme "basé sur un devis
// précédent" plutôt que comme un tarif enregistré certain.
async function rechercherPrixHistoriqueDevis(supabase: Supabase, entrepriseId: string, input: { designation: string }) {
  const terme = input.designation.trim();
  if (!terme) return [];
  const { data } = await supabase
    .from("lignes_devis")
    .select("designation, prix_unitaire_ht, unite, taux_tva, devis:devis_id(numero, date_emission, entreprise_id)")
    .limit(1000);
  return (data ?? [])
    .map((l) => ({ ...l, devis: Array.isArray(l.devis) ? l.devis[0] : l.devis }))
    .filter((l): l is typeof l & { devis: { numero: string | null; date_emission: string; entreprise_id: string } } => l.devis?.entreprise_id === entrepriseId)
    .filter((l) => designationsProches(l.designation, terme))
    .sort((a, b) => (b.devis.date_emission ?? "").localeCompare(a.devis.date_emission ?? ""))
    .slice(0, 5)
    .map((l) => ({
      designation: l.designation,
      prix_unitaire_ht: l.prix_unitaire_ht,
      unite: l.unite,
      taux_tva: l.taux_tva,
      devis_numero: l.devis.numero,
      date: l.devis.date_emission,
    }));
}

async function verifierDisponibiliteEmploye(supabase: Supabase, entrepriseId: string, input: { employe_id: string; date: string }) {
  const [{ data: affectations }, { data: conge }, { data: habilitations }] = await Promise.all([
    supabase.from("affectations").select("id, heures, tache, chantier_id, chantier:chantiers(nom), lieu_activite, type_activite").eq("entreprise_id", entrepriseId).eq("employe_id", input.employe_id).eq("date", input.date),
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

// Certains outils exposent des données couvertes par un droit de menu spécifique
// (rentabilité, flotte, stock, factures, devis, heures de l'équipe) : la RLS Postgres
// sur ces tables reste large (accès par simple appartenance à l'entreprise, cf. les
// politiques "membres ..."), l'application du droit fin se fait normalement au niveau
// page/action. Le copilote doit reproduire cette même restriction explicitement, sinon
// il devient un contournement en langage naturel des droits de menu (ex. un poste
// Terrain sans acces_rentabilite ne doit jamais obtenir la marge d'un chantier via l'IA).
const PERMISSION_REQUISE_OUTIL: Partial<Record<string, readonly string[]>> = {
  rentabilite_chantiers: ["acces_rentabilite"],
  vehicules_entretien: ["acces_flotte"],
  stock_faible: ["acces_stock"],
  factures_impayees: ["acces_factures"],
  devis_en_attente: ["acces_devis"],
  heures_supplementaires_semaine: ["voir_pointages_equipe", "gerer_pointage"],
  rechercher_prestations_devis: ["acces_devis"],
  rechercher_prix_historique_devis: ["acces_devis"],
  // proposer_devis (écriture) n'est pas filtré ici : comme proposer_affectation, il reste
  // visible du modèle mais est gardé par le droit gerer_devis directement dans son résolveur
  // (src/lib/ai/assistant.ts) et par la consigne du prompt système — voir IA_DEVIS_V1.md.
};

// null = accès complet (prototype ou compte support), comme partout ailleurs dans
// src/lib/permissions.ts.
export function autoriseOutilCopilote(nom: string, permissions: string[] | null): boolean {
  if (permissions === null) return true;
  const requises = PERMISSION_REQUISE_OUTIL[nom];
  if (!requises) return true;
  return requises.some((cle) => permissions.includes(cle));
}

export function outilsAutorisesCopilote(permissions: string[] | null): OutilIA[] {
  return OUTILS_COPILOTE.filter((outil) => autoriseOutilCopilote(outil.nom, permissions));
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
    nom: "rechercher_prestations_devis",
    description:
      "Recherche dans le catalogue de prestations de l'entreprise (source de prix FIABLE, un tarif réellement enregistré) par mot-clé. " +
      "À utiliser en priorité pour chiffrer une ligne de devis avant d'estimer un prix.",
    parametres: {
      type: "object",
      properties: { terme: { type: "string", description: "Mots-clés de la prestation recherchée (ex. \"cloison placo\")" } },
      required: ["terme"],
    },
  },
  {
    nom: "rechercher_prix_historique_devis",
    description:
      "Cherche, parmi les devis déjà émis par l'entreprise, le prix unitaire utilisé pour une désignation proche (source de prix HISTORIQUE, pas un tarif catalogue). " +
      "À utiliser seulement si rechercher_prestations_devis n'a rien trouvé. Si tu utilises ce prix dans ta proposition, indique-le comme basé sur un devis précédent, jamais comme un tarif certain.",
    parametres: {
      type: "object",
      properties: { designation: { type: "string", description: "Désignation de la prestation à rechercher dans l'historique" } },
      required: ["designation"],
    },
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
    nom: "proposer_creneaux_planning",
    description:
      "Cherche jusqu'à 3 dates où TOUS les employés demandés ont assez de marge dans leur journée pour une durée donnée, sur une période. " +
      "N'écrit rien en base et ne propose aucun horaire précis (ce produit ne gère pas d'heure de début/fin, seulement une date et un nombre d'heures par jour) : " +
      "utilise cet outil pour répondre à une demande du type « trouve un créneau/un moment libre avec X et Y », avant de proposer une affectation avec proposer_affectation. " +
      "Cherche d'abord chaque employé cité via chercher_employe. Une fois qu'une date convient à l'utilisateur, termine avec proposer_affectation (ou proposer_modification_affectation) pour cette date, pas avant.",
    parametres: {
      type: "object",
      properties: {
        employe_ids: { type: "array", items: { type: "string" }, description: "Identifiants des employés concernés (obtenus via chercher_employe)" },
        duree_heures: { type: "number", description: "Durée recherchée en heures (ex. 1 pour une heure), maximum 7" },
        date_debut: { type: "string", description: "Début de la période de recherche, format AAAA-MM-JJ" },
        date_fin: { type: "string", description: "Fin de la période de recherche, format AAAA-MM-JJ (ex. fin de semaine si l'utilisateur dit \"cette semaine\")" },
      },
      required: ["employe_ids", "duree_heures", "date_debut", "date_fin"],
    },
  },
  {
    nom: "proposer_affectation",
    description:
      "Termine la conversation en proposant à l'utilisateur une affectation précise, pour validation manuelle. " +
      "N'écrit rien en base : c'est une proposition seulement. Réservé aux postes qui ont le droit de modifier le planning — voir le contexte " +
      "au début de cette conversation pour savoir si c'est le cas ; si non, ne l'utilise pas, oriente vers proposer_demande_conge ou un responsable. " +
      "Quand c'est autorisé, employe_id peut être n'importe quel employé de l'entreprise (pas seulement l'utilisateur), et l'affectation est effective " +
      "dès validation, sans approbation. À utiliser uniquement après avoir identifié l'employé (via chercher_employe) et vérifié la disponibilité (verifier_disponibilite_employe). " +
      "Ne te limite pas à quelques cas prévus : c'est l'outil à utiliser pour TOUT ce qui occupe du temps d'un ou plusieurs employés un jour donné — " +
      "chantier, bureau, dépôt, visite médicale, formation, absence/congé posé directement, chantier pas encore enregistré, repas d'affaires, rendez-vous, réunion externe, etc. " +
      "Si PLUSIEURS employés sont concernés par la même activité (ex. deux ouvriers sur le même chantier, une réunion à trois), mets tous leurs identifiants dans employe_ids " +
      "en un seul appel — une affectation identique (même date, mêmes heures, même contexte) est créée pour chacun ; n'appelle jamais cet outil séparément pour chaque personne. " +
      "Dès que type_activite n'est pas \"chantier\", mets dans lieu_activite exactement ce que l'utilisateur a dit sur le lieu ou l'événement " +
      "(adresse, nom de lieu, avec qui, contexte) — un lien d'itinéraire sera généré automatiquement à partir de ce texte, pas besoin de le structurer. " +
      "IMPORTANT : uniquement pour une NOUVELLE affectation. Si l'utilisateur demande de corriger, changer ou déplacer une affectation qui existe déjà " +
      "(visible dans verifier_disponibilite_employe), utilise proposer_modification_affectation à la place — jamais celui-ci, qui créerait un doublon " +
      "et mettrait la personne sur deux activités en même temps.",
    parametres: {
      type: "object",
      properties: {
        employe_ids: { type: "array", items: { type: "string" }, description: "Un ou plusieurs identifiants d'employé (obtenus via chercher_employe). Une même affectation est créée pour chacun." },
        type_activite: { type: "string", enum: ["chantier", "bureau", "depot", "visite_medicale", "formation", "conge", "autre"], description: `"chantier" par défaut. "conge" pose une absence directement (sans passer par une demande à approuver). "autre" couvre tout le reste (repas, rendez-vous, réunion externe, chantier pas encore créé dans ${PRODUCT_NAME}...).` },
        chantier_id: { type: "string", description: "Obligatoire uniquement si type_activite=\"chantier\"" },
        lieu_activite: { type: "string", description: "Quand type_activite n'est pas \"chantier\" : reprends fidèlement ce que l'utilisateur a dit sur le lieu/contexte (ex. \"Restaurant avec le président du RCSA\", \"Dépôt principal\", \"Chantier non enregistré : nom cité\")" },
        date: { type: "string", description: "Date au format AAAA-MM-JJ" },
        heures: { type: "number" },
        tache: { type: "string", description: "Description courte de la tâche, ou chaîne vide" },
        commentaire: { type: "string", description: "Ce que tu veux dire à l'utilisateur avant de lui proposer cette affectation (ex. avertissement si l'employé a déjà des heures ce jour-là)" },
      },
      required: ["employe_ids", "date", "heures"],
    },
  },
  {
    nom: "proposer_modification_affectation",
    description:
      "Termine la conversation en proposant de MODIFIER une affectation déjà existante (identifiée par affectation_id, obtenu via le champ id renvoyé " +
      "par verifier_disponibilite_employe pour cet employé et cette date), plutôt que d'en créer une nouvelle. À utiliser dès que l'utilisateur demande de " +
      "changer, corriger, déplacer ou remplacer une affectation existante — jamais proposer_affectation dans ce cas, qui créerait un doublon et laisserait " +
      "l'ancienne affectation active en même temps que la nouvelle (l'employé se retrouverait sur deux activités en même temps). " +
      "N'écrit rien en base tant que l'utilisateur n'a pas validé. Mêmes champs que proposer_affectation, sauf qu'il n'y a qu'une seule affectation ciblée (pas de liste d'employés).",
    parametres: {
      type: "object",
      properties: {
        affectation_id: { type: "string", description: "Identifiant de l'affectation existante à modifier (champ id de verifier_disponibilite_employe)" },
        type_activite: { type: "string", enum: ["chantier", "bureau", "depot", "visite_medicale", "formation", "conge", "autre"], description: "Nouvelle valeur (peut être inchangée)" },
        chantier_id: { type: "string", description: "Obligatoire uniquement si type_activite=\"chantier\"" },
        lieu_activite: { type: "string", description: "Quand type_activite n'est pas \"chantier\"" },
        date: { type: "string", description: "Date au format AAAA-MM-JJ" },
        heures: { type: "number" },
        tache: { type: "string", description: "Description courte de la tâche, ou chaîne vide" },
        commentaire: { type: "string", description: "Ce que tu veux dire à l'utilisateur avant de lui proposer cette modification" },
      },
      required: ["affectation_id", "date", "heures"],
    },
  },
  {
    nom: "proposer_demande_conge",
    description:
      "Termine la conversation en proposant une demande d'absence/congé pour L'UTILISATEUR ACTUEL (jamais pour quelqu'un d'autre — les demandes de congé sont toujours personnelles). " +
      "N'écrit rien en base tant que l'utilisateur n'a pas validé : à ce moment-là, la demande est créée ET soumise pour approbation par le responsable, exactement comme via la page Congés — elle n'est PAS automatiquement acceptée. " +
      "Le modèle ne connaît que des demi-journées (matin / après-midi / journée entière), pas d'heures précises : si l'utilisateur donne des horaires (ex. \"de 13h à 17h\"), déduis la demi-journée la plus proche (avant ~13h = matin, après ~13h = après-midi) et reporte les horaires exacts donnés dans commentaire pour que le responsable les voie.",
    parametres: {
      type: "object",
      properties: {
        type_conge: { type: "string", enum: ["conges_payes", "rtt", "sans_solde", "maladie", "evenement_familial", "recuperation", "autre"], description: "\"conges_payes\" par défaut si non précisé par l'utilisateur." },
        date_debut: { type: "string", description: "Date au format AAAA-MM-JJ" },
        date_fin: { type: "string", description: "Date au format AAAA-MM-JJ, égale à date_debut pour une absence d'un seul jour" },
        demi_jour_debut: { type: "string", enum: ["journee", "matin", "apres_midi"], description: "\"journee\" par défaut" },
        demi_jour_fin: { type: "string", enum: ["journee", "matin", "apres_midi"], description: "\"journee\" par défaut" },
        commentaire: { type: "string", description: "Précisions utiles au responsable (motif, horaires exacts cités par l'utilisateur, etc.)" },
      },
      required: ["date_debut", "date_fin"],
    },
  },
  {
    nom: "proposer_message_interne",
    description:
      "Termine la conversation en proposant d'envoyer un message interne, pour validation manuelle. N'écrit rien en base tant que l'utilisateur n'a pas validé. " +
      "Deux destinations possibles, exactement une des deux : destinataire_employe_id pour un message direct à un collègue nommé (identifié via chercher_employe), " +
      "ou chantier_id pour poster sur le fil de discussion partagé d'un chantier (identifié via chercher_chantier_planning), visible par toute l'équipe du chantier. " +
      `Réservé aux messages professionnels internes à l'entreprise — pas pour contacter le support ${BRAND_NAME} (utilise proposer_message_support pour ça).`,
    parametres: {
      type: "object",
      properties: {
        destinataire_employe_id: { type: "string", description: "Pour un message direct à un collègue précis" },
        chantier_id: { type: "string", description: "Pour poster sur le fil du chantier, visible par toute l'équipe" },
        contenu: { type: "string", description: "Le texte du message" },
      },
      required: ["contenu"],
    },
  },
  {
    nom: "proposer_message_support",
    description:
      `Termine la conversation en proposant d'envoyer un message au support ${BRAND_NAME} (l'éditeur du logiciel), pour validation manuelle. N'écrit rien en base tant que l'utilisateur n'a pas validé. ` +
      `Uniquement pour un problème technique, une question sur le fonctionnement de l'application, la facturation de l'abonnement ${PRODUCT_NAME}, etc. — jamais pour une question métier BTP ou une communication avec un client/collègue.`,
    parametres: {
      type: "object",
      properties: {
        contenu: { type: "string", description: "Le texte du message au support" },
      },
      required: ["contenu"],
    },
  },
  {
    nom: "proposer_devis",
    description:
      "Termine la conversation en proposant un BROUILLON de devis structuré, pour validation manuelle. N'écrit rien en base. " +
      "Réservé aux postes qui ont le droit de gérer les devis — voir le contexte au début de cette conversation pour savoir si c'est le cas ; si non, ne l'utilise pas. " +
      "Cherche d'abord le client via rechercher (si plusieurs correspondances, demande lequel avant de continuer ; si aucune, dis-le et ne propose pas de devis). " +
      "Pour chaque prestation distincte de la demande, crée une ligne séparée (ne fusionne jamais deux prestations différentes dans une seule ligne). " +
      "Pour le prix de chaque ligne : cherche d'abord rechercher_prestations_devis (source \"catalogue\"), puis rechercher_prix_historique_devis si rien trouvé (source \"historique\", à signaler comme basé sur un devis précédent) ; " +
      "si aucune des deux ne donne de prix exploitable, laisse prix_unitaire_ht à null (source \"absent\") — n'invente JAMAIS un prix au marché, ce produit ne le permet pas. " +
      "Toute hypothèse que tu ajoutes toi-même (finition, épaisseur, méthode non précisée par l'utilisateur) doit être listée dans hypotheses, jamais présentée comme une information fournie par l'utilisateur. " +
      "Si la demande est trop vague pour être chiffrée (ex. juste \"fais-moi un devis\"), pose au maximum 2 à 4 questions prioritaires avant de proposer, plutôt que de deviner.",
    parametres: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "Identifiant du client (obtenu via rechercher), obligatoire pour créer le brouillon" },
        objet: { type: "string", description: "Titre court du devis (ex. \"Cloisons bureaux Strasbourg\")" },
        lignes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              designation: { type: "string" },
              description: { type: "string", description: "Détail visible sur le devis, chaîne vide si inutile" },
              type: { type: "string", enum: ["main_oeuvre", "fourniture", "sous_traitance", "deplacement", "forfait"] },
              quantite: { type: "number" },
              unite: { type: "string", enum: ["u", "m²", "ml", "h", "forfait", "kg", "L"] },
              prix_unitaire_ht: { type: ["number", "null"], description: "Prix HT en euros, ou null si aucune source fiable/historique — jamais une estimation inventée" },
              source_prix: { type: "string", enum: ["catalogue", "historique", "absent"] },
              taux_tva: { type: "number", enum: [20, 10, 5.5, 0] },
              remise_ligne: { type: "number", description: "Remise en % sur cette ligne, 0 par défaut. Uniquement si l'utilisateur l'a explicitement demandée." },
            },
            required: ["designation", "type", "quantite", "unite", "source_prix", "taux_tva"],
          },
        },
        hypotheses: { type: "array", items: { type: "string" }, description: "Hypothèses que TU as ajoutées (non fournies explicitement par l'utilisateur)" },
        notes_client: { type: "string", description: "Notes additionnelles visibles sur le devis, chaîne vide si inutile" },
        commentaire: { type: "string", description: "Ce que tu veux dire à l'utilisateur avant de lui proposer ce brouillon" },
      },
      required: ["objet", "lignes"],
    },
  },
];

export async function executerOutilCopilote(
  supabase: Supabase,
  entrepriseId: string,
  permissions: string[] | null,
  nom: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  // Deuxieme barriere en profondeur : outilsAutorisesCopilote() retire deja ces outils
  // de la liste proposee au modele, mais on ne fait jamais confiance uniquement a ce que
  // le modele choisit d'appeler (cf. AI-LAUNCH-V1 §2 — l'IA n'a aucun droit que
  // l'utilisateur n'a pas deja).
  if (!autoriseOutilCopilote(nom, permissions)) {
    return { error: "Ton poste n'a pas accès à cette information." };
  }
  switch (nom) {
    case "rechercher":
      return rechercher(supabase, entrepriseId, permissions, input as { terme: string });
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
    case "rechercher_prestations_devis":
      return rechercherPrestationsDevis(supabase, entrepriseId, input as { terme: string });
    case "rechercher_prix_historique_devis":
      return rechercherPrixHistoriqueDevis(supabase, entrepriseId, input as { designation: string });
    case "chercher_employe":
      return chercherEmploye(supabase, entrepriseId, input as { terme: string });
    case "chercher_chantier_planning":
      return chercherChantierParNom(supabase, entrepriseId, input as { terme: string });
    case "verifier_disponibilite_employe":
      return verifierDisponibiliteEmploye(supabase, entrepriseId, input as { employe_id: string; date: string });
    case "proposer_creneaux_planning":
      return proposerCreneauxPlanning(supabase, entrepriseId, input);
    default:
      return { error: `Outil inconnu : ${nom}` };
  }
}
