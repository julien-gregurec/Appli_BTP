import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hacherJetonInvitation } from "@/lib/invitations";
import { accepterInvitationAction } from "@/app/actions";
import { Marque } from "@/components/Marque";

export const metadata: Metadata = {
  title: "Invitation à intervenir",
  robots: { index: false, follow: false },
};

type Invitation = {
  organisation_hote: string;
  chantier: string;
  intervenant: string;
  contact_nom: string | null;
  expire_at: string;
  cible_designee: boolean;
};

/**
 * Page publique d'atterrissage d'un lien d'invitation.
 *
 * Elle est volontairement lisible SANS session : le destinataire n'a, par construction,
 * pas encore de compte. Ce qu'elle montre se limite à ce qu'un jeton valide justifie —
 * qui invite, sur quel chantier, sous quel nom, et jusqu'à quand. Un jeton inconnu,
 * expiré, révoqué ou déjà consommé donne exactement le même écran : pas d'oracle qui
 * permettrait de distinguer « ce lien n'existe pas » de « ce lien a déjà servi ».
 */
export default async function PageInvitation({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const erreur = typeof query.error === "string" ? query.error : null;

  const supabase = await createClient();
  const { data } = await supabase
    .rpc("reserves_invitation_consulter", { p_token_hash: hacherJetonInvitation(token) })
    .maybeSingle();
  const invitation = (data as Invitation) ?? null;

  const { data: { user } } = await supabase.auth.getUser();
  let organisation: string | null = null;
  if (user) {
    const { data: contexte } = await supabase.rpc("contexte_application_courant").maybeSingle();
    organisation = (contexte as { entreprise_nom: string | null } | null)?.entreprise_nom ?? null;
  }

  if (!invitation) {
    return (
      <main className="page-publique">
        <div className="carte-auth">
          <Marque />
          <h1>Ce lien n’est plus valide</h1>
          <p>
            Une invitation ELSATIA Réserves est à usage unique et expire. Ce lien a peut-être
            déjà servi, été révoqué, ou dépassé sa date de validité.
          </p>
          <p className="mention">
            Demandez un nouveau lien à l’entreprise qui vous a invité : elle peut le
            réémettre en un geste.
          </p>
          <p className="mention"><Link href="/login">Se connecter à ELSATIA Réserves</Link></p>
        </div>
      </main>
    );
  }

  const expiration = new Date(invitation.expire_at).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <main className="page-publique">
      <div className="carte-auth">
        <Marque />
        <h1>Invitation à intervenir</h1>
        {erreur && <div className="message erreur">{erreur}</div>}

        <p>
          <strong>{invitation.organisation_hote}</strong> vous invite à intervenir sur le
          chantier <strong>{invitation.chantier}</strong>, sous le nom «&nbsp;
          {invitation.intervenant}&nbsp;».
        </p>
        <p className="mention">
          Vous ne verrez que les réserves qui vous sont attribuées : ni les autres corps
          d’état, ni les autres chantiers, ni les données commerciales du donneur d’ordre.
          L’accès en tant qu’entreprise intervenante est gratuit.
        </p>
        <p className="mention">Ce lien expire le {expiration}.</p>

        {user ? (
          <>
            <p>
              Vous êtes connecté{organisation ? <> pour <strong>{organisation}</strong></> : null}.
              {invitation.cible_designee && (
                <> Ce lien a été émis pour une organisation précise : il n’acceptera qu’elle.</>
              )}
            </p>
            <form action={accepterInvitationAction}>
              <input type="hidden" name="jeton" value={token} />
              <div className="actions">
                <button className="bouton" type="submit">Rejoindre l’intervention</button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p>
              Connectez-vous avec le compte ELSATIA de votre entreprise pour accepter. Si
              votre entreprise n’a pas encore de compte, créez-le d’abord : ELSATIA ne crée
              jamais d’organisation à votre place.
            </p>
            <p className="mention">
              <Link href={`/login?next=${encodeURIComponent(`/invitation/${token}`)}`}>
                Se connecter et rejoindre
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
