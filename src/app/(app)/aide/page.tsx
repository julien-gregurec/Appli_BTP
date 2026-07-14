import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { envoyerMessageSupportAction } from "@/app/actions/support";

type Message = { id: string; cote: string; auteur_nom: string | null; contenu: string; created_at: string };

export default async function AidePage({ searchParams }: { searchParams: Promise<{ envoye?: string; error?: string }> }) {
  const { envoye, error } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data } = await supabase
    .from("support_messages")
    .select("id, cote, auteur_nom, contenu, created_at")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("created_at");
  const messages = (data ?? []) as Message[];

  // Marquer les réponses plateforme comme lues.
  await supabase.rpc("support_marquer_lus_entreprise", { p_entreprise_id: ctx.entrepriseId });

  return (
    <main className="p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">Aide & support</h1>
          <p className="text-sm text-neutral-500">Une question, un souci ? Écrivez à l&apos;équipe LIRIA, nous vous répondons ici.</p>
        </div>

        <section className="flex flex-col gap-3 rounded-lg border border-[#c9a24a]/50 bg-[#c9a24a]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Guide complet d&apos;utilisation</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">24 pages : comptes, droits, planning, pointage GPS, devis, factures, achats, stock, compte dépôt, notes de frais et dépannage.</p>
          </div>
          <a href="/guides/Guide_utilisation_Liria_Gestion_Pro.pdf" target="_blank" rel="noopener" className="flex-none rounded-md bg-[#0d1b2a] px-4 py-2 text-center text-sm font-semibold text-white">
            Ouvrir le guide PDF
          </a>
        </section>

        {envoye && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Message envoyé. L&apos;équipe vous répondra ici.</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          {messages.length === 0 && <p className="text-center text-sm text-neutral-500">Aucun message pour l&apos;instant. Posez votre question ci-dessous.</p>}
          {messages.map((m) => {
            const plateforme = m.cote === "plateforme";
            return (
              <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${plateforme ? "self-start bg-neutral-100 dark:bg-neutral-800" : "self-end bg-[#0d1b2a] text-white"}`}>
                <div className={`mb-0.5 text-[10px] uppercase tracking-wide ${plateforme ? "text-neutral-500" : "text-white/60"}`}>
                  {plateforme ? "Support LIRIA" : m.auteur_nom || "Vous"}
                </div>
                <div className="whitespace-pre-wrap">{m.contenu}</div>
                <div className={`mt-1 text-[10px] ${plateforme ? "text-neutral-400" : "text-white/50"}`}>
                  {new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            );
          })}
        </div>

        <form action={envoyerMessageSupportAction} className="flex flex-col gap-2">
          <textarea name="contenu" rows={3} required placeholder="Décrivez votre question ou votre problème…"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          <button type="submit" className="self-end rounded-md bg-[#0d1b2a] px-5 py-2 text-sm font-semibold text-white">Envoyer</button>
        </form>
      </div>
    </main>
  );
}
