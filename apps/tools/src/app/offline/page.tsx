import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/HomeDashboard";
import { pageMetadata } from "@/lib/seo";

/* Coquille de repli du service worker : utile hors connexion, sans aucun intérêt en résultat. */
export const metadata: Metadata = pageMetadata({
  title: "Hors connexion",
  description: "Page de repli affichée par ELSATIA Tools quand le réseau est indisponible.",
  path: "/offline",
  index: false,
});

export default function OfflinePage() {
  return <main className="offline-page"><Brand /><div><span>↯</span><h1>Vous êtes hors connexion</h1><p>Les outils déjà consultés restent disponibles. Revenez à l’accueil ou réessayez quand le réseau revient.</p><Link href="/">Revenir à l’accueil</Link></div></main>;
}
