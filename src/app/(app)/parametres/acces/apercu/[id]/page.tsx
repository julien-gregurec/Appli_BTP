import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { ApercuPoste } from "@/components/ApercuPoste";

type PermissionDetail = { cle: string; module: string; description: string };

export default async function ApercuPostePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const sb = await createClient();
  const [{ data: poste }, { data: droits }, { data: catalogue }, { count: membres }] = await Promise.all([
    sb.from("postes").select("id,nom").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    sb.from("permissions_poste").select("cle_permission").eq("entreprise_id", ctx.entrepriseId).eq("poste_id", id).eq("autorise", true),
    sb.from("permissions_disponibles").select("cle,module,description").order("module").order("description"),
    sb.from("utilisateurs_entreprises").select("utilisateur_id", { count: "exact", head: true }).eq("entreprise_id", ctx.entrepriseId).eq("poste_id", id).eq("statut", "actif"),
  ]);
  if (!poste) notFound();
  const permissions = (droits ?? []).map((droit) => droit.cle_permission);
  const details = ((catalogue ?? []) as PermissionDetail[]).filter((permission) =>
    permission.cle.startsWith("acces_") || permission.cle.startsWith("gerer_") || permission.cle.startsWith("saisir_") || permission.cle.startsWith("voir_") || permission.cle === "valider_pointages",
  );

  return <main className="p-8"><div className="mx-auto max-w-7xl space-y-6">
    <div>
      <Link href="/parametres/acces" className="text-sm text-neutral-500 hover:underline">← Accès et rôles</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-semibold">Aperçu du poste · {poste.nom}</h1><p className="text-sm text-neutral-500">{membres ?? 0} membre(s) actif(s) utilisent actuellement ce poste.</p></div><Link href="/parametres/acces" className="rounded-md border px-3 py-2 text-sm font-medium">Modifier les droits</Link></div>
    </div>
    <ApercuPoste poste={poste.nom} entrepriseNom={ctx.entrepriseNom} permissions={permissions} catalogue={details} />
  </div></main>;
}
