import type { SupabaseClient } from "@supabase/supabase-js";
import { journaliser, type Acteur } from "@/lib/social/audit";
import { connecteurPour, signalerErreurCompte } from "@/lib/social/comptes";
import { modeSimulation } from "@/lib/social/config";
import { logosElsatia } from "@/lib/social/identite";
import { texteDuReseau } from "@/lib/social/contenu";
import { empreinteContenu } from "@/lib/social/empreinte";
import { delaiReprise, TENTATIVES_MAX } from "@/lib/social/http";
import { ErreurSocial, type MediaAPublier } from "@/lib/social/provider";
import { calculerStatutPublication, peutEtrePublie } from "@/lib/social/workflow";
import type { Cible, Media, Publication } from "@/lib/social/types";

export const BUCKET_SOCIAL = "social-medias";

export type PublicationComplete = { publication: Publication; medias: Media[]; cibles: Cible[] };

export async function chargerPublication(admin: SupabaseClient, id: string): Promise<PublicationComplete | null> {
  const { data: publication } = await admin.from("social_publications").select("*").eq("id", id).maybeSingle();
  if (!publication) return null;
  const [{ data: liens }, { data: cibles }] = await Promise.all([
    admin.from("social_publication_medias").select("ordre, media:social_medias(*)").eq("publication_id", id).order("ordre"),
    admin.from("social_publication_cibles").select("*").eq("publication_id", id),
  ]);
  const medias = (liens ?? []).map((l) => (Array.isArray(l.media) ? l.media[0] : l.media)).filter(Boolean) as Media[];
  return { publication: publication as Publication, medias, cibles: (cibles ?? []) as Cible[] };
}

export function empreinteDe(p: PublicationComplete): string {
  return empreinteContenu({ ...p.publication, mediaIds: p.medias.map((m) => m.id) });
}

async function preparerMedias(admin: SupabaseClient, medias: Media[]): Promise<MediaAPublier[]> {
  const resultat: MediaAPublier[] = [];
  for (const m of medias) {
    // Lien signé d'une heure : la plateforme télécharge le média, le bucket reste privé.
    const { data, error } = await admin.storage.from(BUCKET_SOCIAL).createSignedUrl(m.storage_path, 3600);
    if (error || !data) throw new ErreurSocial("transitoire", "Lien temporaire du média impossible à créer");
    resultat.push({
      type: m.type,
      urlSignee: data.signedUrl,
      mimeType: m.mime_type,
      tailleOctets: Number(m.taille_octets),
      largeur: m.largeur,
      hauteur: m.hauteur,
      dureeSecondes: m.duree_secondes === null ? null : Number(m.duree_secondes),
      texteAlternatif: m.texte_alternatif,
      lireOctets: async () => {
        const telechargement = await admin.storage.from(BUCKET_SOCIAL).download(m.storage_path);
        if (telechargement.error || !telechargement.data) throw new ErreurSocial("transitoire", "Lecture du média impossible");
        return telechargement.data.arrayBuffer();
      },
    });
  }
  return resultat;
}

/** Crée les cibles manquantes (une par réseau choisi) et retire les réseaux décochés. */
async function synchroniserCibles(admin: SupabaseClient, p: PublicationComplete, empreinte: string) {
  for (const reseau of p.publication.reseaux) {
    const existante = p.cibles.find((c) => c.reseau === reseau);
    if (existante) {
      // Une simulation n'a rien publié : la cible redevient publiable pour un envoi réel.
      if (existante.statut === "simule" && !modeSimulation()) {
        await admin.from("social_publication_cibles").update({ statut: "en_attente", erreur: null, erreur_code: null }).eq("id", existante.id).eq("statut", "simule");
      }
      if (existante.statut === "annule") {
        await admin.from("social_publication_cibles").update({ statut: "en_attente", erreur: null, erreur_code: null, tentatives: 0 }).eq("id", existante.id).is("external_post_id", null);
      }
      continue;
    }
    const { data: compte } = await admin.from("social_comptes").select("id").eq("reseau", reseau).neq("statut", "revoque").maybeSingle();
    await admin.from("social_publication_cibles").insert({
      publication_id: p.publication.id,
      reseau,
      compte_id: compte?.id ?? null,
      cle_idempotence: `${p.publication.id}:${reseau}:${empreinte}`,
    });
  }
  const retirees = p.cibles.filter((c) => !p.publication.reseaux.includes(c.reseau) && !c.external_post_id);
  if (retirees.length) await admin.from("social_publication_cibles").update({ statut: "annule" }).in("id", retirees.map((c) => c.id));
}

