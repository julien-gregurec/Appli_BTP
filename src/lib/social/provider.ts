import type { Reseau } from "@/lib/social/types";

// Abstraction commune des connecteurs ELSATIA Social.
//
// Règle : une fonction absente de l'API officielle d'une plateforme est déclarée
// non supportée dans `capacites` et lève `ErreurSocial("non_supporte")`. Elle
// n'est jamais simulée.

export type CodeErreurSocial =
  | "non_supporte" // fonction absente de l'API officielle
  | "non_configure" // variables d'environnement manquantes
  | "jeton_expire" // reconnexion OAuth nécessaire
  | "permission" // scope manquant ou rôle insuffisant sur la Page/organisation
  | "limite" // limitation de débit de la plateforme
  | "validation" // contenu refusé (format, taille, longueur)
  | "transitoire" // erreur 5xx ou réseau AVANT envoi : nouvelle tentative possible
  | "incertain" // écriture sans réponse (délai dépassé) : la plateforme a peut-être publié
  | "inconnu";

export class ErreurSocial extends Error {
  constructor(
    public readonly code: CodeErreurSocial,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ErreurSocial";
  }

  get reessayable() {
    return this.code === "transitoire" || this.code === "limite";
  }
}

export const MESSAGE_NON_DISPONIBLE = "Fonction non disponible via API";

export type Capacite = { disponible: true; note?: string } | { disponible: false; raison: string };

export type Capacites = {
  texteSeul: Capacite;
  lien: Capacite;
  image: Capacite;
  video: Capacite;
  reel: Capacite;
  programmationNative: Capacite;
  lecturePublications: Capacite;
  statistiques: Capacite;
  commentaires: Capacite;
  reponseCommentaire: Capacite;
  messages: Capacite;
  reponseMessage: Capacite;
  webhooks: Capacite;
};

export type MediaAPublier = {
  type: "image" | "video";
  /** URL HTTPS temporaire (lien signé) lisible par la plateforme. */
  urlSignee: string;
  mimeType: string;
  tailleOctets: number;
  largeur: number | null;
  hauteur: number | null;
  dureeSecondes: number | null;
  texteAlternatif: string | null;
  /** Lecture du binaire, pour les plateformes qui exigent un téléversement direct. */
  lireOctets: () => Promise<ArrayBuffer>;
};

export type ContenuAPublier = {
  /** Titre interne, utilisé comme titre d'article/vidéo lorsque l'API l'exige (LinkedIn). */
  titre: string;
  texte: string;
  lienUrl: string | null;
  medias: MediaAPublier[];
  /** Clé stable (cible) transmise lorsque l'API supporte l'idempotence. */
  cleIdempotence: string;
  /** Reprise : conteneur déjà créé lors d'une tentative précédente (Instagram). */
  conteneurExistant?: string | null;
};

export type ResultatPublication = {
  externalPostId: string;
  externalUrl: string | null;
  simule: boolean;
  /** Requête qui aurait été envoyée (mode simulation), sans jeton. */
  apercuRequete?: unknown;
};

export type PublicationExterne = {
  externalPostId: string;
  texte: string;
  publieAt: string | null;
  url: string | null;
};

// Métriques normalisées. null = non fournie par la plateforme (jamais 0 inventé).
export type Statistiques = {
  impressions: number | null;
  portee: number | null;
  vues: number | null;
  likes: number | null;
  commentaires: number | null;
  partages: number | null;
  clics: number | null;
  enregistrements: number | null;
  brutes: Record<string, unknown>;
};

export type CommentaireExterne = {
  externalCommentId: string;
  externalPostId: string;
  externalParentId: string | null;
  auteurNom: string | null;
  auteurId: string | null;
  contenu: string;
  publieAt: string | null;
  /** Le commentaire émane du compte ELSATIA lui-même. */
  estPropre: boolean;
};

export type MessageExterne = {
  externalConversationId: string;
  externalMessageId: string;
  sens: "entrant" | "sortant";
  auteurNom: string | null;
  auteurId: string | null;
  contenu: string;
  envoyeAt: string | null;
};

export type ResultatEcriture = { externalId: string | null; simule: boolean };

export interface SocialProvider {
  readonly reseau: Reseau;
  readonly capacites: Capacites;
  /**
   * Brouillon : aucune des trois API n'offre de brouillon exploitable pour ce
   * flux ; le brouillon vit dans ELSATIA Social. La méthode valide le contenu
   * pour ce réseau et retourne les avertissements bloquants/non bloquants.
   */
  createDraft(contenu: Omit<ContenuAPublier, "cleIdempotence">): { erreurs: string[]; avertissements: string[] };
  publishPost(contenu: ContenuAPublier): Promise<ResultatPublication>;
  /** Programmation native de la plateforme. ELSATIA Social programme lui-même (cron) : voir `capacites`. */
  schedulePost(contenu: ContenuAPublier, date: Date): Promise<ResultatPublication>;
  uploadImage(media: MediaAPublier): Promise<string>;
  uploadVideo(media: MediaAPublier): Promise<string>;
  getPosts(limite?: number): Promise<PublicationExterne[]>;
  getAnalytics(externalPostIds: string[]): Promise<Map<string, Statistiques>>;
  getFollowers(): Promise<number | null>;
  getComments(externalPostId: string): Promise<CommentaireExterne[]>;
  replyToComment(commentaire: { externalCommentId: string; externalPostId: string }, texte: string): Promise<ResultatEcriture>;
  getMessages(): Promise<MessageExterne[]>;
  replyToMessage(destinataire: { externalConversationId: string; auteurId: string }, texte: string): Promise<ResultatEcriture>;
}

export function nonSupporte(fonction: string, reseau: Reseau): never {
  throw new ErreurSocial("non_supporte", `${MESSAGE_NON_DISPONIBLE} (${fonction} sur ${reseau})`);
}
