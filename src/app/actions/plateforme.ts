"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { ERREUR_CONFIGURATION_URL_AUTH, urlCallbackReinitialisation } from "@/lib/auth-redirects";
import { appliquerCouponAbonnement, creerCouponRemise, recupererAbonnementStripe, retirerCouponAbonnement, TYPES_REMISE, DUREES_REMISE, type DureeRemise, type TypeRemise } from "@/lib/stripe-abonnement";

export async function modifierAbonnementAction(entrepriseId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) {
    redirect("/dashboard");
  }
  const statut = String(formData.get("statut") ?? "essai");
  const echeance = String(formData.get("echeance") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    // Mode prototype : mise à jour directe (l'admin plateforme réel passe par la RPC).
    await supabase
      .from("entreprises")
      .update({ abonnement_statut: statut, abonnement_echeance: echeance, abonnement_note: note, updated_at: new Date().toISOString() })
      .eq("id", entrepriseId);
  } else {
    const { error } = await supabase.rpc("plateforme_modifier_abonnement", {
      p_entreprise_id: entrepriseId,
      p_statut: statut,
      p_echeance: echeance,
      p_note: note,
    });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/plateforme");
  redirect("/plateforme?succes=1");
}

export async function creerEntreprisePlateformeAction(formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");
  const nom=String(formData.get("nom")??"").trim(),siret=String(formData.get("siret")??"").trim()||null,ville=String(formData.get("ville")??"").trim()||null;
  if(!nom)redirect(`/plateforme?error=${encodeURIComponent("Nom obligatoire")}`);
  const supabase=await createClient();
  if(isEmailLoginDisabled()){
    const{data:entreprise,error}=await supabase.from("entreprises").insert({nom,raison_sociale:nom,siret,ville,abonnement_statut:"essai",abonnement_note:"Créée par la plateforme"}).select("id").single();
    if(error||!entreprise)redirect(`/plateforme?error=${encodeURIComponent(error?.message??"Création impossible")}`);
    const[{data:modeles,error:modelesError},{data:droits,error:droitsError}]=await Promise.all([
      supabase.from("modeles_roles_predefinis").select("cle,nom,permissions,tous_les_droits").order("ordre"),
      supabase.from("permissions_disponibles").select("cle"),
    ]);
    if(modelesError||droitsError||!modeles?.length||!droits?.length)redirect(`/plateforme?error=${encodeURIComponent(modelesError?.message??droitsError?.message??"Catalogue des rôles indisponible")}`);
    const{data:postes,error:postesError}=await supabase.from("postes").insert(modeles.map((modele)=>({entreprise_id:entreprise.id,nom:modele.nom,tarif_compte_mensuel:0}))).select("id,nom");
    if(postesError)redirect(`/plateforme?error=${encodeURIComponent(postesError.message)}`);
    const socle=new Set(["acces_planning","saisir_ses_notes_frais","demander_ses_conges","utiliser_borne_stock","acces_messagerie"]);
    const modelesParNom=new Map(modeles.map((modele)=>[modele.nom,modele]));
    const lignes=(postes??[]).flatMap((poste)=>{const modele=modelesParNom.get(poste.nom);const autorisations=new Set([...(modele?.permissions??[]),...socle]);return droits.map((droit)=>({entreprise_id:entreprise.id,poste_id:poste.id,cle_permission:droit.cle,autorise:droit.cle!=="mode_compte_depot"&&(modele?.tous_les_droits===true||autorisations.has(droit.cle))}));});
    const{error:permissionsError}=await supabase.from("permissions_poste").insert(lignes);
    if(permissionsError)redirect(`/plateforme?error=${encodeURIComponent(permissionsError.message)}`);
  }else{
    const{error}=await supabase.rpc("plateforme_creer_entreprise",{p_nom:nom,p_siret:siret,p_ville:ville});
    if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");redirect("/plateforme?succes=entreprise");
}

export async function ajouterAdminPlateformeAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nom = String(formData.get("nom") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "total").trim() || "total";
  if (!email || !email.includes("@")) redirect(`/plateforme?error=${encodeURIComponent("Email invalide")}`);
  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    const { error } = await supabase.from("plateforme_admins").upsert(
      { email, nom, role, utilisateur_id: null, actif: false, statut_identite: "en_attente" },
      { onConflict: "email" },
    );
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.rpc("plateforme_ajouter_admin", { p_email: email, p_nom: nom, p_role: role });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent(`Identité ${email} enregistrée en attente. Le rattachement UID, la vérification MFA et l’activation explicite restent obligatoires.`)}`);
}

export async function retirerAdminPlateformeAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect(`/plateforme?error=${encodeURIComponent("Email manquant")}`);
  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    const { error } = await supabase.from("plateforme_admins").delete().eq("email", email);
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.rpc("plateforme_retirer_admin", { p_email: email });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent(`${email} révoqué de l'équipe plateforme`)}`);
}

