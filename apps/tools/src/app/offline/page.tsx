import Link from "next/link";
import { Brand } from "@/components/HomeDashboard";

export default function OfflinePage() {
  return <main className="offline-page"><Brand /><div><span>↯</span><h1>Vous êtes hors connexion</h1><p>Les outils déjà consultés restent disponibles. Revenez à l’accueil ou réessayez quand le réseau revient.</p><Link href="/">Revenir à l’accueil</Link></div></main>;
}
