import type { Metadata } from "next";
import { RelevePieceWorkspace } from "@/components/releve/RelevePieceWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Fiche pièce",
  description: "Fiche d’une pièce relevée : type, hauteur, statut, commentaire.",
  path: "/releves/piece",
  index: false,
});

// Route statique (export natif Capacitor) : relevé et pièce arrivent en paramètres `?id=&piece=`, lus côté client.
export default function RelevePiecePage() { return <RelevePieceWorkspace />; }
