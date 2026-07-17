import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { DEPENSE_CATEGORIES, DEPENSE_STATUTS } from "@/lib/depenses";
import { euros } from "@/lib/devis";
import { Lien as Link } from "@/components/Lien";
import { DepenseFournisseurForm } from "@/components/DepenseFournisseurForm";

const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

export default async function DepensesPage({ searchParams }: { searchParams: Promise<{ error?: string; chantier?: string }> }) {
  const { error, chantier = "" } = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [
    { data: depenses },
    { data: fournisseurs },
    { data: chantiers },
    { data: commandes },
    { data: vehicules },
    { data: outils },
    { data: employes },
  ] = await Promise.all([
    supabase.from("depenses_fournisseurs").select("*,fournisseur:fournisseurs(nom),chantier:chantiers(nom)").eq("entreprise_id", ctx.entrepriseId).order("date_piece", { ascending: false }),
    supabase.from("fournisseurs").select("id,nom").eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("nom"),
    supabase.from("chantiers").select("id,nom").eq("entreprise_id", ctx.entrepriseId).order("nom"),
    supabase.from("commandes_fournisseurs").select("id,numero,fournisseur_id").eq("entreprise_id", ctx.entrepriseId).order("date_commande", { ascending: false }),
    supabase.from("vehicules").select("id,immatriculation,marque,modele").eq("entreprise_id", ctx.entrepriseId).neq("statut", "vendu").order("immatriculation"),
    supabase.from("outils").select("id,reference,designation").eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(hors_service,perdu,rebut)").order("designation"),
    supabase.from("employes").select("id,prenom,nom").eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif").order("nom"),
  ]);

  const total = (depenses ?? []).filter((depense) => depense.statut !== "annulee").reduce((somme, depense) => somme + Number(depense.montant_ttc), 0);
  const regle = (depenses ?? []).reduce((somme, depense) => somme + Number(depense.montant_regle), 0);

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Factures fournisseurs</h1>
          <p className="text-sm text-neutral-500">Factures numérisées reliées aux chantiers, ouvriers, véhicules et outils.</p>
        </div>
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded border p-3">Total TTC <strong className="block">{euros(total)}</strong></div>
          <div className="rounded border p-3">Réglé <strong className="block text-green-700">{euros(regle)}</strong></div>
          <div className="rounded border p-3">À payer <strong className="block text-amber-700">{euros(Math.max(0, total - regle))}</strong></div>
        </div>
        <DepenseFournisseurForm
          fournisseurs={fournisseurs ?? []}
          chantiers={chantiers ?? []}
          commandes={commandes ?? []}
          vehicules={vehicules ?? []}
          outils={outils ?? []}
          employes={employes ?? []}
          chantierInitial={chantier}
        />
        <div className="overflow-x-auto rounded border dark:border-neutral-800">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr><th className="px-3 py-2">Date</th><th>N° pièce</th><th>Fournisseur</th><th>Chantier</th><th>Catégorie</th><th>Statut</th><th className="text-right">TVA</th><th className="text-right">TTC</th><th className="px-3 text-right">Reste</th></tr>
            </thead>
            <tbody>
              {depenses?.map((depense) => {
                const fournisseur = un(depense.fournisseur as { nom: string } | { nom: string }[] | null);
                const chantierLie = un(depense.chantier as { nom: string } | { nom: string }[] | null);
                const statut = DEPENSE_STATUTS[depense.statut];
                return (
                  <tr key={depense.id} className="border-t dark:border-neutral-800">
                    <td className="px-3 py-2">{depense.date_piece}</td>
                    <td><Link href={`/depenses/${depense.id}`} className="font-medium hover:underline">{depense.numero_piece}</Link></td>
                    <td>{fournisseur?.nom}</td>
                    <td>{chantierLie?.nom ?? "—"}</td>
                    <td>{DEPENSE_CATEGORIES[depense.categorie]}</td>
                    <td style={{ color: statut?.couleur }}>{statut?.label}</td>
                    <td className="text-right">{depense.taux_tva === undefined ? "—" : `${Number(depense.taux_tva).toLocaleString("fr-FR")} %`}</td>
                    <td className="text-right">{euros(depense.montant_ttc)}</td>
                    <td className="px-3 text-right">{euros(Number(depense.montant_ttc) - Number(depense.montant_regle))}</td>
                  </tr>
                );
              })}
              {(!depenses || !depenses.length) && <tr><td colSpan={9} className="p-8 text-center text-neutral-500">Aucune dépense.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
