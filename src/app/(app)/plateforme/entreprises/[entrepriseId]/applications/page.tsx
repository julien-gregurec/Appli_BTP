import Link from "next/link";
import { notFound } from "next/navigation";
import { activerApplicationEntrepriseAction, desactiverApplicationEntrepriseAction, habiliterUtilisateurApplicationAction, retirerHabilitationApplicationAction } from "@/app/actions/multi-app";
import { chargerEntrepriseMultiApp, estAdministrateurPlateformeMultiApp } from "@/lib/multi-app-server";
import { accesDansSaFenetre, valeurDateHeureLocale } from "@/lib/multi-app";

const champ = "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a] dark:border-neutral-700 dark:bg-neutral-950";

function etatAcces(acces: { autorise: boolean; valide_du: string | null; valide_jusqu_au: string | null } | null) {
  if (!acces?.autorise) return { libelle: "Inactive", classe: "bg-neutral-200 text-neutral-700" };
  const maintenant = Date.now();
  if (acces.valide_du && new Date(acces.valide_du).getTime() > maintenant) return { libelle: "Planifiée", classe: "bg-blue-100 text-blue-800" };
  if (acces.valide_jusqu_au && new Date(acces.valide_jusqu_au).getTime() <= maintenant) return { libelle: "Expirée", classe: "bg-amber-100 text-amber-800" };
  return { libelle: "Active", classe: "bg-green-100 text-green-800" };
}

function nomUtilisateur(utilisateur: { prenom: string | null; nom: string | null; id: string }) {
  return [utilisateur.prenom, utilisateur.nom].filter(Boolean).join(" ") || utilisateur.id;
}

