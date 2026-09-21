import { validerTexteCommunication } from "./texte";
import { validerLibelleBouton, validerLienCommunication } from "./liens";
import { validerImageCommunication, type EntreeImage, type ImageValidee } from "./image";
import type { ModeAffichage, FrequenceAffichage } from "./affichage";
import { modeAffichageAutorise } from "./affichage";
import { estCommunicationRefusable, type TypeCommunication } from "./consentement";

/** Centre de communications ELSATIA (§9). */

export type PrioriteCommunication = "basse" | "normale" | "haute" | "critique";

export type StatutCommunication =
  | "brouillon"
  | "programmee"
  | "publiee"
  | "en_pause"
  | "expiree"
  | "annulee"
  | "archivee";

export type CanalCommunication = "in_app" | "email" | "push";

export const TYPES_COMMUNICATION: readonly { cle: TypeCommunication; libelle: string; service: boolean }[] = [
  { cle: "information", libelle: "Information", service: true },
  { cle: "nouveaute", libelle: "Nouveauté", service: false },
  { cle: "maintenance", libelle: "Maintenance", service: true },
  { cle: "incident", libelle: "Incident", service: true },
  { cle: "securite", libelle: "Sécurité", service: true },
  { cle: "action_requise", libelle: "Action requise", service: true },
  { cle: "conseil", libelle: "Conseil", service: false },
  { cle: "commerciale", libelle: "Communication commerciale", service: false },
  { cle: "interruption_planifiee", libelle: "Interruption planifiée", service: true },
  { cle: "conditions", libelle: "Mise à jour des conditions", service: true },
  { cle: "autre", libelle: "Autre", service: false },
];

export function definitionType(cle: string): (typeof TYPES_COMMUNICATION)[number] | null {
  return TYPES_COMMUNICATION.find((t) => t.cle === cle) ?? null;
}

export const LONGUEUR_MAXIMALE_TITRE = 120;
export const LONGUEUR_MAXIMALE_TEXTE_COURT = 280;
export const LONGUEUR_MAXIMALE_CONTENU = 5000;

export type BrouillonCommunication = {
  titre: string;
  texteCourt: string;
  contenu?: string | null;
  type: string;
  priorite: PrioriteCommunication;
  debutAt: string;
  finAt: string | null;
  modeAffichage: ModeAffichage;
  frequence: FrequenceAffichage;
  canaux: readonly CanalCommunication[];
  lien?: string | null;
  libelleBouton?: string | null;
  image?: EntreeImage | null;
  hotesAutorises?: readonly string[];
};

export type CommunicationValidee = {
  titre: string;
  texteCourt: string;
  contenu: string | null;
  type: TypeCommunication;
  priorite: PrioriteCommunication;
  debutAt: string;
  finAt: string | null;
  modeAffichage: ModeAffichage;
  frequence: FrequenceAffichage;
  canaux: readonly CanalCommunication[];
  lien: string | null;
  libelleBouton: string | null;
  image: ImageValidee | null;
  /** Une communication refusable par l'utilisateur (commerciale / non essentielle). */
  refusable: boolean;
};

export type ResultatCommunication =
  | { valide: true; communication: CommunicationValidee }
  | { valide: false; champ: string; message: string };

/**
 * Validation complète d'un brouillon avant publication.
 *
 * Les règles fortes appliquées ici, toutes issues du §12 et du §13 :
 *   * un message bloquant n'est possible que pour un motif réellement bloquant ;
 *   * un bouton sans lien (ou un lien sans bouton) est refusé — un bouton mort est un
 *     défaut, pas un choix de mise en page ;
 *   * la fenêtre de diffusion doit être cohérente.
 */
