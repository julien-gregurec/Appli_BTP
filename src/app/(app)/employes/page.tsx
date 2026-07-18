import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { ancienneteEmploye, contratEmployeLabel, formatEuro, nomEmploye, statutEmploye } from "@/lib/employes";
import { permissionsUtilisateur } from "@/lib/permissions";
import Image from "next/image";
import { Lien as Link } from "@/components/Lien";

type EmployeListe = {
  id: string;
  reference_interne: string;
  identifiant_interne: string;
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
  date_entree: string | null;
  date_sortie: string | null;
  invitation_envoyee_at: string | null;
  application_installee_at: string | null;
  premiere_connexion_at: string | null;
  derniere_connexion_at: string | null;
  photo_storage_path: string | null;
  photo_url: string | null;
};

type EmployeAvecAcces = EmployeListe & {
  posteAcces: string | null;
  autorisations: string[];
  consultations: number;
  gestions: number;
  visualisations: number;
  speciaux: number;
};

type FamilleEmploye = "terrain" | "encadrement" | "support";

const famillesEmployes: Record<FamilleEmploye, {
  titre: string;
  description: string;
  ordre: number;
  bandeau: string;
  pastille: string;
  fondPhoto: string;
}> = {
  terrain: {
    titre: "Équipe terrain",
    description: "Ouvriers, techniciens et compagnons",
    ordre: 1,
    bandeau: "from-emerald-700 via-emerald-600 to-teal-500",
    pastille: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    fondPhoto: "from-emerald-50 to-teal-100 dark:from-emerald-950 dark:to-teal-950",
  },
  encadrement: {
    titre: "Encadrement",
    description: "Chefs d’équipe, conducteurs et responsables",
    ordre: 2,
    bandeau: "from-orange-600 via-amber-600 to-red-600",
    pastille: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
    fondPhoto: "from-orange-50 to-amber-100 dark:from-orange-950 dark:to-amber-950",
  },
  support: {
    titre: "Administration & support",
    description: "Direction, gestion et fonctions support",
    ordre: 3,
    bandeau: "from-blue-700 via-indigo-700 to-violet-700",
    pastille: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    fondPhoto: "from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-950",
  },
};

