import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { entrerEntreprisePlateformeAction } from "@/app/actions/plateforme";
import { ApercuPoste } from "@/components/ApercuPoste";

type EntreprisePlateforme={id:string;nom:string;reference_interne:string|null};
type RoleDemo={poste_id:string;poste_nom:string;nb_employes:number;permissions:string[]};
type PermissionDetail={cle:string;module:string;description:string};

export default async function RolesDemoPage({searchParams}:{searchParams:Promise<{poste?:string}>}){
  if(!(await estPlateformeAdmin()))notFound();
  const{poste}=await searchParams,supabase=await createClient();
  const[{data:entreprises},{data:catalogue}]=await Promise.all([
    supabase.rpc("plateforme_entreprises"),
    supabase.from("permissions_disponibles").select("cle,module,description").order("module").order("description"),
  ]);
  const demo=((entreprises??[])as EntreprisePlateforme[]).find(entreprise=>entreprise.reference_interne==="DEMO-18M")??null;
  const{data:roles}=demo?await supabase.rpc("plateforme_roles_entreprise",{p_entreprise_id:demo.id}):{data:[]};
  const liste=(roles??[])as RoleDemo[],selection=liste.find(role=>role.poste_id===poste)??liste.find(role=>role.poste_nom==="Ouvrier")??liste[0]??null;
  const details=((catalogue??[])as PermissionDetail[]).filter(permission=>permission.cle.startsWith("acces_")||permission.cle.startsWith("gerer_")||permission.cle.startsWith("saisir_")||permission.cle.startsWith("voir_")||permission.cle==="valider_pointages");
  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <div><Link href="/plateforme" className="text-sm text-neutral-500 hover:underline">← Plateforme</Link><h1 className="mt-1 text-xl font-semibold">Entreprise test et rôles</h1><p className="text-sm text-neutral-500">Simulez exactement le menu et les informations visibles par chaque poste sans utiliser le compte d’un salarié réel.</p></div>
    {!demo?<section className="rounded-md border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="font-semibold">Entreprise de démonstration à initialiser</h2><p className="mt-1">Exécutez le script <code>creer_entreprise_demo_18_mois.sql</code> pour ajouter 18 mois d’activité, les salariés, cartes BTP et habilitations.</p></section>:<>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-4"><div><h2 className="font-semibold">{demo.nom}</h2><p className="text-xs text-neutral-600">Référence {demo.reference_interne} · {liste.length} rôles configurés</p></div><form action={entrerEntreprisePlateformeAction.bind(null,demo.id)} className="flex flex-wrap gap-2"><input type="hidden" name="motif" value="Test fonctionnel de l’entreprise de démonstration"/><button className="rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white">Entrer comme administrateur</button></form></section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{liste.map(role=>{const consulter=role.permissions.filter(cle=>cle.startsWith("acces_")).length,gerer=role.permissions.filter(cle=>cle.startsWith("gerer_")).length;return <Link key={role.poste_id} href={`/plateforme/roles-demo?poste=${role.poste_id}`} className={`rounded-md border p-4 transition ${selection?.poste_id===role.poste_id?"border-[#c9a24a] bg-[#c9a24a]/10":"hover:border-neutral-400"}`}><strong>{role.poste_nom}</strong><p className="mt-1 text-xs text-neutral-500">{role.nb_employes} salarié(s)</p><div className="mt-2 flex gap-2 text-[10px]"><span className="rounded-full bg-blue-100 px-2 py-1 text-blue-800">{consulter} consulter</span><span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">{gerer} gérer</span></div></Link>})}</div>
      {selection&&<ApercuPoste poste={selection.poste_nom} entrepriseNom={demo.nom} permissions={selection.permissions} catalogue={details}/>} 
    </>}
  </div></main>;
}
