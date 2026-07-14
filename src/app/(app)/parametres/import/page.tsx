import Link from "next/link";
import { notFound } from "next/navigation";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { ImportWizard } from "@/components/ImportWizard";

export default async function ImportPage() {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const peutGererAcces = permissions === null || permissions.includes("gerer_utilisateurs");
  if (!peutGererAcces) notFound();

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/parametres" className="text-sm text-neutral-500">← Paramètres</Link>
          <h1 className="mt-2 text-xl font-semibold">Importer des données</h1>
          <p className="text-sm text-neutral-500">
            Migrez vos clients, chantiers, employés et catalogue depuis un autre logiciel (Batappli, EBP, Codial…).
            Exportez vos données en CSV ou Excel depuis votre ancien logiciel, puis déposez le fichier ici.
          </p>
        </div>
        <ImportWizard />
        <p className="text-xs text-neutral-500">
          Astuce : depuis Batappli/EBP, utilisez « Exporter » ou « Enregistrer sous » au format Excel (.xlsx) ou CSV.
          La première ligne doit contenir les intitulés de colonnes. Vous associez ensuite chaque colonne à un champ.
        </p>
      </div>
    </main>
  );
}
