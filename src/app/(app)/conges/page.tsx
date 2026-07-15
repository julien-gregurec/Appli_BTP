import {createClient} from "@/lib/supabase/server";
import {getContexteEntreprise} from "@/lib/entreprise";
import {permissionsUtilisateur} from "@/lib/permissions";
import {isEmailLoginDisabled} from "@/lib/auth-mode";
import {creerDemandeCongeAction,transitionDemandeCongeAction} from "@/app/actions/conges";

const champ="w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900";
const types:Record<string,string>={conges_payes:"Congés payés",rtt:"RTT",sans_solde:"Sans solde",maladie:"Maladie",evenement_familial:"Événement familial",recuperation:"Récupération",autre:"Autre"};
const statuts:Record<string,string>={brouillon:"Brouillon",soumise:"En attente",approuvee:"Approuvée",refusee:"Refusée",annulee:"Annulée"};
const un=<T,>(valeur:T|T[]|null):T|null=>Array.isArray(valeur)?valeur[0]??null:valeur;

export default async function CongesPage({searchParams}:{searchParams:Promise<{error?:string;succes?:string}>}){
 const message=await searchParams;
 if(isEmailLoginDisabled())return <main className="p-8"><div className="mx-auto max-w-5xl"><h1 className="text-xl font-semibold">Demandes de congés</h1><p className="mt-4 rounded bg-amber-50 p-4 text-sm text-amber-900">Un compte personnel sécurisé est nécessaire.</p></div></main>;
 const ctx=await getContexteEntreprise(),sb=await createClient(),permissions=await permissionsUtilisateur(ctx),gere=permissions?.includes("gerer_conges");
 const[{data:demandes},{data:employeCompte}]=await Promise.all([
  sb.from("demandes_conges").select("id,type_conge,date_debut,date_fin,demi_jour_debut,demi_jour_fin,commentaire,statut,motif_decision,created_at,employe:employes(id,prenom,nom)").eq("entreprise_id",ctx.entrepriseId).order("created_at",{ascending:false}).limit(200),
  sb.from("employes").select("id").eq("entreprise_id",ctx.entrepriseId).eq("utilisateur_id",ctx.userId).maybeSingle(),
 ]);
 return <main className="p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
  <div><h1 className="text-xl font-semibold">Demandes de congés</h1><p className="text-sm text-neutral-500">La demande est envoyée immédiatement au responsable. Une approbation alimente automatiquement le planning.</p></div>
  {message.error&&<p className="rounded bg-red-50 p-3 text-sm text-red-700">{message.error}</p>}{message.succes&&<p className="rounded bg-green-50 p-3 text-sm text-green-700">{message.succes}</p>}
  <form action={creerDemandeCongeAction} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
   <h2 className="font-semibold sm:col-span-2 lg:col-span-4">Nouvelle demande</h2>
   <label className="text-xs">Type<select name="type_conge" className={`${champ} mt-1`}>{Object.entries(types).map(([cle,label])=><option key={cle} value={cle}>{label}</option>)}</select></label>
   <label className="text-xs">Du<input name="date_debut" type="date" required className={`${champ} mt-1`}/></label>
   <label className="text-xs">Début<select name="demi_jour_debut" className={`${champ} mt-1`}><option value="journee">Journée</option><option value="matin">Matin</option><option value="apres_midi">Après-midi</option></select></label>
   <label className="text-xs">Au<input name="date_fin" type="date" required className={`${champ} mt-1`}/></label>
   <label className="text-xs">Fin<select name="demi_jour_fin" className={`${champ} mt-1`}><option value="journee">Journée</option><option value="matin">Matin</option><option value="apres_midi">Après-midi</option></select></label>
   <label className="text-xs sm:col-span-2 lg:col-span-3">Commentaire<textarea name="commentaire" rows={2} className={`${champ} mt-1`}/></label>
   <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white sm:col-span-2 lg:col-span-4">Envoyer la demande</button>
  </form>
  <section className="space-y-3"><h2 className="font-semibold">{gere?"Demandes accessibles":"Mes demandes"}</h2>
   {(demandes??[]).map(demande=>{const employe=un(demande.employe as {id:string;prenom:string;nom:string}|{id:string;prenom:string;nom:string}[]|null),propre=employe?.id===employeCompte?.id;return <article key={demande.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{employe?`${employe.prenom} ${employe.nom}`:"Salarié"} · {types[demande.type_conge]??demande.type_conge}</strong><p className="text-sm text-neutral-500">{demande.date_debut} → {demande.date_fin}</p>{demande.commentaire&&<p className="mt-2 text-sm">{demande.commentaire}</p>}{demande.motif_decision&&<p className="mt-2 rounded bg-neutral-50 p-2 text-sm">Décision : {demande.motif_decision}</p>}</div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs">{statuts[demande.statut]??demande.statut}</span></div><div className="mt-3 flex flex-wrap gap-2">{propre&&demande.statut==="soumise"&&<form action={transitionDemandeCongeAction.bind(null,demande.id,"annuler")}><button className="rounded border px-3 py-2 text-sm">Annuler</button></form>}{gere&&demande.statut==="soumise"&&<><form action={transitionDemandeCongeAction.bind(null,demande.id,"approuver")}><input name="message" placeholder="Note facultative" className={champ}/><button className="mt-2 rounded bg-green-700 px-3 py-2 text-sm text-white">Approuver</button></form><form action={transitionDemandeCongeAction.bind(null,demande.id,"refuser")}><input name="message" required placeholder="Motif obligatoire" className={champ}/><button className="mt-2 rounded bg-red-700 px-3 py-2 text-sm text-white">Refuser</button></form></>}</div></article>})}
   {!demandes?.length&&<p className="rounded border border-dashed p-6 text-center text-sm text-neutral-500">Aucune demande.</p>}
  </section>
 </div></main>;
}
