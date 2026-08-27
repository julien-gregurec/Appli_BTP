import type { Metadata } from "next";
import { Brand } from "@/components/Brand";
import { deconnexionAction } from "@/app/actions";
import { getContexteColors } from "@/lib/contexte";

export const metadata: Metadata = { title: "Accès non habilité" };

export default async function AccesRefusePage() {
  const contexte = await getContexteColors();
  const compteUrl = process.env.NEXT_PUBLIC_ELSATIA_ACCOUNT_URL ?? "http://localhost:3000/abonnement";
  return (
    <main className="denied-page">
      <section className="denied-card">
        <Brand />
        <div className="denied-symbol" aria-hidden="true">⌁</div>
        <span className="eyebrow">Habilitation utilisateur requise</span>
        <h1>Votre accès Colors doit être autorisé</h1>
        <p><strong>{contexte.entrepriseNom}</strong> dispose de Colors, mais votre compte n’a pas d’habilitation active. Contactez l’administrateur Colors de votre organisation.</p>
        <div className="denied-actions">
          <a className="primary" href={compteUrl}>Ouvrir le compte ELSATIA</a>
          <form action={deconnexionAction}><button type="submit">Se déconnecter</button></form>
        </div>
      </section>
    </main>
  );
}
