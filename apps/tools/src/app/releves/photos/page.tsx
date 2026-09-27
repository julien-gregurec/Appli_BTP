import type { Metadata } from "next";
import { RelevePhotosWorkspace } from "@/components/releve/RelevePhotosWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Photos terrain du relevé",
  description: "Capture, rattachement, repères et annotations des photos d’un relevé.",
  path: "/releves/photos",
  index: false,
});

// Route statique (export natif Capacitor) : le relevé arrive en paramètre `?id=`, lu côté client.
export default function RelevePhotosPage() { return <RelevePhotosWorkspace />; }
