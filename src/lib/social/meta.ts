import { createHmac } from "node:crypto";
import { configMeta, modeSimulation, SCOPES_META } from "@/lib/social/config";
import { requete, type ClassificateurErreur } from "@/lib/social/http";
import {
  ErreurSocial,
  nonSupporte,
  type Capacites,
  type CommentaireExterne,
  type ContenuAPublier,
  type MediaAPublier,
  type MessageExterne,
  type PublicationExterne,
  type ResultatEcriture,
  type ResultatPublication,
  type SocialProvider,
  type Statistiques,
} from "@/lib/social/provider";
import { validerContenu } from "@/lib/social/contenu";

// MetaConnector : Page Facebook ELSATIA et compte Instagram professionnel lié,
// via la Graph API officielle (graph.facebook.com) et le jeton de Page.
// Références : Pages API, Instagram Platform (Content Publishing, Insights),
// Messenger Platform (Conversations, Send API), Webhooks.

const GRAPH = "https://graph.facebook.com";

type ErreurGraph = { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; type?: string } };

export const classifierMeta: ClassificateurErreur = (statut, corps) => {
  const e = (corps as ErreurGraph)?.error;
  const message = e?.message ?? `Erreur Meta HTTP ${statut}`;
  const code = e?.code;
  if (code === 190 || code === 102 || code === 463 || code === 467) return { code: "jeton_expire", message };
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) return { code: "permission", message };
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80001 || code === 80002 || code === 9) return { code: "limite", message };
  if (e?.is_transient || code === 1 || code === 2) return { code: "transitoire", message };
  if (code === 100 || code === 368 || code === 506) return { code: "validation", message };
  if (statut >= 500) return { code: "transitoire", message };
  return { code: "inconnu", message };
};

function exigerConfig() {
  const config = configMeta();
  if (!config.appId || !config.appSecret) throw new ErreurSocial("non_configure", "META_APP_ID et META_APP_SECRET doivent être configurés");
  return { ...config, appId: config.appId, appSecret: config.appSecret };
}

/** Preuve de possession du secret d'application, exigée pour les appels serveur. */
function preuve(jeton: string, secret: string) {
  return createHmac("sha256", secret).update(jeton).digest("hex");
}

/** Lecture Graph API (GET uniquement) : diagnostic et synchronisation. */
export async function graphGet<T>(chemin: string, jeton: string, params: Record<string, string> = {}): Promise<T> {
  const { version, appSecret } = exigerConfig();
  const url = new URL(`${GRAPH}/${version}/${chemin.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Jeton d'application (« id|secret ») : pas de preuve, elle ne s'applique qu'aux jetons utilisateur/Page.
  if (!jeton.includes("|")) url.searchParams.set("appsecret_proof", preuve(jeton, appSecret));
  const { corps } = await requete<T>(url.toString(), { headers: { Authorization: `Bearer ${jeton}` }, classifier: classifierMeta });
  return corps;
}

async function graphPost<T>(chemin: string, jeton: string, params: Record<string, string>, ecriture = true): Promise<T> {
  const { version, appSecret } = exigerConfig();
  const corps = new URLSearchParams({ ...params, appsecret_proof: preuve(jeton, appSecret) });
  const { corps: reponse } = await requete<T>(`${GRAPH}/${version}/${chemin.replace(/^\//, "")}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: corps,
    classifier: classifierMeta,
    ecriture,
  });
  return reponse;
}

// ─────────────────────────────────────────────────────────────
// OAuth (Facebook Login, côté serveur)
// ─────────────────────────────────────────────────────────────

export function urlAutorisationMeta(etat: string, redirectUri: string): string {
  const { appId, version, configId } = exigerConfig();
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", etat);
  url.searchParams.set("response_type", "code");
  // Facebook Login for Business : la configuration remplace la liste de scopes.
  if (configId) url.searchParams.set("config_id", configId);
  else url.searchParams.set("scope", SCOPES_META.join(","));
  return url.toString();
}

export type PageMeta = {
  id: string;
  nom: string;
  jeton: string;
  taches: string[];
  instagram: { id: string; username: string | null; nom: string | null } | null;
};

export type ResultatOAuthMeta = {
  jetonUtilisateur: string;
  expireAt: string | null;
  dataAccessExpireAt: string | null;
  scopes: string[];
  pages: PageMeta[];
};

export async function echangerCodeMeta(code: string, redirectUri: string): Promise<ResultatOAuthMeta> {
  const { appId, appSecret, version } = exigerConfig();
  const urlCourt = new URL(`${GRAPH}/${version}/oauth/access_token`);
  urlCourt.search = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }).toString();
  const court = await requete<{ access_token: string }>(urlCourt.toString(), { classifier: classifierMeta });

  // Jeton utilisateur longue durée (~60 jours) : les jetons de Page qui en
  // dérivent n'expirent pas tant que l'accès n'est pas révoqué.
  const urlLong = new URL(`${GRAPH}/${version}/oauth/access_token`);
  urlLong.search = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: court.corps.access_token }).toString();
  const long = await requete<{ access_token: string }>(urlLong.toString(), { classifier: classifierMeta });
  const jetonUtilisateur = long.corps.access_token;

  const debug = await inspecterJetonMeta(jetonUtilisateur);
  const pages = await listerPages(jetonUtilisateur);
  return { jetonUtilisateur, expireAt: debug.expireAt, dataAccessExpireAt: debug.dataAccessExpireAt, scopes: debug.scopes, pages };
}

