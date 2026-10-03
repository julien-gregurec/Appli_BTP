import type { SupabaseClient } from "@supabase/supabase-js";
import { connecteurPour, signalerErreurCompte } from "@/lib/social/comptes";
import { ErreurSocial } from "@/lib/social/provider";
import { delaiReprise } from "@/lib/social/http";
import { RESEAUX, type Reseau } from "@/lib/social/types";

// Lecture des statistiques, abonnés, commentaires et messages. Les webhooks
// alimentent commentaires et messages au fil de l'eau ; cette synchronisation
// sert de rattrapage (cron) ou d'action manuelle « Synchroniser ».

type Bilan = Record<string, string>;

function messageErreur(e: unknown) {
  return e instanceof Error ? e.message : "erreur";
}

export async function synchroniserStatistiques(admin: SupabaseClient, joursMax = 60): Promise<Bilan> {
  const bilan: Bilan = {};
  const depuis = new Date(Date.now() - joursMax * 86400_000).toISOString();
  for (const reseau of RESEAUX) {
    try {
      const { compte, connecteur } = await connecteurPour(admin, reseau);
      const abonnes = await connecteur.getFollowers().catch(() => null);
      if (abonnes !== null) await admin.from("social_abonnes").upsert({ compte_id: compte.id, collecte_le: new Date().toISOString().slice(0, 10), abonnes });

      const { data: cibles } = await admin.from("social_publication_cibles").select("id,publication_id,external_post_id").eq("reseau", reseau).eq("statut", "publie").gte("publie_at", depuis).limit(100);
      const ids = (cibles ?? []).map((c) => c.external_post_id).filter(Boolean) as string[];
      const stats = ids.length ? await connecteur.getAnalytics(ids) : new Map();
      const lignes = (cibles ?? []).flatMap((c) => {
        const s = stats.get(c.external_post_id);
        if (!s) return [];
        return [{ cible_id: c.id, publication_id: c.publication_id, reseau, impressions: s.impressions, portee: s.portee, vues: s.vues, likes: s.likes, commentaires: s.commentaires, partages: s.partages, clics: s.clics, enregistrements: s.enregistrements, metriques_brutes: s.brutes }];
      });
      if (lignes.length) await admin.from("social_statistiques").insert(lignes);
      bilan[reseau] = `${lignes.length} publication(s), abonnés ${abonnes ?? "n/d"}`;
    } catch (e) {
      bilan[reseau] = messageErreur(e);
      await signalerSiCompte(admin, reseau, e);
    }
  }
  return bilan;
}

async function signalerSiCompte(admin: SupabaseClient, reseau: Reseau, e: unknown) {
  if (!(e instanceof ErreurSocial) || (e.code !== "jeton_expire" && e.code !== "permission")) return;
  const { data } = await admin.from("social_comptes").select("id").eq("reseau", reseau).neq("statut", "revoque").maybeSingle();
  if (data) await signalerErreurCompte(admin, data.id, e);
}

export async function synchroniserCommentaires(admin: SupabaseClient, joursMax = 30): Promise<Bilan> {
  const bilan: Bilan = {};
  const depuis = new Date(Date.now() - joursMax * 86400_000).toISOString();
  for (const reseau of RESEAUX) {
    try {
      const { compte, connecteur } = await connecteurPour(admin, reseau);
      if (!connecteur.capacites.commentaires.disponible) {
        bilan[reseau] = connecteur.capacites.commentaires.raison;
        continue;
      }
      const { data: cibles } = await admin.from("social_publication_cibles").select("id,external_post_id").eq("reseau", reseau).eq("statut", "publie").gte("publie_at", depuis).limit(50);
      let total = 0;
      for (const cible of cibles ?? []) {
        if (!cible.external_post_id) continue;
        const commentaires = await connecteur.getComments(cible.external_post_id);
        const lignes = commentaires.filter((c) => !c.estPropre && c.externalCommentId).map((c) => ({
          reseau,
          compte_id: compte.id,
          cible_id: cible.id,
          external_comment_id: c.externalCommentId,
          external_post_id: c.externalPostId,
          external_parent_id: c.externalParentId,
          auteur_nom: c.auteurNom,
          auteur_external_id: c.auteurId,
          contenu: c.contenu,
          publie_externe_at: c.publieAt,
        }));
        // ignoreDuplicates : un commentaire déjà traité garde son statut et son brouillon.
        if (lignes.length) await admin.from("social_commentaires").upsert(lignes, { onConflict: "reseau,external_comment_id", ignoreDuplicates: true });
        total += lignes.length;
      }
      bilan[reseau] = `${total} commentaire(s) lus`;
    } catch (e) {
      bilan[reseau] = messageErreur(e);
      await signalerSiCompte(admin, reseau, e);
    }
  }
  return bilan;
}