/** Publie une cible. Toutes les garanties anti-doublon et de validation sont vérifiées ici. */
async function publierCible(admin: SupabaseClient, p: PublicationComplete, cible: Cible, medias: MediaAPublier[], acteur: Acteur) {
  const { data: verrouille } = await admin.rpc("social_verrouiller_cible", { p_cible_id: cible.id });
  if (verrouille !== true) return; // déjà publiée, en cours ailleurs, ou pas encore l'heure de reprise

  const simulation = modeSimulation();
  try {
    const { connecteur } = await connecteurPour(admin, cible.reseau);
    const resultat = await connecteur.publishPost({
      titre: p.publication.titre,
      texte: texteDuReseau(p.publication, cible.reseau),
      lienUrl: p.publication.lien_url,
      medias,
      cleIdempotence: cible.cle_idempotence,
      conteneurExistant: cible.external_conteneur_id,
    });
    if (resultat.simule) {
      await admin.from("social_publication_cibles").update({ statut: "simule", verrou_at: null, erreur: null, erreur_code: null, prochaine_tentative_at: null }).eq("id", cible.id);
    } else {
      await admin
        .from("social_publication_cibles")
        .update({ statut: "publie", external_post_id: resultat.externalPostId, external_url: resultat.externalUrl, publie_at: new Date().toISOString(), verrou_at: null, erreur: null, erreur_code: null, prochaine_tentative_at: null })
        .eq("id", cible.id);
    }
    await journaliser(admin, {
      acteur,
      action: resultat.simule ? "publication_simulee" : "publication_envoyee",
      reseau: cible.reseau,
      publicationId: p.publication.id,
      objetId: resultat.simule ? cible.id : resultat.externalPostId,
      details: resultat.simule ? { requete: resultat.apercuRequete } : { url: resultat.externalUrl },
    });
  } catch (erreur) {
    const e = erreur instanceof ErreurSocial ? erreur : new ErreurSocial("inconnu", erreur instanceof Error ? erreur.message : "Erreur inconnue");
    const tentatives = cible.tentatives + 1;
    const delai = e.reessayable && tentatives < TENTATIVES_MAX ? delaiReprise(tentatives) : null;
    const conteneur = typeof e.details?.conteneur === "string" ? e.details.conteneur : cible.external_conteneur_id;
    await admin
      .from("social_publication_cibles")
      .update({
        statut: "echec",
        verrou_at: null,
        erreur: e.message.slice(0, 2000),
        erreur_code: e.code,
        external_conteneur_id: e.details?.conteneurInvalide ? null : conteneur,
        prochaine_tentative_at: delai === null ? null : new Date(Date.now() + delai).toISOString(),
      })
      .eq("id", cible.id);
    if ((e.code === "jeton_expire" || e.code === "permission") && cible.compte_id) await signalerErreurCompte(admin, cible.compte_id, e);
    await journaliser(admin, {
      acteur,
      action: "publication_echec",
      reseau: cible.reseau,
      publicationId: p.publication.id,
      objetId: cible.id,
      details: { code: e.code, message: e.message, tentative: tentatives, reprise: delai !== null, simulation },
    });
  }
}

export async function recalculerStatut(admin: SupabaseClient, publicationId: string) {
  const p = await chargerPublication(admin, publicationId);
  if (!p) return;
  const actives = p.cibles.filter((c) => p.publication.reseaux.includes(c.reseau) && c.statut !== "annule");
  const statut = calculerStatutPublication(actives);
  if (!statut || statut === p.publication.statut) return;
  const publieAt = statut === "publie" || statut === "partiel" ? actives.map((c) => c.publie_at).filter(Boolean).sort()[0] ?? new Date().toISOString() : null;
  await admin.from("social_publications").update({ statut, publie_at: publieAt }).eq("id", publicationId);
}

/**
 * Lance la publication d'un contenu VALIDÉ. Refuse tout contenu non validé ou
 * modifié depuis la validation (empreinte), quel que soit l'appelant.
 */
