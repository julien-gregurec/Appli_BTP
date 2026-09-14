import { Lien as Link } from "@/components/Lien";
import { createClient } from "@/lib/supabase/server";
import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";
import { rechercherOuvragesAction } from "@/app/actions/devis-v2";
import { chargerDroitsBibliotheque } from "@/lib/ouvrages/droits-bibliotheque";
import { BibliothequeInactive } from "@/components/ouvrages/BibliothequeInactive";

type Onglet = "actif" | "archive";

type Ligne = {
  id: string;
  referenceInterne: string | null;
  nom: string;
  categorie: string | null;
  unitePrincipale: string;
  statut: Onglet;
  versionCourante: number;
  modifieLe: string | null;
  correspondance: string | null;
};

const LIMITE = 500;
const champ = "min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900";
const bouton = "inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:hover:bg-neutral-800";
const dateCourte = (iso: string | null) => (iso ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(new Date(iso)) : "—");

function lien(statut: Onglet, q: string) {
  const p = new URLSearchParams();
  if (statut === "archive") p.set("statut", "archive");
  if (q) p.set("q", q);
  const s = p.toString();
  return `/ouvrages/bibliotheque${s ? `?${s}` : ""}`;
}

export default async function BibliothequeOuvragesPage({ searchParams }: { searchParams: Promise<{ statut?: string; q?: string }> }) {
  const params = await searchParams;
  if (!devisV2Actif()) return <BibliothequeInactive />;

  const { ctx, peutGerer } = await chargerDroitsBibliotheque();
  const onglet: Onglet = params.statut === "archive" ? "archive" : "actif";
  const recherche = String(params.q ?? "").trim().slice(0, 120);

  let lignes: Ligne[] = [];
  let erreur: string | null = null;
  let dansAutreOnglet = 0;

  if (recherche) {
    const r = await rechercherOuvragesAction(recherche);
    if ("error" in r) {
      erreur = r.error;
    } else {
      const toutes: Ligne[] = r.ouvrages.map((o) => ({ ...o, modifieLe: null }));
      lignes = toutes.filter((o) => o.statut === onglet);
      dansAutreOnglet = toutes.length - lignes.length;
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ouvrages")
      .select("id, reference_interne, nom, categorie, unite_principale, statut, version_courante, modifie_le")
      .eq("entreprise_id", ctx.entrepriseId)
      .eq("statut", onglet)
      .order("nom")
      .limit(LIMITE);
    if (error) erreur = messageErreurUtilisateur("BibliothequeOuvragesPage", error, "Impossible de charger la bibliothèque d’ouvrages.");
    lignes = (data ?? []).map((o) => ({
      id: String(o.id),
      referenceInterne: (o.reference_interne as string | null) ?? null,
      nom: String(o.nom),
      categorie: (o.categorie as string | null) ?? null,
      unitePrincipale: String(o.unite_principale),
      statut: o.statut === "archive" ? "archive" : "actif",
      versionCourante: Number(o.version_courante),
      modifieLe: (o.modifie_le as string | null) ?? null,
      correspondance: null,
    }));
  }

  const onglets: Array<{ cle: Onglet; libelle: string }> = [
    { cle: "actif", libelle: "Actifs" },
    { cle: "archive", libelle: "Archivés" },
  ];

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/ouvrages" className="inline-flex min-h-11 items-center text-sm text-neutral-500 hover:underline">← Ouvrages, modèles et métrés</Link>
            <h1 className="text-xl font-semibold">Bibliothèque d’ouvrages composés</h1>
            <p className="text-sm text-neutral-500">Ensembles réutilisables de fournitures, main-d’œuvre et prestations, insérés dans les devis par version.</p>
          </div>
          {peutGerer && (
            <Link href="/ouvrages/bibliotheque/nouveau" className="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
              + Nouvel ouvrage
            </Link>
          )}
        </div>

        <nav aria-label="Statut des ouvrages" className="flex gap-2">
          {onglets.map((o) => (
            <Link
              key={o.cle}
              href={lien(o.cle, recherche)}
              aria-current={o.cle === onglet ? "page" : undefined}
              className={`${bouton} ${o.cle === onglet ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 dark:border-white dark:bg-white dark:text-neutral-900" : ""}`}
            >
              {o.libelle}
            </Link>
          ))}
        </nav>

        <form role="search" action="/ouvrages/bibliotheque" method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {onglet === "archive" && <input type="hidden" name="statut" value="archive" />}
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium">Rechercher un ouvrage</span>
            <input name="q" type="search" defaultValue={recherche} maxLength={120} placeholder="Référence, nom, catégorie, référence d’un composant…" className={champ} />
          </label>
          <button type="submit" className={bouton}>Rechercher</button>
          {recherche && <Link href={lien(onglet, "")} className={bouton}>Effacer</Link>}
        </form>

        {erreur && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
        {recherche && dansAutreOnglet > 0 && (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {dansAutreOnglet} autre(s) résultat(s) parmi les ouvrages {onglet === "actif" ? "archivés" : "actifs"} :{" "}
            <Link href={lien(onglet === "actif" ? "archive" : "actif", recherche)} className="underline">les afficher</Link>.
          </p>
        )}
        {!recherche && lignes.length === LIMITE && (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">Les {LIMITE} premiers ouvrages sont affichés : utilisez la recherche pour trouver les autres.</p>
        )}

        {lignes.length === 0 && !erreur ? (
          <p className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {recherche ? "Aucun ouvrage ne correspond à cette recherche." : onglet === "actif" ? "Aucun ouvrage actif pour l’instant." : "Aucun ouvrage archivé."}
          </p>
        ) : (
          <div className="rounded-md border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="hidden bg-neutral-50 text-left text-xs uppercase text-neutral-500 md:table-header-group dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2">Référence</th>
                  <th className="px-4 py-2">Ouvrage</th>
                  <th className="px-4 py-2">Catégorie</th>
                  <th className="px-4 py-2">Unité</th>
                  <th className="px-4 py-2">Version</th>
                  <th className="px-4 py-2">{recherche ? "Trouvé par" : "Modifié le"}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((o) => (
                  <tr key={o.id} className="block border-t border-neutral-100 px-4 py-3 first:border-t-0 md:table-row md:px-0 md:py-0 dark:border-neutral-800">
                    <td className="block font-mono text-xs text-neutral-500 md:table-cell md:px-4 md:py-3">{o.referenceInterne ?? "—"}</td>
                    <td className="block md:table-cell md:px-4 md:py-3">
                      <Link href={`/ouvrages/bibliotheque/${o.id}`} className="inline-flex min-h-11 items-center font-medium hover:underline">{o.nom}</Link>
                    </td>
                    <td className="block text-neutral-600 md:table-cell md:px-4 md:py-3 dark:text-neutral-300">
                      <span className="text-xs text-neutral-500 md:hidden">Catégorie : </span>{o.categorie ?? "—"}
                    </td>
                    <td className="block md:table-cell md:px-4 md:py-3"><span className="text-xs text-neutral-500 md:hidden">Unité : </span>{o.unitePrincipale}</td>
                    <td className="block md:table-cell md:px-4 md:py-3"><span className="text-xs text-neutral-500 md:hidden">Version : </span>{o.versionCourante}</td>
                    <td className="block text-neutral-500 md:table-cell md:px-4 md:py-3">
                      {recherche ? o.correspondance : <><span className="text-xs md:hidden">Modifié le </span>{dateCourte(o.modifieLe)}</>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
