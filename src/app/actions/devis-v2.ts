"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { validerBrouillon } from "@/lib/devis/editeur-etat";
import { payloadEnregistrementV2, type EnteteDevisV2, type OrigineLigneLibre } from "@/lib/devis/enregistrement-v2";
import { normaliserFiligrane } from "@/lib/devis/filigrane";
import { validerVersion, type ComposantOuvrage, type VersionOuvrage } from "@/lib/devis/ouvrages";
import type { ElementDevis } from "@/lib/devis/presentation";
import type { ArticleCatalogue } from "@/lib/devis/recherche-articles";

// Actions du nouvel éditeur de devis (moteur v2). Chacune revérifie l'entreprise ET le droit
// requis : un rendu conditionnel n'est jamais une barrière, une Server Action est un point
// d'entrée public (voir node_modules/next/dist/docs/01-app/02-guides/server-actions.md).
// Toutes restent inertes tant que le moteur v2 n'est pas activé (GP_DEVIS_V2=1).

const possede = (permissions: string[] | null, cle: string) => permissions === null || permissions.includes(cle);
const INACTIF = { error: "Le nouvel éditeur de devis n’est pas encore activé." };
const REFUS = { error: "Vous n’avez pas le droit de faire cette opération." };

export type ArticleTrouve = ArticleCatalogue & {
  rang: number;
  origineReferenceInterne: string | null;
  /** Code chez le distributeur principal (GP V1, lot B). */
  codeFournisseur?: string | null;
  /** Favori de l'utilisateur connecté. */
  favori?: boolean;
};

type LigneRecherche = {
  source: "prestation" | "article";
  id: string;
  reference_interne: string | null;
  origine_reference_interne: string | null;
  reference_fabricant: string | null;
  code_barres: string | null;
  designation: string;
  description: string | null;
  fabricant: string | null;
  fournisseur: string | null;
  unite: string;
  prix_achat_ht: number | string | null;
  prix_vente_ht: number | string;
  taux_tva: number | string | null;
  stock_disponible: number | string | null;
  actif: boolean;
  type_ligne: string | null;
  rang: number;
  // Colonnes ajoutées par la proposition « bibliothèque » (lot B) ; absentes avant elle.
  code_fournisseur?: string | null;
  famille?: string | null;
  favori?: boolean | null;
};

const nombreOuNul = (x: number | string | null) => (x === null ? null : Number(x));

export async function rechercherArticlesDevisAction(recherche: string): Promise<{ articles: ArticleTrouve[] } | { error: string }> {
  if (!devisV2Actif()) return INACTIF;
  const texte = String(recherche ?? "").slice(0, 120);
  if (!texte.trim()) return { articles: [] };
  const ctx = await getContexteEntreprise();
  if (!possede(await permissionsUtilisateur(ctx), "acces_devis")) return REFUS;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rechercher_articles_devis", {
    p_entreprise_id: ctx.entrepriseId,
    p_recherche: texte,
    p_limite: 60,
  });
  if (error) return { error: messageErreurUtilisateur("rechercherArticlesDevisAction", error, "Recherche impossible pour le moment.") };
  return {
    articles: ((data ?? []) as LigneRecherche[]).map((r) => ({
      id: r.id,
      entrepriseId: ctx.entrepriseId,
      source: r.source,
      referenceInterne: r.reference_interne,
      origineReferenceInterne: r.origine_reference_interne,
      referenceFabricant: r.reference_fabricant,
      codeBarres: r.code_barres,
      designation: r.designation,
      description: r.description,
      fabricant: r.fabricant,
      fournisseur: r.fournisseur,
      unite: r.unite,
      // La base ne rend le prix d'achat qu'aux droits qui l'autorisent ; rien n'est reconstitué ici.
      prixAchatHt: nombreOuNul(r.prix_achat_ht),
      prixVenteHt: Number(r.prix_vente_ht),
      tauxTva: nombreOuNul(r.taux_tva),
      stockDisponible: nombreOuNul(r.stock_disponible),
      actif: r.actif,
      typeLigne: r.type_ligne,
      rang: r.rang,
      codesFournisseurs: r.code_fournisseur ? [r.code_fournisseur] : [],
      codeFournisseur: r.code_fournisseur ?? null,
      famille: r.famille ?? null,
      favori: r.favori === true,
    })),
  };
}

export type OuvrageTrouve = {
  id: string;
  referenceInterne: string | null;
  nom: string;
  categorie: string | null;
  unitePrincipale: string;
  versionCourante: number;
  statut: "actif" | "archive";
  correspondance: string;
};

