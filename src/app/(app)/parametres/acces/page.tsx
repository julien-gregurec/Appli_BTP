import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import {
  creerPosteAction,
  enregistrerPermissionsPosteAction,
  modifierPosteMembreAction,
  supprimerPosteAction,
} from "@/app/actions/acces";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

type Permission = { cle: string; module: string; description: string };

export default async function AccesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const msg = await searchParams;
  const ctx = await getContexteEntreprise();
  const sb = await createClient();

  const [{ data: entreprise }, { data: postes }, { data: catalogue }, { data: droits }, { data: membres }] =
    await Promise.all([
      sb.from("entreprises").select("code_adhesion").eq("id", ctx.entrepriseId).maybeSingle(),
      sb.from("postes").select("id, nom").eq("entreprise_id", ctx.entrepriseId).order("nom"),
      sb.from("permissions_disponibles").select("cle, module, description").order("module").order("description"),
      sb.from("permissions_poste").select("poste_id, cle_permission, autorise").eq("entreprise_id", ctx.entrepriseId),
      sb
        .from("utilisateurs_entreprises")
        .select("utilisateur_id, poste_id, statut, utilisateur:utilisateurs(prenom, nom)")
        .eq("entreprise_id", ctx.entrepriseId)
        .in("statut", ["actif", "en_attente_validation"]),
    ]);

  const permissions = (catalogue ?? []) as Permission[];
  const groupes = new Map<string, Permission[]>();
  for (const p of permissions) groupes.set(p.module, [...(groupes.get(p.module) ?? []), p]);
  const compte = (id: string) => (membres ?? []).filter((m) => m.poste_id === id).length;
  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href="/parametres" className="text-sm text-neutral-500 hover:underline">← Paramètres</Link>
          <h1 className="mt-1 text-xl font-semibold">Accès et rôles</h1>
          <p className="text-sm text-neutral-500">
            Partagez le code d&apos;entreprise, validez les demandes, puis choisissez précisément les modules accessibles par poste.
          </p>
        </div>

        {msg.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
        {msg.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{msg.success}</p>}

        <section className="rounded-md border border-[#c9a24a]/40 bg-[#c9a24a]/5 p-4">
          <h2 className="font-semibold">Code d&apos;entreprise</h2>
          <p className="text-sm text-neutral-500">
            Communiquez ce code à vos employés. À l&apos;inscription, ils choisissent « Rejoindre une entreprise » et le saisissent. Vous validez ensuite leur accès ci-dessous en leur affectant un poste.
          </p>
          <div className="mt-3 inline-block rounded-md border bg-white px-4 py-2 font-mono text-lg tracking-[0.3em] dark:bg-neutral-900">
            {entreprise?.code_adhesion ?? "—"}
          </div>
        </section>

        <section className="rounded-md border p-4 dark:border-neutral-800">
          <h2 className="font-semibold">Comptes et postes</h2>
          <div className="mt-3 space-y-2">
            {(membres ?? []).map((m) => {
              const u = un(m.utilisateur as { prenom: string | null; nom: string | null } | { prenom: string | null; nom: string | null }[] | null);
              const enAttente = m.statut === "en_attente_validation";
              const action = modifierPosteMembreAction.bind(null, m.utilisateur_id);
              return (
                <form key={m.utilisateur_id} action={action} className="flex items-center gap-3 rounded bg-neutral-50 p-2 dark:bg-neutral-900">
                  <span className="flex-1 text-sm font-medium">
                    {[u?.prenom, u?.nom].filter(Boolean).join(" ") || "Compte utilisateur"}
                    {enAttente && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">En attente</span>}
                  </span>
                  <select name="poste_id" defaultValue={m.poste_id ?? ""} required className="rounded border px-3 py-1.5 text-sm dark:bg-neutral-900">
                    <option value="">Choisir un poste</option>
                    {postes?.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                  <button className="rounded border px-3 py-1.5 text-sm font-medium">
                    {enAttente ? "Valider" : "Affecter"}
                  </button>
                </form>
              );
            })}
            {(!membres || membres.length === 0) && (
              <p className="text-sm text-neutral-500">Aucun membre pour l&apos;instant. Partagez le code d&apos;entreprise ci-dessus.</p>
            )}
          </div>
        </section>

        <form action={creerPosteAction} className="rounded-md border p-4 dark:border-neutral-800">
          <h2 className="font-semibold">Nouveau poste</h2>
          <div className="mt-3 flex gap-3">
            <input name="nom" required placeholder="Chef de chantier, comptable…" className="flex-1 rounded-md border px-3 py-2 text-sm dark:bg-neutral-900" />
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-neutral-900">Créer le poste</button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Le nouveau poste commence sans autorisation ; vous pourrez les activer juste après.</p>
        </form>

        <div className="space-y-4">
          {postes?.map((poste) => {
            const autorise = new Set((droits ?? []).filter((d) => d.poste_id === poste.id && d.autorise).map((d) => d.cle_permission));
            const action = enregistrerPermissionsPosteAction.bind(null, poste.id);
            const supprimer = supprimerPosteAction.bind(null, poste.id);
            return (
              <article key={poste.id} className="rounded-md border dark:border-neutral-800">
                <form action={action}>
                  <header className="flex items-center justify-between border-b px-4 py-3 dark:border-neutral-800">
                    <div>
                      <h2 className="font-semibold">{poste.nom}</h2>
                      <p className="text-xs text-neutral-500">{compte(poste.id)} membre(s) actif(s) · {autorise.size} droit(s)</p>
                    </div>
                    <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-medium text-white">Enregistrer</button>
                  </header>
                  <div className="grid gap-5 p-4 md:grid-cols-2">
                    {Array.from(groupes.entries()).map(([module, liste]) => (
                      <fieldset key={module}>
                        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#9a7625]">{module}</legend>
                        <div className="space-y-2">
                          {liste.map((p) => (
                            <label key={p.cle} className="flex cursor-pointer gap-2 rounded p-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                              <input type="checkbox" name="permissions" value={p.cle} defaultChecked={autorise.has(p.cle)} className="mt-0.5" />
                              <span>
                                <span className="block text-sm font-medium">{p.description}</span>
                                <span className="font-mono text-[10px] text-neutral-400">{p.cle}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </form>
                {compte(poste.id) === 0 && (
                  <form action={supprimer} className="border-t px-4 py-3 text-right dark:border-neutral-800">
                    <ConfirmSubmitButton message={`Supprimer le poste « ${poste.nom} » ?`} className="text-xs text-red-600 hover:underline">Supprimer ce poste</ConfirmSubmitButton>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
