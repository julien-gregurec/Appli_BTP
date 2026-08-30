import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { createClient } from "@/lib/supabase/server";
import { verifierMfaColorsAction } from "@/app/actions-mfa";
import { destinationInterneSure } from "@/lib/securite/redirections";

export const metadata: Metadata = { title: "Vérification en deux étapes" };

export default async function LoginMfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = destinationInterneSure(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? params.error : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: niveau } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveau?.currentLevel === "aal2") redirect(next);

  const { data: facteurs } = await supabase.auth.mfa.listFactors();
  const facteurVerifie = facteurs?.totp?.some((element) => element.status === "verified") ?? false;

  return (
    <div className="public-page">
      <section className="public-art">
        <div className="art-content">
          <Brand />
          <h1>
            Une étape
            <br />
            de plus.
          </h1>
          <p>Cette session doit être confirmée par votre application d’authentification.</p>
          <div className="art-palette" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>
      <section className="public-content">
        {facteurVerifie ? (
          <form className="auth-card" action={verifierMfaColorsAction}>
            <div className="mobile-public-brand">
              <Brand />
            </div>
            <span className="eyebrow">Vérification en deux étapes</span>
            <h2>Saisissez votre code</h2>
            <p>Entrez les six chiffres affichés dans votre application d’authentification.</p>
            {error && <div className="form-message">{error}</div>}
            <input type="hidden" name="next" value={next} />
            <label>
              Code à six chiffres
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                placeholder="000000"
              />
            </label>
            <button className="primary-button" type="submit">
              Vérifier
            </button>
            <p className="auth-foot">
              <Link href="/login">Revenir à la connexion</Link>
            </p>
          </form>
        ) : (
          <div className="auth-card">
            <div className="mobile-public-brand">
              <Brand />
            </div>
            <span className="eyebrow">Vérification en deux étapes</span>
            <h2>Aucun facteur vérifié</h2>
            <p>
              Aucun facteur d’authentification vérifié n’est associé à ce compte. Configurez
              l’authentification renforcée depuis ELSATIA Gestion Pro, puis reconnectez-vous.
            </p>
            <p className="auth-foot">
              <Link href="/login">Revenir à la connexion</Link>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
