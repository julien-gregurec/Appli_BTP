import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { nomClient } from "@/lib/chantier-statuts";
import { StatutChantierSelect } from "@/components/StatutChantierSelect";
import { TacheItem } from "@/components/TacheItem";
import { affecterEmployeChantierAction, ajouterTacheAction, retirerEmployeChantierAction } from "@/app/actions/chantiers";
import { euros, statutDevis } from "@/lib/devis";
import { statutFacture } from "@/lib/factures";
import { permissionsUtilisateur } from "@/lib/permissions";
import { IdentificationCodeCard } from "@/components/IdentificationCodeCard";
import { ROLES_CHANTIER, roleChantier } from "@/lib/chantier-statuts";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { ChantierProgressCharts } from "@/components/ChantierProgressCharts";
import { classerFactureDepuisChantierAction } from "@/app/actions/depenses";
import { DEPENSE_CATEGORIES, DEPENSE_STATUTS } from "@/lib/depenses";
import { associerDevisDepuisChantierAction } from "@/app/actions/devis";
import { SearchableSelect } from "@/components/SearchableSelect";

export default async function ChantierDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const { id } = await params;
  const messages = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions=await permissionsUtilisateur(ctx);const peutVoirFinances=permissions===null||permissions.includes("voir_indicateurs_financiers");const peutVoirHeures=permissions===null||permissions.includes("voir_heures_chantiers")||permissions.includes("gerer_pointage");const peutGerer=permissions===null||permissions.includes("gerer_chantiers");const peutCreerDevis=permissions===null||permissions.includes("gerer_devis");const peutVoirAchats=permissions===null||permissions.includes("acces_achats");const peutGererAchats=permissions===null||permissions.includes("gerer_achats");

  const { data: chantier } = await supabase
    .from("chantiers")
    .select("*, client:clients(id, nom, prenom, societe), type:types_chantier(nom)")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .single();

  if (!chantier) notFound();

  const { data: taches } = await supabase
    .from("taches")
    .select("id, libelle, description, statut, echeance, devis_id")
    .eq("chantier_id", id)
    .order("created_at");

  const [{ data: devis }, { data: factures }, { data: affectations }, {data:pointages}, {data:documents}, {data:codeIdentification}, {data:equipe}, {data:employes}, {data:facturesFournisseurs}, {data:facturesSansChantier}] = await Promise.all([
    supabase.from("devis").select("id, numero, statut, montant_ttc").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("factures").select("id, numero, statut, montant_ttc, montant_paye").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("affectations").select("heures").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId),
    peutVoirHeures?supabase.from("pointages").select("id,date,heures_normales,heures_supplementaires,tache,verification_statut,employe:employes(prenom,nom)").eq("chantier_id",id).eq("entreprise_id",ctx.entrepriseId).order("date",{ascending:false}):Promise.resolve({data:[]}),
    supabase.from("documents_chantier").select("id,nom,categorie,note,mime_type,audience,created_at").eq("chantier_id", id).eq("entreprise_id", ctx.entrepriseId).order("created_at",{ascending:false}),
    supabase.from("codes_identification").select("id,code").eq("entreprise_id",ctx.entrepriseId).eq("type_ressource","chantier").eq("ressource_id",id).eq("actif",true).maybeSingle(),
    supabase.from("equipes_chantiers").select("id,role_chantier,date_debut,date_fin,note,employe:employes(id,prenom,nom,poste,statut)").eq("entreprise_id",ctx.entrepriseId).eq("chantier_id",id).order("date_fin",{ascending:true}).order("role_chantier"),
    peutGerer?supabase.from("employes").select("id,prenom,nom,poste").eq("entreprise_id",ctx.entrepriseId).not("statut","in",'(sorti,suspendu)').order("nom"):Promise.resolve({data:[]}),
    peutVoirAchats?supabase.from("depenses_fournisseurs").select("id,numero_piece,categorie,date_piece,statut,montant_ttc,montant_regle,justificatif_storage_path,fournisseur:fournisseurs(nom)").eq("entreprise_id",ctx.entrepriseId).eq("chantier_id",id).order("date_piece",{ascending:false}):Promise.resolve({data:[]}),
    peutGererAchats?supabase.from("depenses_fournisseurs").select("id,numero_piece,date_piece,montant_ttc,fournisseur:fournisseurs(nom)").eq("entreprise_id",ctx.entrepriseId).is("chantier_id",null).neq("statut","annulee").order("date_piece",{ascending:false}).limit(100):Promise.resolve({data:[]}),
  ]);
  const devisDuClient = peutCreerDevis
    ? (await supabase.from("devis").select("id,numero,statut,chantier_id,chantier:chantiers!devis_chantier_id_fkey(nom)").eq("entreprise_id",ctx.entrepriseId).eq("client_id",chantier.client_id).order("created_at",{ascending:false})).data ?? []
    : [];
  const totalDevisAccepte = (devis ?? []).filter((item) => item.statut === "accepte").reduce((total, item) => total + Number(item.montant_ttc ?? 0), 0);
  const totalFacture = (factures ?? []).filter((item) => item.statut !== "annulee").reduce((total, item) => total + Number(item.montant_ttc ?? 0), 0);
  const totalPaye = (factures ?? []).reduce((total, item) => total + Number(item.montant_paye ?? 0), 0);
  const totalHeures = (affectations ?? []).reduce((total, item) => total + Number(item.heures ?? 0), 0);
  const pointagesValides=(pointages??[]).filter(p=>p.verification_statut==="valide");const totalHeuresRealisees=pointagesValides.reduce((s,p)=>s+Number(p.heures_normales)+Number(p.heures_supplementaires),0);const relation=<T,>(v:T|T[]|null)=>Array.isArray(v)?v[0]??null:v;
  const totalFacturesFournisseurs=(facturesFournisseurs??[]).filter(item=>item.statut!=="annulee").reduce((total,item)=>total+Number(item.montant_ttc??0),0);
  const totalRegleFournisseurs=(facturesFournisseurs??[]).reduce((total,item)=>total+Number(item.montant_regle??0),0);

  const client = Array.isArray(chantier.client) ? chantier.client[0] : chantier.client;
  const type = Array.isArray(chantier.type) ? chantier.type[0] : chantier.type;
  const ajouterTache = ajouterTacheAction.bind(null, id);

  const ligne = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex gap-2 text-sm">
        <span className="w-40 flex-none text-neutral-500">{label}</span>
        <span>{value}</span>
      </div>
    ) : null;

  return (
    <main className="p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/chantiers" className="text-sm text-neutral-500 hover:underline">← Chantiers</Link>
            <h1 className="mt-1 text-xl font-semibold">{chantier.nom}</h1>
            <p className="font-mono text-xs text-neutral-500">{chantier.reference_interne}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/chantiers/${id}/documents`} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
              Photos & documents{documents?.length ? ` (${documents.length})` : ""}
            </Link>
            {peutGerer?<StatutChantierSelect chantierId={id} statut={chantier.statut} />:<span className="rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-800">{chantier.statut.replaceAll("_"," ")}</span>}
          </div>
        </div>

        {messages.error&&<p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{messages.error}</p>}
        {messages.success&&<p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{messages.success}</p>}

        <section className="space-y-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Informations</h2>
          {client && (
            <div className="flex gap-2 text-sm">
              <span className="w-40 flex-none text-neutral-500">Client</span>
              <Link href={`/clients/${client.id}`} className="hover:underline">{nomClient(client)}</Link>
            </div>
          )}
          {ligne("Type", type?.nom)}
          {ligne("Adresse", chantier.adresse)}
          {ligne("Code postal / Ville", [chantier.code_postal, chantier.ville].filter(Boolean).join(" "))}
          {ligne("Début prévu", chantier.date_debut_prevue)}
          {ligne("Fin prévue", chantier.date_fin_prevue)}
          {ligne("Budget prévisionnel", chantier.budget_previsionnel ? `${chantier.budget_previsionnel} €` : null)}
        </section>

        {(documents??[]).length>0&&<section className="space-y-3 rounded-md border border-blue-200 bg-blue-50/40 p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Plans et pièces jointes autorisées</h2><p className="text-sm text-neutral-500">Seuls les documents autorisés pour votre rôle sont affichés.</p></div><Link href={`/chantiers/${id}/documents`} className="text-sm font-medium text-blue-800 hover:underline">Tout consulter</Link></div><div className="grid gap-2 sm:grid-cols-2">{(documents??[]).slice().sort((a,b)=>(a.categorie==="plan"?0:1)-(b.categorie==="plan"?0:1)).slice(0,6).map(document=><a key={document.id} href={`/api/documents/${document.id}`} target="_blank" rel="noopener" className="rounded-md border bg-white p-3 text-sm hover:border-blue-400"><strong className="block truncate">{document.categorie==="plan"?"📐 Plan · ":"📎 "}{document.nom}</strong>{document.note&&<span className="mt-1 block text-xs text-neutral-500">{document.note}</span>}</a>)}</div></section>}

        <ChantierProgressCharts
          finances={peutVoirFinances ? { devis: totalDevisAccepte, facture: totalFacture, paye: totalPaye } : null}
          heures={peutVoirHeures ? { planifiees: totalHeures, validees: totalHeuresRealisees } : null}
          taches={{ total: taches?.length ?? 0, faites: (taches ?? []).filter((tache) => tache.statut === "fait").length }}
        />

        {codeIdentification&&<IdentificationCodeCard id={codeIdentification.id} code={codeIdentification.code} label="QR code du chantier"/>}

        <section className="space-y-4 rounded-md border p-4">
          <div><h2 className="font-semibold">Équipe affectée au chantier</h2><p className="text-sm text-neutral-500">Ouvriers et encadrement ayant accès aux informations terrain de ce chantier selon leur poste.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{(equipe??[]).filter(membre=>membre.date_fin===null).map(membre=>{const employe=relation(membre.employe as {id:string;prenom:string;nom:string;poste:string|null;statut:string}|{id:string;prenom:string;nom:string;poste:string|null;statut:string}[]|null);const retirer=retirerEmployeChantierAction.bind(null,id,membre.id);return <article key={membre.id} className="rounded-md border p-3"><div className="flex items-start justify-between gap-3"><div><strong>{employe?`${employe.prenom} ${employe.nom}`:"Collaborateur"}</strong><p className="text-sm text-[#9a7625]">{roleChantier(membre.role_chantier).libelle}</p><p className="text-xs text-neutral-500">Depuis le {new Date(`${membre.date_debut}T00:00:00`).toLocaleDateString("fr-FR")}{employe?.poste?` · ${employe.poste}`:""}</p>{membre.note&&<p className="mt-1 text-xs text-neutral-600">{membre.note}</p>}</div>{peutGerer&&<form action={retirer}><ConfirmSubmitButton message="Retirer ce collaborateur de l’équipe du chantier ?" className="text-xs text-red-700">Retirer</ConfirmSubmitButton></form>}</div></article>})}{!(equipe??[]).some(membre=>membre.date_fin===null)&&<p className="rounded border border-dashed p-4 text-sm text-neutral-500 sm:col-span-2">Aucun collaborateur affecté durablement à ce chantier.</p>}</div>
          {peutGerer&&<form action={affecterEmployeChantierAction.bind(null,id)} className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]"><label className="text-xs text-neutral-500">Collaborateur<select name="employe_id" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"><option value="">— Choisir —</option>{(employes??[]).map(employe=><option key={employe.id} value={employe.id}>{employe.prenom} {employe.nom}{employe.poste?` · ${employe.poste}`:""}</option>)}</select></label><label className="text-xs text-neutral-500">Rôle sur ce chantier<select name="role_chantier" defaultValue="ouvrier" className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900">{ROLES_CHANTIER.map(role=><option key={role.cle} value={role.cle}>{role.libelle}</option>)}</select></label><label className="text-xs text-neutral-500">À partir du<input name="date_debut" type="date" defaultValue={new Date().toISOString().slice(0,10)} required className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"/></label><button className="self-end rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Affecter</button><label className="text-xs text-neutral-500 sm:col-span-2 lg:col-span-4">Note facultative<input name="note" placeholder="Mission, zone ou responsabilité particulière" className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"/></label></form>}
        </section>

        {peutCreerDevis&&<section className="space-y-3 rounded-md border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900 dark:bg-blue-950/20"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Devis associés au chantier</h2><p className="text-sm text-neutral-500">Choisissez un devis du même client. L’association sera également visible et modifiable depuis la fiche du devis.</p></div><Link href={`/devis/nouveau?client=${chantier.client_id}&chantier=${id}`} className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-300">+ Nouveau devis pour ce chantier</Link></div>{(devis??[]).length>0&&<div className="flex flex-wrap gap-2">{(devis??[]).map(item=><Link key={item.id} href={`/devis/${item.id}`} className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium hover:border-blue-500 dark:bg-neutral-950">{item.numero??"Devis brouillon"} · {statutDevis(item.statut).libelle}</Link>)}</div>}{devisDuClient.some(item=>item.chantier_id!==id)?<form action={associerDevisDepuisChantierAction.bind(null,id)} className="flex flex-col gap-2 border-t border-blue-100 pt-3 sm:flex-row sm:items-end"><label className="flex-1 text-xs text-neutral-500">Associer un devis existant<SearchableSelect name="devis_id" required options={devisDuClient.filter(item=>item.chantier_id!==id).map(item=>{const chantierActuel=relation(item.chantier as {nom:string}|{nom:string}[]|null);return{value:item.id,label:`${item.numero??"Devis brouillon"} · ${statutDevis(item.statut).libelle}${chantierActuel?` · actuellement sur ${chantierActuel.nom}`:" · sans chantier"}`,search:chantierActuel?.nom??""};})} placeholder="Écrire le numéro du devis…" className="mt-1" /></label><button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Associer à ce chantier</button></form>:<p className="rounded border border-dashed border-blue-200 p-3 text-sm text-neutral-500">Tous les devis de ce client sont déjà associés à ce chantier.</p>}</section>}

        {peutVoirFinances&&<section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Pilotage financier</h2>{peutCreerDevis&&<Link href={`/devis/nouveau?client=${chantier.client_id}&chantier=${id}`} className="text-sm text-neutral-600 hover:underline dark:text-neutral-400">+ Nouveau devis</Link>}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Devis acceptés</div><div className="mt-1 font-mono font-semibold">{euros(totalDevisAccepte)}</div></div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Facturé</div><div className="mt-1 font-mono font-semibold">{euros(totalFacture)}</div></div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Encaissé</div><div className="mt-1 font-mono font-semibold text-green-700 dark:text-green-400">{euros(totalPaye)}</div></div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="text-xs text-neutral-500">Heures planifiées / validées</div><div className="mt-1 font-mono font-semibold">{totalHeures} h / {totalHeuresRealisees} h</div></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Devis</div>{devis?.length ? devis.slice(0, 5).map((item) => { const st = statutDevis(item.statut); return <Link key={item.id} href={`/devis/${item.id}`} className="flex justify-between rounded px-1 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><span>{item.numero ?? "Brouillon"}</span><span className="font-mono">{euros(item.montant_ttc)}</span><span className="text-xs" style={{ color: st.couleur }}>{st.libelle}</span></Link>; }) : <p className="text-sm text-neutral-500">Aucun devis.</p>}</div>
            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"><div className="mb-2 text-xs font-semibold uppercase text-neutral-500">Factures</div>{factures?.length ? factures.slice(0, 5).map((item) => { const st = statutFacture(item.statut); return <Link key={item.id} href={`/factures/${item.id}`} className="flex justify-between rounded px-1 py-1 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><span>{item.numero ?? "Brouillon"}</span><span className="font-mono">{euros(item.montant_ttc)}</span><span className="text-xs" style={{ color: st.couleur }}>{st.libelle}</span></Link>; }) : <p className="text-sm text-neutral-500">Aucune facture.</p>}</div>
          </div>
        </section>}
        {peutVoirAchats&&<section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Factures fournisseurs du chantier</h2><p className="text-sm text-neutral-500">Achats, matériaux et frais directement classés dans ce chantier.</p></div><Link href={`/depenses?chantier=${id}`} className="rounded-md border px-3 py-2 text-sm font-medium">+ Nouvelle facture fournisseur</Link></div>
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded border p-3 text-sm"><span className="text-neutral-500">Total TTC</span><strong className="block font-mono">{euros(totalFacturesFournisseurs)}</strong></div><div className="rounded border p-3 text-sm"><span className="text-neutral-500">Réglé</span><strong className="block font-mono text-green-700">{euros(totalRegleFournisseurs)}</strong></div><div className="rounded border p-3 text-sm"><span className="text-neutral-500">Reste à payer</span><strong className="block font-mono text-amber-700">{euros(Math.max(0,totalFacturesFournisseurs-totalRegleFournisseurs))}</strong></div></div>
          <div className="divide-y dark:divide-neutral-800">{(facturesFournisseurs??[]).map(item=>{const fournisseur=relation(item.fournisseur as {nom:string}|{nom:string}[]|null);const statut=DEPENSE_STATUTS[item.statut];return <Link key={item.id} href={`/depenses/${item.id}`} className="grid gap-1 py-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4"><div><strong>{item.numero_piece}</strong><p className="text-xs text-neutral-500">{fournisseur?.nom??"Fournisseur"} · {DEPENSE_CATEGORIES[item.categorie]??item.categorie} · {item.date_piece}</p></div><span className="text-xs" style={{color:statut?.couleur}}>{statut?.label??item.statut}</span><span className="font-mono font-semibold">{euros(item.montant_ttc)}</span></Link>})}{!(facturesFournisseurs??[]).length&&<p className="rounded border border-dashed p-4 text-sm text-neutral-500">Aucune facture fournisseur classée dans ce chantier.</p>}</div>
          {peutGererAchats&&(facturesSansChantier??[]).length>0&&<form action={classerFactureDepuisChantierAction.bind(null,id)} className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end"><label className="flex-1 text-xs text-neutral-500">Classer une facture sans chantier<select name="depense_id" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"><option value="">— Choisir une facture fournisseur —</option>{(facturesSansChantier??[]).map(item=>{const fournisseur=relation(item.fournisseur as {nom:string}|{nom:string}[]|null);return <option key={item.id} value={item.id}>{item.numero_piece} · {fournisseur?.nom??"Fournisseur"} · {euros(item.montant_ttc)}</option>})}</select></label><button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Classer ici</button></form>}
        </section>}
        {!peutVoirFinances&&peutVoirHeures&&<section className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border p-4"><p className="text-xs text-neutral-500">Heures planifiées</p><strong>{totalHeures} h</strong></div><div className="rounded-md border p-4"><p className="text-xs text-neutral-500">Heures pointées validées</p><strong>{totalHeuresRealisees} h</strong></div></section>}
        {peutVoirHeures&&<section><h2 className="mb-3 text-sm font-semibold">Intervenants et heures réalisées</h2><div className="space-y-2">{pointagesValides.map(p=>{const e=relation(p.employe as {prenom:string;nom:string}|{prenom:string;nom:string}[]|null);return <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><div><strong>{e?`${e.prenom} ${e.nom}`:"Employé"}</strong><p className="text-xs text-neutral-500">{p.date}{p.tache?` · ${p.tache}`:""}</p></div><span className="font-mono font-semibold">{Number(p.heures_normales)+Number(p.heures_supplementaires)} h</span></div>})}{!pointagesValides.length&&<p className="rounded border border-dashed p-4 text-sm text-neutral-500">Aucune heure validée pour ce chantier.</p>}</div></section>}

        <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Tâches</h2>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {taches && taches.length > 0 ? (
              taches.map((t) => (
                <TacheItem
                  key={t.id}
                  tacheId={t.id}
                  chantierId={id}
                  libelle={t.libelle}
                  description={t.description}
                  echeance={t.echeance}
                  fait={t.statut === "fait"}
                  modifiable={peutGerer}
                />
              ))
            ) : (
              <p className="py-1 text-sm text-neutral-500">Aucune tâche.</p>
            )}
          </div>
          {peutGerer&&<form action={ajouterTache} className="flex flex-col gap-2 pt-2 sm:flex-row">
            <input
              name="libelle"
              required
              placeholder="Nouvelle tâche…"
              className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <input
              name="echeance"
              type="date"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
              Ajouter
            </button>
          </form>}
        </section>
      </div>
    </main>
  );
}
