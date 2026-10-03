import type { Metadata } from "next";
import { DocumentLegal } from "@/components/DocumentLegal";
import { MARQUE } from "@/lib/brand";

export const dynamic = "force-static";

// Page publique d'instructions de suppression des données (URL officielle à
// déclarer dans Meta Developer et LinkedIn Developer). Indexable : elle doit
// rester accessible sans session, comme les autres documents légaux.
export const metadata: Metadata = {
  title: `Suppression des données et comptes connectés — ${MARQUE}`,
  description: "Données conservées par ELSATIA lors de la connexion de Facebook, Instagram ou LinkedIn, et procédure de suppression.",
};

export default function Page() {
  return <DocumentLegal fichier="suppression-donnees-comptes-connectes.md" />;
}
