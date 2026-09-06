import type { Metadata } from "next";
import { AccountDeletionWorkspace } from "@/components/AccountDeletionWorkspace";
import { pageMetadata } from "@/lib/seo";

/*
 * Page de suppression de compte : elle doit rester publiquement ATTEIGNABLE (les stores exigent
 * une URL accessible sans compte, `EXTERNAL_URLS.accountDeletion`), mais elle n'a rien à faire
 * dans un index — c'est un écran d'action sur un compte, pas un contenu.
 */
export const metadata: Metadata = pageMetadata({
  title: "Supprimer votre compte ELSATIA",
  description: "Demandez la suppression définitive de votre compte commun ELSATIA et des données associées.",
  path: "/suppression-compte",
  index: false,
});

export default function AccountDeletionPage() {
  return <AccountDeletionWorkspace />;
}