export async function rechercherOuvragesAction(recherche: string): Promise<{ ouvrages: OuvrageTrouve[] } | { error: string }> {
  if (!devisV2Actif()) return INACTIF;
  const texte = String(recherche ?? "").slice(0, 120);
  if (!texte.trim()) return { ouvrages: [] };
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!possede(permissions, "acces_devis") && !possede(permissions, "acces_ouvrages")) return REFUS;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rechercher_ouvrages", { p_entreprise_id: ctx.entrepriseId, p_recherche: texte, p_limite: 40 });
  if (error) return { error: messageErreurUtilisateur("rechercherOuvragesAction", error, "Recherche impossible pour le moment.") };
  return {
    ouvrages: (data ?? []).map((o: Record<string, unknown>) => ({
      id: String(o.id),
      referenceInterne: (o.reference_interne as string | null) ?? null,
      nom: String(o.nom),
      categorie: (o.categorie as string | null) ?? null,
      unitePrincipale: String(o.unite_principale),
      versionCourante: Number(o.version_courante),
      statut: o.statut === "archive" ? "archive" : "actif",
      correspondance: String(o.correspondance ?? ""),
    })),
  };
}

const COMPOSANT_PAR_DEFAUT: Omit<ComposantOuvrage, "cle" | "designation" | "unite"> = {
  ordre: 0, nature: "libre", source: null, referenceInterne: null, referenceFabricant: null, fabricant: null,
  fournisseur: null, descriptionClient: null, coefficient: null, base: { type: "principale" }, quantiteFixe: null,
  saisieRequise: false, pertePct: 0, arrondi: { mode: "aucun" }, quantiteMin: null, condition: { type: "toujours" },
  prixAchatHt: null, prixVenteHt: 0, tauxTva: 20, visibleClient: true,
};

/** Version COURANTE d'un ouvrage, avec les coûts de ses composants si l'utilisateur peut les voir. */
export async function chargerOuvrageAction(ouvrageId: string): Promise<{ version: VersionOuvrage } | { error: string }> {
  if (!devisV2Actif()) return INACTIF;
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!possede(permissions, "acces_devis") && !possede(permissions, "acces_ouvrages")) return REFUS;
  const supabase = await createClient();
  const { data: ouvrage } = await supabase.from("ouvrages").select("id, statut, version_courante")
    .eq("id", ouvrageId).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!ouvrage) return { error: "Ouvrage introuvable." };
  const { data: v } = await supabase.from("ouvrages_versions")
    .select("id, version, reference_interne, nom, description_interne, description_client, categorie, unite_principale, quantite_principale, composants, auteur, cree_le")
    .eq("ouvrage_id", ouvrageId).eq("version", ouvrage.version_courante).maybeSingle();
  if (!v) return { error: "Version d’ouvrage introuvable." };
  const couts = possede(permissions, "voir_couts_devis")
    ? ((await supabase.from("ouvrages_composants_couts").select("cle_composant, prix_achat_ht").eq("version_id", v.id)).data ?? [])
    : [];
  const coutParCle = new Map(couts.map((c) => [c.cle_composant as string, Number(c.prix_achat_ht)]));
  const composants = ((v.composants ?? []) as Array<Partial<ComposantOuvrage> & { cle: string; designation: string; unite: string }>)
    .map((c, i) => ({ ...COMPOSANT_PAR_DEFAUT, ordre: i + 1, ...c, prixAchatHt: coutParCle.get(c.cle) ?? null }));
  return {
    version: {
      ouvrageId,
      entrepriseId: ctx.entrepriseId,
      version: v.version,
      referenceInterne: v.reference_interne,
      nom: v.nom,
      descriptionInterne: v.description_interne,
      descriptionClient: v.description_client,
      categorie: v.categorie,
      unitePrincipale: v.unite_principale,
      quantitePrincipale: Number(v.quantite_principale),
      statut: ouvrage.statut === "archive" ? "archive" : "actif",
      composants,
      auteur: v.auteur,
      creeLe: v.cree_le,
      modifieLe: v.cree_le,
    },
  };
}

/**
 * Enregistre un brouillon v2 (création si `devisId` est nul) — atomique, en une seule fonction SQL.
 * `revision` : révision lue par l'éditeur ; si la base a bougé entre-temps, l'enregistrement est refusé
 * (`conflit`) plutôt qu'écrasé. Rend la révision suivante, que l'éditeur mémorise pour l'autosauvegarde.
 */
