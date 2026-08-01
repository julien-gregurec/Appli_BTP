import type { Metadata } from "next";
import { DocumentLegal } from "@/components/DocumentLegal";
import { PRODUCT_NAME } from "@/lib/brand";

export const dynamic = "force-static";

export const metadata: Metadata = { title: `Politique de confidentialité — ${PRODUCT_NAME}` };

export default function Page() {
  return <DocumentLegal fichier="politique-confidentialite.md" />;
}
