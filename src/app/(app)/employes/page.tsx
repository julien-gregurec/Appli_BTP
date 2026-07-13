import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { contratEmployeLabel, formatEuro, nomEmploye, statutEmploye } from "@/lib/employes";

export default async function EmployesPage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();

  const [{ data: employes }, { data: postes }, { data: droits }, { data: catalogue }] = await Promise.all([
    supabase
      .from("employes")
      .select("id, reference_interne, numero_inscription, utilisateur_id, poste_id, prenom, nom, poste, type_contrat, statut, telephone, email, cout_horaire")
      .eq("entreprise_id", ctx.entrepriseId)
      .order("nom", { ascending: true }),
    supabase.from("postes").select("id, nom").eq("entreprise_id", ctx.entrepriseId),
    supabase.from("permissions_poste").select("poste_id, cle_permission, autorise").eq("entreprise_id", ctx.entrepriseId).eq("autorise", true),
    supabase.from("permissions_disponibles").select("cle, description"),
  ]);
  const postesParId = new Map((postes ?? []).map((poste) => [poste.id, poste.nom]));
  const descriptions = new Map((catalogue ?? []).map((permission) => [permission.cle, permission.description]));
  const droitsParPoste = new Map<string, string[]>();
  for (const droit of droits ?? []) {
    droitsParPoste.set(droit.poste_id, [...(droitsParPoste.get(droit.poste_id) ?? []), droit.cle_permission]);
  }

  return (
    <main className="p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Employés</h1>
            <p className="text-sm text-neutral-500">{employes?.length ?? 0} fiche(s)</p>
          </div>
          <Link href="/employes/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            + Nouvel employé
          </Link>
        </div>

        {!employes || employes.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Aucun employé pour l&apos;instant. Crée la première fiche.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Réf.</th>
                  <th className="px-4 py-2 font-medium">Nom</th>
                  <th className="px-4 py-2 font-medium">Fonction</th>
                  <th className="px-4 py-2 font-medium">Contrat</th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Coût</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 font-medium">Application</th>
                  <th className="px-4 py-2 font-medium">Autorisations</th>
                </tr>
              </thead>
              <tbody>
                {employes.map((employe) => {
                  const statut = statutEmploye(employe.statut);
                  const posteAcces=employe.poste_id?postesParId.get(employe.poste_id):null;
                  const autorisations=employe.poste_id?(droitsParPoste.get(employe.poste_id)??[]):[];
                  const consultations=autorisations.filter(cle=>cle.startsWith("acces_"));
                  const gestions=autorisations.filter(cle=>cle.startsWith("gerer_"));
                  const speciaux=autorisations.filter(cle=>!cle.startsWith("acces_")&&!cle.startsWith("gerer_"));
                  return (
                    <tr key={employe.id} className="border-t border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900">
                      <td className="px-4 py-2 font-mono text-xs text-neutral-500">{employe.reference_interne}</td>
                      <td className="px-4 py-2">
                        <Link href={`/employes/${employe.id}`} className="font-medium hover:underline">
                          {nomEmploye(employe)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{employe.poste ?? "—"}</td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{contratEmployeLabel(employe.type_contrat)}</td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{employe.telephone ?? employe.email ?? "—"}</td>
                      <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">{formatEuro(employe.cout_horaire)}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                          <span className="h-2 w-2 rounded-full" style={{ background: statut.couleur }} />
                          {statut.libelle}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <div className="space-y-1.5"><span className={`inline-block rounded-full px-2 py-1 ${employe.utilisateur_id ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{employe.utilisateur_id ? "Accès activé" : "Invitation à envoyer"}</span><p className="font-medium text-neutral-700 dark:text-neutral-300">{posteAcces??"Aucun poste d’accès"}</p></div>
                      </td>
                      <td className="min-w-64 px-4 py-2 text-xs">
                        {autorisations.length?<details><summary className="cursor-pointer list-none font-medium text-blue-700 hover:underline [&::-webkit-details-marker]:hidden">{consultations.length} consulter · {gestions.length} gérer{speciaux.length?` · ${speciaux.length} spécial`:""} ▾</summary><div className="mt-2 space-y-1.5 rounded-md border bg-white p-2 shadow-sm dark:bg-neutral-950">{autorisations.sort((a,b)=>(descriptions.get(a)??a).localeCompare(descriptions.get(b)??b,"fr")).map(cle=><div key={cle} className="flex items-start gap-2"><span className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${cle.startsWith("acces_")?"bg-blue-100 text-blue-800":cle.startsWith("gerer_")?"bg-amber-100 text-amber-800":"bg-violet-100 text-violet-800"}`}>{cle.startsWith("acces_")?"Voir":cle.startsWith("gerer_")?"Gérer":"Spécial"}</span><span>{descriptions.get(cle)??cle}</span></div>)}</div></details>:<span className="text-red-600">Aucun droit accordé</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
