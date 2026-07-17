import Link from "next/link";
import { notFound } from "next/navigation";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { ImportWizard } from "@/components/ImportWizard";

export default async function ImportPage() {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const peutImporter = permissions === null || permissions.includes("gerer_utilisateurs") || permissions.includes("gerer_connecteurs");
  if (!peutImporter) notFound();

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href="/parametres" className="text-sm text-neutral-500">← Paramètres</Link>
          <h1 className="mt-2 text-xl font-semibold">Importer des données</h1>
          <p className="text-sm text-neutral-500">
            Migrez vos clients, chantiers, employés, catalogue, stock, codes-barres, tarifs fournisseurs et écritures comptables depuis Batigest, Batappli, EBP Bâtiment ou tout autre logiciel.
            Exportez vos données en CSV ou Excel depuis votre ancien logiciel, puis déposez le fichier ici.
          </p>
        </div>
        <section className="grid gap-3 sm:grid-cols-3"><div className="rounded border p-4"><strong>1. Export sécurisé</strong><p className="mt-1 text-xs text-neutral-500">Depuis Batigest, Batappli, EBP ou le logiciel source, exportez chaque famille en CSV/XLSX sans transmettre de mot de passe.</p></div><div className="rounded border p-4"><strong>2. Profil et correspondance</strong><p className="mt-1 text-xs text-neutral-500">Choisissez le logiciel d’origine : Liria reconnaît les intitulés courants, puis vous laisse tout vérifier.</p></div><div className="rounded border p-4"><strong>3. Entreprise pilote isolée</strong><p className="mt-1 text-xs text-neutral-500">Créez l’entreprise de test depuis Plateforme, importez ses données, puis attribuez ses postes et permissions.</p></div></section>
        <ImportWizard />
        <p className="text-xs text-neutral-500">
          Astuce : depuis Batigest, Batappli, EBP Bâtiment ou un autre logiciel, utilisez « Exporter » ou « Enregistrer sous » au format Excel (.xlsx) ou CSV.
          La première ligne doit contenir les intitulés de colonnes. Vous associez ensuite chaque colonne à un champ.
          Pour un essai réel, commencez par les clients et chantiers, puis le stock/codes-barres, et enfin les écritures comptables historiques.
        </p>
      </div>
    </main>
  );
}
