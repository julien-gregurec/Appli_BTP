import type { SessionAssistance } from "./session";
import { motifInterne } from "./motifs";

/**
 * Forme normalisée d'un événement d'audit d'assistance.
 *
 * Règle centrale : `acteurId` est TOUJOURS l'administrateur plateforme. Aucune action
 * ne doit apparaître comme ayant été réalisée par le client. `utilisateurAssisteId`
 * décrit la personne accompagnée, il n'est jamais l'auteur.
 */
export type EvenementAuditAssistance = {
  sessionId: string;
  acteurId: string;
  acteurEmail: string;
  entrepriseId: string;
  utilisateurAssisteId: string | null;
  applicationCode: string;
  action: string;
  objetType: string;
  objetId: string | null;
  avant: unknown;
  apres: unknown;
  motifInterne: string;
  ticket: string | null;
  contexteTechnique: ContexteTechnique;
  resultat: ResultatAction;
  survenuAt: string;
};

export type ResultatAction = "succes" | "refus" | "erreur";

export type ContexteTechnique = {
  /** Adresse IP telle que vue par le serveur, ou `null` si non disponible. */
  adresseIp: string | null;
  agent: string | null;
  origine: string | null;
};

export type EntreeAudit = {
  session: SessionAssistance;
  applicationCode: string;
  action: string;
  objetType: string;
  objetId?: string | null;
  utilisateurAssisteId?: string | null;
  avant?: unknown;
  apres?: unknown;
  resultat: ResultatAction;
  contexteTechnique?: Partial<ContexteTechnique>;
  survenuAt: Date;
};

/**
 * Les valeurs avant/après ne sont conservées que lorsqu'elles ont un sens : une lecture
 * n'a pas d'« avant », et recopier un objet identique des deux côtés bruite l'audit sans
 * rien prouver.
 */
export function construireEvenementAudit(entree: EntreeAudit): EvenementAuditAssistance {
  const avant = entree.avant ?? null;
  const apres = entree.apres ?? null;
  const identiques = avant !== null && apres !== null && JSON.stringify(avant) === JSON.stringify(apres);
  return {
    sessionId: entree.session.id,
    acteurId: entree.session.acteurId,
    acteurEmail: entree.session.acteurEmail,
    entrepriseId: entree.session.entrepriseId,
    utilisateurAssisteId: entree.utilisateurAssisteId ?? null,
    applicationCode: entree.applicationCode,
    action: entree.action,
    objetType: entree.objetType,
    objetId: entree.objetId ?? null,
    avant: identiques ? null : avant,
    apres: identiques ? null : apres,
    motifInterne: motifInterne(entree.session.motifCategorie, entree.session.motifDetailInterne),
    ticket: entree.session.ticket,
    contexteTechnique: {
      adresseIp: entree.contexteTechnique?.adresseIp ?? null,
      agent: entree.contexteTechnique?.agent ?? null,
      origine: entree.contexteTechnique?.origine ?? null,
    },
    resultat: entree.resultat,
    survenuAt: entree.survenuAt.toISOString(),
  };
}

/**
 * Un refus se journalise exactement comme une réussite. Sans cela, une session qui
 * tente vingt actions interdites ne laisserait aucune trace — c'est précisément le
 * signal qu'une alerte doit pouvoir détecter.
 */
export function construireEvenementRefus(
  entree: Omit<EntreeAudit, "resultat"> & { raison: string },
): EvenementAuditAssistance {
  const evenement = construireEvenementAudit({ ...entree, resultat: "refus" });
  return { ...evenement, apres: { refus: entree.raison } };
}

// ── Détection d'anomalies ─────────────────────────────────────────────────────

export type SeuilsAnomalie = {
  /** Nombre de sessions ouvertes par le même acteur sur la fenêtre. */
  sessionsParActeur: number;
  /** Nombre de refus consécutifs sur une même session. */
  refusParSession: number;
  /** Nombre d'entreprises distinctes visitées sur la fenêtre. */
  entreprisesParActeur: number;
  fenetreMinutes: number;
};

export const SEUILS_ANOMALIE_PAR_DEFAUT: SeuilsAnomalie = {
  sessionsParActeur: 10,
  refusParSession: 5,
  entreprisesParActeur: 8,
  fenetreMinutes: 60,
};

export type Anomalie = {
  code: "sessions_excessives" | "refus_repetes" | "balayage_entreprises";
  message: string;
  acteurId: string;
  valeur: number;
  seuil: number;
};

export function detecterAnomalies(
  evenements: readonly { acteurId: string; entrepriseId: string; sessionId: string; resultat: ResultatAction; survenuAt: string }[],
  maintenant: Date,
  seuils: SeuilsAnomalie = SEUILS_ANOMALIE_PAR_DEFAUT,
): Anomalie[] {
  const debut = maintenant.getTime() - seuils.fenetreMinutes * 60000;
  const fenetre = evenements.filter((e) => new Date(e.survenuAt).getTime() >= debut);

  const parActeur = new Map<string, { sessions: Set<string>; entreprises: Set<string> }>();
  const refusParSession = new Map<string, { acteurId: string; refus: number }>();
  for (const e of fenetre) {
    const agg = parActeur.get(e.acteurId) ?? { sessions: new Set<string>(), entreprises: new Set<string>() };
    agg.sessions.add(e.sessionId);
    agg.entreprises.add(e.entrepriseId);
    parActeur.set(e.acteurId, agg);
    if (e.resultat === "refus") {
      const r = refusParSession.get(e.sessionId) ?? { acteurId: e.acteurId, refus: 0 };
      r.refus += 1;
      refusParSession.set(e.sessionId, r);
    }
  }

  const anomalies: Anomalie[] = [];
  for (const [acteurId, agg] of parActeur) {
    if (agg.sessions.size > seuils.sessionsParActeur) {
      anomalies.push({
        code: "sessions_excessives",
        message: "Nombre inhabituel de sessions d’assistance ouvertes",
        acteurId,
        valeur: agg.sessions.size,
        seuil: seuils.sessionsParActeur,
      });
    }
    if (agg.entreprises.size > seuils.entreprisesParActeur) {
      anomalies.push({
        code: "balayage_entreprises",
        message: "Nombre inhabituel d’entreprises consultées",
        acteurId,
        valeur: agg.entreprises.size,
        seuil: seuils.entreprisesParActeur,
      });
    }
  }
  for (const [, r] of refusParSession) {
    if (r.refus > seuils.refusParSession) {
      anomalies.push({
        code: "refus_repetes",
        message: "Refus répétés pendant une session d’assistance",
        acteurId: r.acteurId,
        valeur: r.refus,
        seuil: seuils.refusParSession,
      });
    }
  }
  return anomalies;
}
