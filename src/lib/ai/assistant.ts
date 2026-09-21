import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenirProviderIA, type FichierIA, type MessageIA, type ReponseCompletion, type UsageIA } from "@/lib/ai/provider";
import { outilsAutorisesCopilote, executerOutilCopilote } from "@/lib/ai/copilote";
import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";
import { UNITES, TAUX_TVA, LIGNE_TYPES } from "@/lib/devis";

export type MessageChat = { role: "user" | "assistant"; contenu: string; fichier?: FichierIA };

// Doit rester synchronise avec la liste dans src/app/actions/planning.ts (formulaire manuel).
// L'ecriture reelle est de toute facon protegee par la RLS Postgres sur `affectations`
// (droit gerer_planning, cf. migration 20260713000043) : proposer_affectation n'est donc
// utilisable que par les postes qui ont deja le droit de modifier le planning de n'importe
// qui, "conge" inclus (une pose d'absence directe, sans passer par le circuit d'approbation
// des demandes de conges — voir resoudrePropositionAffectation).
export const TYPES_ACTIVITE_PROPOSABLES_IA = ["chantier", "bureau", "depot", "visite_medicale", "formation", "conge", "autre"] as const;
export type TypeActiviteProposable = (typeof TYPES_ACTIVITE_PROPOSABLES_IA)[number];

export type PropositionAffectation = {
  affectationId: string | null;
  employeIds: string[];
  employeNoms: string[];
  typeActivite: TypeActiviteProposable;
  chantierId: string | null;
  chantierNom: string | null;
  lieuActivite: string | null;
  date: string;
  heures: number;
  tache: string | null;
  avertissement: string | null;
};

// Doit rester synchronise avec `types` dans src/app/(app)/conges/page.tsx et le check
// constraint de demandes_conges.type_conge.
export const TYPES_CONGE = ["conges_payes", "rtt", "sans_solde", "maladie", "evenement_familial", "recuperation", "autre"] as const;
export type TypeConge = (typeof TYPES_CONGE)[number];
const DEMI_JOURNEES = ["journee", "matin", "apres_midi"] as const;
export type DemiJournee = (typeof DEMI_JOURNEES)[number];

export type PropositionConge = {
  employeId: string;
  employeNom: string;
  typeConge: TypeConge;
  dateDebut: string;
  dateFin: string;
  demiJourDebut: DemiJournee;
  demiJourFin: DemiJournee;
  commentaire: string | null;
};

export type PropositionMessageInterne = {
  destinataireEmployeId: string | null;
  destinataireEmployeNom: string | null;
  chantierId: string | null;
  chantierNom: string | null;
  contenu: string;
};

export type PropositionMessageSupport = {
  contenu: string;
};

// IA-DEVIS-V1 : source_prix n'est jamais écrite en base (lignes_devis n'a pas cette colonne),
// c'est une métadonnée de transparence affichée uniquement dans la carte de proposition — voir
// docs/ia/IA_DEVIS_V1.md. prix_unitaire_ht=null signifie "aucune source fiable/historique" :
// affiché "À renseigner", jamais transformé silencieusement en 0 avant confirmation.
export type LigneProposeeDevis = {
  designation: string;
  description: string | null;
  type: string;
  quantite: number;
  unite: string;
  prixUnitaireHt: number | null;
  sourcePrix: "catalogue" | "historique" | "absent";
  tauxTva: number;
  remiseLigne: number;
};

export type PropositionDevis = {
  clientId: string;
  clientNom: string;
  objet: string;
  lignes: LigneProposeeDevis[];
  hypotheses: string[];
  notesClient: string | null;
  avertissement: string | null;
};

export type EvenementAssistant =
  | { type: "texte"; delta: string }
  | { type: "proposition"; proposition: PropositionAffectation }
  | { type: "proposition_conge"; proposition: PropositionConge }
  | { type: "proposition_message_interne"; proposition: PropositionMessageInterne }
  | { type: "proposition_message_support"; proposition: PropositionMessageSupport }
  | { type: "proposition_devis"; proposition: PropositionDevis };

// Noms des outils IA-DEVIS-V1 (schémas déclarés dans copilote.ts) : filtrés de la liste
// envoyée au modèle quand FEATURE_AI_DEVIS_ENABLED est désactivé, indépendamment du filtrage
// par permission déjà fait par outilsAutorisesCopilote — permet une désactivation isolée
// (§70/§71) sans toucher au reste de l'assistant.
export const NOMS_OUTILS_IA_DEVIS = ["rechercher_prestations_devis", "rechercher_prix_historique_devis", "proposer_devis"] as const;

const MAX_TOURS_OUTILS = 5;

type ContextePromptSysteme = {
  entrepriseNom: string;
  aujourdhui: string;
  descriptionUtilisateur: string;
  consigneAffectation: string;
  consigneDevis: string;
};

