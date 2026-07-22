import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { creerChantierAction } from "@/app/actions/chantiers";
import { nomClient, CHANTIER_STATUTS } from "@/lib/chantier-statuts";
import { LocaliserGPSButton } from "@/components/LocaliserGPSButton";

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const labelClass = "text-sm font-medium";

export default async function NouveauChantierPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; client?: string }>;
}) {
  const { error, client: clientPreselect } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, nom, prenom, societe")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("created_at", { ascending: false });

  const { data: types } = await supabase
    .from("types_chantier")
    .select("id, nom")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("nom");

  const aucunClient = !clients || clients.length === 0;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/chantiers" className="text-sm text-neutral-500 hover:underline">← Chantiers</Link>
          <h1 className="mt-1 text-xl font-semibold">Nouveau chantier</h1>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {aucunClient ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
            Il faut d&apos;abord créer un client.{" "}
            <Link href="/clients/nouveau" className="font-medium underline">Créer un client</Link>
          </div>
        ) : (
          <form action={creerChantierAction} className="space-y-5">
            <div className="space-y-1">
              <label className={labelClass} htmlFor="client_id">Client</label>
              <select id="client_id" name="client_id" defaultValue={clientPreselect ?? ""} required className={inputClass}>
                <option value="" disabled>— Choisir un client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{nomClient(c)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className={labelClass} htmlFor="nom">Nom du chantier</label>
              <input id="nom" name="nom" required placeholder="ex. Rénovation cloisons — 12 rue des Lilas" className={inputClass} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass} htmlFor="type_chantier_id">Type</label>
                <select id="type_chantier_id" name="type_chantier_id" className={inputClass}>
                  <option value="">—</option>
                  {types?.map((t) => (
                    <option key={t.id} value={t.id}>{t.nom}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelClass} htmlFor="statut">Statut</label>
                <select id="statut" name="statut" defaultValue="prospect" className={inputClass}>
                  {CHANTIER_STATUTS.map((s) => (
                    <option key={s.cle} value={s.cle}>{s.libelle}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelClass} htmlFor="adresse">Adresse du chantier</label>
              <input id="adresse" name="adresse" className={inputClass} />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className={labelClass} htmlFor="code_postal">Code postal</label>
                <input id="code_postal" name="code_postal" className={inputClass} />
              </div>
              <div className="col-span-2 space-y-1">
                <label className={labelClass} htmlFor="ville">Ville</label>
                <input id="ville" name="ville" className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass} htmlFor="date_debut_prevue">Début prévu</label>
                <input id="date_debut_prevue" name="date_debut_prevue" type="date" className={inputClass} />
              </div>
              <div className="space-y-1">
                <label className={labelClass} htmlFor="date_fin_prevue">Fin prévue</label>
                <input id="date_fin_prevue" name="date_fin_prevue" type="date" className={inputClass} />
              </div>
            </div>

            <div className="space-y-1">
              <label className={labelClass} htmlFor="budget_previsionnel">Budget prévisionnel (€)</label>
              <input id="budget_previsionnel" name="budget_previsionnel" type="number" step="0.01" className={inputClass} />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Position GPS (pour le suivi de zone pendant le pointage)</label>
              <p className="text-xs text-neutral-500">Facultatif. Renseignez-la une fois sur place, ou plus tard depuis la fiche du chantier.</p>
              <LocaliserGPSButton />
            </div>

            <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
              Créer le chantier
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