export async function enregistrerDevisV2Action(
  devisId: string | null,
  entete: EnteteDevisV2,
  elements: ElementDevis[],
  origines: Record<string, OrigineLigneLibre>,
  revision: number | null = null,
): Promise<{ id: string; revision: number } | { error: string; conflit?: true }> {
  if (!devisV2Actif()) return INACTIF;
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!possede(permissions, "gerer_devis")) return REFUS;
  const erreur = validerBrouillon({ clientId: entete.client_id, remiseGlobalePct: entete.remise_globale, elements });
  if (erreur) return { error: erreur };

  const payload = payloadEnregistrementV2(
    { ...entete, filigrane: entete.filigrane ? normaliserFiligrane(entete.filigrane) : null },
    elements,
    { inclureCouts: possede(permissions, "gerer_couts_devis"), origines },
  );
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enregistrer_devis_brouillon_v2", {
    p_entreprise_id: ctx.entrepriseId,
    p_devis_id: devisId,
    p_devis: payload.p_devis,
    p_ouvrages: payload.p_ouvrages,
    p_lignes: payload.p_lignes,
    p_couts: payload.p_couts,
    p_revision: devisId ? revision : null,
  });
  if (error || !data) {
    if (error?.code === "40001") {
      return { error: "Ce devis a été modifié ailleurs (autre onglet ou autre poste) depuis votre dernière lecture. Rechargez-le avant d’enregistrer.", conflit: true };
    }
    return { error: messageErreurUtilisateur("enregistrerDevisV2Action", error, "Impossible d’enregistrer ce devis. Vérifiez les informations saisies.") };
  }
  const rendu = (typeof data === "string" ? { id: data, revision: 0 } : data) as { id: string; revision?: number };
  revalidatePath("/devis");
  revalidatePath(`/devis/${rendu.id}`);
  return { id: String(rendu.id), revision: Number(rendu.revision ?? 0) };
}

/**
 * Publie une version d'ouvrage (création si `ouvrageId` est nul). Une version publiée est
 * immuable : modifier un ouvrage, c'est en publier une nouvelle. Les devis existants gardent la
 * version qu'ils ont reçue.
 */
export async function publierOuvrageAction(
  ouvrageId: string | null,
  version: Pick<VersionOuvrage, "referenceInterne" | "nom" | "descriptionInterne" | "descriptionClient" | "categorie" | "unitePrincipale" | "quantitePrincipale" | "composants">,
): Promise<{ id: string } | { error: string }> {
  if (!devisV2Actif()) return INACTIF;
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  if (!possede(permissions, "gerer_ouvrages")) return REFUS;
  const erreurs = validerVersion(version);
  if (erreurs.length) return { error: erreurs[0] };

  // Les coûts ne partent vers la base qu'avec le droit de les gérer ; la base les ignorerait sinon.
  const couts = possede(permissions, "gerer_couts_devis")
    ? version.composants.filter((c) => c.prixAchatHt !== null).map((c) => ({ cle: c.cle, prix_achat_ht: c.prixAchatHt }))
    : [];
  const composants = version.composants.map((c) => {
    const { prixAchatHt: _retire, ...reste } = c;
    void _retire;
    return reste;
  });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publier_version_ouvrage", {
    p_entreprise_id: ctx.entrepriseId,
    p_ouvrage_id: ouvrageId,
    p_version: {
      reference_interne: version.referenceInterne,
      nom: version.nom,
      description_interne: version.descriptionInterne,
      description_client: version.descriptionClient,
      categorie: version.categorie,
      unite_principale: version.unitePrincipale,
      quantite_principale: version.quantitePrincipale,
      composants,
    },
    p_couts: couts,
  });
  if (error || !data) return { error: messageErreurUtilisateur("publierOuvrageAction", error, "Impossible de publier cet ouvrage.") };
  revalidatePath("/ouvrages");
  return { id: data as string };
}

export async function changerStatutOuvrageAction(ouvrageId: string, statut: "actif" | "archive"): Promise<{ ok: true } | { error: string }> {
  if (!devisV2Actif()) return INACTIF;
  const ctx = await getContexteEntreprise();
  if (!possede(await permissionsUtilisateur(ctx), "gerer_ouvrages")) return REFUS;
  const supabase = await createClient();
  const { error } = await supabase.rpc("changer_statut_ouvrage", { p_ouvrage_id: ouvrageId, p_statut: statut });
  if (error) return { error: messageErreurUtilisateur("changerStatutOuvrageAction", error, "Impossible de changer le statut de cet ouvrage.") };
  revalidatePath("/ouvrages");
  return { ok: true };
}