export async function inspecterJetonMeta(jeton: string) {
  const { appId, appSecret } = exigerConfig();
  const donnees = await graphGet<{ data: { is_valid: boolean; type?: string; expires_at?: number; data_access_expires_at?: number; scopes?: string[]; granular_scopes?: Array<{ scope: string; target_ids?: string[] }> } }>(
    "debug_token",
    `${appId}|${appSecret}`,
    { input_token: jeton },
  );
  const d = donnees.data;
  const date = (s?: number) => (s && s > 0 ? new Date(s * 1000).toISOString() : null);
  return {
    valide: d.is_valid,
    type: d.type ?? null,
    expireAt: date(d.expires_at),
    dataAccessExpireAt: date(d.data_access_expires_at),
    scopes: d.scopes ?? [],
    // Permissions accordées par ressource (Page, compte Instagram).
    scopesParRessource: (d.granular_scopes ?? []).map((g) => ({ scope: g.scope, ressources: g.target_ids ?? [] })),
  };
}

/** Vérifie la paire META_APP_ID / META_APP_SECRET sans aucune donnée de compte. */
export async function verifierApplicationMeta() {
  const { appId, appSecret } = exigerConfig();
  return graphGet<{ id: string; name?: string }>(appId, `${appId}|${appSecret}`, { fields: "id,name" });
}

async function listerPages(jetonUtilisateur: string): Promise<PageMeta[]> {
  const reponse = await graphGet<{ data: Array<{ id: string; name: string; access_token: string; tasks?: string[]; instagram_business_account?: { id: string; username?: string; name?: string } }> }>(
    "me/accounts",
    jetonUtilisateur,
    { fields: "id,name,access_token,tasks,instagram_business_account{id,username,name}", limit: "100" },
  );
  return reponse.data.map((p) => ({
    id: p.id,
    nom: p.name,
    jeton: p.access_token,
    taches: p.tasks ?? [],
    instagram: p.instagram_business_account
      ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? null, nom: p.instagram_business_account.name ?? null }
      : null,
  }));
}

/** Abonne l'application aux webhooks de la Page (commentaires, messages). */
export async function abonnerWebhooksPage(pageId: string, jetonPage: string, avecMessages: boolean) {
  const champs = avecMessages ? "feed,messages" : "feed";
  await graphPost(`${pageId}/subscribed_apps`, jetonPage, { subscribed_fields: champs }, false);
}

/** Révoque l'autorisation de l'application côté Meta. */
export async function revoquerMeta(jeton: string) {
  const { version, appSecret } = exigerConfig();
  await requete(`${GRAPH}/${version}/me/permissions?appsecret_proof=${preuve(jeton, appSecret)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jeton}` },
    classifier: classifierMeta,
  });
}

// ─────────────────────────────────────────────────────────────
// Connecteur
// ─────────────────────────────────────────────────────────────

const AUCUNE_PROGRAMMATION_IG = "L’API Instagram ne propose pas de programmation : ELSATIA Social publie à l’heure prévue.";

type CompteMeta = { reseau: "facebook" | "instagram"; externalAccountId: string; pageId: string; scopes: string[] };

const aScope = (scopes: string[], scope: string) => scopes.length === 0 || scopes.includes(scope);

