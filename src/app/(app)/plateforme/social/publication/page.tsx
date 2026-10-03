import { notFound } from "next/navigation";
import { adminSocial, contexteSocial } from "@/lib/social/acces";
import { listerComptes } from "@/lib/social/comptes";
import { modeSimulation } from "@/lib/social/config";
import { logoElsatia } from "@/lib/social/identite";
import { BUCKET_SOCIAL, chargerPublication } from "@/lib/social/publication";
import { peut } from "@/lib/social/roles";
import { estModifiable } from "@/lib/social/workflow";
import type { Reseau } from "@/lib/social/types";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { EditeurPublication, type ValeursEditeur } from "@/components/social/EditeurPublication";
import { PanneauValidation } from "@/components/social/PanneauValidation";
import { SocialEntete } from "@/components/social/SocialEntete";
import { StatutBadge } from "@/components/social/StatutBadge";

export const metadata = { title: "Publication — ELSATIA Social" };

export default async function PublicationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const ctx = await contexteSocial();
  if (!ctx) return <AccesRefuse />;
  const { id } = await searchParams;
  const admin = adminSocial();
  const comptes = await listerComptes(admin);
  const nomsComptes = Object.fromEntries(comptes.map((c) => [c.reseau, c.reseau === "instagram" && c.nom_utilisateur ? c.nom_utilisateur : c.nom_compte])) as Partial<Record<Reseau, string>>;

  const p = id ? await chargerPublication(admin, id) : null;
  if (id && !p) notFound();
  if (!p && !peut(ctx.role, "rediger")) return <AccesRefuse />;

  const urls = new Map<string, string>();
  if (p?.medias.length) {
    const { data } = await admin.storage.from(BUCKET_SOCIAL).createSignedUrls(p.medias.map((m) => m.storage_path), 900);
    for (const [i, m] of p.medias.entries()) if (data?.[i]?.signedUrl) urls.set(m.id, data[i].signedUrl);
  }

  const initial: ValeursEditeur = p
    ? {
        id: p.publication.id,
        titre: p.publication.titre,
        contenu_principal: p.publication.contenu_principal,
        contenu_facebook: p.publication.contenu_facebook ?? "",
        contenu_instagram: p.publication.contenu_instagram ?? "",
        contenu_linkedin: p.publication.contenu_linkedin ?? "",
        lien_url: p.publication.lien_url ?? "",
        application: p.publication.application,
        reseaux: p.publication.reseaux,
        programme_at: p.publication.programme_at,
        medias: p.medias.map((m) => ({ id: m.id, type: m.type, url: urls.get(m.id) ?? null, texteAlternatif: m.texte_alternatif ?? "", mimeType: m.mime_type, tailleOctets: Number(m.taille_octets), largeur: m.largeur, hauteur: m.hauteur, duree: m.duree_secondes === null ? null : Number(m.duree_secondes) })),
      }
    : { id: null, titre: "", contenu_principal: "", contenu_facebook: "", contenu_instagram: "", contenu_linkedin: "", lien_url: "", application: "elsatia", reseaux: ["facebook", "instagram", "linkedin"], programme_at: null, medias: [] };

  const { data: historique } = p
    ? await admin.from("social_audit").select("id,acteur,action,reseau,created_at").eq("publication_id", p.publication.id).order("created_at", { ascending: false }).limit(30)
    : { data: [] };

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <SocialEntete titre={p ? p.publication.titre : "Nouvelle publication"} role={ctx.role} actif={p ? "" : "/plateforme/social/publication"} />
        {p && (
          <p className="flex items-center gap-2 text-sm">
            <StatutBadge statut={p.publication.statut} /> créé par {p.publication.cree_par}
            {p.publication.modifie_par && p.publication.modifie_par !== p.publication.cree_par ? `, modifié par ${p.publication.modifie_par}` : ""}
          </p>
        )}
        <EditeurPublication key={p?.publication.updated_at ?? "nouvelle"} initial={initial} modifiable={!p || estModifiable(p.publication.statut)} peutRediger={peut(ctx.role, "rediger")} comptes={nomsComptes} logo={logoElsatia()} />
        {p && (
          <PanneauValidation
            id={p.publication.id}
            statut={p.publication.statut}
            programmeAt={p.publication.programme_at}
            reseaux={p.publication.reseaux}
            peutRediger={peut(ctx.role, "rediger")}
            peutValider={peut(ctx.role, "valider")}
            peutPublier={peut(ctx.role, "publier")}
            simulation={modeSimulation()}
            cibles={p.cibles.filter((c) => c.statut !== "annule").map((c) => ({ id: c.id, reseau: c.reseau, statut: c.statut, erreur: c.erreur, erreur_code: c.erreur_code, external_url: c.external_url, prochaine_tentative_at: c.prochaine_tentative_at, publie_at: c.publie_at }))}
            approbation={{ par: p.publication.approuve_par, le: p.publication.approuve_at, commentaire: p.publication.commentaire_validation }}
          />
        )}
        {p && (historique?.length ?? 0) > 0 && (
          <section className="rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h2 className="mb-2 font-semibold">Historique</h2>
            <ul className="space-y-1 text-xs">
              {historique!.map((h) => (
                <li key={h.id} className="tabular-nums">
                  {new Date(h.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} — {h.acteur} — {h.action.replaceAll("_", " ")}
                  {h.reseau ? ` (${h.reseau})` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
