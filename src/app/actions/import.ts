"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { analyserFichier, type FichierAnalyse } from "@/lib/import/parse";
import { typeImport } from "@/lib/import/config";

const MAX_LIGNES = 5000;

export async function analyserFichierImport(formData: FormData): Promise<FichierAnalyse & { erreur?: string }> {
  await getContexteEntreprise();
  const file = formData.get("fichier");
  if (!(file instanceof File) || file.size === 0) return { entete: [], lignes: [], total: 0, erreur: "Aucun fichier fourni." };
  if (file.size > 8 * 1024 * 1024) return { entete: [], lignes: [], total: 0, erreur: "Fichier trop volumineux (max 8 Mo)." };
  try {
    const res = await analyserFichier(file);
    return { ...res, lignes: res.lignes.slice(0, MAX_LIGNES) };
  } catch (e) {
    return { entete: [], lignes: [], total: 0, erreur: `Lecture impossible : ${(e as Error).message}` };
  }
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
          erreurs.push(`Fournisseur « ${nomFournisseur} » : ${error?.message ?? "création impossible"}`);
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
        if (error || !nouveau) { erreurs.push(`Client « ${clientNom} » : ${error?.message ?? "création impossible"}`); ignores++; continue; }
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

  // Insertion par lots.
  let inseres = 0;
  for (let i = 0; i < enregistrements.length; i += 200) {
    const lot = enregistrements.slice(i, i + 200);
    const requete = payload.type === "tarifs_fournisseurs"
      ? supabase.from(conf.table).upsert(lot, { onConflict: "entreprise_id,fournisseur_id,reference_fournisseur", count: "exact" })
      : supabase.from(conf.table).insert(lot, { count: "exact" });
    const { error, count } = await requete;
    if (error) erreurs.push(`Lot ${i / 200 + 1} : ${error.message}`);
    else inseres += count ?? lot.length;
  }

  revalidatePath("/parametres/import");
  return { inseres, ignores, erreurs };
}
