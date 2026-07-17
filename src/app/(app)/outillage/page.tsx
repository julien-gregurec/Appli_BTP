import { importerOutilsAction } from "@/app/actions/outillage";
import { getContexteEntreprise } from "@/lib/entreprise";
import { OUTIL_CATEGORIES, OUTIL_ETATS, OUTIL_STATUTS } from "@/lib/outillage";
import { createClient } from "@/lib/supabase/server";
import { Lien as Link } from "@/components/Lien";

type EmployeLie = { prenom: string; nom: string };
type ChantierLie = { nom: string };

type OutilListe = {
  id: string;
  reference: string;
  designation: string;
  categorie: string;
  marque: string | null;
  modele: string | null;
  statut: string;
  etat: string;
  prochaine_verification: string | null;
  employe: EmployeLie | EmployeLie[] | null;
  chantier: ChantierLie | ChantierLie[] | null;
};

const un = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
const dateFr = (date: string | null) => date
  ? new Intl.DateTimeFormat("fr-FR").format(new Date(`${date}T12:00:00`))
  : "—";

export default async function OutillagePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data } = await supabase
    .from("outils")
    .select("id,reference,designation,categorie,marque,modele,statut,etat,prochaine_verification,employe:employes(prenom,nom),chantier:chantiers(nom)")
    .eq("entreprise_id", ctx.entrepriseId)
    .order("reference");

  const outils = (data ?? []) as OutilListe[];
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const verificationEchue = (date: string | null) => Boolean(date && date <= aujourdHui);
  const alertes = outils.filter((outil) => verificationEchue(outil.prochaine_verification)).length;
  const alertesHorsService = outils.filter((outil) => outil.statut === "hors_service").length;

  const affectation = (outil: OutilListe) => {
    if (["hors_service", "rebut"].includes(outil.statut)) return "Indisponible";
    const employe = un(outil.employe);
    const chantier = un(outil.chantier);
    if (employe) return `${employe.prenom} ${employe.nom}`;
    return chantier?.nom ?? "Non affecté";
  };

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Outillage</h1>
            <p className="text-sm text-neutral-500">{outils.length} outil(s) · {alertes} vérification(s) échue(s) · {alertesHorsService} décision(s) réparation/rebut</p>
          </div>
          <Link href="/outillage/nouveau" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            + Nouvel outil
          </Link>
        </div>

        {messages.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{messages.error}</p>}
        {messages.success && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{messages.success}</p>}

        <form action={importerOutilsAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-3 rounded-md border border-[#c9a24a]/40 bg-[#c9a24a]/5 p-4">
          <div className="min-w-64 flex-1">
            <h2 className="font-semibold">Importer une liste d’outillage</h2>
            <p className="text-xs text-neutral-500">Excel, CSV ou PDF : référence, désignation, catégorie, marque, modèle, série, état et prix.</p>
          </div>
          <input name="fichier" type="file" accept=".xlsx,.csv,.pdf,application/pdf" required className="rounded border px-3 py-2 text-sm" />
          <button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm text-white">Importer</button>
        </form>

        {outils.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-neutral-500">Aucun outil enregistré.</p>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {outils.map((outil) => {
                const statut = OUTIL_STATUTS[outil.statut] ?? OUTIL_STATUTS.disponible;
                const horsService = outil.statut === "hors_service";
                const echue = verificationEchue(outil.prochaine_verification);
                return (
                  <article key={outil.id} className={`space-y-3 rounded-lg border p-4 dark:border-neutral-800 ${horsService ? "border-red-200 bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/outillage/${outil.id}`} className="block truncate font-semibold hover:underline">{outil.designation}</Link>
                        <p className="font-mono text-xs text-neutral-500">{outil.reference}</p>
                        <p className="truncate text-xs text-neutral-500">{[outil.marque, outil.modele].filter(Boolean).join(" ") || "Marque non renseignée"}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ background: statut.couleur }} />{statut.label}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs text-neutral-500">Catégorie</dt><dd>{OUTIL_CATEGORIES[outil.categorie] ?? outil.categorie}</dd></div>
                      <div><dt className="text-xs text-neutral-500">État</dt><dd>{OUTIL_ETATS[outil.etat] ?? outil.etat.replaceAll("_", " ")}</dd></div>
                      <div><dt className="text-xs text-neutral-500">Affectation</dt><dd className={horsService ? "font-semibold text-red-700" : "font-medium"}>{affectation(outil)}</dd></div>
                      <div className={echue ? "text-red-700" : ""}><dt className="text-xs text-neutral-500">Prochaine vérification</dt><dd>{dateFr(outil.prochaine_verification)}{echue ? " · Échue" : ""}</dd></div>
                    </dl>
                    <Link href={`/outillage/${outil.id}`} className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm font-medium">
                      Voir l’outil, l’affectation et les factures
                    </Link>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-md border dark:border-neutral-800 md:block">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
                  <tr><th className="px-3 py-2">Réf.</th><th>Outil</th><th>Catégorie</th><th>Affectation</th><th>État</th><th>Statut</th><th>Vérification</th></tr>
                </thead>
                <tbody>
                  {outils.map((outil) => {
                    const statut = OUTIL_STATUTS[outil.statut] ?? OUTIL_STATUTS.disponible;
                    const horsService = outil.statut === "hors_service";
                    const echue = verificationEchue(outil.prochaine_verification);
                    return (
                      <tr key={outil.id} className={`border-t dark:border-neutral-800 ${horsService ? "bg-red-50/60 opacity-70 dark:bg-red-950/20" : ""}`}>
                        <td className="px-3 py-3 font-mono"><Link href={`/outillage/${outil.id}`} className="hover:underline">{outil.reference}</Link></td>
                        <td className="font-medium">{outil.designation}<span className="block text-xs font-normal text-neutral-500">{[outil.marque, outil.modele].filter(Boolean).join(" ")}</span></td>
                        <td>{OUTIL_CATEGORIES[outil.categorie] ?? outil.categorie}</td>
                        <td className={horsService ? "font-semibold text-red-700" : ""}>{affectation(outil)}</td>
                        <td>{OUTIL_ETATS[outil.etat] ?? outil.etat.replaceAll("_", " ")}</td>
                        <td><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: statut.couleur }} />{statut.label}</span></td>
                        <td className={echue ? "text-red-600" : ""}>{dateFr(outil.prochaine_verification)}</td>
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
