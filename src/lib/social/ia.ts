import { obtenirProviderIA, type OutilIA } from "@/lib/ai/provider";
import { CONSIGNES_MARQUE } from "@/lib/social/identite";
import { LIMITES } from "@/lib/social/contenu";
import { libelleApplication, LIBELLE_RESEAU, type Reseau } from "@/lib/social/types";

// Assistant Social ELSATIA. Il PROPOSE uniquement : chaque texte produit est
// un brouillon que l'utilisateur relit, modifie et fait valider. Aucune
// fonction de ce fichier ne publie ni n'envoie quoi que ce soit.

const STYLE_RESEAU: Record<Reseau, string> = {
  facebook: "Facebook : ton accessible et professionnel, phrases courtes, 1 à 3 paragraphes, un appel à l'action clair, 0 à 3 hashtags.",
  instagram: `Instagram : plus court et visuel (moins de 600 caractères conseillés, ${LIMITES.instagram.caracteres} maximum), première ligne accrocheuse, retours à la ligne aérés, 5 à 10 hashtags pertinents regroupés en fin de texte, pas de lien (non cliquable), inviter à consulter le lien du profil si un lien est utile.`,
  linkedin: "LinkedIn : ton professionnel orienté entreprise et produit, bénéfices concrets pour les dirigeants et équipes, structure lisible (accroche, 2 à 4 points, conclusion), 3 à 5 hashtags professionnels, aucun emoji superflu.",
};

async function outilForce<T>(outil: OutilIA, system: string, demande: string, maxTokens = 2000): Promise<T> {
  const { appelsOutils } = await obtenirProviderIA().completer({
    system: `${CONSIGNES_MARQUE}\n${system}`,
    outils: [outil],
    forcerOutil: outil.nom,
    historique: [{ role: "user", contenu: demande }],
    maxTokens,
  });
  const appel = appelsOutils.find((a) => a.nom === outil.nom);
  if (!appel) throw new Error("L’Assistant Social n’a pas pu produire de proposition.");
  return appel.entree as T;
}

export type Variantes = { facebook: string; instagram: string; linkedin: string; hashtags: string[]; cta: string };