export async function synchroniserMessages(admin: SupabaseClient): Promise<Bilan> {
  const bilan: Bilan = {};
  for (const reseau of RESEAUX) {
    try {
      const { compte, connecteur } = await connecteurPour(admin, reseau);
      if (!connecteur.capacites.messages.disponible) {
        bilan[reseau] = connecteur.capacites.messages.raison;
        continue;
      }
      const messages = await connecteur.getMessages();
      const lignes = messages.map((m) => ({
        reseau,
        compte_id: compte.id,
        external_conversation_id: m.externalConversationId,
        external_message_id: m.externalMessageId,
        sens: m.sens,
        auteur_nom: m.auteurNom,
        auteur_external_id: m.auteurId,
        contenu: m.contenu,
        envoye_externe_at: m.envoyeAt,
        statut: m.sens === "sortant" ? "envoye" : "recu",
      }));
      if (lignes.length) await admin.from("social_messages").upsert(lignes, { onConflict: "reseau,external_message_id", ignoreDuplicates: true });
      bilan[reseau] = `${lignes.length} message(s) lus`;
    } catch (e) {
      bilan[reseau] = messageErreur(e);
      await signalerSiCompte(admin, reseau, e);
    }
  }
  return bilan;
}

// ─────────────────────────────────────────────────────────────
// Webhooks : traitement asynchrone avec reprise et file des échecs
// ─────────────────────────────────────────────────────────────

const TENTATIVES_WEBHOOK = 5;

type EntreeMeta = {
  id?: string;
  time?: number;
  changes?: Array<{ field?: string; value?: Record<string, unknown> }>;
  messaging?: Array<{ sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } }>;
};

async function compteParExterne(admin: SupabaseClient, reseau: Reseau, externalId: string | undefined) {
  // Identifiants Meta numériques uniquement (protège le filtre PostgREST).
  if (!externalId || !/^\d+$/.test(externalId)) return null;
  const { data } = await admin.from("social_comptes").select("id,external_account_id,external_parent_id").eq("reseau", reseau).neq("statut", "revoque").or(`external_account_id.eq.${externalId},external_parent_id.eq.${externalId}`).maybeSingle();
  return data;
}

async function traiterMeta(admin: SupabaseClient, payload: { object?: string; entry?: EntreeMeta[] }) {
  const reseau: Reseau = payload.object === "instagram" ? "instagram" : "facebook";
  for (const entree of payload.entry ?? []) {
    const compte = await compteParExterne(admin, reseau, entree.id);
    if (!compte) continue;
    for (const changement of entree.changes ?? []) {
      const v = changement.value ?? {};
      // Page : field=feed, item=comment ; Instagram : field=comments.
      const estCommentaireFb = changement.field === "feed" && v.item === "comment" && v.verb === "add";
      const estCommentaireIg = changement.field === "comments";
      if (!estCommentaireFb && !estCommentaireIg) continue;
      const from = v.from as { id?: string; name?: string; username?: string } | undefined;
      if (from?.id && (from.id === compte.external_account_id || from.id === compte.external_parent_id)) continue;
      const commentId = String(v.comment_id ?? v.id ?? "");
      const postId = String(v.post_id ?? (v.media as { id?: string } | undefined)?.id ?? "");
      if (!commentId || !postId) continue;
      const { data: cible } = await admin.from("social_publication_cibles").select("id").eq("reseau", reseau).eq("external_post_id", postId).maybeSingle();
      await admin.from("social_commentaires").upsert(
        {
          reseau,
          compte_id: compte.id,
          cible_id: cible?.id ?? null,
          external_comment_id: commentId,
          external_post_id: postId,
          external_parent_id: (v.parent_id as string | undefined) && v.parent_id !== postId ? String(v.parent_id) : null,
          auteur_nom: from?.name ?? from?.username ?? null,
          auteur_external_id: from?.id ?? null,
          contenu: String(v.message ?? v.text ?? ""),
          publie_externe_at: typeof v.created_time === "number" ? new Date(v.created_time * 1000).toISOString() : new Date((entree.time ?? Date.now() / 1000) * 1000).toISOString(),
        },
        { onConflict: "reseau,external_comment_id", ignoreDuplicates: true },
      );
    }
    for (const m of entree.messaging ?? []) {
      if (!m.message?.mid) continue;
      const sortant = m.message.is_echo === true;
      const interlocuteur = sortant ? m.recipient?.id : m.sender?.id;
      if (!interlocuteur) continue;
      await admin.from("social_messages").upsert(
        {
          reseau,
          compte_id: compte.id,
          // Sans identifiant de conversation dans l'événement, l'interlocuteur sert de fil.
          external_conversation_id: `interlocuteur:${interlocuteur}`,
          external_message_id: m.message.mid,
          sens: sortant ? "sortant" : "entrant",
          auteur_external_id: sortant ? null : interlocuteur,
          contenu: m.message.text ?? "[pièce jointe]",
          envoye_externe_at: m.timestamp ? new Date(m.timestamp).toISOString() : null,
          statut: sortant ? "envoye" : "recu",
        },
        { onConflict: "reseau,external_message_id", ignoreDuplicates: true },
      );
    }
  }
}

