import type { Metadata } from "next";
import { AccountWorkspace } from "@/components/AccountWorkspace";
import { pageMetadata } from "@/lib/seo";

/* Écran d'authentification : jamais indexé. */
export const metadata: Metadata = pageMetadata({
  title: "Compte ELSATIA",
  description: "Connexion facultative au compte commun ELSATIA pour les droits Tools Pro et la synchronisation.",
  path: "/compte",
  index: false,
});

export default function AccountPage() { return <AccountWorkspace />; }
