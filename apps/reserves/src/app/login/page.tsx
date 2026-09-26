import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Marque } from "@/components/Marque";
import { connexionAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Connexion" };

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const erreur = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;
  const suivant = typeof params.next === "string" ? params.next : "/dashboard";

  return (
    <div className="page-publique">
      <form className="carte-auth" action={connexionAction}>
        <Marque />
        <h1>Les réserves, tenues.</h1>
        <p className="sous-titre">
          Du constat sur le chantier à la validation de la levée, avec les entreprises
          qui interviennent.
        </p>
        {erreur && <div className="message erreur">{erreur}</div>}
        {message && <div className="message">{message}</div>}
        <input type="hidden" name="next" value={suivant} />
        <label>
          Adresse email
          <input name="email" type="email" autoComplete="email" required placeholder="vous@entreprise.fr" />
        </label>
        <label>
          Mot de passe
          <input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
        </label>
        <button className="bouton" type="submit">Se connecter à Réserves</button>
        <p className="mention">
          Compte ELSATIA commun : les mêmes identifiants que pour les autres applications.
          L’accès demande un droit Réserves actif pour votre organisation et une
          habilitation individuelle.
        </p>
      </form>
    </div>
  );
}
