import { configLinkedIn, modeSimulation, SCOPES_LINKEDIN } from "@/lib/social/config";
import { codeParStatutHttp, requete, type ClassificateurErreur } from "@/lib/social/http";
import {
  ErreurSocial,
  nonSupporte,
  type Capacites,
  type CommentaireExterne,
  type ContenuAPublier,
  type MediaAPublier,
  type PublicationExterne,
  type ResultatEcriture,
  type ResultatPublication,
  type SocialProvider,
  type Statistiques,
} from "@/lib/social/provider";
import { validerContenu } from "@/lib/social/contenu";

// LinkedInConnector : Page Entreprise ELSATIA (organisation auteur) via la
// Community Management API versionnée (https://api.linkedin.com/rest/...).
// En-têtes obligatoires : LinkedIn-Version (YYYYMM) et X-Restli-Protocol-Version 2.0.0.

const API = "https://api.linkedin.com/rest";
const OAUTH = "https://www.linkedin.com/oauth/v2";

export const classifierLinkedIn: ClassificateurErreur = (statut, corps) => {
  const c = corps as { message?: string; serviceErrorCode?: number } | string;
  const message = typeof c === "string" ? c.slice(0, 300) || `Erreur LinkedIn HTTP ${statut}` : c?.message ?? `Erreur LinkedIn HTTP ${statut}`;
  return { code: codeParStatutHttp(statut), message };
};

function exigerConfig() {
  const config = configLinkedIn();
  if (!config.clientId || !config.clientSecret) throw new ErreurSocial("non_configure", "LINKEDIN_CLIENT_ID et LINKEDIN_CLIENT_SECRET doivent être configurés");
  return { ...config, clientId: config.clientId, clientSecret: config.clientSecret };
}