const normaliserTexte = (t: string) => t.toLowerCase().replace(/[#\s\p{P}\p{Extended_Pictographic}]+/gu, " ").trim();

/** Vrai si au moins deux variantes sont identiques (au-delà de la ponctuation et des hashtags). */
export function variantesIdentiques(v: Pick<Variantes, "facebook" | "instagram" | "linkedin">): boolean {
  const t = [v.facebook, v.instagram, v.linkedin].map(normaliserTexte);
  return t[0] === t[1] || t[0] === t[2] || t[1] === t[2];
}

export async function genererVariantes(params: { texte: string; application: string; lien: string | null; reseaux: Reseau[] }): Promise<Variantes> {
  const texte = params.texte.trim();
  if (!texte) throw new Error("Saisissez d’abord le texte principal.");
  const demander = (insistance: string) =>
    outilForce<Partial<Variantes>>(
      {
        nom: "proposer_variantes",
        description: "Propose une version distincte du message pour chaque réseau social.",
        parametres: {
          type: "object",
          properties: {
            facebook: { type: "string", description: STYLE_RESEAU.facebook },
            instagram: { type: "string", description: STYLE_RESEAU.instagram },
            linkedin: { type: "string", description: STYLE_RESEAU.linkedin },
            hashtags: { type: "array", items: { type: "string" }, description: "Hashtags suggérés, sans doublon, avec #" },
            cta: { type: "string", description: "Appel à l'action court suggéré" },
          },
          required: ["facebook", "instagram", "linkedin", "hashtags", "cta"],
        },
      },
      `Les trois versions doivent être réellement différentes (longueur, structure, ton), jamais un simple copier-coller. Conserver tous les faits du texte source, n'en ajouter aucun.${insistance}`,
      `Produit concerné : ${libelleApplication(params.application)}\nLien éventuel : ${params.lien ?? "aucun"}\nRéseaux choisis : ${params.reseaux.map((r) => LIBELLE_RESEAU[r]).join(", ") || "tous"}\n\nTexte principal :\n${texte}`,
    );
  const nettoyer = (resultat: Partial<Variantes>): Variantes => ({
    facebook: (resultat.facebook ?? "").trim().slice(0, LIMITES.facebook.caracteres),
    instagram: (resultat.instagram ?? "").trim().slice(0, LIMITES.instagram.caracteres),
    linkedin: (resultat.linkedin ?? "").trim().slice(0, LIMITES.linkedin.caracteres),
    hashtags: (resultat.hashtags ?? []).filter((h) => /^#[\p{L}\p{N}_]+$/u.test(h)).slice(0, 15),
    cta: (resultat.cta ?? "").trim(),
  });
  let v = nettoyer(await demander(""));
  // Exigence : trois textes différents par défaut. Une seconde demande, plus insistante, puis refus.
  if (variantesIdentiques(v)) v = nettoyer(await demander(" ATTENTION : la proposition précédente contenait des textes identiques. Chaque réseau doit avoir un texte propre."));
  if (!v.facebook || !v.instagram || !v.linkedin) throw new Error("L’Assistant Social n’a pas produit les trois versions.");
  if (variantesIdentiques(v)) throw new Error("L’Assistant Social a produit des versions identiques : reformuler le texte principal ou adapter à la main.");
  return v;
}

export type OperationTexte = "reformuler" | "raccourcir" | "hashtags" | "cta" | "adapter";

const CONSIGNES_OPERATION: Record<OperationTexte, string> = {
  reformuler: "Reformule le texte en gardant le même sens, les mêmes faits et une longueur proche.",
  raccourcir: "Raccourcis le texte d'environ 40 % en gardant l'essentiel et l'appel à l'action.",
  hashtags: "Retourne le texte inchangé, suivi d'une ligne de hashtags pertinents et raisonnés (en remplaçant les hashtags existants).",
  cta: "Retourne le texte en ajoutant ou améliorant un appel à l'action final clair et non agressif.",
  adapter: "Adapte le texte aux usages du réseau indiqué.",
};

export async function transformerTexte(texte: string, reseau: Reseau, operation: OperationTexte): Promise<string> {
  if (!texte.trim()) throw new Error("Texte vide.");
  const r = await outilForce<{ texte?: string }>(
    { nom: "texte_propose", description: "Texte proposé.", parametres: { type: "object", properties: { texte: { type: "string" } }, required: ["texte"] } },
    `${CONSIGNES_OPERATION[operation]}\n${STYLE_RESEAU[reseau]}`,
    `Réseau : ${LIBELLE_RESEAU[reseau]}\n\nTexte :\n${texte}`,
    1500,
  );
  const sortie = (r.texte ?? "").trim();
  if (!sortie) throw new Error("L’Assistant Social n’a pas pu transformer ce texte.");
  return sortie.slice(0, LIMITES[reseau].caracteres);
}

export type SujetPropose = { titre: string; angle: string; application: string; reseaux: Reseau[] };

export async function proposerSujets(contexte: { publicationsRecentes: string[]; meilleures: string[]; consigne?: string }): Promise<SujetPropose[]> {
  const r = await outilForce<{ sujets?: SujetPropose[] }>(
    {
      nom: "proposer_sujets",
      description: "Propose des idées de publications.",
      parametres: {
        type: "object",
        properties: {
          sujets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                titre: { type: "string" },
                angle: { type: "string", description: "Angle et message clé, sans inventer de chiffres" },
                application: { type: "string", enum: ["elsatia", "gestion_pro", "tools", "colors", "studio", "reserves"] },
                reseaux: { type: "array", items: { type: "string", enum: ["facebook", "instagram", "linkedin"] } },
              },
              required: ["titre", "angle", "application", "reseaux"],
            },
          },
        },
        required: ["sujets"],
      },
    },
    "Propose 6 sujets variés (pédagogie, coulisses, nouveautés annoncées, conseils métier), sans répéter les publications récentes. Appuie-toi sur ce qui a le mieux fonctionné.",
    `Publications récentes :\n${contexte.publicationsRecentes.join("\n") || "aucune"}\n\nMeilleures publications :\n${contexte.meilleures.join("\n") || "aucune donnée"}\n\nConsigne : ${contexte.consigne || "aucune"}`,
  );
  return (r.sujets ?? []).slice(0, 10);
}

