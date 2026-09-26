import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { deconnexionAction } from "@/app/actions";
import { ENTREPRISE_PAR_DEFAUT, lireContexteRefus, urlConnexionCourante } from "@/lib/contexte";
import { urlCompteElsatia } from "@/lib/compte-elsatia";

export const metadata: Metadata = { title: "Abonnement requis" };

/** Page terminale : même règle que `/acces-refuse`, aucun contexte redirigeant. */
export default async function AbonnementRequisPage() {
  const contexte = await lireContexteRefus();
  if (!contexte.authentifie) redirect(await urlConnexionCourante());

  const compteUrl = urlCompteElsatia();
  const organisation = contexte.entrepriseNom ?? ENTREPRISE_PAR_DEFAUT;
  return (
    <main className="denied-page">
      <section className="denied-card">
        <Brand />
        <div className="denied-symbol" aria-hidden="true">◌</div>
        <span className="eyebrow">Droit organisation requis</span>
        <h1>ELSATIA Colors n’est pas activé</h1>
        <p>L’organisation <strong>{organisation}</strong> ne dispose pas actuellement d’un droit d’usage Colors actif. Cette situation est distincte de vos habilitations personnelles.</p>
        <div className="denied-actions">
          <a className="primary" href={compteUrl}>Voir les produits ELSATIA</a>
          <form action={deconnexionAction}><button type="submit">Se déconnecter</button></form>
        </div>
      </section>
    </main>
  );
}
