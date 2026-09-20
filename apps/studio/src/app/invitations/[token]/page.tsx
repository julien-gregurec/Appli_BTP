import type { Metadata } from "next";
import Link from "next/link";
import Notice from "../../../components/Notice";
import Submit from "../../../components/Submit";
import { acceptInvitation } from "../../actions";
import { resolveInvitation } from "../../../lib/invitations";
import { createStudioClient } from "../../../lib/supabase";
// The link is a bearer secret: never indexed, never leaked through the referrer.
export const metadata: Metadata = {
  title: "Invitation — ELSATIA Studio",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
const roleLabels: Record<string, string> = { admin: "administrateur", editor: "éditeur", viewer: "lecteur" };
export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const invitation = await resolveInvitation(token);
  if (!invitation || invitation.status !== "pending")
    return (
      <main id="main" className="auth">
        <h1>Invitation indisponible</h1>
        <p>Cette invitation est invalide, expirée, révoquée ou déjà utilisée.</p>
        <Link href="/login">ELSATIA Studio</Link>
      </main>
    );
  const client = await createStudioClient();
  const { data } = await client.auth.getUser();
  const next = encodeURIComponent(`/invitations/${token}`);
  return (
    <main id="main" className="auth">
      <h1>Rejoindre « {invitation.workspace_name} »</h1>
      <p>
        Vous êtes invité comme <strong>{roleLabels[invitation.role] ?? invitation.role}</strong> avec
        l’adresse <strong>{invitation.email}</strong>.
      </p>
      {error && <p role="alert" className="notice">{error.slice(0, 200)}</p>}
      <Notice message={undefined} />
      {data.user ? (
        <form action={acceptInvitation}>
          <input type="hidden" name="token" value={token} />
          <p>Connecté en tant que {data.user.email}.</p>
          <Submit>Rejoindre l’espace</Submit>
        </form>
      ) : (
        <p>
          <Link href={`/login?next=${next}`}>Se connecter</Link> ou{" "}
          <Link href={`/signup?next=${next}`}>créer un compte</Link> avec
          l’adresse {invitation.email}. Après la confirmation de votre adresse,
          rouvrez ce lien.
        </p>
      )}
    </main>
  );
}
