import type { Metadata } from "next";
import Link from "next/link";
import { exigerShellReserves } from "@/lib/acces-reserves";
import { listerNotifications } from "@/lib/donnees";
import { marquerNotificationsLuesAction } from "@/app/actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function PageNotifications() {
  await exigerShellReserves();
  const notifications = await listerNotifications(100);
  const nonLues = notifications.filter((n) => !n.lu).length;

  return (
    <>
      <h1>Notifications</h1>
      <p className="sous-titre">
        Ce que l’application vous signale, dans l’ordre où c’est arrivé. Les alertes
        importantes apparaissent toujours ici, même si vous en avez coupé l’e-mail.
      </p>

      {nonLues > 0 && (
        <form action={marquerNotificationsLuesAction}>
          <div className="actions">
            <button className="bouton secondaire" type="submit">
              Tout marquer comme lu ({nonLues})
            </button>
          </div>
        </form>
      )}

      {notifications.length === 0 ? (
        <p className="vide">Aucune notification pour l’instant.</p>
      ) : (
        <ul className="liste">
          {notifications.map((n) => (
            <li key={n.id} className="carte" style={n.lu ? { opacity: 0.65 } : undefined}>
              <div className="reserve-tete">
                <span className="reserve-titre">{n.libelle}</span>
                {!n.lu && <span className="etiquette attente">Non lue</span>}
                {n.critique && <span className="etiquette refus">Important</span>}
              </div>
              <div className="reserve-meta">
                {n.chantier && <span>{n.chantier}</span>}
                {n.reserve_numero !== null && (
                  <span>Réserve n°{n.reserve_numero}{n.reserve_titre ? ` — ${n.reserve_titre}` : ""}</span>
                )}
                <span>{new Date(n.created_at).toLocaleString("fr-FR")}</span>
              </div>
              <div className="actions">
                {n.reserve_id && (
                  <Link className="bouton secondaire" href={`/reserves/${n.reserve_id}`}>
                    Ouvrir la réserve
                  </Link>
                )}
                {!n.lu && (
                  <form action={marquerNotificationsLuesAction}>
                    <input type="hidden" name="notification_id" value={n.id} />
                    <button className="bouton secondaire" type="submit">Marquer comme lue</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mention">
        <Link href="/parametres/notifications">Régler les e-mails que je reçois</Link>
      </p>
    </>
  );
}
