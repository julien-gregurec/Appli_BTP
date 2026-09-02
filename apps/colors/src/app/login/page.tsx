import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { connexionAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;
  const suivant = typeof params.next === "string" ? params.next : "/dashboard";

  return (
    <div className="public-page">
      <section className="public-art">
        <div className="art-content">
          <Brand />
          <h1>La couleur,<br/>maîtrisée.</h1>
          <p>Gestion intelligente des stocks et des teintes de peinture, pensée pour les équipes qui travaillent sur le terrain.</p>
          <div className="art-palette" aria-hidden="true"><span/><span/><span/></div>
        </div>
      </section>
      <section className="public-content">
        <form className="auth-card" action={connexionAction}>
          <div className="mobile-public-brand"><Brand /></div>
          <span className="eyebrow">Compte ELSATIA commun</span>
          <h2>Ravi de vous revoir</h2>
          <p>Utilisez les mêmes identifiants que pour les autres applications ELSATIA. Aucun second compte n’est nécessaire.</p>
          {error && <div className="form-message">{error}</div>}
          {message && <div className="form-message success">{message}</div>}
          <input type="hidden" name="next" value={suivant}/>
          <label>Adresse email<input name="email" type="email" autoComplete="email" required placeholder="vous@entreprise.fr"/></label>
          <label>Mot de passe<input name="password" type="password" autoComplete="current-password" required placeholder="••••••••"/></label>
          <button className="primary-button" type="submit">Se connecter à Colors</button>
          <p className="auth-foot">L’accès nécessite un droit Colors actif pour votre organisation et une habilitation individuelle. Les sessions de cette application restent isolées sur son domaine.</p>
        </form>
      </section>
    </div>
  );
}
