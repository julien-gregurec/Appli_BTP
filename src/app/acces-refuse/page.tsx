import { logoutAction } from "@/app/actions/auth";

const MOTIFS: Record<string, { titre: string; texte: string }> = {
  identite_plateforme_en_attente: {
    titre: "Accès plateforme en attente d'activation",
    texte:
      "Votre identité d'administrateur plateforme est enregistrée mais n'a pas encore été activée. Un administrateur plateforme déjà actif doit confirmer votre accès, en session sécurisée (MFA). Aucun espace entreprise ne vous est ouvert tant que cette activation n'a pas eu lieu.",
  },
};

const DEFAUT = {
  titre: "Accès refusé",
  texte: "Vous n'avez pas les droits nécessaires pour accéder à cet espace.",
};

export default async function AccesRefusePage({
  searchParams,
}: {
  searchParams: Promise<{ motif?: string }>;
}) {
  const { motif } = await searchParams;
  const contenu = (motif && MOTIFS[motif]) || DEFAUT;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-2xl">🔒</div>
        <div>
          <h1 className="text-xl font-semibold">{contenu.titre}</h1>
          <p className="mt-2 text-sm text-neutral-500">{contenu.texte}</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