export async function modifierTarifPostePlateformeAction(posteId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const codeOffre = String(formData.get("code_offre") ?? "standard").trim() || "standard";
  const tarif = Number(String(formData.get("tarif") ?? "0").replace(",", "."));
  if (!Number.isFinite(tarif) || tarif < 0) redirect(`/plateforme?error=${encodeURIComponent("Tarif invalide")}`);
  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    const { error } = await supabase.from("postes").update({ code_offre: codeOffre, tarif_compte_mensuel: tarif }).eq("id", posteId);
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.rpc("plateforme_modifier_tarif_poste", { p_poste_id: posteId, p_code_offre: codeOffre, p_tarif: tarif });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent("Tarif du poste mis à jour")}`);
}

export async function genererSnapshotFacturationAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const retourBrut = String(formData.get("retour") ?? "/plateforme");
  const retour = retourBrut.startsWith("/plateforme") && !retourBrut.startsWith("//") ? retourBrut : "/plateforme";
  if (isEmailLoginDisabled()) redirect(`${retour}${retour.includes("?") ? "&" : "?"}error=${encodeURIComponent("Le relevé mensuel sécurisé sera disponible après activation des comptes personnels")}`);
  const moisSaisi = String(formData.get("mois") ?? "").trim();
  const mois = moisSaisi ? `${moisSaisi}-01` : new Date().toISOString().slice(0, 7) + "-01";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plateforme_snapshot_facturation", { p_mois: mois });
  if (error) redirect(`${retour}${retour.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plateforme");
  revalidatePath("/plateforme/facturation");
  redirect(`${retour}${retour.includes("?") ? "&" : "?"}succes=${encodeURIComponent(`${data ?? 0} compte(s) actualisé(s), dépassements d’appareils inclus`)}`);
}

export async function entrerEntreprisePlateformeAction(entrepriseId:string,formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");
  if(isEmailLoginDisabled())redirect(`/plateforme?error=${encodeURIComponent("L’accès support nécessite un compte plateforme authentifié")}`);
  const motif=String(formData.get("motif")??"").trim();
  if(motif.length<5)redirect(`/plateforme?error=${encodeURIComponent("Indiquez un motif d’intervention d’au moins 5 caractères")}`);
  const supabase=await createClient();
  const{error}=await supabase.rpc("plateforme_entrer_entreprise",{p_entreprise_id:entrepriseId,p_motif:motif});
  if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard");redirect("/dashboard");
}

export async function quitterEntreprisePlateformeAction(){
  const supabase=await createClient();
  const{error}=await supabase.rpc("plateforme_quitter_entreprise");
  if(error)redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plateforme");redirect("/plateforme");
}

// Réservé à l'administration de la plateforme : un gérant d'entreprise cliente n'a pas
// cette option, seulement le flux d'auto-service /mot-de-passe-oublie.
export async function reinitialiserMotDePassePlateformeAction(entrepriseId:string,formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");
  if(isEmailLoginDisabled())redirect(`/plateforme?error=${encodeURIComponent("Réinitialisation indisponible en mode prototype")}`);
  const email=String(formData.get("email")??"").trim().toLowerCase();
  const motif=String(formData.get("motif")??"").trim();
  if(!email)redirect(`/plateforme?error=${encodeURIComponent("Adresse e-mail obligatoire")}`);
  const redirectTo=urlCallbackReinitialisation();
  if(!redirectTo)redirect(`/plateforme?error=${encodeURIComponent(ERREUR_CONFIGURATION_URL_AUTH)}`);
  const supabase=await createClient();
  const{error:erreurVerification}=await supabase.rpc("plateforme_verifier_et_journaliser_reinitialisation",{p_entreprise_id:entrepriseId,p_email:email,p_motif:motif});
  if(erreurVerification)redirect(`/plateforme?error=${encodeURIComponent(erreurVerification.message)}`);
  const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  redirect(`/plateforme?succes=${encodeURIComponent(`Lien de réinitialisation envoyé à ${email}`)}`);
}

