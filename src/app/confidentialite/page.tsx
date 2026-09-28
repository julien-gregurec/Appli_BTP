import type { Metadata } from "next";
import { DocumentLegal } from "@/components/DocumentLegal";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Politique de confidentialité — ELSATIA Gestion Pro" };

export default function Page() {
  return <DocumentLegal fichier="politique-confidentialite.md" />;
}
