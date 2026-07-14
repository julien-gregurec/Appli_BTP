import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { repondreSupportPlateformeAction } from "@/app/actions/support";

type Fil = { entreprise_id: string; entreprise_nom: string; dernier_contenu: string | null; dernier_cote: string | null; dernier_at: string | null; non_lus: number; total: number };
type Message = { id: string; cote: string; auteur_nom: string | null; contenu: string; created_at: string };

export default async function PlateformeSupportPage({ searchParams }: { searchParams: Promise<{ entreprise?: string; envoye?: string; error?: string }> }) {
  if (!(await estPlateformeAdmin())) notFound();
  const { entreprise, envoye, error } = await searchParams;
  const supabase = await createClient();

  const { data: filsData } = await supabase.rpc("plateforme_support_fils");
  const fils = (filsData ?? []) as Fil[];
  const actif = entreprise || fils[0]?.entreprise_id || null;

  let messages: Message[] = [];
  let nomActif = "";
  if (actif) {
    const { data } = await supabase.rpc("plateforme_support_messages", { p_entreprise_id: actif });
    messages = (data ?? []) as Message[];
    nomActif = fils.find((f) => f.entreprise_id === actif)?.entreprise_nom ?? "";
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Support — messages des entreprises</h1>
            <p className="text-sm text-neutral-500">Répondez aux demandes d&apos;aide des entreprises clientes.</p>
          </div>
          <Link href="/plateforme" className="rounded-md border px-3 py-2 text-sm font-medium">← Plateforme</Link>
        </div>

        {envoye && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Réponse envoyée.</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <aside className="space-y-1">
            {fils.length === 0 && <p className="text-sm text-neutral-500">Aucune demande pour l&apos;instant.</p>}
            {fils.map((f) => (
              <Link key={f.entreprise_id} href={`/plateforme/support?entreprise=${f.entreprise_id}`}
                className={`block rounded-md border p-3 text-sm ${f.entreprise_id === actif ? "border-[#0d1b2a] bg-neutral-50 dark:bg-neutral-900" : "border-neutral-200 dark:border-neutral-800"}`}>
                <div className="flex items-center justify-between">
                  <strong>{f.entreprise_nom}</strong>
                  {f.non_lus > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">{f.non_lus}</span>}
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-neutral-500">{f.dernier_cote === "plateforme" ? "Vous : " : ""}{f.dernier_contenu}</p>
              </Link>
            ))}
          </aside>

          <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            {!actif && <p className="text-center text-sm text-neutral-500">Sélectionnez une entreprise.</p>}
            {actif && (
              <>
                <h2 className="mb-3 font-semibold">{nomActif}</h2>
                <div className="flex flex-col gap-3">
                  {messages.map((m) => {
                    const plateforme = m.cote === "plateforme";
                    return (
                      <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${plateforme ? "self-end bg-[#0d1b2a] text-white" : "self-start bg-neutral-100 dark:bg-neutral-800"}`}>
                        <div className={`mb-0.5 text-[10px] uppercase tracking-wide ${plateforme ? "text-white/60" : "text-neutral-500"}`}>
                          {plateforme ? "Support LIRIA" : m.auteur_nom || "Entreprise"}
                        </div>
                        <div className="whitespace-pre-wrap">{m.contenu}</div>
                        <div className={`mt-1 text-[10px] ${plateforme ? "text-white/50" : "text-neutral-400"}`}>
                          {new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form action={repondreSupportPlateformeAction.bind(null, actif)} className="mt-4 flex flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <textarea name="contenu" rows={2} required placeholder="Votre réponse…"
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
                  <button type="submit" className="self-end rounded-md bg-[#0d1b2a] px-5 py-2 text-sm font-semibold text-white">Répondre</button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