export function construirePromptSystemeAssistant({
  entrepriseNom,
  aujourdhui,
  descriptionUtilisateur,
  consigneAffectation,
  consigneDevis,
}: ContextePromptSysteme): string {
  return (
    `Tu es l'assistant intégré de ${PRODUCT_NAME}, un logiciel de gestion pour entreprises du BTP, pour l'entreprise "${entrepriseNom}". ` +
    `Nous sommes le ${aujourdhui}. ${descriptionUtilisateur}` +
    `Réponds en français, de façon concise et directe, comme un collègue qui connaît bien l'activité. ` +
    `Utilise systématiquement les outils à ta disposition pour aller chercher les données réelles avant de répondre — ne devine et n'invente jamais un chiffre ou un nom. ` +
    `Si aucun outil ne permet de répondre à la question, dis-le clairement plutôt que d'inventer une réponse. ` +
    consigneAffectation +
    consigneDevis +
    `Tu n'as accès à aucun outil de recherche de lieu réel (pas de carte, pas d'annuaire) : si l'utilisateur cite un lieu vague ou qui peut désigner plusieurs endroits (ex. un nom de restaurant courant, sans ville ni quartier), ne devine pas et ne l'invente pas — propose 2-3 hypothèses plausibles à partir de ta connaissance générale et demande laquelle est la bonne avant de conclure la proposition ; si le lieu est déjà précis (adresse, ville, quartier, nom distinctif), pas besoin de demander. ` +
    `Pour envoyer un message à un collègue nommé ou sur le fil d'un chantier, utilise proposer_message_interne (cherche d'abord le destinataire ou le chantier via chercher_employe / chercher_chantier_planning). Pour contacter le support ${BRAND_NAME} au sujet de l'application elle-même (bug, question technique, facturation de l'abonnement ${PRODUCT_NAME}), utilise proposer_message_support — jamais pour une question métier BTP. Dans les deux cas, rien n'est envoyé sans validation manuelle. ` +
    `Ne redirige jamais vers un menu que tu n'as pas vérifié. ` +
    `Formate tes réponses avec des tirets courts, pas de tableaux markdown, pas de titres.`
  );
}

type ChampsAffectation = { typeActivite: TypeActiviteProposable; date: string; heures: number; tache: string | null; lieuActivite: string | null; commentaireModele: string | null };

function analyserChampsAffectation(input: Record<string, unknown>): ChampsAffectation | null {
  const typeActiviteBrut = typeof input.type_activite === "string" && input.type_activite ? input.type_activite : "chantier";
  const date = String(input.date ?? "");
  const heures = Number(input.heures);
  if (!date || !heures || heures <= 0) return null;
  if (!(TYPES_ACTIVITE_PROPOSABLES_IA as readonly string[]).includes(typeActiviteBrut)) return null;
  return {
    typeActivite: typeActiviteBrut as TypeActiviteProposable,
    date,
    heures,
    tache: typeof input.tache === "string" && input.tache.trim() ? input.tache.trim() : null,
    lieuActivite: typeof input.lieu_activite === "string" && input.lieu_activite.trim() ? input.lieu_activite.trim() : null,
    commentaireModele: typeof input.commentaire === "string" && input.commentaire.trim() ? input.commentaire.trim() : null,
  };
}

// Une personne ne peut pas etre sur deux chantiers differents le meme jour : si la nouvelle
// affectation est de type "chantier", on signale toute AUTRE affectation chantier existante
// ce jour-la (hors celle qu'on est en train de modifier, le cas echeant) pointant vers un
// chantier different, plutot que de laisser un doublon silencieux se creer.
async function detecterConflitChantier(
  supabase: SupabaseClient,
  entrepriseId: string,
  employeId: string,
  date: string,
  typeActivite: TypeActiviteProposable,
  chantierId: string | null,
  exclureAffectationId: string | null,
): Promise<string | null> {
  if (typeActivite !== "chantier" || !chantierId) return null;
  let requete = supabase
    .from("affectations")
    .select("chantier:chantiers(nom), heures")
    .eq("entreprise_id", entrepriseId)
    .eq("employe_id", employeId)
    .eq("date", date)
    .eq("type_activite", "chantier")
    .neq("chantier_id", chantierId);
  if (exclureAffectationId) requete = requete.neq("id", exclureAffectationId);
  const { data: conflits } = await requete;
  if (!conflits?.length) return null;
  const noms = conflits
    .map((c) => {
      const chantier = Array.isArray(c.chantier) ? c.chantier[0] : c.chantier;
      return chantier ? `${chantier.nom} (${c.heures} h)` : null;
    })
    .filter((v): v is string => Boolean(v));
  return noms.length ? `Déjà affecté ce jour-là sur : ${noms.join(", ")}. Vérifie avant de valider.` : null;
}