function entetes(jeton: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${jeton}`,
    "LinkedIn-Version": exigerConfig().version,
    "X-Restli-Protocol-Version": "2.0.0",
    ...extra,
  };
}

/** Lecture REST LinkedIn (GET uniquement) : diagnostic. */
export async function lectureLinkedIn<T>(chemin: string, jeton: string): Promise<T> {
  const { corps } = await requete<T>(`${API}/${chemin.replace(/^\//, "")}`, { headers: entetes(jeton), classifier: classifierLinkedIn });
  return corps;
}

export const urnOrganisation = (id: string) => `urn:li:organization:${id}`;

// Échappement du « little text format » de LinkedIn. Les hashtags sont
// convertis dans le gabarit officiel ; tout autre caractère réservé est échappé,
// sinon LinkedIn tronque ou rejette le texte.
const RESERVES = /[|{}@[\]()<>#\\*_~]/g;
export function echapperCommentaire(texte: string): string {
  const morceaux: string[] = [];
  let dernier = 0;
  for (const m of texte.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const debutDiese = (m.index ?? 0) + m[1].length;
    morceaux.push(texte.slice(dernier, debutDiese).replace(RESERVES, (c) => `\\${c}`));
    morceaux.push(`{hashtag|\\#|${m[2].replace(RESERVES, (c) => `\\${c}`)}}`);
    dernier = debutDiese + 1 + m[2].length;
  }
  morceaux.push(texte.slice(dernier).replace(RESERVES, (c) => `\\${c}`));
  return morceaux.join("");
}

// ─────────────────────────────────────────────────────────────
// OAuth 2.0 (3-legged, côté serveur)
// ─────────────────────────────────────────────────────────────

export function urlAutorisationLinkedIn(etat: string, redirectUri: string): string {
  const { clientId } = exigerConfig();
  const url = new URL(`${OAUTH}/authorization`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", etat);
  url.searchParams.set("scope", SCOPES_LINKEDIN.join(" "));
  return url.toString();
}

export type JetonsLinkedIn = {
  jeton: string;
  expireAt: string;
  refresh: string | null;
  refreshExpireAt: string | null;
  scopes: string[];
};

async function demanderJeton(params: Record<string, string>): Promise<JetonsLinkedIn> {
  const { clientId, clientSecret } = exigerConfig();
  const { corps } = await requete<{ access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string }>(`${OAUTH}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }),
    classifier: classifierLinkedIn,
  });
  const maintenant = Date.now();
  return {
    jeton: corps.access_token,
    expireAt: new Date(maintenant + corps.expires_in * 1000).toISOString(),
    // Jeton de rafraîchissement : uniquement pour les partenaires approuvés par LinkedIn.
    refresh: corps.refresh_token ?? null,
    refreshExpireAt: corps.refresh_token_expires_in ? new Date(maintenant + corps.refresh_token_expires_in * 1000).toISOString() : null,
    scopes: (corps.scope ?? "").split(/[ ,]+/).filter(Boolean),
  };
}

export function echangerCodeLinkedIn(code: string, redirectUri: string) {
  return demanderJeton({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function rafraichirJetonLinkedIn(refresh: string) {
  return demanderJeton({ grant_type: "refresh_token", refresh_token: refresh });
}

export async function inspecterJetonLinkedIn(jeton: string) {
  const { clientId, clientSecret } = exigerConfig();
  const { corps } = await requete<{ active: boolean; status?: string; expires_at?: number; scope?: string }>(`${OAUTH}/introspectToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token: jeton }),
    classifier: classifierLinkedIn,
  });
  return {
    actif: corps.active,
    statut: corps.status ?? null,
    expireAt: corps.expires_at ? new Date(corps.expires_at * 1000).toISOString() : null,
    scopes: (corps.scope ?? "").split(/[ ,]+/).filter(Boolean),
  };
}

export async function revoquerLinkedIn(jeton: string) {
  const { clientId, clientSecret } = exigerConfig();
  await requete(`${OAUTH}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token: jeton }),
    classifier: classifierLinkedIn,
  });
}

/** Organisations dont le membre connecté est administrateur. */
export async function listerOrganisationsAdministrees(jeton: string): Promise<Array<{ id: string; nom: string }>> {
  const { corps } = await requete<{ elements: Array<{ organization: string }> }>(`${API}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50`, {
    headers: entetes(jeton),
    classifier: classifierLinkedIn,
  });
  const organisations: Array<{ id: string; nom: string }> = [];
  for (const e of corps.elements ?? []) {
    const id = e.organization.split(":").pop() ?? "";
    if (!/^\d+$/.test(id)) continue;
    let nom = `Organisation ${id}`;
    try {
      const org = await requete<{ localizedName?: string }>(`${API}/organizations/${id}`, { headers: entetes(jeton), classifier: classifierLinkedIn });
      nom = org.corps.localizedName ?? nom;
    } catch {
      // Nom indisponible : l'identifiant suffit pour la sélection.
    }
    organisations.push({ id, nom });
  }
  return organisations;
}

// ─────────────────────────────────────────────────────────────
// Connecteur
// ─────────────────────────────────────────────────────────────

const NON_PROGRAMMABLE = "L’API Posts de LinkedIn n’accepte que des publications immédiates : ELSATIA Social publie à l’heure prévue.";
const MESSAGERIE_INDISPONIBLE = "LinkedIn ne propose pas d’API de messagerie pour les Pages Entreprise (réservée à des partenaires).";

export class LinkedInConnector implements SocialProvider {
  readonly reseau = "linkedin" as const;
  readonly capacites: Capacites;
  private readonly auteur: string;

  constructor(
    organisationId: string,
    private readonly jeton: string,
    scopes: string[],
  ) {
    this.auteur = urnOrganisation(organisationId);
    const scope = (nom: string, note?: string) => (scopes.length === 0 || scopes.includes(nom) ? { disponible: true as const, note } : { disponible: false as const, raison: `Permission ${nom} non accordée` });
    this.capacites = {
      texteSeul: scope("w_organization_social"),
      lien: scope("w_organization_social"),
      image: scope("w_organization_social"),
      video: scope("w_organization_social", "MP4, 3 s à 30 min ; téléversement par le serveur"),
      reel: { disponible: false, raison: "LinkedIn n’a pas de format Reel : publié comme vidéo" },
      programmationNative: { disponible: false, raison: NON_PROGRAMMABLE },
      lecturePublications: scope("r_organization_social"),
      statistiques: scope("rw_organization_admin", "Pas de portée unique par publication : impressions uniques à la place"),
      commentaires: scope("r_organization_social"),
      reponseCommentaire: scope("w_organization_social"),
      messages: { disponible: false, raison: MESSAGERIE_INDISPONIBLE },
      reponseMessage: { disponible: false, raison: MESSAGERIE_INDISPONIBLE },
      webhooks: scope("rw_organization_admin", "Notifications d’actions sociales de l’organisation"),
    };
  }

  createDraft(contenu: Omit<ContenuAPublier, "cleIdempotence">) {
    return validerContenu("linkedin", {
      texte: contenu.texte,
      lienUrl: contenu.lienUrl,
      medias: contenu.medias.map((m) => ({ type: m.type, mimeType: m.mimeType, tailleOctets: m.tailleOctets, largeur: m.largeur, hauteur: m.hauteur, dureeSecondes: m.dureeSecondes })),
    });
  }

  private corpsPublication(texte: string, contenu?: Record<string, unknown>) {
    return {
      author: this.auteur,
      commentary: echapperCommentaire(texte),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(contenu ? { content: contenu } : {}),
    };
  }

  async publishPost(contenu: ContenuAPublier): Promise<ResultatPublication> {
    const { erreurs } = this.createDraft(contenu);
    if (erreurs.length) throw new ErreurSocial("validation", erreurs.join(" "));
    const media = contenu.medias[0];
    const texte = contenu.lienUrl && media ? `${contenu.texte}\n\n${contenu.lienUrl}` : contenu.texte;

    if (modeSimulation()) {
      const apercu = this.corpsPublication(
        texte,
        media ? { media: { id: `[${media.type === "image" ? "urn:li:image" : "urn:li:video"} après téléversement]`, ...(media.texteAlternatif ? { altText: media.texteAlternatif } : {}) } } : contenu.lienUrl ? { article: { source: contenu.lienUrl, title: contenu.titre } } : undefined,
      );
      return { externalPostId: `simulation:${crypto.randomUUID()}`, externalUrl: null, simule: true, apercuRequete: { methode: "POST", chemin: "/rest/posts", corps: apercu } };
    }

    let contenuLinkedIn: Record<string, unknown> | undefined;
    if (media?.type === "image") {
      const urn = await this.uploadImage(media);
      contenuLinkedIn = { media: { id: urn, ...(media.texteAlternatif ? { altText: media.texteAlternatif.slice(0, 4086) } : {}) } };
    } else if (media?.type === "video") {
      const urn = contenu.conteneurExistant ?? (await this.uploadVideo(media));
      await this.attendreVideo(urn);
      contenuLinkedIn = { media: { id: urn, title: contenu.titre.slice(0, 200) } };
    } else if (contenu.lienUrl) {
      contenuLinkedIn = { article: { source: contenu.lienUrl, title: contenu.titre.slice(0, 400) } };
    }

    const reponse = await requete(`${API}/posts`, {
      method: "POST",
      headers: entetes(this.jeton, { "Content-Type": "application/json" }),
      body: JSON.stringify(this.corpsPublication(texte, contenuLinkedIn)),
      classifier: classifierLinkedIn,
      ecriture: true,
    });
    const urn = reponse.entetes.get("x-restli-id");
    if (!urn) throw new ErreurSocial("incertain", "LinkedIn a accepté la requête sans renvoyer l’identifiant de publication : vérifier sur la Page");
    return { externalPostId: urn, externalUrl: `https://www.linkedin.com/feed/update/${urn}`, simule: false };
  }

  async schedulePost(): Promise<ResultatPublication> {
    return nonSupporte(NON_PROGRAMMABLE, this.reseau);
  }

  async uploadImage(media: MediaAPublier): Promise<string> {
    const init = await requete<{ value: { uploadUrl: string; image: string } }>(`${API}/images?action=initializeUpload`, {
      method: "POST",
      headers: entetes(this.jeton, { "Content-Type": "application/json" }),
      body: JSON.stringify({ initializeUploadRequest: { owner: this.auteur } }),
      classifier: classifierLinkedIn,
    });
    await requete(init.corps.value.uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.jeton}`, "Content-Type": media.mimeType },
      body: await media.lireOctets(),
      classifier: classifierLinkedIn,
      brut: true,
    });
    return init.corps.value.image;
  }

  async uploadVideo(media: MediaAPublier): Promise<string> {
    const octets = new Uint8Array(await media.lireOctets());
    const init = await requete<{ value: { video: string; uploadToken?: string; uploadInstructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number }> } }>(`${API}/videos?action=initializeUpload`, {
      method: "POST",
      headers: entetes(this.jeton, { "Content-Type": "application/json" }),
      body: JSON.stringify({ initializeUploadRequest: { owner: this.auteur, fileSizeBytes: octets.byteLength, uploadCaptions: false, uploadThumbnail: false } }),
      classifier: classifierLinkedIn,
    });
    const etags: string[] = [];
    for (const partie of init.corps.value.uploadInstructions) {
      const r = await requete(partie.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: octets.slice(partie.firstByte, partie.lastByte + 1),
        classifier: classifierLinkedIn,
        brut: true,
      });
      const etag = r.entetes.get("etag");
      if (!etag) throw new ErreurSocial("transitoire", "LinkedIn n’a pas confirmé une partie de la vidéo");
      etags.push(etag);
    }
    await requete(`${API}/videos?action=finalizeUpload`, {
      method: "POST",
      headers: entetes(this.jeton, { "Content-Type": "application/json" }),
      body: JSON.stringify({ finalizeUploadRequest: { video: init.corps.value.video, uploadToken: init.corps.value.uploadToken ?? "", uploadedPartIds: etags } }),
      classifier: classifierLinkedIn,
    });
    return init.corps.value.video;
  }

  private async attendreVideo(urn: string) {
    const debut = Date.now();
    for (;;) {
      const { corps } = await requete<{ status?: string }>(`${API}/videos/${encodeURIComponent(urn)}`, { headers: entetes(this.jeton), classifier: classifierLinkedIn });
      if (corps.status === "AVAILABLE") return;
      if (corps.status === "PROCESSING_FAILED") throw new ErreurSocial("validation", "LinkedIn n’a pas pu traiter la vidéo");
      if (Date.now() - debut > 40_000) throw new ErreurSocial("transitoire", "LinkedIn traite encore la vidéo : nouvelle tentative programmée", { conteneur: urn });
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  async getPosts(limite = 25): Promise<PublicationExterne[]> {
    const { corps } = await requete<{ elements: Array<{ id: string; commentary?: string; publishedAt?: number; createdAt?: number }> }>(
      `${API}/posts?author=${encodeURIComponent(this.auteur)}&q=author&count=${Math.min(limite, 100)}&sortBy=CREATED`,
      { headers: entetes(this.jeton, { "X-RestLi-Method": "FINDER" }), classifier: classifierLinkedIn },
    );
    return (corps.elements ?? []).map((p) => {
      const date = p.publishedAt ?? p.createdAt;
      return { externalPostId: p.id, texte: p.commentary ?? "", publieAt: date ? new Date(date).toISOString() : null, url: `https://www.linkedin.com/feed/update/${p.id}` };
    });
  }

  async getAnalytics(ids: string[]): Promise<Map<string, Statistiques>> {
    const resultat = new Map<string, Statistiques>();
    const reels = ids.filter((id) => id.startsWith("urn:li:"));
    if (reels.length === 0) return resultat;
    const liste = (urns: string[]) => `List(${urns.map(encodeURIComponent).join(",")})`;
    const shares = reels.filter((u) => u.startsWith("urn:li:share:"));
    const ugc = reels.filter((u) => u.startsWith("urn:li:ugcPost:"));
    let url = `${API}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(this.auteur)}`;
    if (shares.length) url += `&shares=${liste(shares)}`;
    if (ugc.length) url += `&ugcPosts=${liste(ugc)}`;
    const { corps } = await requete<{ elements: Array<{ share?: string; ugcPost?: string; totalShareStatistics: Record<string, number> }> }>(url, { headers: entetes(this.jeton), classifier: classifierLinkedIn });
    for (const e of corps.elements ?? []) {
      const id = e.share ?? e.ugcPost;
      if (!id) continue;
      const s = e.totalShareStatistics ?? {};
      resultat.set(id, {
        impressions: s.impressionCount ?? null,
        portee: s.uniqueImpressionsCount ?? null,
        vues: null,
        likes: s.likeCount ?? null,
        commentaires: s.commentCount ?? null,
        partages: s.shareCount ?? null,
        clics: s.clickCount ?? null,
        enregistrements: null,
        brutes: s,
      });
    }
    return resultat;
  }

  async getFollowers(): Promise<number | null> {
    const { corps } = await requete<{ firstDegreeSize?: number }>(`${API}/networkSizes/${encodeURIComponent(this.auteur)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`, { headers: entetes(this.jeton), classifier: classifierLinkedIn });
    return corps.firstDegreeSize ?? null;
  }

  async getComments(postUrn: string): Promise<CommentaireExterne[]> {
    const { corps } = await requete<{ elements: Array<{ id?: string; commentUrn?: string; $URN?: string; actor?: string; message?: { text?: string }; created?: { time?: number }; parentComment?: string }> }>(
      `${API}/socialActions/${encodeURIComponent(postUrn)}/comments?count=100`,
      { headers: entetes(this.jeton), classifier: classifierLinkedIn },
    );
    return (corps.elements ?? []).map((c) => {
      const urn = c.commentUrn ?? c.$URN ?? c.id ?? "";
      return {
        externalCommentId: urn,
        externalPostId: postUrn,
        externalParentId: c.parentComment ?? null,
        // L'API ne renvoie que l'URN de l'auteur ; le nom d'un membre n'est pas exposé à une Page.
        auteurNom: c.actor === this.auteur ? "ELSATIA" : c.actor?.startsWith("urn:li:organization:") ? "Organisation LinkedIn" : "Membre LinkedIn",
        auteurId: c.actor ?? null,
        contenu: c.message?.text ?? "",
        publieAt: c.created?.time ? new Date(c.created.time).toISOString() : null,
        estPropre: c.actor === this.auteur,
      };
    });
  }

  async replyToComment(commentaire: { externalCommentId: string; externalPostId: string }, texte: string): Promise<ResultatEcriture> {
    if (modeSimulation()) return { externalId: null, simule: true };
    const reponse = await requete<{ commentUrn?: string; id?: string }>(`${API}/socialActions/${encodeURIComponent(commentaire.externalPostId)}/comments`, {
      method: "POST",
      headers: entetes(this.jeton, { "Content-Type": "application/json" }),
      body: JSON.stringify({ actor: this.auteur, object: commentaire.externalPostId, parentComment: commentaire.externalCommentId, message: { text: texte } }),
      classifier: classifierLinkedIn,
      ecriture: true,
    });
    return { externalId: reponse.entetes.get("x-restli-id") ?? reponse.corps?.commentUrn ?? reponse.corps?.id ?? null, simule: false };
  }

  getMessages(): never {
    return nonSupporte(MESSAGERIE_INDISPONIBLE, this.reseau);
  }

  replyToMessage(): never {
    return nonSupporte(MESSAGERIE_INDISPONIBLE, this.reseau);
  }
}
