import Link from "next/link";
import {
  getCurrentStudioUser,
  getUserStudioWorkspaces,
} from "../../lib/workspaces";
import { onboarding } from "../actions";
import Submit from "../../components/Submit";
import Notice from "../../components/Notice";
export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await getCurrentStudioUser();
  const workspaces = await getUserStudioWorkspaces();
  const { error } = await searchParams;
  return (
    <main id="main" className="auth">
      <div className="brand">
        ELSATIA<span>Studio.</span>
      </div>
      <p className="eyebrow">VOTRE PREMIÈRE ÉTAPE</p>
      <h1>
        Faites comme
        <br />
        chez vous.
      </h1>
      <p>
        Votre espace personnel rassemble vos futurs projets. Vous pourrez le
        renommer et créer d’autres espaces, sans entreprise Gestion Pro.
      </p>
      <Notice message={error} />
      {workspaces.length > 0 && (
        <p>
          <Link href={`/dashboard?workspace=${workspaces[0].id}`}>
            Ouvrir mes espaces existants
          </Link>
        </p>
      )}
      <form action={onboarding}>
        <Submit>Ouvrir mon Studio personnel</Submit>
      </form>
      <p className="muted">
        Si votre Studio personnel existe déjà, vous le retrouverez directement.
      </p>
    </main>
  );
}
