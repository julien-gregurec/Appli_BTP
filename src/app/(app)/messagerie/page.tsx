import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { SearchableSelect } from "@/components/SearchableSelect";
import { creerConversationInterneAction, envoyerMessageInterneAction } from "@/app/actions/messagerie";
import { ZoneReponseMessagerie } from "@/components/ZoneReponseMessagerie";

type Relation<T> = T | T[] | null;
type ContactMessagerie = { id: string; prenom: string; nom: string; poste: string | null };
const un = <T,>(value: Relation<T>): T | null => Array.isArray(value) ? value[0] ?? null : value;

export default async function MessageriePage({ searchParams }: { searchParams: Promise<{ conversation?: string; error?: string; success?: string }> }) {
  const query = await searchParams;
  if (isEmailLoginDisabled()) return <main className="p-8"><div className="mx-auto max-w-4xl"><h1 className="text-xl font-semibold">Messagerie interne</h1><p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">La messagerie privée exige des comptes individuels. Elle est fermée en mode prototype.</p></div></main>;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const peutUtiliserIA = aAccesIA(await permissionsUtilisateur(ctx));
  const [{ data: moi }, { data: employes }, { data: chantiers }, { data: conversations }] = await Promise.all([
    supabase.from("employes").select("id,prenom,nom").eq("entreprise_id",ctx.entrepriseId).eq("utilisateur_id",ctx.userId).maybeSingle(),
    supabase.rpc("contacts_messagerie",{p_entreprise_id:ctx.entrepriseId}),
    supabase.from("chantiers").select("id,nom,reference_interne").eq("entreprise_id",ctx.entrepriseId).not("statut","in","(archive,annule)").order("nom"),
    supabase.from("conversations_internes").select("id,type,titre,chantier:chantiers(id,nom),createur:employes!conversations_createur_fkey(id,prenom,nom),destinataire:employes!conversations_destinataire_fkey(id,prenom,nom),derniere_activite_at").eq("entreprise_id",ctx.entrepriseId).order("derniere_activite_at",{ascending:false}),
  ]);
  const conversationId = query.conversation && (conversations ?? []).some((c)=>c.id===query.conversation) ? query.conversation : conversations?.[0]?.id;
  const { data: messages } = conversationId ? await supabase.from("messages_internes").select("id,contenu,created_at,auteur:employes(id,prenom,nom)").eq("conversation_id",conversationId).order("created_at") : { data: [] };
  const selected = (conversations ?? []).find((conversation)=>conversation.id===conversationId);
  const titreConversation = (conversation: NonNullable<typeof conversations>[number]) => {
    if (conversation.type === "chantier") return `# ${un(conversation.chantier)?.nom ?? "Chantier"}`;
    const createur = un(conversation.createur), destinataire = un(conversation.destinataire);
    const autre = createur?.id === moi?.id ? destinataire : createur;
    return autre ? `${autre.prenom} ${autre.nom}` : "Conversation directe";
  };
  const optionsEmployes = ((employes ?? []) as ContactMessagerie[]).filter((e)=>e.id!==moi?.id).map((e)=>({ value:e.id,label:`${e.prenom} ${e.nom}${e.poste?` · ${e.poste}`:""}` }));
  const optionsChantiers = (chantiers ?? []).map((c)=>({ value:c.id,label:`${c.nom} · ${c.reference_interne}` }));

  return <main className="p-3 sm:p-8"><div className="mx-auto max-w-6xl space-y-5">
    <div><h1 className="text-xl font-semibold">Messagerie interne</h1><p className="text-sm text-neutral-500">Échanges privés avec un collaborateur ou fil partagé avec l’équipe d’un chantier.</p></div>
    {query.error&&<p className="rounded bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}{query.success&&<p className="rounded bg-green-50 p-3 text-sm text-green-700">{query.success}</p>}
    {!moi&&<p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Votre compte doit être relié à une fiche employé pour écrire.</p>}
    <section className="rounded-lg border p-4"><h2 className="font-semibold">Nouvelle conversation</h2><div className="mt-3 grid gap-4 lg:grid-cols-2">
      <form action={creerConversationInterneAction} className="space-y-3 rounded border p-3"><input type="hidden" name="type" value="directe"/><h3 className="text-sm font-semibold">Écrire à une personne ou à la direction</h3><SearchableSelect name="cible_id" required options={optionsEmployes} placeholder="Rechercher un collaborateur…"/><textarea name="contenu" required maxLength={5000} rows={2} placeholder="Votre message…" className="w-full rounded border px-3 py-2 text-sm"/><button disabled={!moi} className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Envoyer</button></form>
      <form action={creerConversationInterneAction} className="space-y-3 rounded border p-3"><input type="hidden" name="type" value="chantier"/><h3 className="text-sm font-semibold">Écrire dans un chantier</h3><SearchableSelect name="cible_id" required options={optionsChantiers} placeholder="Rechercher un chantier…"/><textarea name="contenu" required maxLength={5000} rows={2} placeholder="Information pour l’équipe du chantier…" className="w-full rounded border px-3 py-2 text-sm"/><button disabled={!moi} className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Publier dans le chantier</button></form>
    </div></section>
    <div className="grid min-h-[520px] overflow-hidden rounded-lg border md:grid-cols-[280px_1fr]">
      <aside className="border-b bg-neutral-50 p-2 dark:bg-neutral-950 md:border-b-0 md:border-r"><p className="px-2 py-2 text-xs font-semibold uppercase text-neutral-500">Conversations</p>{(conversations??[]).map((conversation)=><Link key={conversation.id} href={`/messagerie?conversation=${conversation.id}`} className={`mb-1 block rounded p-3 text-sm ${conversation.id===conversationId?"bg-[#0d1b2a] text-white":"hover:bg-neutral-100 dark:hover:bg-neutral-900"}`}><strong className="block truncate">{titreConversation(conversation)}</strong><span className={`text-xs ${conversation.id===conversationId?"text-white/70":"text-neutral-500"}`}>{new Date(conversation.derniere_activite_at).toLocaleString("fr-FR")}</span></Link>)}{!(conversations??[]).length&&<p className="p-3 text-sm text-neutral-500">Aucune conversation.</p>}</aside>
      <section className="flex min-w-0 flex-col"><div className="border-b p-4"><h2 className="font-semibold">{selected?titreConversation(selected):"Sélectionnez une conversation"}</h2></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{(messages??[]).map((message)=>{const auteur=un(message.auteur);const personnel=auteur?.id===moi?.id;return <div key={message.id} className={`flex ${personnel?"justify-end":"justify-start"}`}><article className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${personnel?"bg-[#0d1b2a] text-white":"bg-neutral-100 dark:bg-neutral-900"}`}><p className="mb-1 text-xs font-semibold opacity-70">{auteur?`${auteur.prenom} ${auteur.nom}`:"Collaborateur"}</p><p className="whitespace-pre-wrap">{message.contenu}</p><p className="mt-1 text-[10px] opacity-60">{new Date(message.created_at).toLocaleString("fr-FR")}</p></article></div>})}{selected&&!(messages??[]).length&&<p className="text-center text-sm text-neutral-500">Aucun message.</p>}</div>{selected&&<ZoneReponseMessagerie conversationId={selected.id} actionEnvoyer={envoyerMessageInterneAction.bind(null,selected.id)} peutUtiliserIA={peutUtiliserIA} />}</section>
    </div>
  </div></main>;
}
