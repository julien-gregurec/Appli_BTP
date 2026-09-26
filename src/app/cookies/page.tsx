import type { Metadata } from "next";
import { DocumentLegal } from "@/components/DocumentLegal";
import { PRODUCT_NAME } from "@/lib/brand";

export const dynamic = "force-static";

export const metadata: Metadata = { title: `Politique de cookies — ${PRODUCT_NAME}`, robots: { index: false, follow: false } };

export default function Page() {
  return <DocumentLegal fichier="politique-cookies.md" />;
}
