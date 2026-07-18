import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur } from "@/lib/permissions";
import { ReceptionScanner } from "@/components/ReceptionScanner";

export default async function ReceptionPage() {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const peut = (cle: string) => permissions === null || permissions.includes(cle);
  const compteDepot = peut("mode_compte_depot");
  if (!compteDepot && !peut("effectuer_entree_stock") && !peut("effectuer_sortie_stock")) notFound();

  const supabase = await createClient();
  const [{ data: articles }, { data: lignesOuvertes }, { data: chantiers }, { data: vehicules }, { data: outils }] = await Promise.all([
    supabase.from("articles_stock").select("id, reference, designation, code_barres, unite")
      .eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("designation"),
    supabase.rpc("receptions_lignes_ouvertes", { p_entreprise_id: ctx.entrepriseId }),
    supabase.from("chantiers").select("id, nom").eq("entreprise_id", ctx.entrepriseId)
      .not("statut", "in", "(archive,annule,termine)").order("nom"),
    supabase.from("vehicules").select("id,immatriculation,marque,modele").eq("entreprise_id", ctx.entrepriseId).neq("statut", "vendu").order("immatriculation"),
    supabase.from("outils").select("id,reference,designation").eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(hors_service,perdu,rebut)").order("designation"),
  ]);

  return (
    <main className="p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <Link href="/stock" className="text-sm text-neutral-500">← Stock</Link>
          <h1 className="mt-2 text-xl font-semibold">Réception & sortie par scan</h1>
          <p className="text-sm text-neutral-500">
            Scannez plusieurs articles à la suite. En réception, l&apos;application repère automatiquement
            les commandes fournisseurs en cours et propose de rattacher chaque quantité — une série de scans
            peut couvrir plusieurs commandes.
          </p>
        </div>

        <ReceptionScanner
          articles={(articles ?? []).map((a) => ({ ...a, code_barres: a.code_barres ?? null }))}
          lignesOuvertes={(lignesOuvertes ?? []) as never[]}
          chantiers={chantiers ?? []}
          vehicules={vehicules ?? []}
          outils={outils ?? []}
          identificationPersonnelle={compteDepot}
        />
      </div>
    </main>
  );
}
