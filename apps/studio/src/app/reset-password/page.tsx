import { redirect } from "next/navigation";
import { updatePassword } from "../actions";
import Notice from "../../components/Notice";
import Submit from "../../components/Submit";
import { createStudioClient } from "../../lib/supabase";
import { notices } from "../../lib/notices";
export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const client = await createStudioClient();
  const { data } = await client.auth.getUser();
  if (!data.user)
    redirect(`/login?error=${encodeURIComponent(notices.invalidLink)}`);
  const { error } = await searchParams;
  return (
    <main id="main" className="auth">
      <div className="brand">
        ELSATIA<span>Studio.</span>
      </div>
      <h1>Nouveau mot de passe</h1>
      <Notice message={error} />
      <form action={updatePassword}>
        <label>
          Nouveau mot de passe
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={256}
          />
          <small>12 caractères minimum.</small>
        </label>
        <label>
          Confirmer le mot de passe
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={256}
          />
        </label>
        <Submit>Enregistrer</Submit>
      </form>
    </main>
  );
}
