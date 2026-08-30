import type { Metadata } from "next";
import { Brand } from "@/components/Brand";
import { deconnexionAction } from "@/app/actions";
import { getContexteColors } from "@/lib/contexte";

export const metadata: Metadata = { title: "Accès non habilité" };

export default async function AccesRefusePage({
  searchParams,
}: {
  searchParams: Promise<{ motif?: string }>;
}) {
  const { motif } = await searchParams;
  const contexte = await getContexteColors();
  const compteUrl = process.env.NEXT_PUBLIC_ELSATIA_ACCOUNT_URL ?? "http://localhost:3000/abonnement";
  const support = motif === "support";

  return (
    <main className="denied-page">
      <section className="denied-card">
        <Brand />
        <div className="denied-symbol" aria-hidden="true">⌁</div>
        <span className="eyebrow">
          {support ? "Session support requise" : "Habilitation utilisateur requise"}
        </span>
        <h1>
          {support
            ? "Ouvrez une session support pour intervenir"
            : "Votre accès Colors doit être autorisé"}
        </h1>
        <p>
          {support ? (
            <>
              Votre compte administrateur plateforme n’a pas de session support active
              {contexte.entrepriseId ? (
                <>
                  {" "}
                  sur <strong>{contexte.entrepriseNom}</strong>
                </>
              ) : null}
              . Ouvrez une session support depuis ELSATIA Gestion Pro pour intervenir sur
              une organisation ; aucun accès opérationnel Colors n’est accordé de façon
              implicite à l’administration globale.
            </>
          ) : (
            <>
              <strong>{contexte.entrepriseNom}</strong> dispose de Colors, mais votre compte
              n’a pas d’habilitation active. Contactez l’administrateur Colors de votre
              organisation.
            </>
          )}
        </p>
        <div className="denied-actions">
          <a className="primary" href={compteUrl}>Ouvrir le compte ELSATIA</a>
          <form action={deconnexionAction}>
            <button type="submit">Se déconnecter</button>
          </form>
        </div>
      </section>
    </main>
  );
}
