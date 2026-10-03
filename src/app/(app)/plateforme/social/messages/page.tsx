import { adminSocial, contexteSocial } from "@/lib/social/acces";
import { listerComptes } from "@/lib/social/comptes";
import { LinkedInConnector } from "@/lib/social/linkedin";
import { MetaConnector } from "@/lib/social/meta";
import { MESSAGE_NON_DISPONIBLE } from "@/lib/social/provider";
import { peut } from "@/lib/social/roles";
import { horsFenetre24h } from "@/lib/social/temps";
import { LIBELLE_RESEAU, RESEAUX, type Reseau } from "@/lib/social/types";
import { synchroniserAction } from "@/app/actions/social";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { BoutonAction } from "@/components/social/BoutonAction";
import { ElementReponse } from "@/components/social/ElementReponse";
import { SocialEntete } from "@/components/social/SocialEntete";

export const metadata = { title: "Messages — ELSATIA Social" };

type Message = { id: string; reseau: Reseau; external_conversation_id: string; sens: string; auteur_nom: string | null; contenu: string; envoye_externe_at: string | null; statut: string; brouillon_reponse: string | null; brouillon_ia: boolean };

export default async function MessagesPage() {
  const ctx = await contexteSocial();
  if (!ctx) return <AccesRefuse />;
  const admin = adminSocial();
  const [comptes, { data }] = await Promise.all([listerComptes(admin), admin.from("social_messages").select("id,reseau,external_conversation_id,sens,auteur_nom,contenu,envoye_externe_at,statut,brouillon_reponse,brouillon_ia").order("envoye_externe_at", { ascending: false, nullsFirst: false }).limit(300)]);
  const capacite = (r: Reseau) => {
    const scopes = comptes.find((c) => c.reseau === r)?.scopes ?? [];
    const c = r === "linkedin" ? new LinkedInConnector("0", "", scopes) : new MetaConnector({ reseau: r, externalAccountId: "0", pageId: "0", scopes }, "");
    return c.capacites.messages;
  };
  const conversations = new Map<string, Message[]>();
  for (const m of (data ?? []) as Message[]) {
    const k = `${m.reseau}:${m.external_conversation_id}`;
    conversations.set(k, [...(conversations.get(k) ?? []), m]);
  }

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <SocialEntete titre="Messages privés" role={ctx.role} actif="/plateforme/social/messages" description="Messenger et Instagram lorsque les API officielles le permettent. Prévu en version complète en V2." />
        <section className="grid gap-3 sm:grid-cols-3">
          {RESEAUX.map((r) => {
            const cap = capacite(r);
            return (
              <div key={r} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                <p className="font-semibold">{r === "facebook" ? "Messenger" : LIBELLE_RESEAU[r]}</p>
                {cap.disponible ? <p className="text-xs text-green-700">Disponible via API{cap.note ? ` — ${cap.note}` : ""}</p> : <p className="text-xs text-neutral-600"><strong>{MESSAGE_NON_DISPONIBLE}</strong> — {cap.raison}</p>}
              </div>
            );
          })}
        </section>
        {peut(ctx.role, "synchroniser") && <BoutonAction libelle="Synchroniser les messages" action={synchroniserAction.bind(null, "messages")} />}
        <ul className="space-y-4">
          {conversations.size === 0 && <li className="text-sm text-neutral-500">Aucun message reçu.</li>}
          {[...conversations.entries()].map(([cle, messages]) => {
            const dernierEntrant = messages.find((m) => m.sens === "entrant");
            const tri = [...messages].sort((a, b) => (a.envoye_externe_at ?? "").localeCompare(b.envoye_externe_at ?? ""));
            const horsFenetre = horsFenetre24h(dernierEntrant?.envoye_externe_at);
            return (
              <li key={cle} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                <p className="mb-2 text-xs text-neutral-500">{messages[0].reseau === "facebook" ? "Messenger" : LIBELLE_RESEAU[messages[0].reseau]} · {dernierEntrant?.auteur_nom ?? "Interlocuteur"}</p>
                <div className="space-y-1">
                  {tri.slice(-10).map((m) => (
                    <p key={m.id} className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-1.5 ${m.sens === "sortant" ? "ml-auto bg-elsatia-electrique text-white hover:bg-elsatia-profond" : "bg-neutral-100 dark:bg-neutral-800"}`}>{m.contenu}</p>
                  ))}
                </div>
                {dernierEntrant && (
                  <ElementReponse type="message" id={dernierEntrant.id} brouillon={dernierEntrant.brouillon_reponse} brouillonIA={dernierEntrant.brouillon_ia} statut={dernierEntrant.statut} peutPreparer={peut(ctx.role, "preparer_reponse")} peutEnvoyer={peut(ctx.role, "envoyer_reponse")} indisponible={horsFenetre ? "fenêtre de 24 h après le dernier message dépassée (règle Meta)" : null} />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
