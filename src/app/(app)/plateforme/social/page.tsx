import Link from "next/link";
import { adminSocial, contexteSocial } from "@/lib/social/acces";
import { listerComptes, joursAvantExpiration } from "@/lib/social/comptes";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { SocialEntete } from "@/components/social/SocialEntete";
import { StatutBadge } from "@/components/social/StatutBadge";
import { LIBELLE_RESEAU, libelleApplication, RESEAUX, STATUTS_PUBLICATION, type Publication } from "@/lib/social/types";

export const metadata = { title: "ELSATIA Social" };

const date = (v: string | null) => (v ? new Date(v).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ statut?: string; q?: string }> }) {
  const ctx = await contexteSocial();
  if (!ctx) return <AccesRefuse />;
  const { statut, q } = await searchParams;
  const admin = adminSocial();

  let requete = admin.from("social_publications").select("id,titre,statut,reseaux,application,programme_at,publie_at,created_at,cree_par,approuve_par").order("updated_at", { ascending: false }).limit(200);
  if (statut && STATUTS_PUBLICATION.some((s) => s.cle === statut)) requete = requete.eq("statut", statut);
  if (q?.trim()) requete = requete.ilike("titre", `%${q.trim().replace(/[%_]/g, "")}%`);
  const [{ data: publications }, { data: compteurs }, comptes, { count: commentairesNouveaux }] = await Promise.all([
    requete,
    admin.from("social_publications").select("statut"),
    listerComptes(admin),
    admin.from("social_commentaires").select("id", { count: "exact", head: true }).in("statut", ["nouveau", "reponse_preparee"]),
  ]);
  const parStatut = new Map<string, number>();
  for (const c of compteurs ?? []) parStatut.set(c.statut, (parStatut.get(c.statut) ?? 0) + 1);
  const liste = (publications ?? []) as Pick<Publication, "id" | "titre" | "statut" | "reseaux" | "application" | "programme_at" | "publie_at" | "created_at" | "cree_par" | "approuve_par">[];

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <SocialEntete titre="Réseaux sociaux ELSATIA" role={ctx.role} actif="/plateforme/social" description="Facebook, Instagram et LinkedIn : brouillon → prévisualisation → validation humaine → publication." />

        <section className="grid gap-3 sm:grid-cols-3">
          {RESEAUX.map((reseau) => {
            const compte = comptes.find((c) => c.reseau === reseau);
            const jours = compte ? joursAvantExpiration(compte) : null;
            return (
              <div key={reseau} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                <p className="font-semibold">{LIBELLE_RESEAU[reseau]}</p>
                {compte ? (
                  <>
                    <p className="text-neutral-600 dark:text-neutral-400">{compte.nom_compte}</p>
                    <p className={compte.statut === "connecte" && (jours === null || jours > 10) ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                      {compte.statut === "connecte" ? "Connecté" : "À reconnecter"}
                      {jours !== null && (jours > 10 ? ` · jeton : ${jours} j` : ` · jeton expirant dans ${jours} j : reconnecter`)}
                    </p>
                  </>
                ) : (
                  <p className="text-neutral-500">Non connecté — <Link className="underline" href="/plateforme/social/comptes">connecter</Link></p>
                )}
              </div>
            );
          })}
        </section>

        <section className="flex flex-wrap gap-2 text-sm">
          <Link href="/plateforme/social" className={`rounded-full border px-3 py-1 ${!statut ? "border-elsatia-electrique font-semibold dark:border-elsatia-cyan" : "border-neutral-300 dark:border-neutral-700"}`}>Toutes ({compteurs?.length ?? 0})</Link>
          {STATUTS_PUBLICATION.filter((s) => parStatut.get(s.cle)).map((s) => (
            <Link key={s.cle} href={`/plateforme/social?statut=${s.cle}`} className={`rounded-full border px-3 py-1 ${statut === s.cle ? "border-elsatia-electrique font-semibold dark:border-elsatia-cyan" : "border-neutral-300 dark:border-neutral-700"}`}>
              {s.libelle} ({parStatut.get(s.cle)})
            </Link>
          ))}
          {(commentairesNouveaux ?? 0) > 0 && <Link href="/plateforme/social/commentaires" className="rounded-full bg-elsatia-cyan px-3 py-1 font-semibold text-elsatia-nuit">{commentairesNouveaux} commentaire(s) à traiter</Link>}
        </section>

        <form className="relative flex gap-2" role="search">
          {statut && <input type="hidden" name="statut" value={statut} />}
          <label className="sr-only" htmlFor="recherche-publication">Rechercher une publication</label>
          <input id="recherche-publication" name="q" defaultValue={q ?? ""} placeholder="Rechercher par titre…" className="w-full max-w-sm rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">Rechercher</button>
        </form>

        <section className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2">Titre</th>
                <th className="px-3 py-2">Produit</th>
                <th className="px-3 py-2">Réseaux</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Auteur / validation</th>
              </tr>
            </thead>
            <tbody>
              {liste.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-neutral-500">Aucune publication. <Link href="/plateforme/social/publication" className="underline">Créer la première</Link>.</td>
                </tr>
              )}
              {liste.map((p) => (
                <tr key={p.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-3 py-2 font-medium"><Link href={`/plateforme/social/publication?id=${p.id}`} className="hover:underline">{p.titre}</Link></td>
                  <td className="px-3 py-2">{libelleApplication(p.application)}</td>
                  <td className="px-3 py-2">{p.reseaux.map((r) => LIBELLE_RESEAU[r]).join(", ") || "—"}</td>
                  <td className="px-3 py-2"><StatutBadge statut={p.statut} /></td>
                  <td className="px-3 py-2 tabular-nums">{p.publie_at ? `Publié ${date(p.publie_at)}` : p.programme_at ? `${p.statut === "programme" ? "Programmé" : "Prévu"} ${date(p.programme_at)}` : `Créé ${date(p.created_at)}`}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">{p.cree_par}{p.approuve_par ? ` · validé par ${p.approuve_par}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
