import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerNotification, type NotificationAExpedier } from "@/lib/emails-reserves";
import { urlApplicationReserves } from "@/lib/invitations";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Paliers d'alerte d'échéance. J-7 anticipe, J-3 relance, J-1 est le dernier avertissement. */
const PALIERS_ECHEANCE = [7, 3, 1];

/** Borne d'un passage : au-delà, la tâche reprend au passage suivant plutôt que d'expirer. */
const LOT = 100;

/**
 * Distribution des notifications ELSATIA Réserves.
 *
 * Trois temps, volontairement séparés :
 *
 *   1. PRODUIRE les échéances du jour. Idempotent en base (clé d'événement par réserve et
 *      par palier) : repasser dix fois n'alerte qu'une fois.
 *   2. PRÉPARER les envois. La base grave une intention par (événement, canal, personne),
 *      avec une clé d'idempotence UNIQUE. C'est ce qui garantit qu'une action métier ne
 *      produit pas trois e-mails, même si cette route est rejouée.
 *   3. EXPÉDIER. Chaque envoi est statué individuellement — succès ou échec motivé — de
 *      sorte qu'un e-mail refusé n'empêche pas les suivants et reste diagnosticable.
 *
 * Un échec d'expédition ne réarme rien automatiquement : une file qui se rejoue toute
 * seule sur une adresse invalide finit par faire blacklister le domaine expéditeur.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET absent" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  }

  const admin = createAdminClient();
  const base = urlApplicationReserves();

  const { data: echeances, error: erreurEcheances } = await admin
    .rpc("reserves_produire_echeances", { p_paliers: PALIERS_ECHEANCE });
  if (erreurEcheances) {
    console.error("Réserves : production des échéances impossible", erreurEcheances.message);
    return NextResponse.json({ error: "Production des échéances impossible" }, { status: 500 });
  }

  const { error: erreurPreparation } = await admin
    .rpc("reserves_notifications_preparer", { p_limite: 500 });
  if (erreurPreparation) {
    console.error("Réserves : préparation des envois impossible", erreurPreparation.message);
    return NextResponse.json({ error: "Préparation des envois impossible" }, { status: 500 });
  }

  const { data: aExpedier, error: erreurFile } = await admin
    .rpc("reserves_notifications_a_expedier", { p_limite: LOT });
  if (erreurFile) {
    console.error("Réserves : lecture de la file impossible", erreurFile.message);
    return NextResponse.json({ error: "Lecture de la file impossible" }, { status: 500 });
  }

  let envoyes = 0;
  let echecs = 0;
  for (const envoi of (aExpedier ?? []) as NotificationAExpedier[]) {
    const resultat = await envoyerNotification(envoi, base);
    if (resultat.envoye) envoyes += 1; else echecs += 1;
    const { error } = await admin.rpc("reserves_notification_envoi_statuer", {
      p_envoi_id: envoi.envoi_id,
      p_succes: resultat.envoye,
      p_erreur: resultat.envoye ? null : (resultat.motif ?? "Envoi impossible"),
    });
    // Ne jamais journaliser l'adresse : seule l'issue technique est tracée.
    if (error) console.error("Réserves : statut d'envoi non enregistré", error.message);
  }

  return NextResponse.json({
    echeances_produites: typeof echeances === "number" ? echeances : 0,
    envoyes,
    echecs,
  });
}