async function resoudrePropositionAffectation(
  supabase: SupabaseClient,
  entrepriseId: string,
  peutGererPlanning: boolean,
  input: Record<string, unknown>,
): Promise<PropositionAffectation | null> {
  if (!peutGererPlanning) return null;
  const champs = analyserChampsAffectation(input);
  if (!champs) return null;
  const brutIds = Array.isArray(input.employe_ids) ? input.employe_ids : input.employe_id ? [input.employe_id] : [];
  const employeIds = [...new Set(brutIds.map((v) => String(v)).filter(Boolean))];
  if (!employeIds.length) return null;

  const { data: employes } = await supabase.from("employes").select("id, nom, prenom").in("id", employeIds).eq("entreprise_id", entrepriseId);
  if (!employes || employes.length !== employeIds.length) return null;
  // Meme ordre que celui demande, pour un affichage previsible dans la carte de proposition.
  const employesParId = new Map(employes.map((e) => [e.id, e]));
  const employeNoms = employeIds.map((id) => { const e = employesParId.get(id)!; return `${e.prenom} ${e.nom}`; });

  let chantierId: string | null = null;
  let chantierNom: string | null = null;
  if (champs.typeActivite === "chantier") {
    chantierId = String(input.chantier_id ?? "");
    if (!chantierId) return null;
    const { data: chantier } = await supabase.from("chantiers").select("nom").eq("id", chantierId).eq("entreprise_id", entrepriseId).maybeSingle();
    if (!chantier) return null;
    chantierNom = chantier.nom;
  }

  const conflits = await Promise.all(employeIds.map((id) => detecterConflitChantier(supabase, entrepriseId, id, champs.date, champs.typeActivite, chantierId, null)));
  const avertissementsConflit = employeIds.map((id, i) => (conflits[i] ? `${employesParId.get(id)!.prenom} : ${conflits[i]}` : null)).filter((v): v is string => Boolean(v));
  const avertissement = [champs.commentaireModele, ...avertissementsConflit].filter(Boolean).join(" ") || null;

  return {
    affectationId: null,
    employeIds,
    employeNoms,
    typeActivite: champs.typeActivite,
    chantierId: champs.typeActivite === "chantier" ? chantierId : null,
    chantierNom: champs.typeActivite === "chantier" ? chantierNom : null,
    lieuActivite: champs.typeActivite === "chantier" ? null : champs.lieuActivite,
    date: champs.date,
    heures: champs.heures,
    tache: champs.tache,
    avertissement,
  };
}

// Cible une affectation deja existante (contrairement a resoudrePropositionAffectation qui en
// cree de nouvelles) : le seul moyen d'eviter qu'une demande de correction n'aboutisse a un
// doublon (l'ancienne ET la nouvelle affectation actives en meme temps).
async function resoudrePropositionModificationAffectation(
  supabase: SupabaseClient,
  entrepriseId: string,
  peutGererPlanning: boolean,
  input: Record<string, unknown>,
): Promise<PropositionAffectation | null> {
  if (!peutGererPlanning) return null;
  const affectationId = String(input.affectation_id ?? "");
  if (!affectationId) return null;
  const { data: existante } = await supabase.from("affectations").select("employe:employes(id, nom, prenom)").eq("id", affectationId).eq("entreprise_id", entrepriseId).maybeSingle();
  if (!existante) return null;
  const employe = Array.isArray(existante.employe) ? existante.employe[0] : existante.employe;
  if (!employe) return null;

  const champs = analyserChampsAffectation(input);
  if (!champs) return null;

  let chantierId: string | null = null;
  let chantierNom: string | null = null;
  if (champs.typeActivite === "chantier") {
    chantierId = String(input.chantier_id ?? "");
    if (!chantierId) return null;
    const { data: chantier } = await supabase.from("chantiers").select("nom").eq("id", chantierId).eq("entreprise_id", entrepriseId).maybeSingle();
    if (!chantier) return null;
    chantierNom = chantier.nom;
  }

  const conflit = await detecterConflitChantier(supabase, entrepriseId, employe.id, champs.date, champs.typeActivite, chantierId, affectationId);
  const avertissement = [champs.commentaireModele, conflit].filter(Boolean).join(" ") || null;

  return {
    affectationId,
    employeIds: [employe.id],
    employeNoms: [`${employe.prenom} ${employe.nom}`],
    typeActivite: champs.typeActivite,
    chantierId: champs.typeActivite === "chantier" ? chantierId : null,
    chantierNom: champs.typeActivite === "chantier" ? chantierNom : null,
    lieuActivite: champs.typeActivite === "chantier" ? null : champs.lieuActivite,
    date: champs.date,
    heures: champs.heures,
    tache: champs.tache,
    avertissement,
  };
}