function familleEmploye(employe: EmployeAvecAcces): FamilleEmploye {
  const fonction = `${employe.poste ?? ""} ${employe.posteAcces ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/chef|conducteur|responsable|charge d.affaires|coordinateur|ingenieur|manager/.test(fonction)) {
    return "encadrement";
  }

  if (/administr|assistant|comptab|secret|rh|ressources humaines|commercial|direction|dirigeant|gerant|support|bureau/.test(fonction)) {
    return "support";
  }

  return "terrain";
}

export default async function EmployesPage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGerer = permissions === null || permissions.includes("gerer_employes");
  const peutVoirFinances = permissions === null || permissions.includes("voir_indicateurs_financiers");

  const [{ data: employes }, { data: postes }, { data: droits }, { data: catalogue }] = await Promise.all([
    supabase
      .from("employes")
      .select("id, reference_interne, identifiant_interne, numero_inscription, utilisateur_id, poste_id, prenom, nom, poste, type_contrat, statut, telephone, email, cout_horaire, date_entree, date_sortie, invitation_envoyee_at, application_installee_at, premiere_connexion_at, derniere_connexion_at, photo_storage_path, photo_url")
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
      visualisations: autorisations.filter((cle) => cle.startsWith("voir_")).length,
      speciaux: autorisations.filter((cle) => !cle.startsWith("acces_") && !cle.startsWith("gerer_") && !cle.startsWith("voir_")).length,
    };
  });
  const groupesEmployes = (Object.keys(famillesEmployes) as FamilleEmploye[])
    .map((famille) => ({
      famille,
      configuration: famillesEmployes[famille],
      employes: employesAvecAcces.filter((employe) => familleEmploye(employe) === famille),
    }))
    .filter((groupe) => groupe.employes.length > 0)
    .sort((a, b) => a.configuration.ordre - b.configuration.ordre);

  const droitsEmploye = (employe: EmployeAvecAcces) => employe.autorisations.length ? (
    <details>
      <summary className="cursor-pointer list-none font-medium text-blue-700 hover:underline [&::-webkit-details-marker]:hidden">
        {employe.consultations} consulter · {employe.gestions} gérer
        {employe.visualisations ? ` · ${employe.visualisations} chiffres` : ""}
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
                    : cle.startsWith("voir_")
                      ? "bg-violet-100 text-violet-800"
                    : "bg-violet-100 text-violet-800"
              }`}>
                {cle.startsWith("acces_") ? "Voir" : cle.startsWith("gerer_") ? "Gérer" : cle.startsWith("voir_") ? "Chiffres" : "Personnel"}
              </span>
              <span>{descriptions.get(cle) ?? cle}</span>
            </div>
          ))}
      </div>
    </details>
  ) : <span className="text-red-600">Aucun droit accordé</span>;

  const accesEmploye = (employe: EmployeAvecAcces) => {
    if (employe.derniere_connexion_at) return { label: "Connecté", classe: "bg-green-100 text-green-800", detail: `Dernière connexion ${new Date(employe.derniere_connexion_at).toLocaleString("fr-FR")}${employe.application_installee_at ? " · application installée" : " · navigateur"}` };
    if (employe.utilisateur_id) return { label: "Compte activé", classe: "bg-blue-100 text-blue-800", detail: "Compte créé, aucune connexion encore enregistrée" };
    if (employe.invitation_envoyee_at) return { label: "Invitation envoyée", classe: "bg-amber-100 text-amber-800", detail: new Date(employe.invitation_envoyee_at).toLocaleString("fr-FR") };
    return { label: "À inviter", classe: "bg-neutral-100 text-neutral-700", detail: "Aucune invitation enregistrée" };
  };

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[96rem] space-y-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Les métiers de l’entreprise</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {employes?.length ?? 0} employé{(employes?.length ?? 0) > 1 ? "s" : ""} · trombinoscope et accès à l’application
            </p>
          </div>
          {peutGerer&&<Link href="/employes/nouveau" className="inline-flex w-full items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900 sm:w-auto">
            + Nouvel employé
          </Link>}
        </div>

        {employesAvecAcces.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Aucun employé pour l&apos;instant. Crée la première fiche.
          </div>
        ) : (
          <div className="space-y-10">
            {groupesEmployes.map(({ famille, configuration, employes: employesDuGroupe }) => (
              <section key={famille} aria-labelledby={`famille-${famille}`}>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className={`h-3 w-3 rounded-full bg-gradient-to-br ${configuration.bandeau}`} />
                      <h2 id={`famille-${famille}`} className="text-lg font-semibold">{configuration.titre}</h2>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">{configuration.description}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${configuration.pastille}`}>
                    {employesDuGroupe.length} personne{employesDuGroupe.length > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {employesDuGroupe.map((employe) => {
                    const statut = statutEmploye(employe.statut);
                    const acces = accesEmploye(employe);
                    const photo = employe.photo_storage_path
                      ? `/api/employes/${employe.id}/photo`
                      : employe.photo_url;

                    return (
                      <article
                        key={employe.id}
                        className="group overflow-hidden rounded-[1.35rem] border border-neutral-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
                      >
                        <div className={`bg-gradient-to-r px-4 py-3 text-white ${configuration.bandeau}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Link href={`/employes/${employe.id}`} className="block truncate text-lg font-bold leading-tight hover:underline">
                                {nomEmploye(employe)}
                              </Link>
                              <p className="mt-1 min-h-8 text-xs font-medium leading-4 text-white/90">
                                {employe.poste ?? employe.posteAcces ?? "Fonction à renseigner"}
                              </p>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/20 px-2 py-1 text-[10px] font-semibold backdrop-blur-sm">
                              <span className="h-2 w-2 rounded-full ring-2 ring-white/40" style={{ background: statut.couleur }} />
                              {statut.libelle}
                            </span>
                          </div>
                        </div>

                        <div className={`relative aspect-[4/3] overflow-hidden bg-gradient-to-br ${configuration.fondPhoto}`}>
                          {photo ? (
                            <Image
                              src={photo}
                              alt={`Photo de ${nomEmploye(employe)}`}
                              fill
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                              unoptimized
                              className="object-cover object-top transition duration-300 group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400">
                              <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/80 bg-white/65 text-3xl font-bold shadow-sm dark:border-neutral-800/80 dark:bg-neutral-900/65">
                                {employe.prenom[0]}{employe.nom[0]}
                              </div>
                              <span className="mt-3 text-xs font-medium">Photo à ajouter</span>
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-white">
                            <p className="font-mono text-[11px] font-semibold tracking-wide">
                              {employe.identifiant_interne ?? employe.reference_interne}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4 p-4">
                          <div className="flex flex-wrap gap-2 text-[11px] font-medium">
                            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                              {contratEmployeLabel(employe.type_contrat)}
                            </span>
                            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                              {ancienneteEmploye(employe.date_entree, employe.statut === "sorti" ? employe.date_sortie : null)}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 ${acces.classe}`}>{acces.label}</span>
                          </div>

                          <div className="border-y border-neutral-100 py-3 text-xs dark:border-neutral-800">
                            <p className="truncate font-medium text-neutral-800 dark:text-neutral-200">
                              {employe.posteAcces ?? "Aucun poste d’accès"}
                            </p>
                            <p className="mt-1 truncate text-neutral-500" title={employe.telephone ?? employe.email ?? undefined}>
                              {employe.telephone ?? employe.email ?? "Contact non renseigné"}
                            </p>
                            {peutVoirFinances && (
                              <p className="mt-1 text-neutral-500">Coût horaire : {formatEuro(employe.cout_horaire)}</p>
                            )}
                          </div>

                          {peutGerer ? (
                            <div className="text-xs">{droitsEmploye(employe)}</div>
                          ) : (
                            <p className="text-xs text-neutral-500">Autorisations réservées aux gestionnaires</p>
                          )}

                          <Link
                            href={`/employes/${employe.id}`}
                            className="inline-flex w-full items-center justify-center rounded-xl bg-neutral-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                          >
                            Ouvrir la fiche
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
