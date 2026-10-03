import Link from "next/link";
import { adminSocial, contexteSocial } from "@/lib/social/acces";
import { peut } from "@/lib/social/roles";
import { STATUTS_PUBLICATION } from "@/lib/social/types";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { CalendrierEditorial, type EvenementCalendrier } from "@/components/social/CalendrierEditorial";
import { SocialEntete } from "@/components/social/SocialEntete";
import { StatutBadge } from "@/components/social/StatutBadge";

export const metadata = { title: "Calendrier — ELSATIA Social" };

export default async function CalendrierPage({ searchParams }: { searchParams: Promise<{ vue?: string; date?: string }> }) {
  const ctx = await contexteSocial();
  if (!ctx) return <AccesRefuse />;
  const params = await searchParams;
  const vue = params.vue === "jour" || params.vue === "semaine" ? params.vue : "mois";
  const reference = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : new Date().toISOString().slice(0, 10);
  const ref = new Date(`${reference}T12:00:00Z`);
  // Fenêtre large (6 semaines autour de la référence) : couvre les trois vues.
  const debut = new Date(ref.getTime() - 40 * 86400_000).toISOString();
  const fin = new Date(ref.getTime() + 45 * 86400_000).toISOString();
  const admin = adminSocial();
  const colonnes = "id,titre,statut,reseaux,programme_at,publie_at";
  const [{ data: prevues }, { data: publiees }, { data: sansDate }] = await Promise.all([
    admin.from("social_publications").select(colonnes).is("publie_at", null).gte("programme_at", debut).lte("programme_at", fin).neq("statut", "annule"),
    admin.from("social_publications").select(colonnes).gte("publie_at", debut).lte("publie_at", fin),
    admin.from("social_publications").select("id,titre,statut").is("programme_at", null).is("publie_at", null).in("statut", ["idee", "brouillon", "a_valider", "valide"]).order("created_at", { ascending: false }).limit(30),
  ]);
  const evenements: EvenementCalendrier[] = [...(prevues ?? []), ...(publiees ?? [])].map((p) => ({ id: p.id, titre: p.titre, statut: p.statut, reseaux: p.reseaux, date: (p.publie_at ?? p.programme_at) as string }));

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <SocialEntete titre="Calendrier éditorial" role={ctx.role} actif="/plateforme/social/calendrier" description="Glisser-déposer une idée ou un brouillon pour changer sa date. Les contenus validés ne se déplacent que par un validateur." />
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Légende">
          {STATUTS_PUBLICATION.filter((s) => !["publication_en_cours", "annule"].includes(s.cle)).map((s) => (
            <li key={s.cle}><StatutBadge statut={s.cle} /></li>
          ))}
        </ul>
        <CalendrierEditorial evenements={evenements} vue={vue} reference={reference} peutPlanifier={peut(ctx.role, "planifier") || peut(ctx.role, "publier")} peutDeplacerValide={peut(ctx.role, "publier")} />
        {(sansDate?.length ?? 0) > 0 && (
          <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="mb-2 text-sm font-semibold">Sans date</h2>
            <ul className="space-y-1 text-sm">
              {sansDate!.map((p) => (
                <li key={p.id} className="flex items-center gap-2"><StatutBadge statut={p.statut} /><Link href={`/plateforme/social/publication?id=${p.id}`} className="hover:underline">{p.titre}</Link></li>
              ))}
            </ul>
          </section>
        )}
        {peut(ctx.role, "planifier") && <p className="text-sm"><Link href="/plateforme/social/assistant" className="underline">Générer un calendrier éditorial avec l’Assistant Social</Link></p>}
      </div>
    </main>
  );
}
