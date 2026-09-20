import type { Metadata } from "next";
import Link from "next/link";
import { resolveShare } from "../../../lib/shares";
import SharedVideo from "../../../components/SharedVideo";
// A shared link is a bearer secret: never indexed, never leaked through the referrer.
export const metadata: Metadata = {
  title: "Vidéo partagée — ELSATIA Studio",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await resolveShare(token);
  if (!share)
    return (
      <main id="main" className="auth">
        <h1>Lien indisponible</h1>
        <p>Ce lien de partage est invalide, expiré ou a été révoqué.</p>
        <Link href="/login">ELSATIA Studio</Link>
      </main>
    );
  return (
    <main id="main" className="auth">
      <h1>{share.title}</h1>
      <SharedVideo token={token} initialUrl={share.url} title={share.title} />
      <p>
        <small>Vidéo créée avec ELSATIA Studio.</small>
      </p>
    </main>
  );
}
