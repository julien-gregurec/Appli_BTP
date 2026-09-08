import type { Metadata } from "next";
import Link from "next/link";
import { Marque } from "@/components/Marque";

export const metadata: Metadata = {
  title: "Page introuvable",
  robots: { index: false, follow: false },
};

/**
 * Page 404 propre à Réserves.
 *
 * Elle existe pour une raison technique autant que pour le confort : la page d'erreur
 * fournie par défaut est pré-rendue à la construction, donc dépourvue du nonce exigé par
 * la politique de contenu. Ses scripts seraient bloqués, et l'écran resterait inerte —
 * exactement là où l'utilisateur cherche déjà son chemin.
 */
export const dynamic = "force-dynamic";

export default function PageIntrouvable() {
  return (
    <main className="page-publique">
      <div className="carte-auth">
        <Marque />
        <h1>Cette page n’existe pas</h1>
        <p className="sous-titre">
          Le lien est peut-être incomplet, ou la réserve à laquelle il menait a été
          supprimée.
        </p>
        <p className="mention">
          <Link href="/dashboard">Revenir au tableau de bord</Link>
        </p>
      </div>
    </main>
  );
}
