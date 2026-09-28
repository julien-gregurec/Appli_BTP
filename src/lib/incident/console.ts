import {
  CONTROLES_INCIDENT,
  STATUTS_SERVICE,
  type ControleIncident,
  type PorteeIncident,
  type StatutService,
} from "@elsatia/incident-control";

/**
 * Console plateforme du mode sûr — validation PURE des formulaires et traduction des refus de la
 * base. L'autorisation n'est PAS décidée ici : `plateforme_incident_basculer` exige en base le
 * rôle `total` et une session AAL2 ; un administrateur client n'a aucune ligne `plateforme_admins`.
 */

export const PORTEES_CONSOLE: ReadonlyArray<{ cle: PorteeIncident; libelle: string }> = [
  { cle: "global", libelle: "Tout ELSATIA" },
  { cle: "gestion_pro", libelle: "Gestion Pro" },
  { cle: "reserves", libelle: "Réserves" },
  { cle: "tools", libelle: "Tools" },
  { cle: "colors", libelle: "Colors" },
  { cle: "studio", libelle: "Studio (copie centrale ; projet dédié : voir runbook)" },
];

export const LIBELLES_CONTROLES: Readonly<Record<ControleIncident, string>> = {
  lecture_seule: "Lecture seule (toute écriture refusée par la base)",
  app_coupee: "Application coupée (503 ; webhooks et réconciliation autorisés)",
  uploads: "Uploads désactivés",
  exports: "Exports / PDF désactivés",
  paiements: "Paiements désactivés (webhooks toujours reçus)",
  invitations: "Invitations désactivées",
  liens_publics: "Liens publics bloqués",
  reconciliation_stripe_requise: "Réconciliation Stripe requise (verrou post-restauration, global)",
};

export const SERVICES_STATUT = [
  "gestion_pro", "reserves", "tools", "colors", "studio",
  "db", "auth", "storage", "email", "stripe", "redis", "worker_studio",
] as const;

export type DemandeBascule = {
  portee: PorteeIncident;
  controle: ControleIncident;
  actif: boolean;
  motif: string;
  incidentRef: string | null;
  expireDansMinutes: number | null;
};

const lire = (formData: FormData, cle: string) => String(formData.get(cle) ?? "").trim();

export function lireDemandeBascule(formData: FormData): { ok: true; demande: DemandeBascule } | { ok: false; erreur: string } {
  const portee = lire(formData, "portee");
  const controle = lire(formData, "controle");
  const actif = lire(formData, "actif");
  const motif = lire(formData, "motif");
  const incidentRef = lire(formData, "incident_ref");
  const expire = lire(formData, "expire_minutes");

  if (!PORTEES_CONSOLE.some((p) => p.cle === portee)) return { ok: false, erreur: "Portée inconnue" };
  if (!(CONTROLES_INCIDENT as readonly string[]).includes(controle)) return { ok: false, erreur: "Contrôle inconnu" };
  if (actif !== "true" && actif !== "false") return { ok: false, erreur: "Action inconnue" };
  if (motif.length < 10 || motif.length > 500) return { ok: false, erreur: "Motif obligatoire (10 à 500 caractères)" };
  if (incidentRef.length > 64) return { ok: false, erreur: "Référence d'incident trop longue" };
  let expireDansMinutes: number | null = null;
  if (expire !== "") {
    const n = Number(expire);
    if (!Number.isInteger(n) || n < 1 || n > 10_080) return { ok: false, erreur: "Expiration : 1 minute à 7 jours" };
    expireDansMinutes = n;
  }
  if (controle === "reconciliation_stripe_requise" && portee !== "global") {
    return { ok: false, erreur: "La réconciliation Stripe est un verrou global" };
  }
  return {
    ok: true,
    demande: {
      portee: portee as PorteeIncident,
      controle: controle as ControleIncident,
      actif: actif === "true",
      motif,
      incidentRef: incidentRef || null,
      expireDansMinutes,
    },
  };
}

export function lireDemandeStatut(formData: FormData):
  | { ok: true; service: string; statut: StatutService; message: string | null; motif: string }
  | { ok: false; erreur: string } {
  const service = lire(formData, "service");
  const statut = lire(formData, "statut");
  const message = lire(formData, "message_public");
  const motif = lire(formData, "motif");
  if (!(SERVICES_STATUT as readonly string[]).includes(service)) return { ok: false, erreur: "Service inconnu" };
  if (!(STATUTS_SERVICE as readonly string[]).includes(statut)) return { ok: false, erreur: "Statut inconnu" };
  if (message.length > 280) return { ok: false, erreur: "Message public : 280 caractères maximum" };
  if (motif.length < 10 || motif.length > 500) return { ok: false, erreur: "Motif obligatoire (10 à 500 caractères)" };
  return { ok: true, service, statut: statut as StatutService, message: message || null, motif };
}

/** Traduit un refus de la base en message opérateur (jamais le texte SQL brut). */
export function messageRefusConsole(erreur: { code?: string | null; hint?: string | null; message?: string | null }): string {
  if (erreur.hint === "RECONCILIATION_STRIPE_REQUISE") {
    return "Réouverture refusée : la réconciliation Stripe n'est pas attestée. Rejouez les événements Stripe (runbook RESTORE), puis levez d'abord le verrou « Réconciliation Stripe requise ».";
  }
  if (erreur.code === "42501" || /AAL2/.test(erreur.message ?? "")) {
    return "Action réservée au rôle plateforme « total » en session renforcée (AAL2).";
  }
  if (erreur.code === "22023") return "Demande invalide : vérifiez la portée, le contrôle et le motif.";
  return "La base n'a pas pu enregistrer la bascule. Utilisez le chemin opérateur SQL du runbook si Auth est indisponible.";
}