export async function lancerPublication(admin: SupabaseClient, publicationId: string, acteur: Acteur) {
  const p = await chargerPublication(admin, publicationId);
  if (!p) throw new Error("Publication introuvable");
  const empreinte = empreinteDe(p);
  const verdict = peutEtrePublie(p.publication, empreinte);
  if (!verdict.ok) throw new Error(verdict.raison);
  // Identité obligatoire : aucune publication réelle sans le logo officiel ELSATIA dans le dépôt.
  const logos = logosElsatia();
  if (!modeSimulation() && logos.manquants.length) throw new Error(`Logo officiel ELSATIA manquant (${logos.manquants.join(", ")}) : publication réelle refusée.`);

  await synchroniserCibles(admin, p, empreinte);
  const { error } = await admin.from("social_publications").update({ statut: "publication_en_cours" }).eq("id", publicationId).in("statut", ["valide", "programme", "echec", "partiel"]);
  if (error) throw new Error(error.message);

  const aJour = (await chargerPublication(admin, publicationId))!;
  const medias = await preparerMedias(admin, aJour.medias);
  for (const cible of aJour.cibles) {
    if (!aJour.publication.reseaux.includes(cible.reseau)) continue;
    if (cible.statut !== "en_attente" && !(cible.statut === "echec" && cible.prochaine_tentative_at)) continue;
    await publierCible(admin, aJour, cible, medias, acteur);
  }
  await recalculerStatut(admin, publicationId);
}

/** Relance manuelle (humaine) d'une cible en échec, y compris « incertain » après vérification. */
export async function relancerCible(admin: SupabaseClient, cibleId: string, acteur: Acteur) {
  const { data: cible } = await admin.from("social_publication_cibles").select("id,publication_id,reseau,statut,external_post_id").eq("id", cibleId).maybeSingle();
  if (!cible || cible.statut !== "echec" || cible.external_post_id) throw new Error("Seule une cible en échec non publiée peut être relancée");
  await admin.from("social_publication_cibles").update({ statut: "en_attente", tentatives: 0, prochaine_tentative_at: null, erreur: null, erreur_code: null }).eq("id", cibleId);
  await journaliser(admin, { acteur, action: "publication_relancee", reseau: cible.reseau, publicationId: cible.publication_id, objetId: cibleId });
  await lancerPublication(admin, cible.publication_id, acteur);
}

/** Planificateur (cron) : publications programmées échues, reprises, verrous abandonnés. */
export async function traiterFilePublication(admin: SupabaseClient) {
  const bilan = { programmees: 0, reprises: 0, aVerifier: 0, erreurs: [] as string[] };

  // Verrou abandonné : la plateforme a peut-être publié. Jamais de relance automatique.
  const { data: bloquees } = await admin
    .from("social_publication_cibles")
    .update({ statut: "echec", erreur_code: "incertain", erreur: "Traitement interrompu : vérifier sur le réseau si la publication existe avant de relancer", verrou_at: null, prochaine_tentative_at: null })
    .eq("statut", "en_cours")
    .lt("verrou_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .select("publication_id");
  bilan.aVerifier = bloquees?.length ?? 0;
  for (const b of bloquees ?? []) await recalculerStatut(admin, b.publication_id);

  const { data: echues } = await admin.from("social_publications").select("id").eq("statut", "programme").lte("programme_at", new Date().toISOString()).limit(20);
  for (const p of echues ?? []) {
    try {
      await lancerPublication(admin, p.id, "planificateur");
      bilan.programmees++;
    } catch (erreur) {
      bilan.erreurs.push(`${p.id}: ${erreur instanceof Error ? erreur.message : "erreur"}`);
      await admin.from("social_publications").update({ statut: "echec" }).eq("id", p.id).eq("statut", "programme");
      await journaliser(admin, { acteur: "planificateur", action: "programmation_refusee", publicationId: p.id, details: { raison: erreur instanceof Error ? erreur.message : "erreur" } });
    }
  }

  const { data: reprises } = await admin.from("social_publication_cibles").select("publication_id").eq("statut", "echec").not("prochaine_tentative_at", "is", null).lte("prochaine_tentative_at", new Date().toISOString()).limit(20);
  for (const id of new Set((reprises ?? []).map((r) => r.publication_id))) {
    try {
      await lancerPublication(admin, id, "planificateur");
      bilan.reprises++;
    } catch (erreur) {
      bilan.erreurs.push(`${id}: ${erreur instanceof Error ? erreur.message : "erreur"}`);
    }
  }
  return bilan;
}
