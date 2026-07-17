"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { permissionsUtilisateur } from "@/lib/permissions";
import {
  bicEstValide,
  chiffrerDonneeBancaire,
  dechiffrerDonneeBancaire,
  empreinteIban,
  finIban,
  ibanEstValide,
  initierLotPowens,
  normaliserBic,
  normaliserIban,
  obtenirPaiementPowens,
  powensEstConfigure,
  type OrdrePrestataireBancaire,
} from "@/lib/banking";

const chemin = "/paiements-bancaires";
const texte = (formData: FormData, cle: string) => String(formData.get(cle) ?? "").trim();
const erreur = (message: string): never => redirect(`${chemin}?error=${encodeURIComponent(message)}`);
const succes = (message: string): never => redirect(`${chemin}?success=${encodeURIComponent(message)}`);
const retourAutorise = (formData: FormData) => {
  const retour = texte(formData, "retour");
  return retour.startsWith("/") && !retour.startsWith("//") && !retour.includes(":") ? retour : chemin;
};
const redirigerMessage = (retour: string, type: "error" | "success", message: string): never =>
  redirect(`${retour}${retour.includes("?") ? "&" : "?"}${type}=${encodeURIComponent(message)}`);

async function exigerPermission(permission: string) {
  const contexte = await getContexteEntreprise();
  if (contexte.accesSupportPlateforme) erreur("Les accès support plateforme ne peuvent jamais consulter ni initier les opérations bancaires d’un client");
  const droits = await permissionsUtilisateur(contexte);
  if (droits !== null && !droits.includes(permission)) erreur("Votre poste ne permet pas cette opération bancaire");
  return contexte;
}