export class MetaConnector implements SocialProvider {
  readonly reseau: "facebook" | "instagram";
  readonly capacites: Capacites;

  constructor(
    private readonly compte: CompteMeta,
    private readonly jetonPage: string,
  ) {
    this.reseau = compte.reseau;
    const s = compte.scopes;
    const scope = (nom: string, note?: string) => (aScope(s, nom) ? { disponible: true as const, note } : { disponible: false as const, raison: `Permission ${nom} non accordée` });
    if (compte.reseau === "facebook") {
      this.capacites = {
        texteSeul: scope("pages_manage_posts"),
        lien: scope("pages_manage_posts"),
        image: scope("pages_manage_posts"),
        video: scope("pages_manage_posts"),
        reel: scope("pages_manage_posts", "API Reels disponible ; publié comme vidéo de Page en V1"),
        programmationNative: { disponible: true, note: "Disponible via API ; non utilisée : programmation commune ELSATIA Social" },
        lecturePublications: scope("pages_read_engagement"),
        statistiques: scope("read_insights", "Les « impressions » sont remplacées par les « vues » (post_media_view) depuis novembre 2025"),
        commentaires: scope("pages_read_user_content"),
        reponseCommentaire: scope("pages_manage_engagement"),
        messages: scope("pages_messaging", "Messenger : réponse possible dans les 24 h suivant le dernier message reçu"),
        reponseMessage: scope("pages_messaging", "Fenêtre de 24 h"),
        webhooks: scope("pages_manage_metadata"),
      };
    } else {
      this.capacites = {
        texteSeul: { disponible: false, raison: "Instagram n’accepte pas de publication sans image ni vidéo" },
        lien: { disponible: false, raison: "Les liens ne sont pas cliquables dans une légende Instagram" },
        image: scope("instagram_content_publish", "JPEG uniquement, 100 publications API par 24 h"),
        video: scope("instagram_content_publish", "Publié en Reel"),
        reel: scope("instagram_content_publish"),
        programmationNative: { disponible: false, raison: AUCUNE_PROGRAMMATION_IG },
        lecturePublications: scope("instagram_basic"),
        statistiques: scope("instagram_manage_insights", "La métrique « impressions » est retirée depuis avril 2025 : « vues » à la place"),
        commentaires: scope("instagram_manage_comments"),
        reponseCommentaire: scope("instagram_manage_comments"),
        messages: scope("instagram_manage_messages", "Exige une application d’entreprise vérifiée ; fenêtre de 24 h"),
        reponseMessage: scope("instagram_manage_messages", "Fenêtre de 24 h"),
        webhooks: scope("instagram_manage_comments"),
      };
    }
  }

  createDraft(contenu: Omit<ContenuAPublier, "cleIdempotence">) {
    return validerContenu(this.reseau, {
      texte: contenu.texte,
      lienUrl: contenu.lienUrl,
      medias: contenu.medias.map((m) => ({ type: m.type, mimeType: m.mimeType, tailleOctets: m.tailleOctets, largeur: m.largeur, hauteur: m.hauteur, dureeSecondes: m.dureeSecondes })),
    });
  }

  private requeteSimulee(chemin: string, params: Record<string, string>): ResultatPublication {
    return { externalPostId: `simulation:${crypto.randomUUID()}`, externalUrl: null, simule: true, apercuRequete: { methode: "POST", chemin, params } };
  }

  async publishPost(contenu: ContenuAPublier): Promise<ResultatPublication> {
    const { erreurs } = this.createDraft(contenu);
    if (erreurs.length) throw new ErreurSocial("validation", erreurs.join(" "));
    return this.reseau === "facebook" ? this.publierFacebook(contenu) : this.publierInstagram(contenu);
  }

