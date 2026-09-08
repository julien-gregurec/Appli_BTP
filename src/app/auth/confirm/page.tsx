import { confirmerCompteAction } from "@/app/actions/auth";
import { PiedLegal } from "@/components/PiedLegal";
import { BrandWordmark } from "@/components/BrandWordmark";
import { PRODUCT_NAME } from "@/lib/brand";
import { lienRelaisColors } from "@/lib/auth-relais-colors";

export default async function ConfirmerPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;
  const lienValide = Boolean(token_hash && type);
  // Le gabarit d'e-mail Supabase est unique pour tout le projet et ancré sur
  // SiteURL : une réinitialisation demandée depuis Colors atterrit ici. Rien
  // dans le lien n'en porte la trace, et le jeton n'a pas encore été vérifié :
  // le seul discriminant fiable est le choix explicite de la personne. Choisir
  // Colors relaie le jeton **non consommé** vers son écran équivalent, qui
  // exécutera verifyOtp sur son origine — les sessions ne sont pas partagées
  // entre sous-domaines. Absent de la configuration, le relais ne s'affiche pas
  // et cette page se comporte exactement comme avant.
  const relaisColors = lienRelaisColors({ tokenHash: token_hash, type });

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandWordmark className="text-2xl text-[#0d1b2a]" />
          <p className="text-sm text-neutral-500">{PRODUCT_NAME}</p>
          <h1 className="text-xl font-semibold">Confirmation</h1>
        </div>

        {lienValide ? (
          <>
            <p className="text-center text-sm text-neutral-600">
              Clique sur le bouton ci-dessous pour confirmer ton adresse email.
            </p>
            <form action={confirmerCompteAction} className="space-y-4">
              <input type="hidden" name="token_hash" value={token_hash} />
              <input type="hidden" name="type" value={type} />
              {next && <input type="hidden" name="next" value={next} />}
              <button
                type="submit"
                className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
              >
                Confirmer
              </button>
            </form>
            {relaisColors && (
              <div className="space-y-2 border-t border-neutral-200 pt-4">
                <p className="text-center text-xs text-neutral-500">
                  Le mot de passe est commun à toutes les applications ELSATIA.
                </p>
                <a
                  href={relaisColors}
                  className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-center text-sm font-medium text-neutral-700"
                >
                  Poursuivre sur ELSATIA Colors
                </a>
              </div>
            )}
          </>
        ) : (
          <p className="rounded-md bg-red-50 px-3 py-2 text-center text-sm text-red-700">
            Lien de confirmation invalide ou expiré.
          </p>
        )}

        <PiedLegal />
      </div>
    </main>
  );
}
