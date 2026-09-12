import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { chargerPlanningV2 } from "@/lib/planning/serveur";
import { jourDe, joursDeVue, VUES, type Vue } from "@/lib/planning/modele";
import { PlanningV2 } from "@/components/planning/PlanningV2";

/** Lit « jour » (AAAA-MM-JJ) et « vue » de l'URL, avec repli (aujourd'hui, semaine). */
export function parametresPlanning(p: { jour?: string; vue?: string; semaine?: string }): { jour: string; vue: Vue } {
  const brut = p.jour ?? p.semaine;
  const jour = brut && /^\d{4}-\d{2}-\d{2}$/.test(brut) ? brut : jourDe(new Date());
  const vue = VUES.some((v) => v.cle === p.vue) ? (p.vue as Vue) : "semaine";
  return { jour, vue };
}

/** Planning v2 (GP V1, lot F) : chargé sous la RLS de l'utilisateur, rendu par le composant interactif. */
export async function PlanningV2Page({ searchParams }: { searchParams: { jour?: string; vue?: string; semaine?: string; error?: string } }) {
  const { jour, vue } = parametresPlanning(searchParams);
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const donnees = await chargerPlanningV2(supabase, ctx, joursDeVue(vue, jour));
  return (
    <main className="p-4 sm:p-6">
      <h1 className="sr-only">Planning</h1>
      {searchParams.error && <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{searchParams.error}</p>}
      <PlanningV2 donnees={donnees} jour={jour} vue={vue} />
    </main>
  );
}
