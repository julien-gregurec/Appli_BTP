import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { deconnexionAction } from "@/app/actions";
import { ENTREPRISE_PAR_DEFAUT, lireContexteRefus } from "@/lib/contexte";
import { explicationRefus } from "@/lib/messages-refus";

export const metadata: Metadata = { title: "Accès non habilité" };

/**
 * Page terminale : elle ne redirige que vers `/login`, et uniquement pour une
 * session absente. Elle n'appelle jamais `getContexteColors`, qui redirigerait
 * ici même — la boucle historique. `/login` renvoie les sessions valides vers
 * `/dashboard` et non vers cette page : aucun rebond n'est possible.
 */
export default async function AccesRefusePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, contexte] = await Promise.all([searchParams, lireContexteRefus()]);
  if (!contexte.authentifie) redirect("/login");

  const compteUrl = process.env.NEXT_PUBLIC_ELSATIA_ACCOUNT_URL ?? "http://localhost:3000/abonnement";
  const organisation = contexte.entrepriseNom ?? ENTREPRISE_PAR_DEFAUT;
  return (
    <main className="denied-page">
      <section className="denied-card">
        <Brand />
        <div className="denied-symbol" aria-hidden="true">⌁</div>
        <span className="eyebrow">Habilitation utilisateur requise</span>
        <h1>Votre accès Colors doit être autorisé</h1>
        <p><strong>{organisation}</strong> — {explicationRefus(params.motif)}</p>
        <div className="denied-actions">
          <a className="primary" href={compteUrl}>Ouvrir le compte ELSATIA</a>
          <form action={deconnexionAction}><button type="submit">Se déconnecter</button></form>
        </div>
      </section>
    </main>
  );
}
