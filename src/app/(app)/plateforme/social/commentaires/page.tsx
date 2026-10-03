import Link from "next/link";
import { adminSocial, contexteSocial } from "@/lib/social/acces";
import { listerComptes } from "@/lib/social/comptes";
import { peut } from "@/lib/social/roles";
import { LIBELLE_RESEAU, RESEAUX, estReseau } from "@/lib/social/types";
import { synchroniserAction } from "@/app/actions/social";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { BoutonAction } from "@/components/social/BoutonAction";
import { ElementReponse } from "@/components/social/ElementReponse";
import { SocialEntete } from "@/components/social/SocialEntete";

export const metadata = { title: "Commentaires — ELSATIA Social" };

export default async function CommentairesPage({ searchParams }: { searchParams: Promise<{ reseau?: string; tous?: string }> }) {
  const ctx = await contexteSocial();
  if (!ctx) return <AccesRefuse />;
  const { reseau, tous } = await searchParams;
  const admin = adminSocial();
  let requete = admin.from("social_commentaires").select("id,reseau,cible_id,auteur_nom,contenu,publie_externe_at,statut,brouillon_reponse,brouillon_ia,reponse_validee_par,erreur,external_parent_id").order("publie_externe_at", { ascending: false, nullsFirst: false }).limit(100);
  if (estReseau(reseau)) requete = requete.eq("reseau", reseau);
  if (!tous) requete = requete.in("statut", ["nouveau", "lu", "reponse_preparee", "echec"]);
  const [{ data: commentaires }, comptes] = await Promise.all([requete, listerComptes(admin)]);
  const cibles = [...new Set((commentaires ?? []).map((c) => c.cible_id).filter(Boolean))] as string[];
  const { data: liens } = cibles.length ? await admin.from("social_publication_cibles").select("id,publication_id,publication:social_publications(titre)").in("id", cibles) : { data: [] };
  const titreDe = new Map((liens ?? []).map((l) => [l.id, { id: l.publication_id, titre: (Array.isArray(l.publication) ? l.publication[0] : l.publication)?.titre ?? "Publication" }]));
  const sansCompte = RESEAUX.filter((r) => !comptes.some((c) => c.reseau === r));

  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <SocialEntete titre="Commentaires" role={ctx.role} actif="/plateforme/social/commentaires" description="Reçus par webhook (Meta, LinkedIn) ou par synchronisation. Aucune réponse n’est envoyée sans validation." />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex flex-wrap gap-1">
            <Link href="/plateforme/social/commentaires" className={`rounded-full border px-3 py-1 ${!reseau ? "font-semibold" : ""}`}>Tous les réseaux</Link>
            {RESEAUX.map((r) => <Link key={r} href={`/plateforme/social/commentaires?reseau=${r}`} className={`rounded-full border px-3 py-1 ${reseau === r ? "font-semibold" : ""}`}>{LIBELLE_RESEAU[r]}</Link>)}
            <Link href={`/plateforme/social/commentaires?tous=1${estReseau(reseau) ? `&reseau=${reseau}` : ""}`} className="rounded-full border px-3 py-1">Afficher aussi les traités</Link>
          </div>
          {peut(ctx.role, "synchroniser") && <BoutonAction libelle="Synchroniser" action={synchroniserAction.bind(null, "commentaires")} />}
        </div>
        {sansCompte.length > 0 && <p className="text-xs text-neutral-500">Non connecté : {sansCompte.map((r) => LIBELLE_RESEAU[r]).join(", ")}.</p>}
        <ul className="space-y-3">
          {(commentaires ?? []).length === 0 && <li className="text-sm text-neutral-500">Aucun commentaire à traiter.</li>}
          {(commentaires ?? []).map((c) => {
            const pub = c.cible_id ? titreDe.get(c.cible_id) : null;
            return (
              <li key={c.id} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                <p className="text-xs text-neutral-500">
                  {LIBELLE_RESEAU[c.reseau as keyof typeof LIBELLE_RESEAU]} · {c.auteur_nom ?? "Utilisateur"} · {c.publie_externe_at ? new Date(c.publie_externe_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : ""}
                  {pub && <> · sur <Link className="underline" href={`/plateforme/social/publication?id=${pub.id}`}>{pub.titre}</Link></>}
                  {c.external_parent_id && " · réponse à un commentaire"}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{c.contenu || <em className="text-neutral-500">Texte non transmis par la plateforme : synchroniser.</em>}</p>
                {c.erreur && <p className="text-xs text-red-700">{c.erreur}</p>}
                <ElementReponse type="commentaire" id={c.id} brouillon={c.brouillon_reponse} brouillonIA={c.brouillon_ia} statut={c.statut} peutPreparer={peut(ctx.role, "preparer_reponse")} peutEnvoyer={peut(ctx.role, "envoyer_reponse")} indisponible={null} />
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
