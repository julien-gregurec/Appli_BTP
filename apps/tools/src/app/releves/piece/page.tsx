import type { Metadata } from "next";
import { RelevePieceWorkspace } from "@/components/releve/RelevePieceWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Fiche pièce",
  description: "Fiche métier d’une pièce relevée : type, hauteur, statut, surface, commentaire.",
  path: "/releves/piece",
  index: false,
});

// Route statique (export natif Capacitor) : relevé et pièce arrivent en paramètres `?id=&piece=`.
export default function RelevePiecePage() { return <RelevePieceWorkspace />; }
