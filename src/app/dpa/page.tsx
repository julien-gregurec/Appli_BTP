import type { Metadata } from "next";
import { DocumentLegal } from "@/components/DocumentLegal";
import { PRODUCT_NAME } from "@/lib/brand";

export const dynamic = "force-static";

// L'accord de traitement fait partie intégrante des CGV (art. 9) : il doit être lisible
// avant d'être accepté, comme les CGV et les CGU.
export const metadata: Metadata = { title: `Accord de traitement des données (DPA) — ${PRODUCT_NAME}`, robots: { index: false, follow: false } };

export default function Page() {
  return <DocumentLegal fichier="dpa-entreprises-clientes.md" />;
}
