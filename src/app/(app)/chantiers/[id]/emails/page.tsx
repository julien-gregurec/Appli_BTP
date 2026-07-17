import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { archiverEmailChantierAction } from "@/app/actions/emails-chantiers";

const input = "mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900";

export default async function EmailsChantierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params;
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_email_chantier");
  const supabase = await createClient();
  const [{ data: chantier }, { data: emails }, { data: connexions }] = await Promise.all([
    supabase.from("chantiers").select("id,nom,reference_interne").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("emails_chantier").select("id,direction,expediteur,destinataires,copie,objet,apercu,recu_at,connexion:connexions_email(adresse_email,fournisseur)").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).order("recu_at", { ascending: false }),
    supabase.from("connexions_email").select("id,adresse_email,fournisseur,statut,derniere_synchro_at").eq("entreprise_id", ctx.entrepriseId),
  ]);
  if (!chantier) notFound();
  const archiver = archiverEmailChantierAction.bind(null, id);
  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <header><Link href={`/chantiers/${id}`} className="text-sm text-neutral-500 hover:underline">← {chantier.nom}</Link><h1 className="mt-1 text-xl font-semibold">E-mails du chantier</h1><p className="text-sm text-neutral-500">{chantier.reference_interne} · correspondances entrantes et sortantes classées dans le dossier.</p></header>
    {messages.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}{messages.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{messages.success}</p>}
    <aside className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>Synchronisation de messagerie</strong><p className="mt-1">{connexions?.some((connexion) => connexion.statut === "active") ? "Une boîte active peut classer automatiquement les messages reconnus par la référence du chantier." : "Aucune boîte OAuth active. Vous pouvez déjà archiver un message manuellement ; l’activation automatique se prépare dans Connecteurs sans enregistrer le mot de passe de la boîte."}</p><Link href="/connecteurs" className="mt-2 inline-block font-medium underline">Configurer les boîtes e-mail</Link></aside>
    {peutGerer && <form action={archiver} className="grid gap-3 rounded border p-4 sm:grid-cols-2"><h2 className="font-semibold sm:col-span-2">Archiver un e-mail manuellement</h2><label className="text-xs">Sens<select name="direction" className={input}><option value="entrant">E-mail reçu</option><option value="sortant">E-mail envoyé</option></select></label><label className="text-xs">Date et heure<input name="recu_at" type="datetime-local" required defaultValue={new Date().toISOString().slice(0,16)} className={input}/></label><label className="text-xs">Expéditeur<input name="expediteur" type="email" className={input}/></label><label className="text-xs">Destinataires<input name="destinataires" placeholder="Séparer par ;" className={input}/></label><label className="text-xs sm:col-span-2">Copie<input name="copie" placeholder="Adresses en copie séparées par ;" className={input}/></label><label className="text-xs sm:col-span-2">Objet<input name="objet" required className={input}/></label><label className="text-xs sm:col-span-2">Résumé du message<textarea name="apercu" rows={4} className={input}/></label><button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white sm:col-span-2">Archiver dans ce chantier</button></form>}
    <section className="space-y-3"><h2 className="font-semibold">Historique ({emails?.length ?? 0})</h2>{(emails ?? []).map(email=><article key={email.id} className="rounded border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{email.objet || "Sans objet"}</strong><p className="text-xs text-neutral-500">{email.direction === "entrant" ? "Reçu de" : "Envoyé à"} {email.direction === "entrant" ? email.expediteur : email.destinataires?.join(", ") || "—"}</p></div><time className="text-xs text-neutral-500">{new Date(email.recu_at).toLocaleString("fr-FR")}</time></div>{email.apercu && <p className="mt-3 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">{email.apercu}</p>}{email.copie?.length ? <p className="mt-2 text-xs text-neutral-500">Copie : {email.copie.join(", ")}</p> : null}</article>)}{!emails?.length && <p className="rounded border border-dashed p-8 text-center text-sm text-neutral-500">Aucun e-mail classé dans ce chantier.</p>}</section>
  </div></main>;
}
