import Link from "next/link";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { permissionsUtilisateur } from "@/lib/permissions";
import { chargerParametresRelances } from "@/lib/relances-config";
import { ParametresRelances } from "@/components/ParametresRelances";

export default async function ParametresRelancesPage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_parametres");
  const config = await chargerParametresRelances(supabase, ctx.entrepriseId);

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/parametres" className="text-sm text-neutral-500 hover:underline">← Paramètres</Link>
          <h1 className="mt-1 text-xl font-semibold">Relances</h1>
          <p className="text-sm text-neutral-500">
            Relances automatiques et manuelles pour les devis envoyés sans réponse et les factures impayées. Le serveur revalide
            toujours l&apos;état réel du document juste avant l&apos;envoi : aucune relance n&apos;est envoyée à tort.
          </p>
        </div>

        {!peutGerer && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            Votre poste permet de consulter ces réglages, mais pas de les modifier.
          </p>
        )}

        <ParametresRelances configInitiale={config} lectureSeule={!peutGerer} />
      </div>
    </main>
  );
}