export function validerCommunication(brouillon: BrouillonCommunication): ResultatCommunication {
  const definition = definitionType(brouillon.type);
  if (!definition) return { valide: false, champ: "type", message: "Type de communication inconnu" };

  const titre = validerTexteCommunication(brouillon.titre, {
    min: 3,
    max: LONGUEUR_MAXIMALE_TITRE,
    champ: "Titre",
  });
  if (!titre.valide) return { valide: false, champ: "titre", message: titre.message };

  const texteCourt = validerTexteCommunication(brouillon.texteCourt, {
    min: 3,
    max: LONGUEUR_MAXIMALE_TEXTE_COURT,
    champ: "Texte court",
  });
  if (!texteCourt.valide) return { valide: false, champ: "texteCourt", message: texteCourt.message };

  let contenu: string | null = null;
  const contenuBrut = (brouillon.contenu ?? "").trim();
  if (contenuBrut !== "") {
    const resultat = validerTexteCommunication(contenuBrut, {
      min: 3,
      max: LONGUEUR_MAXIMALE_CONTENU,
      champ: "Contenu détaillé",
    });
    if (!resultat.valide) return { valide: false, champ: "contenu", message: resultat.message };
    contenu = resultat.texte;
  }

  const debut = new Date(brouillon.debutAt);
  if (Number.isNaN(debut.getTime())) {
    return { valide: false, champ: "debutAt", message: "Date de début invalide" };
  }
  let fin: string | null = null;
  if (brouillon.finAt !== null) {
    const dateFin = new Date(brouillon.finAt);
    if (Number.isNaN(dateFin.getTime())) {
      return { valide: false, champ: "finAt", message: "Date de fin invalide" };
    }
    if (dateFin.getTime() <= debut.getTime()) {
      return { valide: false, champ: "finAt", message: "La date de fin doit suivre la date de début" };
    }
    fin = dateFin.toISOString();
  }

  if (!modeAffichageAutorise(definition.cle, brouillon.modeAffichage)) {
    return {
      valide: false,
      champ: "modeAffichage",
      message: "Un message de ce type ne peut pas bloquer l’accès à l’application",
    };
  }

  const lienBrut = (brouillon.lien ?? "").trim();
  const boutonBrut = (brouillon.libelleBouton ?? "").trim();
  let lien: string | null = null;
  let libelleBouton: string | null = null;
  if (lienBrut !== "" || boutonBrut !== "") {
    if (lienBrut === "") {
      return { valide: false, champ: "lien", message: "Un bouton sans lien n’a pas d’effet" };
    }
    if (boutonBrut === "") {
      return { valide: false, champ: "libelleBouton", message: "Indiquez le libellé du bouton" };
    }
    const resultatLien = validerLienCommunication(lienBrut, brouillon.hotesAutorises);
    if (!resultatLien.valide) {
      return { valide: false, champ: "lien", message: resultatLien.message };
    }
    const resultatBouton = validerLibelleBouton(boutonBrut);
    if (!resultatBouton.valide) {
      return { valide: false, champ: "libelleBouton", message: resultatBouton.erreur };
    }
    lien = resultatLien.href;
    libelleBouton = resultatBouton.libelle;
  }

  const resultatImage = validerImageCommunication(brouillon.image ?? null);
  if (!resultatImage.valide) {
    return { valide: false, champ: "image", message: resultatImage.message };
  }

  if (brouillon.canaux.length === 0) {
    return { valide: false, champ: "canaux", message: "Sélectionnez au moins un canal" };
  }

  return {
    valide: true,
    communication: {
      titre: titre.texte,
      texteCourt: texteCourt.texte,
      contenu,
      type: definition.cle,
      priorite: brouillon.priorite,
      debutAt: debut.toISOString(),
      finAt: fin,
      modeAffichage: brouillon.modeAffichage,
      frequence: brouillon.frequence,
      canaux: [...new Set(brouillon.canaux)],
      lien,
      libelleBouton,
      image: resultatImage.image,
      refusable: estCommunicationRefusable(definition.cle),
    },
  };
}

// ── Cycle de vie ──────────────────────────────────────────────────────────────

export type TransitionCommunication =
  | "publier"
  | "programmer"
  | "mettre_en_pause"
  | "reprendre"
  | "annuler"
  | "archiver"
  | "dupliquer";

const TRANSITIONS: Readonly<Record<StatutCommunication, readonly TransitionCommunication[]>> = {
  brouillon: ["publier", "programmer", "annuler", "dupliquer"],
  programmee: ["publier", "mettre_en_pause", "annuler", "dupliquer"],
  publiee: ["mettre_en_pause", "annuler", "archiver", "dupliquer"],
  en_pause: ["reprendre", "annuler", "archiver", "dupliquer"],
  expiree: ["archiver", "dupliquer"],
  annulee: ["archiver", "dupliquer"],
  // Une communication archivée est close : on la duplique, on ne la ressuscite pas.
  archivee: ["dupliquer"],
};

export function transitionAutorisee(
  statut: StatutCommunication,
  transition: TransitionCommunication,
): boolean {
  return TRANSITIONS[statut].includes(transition);
}

/**
 * Après publication, le contenu ne se modifie plus en silence : seuls la fin de
 * diffusion, la pause et l'archivage restent ouverts. Toute autre correction passe par
 * une nouvelle version, tracée — c'est la réponse au « modification silencieuse après
 * publication » du §15.
 */
export const CHAMPS_MODIFIABLES_APRES_PUBLICATION: readonly string[] = ["finAt", "statut"];

export function modificationAutoriseeApresPublication(champ: string): boolean {
  return CHAMPS_MODIFIABLES_APRES_PUBLICATION.includes(champ);
}

export function statutCalcule(
  statutStocke: StatutCommunication,
  fenetre: { debutAt: string; finAt: string | null },
  maintenant: Date,
): StatutCommunication {
  if (statutStocke !== "publiee" && statutStocke !== "programmee") return statutStocke;
  const debut = new Date(fenetre.debutAt).getTime();
  const fin = fenetre.finAt === null ? null : new Date(fenetre.finAt).getTime();
  if (fin !== null && maintenant.getTime() >= fin) return "expiree";
  if (maintenant.getTime() < debut) return "programmee";
  return "publiee";
}
