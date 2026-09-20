import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  legalPublished,
  legalSections,
  legalSlugs,
  legalTitles,
  legalVersion,
  type LegalSlug,
} from "../../../lib/legal";
export const dynamicParams = false;
export function generateStaticParams() {
  return legalSlugs.map((doc) => ({ doc }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  const title = legalTitles[doc as LegalSlug];
  return {
    title: title ? `${title} — ELSATIA Studio` : "ELSATIA Studio",
    robots: legalPublished() ? undefined : { index: false, follow: false },
  };
}
export default async function LegalPage({
  params,
}: {
  params: Promise<{ doc: string }>;
}) {
  const { doc } = await params;
  if (!(legalSlugs as readonly string[]).includes(doc)) notFound();
  const slug = doc as LegalSlug;
  return (
    <main id="main" className="auth">
      <h1>{legalTitles[slug]}</h1>
      {!legalPublished() && (
        <p role="note" className="notice">
          TEXTE PROVISOIRE — LEGAL REVIEW REQUIRED. Ce document est un squelette
          technique, non publiable en l’état.
        </p>
      )}
      <p>
        <small>Version : {legalVersion()}</small>
      </p>
      {legalSections[slug].map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          <p>{s.body}</p>
        </section>
      ))}
      <p>
        <Link href="/login">Retour</Link>
      </p>
    </main>
  );
}
