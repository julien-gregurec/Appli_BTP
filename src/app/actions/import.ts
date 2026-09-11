"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise, type ContexteEntreprise } from "@/lib/entreprise";
import { analyserFichier, type FichierAnalyse } from "@/lib/import/parse";
import { logicielSource, typeImport } from "@/lib/import/config";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { contexteQuotaPersonnes } from "@/lib/capacite-personnes";
import { messageImportCapacite } from "@/lib/quota-personnes-message";
import { permissionsUtilisateur } from "@/lib/permissions";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { planifierImportCatalogue } from "@/lib/devis/import-catalogue";
import { articlesDepuisBase, fournisseurDepuisBase } from "@/lib/devis/catalogue-base";
import { chargerCatalogueV2 } from "@/lib/devis/catalogue-serveur";
import {
  appliquerOperationsImport,
  planifierOperationsImport,
  repliErreurImport,
  type PortImportCatalogue,
  type RapportImportCatalogue,
} from "@/lib/devis/application-import-catalogue";
import {
  droitsImportCatalogueV2,
  lignesPourPlanificateur,
  lireCleRapprochement,
  type OptionsImportCatalogueV2,
} from "@/lib/import/catalogue-v2";

const MAX_LIGNES = 5000;

export async function analyserFichierImport(formData: FormData): Promise<FichierAnalyse & { erreur?: string; catalogueV2?: OptionsImportCatalogueV2 }> {
  const ctx = await getContexteEntreprise();
  const file = formData.get("fichier");
  if (!(file instanceof File) || file.size === 0) return { entete: [], lignes: [], total: 0, erreur: "Aucun fichier fourni." };
  if (file.size > 8 * 1024 * 1024) return { entete: [], lignes: [], total: 0, erreur: "Fichier trop volumineux (max 8 Mo)." };
  let analyse: FichierAnalyse;
  try {
    const res = await analyserFichier(file);
    analyse = { ...res, lignes: res.lignes.slice(0, MAX_LIGNES) };
  } catch (e) {
    return { entete: [], lignes: [], total: 0, erreur: messageErreurUtilisateur("analyserFichierImport", e, "Lecture du fichier impossible. Vérifiez le format et réessayez.") };
  }
  // Moteur de devis v2 : l'assistant propose le profil catalogue enrichi. Éteint, réponse inchangée.
  if (!devisV2Actif()) return analyse;
  const droits = droitsImportCatalogueV2(await permissionsUtilisateur(ctx));
  return { ...analyse, catalogueV2: { autorise: droits.importer, prixAchat: droits.gererCouts } };
}

