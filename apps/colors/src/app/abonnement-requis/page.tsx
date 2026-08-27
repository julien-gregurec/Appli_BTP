import type { Metadata } from "next";
import { Brand } from "@/components/Brand";
import { deconnexionAction } from "@/app/actions";
import { getContexteColors } from "@/lib/contexte";

export const metadata: Metadata = { title: "Abonnement requis" };

export default async function AbonnementRequisPage() {
  const contexte = await getContexteColors();
  const compteUrl = process.env.NEXT_PUBLIC_ELSATIA_ACCOUNT_URL ?? "http://localhost:3000/abonnement";
  return (
    <main className="denied-page">
      <section className="denied-card">
        <Brand />
        <div className="denied-symbol" aria-hidden="true">◌</div>
        <span className="eyebrow">Droit organisation requis</span>
        <h1>ELSATIA Colors n’est pas activé</h1>
        <p>L’organisation <strong>{contexte.entrepriseNom}</strong> ne dispose pas actuellement d’un droit d’usage Colors actif. Cette situation est distincte de vos habilitations personnelles.</p>
        <div className="denied-actions">
          <a className="primary" href={compteUrl}>Voir les produits ELSATIA</a>
          <form action={deconnexionAction}><button type="submit">Se déconnecter</button></form>
        </div>
      </section>
    </main>
  );
}
