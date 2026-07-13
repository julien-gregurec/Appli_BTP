import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros } from "@/lib/devis";
import { CATEGORIES_FRAIS, statutNoteFrais, NOTE_FRAIS_STATUTS } from "@/lib/notes-frais";
import { creerNoteFraisAction, changerStatutNoteFraisAction, supprimerNoteFraisAction } from "@/app/actions/notes-frais";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { permissionsUtilisateur } from "@/lib/permissions";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function NotesFraisPage({ searchParams }: { searchParams: Promise<{ error?: string; succes?: string }> }) {
  const msg = await searchParams;
  const ctx = await getContexteEntreprise();
  const sb = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const prototype = isEmailLoginDisabled();
  const peutGerer = permissions === null || permissions.includes("gerer_notes_frais");

  let requeteEmployes = sb.from("employes").select("id, prenom, nom").eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif").order("nom");
  if (!prototype) requeteEmployes = requeteEmployes.eq("utilisateur_id", ctx.userId);
  const [{ data: employes }, { data: notes }] = await Promise.all([
    requeteEmployes,
    sb.from("notes_frais").select("id, date_frais, montant_ttc, categorie, description, statut, justificatif_storage_path, employe:employes(prenom, nom)").eq("entreprise_id", ctx.entrepriseId).order("date_frais", { ascending: false }).limit(200),
  ]);

  const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const liste = notes ?? [];
  const employePersonnel = !prototype ? employes?.[0] ?? null : null;
  const aRembourser = liste.filter((n) => n.statut === "validee").reduce((s, n) => s + Number(n.montant_ttc), 0);
  const enAttente = liste.filter((n) => n.statut === "soumise").length;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Notes de frais</h1>
          <p className="text-sm text-neutral-500">Le salarié scanne son justificatif, la note arrive directement ici pour validation et remboursement.</p>
        </div>

        {msg.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
        {msg.succes && <p className="rounded bg-green-50 p-3 text-sm text-green-700">Note de frais enregistrée.</p>}
        {!prototype && !employePersonnel && <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">Votre compte doit être lié à une fiche employé active avant de pouvoir envoyer une note de frais.</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs uppercase text-neutral-500">Notes à traiter</div><div className="mt-1 text-2xl font-semibold">{enAttente}</div></div>
          <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"><div className="text-xs uppercase text-neutral-500">À rembourser</div><div className="mt-1 text-2xl font-semibold">{euros(aRembourser)}</div></div>
        </div>

        <form action={creerNoteFraisAction} className="space-y-3 rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/50">
          <div className="text-sm font-medium">Nouvelle note de frais</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {prototype ? (
              <label className="text-xs text-neutral-500">Salarié
                <select name="employe_id" required className={input + " mt-1 w-full"}>
                  <option value="">—</option>
                  {(employes ?? []).map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
                </select>
              </label>
            ) : (
              <label className="text-xs text-neutral-500">Salarié
                <input type="hidden" name="employe_id" value={employePersonnel?.id ?? ""} />
                <span className="mt-1 block rounded-md border border-neutral-200 bg-white px-2 py-2 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
                  {employePersonnel ? `${employePersonnel.prenom} ${employePersonnel.nom}` : "Fiche employé non liée"}
                </span>
              </label>
            )}
            <label className="text-xs text-neutral-500">Date
              <input name="date_frais" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input + " mt-1 w-full"} />
            </label>
            <label className="text-xs text-neutral-500">Montant TTC (€)
              <input name="montant_ttc" type="number" step="0.01" min="0" required className={input + " mt-1 w-full"} />
            </label>
            <label className="text-xs text-neutral-500">Catégorie
              <select name="categorie" className={input + " mt-1 w-full"}>
                {CATEGORIES_FRAIS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-xs text-neutral-500 md:col-span-2">Description
              <input name="description" placeholder="Restaurant chantier Kléber…" className={input + " mt-1 w-full"} />
            </label>
            <label className="text-xs text-neutral-500 md:col-span-3">Justificatif (photo ou PDF)
              <input name="justificatif" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" capture="environment" className="mt-1 block w-full rounded border px-3 py-2 text-sm" />
            </label>
          </div>
          <button type="submit" disabled={!prototype && !employePersonnel} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900">Envoyer ma note de frais</button>
        </form>

        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Salarié</th>
                <th className="px-3 py-2 font-medium">Catégorie</th>
                <th className="px-3 py-2 text-right font-medium">Montant</th>
                <th className="px-3 py-2 font-medium">Justif.</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((n) => {
                const emp = un(n.employe as { prenom: string; nom: string } | { prenom: string; nom: string }[] | null);
                const st = statutNoteFrais(n.statut);
                return (
                  <tr key={n.id} className="border-t border-neutral-100 align-top dark:border-neutral-800">
                    <td className="px-3 py-2 text-neutral-500">{n.date_frais}</td>
                    <td className="px-3 py-2">{emp ? `${emp.prenom} ${emp.nom}` : "—"}</td>
                    <td className="px-3 py-2">{n.categorie ?? "—"}{n.description && <div className="text-xs text-neutral-400">{n.description}</div>}</td>
                    <td className="px-3 py-2 text-right font-mono">{euros(n.montant_ttc)}</td>
                    <td className="px-3 py-2">{n.justificatif_storage_path ? <a href={`/api/notes-frais/${n.id}/justificatif`} target="_blank" rel="noopener" className="text-xs underline">Voir</a> : <span className="text-xs text-neutral-400">—</span>}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />{st.libelle}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {peutGerer && <div className="flex flex-wrap justify-end gap-1">
                        {NOTE_FRAIS_STATUTS.filter((s) => s.cle !== n.statut).map((s) => (
                          <form key={s.cle} action={changerStatutNoteFraisAction.bind(null, n.id, s.cle)}>
                            <button className="rounded border px-2 py-0.5 text-[11px] hover:bg-neutral-50 dark:border-neutral-700">{s.libelle}</button>
                          </form>
                        ))}
                        <form action={supprimerNoteFraisAction.bind(null, n.id)}>
                          <ConfirmSubmitButton message="Supprimer cette note de frais ?" className="rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-600">×</ConfirmSubmitButton>
                        </form>
                      </div>}
                    </td>
                  </tr>
                );
              })}
              {liste.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-neutral-500">Aucune note de frais pour l&apos;instant.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
