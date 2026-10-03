import Link from "next/link";
import { adminSocial, contexteSocial } from "@/lib/social/acces";
import { peut } from "@/lib/social/roles";
import { ilYaJours } from "@/lib/social/temps";
import { APPLICATIONS_ELSATIA, LIBELLE_RESEAU, RESEAUX, type Reseau } from "@/lib/social/types";
import { synchroniserAction } from "@/app/actions/social";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { AnalyseIA } from "@/components/social/AnalyseIA";
import { BoutonAction } from "@/components/social/BoutonAction";
import { SocialEntete } from "@/components/social/SocialEntete";

export const metadata = { title: "Statistiques — ELSATIA Social" };

type Ligne = { cible_id: string; publication_id: string; reseau: Reseau; impressions: number | null; portee: number | null; vues: number | null; likes: number | null; commentaires: number | null; partages: number | null; clics: number | null; enregistrements: number | null; collecte_at: string };

// Libellé exact de chaque métrique par réseau : les définitions diffèrent.
const DEFINITIONS: Record<Reseau, { portee: string; vues: string; impressions: string; likes: string; clics: string }> = {
  facebook: { portee: "Spectateurs uniques (post_total_media_view_unique)", vues: "Vues (post_media_view)", impressions: "— (retirée par Meta)", likes: "Réactions", clics: "Clics (post_clicks)" },
  instagram: { portee: "Comptes atteints (reach)", vues: "Vues (views)", impressions: "— (retirée par Meta)", likes: "J’aime", clics: "— (non fournie)" },
  linkedin: { portee: "Impressions uniques", vues: "—", impressions: "Impressions", likes: "Réactions", clics: "Clics" },
};

const n = (v: number | null | undefined) => (v === null || v === undefined ? "n/d" : v.toLocaleString("fr-FR"));
const somme = (lignes: Ligne[], cle: keyof Ligne) => {
  const valeurs = lignes.map((l) => l[cle]).filter((v): v is number => typeof v === "number");
  return valeurs.length ? valeurs.reduce((a, b) => a + b, 0) : null;
};