// Helpers de normalisation.
const nettoyer = (v: unknown) => String(v ?? "").trim();
function nombre(v: string): number | null {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function dateIso(v: string): string | null {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (m) {
    const [, j, mo, a] = m;
    const annee = a.length === 2 ? `20${a}` : a;
    return `${annee}-${mo.padStart(2, "0")}-${j.padStart(2, "0")}`;
  }
  return null;
}
const dansEnsemble = (v: string, set: string[], defaut: string) => {
  const bas = v.trim().toLowerCase();
  return set.find((s) => s === bas) ?? defaut;
};

export type ResultatImport = { inseres: number; ignores: number; erreurs: string[] };

export async function importerDonneesAction(payload: {
  type: string;
  mapping: Record<string, number>;
  lignes: string[][];
  sourceLogiciel?: string;
}): Promise<ResultatImport> {
  const ctx = await getContexteEntreprise();
  const entrepriseId = ctx.entrepriseId;
  const conf = typeImport(payload.type);
  if (!entrepriseId || !conf) return { inseres: 0, ignores: 0, erreurs: ["Type d'import inconnu."] };

  const supabase = await createClient();
  const lignes = payload.lignes.slice(0, MAX_LIGNES);
  const val = (ligne: string[], cle: string) => {
    const idx = payload.mapping[cle];
    return idx === undefined || idx < 0 ? "" : nettoyer(ligne[idx]);
  };
  const erreurs: string[] = [];
  let ignores = 0;

  // Construction des enregistrements selon le type.
  const enregistrements: Record<string, unknown>[] = [];

  if (payload.type === "clients") {
    for (const [i, l] of lignes.entries()) {
      const nom = val(l, "nom"), societe = val(l, "societe");
      if (!nom && !societe) { ignores++; continue; }
      enregistrements.push({
        entreprise_id: entrepriseId,
        type: dansEnsemble(val(l, "type"), ["particulier", "professionnel", "collectivite", "syndic", "promoteur"], societe ? "professionnel" : "particulier"),
        nom: nom || societe, prenom: val(l, "prenom") || null, societe: societe || null,
        siret: val(l, "siret") || null, adresse_facturation: val(l, "adresse_facturation") || null,
        code_postal: val(l, "code_postal") || null, ville: val(l, "ville") || null,
        telephone: val(l, "telephone") || null, email: val(l, "email") || null, statut: "actif",
      });
      void i;
    }
  } else if (payload.type === "employes") {
    for (const l of lignes) {
      const prenom = val(l, "prenom"), nom = val(l, "nom");
      if (!prenom && !nom) { ignores++; continue; }
      enregistrements.push({
        entreprise_id: entrepriseId, prenom: prenom || nom, nom: nom || prenom,
        poste: val(l, "poste") || null,
        type_contrat: dansEnsemble(val(l, "type_contrat"), ["cdi", "cdd", "interim", "apprenti", "stage", "freelance", "autre"], "cdi"),
        email: val(l, "email") || null, telephone: val(l, "telephone") || null,
        taux_horaire: nombre(val(l, "taux_horaire")), date_entree: dateIso(val(l, "date_entree")), statut: "actif",
      });
    }
  } else if (payload.type === "catalogue") {
    for (const l of lignes) {
      const designation = val(l, "designation");
      if (!designation) { ignores++; continue; }
      enregistrements.push({
        entreprise_id: entrepriseId, designation, description: val(l, "description") || null,
        type: dansEnsemble(val(l, "type"), ["main_oeuvre", "fourniture", "sous_traitance", "deplacement", "forfait"], "main_oeuvre"),
        unite: val(l, "unite") || "h",
        prix_unitaire_ht: nombre(val(l, "prix_unitaire_ht")) ?? 0,
        taux_tva: nombre(val(l, "taux_tva")) ?? 20,
      });
    }
  } else if (payload.type === "stock") {
    for (const l of lignes) {
      const reference = val(l, "reference");
      const designation = val(l, "designation");
      if (!reference || !designation) { ignores++; continue; }
      enregistrements.push({
        entreprise_id: entrepriseId, reference, designation,
        code_barres: val(l, "code_barres") || null, marque: val(l, "marque") || null,
        unite: val(l, "unite") || "u", quantite_stock: Math.max(0, nombre(val(l, "quantite_stock")) ?? 0),
        seuil_alerte: Math.max(0, nombre(val(l, "seuil_alerte")) ?? 0),
        prix_achat_ht: Math.max(0, nombre(val(l, "prix_achat_ht")) ?? 0),
        prix_vente_ht: Math.max(0, nombre(val(l, "prix_vente_ht")) ?? 0),
        emplacement: val(l, "emplacement") || null, actif: true, updated_at: new Date().toISOString(),
      });
    }
  } else if (payload.type === "ecritures_comptables") {
    for (const l of lignes) {
      const journal = val(l, "journal"), dateEcriture = dateIso(val(l, "date_ecriture"));
      const compte = val(l, "compte"), libelle = val(l, "libelle");
      const debit = Math.max(0, nombre(val(l, "debit")) ?? 0), credit = Math.max(0, nombre(val(l, "credit")) ?? 0);
      if (!journal || !dateEcriture || !compte || !libelle || (debit <= 0 && credit <= 0)) { ignores++; continue; }
      enregistrements.push({ entreprise_id: entrepriseId, journal, date_ecriture: dateEcriture,
        numero_piece: val(l, "numero_piece") || null, compte, libelle, debit, credit,
        source_logiciel: val(l, "source_logiciel") || payload.sourceLogiciel || logicielSource("generique").libelle,
        reference_source: val(l, "reference_source") || null });
    }
  } else if (payload.type === "tarifs_fournisseurs") {
    const { data: fournisseursExistants } = await supabase
      .from("fournisseurs")
      .select("id,nom")
      .eq("entreprise_id", entrepriseId);
    const indexFournisseurs = new Map(
      (fournisseursExistants ?? []).map((fournisseur) => [fournisseur.nom.trim().toLocaleLowerCase("fr"), fournisseur.id]),
    );
    for (const l of lignes) {
      const nomFournisseur = val(l, "fournisseur_nom");
      const reference = val(l, "reference_fournisseur");
      const designation = val(l, "designation");
      const prixNegocie = nombre(val(l, "prix_negocie_ht"));
      if (!nomFournisseur || !reference || !designation || prixNegocie === null || prixNegocie < 0) {
        ignores++;
        continue;
      }
      const cleFournisseur = nomFournisseur.toLocaleLowerCase("fr");
      let fournisseurId = indexFournisseurs.get(cleFournisseur);
      if (!fournisseurId) {
        const { data: nouveau, error } = await supabase
          .from("fournisseurs")
          .insert({ entreprise_id: entrepriseId, nom: nomFournisseur })
          .select("id")
          .single();
        if (error || !nouveau) {
          erreurs.push(`Fournisseur « ${nomFournisseur} » : ${messageErreurUtilisateur("importerDonneesAction:fournisseur", error, "création impossible")}`);
          ignores++;
          continue;
        }
        fournisseurId = nouveau.id;
        indexFournisseurs.set(cleFournisseur, fournisseurId);
      }
      enregistrements.push({
        entreprise_id: entrepriseId,
        fournisseur_id: fournisseurId,
        reference_fournisseur: reference,
        eancode: val(l, "eancode") || null,
        designation,
        unite: val(l, "unite") || "u",
        prix_public_ht: nombre(val(l, "prix_public_ht")),
        prix_negocie_ht: prixNegocie,
        devise: val(l, "devise").toUpperCase() || "EUR",
        disponibilite: val(l, "disponibilite") || null,
        minimum_commande: nombre(val(l, "minimum_commande")),
        valide_du: dateIso(val(l, "valide_du")),
        valide_au: dateIso(val(l, "valide_au")),
        source: "import_utilisateur",
        updated_at: new Date().toISOString(),
      });
    }
  } else if (payload.type === "chantiers") {
    // Résolution des clients par nom (existants + créés à la volée).
    const { data: clientsExistants } = await supabase.from("clients").select("id, nom, societe").eq("entreprise_id", entrepriseId);
    const indexClient = new Map<string, string>();
    for (const c of clientsExistants ?? []) {
      if (c.nom) indexClient.set(c.nom.toLowerCase(), c.id);
      if (c.societe) indexClient.set(c.societe.toLowerCase(), c.id);
    }
    for (const l of lignes) {
      const nom = val(l, "nom"), clientNom = val(l, "client_nom");
      if (!nom || !clientNom) { ignores++; continue; }
      let clientId = indexClient.get(clientNom.toLowerCase());
      if (!clientId) {
        const { data: nouveau, error } = await supabase.from("clients")
          .insert({ entreprise_id: entrepriseId, type: "particulier", nom: clientNom, statut: "actif" })
          .select("id").single();
        if (error || !nouveau) { erreurs.push(`Client « ${clientNom} » : ${messageErreurUtilisateur("importerDonneesAction:client", error, "création impossible")}`); ignores++; continue; }
        clientId = nouveau.id;
        indexClient.set(clientNom.toLowerCase(), clientId!);
      }
      enregistrements.push({
        entreprise_id: entrepriseId, client_id: clientId, nom,
        adresse: val(l, "adresse") || null, code_postal: val(l, "code_postal") || null, ville: val(l, "ville") || null,
        statut: dansEnsemble(val(l, "statut"), ["prospect", "devis_envoye", "accepte", "a_preparer", "en_attente_validation", "en_commande_materiel", "en_cours", "en_pause", "termine", "facture", "archive", "annule"], "prospect"),
        budget_previsionnel: nombre(val(l, "budget_previsionnel")),
        date_debut_prevue: dateIso(val(l, "date_debut_prevue")),
      });
    }
  }

  // Plafond de personnes actives : contrôle AVANT toute écriture, jamais d'import
  // partiel silencieux. Les fiches importées sont toutes créées "actif".
  if (payload.type === "employes" && enregistrements.length > 0) {
    const { data: capaciteBrut } = await supabase
      .rpc("capacite_personnes_entreprise", { p_entreprise_id: entrepriseId })
      .maybeSingle();
    const capacite = capaciteBrut as {
      personnes_actives?: number | null;
      capacite_totale?: number | null;
    } | null;
    if (capacite) {
      const restant = Math.max(
        0,
        Number(capacite.capacite_totale ?? 0) - Number(capacite.personnes_actives ?? 0),
      );
      if (enregistrements.length > restant) {
        // Message contextuel : ne propose jamais « ajoutez de la capacité » ou
        // « changez d'offre » quand ces chemins sont fermés (essai sans offre,
        // ABONNEMENTS_PUBLICS_OUVERTS=false).
        return {
          inseres: 0,
          ignores: ignores + enregistrements.length,
          erreurs: [
            messageImportCapacite(await contexteQuotaPersonnes(entrepriseId), {
              totale: Number(capacite.capacite_totale ?? 0),
              actives: Number(capacite.personnes_actives ?? 0),
              restant,
              demandees: enregistrements.length,
            }),
          ],
        };
      }
    }
  }

  // Insertion par lots.
  let inseres = 0;
  for (let i = 0; i < enregistrements.length; i += 200) {
    const lot = enregistrements.slice(i, i + 200);
    const requete = payload.type === "tarifs_fournisseurs"
      ? supabase.from(conf.table).upsert(lot, { onConflict: "entreprise_id,fournisseur_id,reference_fournisseur", count: "exact" })
      : payload.type === "stock"
        ? supabase.from(conf.table).upsert(lot, { onConflict: "entreprise_id,reference", count: "exact" })
        : supabase.from(conf.table).insert(lot, { count: "exact" });
    const { error, count } = await requete;
    if (error) erreurs.push(`Lot ${i / 200 + 1} : ${messageErreurUtilisateur("importerDonneesAction:lot", error, "insertion impossible")}`);
    else inseres += count ?? lot.length;
  }

  revalidatePath("/parametres/import");
  if (payload.type === "stock") { revalidatePath("/stock"); revalidatePath("/inventaires"); }
  if (payload.type === "ecritures_comptables") revalidatePath("/exports");
  return { inseres, ignores, erreurs };
}

// ── Catalogue des devis, moteur v2 ──────────────────────────────────────────────────────────
// Chemin emprunté UNIQUEMENT quand `devisV2Actif()` (colonnes et table de coûts du SQL proposé).
// Éteint, l'action refuse et l'assistant n'y mène jamais : le profil catalogue reste l'historique.

export type ResultatImportCatalogueV2 = RapportImportCatalogue | { erreur: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Écritures de l'import, sous la RLS de l'utilisateur, toujours bornées à son entreprise. */
function portImportCatalogue(supabase: Supabase, ctx: ContexteEntreprise): PortImportCatalogue {
  return {
    insererPrestations: async (lignes) => (await supabase.from("prestations_catalogue").insert([...lignes])).error,
    mettreAJourPrestation: async (articleId, champs) => {
      const { data, error } = await supabase.from("prestations_catalogue").update(champs)
        .eq("id", articleId).eq("entreprise_id", ctx.entrepriseId).select("id");
      if (error) return error;
      // La RLS ne lève pas d'erreur sur une ligne invisible : zéro ligne modifiée EST un échec.
      return (data ?? []).length === 1 ? null : { code: "PGRST116", message: "Aucune ligne modifiée." };
    },
    enregistrerCouts: async (couts) => {
      const majLe = new Date().toISOString();
      const { error } = await supabase.from("prestations_catalogue_couts").upsert(
        couts.map((c) => ({ ...c, maj_le: majLe, maj_par: ctx.userId })),
        { onConflict: "prestation_id" },
      );
      return error;
    },
    messageErreur: (erreur) => messageErreurUtilisateur("importerCatalogueV2Action", erreur, repliErreurImport(erreur)),
  };
}

/**
 * Import du catalogue des devis (moteur v2) : planifie avec `planifierImportCatalogue`, puis applique
 * le plan ligne à ligne. Droits revérifiés ici : import (page d'import + `acces_devis` +
 * `gerer_devis`), lecture des coûts (`voir_couts_devis`), écriture des coûts (`gerer_couts_devis`).
 * Ne renvoie que le rapport (ligne, statut, message) : aucun identifiant ni aucune valeur de la base.
 */
export async function importerCatalogueV2Action(payload: {
  entete: string[];
  mapping: Record<string, number>;
  lignes: string[][];
  cleRapprochement: string;
}): Promise<ResultatImportCatalogueV2> {
  if (!devisV2Actif()) return { erreur: "Cet import n’est pas disponible." };
  const ctx = await getContexteEntreprise();
  const droits = droitsImportCatalogueV2(await permissionsUtilisateur(ctx));
  if (!droits.importer) return { erreur: "Vous n’avez pas le droit d’importer dans le catalogue des devis." };

  const cle = lireCleRapprochement(payload?.cleRapprochement);
  if (!cle) return { erreur: "Clé de rapprochement inconnue." };
  if (!Array.isArray(payload.entete) || !Array.isArray(payload.lignes) || payload.lignes.some((l) => !Array.isArray(l))) {
    return { erreur: "Fichier invalide : relancez l’analyse." };
  }
  const mapping = typeof payload.mapping === "object" && payload.mapping !== null ? payload.mapping : {};
  const fichier = lignesPourPlanificateur(payload.entete.map((e) => String(e ?? "")), payload.lignes.slice(0, MAX_LIGNES), mapping);

  const supabase = await createClient();
  const catalogue = await chargerCatalogueV2(supabase, ctx.entrepriseId, { voirCouts: droits.voirCouts });
  if ("erreur" in catalogue) {
    return {
      erreur: messageErreurUtilisateur("importerCatalogueV2Action:lecture", catalogue.erreur,
        "Lecture du catalogue impossible : aucune ligne n’a été importée. Réessayez dans un instant."),
    };
  }

  const plan = planifierImportCatalogue(
    fichier.lignes,
    articlesDepuisBase(catalogue.prestations, catalogue.couts, { voirCouts: droits.voirCouts }),
    catalogue.fournisseurs.map(fournisseurDepuisBase),
    { cleRapprochement: cle, peutModifierPrixAchat: droits.gererCouts },
  );
  const operations = planifierOperationsImport(plan, {
    entrepriseId: ctx.entrepriseId,
    peutModifierPrixAchat: droits.gererCouts,
    nouvelId: () => randomUUID(),
  });
  const rapport = await appliquerOperationsImport(plan, operations, portImportCatalogue(supabase, ctx));

  revalidatePath("/parametres/import");
  if (operations.creations.length || operations.misesAJour.length || operations.couts.length) {
    revalidatePath("/prestations");
    revalidatePath("/devis/nouveau");
  }
  return { ...rapport, colonnesInconnues: [...new Set([...fichier.colonnesInconnues, ...rapport.colonnesInconnues])] };
}
