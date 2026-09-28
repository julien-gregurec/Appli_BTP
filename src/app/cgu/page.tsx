import type { Metadata } from "next";
import { DocumentLegal } from "@/components/DocumentLegal";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Conditions Générales d'Utilisation — ELSATIA Gestion Pro" };

export default function Page() {
  return <DocumentLegal fichier="cgu.md" />;
}