// Les demandes de conge sont toujours personnelles : contrairement a proposer_affectation,
// on ne prend jamais un employe_id fourni par le modele, on resout systematiquement la fiche
// liee a l'utilisateur qui parle (memes regles que creerDemandeCongeAction en saisie manuelle).
async function resoudrePropositionConge(
  supabase: SupabaseClient,
  entrepriseId: string,
  utilisateurId: string,
  input: Record<string, unknown>,
): Promise<PropositionConge | null> {
  const dateDebut = String(input.date_debut ?? "");
  const dateFin = String(input.date_fin ?? "");
  if (!dateDebut || !dateFin || dateFin < dateDebut) return null;

  const typeCongeBrut = typeof input.type_conge === "string" && input.type_conge ? input.type_conge : "conges_payes";
  if (!(TYPES_CONGE as readonly string[]).includes(typeCongeBrut)) return null;
  const demiJourDebutBrut = typeof input.demi_jour_debut === "string" && input.demi_jour_debut ? input.demi_jour_debut : "journee";
  const demiJourFinBrut = typeof input.demi_jour_fin === "string" && input.demi_jour_fin ? input.demi_jour_fin : "journee";
  if (!(DEMI_JOURNEES as readonly string[]).includes(demiJourDebutBrut) || !(DEMI_JOURNEES as readonly string[]).includes(demiJourFinBrut)) return null;

  const { data: employe } = await supabase.from("employes").select("id, nom, prenom").eq("entreprise_id", entrepriseId).eq("utilisateur_id", utilisateurId).maybeSingle();
  if (!employe) return null;

  return {
    employeId: employe.id,
    employeNom: `${employe.prenom} ${employe.nom}`,
    typeConge: typeCongeBrut as TypeConge,
    dateDebut,
    dateFin,
    demiJourDebut: demiJourDebutBrut as DemiJournee,
    demiJourFin: demiJourFinBrut as DemiJournee,
    commentaire: typeof input.commentaire === "string" && input.commentaire.trim() ? input.commentaire.trim() : null,
  };
}

// Exactement une destination (collegue OU chantier) : l'ecriture reelle est de toute facon
// protegee par la RLS de conversations_internes/messages_internes (appartenance a la
// conversation, ou gerer_messagerie/equipe du chantier pour un fil chantier).
async function resoudrePropositionMessageInterne(
  supabase: SupabaseClient,
  entrepriseId: string,
  input: Record<string, unknown>,
): Promise<PropositionMessageInterne | null> {
  const contenu = typeof input.contenu === "string" ? input.contenu.trim() : "";
  const destinataireEmployeId = typeof input.destinataire_employe_id === "string" && input.destinataire_employe_id ? input.destinataire_employe_id : null;
  const chantierId = typeof input.chantier_id === "string" && input.chantier_id ? input.chantier_id : null;
  if (!contenu || !(Boolean(destinataireEmployeId) !== Boolean(chantierId))) return null;

  if (destinataireEmployeId) {
    const { data: employe } = await supabase.from("employes").select("nom, prenom").eq("id", destinataireEmployeId).eq("entreprise_id", entrepriseId).maybeSingle();
    if (!employe) return null;
    return { destinataireEmployeId, destinataireEmployeNom: `${employe.prenom} ${employe.nom}`, chantierId: null, chantierNom: null, contenu };
  }

  const { data: chantier } = await supabase.from("chantiers").select("nom").eq("id", chantierId as string).eq("entreprise_id", entrepriseId).maybeSingle();
  if (!chantier) return null;
  return { destinataireEmployeId: null, destinataireEmployeNom: null, chantierId, chantierNom: chantier.nom, contenu };
}

function resoudrePropositionMessageSupport(input: Record<string, unknown>): PropositionMessageSupport | null {
  const contenu = typeof input.contenu === "string" ? input.contenu.trim() : "";
  if (!contenu) return null;
  return { contenu };
}

const TYPES_LIGNE_CLES: readonly string[] = LIGNE_TYPES.map((t) => t.cle);

// Découvert en recette réelle : avec `strict: false` côté provider (src/lib/ai/providers/
// openai.ts), l'enum du paramètre `type` n'est qu'indicatif, pas imposé par l'API — le modèle
// a renvoyé une casse différente ("Fourniture" au lieu de "fourniture") sur TOUTES les lignes
// d'une même proposition, faisant tomber silencieusement les trois dans le repli "forfait"
// (correspondance exacte sensible à la casse). Une comparaison insensible à la casse/espaces
// suffit à couvrir ce cas sans risquer d'accepter une valeur réellement hors-liste.
function cleLigneNormalisee(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const normalisee = valeur.trim().toLowerCase();
  return TYPES_LIGNE_CLES.find((cle) => cle === normalisee) ?? null;
}
const MAX_LIGNES_PROPOSITION_DEVIS = 40;

