import Link from "next/link";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";

type Step = { title: string; description: string; href: string; action: string; done: boolean };

export default async function DemarragePage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [members, clients, quotes, jobs, timeEntries] = await Promise.all([
    supabase.from("utilisateurs_entreprises").select("utilisateur_id", { count: "exact", head: true }).eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif"),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("entreprise_id", ctx.entrepriseId),
    supabase.from("devis").select("id", { count: "exact", head: true }).eq("entreprise_id", ctx.entrepriseId),
    supabase.from("chantiers").select("id", { count: "exact", head: true }).eq("entreprise_id", ctx.entrepriseId),
    supabase.from("sessions_pointage").select("id", { count: "exact", head: true }).eq("entreprise_id", ctx.entrepriseId),
  ]);

  const steps: Step[] = [
    { title: "Vérifier l’entreprise", description: "Complétez le SIRET, l’adresse, le logo et les informations qui apparaîtront sur vos documents.", href: "/parametres", action: "Vérifier les paramètres", done: Boolean(ctx.entrepriseNom) },
    { title: "Préparer l’équipe", description: "Invitez les collaborateurs puis attribuez à chacun un poste et les droits adaptés.", href: "/employes", action: "Gérer l’équipe", done: (members.count ?? 0) > 1 },
    { title: "Créer un premier client", description: "Une fiche client centralise ses coordonnées, chantiers, devis et factures.", href: "/clients/nouveau", action: "Créer un client", done: (clients.count ?? 0) > 0 },
    { title: "Établir un premier devis", description: "Ajoutez les prestations, contrôlez les totaux puis envoyez le document au client.", href: "/devis/nouveau", action: "Créer un devis", done: (quotes.count ?? 0) > 0 },
    { title: "Ouvrir un chantier", description: "Associez le client, le devis accepté et les membres de l’équipe chargés des travaux.", href: "/chantiers/nouveau", action: "Créer un chantier", done: (jobs.count ?? 0) > 0 },
    { title: "Tester le suivi du temps", description: "Vérifiez le pointage personnel, le chantier sélectionné et le circuit de validation.", href: "/pointage", action: "Ouvrir le pointage", done: (timeEntries.count ?? 0) > 0 },
  ];
  const completed = steps.filter((step) => step.done).length;

  return <main className="min-h-screen bg-neutral-50 p-4 sm:p-8 dark:bg-neutral-950">
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="rounded-2xl bg-[#0d1b2a] p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e5c978]">Liria Gestion Pro V3</p>
        <h1 className="mt-2 text-2xl font-semibold">Préparez votre espace de travail</h1>
        <p className="mt-2 text-sm text-white/70">Ces étapes utilisent les données réelles de {ctx.entrepriseNom}. Vous pouvez les réaliser dans l’ordre qui vous convient.</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-[#c9a24a]" style={{ width: `${Math.round(completed / steps.length * 100)}%` }}/></div>
        <p className="mt-2 text-xs text-white/60">{completed} étape{completed > 1 ? "s" : ""} sur {steps.length} réalisée{completed > 1 ? "s" : ""}</p>
      </header>

      <ol className="space-y-3">
        {steps.map((step, index) => <li key={step.title} className="flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center dark:bg-neutral-900">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step.done ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-white"}`}>{step.done ? "✓" : index + 1}</div>
          <div className="min-w-0 flex-1"><h2 className="font-semibold">{step.title}</h2><p className="mt-1 text-sm text-neutral-500">{step.description}</p></div>
          <Link href={step.href} className="shrink-0 rounded-md border px-3 py-2 text-center text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800">{step.done ? "Consulter" : step.action}</Link>
        </li>)}
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Link href="/guides/Guide_utilisation_Liria_Gestion_Pro.pdf" target="_blank" className="rounded-md border px-4 py-2 text-center text-sm font-medium">Consulter le guide complet</Link>
        <Link href="/dashboard" className="rounded-md bg-[#0d1b2a] px-4 py-2 text-center text-sm font-semibold text-white">Accéder au tableau de bord</Link>
      </div>
    </div>
  </main>;
}
