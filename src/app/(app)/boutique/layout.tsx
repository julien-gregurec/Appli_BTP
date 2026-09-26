import { notFound } from "next/navigation";
import { boutiqueEstActive } from "@/lib/preview-features";

export default function BoutiqueLayout({ children }: { children: React.ReactNode }) {
  if (!boutiqueEstActive()) notFound();
  return children;
}