  private async publierFacebook(contenu: ContenuAPublier): Promise<ResultatPublication> {
    const page = this.compte.pageId;
    const media = contenu.medias[0];
    const texte = contenu.lienUrl && media ? `${contenu.texte}\n\n${contenu.lienUrl}` : contenu.texte;
    if (!media) {
      const params: Record<string, string> = { message: texte };
      if (contenu.lienUrl) params.link = contenu.lienUrl;
      if (modeSimulation()) return this.requeteSimulee(`${page}/feed`, params);
      const r = await graphPost<{ id: string }>(`${page}/feed`, this.jetonPage, params);
      return { externalPostId: r.id, externalUrl: `https://www.facebook.com/${r.id}`, simule: false };
    }
    if (media.type === "image") {
      const params = { url: media.urlSignee, message: texte, published: "true" };
      if (modeSimulation()) return this.requeteSimulee(`${page}/photos`, { ...params, url: "[lien signé temporaire]" });
      const r = await graphPost<{ id: string; post_id?: string }>(`${page}/photos`, this.jetonPage, params);
      const id = r.post_id ?? r.id;
      return { externalPostId: id, externalUrl: `https://www.facebook.com/${id}`, simule: false };
    }
    const params = { file_url: media.urlSignee, description: texte };
    if (modeSimulation()) return this.requeteSimulee(`${page}/videos`, { ...params, file_url: "[lien signé temporaire]" });
    const r = await graphPost<{ id: string }>(`${page}/videos`, this.jetonPage, params);
    return { externalPostId: r.id, externalUrl: `https://www.facebook.com/${page}/videos/${r.id}`, simule: false };
  }

