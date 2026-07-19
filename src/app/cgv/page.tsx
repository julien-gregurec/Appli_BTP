import type { Metadata } from "next";
import { DocumentLegal } from "@/components/DocumentLegal";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Conditions Générales de Vente — Liria Gestion Pro" };

export default function Page() {
  return <DocumentLegal fichier="cgv.md" />;
}
