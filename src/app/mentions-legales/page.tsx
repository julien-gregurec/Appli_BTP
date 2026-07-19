import type { Metadata } from "next";
import { DocumentLegal } from "@/components/DocumentLegal";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Mentions légales — Liria Gestion Pro" };

export default function Page() {
  return <DocumentLegal fichier="mentions-legales.md" />;
}