export async function signalerImpayePlateformeAction(entrepriseId:string,formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");
  const message=String(formData.get("message")??"").trim()||"Règlement mensuel non reçu";
  const supabase=await createClient();
  if(isEmailLoginDisabled()){
    const echeance=new Date(Date.now()+10*86400000).toISOString();
    const{error}=await supabase.from("entreprises").update({impaye_signale_at:new Date().toISOString(),suspension_prevue_at:echeance,impaye_message:message,updated_at:new Date().toISOString()}).eq("id",entrepriseId);
    if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }else{
    const{error}=await supabase.rpc("plateforme_signaler_impaye",{p_entreprise_id:entrepriseId,p_message:message});
    if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");redirect(`/plateforme?succes=${encodeURIComponent("Avertissement envoyé : suspension automatique dans 10 jours")}`);
}

export async function enregistrerReglementPlateformeAction(entrepriseId:string,formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");
  const note=String(formData.get("note")??"").trim()||"Règlement reçu";
  const supabase=await createClient();
  if(isEmailLoginDisabled()){
    const{error}=await supabase.from("entreprises").update({abonnement_statut:"actif",impaye_signale_at:null,suspension_prevue_at:null,impaye_message:null,dernier_reglement_at:new Date().toISOString(),abonnement_note:note,updated_at:new Date().toISOString()}).eq("id",entrepriseId);
    if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }else{
    const{error}=await supabase.rpc("plateforme_enregistrer_reglement",{p_entreprise_id:entrepriseId,p_note:note});
    if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");redirect(`/plateforme?succes=${encodeURIComponent("Règlement enregistré et accès rétabli")}`);
}

function descriptionRemise(type: TypeRemise, valeur: number, duree: DureeRemise, dureeMois?: number) {
  const montant = type === "montant" ? `${valeur.toLocaleString("fr-FR")} € HT` : `${valeur} %`;
  const periode = duree === "repeating" ? `pendant ${dureeMois} mois` : duree === "forever" ? "à vie" : "une fois";
  return `${montant} ${periode}`;
}

// Le champ `name` d'un coupon Stripe est plafonné à 40 caractères par l'API (rejet en erreur
// sinon, pas de troncature silencieuse côté Stripe — bug réel découvert en testant
// ABONNEMENTS-DETAIL-V1C avec un nom d'entreprise de 31 caractères : "RECETTE-ABONNEMENTS-V1C-CLIENT
// — 10 % à vie" fait 44 caractères et faisait échouer toute la création de coupon). La
// description (courte, porte l'information commerciale utile) est toujours conservée entière ;
// c'est le nom d'entreprise qui est tronqué si besoin.
function nomCouponRemise(nomEntreprise: string, description: string): string {
  const suffixe = ` — ${description}`;
  const maxNomEntreprise = 40 - suffixe.length;
  if (maxNomEntreprise <= 0) return description.slice(0, 40);
  const nomTronque = nomEntreprise.length > maxNomEntreprise ? `${nomEntreprise.slice(0, Math.max(0, maxNomEntreprise - 1))}…` : nomEntreprise;
  return `${nomTronque}${suffixe}`;
}

type CibleRemisePreautorisee = {
  entreprise_id: string;
  entreprise_nom: string;
  stripe_subscription_id: string | null;
  remise_stripe_coupon_id: string | null;
};

// Empreinte de l'INTENTION métier (opération, entreprise, abonnement ciblé, remise normalisée,
// état attendu avant l'action) — jamais d'un aléa par soumission (Date.now(), Math.random(),
// randomUUID() recréé à chaque appel).
//
// CORRECTIF (revue indépendante Codex sur 83466b2) : cette empreinte servait auparavant
// DIRECTEMENT de clé Stripe. Un même couple (abonnement, coupon) pouvant légitimement
// réapparaître deux fois dans la même fenêtre de 24h avec des issues différentes (application
// réelle, puis restauration par compensation après un échec SQL ultérieur, ou nouvelle
// application après compensation complète), Stripe pouvait renvoyer la réponse mémorisée de la
// PREMIÈRE occurrence sans rejouer la mutation réelle de la seconde — désynchronisant Stripe et
// Postgres. L'empreinte ne sert plus qu'à décider, côté Postgres
// (plateforme_preparer_tentative_effet_externe), si une nouvelle soumission est la même
// tentative technique qu'une tentative déjà en cours, ou une intention réellement nouvelle. La
// clé Stripe réelle est toujours dérivée d'une tentative durable (identifiant Postgres +
// génération), jamais recalculée depuis ces seuls paramètres.
function empreinteIntentionRemise(valeurs: Array<string | number | null | undefined>) {
  const separateur = String.fromCharCode(31);
  return createHash("sha256").update(valeurs.map((valeur) => String(valeur ?? "")).join(separateur)).digest("hex").slice(0, 40);
}

async function preautoriserRemise(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entrepriseId: string,
  operation: "remise_appliquer" | "remise_retirer",
) {
  const { data, error } = await supabase.rpc("plateforme_preautoriser_effet_externe", {
    p_entreprise_id: entrepriseId,
    p_operation: operation,
  });
  if (error) throw new Error(error.message);
  const cible = (Array.isArray(data) ? data[0] : data) as CibleRemisePreautorisee | null;
  if (!cible?.entreprise_id) throw new Error("Préautorisation de la remise refusée");
  return cible;
}

type EtatTentative =
  | "preparee"
  | "stripe_reussie"
  | "sql_reussie"
  | "compensation_requise"
  | "compensee"
  | "compensation_echouee"
  | "reconciliation_requise";

type TentativeEffetExterne = {
  tentative_id: string;
  operation_id: string;
  generation: number;
  cle_principale: string;
  cle_compensation: string | null;
  etat: EtatTentative;
  stripe_object_id: string | null;
  reutilisee: boolean;
};

// Seule source des clés Stripe : crée une tentative durable ou renvoie la tentative active
// existante pour cette entreprise+opération (même empreinte = même tentative technique, donc
// même clé — une intention différente ou une tentative précédente déjà pleinement convergée
// obtient une génération, donc une clé, nouvelle).
async function preparerTentative(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entrepriseId: string,
  operation: "remise_appliquer" | "remise_retirer",
  empreinte: string,
  operationId: string,
): Promise<TentativeEffetExterne> {
  const { data, error } = await supabase.rpc("plateforme_preparer_tentative_effet_externe", {
    p_entreprise_id: entrepriseId,
    p_operation: operation,
    p_empreinte: empreinte,
    p_operation_id: operationId,
  });
  if (error) throw new Error(error.message);
  const tentative = (Array.isArray(data) ? data[0] : data) as TentativeEffetExterne | null;
  if (!tentative?.tentative_id) throw new Error("Préparation de la tentative refusée");
  return tentative;
}

const UUID_OPERATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPLAY_OPERATION_REUSSIE = Symbol("replay-operation-reussie");

function lireOperationId(formData: FormData) {
  const operationId = String(formData.get("operation_id") ?? "").trim();
  if (!UUID_OPERATION.test(operationId)) redirect(`/plateforme?error=${encodeURIComponent("Identifiant d’opération invalide")}`);
  return operationId;
}

function estSuccesTerminal(tentative: TentativeEffetExterne) {
  if (tentative.etat === "sql_reussie") return true;
  if (tentative.etat === "preparee" || tentative.etat === "stripe_reussie") return false;
  throw new Error(`L’opération ${tentative.operation_id} est terminée en état ${tentative.etat} et ne peut pas être rejouée automatiquement`);
}

async function marquerStripeReussie(supabase: Awaited<ReturnType<typeof createClient>>, tentativeId: string, stripeObjectId: string) {
  const { error } = await supabase.rpc("plateforme_marquer_tentative_stripe_reussie", { p_tentative_id: tentativeId, p_stripe_object_id: stripeObjectId });
  if (error) throw new Error(error.message);
}

async function marquerSqlReussie(supabase: Awaited<ReturnType<typeof createClient>>, tentativeId: string) {
  const { error } = await supabase.rpc("plateforme_marquer_tentative_sql_reussie", { p_tentative_id: tentativeId });
  if (error) throw new Error(error.message);
}

async function marquerReconciliationRequise(supabase: Awaited<ReturnType<typeof createClient>>, tentativeId: string) {
  try {
    const { error } = await supabase.rpc("plateforme_marquer_tentative_reconciliation_requise", { p_tentative_id: tentativeId });
    return !error;
  } catch {
    return false;
  }
}

async function marquerCompensationRequise(supabase: Awaited<ReturnType<typeof createClient>>, tentativeId: string): Promise<string> {
  const { data, error } = await supabase.rpc("plateforme_marquer_tentative_compensation_requise", { p_tentative_id: tentativeId });
  if (error) throw new Error(error.message);
  return data as string;
}

async function marquerCompensationResolue(supabase: Awaited<ReturnType<typeof createClient>>, tentativeId: string, confirmee: boolean) {
  const { error } = await supabase.rpc("plateforme_marquer_tentative_compensation_resolue", { p_tentative_id: tentativeId, p_confirmee: confirmee });
  return !error;
}

// Confirmation par lecture réelle de l'abonnement plutôt que par la seule absence d'exception
// HTTP. Limite assumée : `discounts` (StripeSubscription) n'expose l'identifiant du coupon
// qu'après expansion Stripe, non vérifiable sans appel réel dans cette passe ; la confirmation
// porte donc sur la PRÉSENCE/ABSENCE d'une remise active, pas sur l'identité exacte du coupon.
async function confirmerPresenceRemise(subscriptionId: string, attendueActive: boolean): Promise<boolean> {
  const abonnement = await recupererAbonnementStripe(subscriptionId);
  const active = (abonnement.discounts?.length ?? 0) > 0;
  return active === attendueActive;
}

function messageEchecSynchronisation(messageSql: string, tentative: TentativeEffetExterne, confirmee: boolean | null) {
  const etatCompensation = confirmee === null ? "impossible à confirmer (réconciliation manuelle requise)" : confirmee ? "confirmée" : "échouée (réconciliation manuelle requise)";
  return `${messageSql}. Synchronisation Stripe : compensation ${etatCompensation}. Réf. tentative : ${tentative.tentative_id}.`;
}

// Geste commercial : coupon Stripe créé et appliqué sur l'abonnement de l'entreprise (base
// + comptes supplémentaires, au prorata — vérifié empiriquement, REMISES-CLIENTS-V1, voir
// docs/commercial/REMISES_CLIENTS_V1.md). Un seul à la fois (Stripe remplace automatiquement
// la remise précédente d'une même subscription). L'entreprise doit déjà avoir un abonnement
// Stripe Billing actif. Le motif interne n'est jamais transmis au client (cf. migration
// 20260823000223_remises_clients_v1.sql).
//
// Chaque appel Stripe (création du coupon, application sur l'abonnement, compensation) est
// ancré sur une tentative durable (plateforme_preparer_tentative_effet_externe) : la clé qui
// part vers Stripe n'est jamais recalculée depuis les seuls paramètres métier (cf. correctif
// documenté sur empreinteIntentionRemise ci-dessus).
export async function appliquerRemiseAction(entrepriseId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const operationId = lireOperationId(formData);
  const type = String(formData.get("type") ?? "");
  const valeur = Number(formData.get("valeur"));
  const duree = String(formData.get("duree") ?? "");
  const dureeMoisBrut = Math.round(Number(formData.get("duree_mois")));
  const motifInterne = String(formData.get("motif_interne") ?? "").trim();
  if (!(TYPES_REMISE as readonly string[]).includes(type) || !(DUREES_REMISE as readonly string[]).includes(duree) || !valeur || valeur <= 0) {
    redirect(`/plateforme?error=${encodeURIComponent("Remise invalide")}`);
  }
  if (type === "pourcentage" && valeur > 100) redirect(`/plateforme?error=${encodeURIComponent("Un pourcentage ne peut pas dépasser 100")}`);
  if (!motifInterne) redirect(`/plateforme?error=${encodeURIComponent("Le motif interne est obligatoire")}`);
  // Validée ici (avant toute tentative Stripe) plutôt que de laisser `creerCouponRemise` la
  // lever après coup : un échec de validation pure ne doit jamais atterrir dans la phase
  // Stripe de la tentative, qui traite désormais toute exception comme une incertitude exigeant
  // une réconciliation manuelle (cf. marquerReconciliationRequise ci-dessous).
  if (duree === "repeating" && (!dureeMoisBrut || dureeMoisBrut < 1)) {
    redirect(`/plateforme?error=${encodeURIComponent("Le nombre de mois est obligatoire pour une remise limitée dans le temps")}`);
  }
  const dureeMois = duree === "repeating" ? dureeMoisBrut : undefined;

  const supabase = await createClient();
  if (isEmailLoginDisabled()) redirect(`/plateforme?error=${encodeURIComponent("Les remises Stripe exigent une session plateforme personnelle AAL2")}`);

  const description = descriptionRemise(type as TypeRemise, valeur, duree as DureeRemise, dureeMois);
  try {
    const cible = await preautoriserRemise(supabase, entrepriseId, "remise_appliquer");
    if (!cible.stripe_subscription_id) throw new Error("Cette entreprise n’a pas d’abonnement Stripe actif");

    // L'empreinte valide que le même operation_id conserve ses paramètres immuables. L'ancien
    // coupon est volontairement exclu : il change après le succès et casserait le replay exact.
    const empreinte = empreinteIntentionRemise([
      entrepriseId, cible.stripe_subscription_id, type, valeur.toFixed(2), duree, dureeMois ?? "", description,
      motifInterne,
    ]);
    const tentative = await preparerTentative(supabase, entrepriseId, "remise_appliquer", empreinte, operationId);

    if (estSuccesTerminal(tentative)) throw REPLAY_OPERATION_REUSSIE;
    if (tentative.reutilisee && tentative.etat === "preparee") {
      throw new Error(`L’opération ${operationId} est déjà en cours ; aucun nouvel appel Stripe n’a été émis`);
    }

    let couponId: string;
    if (tentative.reutilisee && tentative.etat === "stripe_reussie" && tentative.stripe_object_id) {
      // Stripe avait déjà confirmé cette tentative lors d'un essai précédent (seule la
      // mutation SQL restait à rejouer) : ne pas ré-émettre d'appel Stripe.
      couponId = tentative.stripe_object_id;
    } else {
      try {
        const coupon = await creerCouponRemise({
          type: type as TypeRemise, valeur, duree: duree as DureeRemise, dureeMois,
          nom: nomCouponRemise(cible.entreprise_nom, description),
          idempotence: `${tentative.cle_principale}:coupon`,
        });
        await appliquerCouponAbonnement(cible.stripe_subscription_id, coupon.id, `${tentative.cle_principale}:abonnement`);
        couponId = coupon.id;
        await marquerStripeReussie(supabase, tentative.tentative_id, couponId);
      } catch (err) {
        await marquerReconciliationRequise(supabase, tentative.tentative_id);
        throw err instanceof Error ? err : new Error("Remise Stripe impossible");
      }
    }

    const { error } = await supabase.rpc("plateforme_appliquer_remise", { p_entreprise_id: entrepriseId, p_coupon_id: couponId, p_description: description, p_motif_interne: motifInterne, p_duree_mois: dureeMois ?? null, p_type: type, p_valeur: valeur });
    if (error) {
      const cleCompensation = await marquerCompensationRequise(supabase, tentative.tentative_id);
      let confirmee: boolean | null = null;
      try {
        if (cible.remise_stripe_coupon_id) {
          // Restaure l'ancien coupon (antérieur à cette tentative) — clé de compensation
          // propre à CETTE tentative, jamais celle, statique, de l'application d'origine.
          await appliquerCouponAbonnement(cible.stripe_subscription_id, cible.remise_stripe_coupon_id, cleCompensation);
        } else {
          await retirerCouponAbonnement(cible.stripe_subscription_id, cleCompensation);
        }
        confirmee = await confirmerPresenceRemise(cible.stripe_subscription_id, Boolean(cible.remise_stripe_coupon_id));
      } catch {
        confirmee = null;
      }
      const resolue = confirmee !== null && (await marquerCompensationResolue(supabase, tentative.tentative_id, confirmee));
      if (!resolue) await marquerReconciliationRequise(supabase, tentative.tentative_id);
      throw new Error(messageEchecSynchronisation(error.message, tentative, confirmee));
    }
    await marquerSqlReussie(supabase, tentative.tentative_id);
  } catch (err) {
    if (err === REPLAY_OPERATION_REUSSIE) {
      revalidatePath("/plateforme");
    } else {
    redirect(`/plateforme?error=${encodeURIComponent(err instanceof Error ? err.message : "Remise impossible")}`);
    }
  }

  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent(`Remise appliquée : ${description} · Réf. opération ${operationId}`)}`);
}

export async function retirerRemiseAction(entrepriseId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const operationId = lireOperationId(formData);
  const supabase = await createClient();
  if (isEmailLoginDisabled()) redirect(`/plateforme?error=${encodeURIComponent("Les remises Stripe exigent une session plateforme personnelle AAL2")}`);
  try {
    const cible = await preautoriserRemise(supabase, entrepriseId, "remise_retirer");
    // Le coupon courant disparaît précisément lors du succès et ne fait donc pas partie de
    // l'identité immuable de l'intention de retrait.
    const empreinte = empreinteIntentionRemise([entrepriseId, cible.stripe_subscription_id]);
    const tentative = await preparerTentative(supabase, entrepriseId, "remise_retirer", empreinte, operationId);

    if (estSuccesTerminal(tentative)) throw REPLAY_OPERATION_REUSSIE;
    if (tentative.reutilisee && tentative.etat === "preparee") {
      throw new Error(`L’opération ${operationId} est déjà en cours ; aucun nouvel appel Stripe n’a été émis`);
    }

    if (!(tentative.reutilisee && tentative.etat === "stripe_reussie")) {
      if (cible.stripe_subscription_id && cible.remise_stripe_coupon_id) {
        try {
          await retirerCouponAbonnement(cible.stripe_subscription_id, `${tentative.cle_principale}:retrait`);
          await marquerStripeReussie(supabase, tentative.tentative_id, cible.remise_stripe_coupon_id);
        } catch (err) {
          await marquerReconciliationRequise(supabase, tentative.tentative_id);
          throw err instanceof Error ? err : new Error("Retrait Stripe impossible");
        }
      } else {
        // Rien à retirer côté Stripe (déjà vide) : la tentative avance directement vers la
        // mutation SQL, sans appel Stripe ni risque de désynchronisation possible.
        await marquerStripeReussie(supabase, tentative.tentative_id, "");
      }
    }

    const { error } = await supabase.rpc("plateforme_retirer_remise", { p_entreprise_id: entrepriseId });
    if (error) {
      if (!cible.stripe_subscription_id || !cible.remise_stripe_coupon_id) {
        // Rien n'a été retiré côté Stripe avant l'échec SQL : aucune compensation Stripe à
        // effectuer, la tentative est trivialement convergée.
        await marquerCompensationRequise(supabase, tentative.tentative_id);
        await marquerCompensationResolue(supabase, tentative.tentative_id, true);
        throw new Error(messageEchecSynchronisation(error.message, tentative, true));
      }
      const cleCompensation = await marquerCompensationRequise(supabase, tentative.tentative_id);
      let confirmee: boolean | null = null;
      try {
        // Restaure le coupon retiré — clé de compensation propre à CETTE tentative, jamais la
        // clé statique (subscription, coupon) qui a servi à l'application d'origine du coupon :
        // sa réutilisation ici renverrait la réponse mémorisée de cette application d'origine
        // sans rejouer la restauration (c'est précisément le scénario B signalé par la revue).
        await appliquerCouponAbonnement(cible.stripe_subscription_id, cible.remise_stripe_coupon_id, cleCompensation);
        confirmee = await confirmerPresenceRemise(cible.stripe_subscription_id, true);
      } catch {
        confirmee = null;
      }
      const resolue = confirmee !== null && (await marquerCompensationResolue(supabase, tentative.tentative_id, confirmee));
      if (!resolue) await marquerReconciliationRequise(supabase, tentative.tentative_id);
      throw new Error(messageEchecSynchronisation(error.message, tentative, confirmee));
    }
    await marquerSqlReussie(supabase, tentative.tentative_id);
  } catch (err) {
    if (err === REPLAY_OPERATION_REUSSIE) {
      revalidatePath("/plateforme");
    } else {
    redirect(`/plateforme?error=${encodeURIComponent(err instanceof Error ? err.message : "Suppression impossible")}`);
    }
  }
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent(`Remise retirée · Réf. opération ${operationId}`)}`);
}