async function traiterLinkedIn(admin: SupabaseClient, payload: { type?: string; notifications?: Array<{ action?: string; sourcePost?: string; decoratedSourcePost?: { entity?: string }; generatedActivity?: string; decoratedGeneratedActivity?: { comment?: { text?: string; entity?: string } }; actor?: string; lastModifiedAt?: number }> }) {
  const compte = await admin.from("social_comptes").select("id,external_account_id").eq("reseau", "linkedin").neq("statut", "revoque").maybeSingle();
  if (!compte.data) return;
  for (const n of payload.notifications ?? []) {
    if (n.action !== "COMMENT") continue;
    const postUrn = n.sourcePost ?? n.decoratedSourcePost?.entity;
    const commentUrn = n.decoratedGeneratedActivity?.comment?.entity ?? n.generatedActivity;
    if (!postUrn || !commentUrn) continue;
    const { data: cible } = await admin.from("social_publication_cibles").select("id").eq("reseau", "linkedin").eq("external_post_id", postUrn).maybeSingle();
    await admin.from("social_commentaires").upsert(
      {
        reseau: "linkedin",
        compte_id: compte.data.id,
        cible_id: cible?.id ?? null,
        external_comment_id: commentUrn,
        external_post_id: postUrn,
        auteur_nom: "Membre LinkedIn",
        auteur_external_id: n.actor ?? null,
        // Le texte n'est pas toujours inclus : il sera complété par la synchronisation.
        contenu: n.decoratedGeneratedActivity?.comment?.text ?? "",
        publie_externe_at: n.lastModifiedAt ? new Date(n.lastModifiedAt).toISOString() : null,
      },
      { onConflict: "reseau,external_comment_id", ignoreDuplicates: true },
    );
  }
}

export async function traiterEvenementsWebhook(admin: SupabaseClient, limite = 50) {
  const { data: evenements } = await admin
    .from("social_webhook_evenements")
    .select("id,fournisseur,payload,tentatives")
    .in("statut", ["recu", "echec"])
    .lte("prochaine_tentative_at", new Date().toISOString())
    .order("id")
    .limit(limite);
  let traites = 0;
  let abandonnes = 0;
  for (const e of evenements ?? []) {
    try {
      if (e.fournisseur === "meta") await traiterMeta(admin, e.payload);
      else await traiterLinkedIn(admin, e.payload);
      await admin.from("social_webhook_evenements").update({ statut: "traite", traite_at: new Date().toISOString(), erreur: null }).eq("id", e.id);
      traites++;
    } catch (erreur) {
      const tentatives = e.tentatives + 1;
      const delai = delaiReprise(tentatives);
      // Après 5 échecs : file des échecs définitifs (« abandonne »), visible dans le journal.
      const abandon = tentatives >= TENTATIVES_WEBHOOK || delai === null;
      if (abandon) abandonnes++;
      await admin
        .from("social_webhook_evenements")
        .update({ statut: abandon ? "abandonne" : "echec", tentatives, erreur: messageErreur(erreur).slice(0, 1000), prochaine_tentative_at: new Date(Date.now() + (delai ?? 0)).toISOString() })
        .eq("id", e.id);
    }
  }
  return { traites, abandonnes };
}