export type EntreeCalendrier = { date: string; titre: string; angle: string; application: string; reseaux: Reseau[] };

export async function genererCalendrier(params: { debut: string; semaines: number; parSemaine: number; consigne?: string }): Promise<EntreeCalendrier[]> {
  const r = await outilForce<{ entrees?: EntreeCalendrier[] }>(
    {
      nom: "proposer_calendrier",
      description: "Propose un calendrier éditorial (idées datées).",
      parametres: {
        type: "object",
        properties: {
          entrees: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", description: "Date et heure ISO 8601 en heure de Paris, jours ouvrés, entre 8 h et 18 h" },
                titre: { type: "string" },
                angle: { type: "string" },
                application: { type: "string", enum: ["elsatia", "gestion_pro", "tools", "colors", "studio", "reserves"] },
                reseaux: { type: "array", items: { type: "string", enum: ["facebook", "instagram", "linkedin"] } },
              },
              required: ["date", "titre", "angle", "application", "reseaux"],
            },
          },
        },
        required: ["entrees"],
      },
    },
    "Répartis régulièrement les sujets et alterne les produits ELSATIA. Ce sont des idées : aucune publication ne sera créée sans relecture.",
    `Début : ${params.debut}\nDurée : ${params.semaines} semaine(s)\nPublications par semaine : ${params.parSemaine}\nConsigne : ${params.consigne || "aucune"}`,
    3000,
  );
  return (r.entrees ?? []).filter((e) => !Number.isNaN(new Date(e.date).getTime())).slice(0, params.semaines * params.parSemaine);
}

export async function analyserPerformances(donnees: string): Promise<string> {
  const { texte } = await obtenirProviderIA().completer({
    system: `${CONSIGNES_MARQUE}\nTu analyses les performances des publications ELSATIA. Ne compare entre réseaux que des métriques équivalentes (les impressions LinkedIn ne sont pas les vues Meta). Si les données sont insuffisantes, dis-le. Termine par trois recommandations concrètes et la proposition du prochain contenu.`,
    historique: [{ role: "user", contenu: `Données :\n${donnees}` }],
    maxTokens: 1200,
  });
  return texte.trim();
}

export async function preparerReponse(params: { reseau: Reseau; commentaire: string; auteur: string | null; publication: string | null; prive: boolean }): Promise<string> {
  const r = await outilForce<{ texte?: string }>(
    { nom: "reponse_proposee", description: "Réponse proposée.", parametres: { type: "object", properties: { texte: { type: "string" } }, required: ["texte"] } },
    `Tu prépares un BROUILLON de réponse ${params.prive ? "à un message privé" : "à un commentaire public"} sur ${LIBELLE_RESEAU[params.reseau]}, au nom d'ELSATIA. Court, poli, utile. Ne promets rien (délai, prix, remboursement, fonctionnalité). Pour toute question de compte client, de données personnelles ou de litige, invite à écrire au support plutôt que de répondre publiquement. Ne demande jamais de données personnelles en public.`,
    `Publication concernée :\n${params.publication ?? "inconnue"}\n\n${params.prive ? "Message" : "Commentaire"} de ${params.auteur ?? "un utilisateur"} :\n${params.commentaire}`,
    600,
  );
  return (r.texte ?? "").trim();
}
