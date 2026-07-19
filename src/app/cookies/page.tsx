import type { Metadata } from "next";
import { DocumentLegal } from "@/components/DocumentLegal";

export const dynamic = "force-static";

export const metadata: Metadata = { title: "Politique de cookies — Liria Gestion Pro" };

export default function Page() {
  return <DocumentLegal fichier="politique-cookies.md" />;
}
