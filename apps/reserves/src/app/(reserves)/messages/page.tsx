import type { Metadata } from "next";
import Link from "next/link";
import { exigerShellReserves } from "@/lib/acces-reserves";
import { listerConversations } from "@/lib/donnees";
import { marquerConversationLueAction } from "@/app/actions";

export const metadata: Metadata = { title: "Messages" };

export default async function PageMessages() {
  await exigerShellReserves();
  const conversations = await listerConversations();
  const nonLus = conversations.reduce((total, c) => total + c.non_lus, 0);

  return (
    <>
      <h1>Messages</h1>
      <p className="sous-titre">
        Les échanges attachés à vos réserves. Une conversation suit l’entreprise qui porte
        la réserve : après un transfert, l’entreprise dessaisie ne lit plus la suite.
      </p>
      {nonLus > 0 && <p className="message">{nonLus} message{nonLus > 1 ? "s" : ""} non lu{nonLus > 1 ? "s" : ""}.</p>}

      {conversations.length === 0 ? (
        <p className="vide">Aucune conversation.</p>
      ) : (
        <ul className="liste">
          {conversations.map((c) => (
            <li key={c.id} className="carte">
              <div className="reserve-tete">
                <span className="reserve-titre">{c.titre}</span>
                {c.non_lus > 0 && <span className="etiquette attente">{c.non_lus} non lu{c.non_lus > 1 ? "s" : ""}</span>}
              </div>
              <div className="reserve-meta">
                <span>{c.chantier}</span>
                {c.intervenant && <span>{c.intervenant}</span>}
                {c.dernier_message && (
                  <span>Dernier message le {new Date(c.dernier_message).toLocaleString("fr-FR")}</span>
                )}
              </div>
              {c.dernier_extrait && <p className="mention">« {c.dernier_extrait} »</p>}
              <div className="actions">
                {c.reserve_id && (
                  <Link className="bouton secondaire" href={`/reserves/${c.reserve_id}`}>
                    Ouvrir la réserve{c.reserve_numero !== null ? ` n°${c.reserve_numero}` : ""}
                  </Link>
                )}
                {c.non_lus > 0 && (
                  <form action={marquerConversationLueAction}>
                    <input type="hidden" name="conversation_id" value={c.id} />
                    <input type="hidden" name="retour" value="/messages" />
                    <button className="bouton secondaire" type="submit">Marquer comme lu</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
