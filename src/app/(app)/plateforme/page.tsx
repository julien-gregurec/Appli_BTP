import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { estPlateformeAdmin, statutAbonnement, type EntrepriseAbonnement } from "@/lib/plateforme";
import { modifierAbonnementAction } from "@/app/actions/plateforme";

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function PlateformePage({ searchParams }: { searchParams: Promise<{ succes?: string; error?: string }> }) {
  if (!(await estPlateformeAdmin())) notFound();
  const msg = await searchParams;
  const supabase = await createClient();

  let entreprises: EntrepriseAbonnement[] = [];
  if (isEmailLoginDisabled()) {
    const { data: ents } = await supabase
      .from("entreprises")
      .select("id, nom, code_adhesion, reference_interne, abonnement_statut, abonnement_echeance, abonnement_note, created_at")
      .order("created_at", { ascending: false });
    const { data: membres } = await supabase.from("utilisateurs_entreprises").select("entreprise_id, statut");
    const { data: employes } = await supabase.from("employes").select("entreprise_id, statut, utilisateur_id, invitation_envoyee_at, application_installee_at, derniere_connexion_at");
    const { data: droits } = await supabase.from("permissions_poste").select("entreprise_id, cle_permission, autorise").eq("autorise", true).like("cle_permission", "acces_%");
    entreprises = (ents ?? []).map((e) => ({
      ...e,
      nb_membres: (membres ?? []).filter((m) => m.entreprise_id === e.id).length,
      nb_membres_actifs: (membres ?? []).filter((m) => m.entreprise_id === e.id && m.statut === "actif").length,
      nb_fiches_employes: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.statut !== "sorti").length,
      nb_comptes_actives: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.utilisateur_id && !["sorti", "suspendu"].includes(item.statut)).length,
      nb_invitations_envoyees: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.invitation_envoyee_at).length,
      nb_applications_installees: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.application_installee_at).length,
      nb_connectes_30j: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.derniere_connexion_at && new Date(item.derniere_connexion_at).getTime() >= Date.now() - 30 * 86400000).length,
      derniere_connexion: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.derniere_connexion_at).map((item) => item.derniere_connexion_at as string).sort().at(-1) ?? null,
      options_actives: [...new Set((droits ?? []).filter((item) => item.entreprise_id === e.id).map((item) => item.cle_permission.replace("acces_", "")))].sort(),
    })) as EntrepriseAbonnement[];
  } else {
    const [{ data }, { data: usages }] = await Promise.all([supabase.rpc("plateforme_entreprises"), supabase.rpc("plateforme_usage_entreprises")]);
    const usageParEntreprise = new Map<string, Partial<EntrepriseAbonnement>>(((usages ?? []) as Array<Partial<EntrepriseAbonnement> & { entreprise_id: string }>).map((usage) => [usage.entreprise_id, usage]));
    entreprises = ((data ?? []) as EntrepriseAbonnement[]).map((entreprise) => ({ ...entreprise, ...(usageParEntreprise.get(entreprise.id) ?? {}) }));
  }

  const parStatut = (cle: string) => entreprises.filter((e) => e.abonnement_statut === cle).length;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Plateforme — entreprises clientes</h1>
          <p className="text-sm text-neutral-500">
            Vue réservée au propriétaire. Chaque entreprise possède un code et un statut d&apos;abonnement à gérer.
          </p>
        </div>

        {msg.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
        {msg.succes && <p className="rounded bg-green-50 p-3 text-sm text-green-700">Abonnement mis à jour.</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Entreprises", valeur: entreprises.length },
            { label: "Actives", valeur: parStatut("actif") },
            { label: "En essai", valeur: parStatut("essai") },
            { label: "Suspendues", valeur: parStatut("suspendu") },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="text-xs uppercase text-neutral-500">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold">{s.valeur}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {entreprises.map((e) => {
            const st = statutAbonnement(e.abonnement_statut);
            const action = modifierAbonnementAction.bind(null, e.id);
            return (
              <article key={e.id} className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold">{e.nom}</h2>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                        <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />{st.libelle}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Code <span className="font-mono tracking-widest">{e.code_adhesion ?? "—"}</span>
                      {e.reference_interne && <> · {e.reference_interne}</>}
                      {" · "}{e.nb_membres_actifs}/{e.nb_membres} membre(s) actif(s)
                      {" · créée le "}{new Date(e.created_at).toLocaleDateString("fr-FR")}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                      <p className="rounded bg-neutral-50 px-2 py-1.5 dark:bg-neutral-900"><strong className="block text-base">{e.nb_fiches_employes ?? 0}</strong> employés facturables</p>
                      <p className="rounded bg-blue-50 px-2 py-1.5 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><strong className="block text-base">{e.nb_comptes_actives ?? 0}</strong> comptes activés</p>
                      <p className="rounded bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><strong className="block text-base">{e.nb_invitations_envoyees ?? 0}</strong> invitations</p>
                      <p className="rounded bg-green-50 px-2 py-1.5 text-green-900 dark:bg-green-950/30 dark:text-green-200"><strong className="block text-base">{e.nb_connectes_30j ?? 0}</strong> connectés · 30 j</p>
                      <p className="rounded bg-violet-50 px-2 py-1.5 text-violet-900 dark:bg-violet-950/30 dark:text-violet-200"><strong className="block text-base">{e.nb_applications_installees ?? 0}</strong> installations</p>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">Options utilisées : {e.options_actives?.length ? e.options_actives.join(", ") : "aucune"}{e.derniere_connexion ? ` · dernière connexion ${new Date(e.derniere_connexion).toLocaleString("fr-FR")}` : ""}</p>
                  </div>
                </div>

                <form action={action} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <div className="space-y-1">
                    <label className="text-xs text-neutral-500">Statut</label>
                    <select name="statut" defaultValue={e.abonnement_statut} className={input}>
                      <option value="essai">Essai</option>
                      <option value="actif">Actif</option>
                      <option value="suspendu">Suspendu</option>
                      <option value="annule">Annulé</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-neutral-500">Échéance</label>
                    <input name="echeance" type="date" defaultValue={e.abonnement_echeance ?? ""} className={input} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-neutral-500">Note</label>
                    <input name="note" defaultValue={e.abonnement_note ?? ""} placeholder="tarif, contact…" className={input + " w-full"} />
                  </div>
                  <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
                    Enregistrer
                  </button>
                </form>
              </article>
            );
          })}
          {entreprises.length === 0 && (
            <p className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
              Aucune entreprise inscrite pour l&apos;instant.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
