import Link from "next/link";
import { adminSocial, contexteSocial } from "@/lib/social/acces";
import { peut } from "@/lib/social/roles";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { SocialEntete } from "@/components/social/SocialEntete";

export const metadata = { title: "Journal — ELSATIA Social" };

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await contexteSocial();
  if (!ctx || !peut(ctx.role, "voir_journal")) return <AccesRefuse />;
  const page = Math.max(0, Number((await searchParams).page ?? 0) || 0);
  const admin = adminSocial();
  const [{ data: entrees }, { data: webhooks }] = await Promise.all([
    admin.from("social_audit").select("*").order("created_at", { ascending: false }).range(page * 100, page * 100 + 99),
    admin.from("social_webhook_evenements").select("id,fournisseur,type_evenement,statut,tentatives,erreur,recu_at").in("statut", ["echec", "abandonne"]).order("recu_at", { ascending: false }).limit(20),
  ]);
  const json = (v: unknown) => (v && (typeof v !== "object" || Object.keys(v as object).length) ? JSON.stringify(v) : "");

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <SocialEntete titre="Journal d’audit" role={ctx.role} actif="/plateforme/social/journal" description="Journal en ajout seul : utilisateur, action, date, réseau, publication, avant/après." />
        {(webhooks?.length ?? 0) > 0 && (
          <section className="rounded-md border border-red-200 p-3 text-sm dark:border-red-900">
            <h2 className="font-semibold">Webhooks en échec (file des échecs)</h2>
            <ul className="mt-1 space-y-1 text-xs">
              {webhooks!.map((w) => <li key={w.id}>{new Date(w.recu_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} — {w.fournisseur} {w.type_evenement ?? ""} — {w.statut} après {w.tentatives} tentative(s) — {w.erreur}</li>)}
            </ul>
          </section>
        )}
        <section className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-neutral-50 text-left uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Utilisateur</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Réseau</th><th className="px-3 py-2">Publication</th><th className="px-3 py-2">Avant → après / détails</th></tr></thead>
            <tbody>
              {(entrees ?? []).map((e) => (
                <tr key={e.id} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{new Date(e.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</td>
                  <td className="px-3 py-2">{e.acteur}</td>
                  <td className="px-3 py-2">{String(e.action).replaceAll("_", " ")}</td>
                  <td className="px-3 py-2">{e.reseau ?? ""}</td>
                  <td className="px-3 py-2">{e.publication_id ? <Link className="underline" href={`/plateforme/social/publication?id=${e.publication_id}`}>ouvrir</Link> : ""}</td>
                  <td className="max-w-md break-words px-3 py-2 font-mono text-[11px]">{json(e.avant) && <span className="block text-red-700">− {json(e.avant)}</span>}{json(e.apres) && <span className="block text-green-700">+ {json(e.apres)}</span>}{json(e.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="flex gap-2 text-sm">
          {page > 0 && <Link className="underline" href={`/plateforme/social/journal?page=${page - 1}`}>← Plus récents</Link>}
          {(entrees?.length ?? 0) === 100 && <Link className="underline" href={`/plateforme/social/journal?page=${page + 1}`}>Plus anciens →</Link>}
        </div>
      </div>
    </main>
  );
}
