import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PayloadPush = { titre: string; message: string | null; lien: string | null; niveau: string };

let configure = false;
function garantirConfiguration() {
  if (configure) return;
  const publique = process.env.VAPID_PUBLIC_KEY;
  const privee = process.env.VAPID_PRIVATE_KEY;
  const sujet = process.env.VAPID_SUBJECT;
  if (!publique || !privee || !sujet) throw new Error("Les clés VAPID ne sont pas configurées (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT).");
  webpush.setVapidDetails(sujet, publique, privee);
  configure = true;
}

export function pushEstConfigure(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

// `abonnementExpire` distingue une erreur transitoire (réessayer plus tard) d'un abonnement
// mort (410/404 — l'utilisateur a désinstallé, changé de navigateur…) qu'il faut supprimer
// pour ne pas retenter indéfiniment.
export async function envoyerNotificationPush(
  abonnement: { endpoint: string; p256dh: string; auth: string },
  payload: PayloadPush,
): Promise<{ ok: true } | { ok: false; abonnementExpire: boolean; erreur: string }> {
  garantirConfiguration();
  try {
    await webpush.sendNotification(
      { endpoint: abonnement.endpoint, keys: { p256dh: abonnement.p256dh, auth: abonnement.auth } },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err) {
    const statutCode = (err as { statusCode?: number }).statusCode;
    const abonnementExpire = statutCode === 404 || statutCode === 410;
    return { ok: false, abonnementExpire, erreur: err instanceof Error ? err.message : "Erreur d'envoi push" };
  }
}

// Traite UNE notification en attente : respecte la préférence de l'utilisateur pour ce type
// (par défaut activé — modèle opt-out, cf. migration 20260723000131), envoie sur tous ses
// appareils abonnés, nettoie les abonnements morts (410/404). Appelée à la fois par le webhook
// temps réel (une notification) et le cron de secours (lots réservés).
//
// ACL canonique (migration 255) : le client service_role ne lit ni n'écrit plus en direct les
// notifications, préférences et abonnements push ; tout passe par des RPC de service.
//
// File durable (ELSATIA PERFORMANCE HARDENING V9.1, migration 20261003001501, ex-20261003000101 du lot perf) : une notification
// n'est traitée que sous réservation (bail). Le cron réserve ses lots lui-même
// (push_reserver_lot_service) ; le webhook réserve la sienne ici. Deux workers ne tiennent donc
// jamais la même notification en même temps (plus de double push cron/cron ni cron/webhook).
// Issue :
//   - « envoyee »  : marquée traitée (au moins un envoi réussi, ou rien à envoyer : préférence
//                    désactivée, aucun abonnement, VAPID absent — comportement inchangé) ;
//   - « echec »    : lecture impossible, exception, ou TOUS les envois en échec transitoire →
//                    réessai différé, puis abandon explicite au-delà du maximum de tentatives ;
//   - « ignoree »  : déjà tenue par un autre worker, déjà traitée ou abandonnée.
type NotificationAPousser = {
  id: string;
  utilisateur_id: string;
  titre: string;
  message: string | null;
  lien: string | null;
  niveau: string;
  preference_active: boolean | null;
  abonnements: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;
};

export type IssueTraitementPush = "envoyee" | "echec" | "ignoree";

async function signalerEchec(admin: SupabaseClient, notificationId: string): Promise<IssueTraitementPush> {
  const { error } = await admin.rpc("push_echec_notification_service", { p_notification_id: notificationId });
  // Si même le signalement échoue, le bail expirera et la notification sera reprise.
  if (error) console.error("Signalement d'échec push impossible", { code: error.code });
  return "echec";
}

export async function traiterNotificationPush(
  admin: SupabaseClient,
  notificationId: string,
  options: { dejaReservee?: boolean } = {},
): Promise<IssueTraitementPush> {
  if (!options.dejaReservee) {
    const { data: reservee, error } = await admin.rpc("push_reserver_notification_service", { p_notification_id: notificationId });
    if (error) {
      // Rien n'a été réservé : la notification reste en file, le cron la reprendra.
      console.error("Réservation de la notification push impossible", { code: error.code });
      return "echec";
    }
    if (reservee !== true) return "ignoree";
  }

  const { data, error } = await admin.rpc("push_preparer_notification_service", { p_notification_id: notificationId });
  if (error) {
    console.error("Lecture de la notification push impossible", { code: error.code });
    return signalerEchec(admin, notificationId);
  }
  const notification = data as NotificationAPousser | null;
  if (!notification) return "ignoree";

  let toutEnEchecTransitoire = false;
  try {
    if (pushEstConfigure() && notification.preference_active !== false && notification.abonnements?.length) {
      const payload = { titre: notification.titre, message: notification.message, lien: notification.lien, niveau: notification.niveau };
      const resultats = await Promise.all(
        notification.abonnements.map(async (abonnement) => {
          const resultat = await envoyerNotificationPush(abonnement, payload);
          if (!resultat.ok && resultat.abonnementExpire) {
            await admin.rpc("push_supprimer_abonnement_service", { p_abonnement_id: abonnement.id, p_utilisateur_id: notification.utilisateur_id });
          }
          return resultat;
        }),
      );
      // Réessayer seulement si AUCUN appareil n'a reçu la notification et qu'au moins un échec
      // est transitoire : jamais de double push vers un appareil déjà servi.
      toutEnEchecTransitoire = resultats.every((r) => !r.ok) && resultats.some((r) => !r.ok && !r.abonnementExpire);
    }
  } catch (err) {
    console.error("Traitement de la notification push interrompu", { message: err instanceof Error ? err.message : "inconnu" });
    return signalerEchec(admin, notificationId);
  }

  if (toutEnEchecTransitoire) return signalerEchec(admin, notificationId);
  const { error: erreurMarquage } = await admin.rpc("push_marquer_notification_envoyee_service", { p_notification_id: notificationId });
  if (erreurMarquage) {
    console.error("Marquage de la notification push impossible", { code: erreurMarquage.code });
    return "echec";
  }
  return "envoyee";
}
