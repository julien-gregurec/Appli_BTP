import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { contratEmployeLabel, formatEuro, nomEmploye, statutEmploye } from "@/lib/employes";

type EmployeListe = {
  id: string;
  reference_interne: string;
  numero_inscription: string | null;
  utilisateur_id: string | null;
  poste_id: string | null;
  prenom: string;
  nom: string;
  poste: string | null;
  type_contrat: string;
  statut: string;
  telephone: string | null;
  email: string | null;
  cout_horaire: number;
};

type EmployeAvecAcces = EmployeListe & {
  posteAcces: string | null;
  autorisations: string[];
  consultations: number;
  gestions: number;
  speciaux: number;
};

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

  const employesAvecAcces: EmployeAvecAcces[] = ((employes ?? []) as EmployeListe[]).map((employe) => {
    const autorisations = employe.poste_id ? (droitsParPoste.get(employe.poste_id) ?? []) : [];
    return {
      ...employe,
      posteAcces: employe.poste_id ? (postesParId.get(employe.poste_id) ?? null) : null,
      autorisations,
      consultations: autorisations.filter((cle) => cle.startsWith("acces_")).length,
      gestions: autorisations.filter((cle) => cle.startsWith("gerer_")).length,
      speciaux: autorisations.filter((cle) => !cle.startsWith("acces_") && !cle.startsWith("gerer_")).length,
    };
  });

  const droitsEmploye = (employe: EmployeAvecAcces) => employe.autorisations.length ? (
    <details>
      <summary className="cursor-pointer list-none font-medium text-blue-700 hover:underline [&::-webkit-details-marker]:hidden">
        {employe.consultations} consulter · {employe.gestions} gérer
        {employe.speciaux ? ` · ${employe.speciaux} personnel` : ""} ▾
      </summary>
      <div className="mt-2 space-y-1.5 rounded-md border bg-white p-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-950">
        {[...employe.autorisations]
          .sort((a, b) => (descriptions.get(a) ?? a).localeCompare(descriptions.get(b) ?? b, "fr"))
          .map((cle) => (
            <div key={cle} className="flex items-start gap-2">
              <span className={`mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                cle.startsWith("acces_")
                  ? "bg-blue-100 text-blue-800"
                  : cle.startsWith("gerer_")
                    ? "bg-amber-100 text-amber-800"
                    : "bg-violet-100 text-violet-800"
              }`}>
                {cle.startsWith("acces_") ? "Voir" : cle.startsWith("gerer_") ? "Gérer" : "Personnel"}
              </span>
              <span>{descriptions.get(cle) ?? cle}</span>
            </div>
          ))}
      </div>
    </details>
  ) : <span className="text-red-600">Aucun droit accordé</span>;

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

        {employesAvecAcces.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Aucun employé pour l&apos;instant. Crée la première fiche.
          </div>
        ) : (
          <>
          <div className="grid gap-3 md:hidden">
            {employesAvecAcces.map((employe) => {
              const statut = statutEmploye(employe.statut);
              return (
                <article key={employe.id} className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/employes/${employe.id}`} className="block truncate font-semibold hover:underline">
                        {nomEmploye(employe)}
                      </Link>
                      <p className="mt-0.5 font-mono text-xs text-neutral-500">
                        {employe.reference_interne}{employe.numero_inscription ? ` · ${employe.numero_inscription}` : ""}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="h-2 w-2 rounded-full" style={{ background: statut.couleur }} />
                      {statut.libelle}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div><dt className="text-xs text-neutral-500">Fonction</dt><dd>{employe.poste ?? "—"}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Contrat</dt><dd>{contratEmployeLabel(employe.type_contrat)}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Contact</dt><dd className="break-words">{employe.telephone ?? employe.email ?? "—"}</dd></div>
                    <div><dt className="text-xs text-neutral-500">Coût horaire</dt><dd>{formatEuro(employe.cout_horaire)}</dd></div>
                  </dl>

                  <div className="rounded-md bg-neutral-50 p-3 text-xs dark:bg-neutral-900">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Accès à l’application</span>
                      <span className={`rounded-full px-2 py-1 ${employe.utilisateur_id ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                        {employe.utilisateur_id ? "Activé" : "À inviter"}
                      </span>
                    </div>
                    <p className="mt-2 font-medium text-neutral-700 dark:text-neutral-300">{employe.posteAcces ?? "Aucun poste d’accès"}</p>
                    <div className="mt-2">{droitsEmploye(employe)}</div>
                  </div>

                  <Link href={`/employes/${employe.id}`} className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium">
                    Voir la fiche et l’invitation
                  </Link>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800 md:block">
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
                {employesAvecAcces.map((employe) => {
                  const statut = statutEmploye(employe.statut);
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
                        <div className="space-y-1.5"><span className={`inline-block rounded-full px-2 py-1 ${employe.utilisateur_id ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{employe.utilisateur_id ? "Accès activé" : "Invitation à envoyer"}</span><p className="font-medium text-neutral-700 dark:text-neutral-300">{employe.posteAcces ?? "Aucun poste d’accès"}</p></div>
                      </td>
                      <td className="min-w-64 px-4 py-2 text-xs">
                        {droitsEmploye(employe)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </main>
  );
}