export async function enregistrerRibAction(type: "employe" | "fournisseur", beneficiaireId: string, formData: FormData) {
  const retour = retourAutorise(formData);
  const contexte = await exigerPermission("gerer_coordonnees_bancaires");
  const iban = normaliserIban(texte(formData, "iban"));
  const bicBrut = texte(formData, "bic");
  const bic = bicBrut ? normaliserBic(bicBrut) : "";
  const titulaire = texte(formData, "titulaire");
  if (!titulaire) redirigerMessage(retour, "error", "Le titulaire du compte est obligatoire");
  if (!ibanEstValide(iban)) redirigerMessage(retour, "error", "L’IBAN est invalide");
  if (bic && !bicEstValide(bic)) redirigerMessage(retour, "error", "Le BIC est invalide");
  let ibanChiffre: string;
  let bicChiffre: string | null = null;
  try {
    ibanChiffre = chiffrerDonneeBancaire(iban);
    if (bic) bicChiffre = chiffrerDonneeBancaire(bic);
  } catch (cause) {
    redirigerMessage(retour, "error", cause instanceof Error ? cause.message : "Chiffrement bancaire indisponible");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("enregistrer_coordonnees_bancaires", {
    p_entreprise_id: contexte.entrepriseId,
    p_type: type,
    p_beneficiaire_id: beneficiaireId,
    p_titulaire: titulaire,
    p_iban_chiffre: ibanChiffre!,
    p_iban_hash: empreinteIban(iban),
    p_iban_quatre_derniers: finIban(iban),
    p_bic_chiffre: bicChiffre,
  });
  if (error) redirigerMessage(retour, "error", error.message);
  revalidatePath(chemin);
  revalidatePath(retour);
  redirigerMessage(retour, "success", "RIB enregistré et placé en attente de vérification");
}

export async function enregistrerRibDepuisFormAction(formData: FormData) {
  const [type, beneficiaireId] = texte(formData, "beneficiaire").split(":");
  if (!(["employe", "fournisseur"].includes(type)) || !/^[0-9a-f-]{36}$/i.test(beneficiaireId || "")) erreur("Sélectionnez un bénéficiaire");
  return enregistrerRibAction(type as "employe" | "fournisseur", beneficiaireId, formData);
}

export async function validerRibAction(ribId: string, accepte: boolean) {
  const contexte = await exigerPermission("valider_virements");
  const supabase = await createClient();
  const { error } = await supabase.rpc("valider_coordonnees_bancaires", {
    p_entreprise_id: contexte.entrepriseId,
    p_id: ribId,
    p_accepte: accepte,
    p_message: accepte ? null : "RIB rejeté par le valideur",
  });
  if (error) erreur(error.message);
  revalidatePath(chemin);
  succes(accepte ? "RIB vérifié" : "RIB rejeté");
}

export async function importerBulletinPaieAction(formData: FormData) {
  const contexte = await exigerPermission("gerer_paie");
  const employeId = texte(formData, "employe_id");
  const periodeSaisie = texte(formData, "periode");
  const montant = Number(texte(formData, "montant_net_a_payer"));
  const datePaiement = texte(formData, "date_paiement_prevue") || null;
  const reference = texte(formData, "reference_expert_comptable") || null;
  const entreeFichier = formData.get("bulletin");
  if (!(entreeFichier instanceof File) || entreeFichier.size === 0) return erreur("Sélectionnez le bulletin de paie PDF");
  const fichier = entreeFichier;
  if (fichier.size > 20 * 1024 * 1024) erreur("Le bulletin dépasse 20 Mo");
  const contenu = Buffer.from(await fichier.arrayBuffer());
  if (contenu.subarray(0, 5).toString("ascii") !== "%PDF-") erreur("Le fichier n’est pas un PDF valide");
  if (!/^\d{4}-\d{2}$/.test(periodeSaisie)) erreur("La période de paie est invalide");
  if (!Number.isFinite(montant) || montant <= 0) erreur("Le montant net à payer est invalide");
  const periode = `${periodeSaisie}-01`;
  const supabase = await createClient();
  const { data: employe } = await supabase.from("employes").select("id").eq("id", employeId).eq("entreprise_id", contexte.entrepriseId).maybeSingle();
  if (!employe) erreur("Salarié introuvable");
  const { data: versions } = await supabase.from("bulletins_paie").select("version").eq("entreprise_id", contexte.entrepriseId).eq("employe_id", employeId).eq("periode", periode).order("version", { ascending: false }).limit(1);
  const version = Number(versions?.[0]?.version ?? 0) + 1;
  const empreinte = createHash("sha256").update(contenu).digest("hex");
  const nomSain = fichier.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "bulletin.pdf";
  const storagePath = `${contexte.entrepriseId}/${employeId}/${periodeSaisie}/v${version}-${crypto.randomUUID()}-${nomSain}`;
  const { error: uploadError } = await supabase.storage.from("bulletins-paie").upload(storagePath, contenu, { contentType: "application/pdf", upsert: false });
  if (uploadError) erreur(uploadError.message);
  const { error: insertError } = await supabase.from("bulletins_paie").insert({
    entreprise_id: contexte.entrepriseId,
    employe_id: employeId,
    periode,
    version,
    montant_net_a_payer: montant,
    date_paiement_prevue: datePaiement,
    statut: "a_verifier",
    nom_fichier_original: fichier.name,
    type_mime: "application/pdf",
    taille_octets: fichier.size,
    empreinte_sha256: empreinte,
    storage_path: storagePath,
    reference_expert_comptable: reference,
    importe_par: contexte.userId,
  });
  if (insertError) {
    await supabase.storage.from("bulletins-paie").remove([storagePath]);
    erreur(insertError.message);
  }
  revalidatePath(chemin);
  succes("Bulletin importé. Le virement sera proposé après contrôle du bulletin et du RIB.");
}

export async function validerBulletinPaieAction(bulletinId: string, accepte: boolean) {
  const contexte = await exigerPermission("gerer_paie");
  const supabase = await createClient();
  const { error } = await supabase.rpc("valider_bulletin_paie", { p_entreprise_id: contexte.entrepriseId, p_bulletin_id: bulletinId, p_accepte: accepte });
  if (error) erreur(error.message);
  revalidatePath(chemin);
  succes(accepte ? "Bulletin validé et prêt pour la préparation du salaire" : "Bulletin annulé");
}

export async function activerPowensAction() {
  const contexte = await exigerPermission("executer_virements");
  if (!powensEstConfigure()) erreur("Les identifiants du contrat Powens doivent d’abord être configurés dans Vercel");
  const supabase = await createClient();
  const { error } = await supabase.from("connexions_bancaires").upsert({
    entreprise_id: contexte.entrepriseId,
    provider: "powens",
    environnement: process.env.POWENS_API_BASE_URL?.includes("sandbox") ? "test" : "production",
    statut: "pret",
    dernier_message: "Prestataire prêt ; chaque lot exigera une authentification bancaire forte.",
    active_par: contexte.userId,
    active_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) erreur(error.message);
  revalidatePath(chemin);
  succes("Prestataire bancaire Powens activé pour l’entreprise");
}

type SourceVirement = { type: "bulletin" | "note" | "depense"; id: string };

function sourcesSelectionnees(formData: FormData): SourceVirement[] {
  return formData.getAll("sources").flatMap((valeur) => {
    const [type, id] = String(valeur).split(":");
    return ["bulletin", "note", "depense"].includes(type) && /^[0-9a-f-]{36}$/i.test(id) ? [{ type: type as SourceVirement["type"], id }] : [];
  }).slice(0, 250);
}

export async function preparerLotVirementsAction(formData: FormData) {
  const contexte = await exigerPermission("preparer_virements");
  const sources = sourcesSelectionnees(formData);
  if (!sources.length) erreur("Sélectionnez au moins un paiement à préparer");
  const dateExecution = texte(formData, "date_execution") || new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const bulletinIds = sources.filter((s) => s.type === "bulletin").map((s) => s.id);
  const noteIds = sources.filter((s) => s.type === "note").map((s) => s.id);
  const depenseIds = sources.filter((s) => s.type === "depense").map((s) => s.id);
  const [{ data: bulletins }, { data: notes }, { data: depenses }, { data: ribs }] = await Promise.all([
    bulletinIds.length ? supabase.from("bulletins_paie").select("id,employe_id,montant_net_a_payer,periode,statut,employe:employes(prenom,nom)").eq("entreprise_id", contexte.entrepriseId).in("id", bulletinIds) : Promise.resolve({ data: [] }),
    noteIds.length ? supabase.from("notes_frais").select("id,employe_id,montant_ttc,reference,statut,employe:employes(prenom,nom)").eq("entreprise_id", contexte.entrepriseId).in("id", noteIds) : Promise.resolve({ data: [] }),
    depenseIds.length ? supabase.from("depenses_fournisseurs").select("id,fournisseur_id,montant_ttc,montant_regle,numero_piece,statut,fournisseur:fournisseurs(nom)").eq("entreprise_id", contexte.entrepriseId).in("id", depenseIds) : Promise.resolve({ data: [] }),
    supabase.from("coordonnees_bancaires").select("type_beneficiaire,employe_id,fournisseur_id,titulaire,iban_chiffre,iban_quatre_derniers,bic_chiffre,verification_statut").eq("entreprise_id", contexte.entrepriseId).eq("actif", true),
  ]);
  const ordreJson: Array<Record<string, string | number | null>> = [];
  const ribEmploye = new Map((ribs ?? []).filter((r) => r.employe_id).map((r) => [r.employe_id, r]));
  const ribFournisseur = new Map((ribs ?? []).filter((r) => r.fournisseur_id).map((r) => [r.fournisseur_id, r]));
  for (const bulletin of bulletins ?? []) {
    if (bulletin.statut !== "valide") erreur("Un bulletin sélectionné n’est pas validé");
    const rib = ribEmploye.get(bulletin.employe_id);
    if (!rib || rib.verification_statut !== "verifie") return erreur("Le RIB d’un salarié est absent ou non vérifié");
    const employe = Array.isArray(bulletin.employe) ? bulletin.employe[0] : bulletin.employe;
    ordreJson.push({ type_beneficiaire: "employe", employe_id: bulletin.employe_id, fournisseur_id: null, bulletin_paie_id: bulletin.id, note_frais_id: null, depense_fournisseur_id: null, titulaire: rib.titulaire, iban_chiffre: rib.iban_chiffre, iban_quatre_derniers: rib.iban_quatre_derniers, bic_chiffre: rib.bic_chiffre, montant: Number(bulletin.montant_net_a_payer), libelle: `Salaire ${String(bulletin.periode).slice(0, 7)} ${employe?.prenom ?? ""} ${employe?.nom ?? ""}`.trim() });
  }
  for (const note of notes ?? []) {
    if (!["valide", "validee", "exporte_comptabilite"].includes(note.statut)) erreur("Une note de frais sélectionnée n’est pas validée");
    const rib = ribEmploye.get(note.employe_id);
    if (!rib || rib.verification_statut !== "verifie") return erreur("Le RIB d’un salarié est absent ou non vérifié");
    ordreJson.push({ type_beneficiaire: "employe", employe_id: note.employe_id, fournisseur_id: null, bulletin_paie_id: null, note_frais_id: note.id, depense_fournisseur_id: null, titulaire: rib.titulaire, iban_chiffre: rib.iban_chiffre, iban_quatre_derniers: rib.iban_quatre_derniers, bic_chiffre: rib.bic_chiffre, montant: Number(note.montant_ttc), libelle: `Remboursement note ${note.reference || note.id.slice(0, 8)}` });
  }
  for (const depense of depenses ?? []) {
    if (!["a_payer", "payee_partiel"].includes(depense.statut)) erreur("Une facture fournisseur sélectionnée n’est plus payable");
    const rib = ribFournisseur.get(depense.fournisseur_id);
    if (!rib || rib.verification_statut !== "verifie") return erreur("Le RIB d’un fournisseur est absent ou non vérifié");
    ordreJson.push({ type_beneficiaire: "fournisseur", employe_id: null, fournisseur_id: depense.fournisseur_id, bulletin_paie_id: null, note_frais_id: null, depense_fournisseur_id: depense.id, titulaire: rib.titulaire, iban_chiffre: rib.iban_chiffre, iban_quatre_derniers: rib.iban_quatre_derniers, bic_chiffre: rib.bic_chiffre, montant: Number(depense.montant_ttc) - Number(depense.montant_regle), libelle: `Facture ${depense.numero_piece}` });
  }
  if (ordreJson.length !== sources.length) erreur("Une ou plusieurs sources sélectionnées sont introuvables ou déjà traitées");
  const types = new Set(sources.map((source) => source.type));
  const typeLot = types.size > 1 ? "mixte" : types.has("bulletin") ? "salaires" : types.has("note") ? "notes_frais" : "fournisseurs";
  const { error } = await supabase.rpc("creer_lot_virements", { p_entreprise_id: contexte.entrepriseId, p_type_lot: typeLot, p_date_execution: dateExecution, p_ordres: ordreJson });
  if (error) erreur(error.message);
  revalidatePath(chemin);
  succes("Lot préparé. Il doit maintenant être contrôlé puis validé avant toute transmission bancaire.");
}

export async function validerLotVirementsAction(lotId: string) {
  const contexte = await exigerPermission("valider_virements");
  const supabase = await createClient();
  const { error } = await supabase.rpc("valider_lot_virements", { p_entreprise_id: contexte.entrepriseId, p_lot_id: lotId });
  if (error) erreur(error.message);
  revalidatePath(chemin);
  succes("Lot validé. Aucune somme n’est encore partie tant que la validation bancaire n’est pas effectuée.");
}

export async function annulerLotVirementsAction(lotId: string) {
  const contexte = await getContexteEntreprise();
  if (contexte.accesSupportPlateforme) erreur("Les accès support plateforme ne peuvent jamais agir sur les virements d’un client");
  const droits = await permissionsUtilisateur(contexte);
  if (droits !== null && !droits.some((droit) => ["preparer_virements", "valider_virements"].includes(droit))) erreur("Votre poste ne permet pas d’annuler ce lot");
  const supabase = await createClient();
  const { error } = await supabase.rpc("annuler_lot_virements", { p_entreprise_id: contexte.entrepriseId, p_lot_id: lotId });
  if (error) erreur(error.message);
  revalidatePath(chemin);
  succes("Lot annulé ; les sources peuvent être préparées dans un nouveau lot");
}

export async function transmettreLotPowensAction(lotId: string) {
  const contexte = await exigerPermission("executer_virements");
  if (!powensEstConfigure()) erreur("Le contrat Powens et ses clés doivent être configurés avant l’envoi");
  const supabase = await createClient();
  const [{ data: lot }, { data: connexion }, { data: entreprise }, { data: ordres }] = await Promise.all([
    supabase.from("lots_virements").select("id,statut,date_execution").eq("id", lotId).eq("entreprise_id", contexte.entrepriseId).maybeSingle(),
    supabase.from("connexions_bancaires").select("statut").eq("entreprise_id", contexte.entrepriseId).eq("provider", "powens").maybeSingle(),
    supabase.from("entreprises").select("nom,raison_sociale,siret,forme_juridique").eq("id", contexte.entrepriseId).maybeSingle(),
    supabase.from("ordres_virements").select("id,type_beneficiaire,employe_id,fournisseur_id,montant,libelle,titulaire,iban_chiffre,bulletin_paie_id,note_frais_id,depense_fournisseur_id,employe:employes(prenom,nom),fournisseur:fournisseurs(siret)").eq("lot_id", lotId).eq("entreprise_id", contexte.entrepriseId),
  ]);
  if (!lot || lot.statut !== "valide") return erreur("Le lot doit être validé avant transmission");
  if (!connexion || !["pret", "actif"].includes(connexion.statut)) erreur("Activez d’abord le prestataire bancaire Powens");
  if (!entreprise?.siret) return erreur("Renseignez le SIRET de l’entreprise dans les paramètres");
  if (!entreprise.forme_juridique) return erreur("Renseignez la forme juridique de l’entreprise dans les paramètres");
  let instructions: OrdrePrestataireBancaire[];
  try {
    instructions = (ordres ?? []).map((ordre) => {
      const employe = Array.isArray(ordre.employe) ? ordre.employe[0] : ordre.employe;
      const fournisseur = Array.isArray(ordre.fournisseur) ? ordre.fournisseur[0] : ordre.fournisseur;
      return { id: ordre.id, type: ordre.bulletin_paie_id ? "salaire" : ordre.note_frais_id ? "note_frais" : "fournisseur", montant: Number(ordre.montant), libelle: ordre.libelle, titulaire: ordre.titulaire, iban: dechiffrerDonneeBancaire(ordre.iban_chiffre), prenom: employe?.prenom, nom: employe?.nom, siret: fournisseur?.siret };
    });
  } catch (cause) {
    erreur(cause instanceof Error ? cause.message : "Impossible de déchiffrer les coordonnées bancaires");
  }
  const { error: reservationError } = await supabase.rpc("demarrer_transmission_lot", { p_entreprise_id: contexte.entrepriseId, p_lot_id: lotId });
  if (reservationError) erreur(reservationError.message);
  let paiement: Awaited<ReturnType<typeof initierLotPowens>>;
  try {
    paiement = await initierLotPowens({ lotId, entrepriseId: contexte.entrepriseId, dateExecution: lot.date_execution, entreprise: { nom: entreprise.nom, raisonSociale: entreprise.raison_sociale, siret: entreprise.siret, formeJuridique: entreprise.forme_juridique }, ordres: instructions! });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Transmission bancaire impossible";
    await supabase.rpc("retablir_lot_apres_echec_transmission", { p_entreprise_id: contexte.entrepriseId, p_lot_id: lotId, p_message: message });
    erreur(message);
  }
  const { error } = await supabase.rpc("marquer_lot_transmis", { p_entreprise_id: contexte.entrepriseId, p_lot_id: lotId, p_provider: "powens", p_provider_payment_id: paiement!.paiementId, p_consent_url: paiement!.consentUrl, p_provider_statut: paiement!.statut });
  if (error) erreur(error.message);
  redirect(paiement!.consentUrl);
}

export async function synchroniserLotPowensAction(lotId: string) {
  const contexte = await exigerPermission("executer_virements");
  const supabase = await createClient();
  const { data: lot } = await supabase.from("lots_virements").select("provider_payment_id,provider").eq("id", lotId).eq("entreprise_id", contexte.entrepriseId).maybeSingle();
  if (!lot?.provider_payment_id || lot.provider !== "powens") return erreur("Ce lot n’a pas été transmis à Powens");
  let paiement: Awaited<ReturnType<typeof obtenirPaiementPowens>>;
  try {
    paiement = await obtenirPaiementPowens(lot.provider_payment_id);
  } catch (cause) {
    erreur(cause instanceof Error ? cause.message : "Synchronisation bancaire impossible");
  }
  const admin = createAdminClient();
  const { error } = await admin.rpc("reconcilier_lot_virements", { p_lot_id: lotId, p_provider_statut: paiement!.state, p_message: null });
  if (error) erreur(error.message);
  revalidatePath(chemin);
  succes("Statut bancaire actualisé");
}