// IA-DEVIS-V1 : construit la proposition de devis à partir de l'appel outil du modèle.
// Contrairement a resoudrePropositionAffectation (qui refuse tout input mal forme), on
// tolere les valeurs hors-liste sur type/unite/taux_tva en les ramenant a une valeur par
// defaut sure (meme logique de tolerance que genererLignesDevisIA, src/lib/ai/devis.ts) —
// mais JAMAIS sur le prix ou la quantite, qui sont soit valides, soit la ligne est rejetee :
// une quantite ou un prix invente serait une donnee metier fausse presentee comme reelle,
// alors qu'un type/unite/TVA par defaut reste visible et corrigible avant confirmation.
// Exportee (contrairement aux autres resolveurs de ce fichier, prives) pour un test unitaire
// dedie — cf. IA-DEVIS-V1 §53, logique de tolerance/rejet nouvelle et significative.
export async function resoudrePropositionDevis(
  supabase: SupabaseClient,
  entrepriseId: string,
  peutGererDevis: boolean,
  input: Record<string, unknown>,
): Promise<PropositionDevis | null> {
  if (!peutGererDevis) return null;

  const clientId = typeof input.client_id === "string" ? input.client_id.trim() : "";
  if (!clientId) return null;
  const { data: client } = await supabase
    .from("clients")
    .select("nom, prenom, societe")
    .eq("id", clientId)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  if (!client) return null;
  const clientNom = client.societe || [client.prenom, client.nom].filter(Boolean).join(" ") || "Client";

  const objet = typeof input.objet === "string" ? input.objet.trim().slice(0, 200) : "";
  if (!objet) return null;

  const lignesBrutes = Array.isArray(input.lignes) ? input.lignes : [];
  const lignes: LigneProposeeDevis[] = [];
  for (const brut of lignesBrutes.slice(0, MAX_LIGNES_PROPOSITION_DEVIS)) {
    if (typeof brut !== "object" || brut === null) continue;
    const l = brut as Record<string, unknown>;
    const designation = typeof l.designation === "string" ? l.designation.trim().slice(0, 200) : "";
    if (!designation) continue;
    const quantite = Number(l.quantite);
    if (!Number.isFinite(quantite) || quantite <= 0) continue;
    const prixBrut = l.prix_unitaire_ht;
    const prixUnitaireHt = typeof prixBrut === "number" && Number.isFinite(prixBrut) && prixBrut >= 0 ? prixBrut : null;
    const sourcePrixBrut = typeof l.source_prix === "string" ? l.source_prix : "absent";
    lignes.push({
      designation,
      description: typeof l.description === "string" && l.description.trim() ? l.description.trim() : null,
      type: cleLigneNormalisee(l.type) ?? "forfait",
      quantite,
      unite: (UNITES as readonly string[]).includes(l.unite as string) ? (l.unite as string) : "u",
      // Aucun prix trouvable ne doit jamais se retrouver marqué "catalogue"/"historique" sans
      // valeur associée — sinon la carte de proposition afficherait une fausse source pour un
      // champ vide (§6/§7 : ne jamais faire passer une estimation pour un prix enregistré).
      prixUnitaireHt,
      sourcePrix: prixUnitaireHt === null ? "absent" : sourcePrixBrut === "catalogue" || sourcePrixBrut === "historique" ? sourcePrixBrut : "absent",
      tauxTva: (TAUX_TVA as readonly number[]).includes(Number(l.taux_tva)) ? Number(l.taux_tva) : 20,
      remiseLigne: Math.min(100, Math.max(0, Number(l.remise_ligne) || 0)),
    });
  }
  if (!lignes.length) return null;

  const hypotheses = (Array.isArray(input.hypotheses) ? input.hypotheses : [])
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .map((h) => h.trim().slice(0, 300))
    .slice(0, 20);

  const notesClient = typeof input.notes_client === "string" && input.notes_client.trim() ? input.notes_client.trim().slice(0, 2000) : null;
  const commentaire = typeof input.commentaire === "string" && input.commentaire.trim() ? input.commentaire.trim() : null;

  return { clientId, clientNom, objet, lignes, hypotheses, notesClient, avertissement: commentaire };
}

async function decrireUtilisateurCourant(supabase: SupabaseClient, entrepriseId: string, utilisateurId: string, prenomCompte: string | null): Promise<string> {
  const { data: employe } = await supabase
    .from("employes")
    .select("nom, prenom, poste")
    .eq("entreprise_id", entrepriseId)
    .eq("utilisateur_id", utilisateurId)
    .maybeSingle();
  if (employe) {
    return `Tu parles avec ${employe.prenom} ${employe.nom} (poste : ${employe.poste}). ` + `Cette personne EST cet employé : ne lui demande jamais son identité, tu la connais déjà. `;
  }

  // Pas de fiche employe (planning/pointage) liee, mais le compte lui-meme a un nom et un
  // poste d'acces connus : autant s'en servir plutot que de pretendre ne rien savoir.
  const [{ data: profil }, { data: appartenance }] = await Promise.all([
    supabase.from("utilisateurs").select("nom").eq("id", utilisateurId).maybeSingle(),
    supabase.from("utilisateurs_entreprises").select("poste:postes(nom)").eq("utilisateur_id", utilisateurId).eq("entreprise_id", entrepriseId).eq("statut", "actif").maybeSingle(),
  ]);
  const poste = appartenance?.poste as { nom: string } | { nom: string }[] | null;
  const nomPoste = Array.isArray(poste) ? poste[0]?.nom : poste?.nom;
  const nomComplet = [prenomCompte, profil?.nom].filter(Boolean).join(" ");

  return (
    (nomComplet ? `Tu parles avec ${nomComplet}${nomPoste ? ` (poste : ${nomPoste})` : ""}. Ne lui demande jamais son identite, tu la connais deja. ` : "") +
    `Cette personne n'a pas encore de fiche employe liee a son compte (distincte de son identite de connexion). ` +
    `Si la question porte sur son propre planning, pointage, conges ou notes de frais, indique-lui d'aller dans "Mon espace" puis de cliquer sur "Creer ma fiche employe". `
  );
}

