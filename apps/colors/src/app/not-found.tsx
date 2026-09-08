import Link from "next/link";
import { connection } from "next/server";
import { Brand } from "@/components/Brand";

/**
 * Page 404 propre à Colors.
 *
 * Elle existe pour une raison de sécurité, pas d'esthétique : la page 404
 * intégrée de Next est prérendue à la construction, donc **sans nonce**, alors
 * que la CSP émise par `src/proxy.ts` en exige un. Ses scripts seraient bloqués
 * et la page n'hydraterait pas. `connection()` force le rendu à la requête,
 * moment où le nonce existe.
 */
export default async function PageIntrouvable() {
  await connection();
  return (
    <div className="public-page">
      <section className="public-art">
        <div className="art-content">
          <Brand />
          <h1>Page<br/>introuvable.</h1>
          <p>Cette adresse ne correspond à aucun écran de Colors.</p>
          <div className="art-palette" aria-hidden="true"><span/><span/><span/></div>
        </div>
      </section>
      <section className="public-content">
        <div className="auth-card">
          <div className="mobile-public-brand"><Brand /></div>
          <span className="eyebrow">Erreur 404</span>
          <h2>Cette page n’existe pas</h2>
          <p>Le lien est peut-être ancien, ou l’élément a été archivé.</p>
          <p className="auth-foot"><Link href="/dashboard">Revenir au tableau de bord</Link></p>
        </div>
      </section>
    </div>
  );
}