export default async function StatistiquesPage({ searchParams }: { searchParams: Promise<{ jours?: string }> }) {
  const ctx = await contexteSocial();
  if (!ctx) return <AccesRefuse />;
  const jours = [7, 30, 90, 365].includes(Number((await searchParams).jours)) ? Number((await searchParams).jours) : 30;
  const depuis = ilYaJours(jours);
  const admin = adminSocial();
  const [{ data: stats }, { data: publications }, { data: abonnes }, { data: comptes }, { count: publiees }] = await Promise.all([
    admin.from("social_statistiques").select("cible_id,publication_id,reseau,impressions,portee,vues,likes,commentaires,partages,clics,enregistrements,collecte_at").gte("collecte_at", depuis).order("collecte_at", { ascending: false }).limit(5000),
    admin.from("social_publications").select("id,titre,application,publie_at").not("publie_at", "is", null).gte("publie_at", depuis),
    admin.from("social_abonnes").select("compte_id,collecte_le,abonnes").gte("collecte_le", depuis.slice(0, 10)).order("collecte_le"),
    admin.from("social_comptes").select("id,reseau").neq("statut", "revoque"),
    admin.from("social_publication_cibles").select("id", { count: "exact", head: true }).eq("statut", "publie").gte("publie_at", depuis),
  ]);
  // Dernière mesure par cible (les statistiques sont des cumuls).
  const dernieres = new Map<string, Ligne>();
  for (const s of (stats ?? []) as Ligne[]) if (!dernieres.has(s.cible_id)) dernieres.set(s.cible_id, s);
  const lignes = [...dernieres.values()];
  const titres = new Map((publications ?? []).map((p) => [p.id, p]));
  const parReseau = (r: Reseau) => lignes.filter((l) => l.reseau === r);
  const evolution = RESEAUX.map((r) => {
    const ids = new Set((comptes ?? []).filter((c) => c.reseau === r).map((c) => c.id));
    const serie = (abonnes ?? []).filter((a) => ids.has(a.compte_id));
    return { r, premier: serie[0]?.abonnes ?? null, dernier: serie.at(-1)?.abonnes ?? null };
  });
  const engagement = (l: Ligne) => (l.likes ?? 0) + (l.commentaires ?? 0) + (l.partages ?? 0);
  const meilleurs = [...lignes].sort((a, b) => engagement(b) - engagement(a)).slice(0, 10);

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <SocialEntete titre="Statistiques" role={ctx.role} actif="/plateforme/social/statistiques" description="Seules les métriques équivalentes sont additionnées entre réseaux (réactions, commentaires, partages). Vues, portée et impressions restent par réseau." />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 text-sm">
            {[7, 30, 90, 365].map((j) => (
              <Link key={j} href={`/plateforme/social/statistiques?jours=${j}`} className={`rounded-md px-3 py-1 ${jours === j ? "bg-[#0d1b2a] text-white dark:bg-[#c9a24a] dark:text-[#0d1b2a]" : "border border-neutral-300 dark:border-neutral-700"}`}>{j} j</Link>
            ))}
          </div>
          {peut(ctx.role, "synchroniser") && <BoutonAction libelle="Synchroniser les statistiques" action={synchroniserAction.bind(null, "statistiques")} />}
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Publications envoyées", n(publiees ?? 0)],
            ["Réactions / j’aime", n(somme(lignes, "likes"))],
            ["Commentaires", n(somme(lignes, "commentaires"))],
            ["Partages", n(somme(lignes, "partages"))],
          ].map(([titre, valeur]) => (
            <div key={titre} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
              <p className="text-xs text-neutral-500">{titre}</p>
              <p className="text-2xl font-semibold tabular-nums">{valeur}</p>
            </div>
          ))}
        </section>

        <section className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <h2 className="px-3 pt-3 text-base font-semibold">Performance par réseau</h2>
          <table className="mt-2 w-full min-w-[760px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr><th className="px-3 py-2">Réseau</th><th className="px-3 py-2">Publications mesurées</th><th className="px-3 py-2">Portée</th><th className="px-3 py-2">Vues / impressions</th><th className="px-3 py-2">Réactions</th><th className="px-3 py-2">Commentaires</th><th className="px-3 py-2">Partages</th><th className="px-3 py-2">Clics</th><th className="px-3 py-2">Abonnés</th></tr>
            </thead>
            <tbody>
              {RESEAUX.map((r) => {
                const l = parReseau(r);
                const ev = evolution.find((e) => e.r === r)!;
                return (
                  <tr key={r} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                    <td className="px-3 py-2 font-medium">{LIBELLE_RESEAU[r]}</td>
                    <td className="px-3 py-2 tabular-nums">{l.length}</td>
                    <td className="px-3 py-2 tabular-nums">{n(somme(l, "portee"))}<span className="block text-[11px] text-neutral-500">{DEFINITIONS[r].portee}</span></td>
                    <td className="px-3 py-2 tabular-nums">{r === "linkedin" ? n(somme(l, "impressions")) : n(somme(l, "vues"))}<span className="block text-[11px] text-neutral-500">{r === "linkedin" ? DEFINITIONS[r].impressions : DEFINITIONS[r].vues}</span></td>
                    <td className="px-3 py-2 tabular-nums">{n(somme(l, "likes"))}<span className="block text-[11px] text-neutral-500">{DEFINITIONS[r].likes}</span></td>
                    <td className="px-3 py-2 tabular-nums">{n(somme(l, "commentaires"))}</td>
                    <td className="px-3 py-2 tabular-nums">{n(somme(l, "partages"))}</td>
                    <td className="px-3 py-2 tabular-nums">{n(somme(l, "clics"))}<span className="block text-[11px] text-neutral-500">{DEFINITIONS[r].clics}</span></td>
                    <td className="px-3 py-2 tabular-nums">{n(ev.dernier)}{ev.premier !== null && ev.dernier !== null && <span className={`block text-[11px] ${ev.dernier - ev.premier >= 0 ? "text-green-700" : "text-red-700"}`}>{ev.dernier - ev.premier >= 0 ? "+" : ""}{(ev.dernier - ev.premier).toLocaleString("fr-FR")} sur la période</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <h2 className="px-3 pt-3 text-base font-semibold">Performance par application ELSATIA</h2>
          <table className="mt-2 w-full min-w-[560px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr><th className="px-3 py-2">Produit</th><th className="px-3 py-2">Publications</th><th className="px-3 py-2">Réactions</th><th className="px-3 py-2">Commentaires</th><th className="px-3 py-2">Partages</th></tr>
            </thead>
            <tbody>
              {APPLICATIONS_ELSATIA.map((a) => {
                const l = lignes.filter((x) => titres.get(x.publication_id)?.application === a.cle);
                const nb = (publications ?? []).filter((p) => p.application === a.cle).length;
                if (nb === 0) return null;
                return (
                  <tr key={a.cle} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="px-3 py-2 font-medium">{a.libelle}</td><td className="px-3 py-2 tabular-nums">{nb}</td><td className="px-3 py-2 tabular-nums">{n(somme(l, "likes"))}</td><td className="px-3 py-2 tabular-nums">{n(somme(l, "commentaires"))}</td><td className="px-3 py-2 tabular-nums">{n(somme(l, "partages"))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <h2 className="text-base font-semibold">Meilleures publications</h2>
          <p className="text-xs text-neutral-500">Classement par réactions + commentaires + partages, au sein de chaque réseau.</p>
          <ol className="mt-2 space-y-1 text-sm">
            {meilleurs.length === 0 && <li className="text-neutral-500">Aucune statistique collectée sur la période.</li>}
            {meilleurs.map((l) => (
              <li key={l.cible_id} className="flex flex-wrap justify-between gap-2">
                <Link href={`/plateforme/social/publication?id=${l.publication_id}`} className="hover:underline">{titres.get(l.publication_id)?.titre ?? "Publication"} — {LIBELLE_RESEAU[l.reseau]}</Link>
                <span className="tabular-nums text-neutral-600">{n(l.likes)} réactions · {n(l.commentaires)} commentaires · {n(l.partages)} partages</span>
              </li>
            ))}
          </ol>
        </section>
        {(peut(ctx.role, "rediger") || peut(ctx.role, "valider")) && <AnalyseIA />}
      </div>
    </main>
  );
}