  private async attendreConteneur(conteneurId: string, delaiMaxMs: number): Promise<"FINISHED" | "IN_PROGRESS"> {
    const debut = Date.now();
    for (;;) {
      const { status_code } = await graphGet<{ status_code: string }>(conteneurId, this.jetonPage, { fields: "status_code" });
      if (status_code === "FINISHED" || status_code === "PUBLISHED") return "FINISHED";
      if (status_code === "ERROR" || status_code === "EXPIRED") throw new ErreurSocial("validation", `Instagram a refusé le média (état ${status_code})`, { conteneurInvalide: true });
      if (Date.now() - debut > delaiMaxMs) return "IN_PROGRESS";
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  private async publierInstagram(contenu: ContenuAPublier): Promise<ResultatPublication> {
    const ig = this.compte.externalAccountId;
    const media = contenu.medias[0];
    if (!media) throw new ErreurSocial("validation", "Instagram exige un média");
    const params: Record<string, string> =
      media.type === "image"
        ? { image_url: media.urlSignee, caption: contenu.texte, ...(media.texteAlternatif ? { alt_text: media.texteAlternatif } : {}) }
        : { media_type: "REELS", video_url: media.urlSignee, caption: contenu.texte, share_to_feed: "true" };
    if (modeSimulation()) {
      return this.requeteSimulee(`${ig}/media puis ${ig}/media_publish`, { ...params, ...(params.image_url ? { image_url: "[lien signé temporaire]" } : { video_url: "[lien signé temporaire]" }) });
    }

    let conteneur = contenu.conteneurExistant ?? null;
    if (!conteneur) {
      // La création du conteneur ne publie rien : elle peut être rejouée sans risque.
      const r = await graphPost<{ id: string }>(`${ig}/media`, this.jetonPage, params, false);
      conteneur = r.id;
    }
    const etat = await this.attendreConteneur(conteneur, media.type === "video" ? 45_000 : 20_000);
    if (etat === "IN_PROGRESS") {
      throw new ErreurSocial("transitoire", "Instagram traite encore la vidéo : nouvelle tentative programmée", { conteneur });
    }
    const publie = await graphPost<{ id: string }>(`${ig}/media_publish`, this.jetonPage, { creation_id: conteneur });
    let permalien: string | null = null;
    try {
      permalien = (await graphGet<{ permalink?: string }>(publie.id, this.jetonPage, { fields: "permalink" })).permalink ?? null;
    } catch {
      permalien = null;
    }
    return { externalPostId: publie.id, externalUrl: permalien, simule: false };
  }

  async schedulePost(): Promise<ResultatPublication> {
    // La programmation est gérée par ELSATIA Social (cron) pour les trois réseaux,
    // afin que la validation humaine et l'annulation restent sous notre contrôle.
    return nonSupporte("programmation native (programmation gérée par ELSATIA Social)", this.reseau);
  }

  async uploadImage(media: MediaAPublier): Promise<string> {
    // Meta récupère lui-même le média depuis une URL HTTPS : pas de téléversement préalable.
    return media.urlSignee;
  }

  async uploadVideo(media: MediaAPublier): Promise<string> {
    return media.urlSignee;
  }

  async getPosts(limite = 25): Promise<PublicationExterne[]> {
    if (this.reseau === "facebook") {
      const r = await graphGet<{ data: Array<{ id: string; message?: string; created_time?: string; permalink_url?: string }> }>(`${this.compte.pageId}/published_posts`, this.jetonPage, {
        fields: "id,message,created_time,permalink_url",
        limit: String(limite),
      });
      return r.data.map((p) => ({ externalPostId: p.id, texte: p.message ?? "", publieAt: p.created_time ?? null, url: p.permalink_url ?? null }));
    }
    const r = await graphGet<{ data: Array<{ id: string; caption?: string; timestamp?: string; permalink?: string }> }>(`${this.compte.externalAccountId}/media`, this.jetonPage, {
      fields: "id,caption,timestamp,permalink",
      limit: String(limite),
    });
    return r.data.map((p) => ({ externalPostId: p.id, texte: p.caption ?? "", publieAt: p.timestamp ?? null, url: p.permalink ?? null }));
  }

  async getAnalytics(ids: string[]): Promise<Map<string, Statistiques>> {
    const resultat = new Map<string, Statistiques>();
    for (const id of ids) {
      resultat.set(id, this.reseau === "facebook" ? await this.statsFacebook(id) : await this.statsInstagram(id));
    }
    return resultat;
  }

  private async lireInsights(id: string, metriques: string[]): Promise<Record<string, number>> {
    const valeurs: Record<string, number> = {};
    // Une métrique retirée par Meta fait échouer toute la requête : on interroge
    // chaque métrique séparément pour ne perdre que celle-ci.
    for (const metrique of metriques) {
      try {
        const r = await graphGet<{ data: Array<{ name: string; values?: Array<{ value: number | Record<string, number> }> }> }>(`${id}/insights`, this.jetonPage, { metric: metrique });
        const valeur = r.data[0]?.values?.[0]?.value;
        if (typeof valeur === "number") valeurs[metrique] = valeur;
        else if (valeur && typeof valeur === "object") valeurs[metrique] = Object.values(valeur).reduce((a, b) => a + Number(b || 0), 0);
      } catch (erreur) {
        if (erreur instanceof ErreurSocial && (erreur.code === "jeton_expire" || erreur.code === "limite")) throw erreur;
      }
    }
    return valeurs;
  }

  private async statsFacebook(id: string): Promise<Statistiques> {
    const champs = await graphGet<{ shares?: { count?: number }; comments?: { summary?: { total_count?: number } }; reactions?: { summary?: { total_count?: number } } }>(id, this.jetonPage, {
      fields: "shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)",
    }).catch((erreur) => {
      if (erreur instanceof ErreurSocial && erreur.code === "jeton_expire") throw erreur;
      return {} as Record<string, never>;
    });
    const insights = await this.lireInsights(id, ["post_media_view", "post_total_media_view_unique", "post_clicks"]);
    return {
      impressions: null, // métrique retirée par Meta (nov. 2025), remplacée par les vues
      vues: insights.post_media_view ?? null,
      portee: insights.post_total_media_view_unique ?? null,
      likes: champs.reactions?.summary?.total_count ?? null,
      commentaires: champs.comments?.summary?.total_count ?? null,
      partages: champs.shares?.count ?? (champs.shares ? 0 : null),
      clics: insights.post_clicks ?? null,
      enregistrements: null,
      brutes: { ...insights, champs },
    };
  }

  private async statsInstagram(id: string): Promise<Statistiques> {
    const insights = await this.lireInsights(id, ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions"]);
    return {
      impressions: null, // retirée par Meta (avr. 2025)
      vues: insights.views ?? null,
      portee: insights.reach ?? null,
      likes: insights.likes ?? null,
      commentaires: insights.comments ?? null,
      partages: insights.shares ?? null,
      clics: null, // non fournie par l'API au niveau d'une publication
      enregistrements: insights.saved ?? null,
      brutes: insights,
    };
  }

  async getFollowers(): Promise<number | null> {
    if (this.reseau === "facebook") {
      const r = await graphGet<{ followers_count?: number; fan_count?: number }>(this.compte.pageId, this.jetonPage, { fields: "followers_count,fan_count" });
      return r.followers_count ?? r.fan_count ?? null;
    }
    const r = await graphGet<{ followers_count?: number }>(this.compte.externalAccountId, this.jetonPage, { fields: "followers_count" });
    return r.followers_count ?? null;
  }

  async getComments(postId: string): Promise<CommentaireExterne[]> {
    if (this.reseau === "facebook") {
      const r = await graphGet<{ data: Array<{ id: string; message?: string; created_time?: string; from?: { id: string; name?: string }; parent?: { id: string } }> }>(`${postId}/comments`, this.jetonPage, {
        fields: "id,message,created_time,from{id,name},parent{id}",
        filter: "stream",
        order: "reverse_chronological",
        limit: "100",
      });
      return r.data.map((c) => ({
        externalCommentId: c.id,
        externalPostId: postId,
        externalParentId: c.parent?.id ?? null,
        auteurNom: c.from?.name ?? null,
        auteurId: c.from?.id ?? null,
        contenu: c.message ?? "",
        publieAt: c.created_time ?? null,
        estPropre: c.from?.id === this.compte.pageId,
      }));
    }
    const r = await graphGet<{ data: Array<{ id: string; text?: string; timestamp?: string; username?: string; from?: { id: string; username?: string }; replies?: { data: Array<{ id: string; text?: string; timestamp?: string; username?: string; from?: { id: string } }> } }> }>(
      `${postId}/comments`,
      this.jetonPage,
      { fields: "id,text,timestamp,username,from{id,username},replies{id,text,timestamp,username,from{id}}", limit: "50" },
    );
    const liste: CommentaireExterne[] = [];
    for (const c of r.data) {
      liste.push({ externalCommentId: c.id, externalPostId: postId, externalParentId: null, auteurNom: c.username ?? null, auteurId: c.from?.id ?? null, contenu: c.text ?? "", publieAt: c.timestamp ?? null, estPropre: c.from?.id === this.compte.externalAccountId });
      for (const rep of c.replies?.data ?? []) {
        liste.push({ externalCommentId: rep.id, externalPostId: postId, externalParentId: c.id, auteurNom: rep.username ?? null, auteurId: rep.from?.id ?? null, contenu: rep.text ?? "", publieAt: rep.timestamp ?? null, estPropre: rep.from?.id === this.compte.externalAccountId });
      }
    }
    return liste;
  }

  async replyToComment(commentaire: { externalCommentId: string; externalPostId: string }, texte: string): Promise<ResultatEcriture> {
    const chemin = this.reseau === "facebook" ? `${commentaire.externalCommentId}/comments` : `${commentaire.externalCommentId}/replies`;
    if (modeSimulation()) return { externalId: null, simule: true };
    const r = await graphPost<{ id: string }>(chemin, this.jetonPage, { message: texte });
    return { externalId: r.id, simule: false };
  }

  async getMessages(): Promise<MessageExterne[]> {
    if (!this.capacites.messages.disponible) return nonSupporte("messages", this.reseau);
    const r = await graphGet<{ data: Array<{ id: string; messages?: { data: Array<{ id: string; message?: string; created_time?: string; from?: { id: string; name?: string; username?: string } }> } }> }>(
      `${this.compte.pageId}/conversations`,
      this.jetonPage,
      { platform: this.reseau === "facebook" ? "messenger" : "instagram", fields: "id,updated_time,messages.limit(20){id,message,created_time,from}", limit: "25" },
    );
    const proprio = this.reseau === "facebook" ? this.compte.pageId : this.compte.externalAccountId;
    return r.data.flatMap((conv) =>
      (conv.messages?.data ?? []).map((m) => ({
        externalConversationId: conv.id,
        externalMessageId: m.id,
        sens: m.from?.id === proprio ? ("sortant" as const) : ("entrant" as const),
        auteurNom: m.from?.name ?? m.from?.username ?? null,
        auteurId: m.from?.id ?? null,
        contenu: m.message ?? "",
        envoyeAt: m.created_time ?? null,
      })),
    );
  }

  async replyToMessage(destinataire: { auteurId: string }, texte: string): Promise<ResultatEcriture> {
    if (!this.capacites.reponseMessage.disponible) return nonSupporte("réponse aux messages", this.reseau);
    if (modeSimulation()) return { externalId: null, simule: true };
    const { version, appSecret } = exigerConfig();
    const { corps } = await requete<{ message_id?: string }>(`${GRAPH}/${version}/${this.compte.pageId}/messages?appsecret_proof=${preuve(this.jetonPage, appSecret)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.jetonPage}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: destinataire.auteurId }, messaging_type: "RESPONSE", message: { text: texte } }),
      classifier: classifierMeta,
      ecriture: true,
    });
    return { externalId: corps.message_id ?? null, simule: false };
  }
}
