import { importerVehiculesAction } from "@/app/actions/flotte";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { Lien as Link } from "@/components/Lien";

type EmployeLie = { prenom: string; nom: string };

type VehiculeListe = {
  id: string;
  immatriculation: string;
  marque: string;
  modele: string;
  kilometrage: number;
  controle_technique_echeance: string | null;
  assurance_echeance: string | null;
  prochain_entretien_date: string | null;
  statut: string;
  employe: EmployeLie | EmployeLie[] | null;
};

const dateFr = (date: string | null) => date
  ? new Intl.DateTimeFormat("fr-FR").format(new Date(`${date}T12:00:00`))
  : "—";

const un = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

const STATUTS_VEHICULE: Record<string, { label: string; classes: string }> = {
  actif: { label: "Actif", classes: "bg-green-100 text-green-800" },
  maintenance: { label: "Maintenance", classes: "bg-amber-100 text-amber-800" },
  vendu: { label: "Vendu", classes: "bg-neutral-100 text-neutral-700" },
  hors_service: { label: "Hors service", classes: "bg-red-100 text-red-800" },
};

export default async function FlottePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicules")
    .select("id,immatriculation,marque,modele,kilometrage,controle_technique_echeance,assurance_echeance,prochain_entretien_date,statut,employe:employes!vehicules_employe_entreprise_fk(prenom,nom)")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("immatriculation");

  const vehicules = (data ?? []) as VehiculeListe[];
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const estEchue = (date: string | null) => Boolean(date && date <= aujourdHui);
  const alertes = vehicules.filter((vehicule) => [
    vehicule.controle_technique_echeance,
    vehicule.assurance_echeance,
    vehicule.prochain_entretien_date,
  ].some(estEchue)).length;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Flotte automobile</h1>
            <p className="text-sm text-neutral-500">{vehicules.length} véhicule(s) · {alertes} échéance(s) à traiter</p>
          </div>
          <Link href="/flotte/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            + Nouveau véhicule
          </Link>
        </div>

        {messages.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
        {messages.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{messages.success}</p>}

        <form action={importerVehiculesAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-3 rounded-md border border-[#c9a24a]/40 bg-[#c9a24a]/5 p-4">
          <div className="min-w-64 flex-1">
            <h2 className="font-semibold">Importer une liste de véhicules</h2>
            <p className="text-xs text-neutral-500">Excel, CSV ou PDF : immatriculation, marque, modèle, kilométrage et échéances.</p>
          </div>
          <input name="fichier" type="file" accept=".xlsx,.csv,.pdf,application/pdf" required className="rounded border px-3 py-2 text-sm" />
          <button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm text-white">Importer</button>
        </form>

        {vehicules.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-neutral-500">Aucun véhicule enregistré.</p>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {vehicules.map((vehicule) => {
                const employe = un(vehicule.employe);
                const statut = STATUTS_VEHICULE[vehicule.statut] ?? {
                  label: vehicule.statut.replaceAll("_", " "),
                  classes: "bg-neutral-100 text-neutral-700",
                };
                return (
                  <article key={vehicule.id} className="space-y-3 rounded-lg border p-4 dark:border-neutral-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/flotte/${vehicule.id}`} className="font-mono font-semibold hover:underline">{vehicule.immatriculation}</Link>
                        <p className="truncate text-sm text-neutral-600 dark:text-neutral-400">{vehicule.marque} {vehicule.modele}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium capitalize ${statut.classes}`}>{statut.label}</span>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs text-neutral-500">Kilométrage</dt><dd className="font-medium">{Number(vehicule.kilometrage).toLocaleString("fr-FR")} km</dd></div>
                      <div><dt className="text-xs text-neutral-500">Ouvrier assigné</dt><dd className="font-medium">{employe ? `${employe.prenom} ${employe.nom}` : "Non assigné"}</dd></div>
                      <div className={estEchue(vehicule.controle_technique_echeance) ? "text-red-700" : ""}><dt className="text-xs text-neutral-500">Contrôle technique</dt><dd>{dateFr(vehicule.controle_technique_echeance)}{estEchue(vehicule.controle_technique_echeance) ? " · Échu" : ""}</dd></div>
                      <div className={estEchue(vehicule.assurance_echeance) ? "text-red-700" : ""}><dt className="text-xs text-neutral-500">Assurance</dt><dd>{dateFr(vehicule.assurance_echeance)}{estEchue(vehicule.assurance_echeance) ? " · Échue" : ""}</dd></div>
                    </dl>
                    <Link href={`/flotte/${vehicule.id}`} className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium">
                      Voir le véhicule, les factures et les travaux
                    </Link>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800 md:block">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                  <tr><th className="px-4 py-2">Immatriculation</th><th>Véhicule</th><th>Ouvrier assigné</th><th>Kilométrage</th><th>Contrôle technique</th><th>Assurance</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {vehicules.map((vehicule) => {
                    const employe = un(vehicule.employe);
                    const statut = STATUTS_VEHICULE[vehicule.statut];
                    return (
                      <tr key={vehicule.id} className="border-t border-neutral-100 dark:border-neutral-800">
                        <td className="px-4 py-3"><Link href={`/flotte/${vehicule.id}`} className="font-mono font-medium hover:underline">{vehicule.immatriculation}</Link></td>
                        <td>{vehicule.marque} {vehicule.modele}</td>
                        <td>{employe ? `${employe.prenom} ${employe.nom}` : "Non assigné"}</td>
                        <td>{Number(vehicule.kilometrage).toLocaleString("fr-FR")} km</td>
                        <td className={estEchue(vehicule.controle_technique_echeance) ? "text-red-700" : ""}>{dateFr(vehicule.controle_technique_echeance)}</td>
                        <td className={estEchue(vehicule.assurance_echeance) ? "text-red-700" : ""}>{dateFr(vehicule.assurance_echeance)}</td>
                        <td><span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${statut?.classes ?? "bg-neutral-100 text-neutral-700"}`}>{statut?.label ?? vehicule.statut.replaceAll("_", " ")}</span></td>
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