export default async function ApplicationsEntreprisePage({ params, searchParams }: {
  params: Promise<{ entrepriseId: string }>;
  searchParams: Promise<{ error?: string; succes?: string }>;
}) {
  if (!(await estAdministrateurPlateformeMultiApp())) notFound();
  const [{ entrepriseId }, messages] = await Promise.all([params, searchParams]);
  const donnees = await chargerEntrepriseMultiApp(entrepriseId);
  if (!donnees) notFound();

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6a1f]">Applications ELSATIA</p>
            <h1 className="mt-1 text-2xl font-semibold">{donnees.entreprise.nom}</h1>
            <p className="mt-1 text-sm text-neutral-500">{donnees.entreprise.reference_interne || "Entreprise sans référence interne"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/plateforme/applications" className="rounded-md border px-3 py-2 text-sm font-medium">Catalogue</Link>
            <Link href="/plateforme" className="rounded-md border px-3 py-2 text-sm font-medium">← Entreprises</Link>
          </div>
        </header>

        {messages.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
        {messages.succes && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-700">{messages.succes}</p>}

        <section aria-labelledby="acces-entreprise" className="space-y-3">
          <div>
            <h2 id="acces-entreprise" className="text-lg font-semibold">Accès de l’entreprise</h2>
            <p className="text-sm text-neutral-500">L’accès d’une entreprise et l’habilitation d’un utilisateur sont deux décisions distinctes. Une désactivation bloque l’accès sans supprimer les données, les utilisateurs ni l’historique.</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {donnees.applications.map((application) => {
              const acces = donnees.acces.find((ligne) => ligne.application_code === application.code) ?? null;
              const etat = etatAcces(acces);
              return (
                <article key={application.code} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{application.nom}</h3><code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] dark:bg-neutral-800">{application.code}</code></div>
                      <p className="mt-1 text-xs text-neutral-500">{application.description ?? "Aucune description"}</p>
                    </div>
                    <div className="flex gap-2">{!application.actif && <span className="rounded-full bg-red-100 px-2 py-1 text-[11px] text-red-800">Catalogue inactif</span>}<span className={`rounded-full px-2 py-1 text-[11px] font-medium ${etat.classe}`}>{etat.libelle}</span></div>
                  </div>
                  <form action={activerApplicationEntrepriseAction.bind(null, entrepriseId, application.code)} className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-neutral-600">Valide à partir de<input name="valide_du" type="datetime-local" defaultValue={valeurDateHeureLocale(acces?.valide_du ?? null)} className={champ} /></label>
                    <label className="text-xs text-neutral-600">Valide jusqu’au<input name="valide_jusqu_au" type="datetime-local" defaultValue={valeurDateHeureLocale(acces?.valide_jusqu_au ?? null)} className={champ} /></label>
                    <button disabled={!application.actif} className="rounded-md bg-[#8a6a1f] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2">{accesDansSaFenetre(acces) ? "Mettre à jour les dates" : "Activer l’application"}</button>
                  </form>
                  {acces?.autorise && <form action={desactiverApplicationEntrepriseAction.bind(null, entrepriseId, application.code)} className="mt-2"><button className="w-full rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700">Désactiver sans supprimer les données</button></form>}
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="habilitations-utilisateurs" className="space-y-3">
          <div>
            <h2 id="habilitations-utilisateurs" className="text-lg font-semibold">Habilitations des utilisateurs</h2>
            <p className="text-sm text-neutral-500">Les rôles ci-dessous sont propres à chaque application. Ils ne modifient ni les rôles métier de l’entreprise ni le rôle d’administration globale de la plateforme.</p>
          </div>
          <div className="space-y-3">
            {donnees.utilisateurs.map((utilisateur) => (
              <details key={utilisateur.id} className="rounded-xl border border-neutral-200 bg-white p-4 open:shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
                <summary className="cursor-pointer list-none rounded outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a]"><span className="flex flex-wrap items-center justify-between gap-2"><span><strong>{nomUtilisateur(utilisateur)}</strong><span className="ml-2 font-mono text-[10px] text-neutral-400">{utilisateur.id}</span></span><span className={`rounded-full px-2 py-1 text-[11px] ${utilisateur.statut === "actif" ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-700"}`}>{utilisateur.statut}</span></span></summary>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {donnees.applications.map((application) => {
                    const habilitation = donnees.habilitations.find((ligne) => ligne.utilisateur_id === utilisateur.id && ligne.application_code === application.code) ?? null;
                    const roles = donnees.roles.filter((role) => role.application_code === application.code && role.actif);
                    const etat = etatAcces(habilitation);
                    return (
                      <article key={application.code} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{application.nom}</h3><span className={`rounded-full px-2 py-1 text-[10px] ${etat.classe}`}>{etat.libelle}</span></div>
                        <form action={habiliterUtilisateurApplicationAction.bind(null, entrepriseId, utilisateur.id, application.code)} className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="text-xs text-neutral-600 sm:col-span-2">Rôle applicatif<select name="role_code" required defaultValue={habilitation?.role_code ?? ""} className={champ}><option value="" disabled>Sélectionner un rôle</option>{roles.map((role) => <option key={role.code} value={role.code}>{role.nom}</option>)}</select></label>
                          <label className="text-xs text-neutral-600">Valide à partir de<input name="valide_du" type="datetime-local" defaultValue={valeurDateHeureLocale(habilitation?.valide_du ?? null)} className={champ} /></label>
                          <label className="text-xs text-neutral-600">Valide jusqu’au<input name="valide_jusqu_au" type="datetime-local" defaultValue={valeurDateHeureLocale(habilitation?.valide_jusqu_au ?? null)} className={champ} /></label>
                          <button disabled={!roles.length || utilisateur.statut !== "actif"} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-neutral-950 sm:col-span-2">{habilitation?.autorise ? "Modifier le rôle ou les dates" : "Habiliter l’utilisateur"}</button>
                        </form>
                        {habilitation?.autorise && <form action={retirerHabilitationApplicationAction.bind(null, entrepriseId, utilisateur.id, application.code)} className="mt-2"><button className="w-full rounded-md border px-3 py-2 text-xs font-medium">Retirer l’habilitation</button></form>}
                      </article>
                    );
                  })}
                </div>
              </details>
            ))}
            {!donnees.utilisateurs.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-neutral-500">Aucun utilisateur rattaché à cette entreprise.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