/**
 * Boucle agentique streamée : émet les morceaux de texte au fil de l'eau, exécute les
 * outils de lecture, et s'arrête dès que l'IA appelle un outil terminal (`proposer_affectation`,
 * `proposer_modification_affectation`, `proposer_demande_conge`, `proposer_message_interne`,
 * `proposer_message_support`, `proposer_devis` — IA-DEVIS-V1) — jamais d'écriture en base
 * directe, la proposition est renvoyée pour validation manuelle.
 */
export async function* demanderAssistantIAStream(
  supabase: SupabaseClient,
  entrepriseId: string,
  entrepriseNom: string,
  utilisateurId: string,
  prenomCompte: string | null,
  peutGererPlanning: boolean,
  peutGererDevis: boolean,
  devisIAActif: boolean,
  permissions: string[] | null,
  historique: MessageChat[],
): AsyncGenerator<EvenementAssistant, UsageIA | undefined, unknown> {
  const provider = obtenirProviderIA();
  const outilsDisponibles = devisIAActif
    ? outilsAutorisesCopilote(permissions)
    : outilsAutorisesCopilote(permissions).filter((o) => !(NOMS_OUTILS_IA_DEVIS as readonly string[]).includes(o.nom));
  // Cumule l'usage de chaque tour d'outils (jusqu'a MAX_TOURS_OUTILS appels au provider) :
  // AI-LAUNCH-V1B, cf. journal_ia — avant ce lot, aucun appel a journaliserAppelIA ne
  // transmettait de donnees de jetons/cout, malgre la documentation qui le laissait entendre.
  const usageCumule: UsageIA = { jetonsEntree: 0, jetonsSortie: 0, jetonsTotal: 0, coutEstimeHT: 0 };
  function cumuler(usage: UsageIA | undefined) {
    if (!usage) return;
    usageCumule.jetonsEntree += usage.jetonsEntree;
    usageCumule.jetonsSortie += usage.jetonsSortie;
    usageCumule.jetonsTotal += usage.jetonsTotal;
    usageCumule.coutEstimeHT += usage.coutEstimeHT;
  }
  const aujourdhui = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date());
  const descriptionUtilisateur = await decrireUtilisateurCourant(supabase, entrepriseId, utilisateurId, prenomCompte);

  const consigneAffectation = peutGererPlanning
    ? `Pour TOUTE demande qui occupe le temps de N'IMPORTE QUEL employé un jour donné — chantier, bureau, dépôt, visite médicale, formation, absence/congé posé directement, repas d'affaires, rendez-vous, réunion externe, chantier pas encore enregistré, ou n'importe quoi d'autre — utilise proposer_affectation, y compris pour d'autres personnes que l'utilisateur (ex. une secrétaire qui remplit le planning d'un collègue) : cette personne a le droit de modifier le planning de tout le monde, donc pas besoin d'approbation, l'affectation est effective dès validation. ` +
      `N'invente jamais de procédure manuelle et ne dis jamais que tu ne peux pas le faire : prends le cas le plus proche (type_activite="autre" par défaut si aucun des autres types ne convient) plutôt que de refuser. ` +
      `Utilise chercher_employe (et chercher_chantier_planning si un chantier existant est cité) puis verifier_disponibilite_employe avant de conclure avec proposer_affectation — tu ne crées jamais d'affectation toi-même, tu ne fais que la proposer ; l'utilisateur valide ou non. ` +
      `Dès que type_activite n'est pas "chantier", mets dans lieu_activite exactement ce que l'utilisateur a dit sur le lieu/contexte (adresse, nom de lieu, avec qui) : un lien d'itinéraire est généré automatiquement à partir de ce texte, inutile de le reformuler ou de le structurer. ` +
      `Pour une absence/congé, tu peux utiliser proposer_affectation (type_activite="conge", effet immédiat) OU proposer_demande_conge (passe par une approbation) — préfère proposer_affectation puisque cette personne peut déjà valider elle-même ce genre de demande, sauf si elle précise vouloir la soumettre formellement. ` +
      `Pour un rendez-vous ou un entretien entre l'utilisateur et un employé nommé (ex. « place-moi un rendez-vous avec l'employé X »), l'affectation se place sur la fiche de l'employé nommé (X), jamais sur celle de l'utilisateur qui fait la demande. ` +
      `Si PLUSIEURS employés sont concernés par la même affectation (ex. « X et Y sont sur le chantier Dupont », une réunion à trois, une équipe entière) — cherche chaque employé cité puis fais UN SEUL appel à proposer_affectation avec tous leurs identifiants dans employe_ids ; ne fais jamais un appel séparé par personne. ` +
      `Corriger, déplacer ou remplacer une affectation qui existe déjà (visible via verifier_disponibilite_employe) : utilise proposer_modification_affectation, jamais proposer_affectation — sinon l'ancienne affectation reste active en même temps que la nouvelle et la personne se retrouve sur deux activités en même temps. ` +
      `Quand l'utilisateur demande de TROUVER un moment/créneau libre pour une ou plusieurs personnes (sans date précise déjà donnée), utilise d'abord proposer_creneaux_planning (après avoir cherché chaque employé cité) — ce produit ne gère pas d'heure précise, uniquement des dates avec un nombre d'heures disponibles ce jour-là, donc présente les résultats comme des JOURS (ex. "mercredi tu as de la marge avec les deux"), jamais un horaire inventé. Une fois qu'une date convient à l'utilisateur, termine avec proposer_affectation pour cette date. `
    : `Cette personne n'a pas le droit de modifier le planning (droit réservé à certains postes) : n'utilise jamais proposer_affectation, tu n'as accès à aucun outil d'écriture sur le planning des autres. ` +
      `Pour une absence/congé sur elle-même (« mets-moi absent », « je pose une demi-journée »…), utilise proposer_demande_conge — c'est le seul outil d'écriture qui lui est ouvert, et la demande sera soumise pour approbation à un responsable, jamais acceptée automatiquement. ` +
      `Pour toute autre demande de modification du planning (la sienne ou celle d'un collègue), explique que ce n'est pas possible avec ses droits actuels et qu'il faut passer par un responsable planning. `;

  const consigneDevis = !devisIAActif
    ? ""
    : peutGererDevis
      ? `Pour préparer un devis à partir d'une description en langage naturel, termine avec proposer_devis — jamais d'écriture directe, c'est une proposition que l'utilisateur devra valider. ` +
        `Avant cela : cherche le client via rechercher (si plusieurs correspondances homonymes, demande laquelle avant de continuer ; si aucune, dis-le clairement et ne propose rien). Pour chaque prestation distincte de la demande, une ligne séparée — ne fusionne jamais deux prestations différentes. ` +
        `Pour le prix de chaque ligne, dans l'ordre : rechercher_prestations_devis (source "catalogue") puis, seulement si rien trouvé, rechercher_prix_historique_devis (source "historique", à présenter comme basé sur un devis précédent, jamais comme un tarif certain) ; si aucune des deux ne donne de prix exploitable, laisse le prix vide (source "absent") — n'invente JAMAIS un prix de marché. ` +
        `Toute hypothèse que tu ajoutes toi-même (finition, épaisseur, méthode non précisée) doit aller dans hypotheses, jamais présentée comme fournie par l'utilisateur. Si la demande est trop vague pour être chiffrée, pose au maximum 2 à 4 questions prioritaires avant de proposer. ` +
        `Si l'utilisateur demande de modifier la proposition avant de valider (ex. "passe la cloison à 130 m²", "enlève la ligne plafond"), rappelle-toi les lignes déjà proposées et rappelle proposer_devis avec l'ensemble des lignes mises à jour (pas seulement la ligne modifiée). ` +
        `Le devis créé est toujours un brouillon : même si l'utilisateur dit "crée et envoie", précise que la création du brouillon est possible mais que l'envoi reste une action manuelle séparée depuis la fiche du devis. `
      : `Cette personne n'a pas le droit de gérer les devis : n'utilise jamais proposer_devis ni les outils de recherche de prix associés (rechercher_prestations_devis, rechercher_prix_historique_devis) — explique qu'il faut passer par un responsable devis. `;

  const system = construirePromptSystemeAssistant({
    entrepriseNom,
    aujourdhui,
    descriptionUtilisateur,
    consigneAffectation,
    consigneDevis,
  });

  const conversation: MessageIA[] = historique.map((m) =>
    m.role === "user" ? { role: "user", contenu: m.contenu, fichier: m.fichier } : { role: "assistant", contenu: m.contenu },
  );

  for (let tour = 0; tour < MAX_TOURS_OUTILS; tour++) {
    const flux = provider.streamer({ system, historique: conversation, outils: outilsDisponibles, maxTokens: 1500 });
    let texteTour = "";
    let resultat: ReponseCompletion = { texte: "", appelsOutils: [] };
    while (true) {
      const { value, done } = await flux.next();
      if (done) {
        resultat = value;
        break;
      }
      if (value.type === "texte") {
        texteTour += value.delta;
        yield { type: "texte", delta: value.delta };
      }
    }
    cumuler(resultat.usage);

    if (resultat.appelsOutils.length === 0) return usageCumule;

    const appelAffectation = resultat.appelsOutils.find((a) => a.nom === "proposer_affectation");
    if (appelAffectation) {
      const proposition = await resoudrePropositionAffectation(supabase, entrepriseId, peutGererPlanning, appelAffectation.entree);
      if (proposition) {
        yield { type: "proposition", proposition };
      } else {
        const message = peutGererPlanning
          ? "\n\nJe n'ai pas pu identifier précisément l'employé ou le chantier, peux-tu préciser ?"
          : "\n\nTon poste n'a pas le droit de modifier le planning. Pour une absence te concernant, dis-le-moi directement (je peux soumettre une demande de congé pour approbation) ; sinon, il faut passer par un responsable planning.";
        yield { type: "texte", delta: message };
      }
      return usageCumule;
    }

    const appelModificationAffectation = resultat.appelsOutils.find((a) => a.nom === "proposer_modification_affectation");
    if (appelModificationAffectation) {
      const proposition = await resoudrePropositionModificationAffectation(supabase, entrepriseId, peutGererPlanning, appelModificationAffectation.entree);
      if (proposition) {
        yield { type: "proposition", proposition };
      } else {
        const message = peutGererPlanning
          ? "\n\nJe n'ai pas retrouvé cette affectation, peux-tu préciser laquelle modifier ?"
          : "\n\nTon poste n'a pas le droit de modifier le planning.";
        yield { type: "texte", delta: message };
      }
      return usageCumule;
    }

    const appelConge = resultat.appelsOutils.find((a) => a.nom === "proposer_demande_conge");
    if (appelConge) {
      const proposition = await resoudrePropositionConge(supabase, entrepriseId, utilisateurId, appelConge.entree);
      if (proposition) {
        yield { type: "proposition_conge", proposition };
      } else {
        const message = "\n\nJe n'ai pas pu préparer cette demande : vérifie les dates, et que tu as bien une fiche employé liée à ton compte (sinon, va dans « Mon espace » → « Créer ma fiche employé »).";
        yield { type: "texte", delta: message };
      }
      return usageCumule;
    }

    const appelMessageInterne = resultat.appelsOutils.find((a) => a.nom === "proposer_message_interne");
    if (appelMessageInterne) {
      const proposition = await resoudrePropositionMessageInterne(supabase, entrepriseId, appelMessageInterne.entree);
      if (proposition) {
        yield { type: "proposition_message_interne", proposition };
      } else {
        const message = "\n\nJe n'ai pas pu préparer ce message : précise soit un collègue, soit un chantier (jamais les deux), et un texte à envoyer.";
        yield { type: "texte", delta: message };
      }
      return usageCumule;
    }

    const appelMessageSupport = resultat.appelsOutils.find((a) => a.nom === "proposer_message_support");
    if (appelMessageSupport) {
      const proposition = resoudrePropositionMessageSupport(appelMessageSupport.entree);
      if (proposition) {
        yield { type: "proposition_message_support", proposition };
      } else {
        const message = "\n\nJe n'ai pas pu préparer ce message : quel est le texte à envoyer au support ?";
        yield { type: "texte", delta: message };
      }
      return usageCumule;
    }

    const appelDevis = devisIAActif ? resultat.appelsOutils.find((a) => a.nom === "proposer_devis") : undefined;
    if (appelDevis) {
      const proposition = await resoudrePropositionDevis(supabase, entrepriseId, peutGererDevis, appelDevis.entree);
      if (proposition) {
        yield { type: "proposition_devis", proposition };
      } else {
        const message = peutGererDevis
          ? "\n\nJe n'ai pas pu préparer ce devis : vérifie qu'un client a bien été identifié et qu'au moins une ligne valide (désignation et quantité) est proposée."
          : "\n\nTon poste n'a pas le droit de gérer les devis. Il faut passer par un responsable devis.";
        yield { type: "texte", delta: message };
      }
      return usageCumule;
    }

    conversation.push({ role: "assistant", contenu: texteTour, appelsOutils: resultat.appelsOutils });
    for (const appel of resultat.appelsOutils) {
      const resultatOutil = await executerOutilCopilote(supabase, entrepriseId, permissions, appel.nom, appel.entree);
      conversation.push({ role: "outil", appelId: appel.id, resultat: JSON.stringify(resultatOutil) });
    }
  }

  yield { type: "texte", delta: "\n\nJe n'arrive pas à te répondre pour l'instant : reformule ta question plus précisément." };
  return usageCumule;
}
