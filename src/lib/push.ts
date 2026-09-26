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
// appareils abonnés, nettoie les abonnements morts (410/404), et marque la notification
// comme traitée dans tous les cas pour ne jamais la retenter en boucle. Appelée à la fois par
// le webhook temps réel (une notification) et le cron de secours (plusieurs en attente).
//
// ACL canonique (migration 255) : le client service_role ne lit ni n'écrit plus en direct les
// notifications, préférences et abonnements push ; tout passe par des RPC de service. Une panne de
// lecture est journalisée et laisse la notification en attente (le cron la reprendra).
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

export async function traiterNotificationPush(admin: SupabaseClient, notificationId: string): Promise<void> {
  const { data, error } = await admin.rpc("push_preparer_notification_service", { p_notification_id: notificationId });
  if (error) {
    console.error("Lecture de la notification push impossible", { code: error.code });
    return;
  }
  const notification = data as NotificationAPousser | null;
  if (!notification) return;

  try {
    if (!pushEstConfigure()) return;
    if (notification.preference_active === false) return;
    if (!notification.abonnements?.length) return;

    const payload = { titre: notification.titre, message: notification.message, lien: notification.lien, niveau: notification.niveau };
    await Promise.all(
      notification.abonnements.map(async (abonnement) => {
        const resultat = await envoyerNotificationPush(abonnement, payload);
        if (!resultat.ok && resultat.abonnementExpire) {
          await admin.rpc("push_supprimer_abonnement_service", { p_abonnement_id: abonnement.id, p_utilisateur_id: notification.utilisateur_id });
        }
      }),
    );
  } finally {
    await admin.rpc("push_marquer_notification_envoyee_service", { p_notification_id: notificationId });
  }
}
