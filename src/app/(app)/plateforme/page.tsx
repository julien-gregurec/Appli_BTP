import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { estPlateformeAdmin, statutAbonnement, prixAbonnementMensuel, offreParCle, REDUCTION_ANNUELLE, type EntrepriseAbonnement } from "@/lib/plateforme";
import { ajouterAdminPlateformeAction, creerEntreprisePlateformeAction, entrerEntreprisePlateformeAction, enregistrerReglementPlateformeAction, genererSnapshotFacturationAction, modifierAbonnementAction, modifierTarifPostePlateformeAction, retirerAdminPlateformeAction, signalerImpayePlateformeAction } from "@/app/actions/plateforme";
import { AbonnementCountdown } from "@/components/AbonnementCountdown";

type MembrePlateforme = { email: string; role: string; nom: string | null; ajoute_par: string | null; created_at: string };
const ROLE_LABEL: Record<string, string> = { total: "Accès total", support: "Support", facturation: "Facturation", lecture: "Lecture seule" };

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function PlateformePage({ searchParams }: { searchParams: Promise<{ succes?: string; error?: string }> }) {
  if (!(await estPlateformeAdmin())) notFound();
  const msg = await searchParams;
  const supabase = await createClient();

  let entreprises: EntrepriseAbonnement[] = [];
  let appareilsParEntreprise = new Map<string,{nb_appareils_actifs:number;nb_comptes_plus_de_deux:number;maximum_appareils_compte:number;montant_depassements_ht:number}>();
  let tarifsPostes: { entreprise_id: string; poste_id: string; nom: string; code_offre: string; tarif_compte_mensuel: number; nb_comptes_facturables: number }[] = [];
  if (isEmailLoginDisabled()) {
    const { data: ents } = await supabase
      .from("entreprises")
      .select("id, nom, code_adhesion, reference_interne, abonnement_statut, abonnement_echeance, abonnement_note, impaye_signale_at, suspension_prevue_at, impaye_message, dernier_reglement_at, created_at")
      .order("created_at", { ascending: false });
    const { data: membres } = await supabase.from("utilisateurs_entreprises").select("entreprise_id, statut");
    const { data: employes } = await supabase.from("employes").select("entreprise_id, poste_id, statut, compte_application_statut, utilisateur_id, invitation_envoyee_at, application_installee_at, derniere_connexion_at");
    const { data: droits } = await supabase.from("permissions_poste").select("entreprise_id, cle_permission, autorise").eq("autorise", true).like("cle_permission", "acces_%");
    const { data: postes } = await supabase.from("postes").select("id,entreprise_id,nom,code_offre,tarif_compte_mensuel").order("nom");
    const { data: besoins } = await supabase.from("entreprise_besoins").select("entreprise_id,offre_recommandee");
    entreprises = (ents ?? []).map((e) => ({
      ...e,
      nb_membres: (membres ?? []).filter((m) => m.entreprise_id === e.id).length,
      nb_membres_actifs: (membres ?? []).filter((m) => m.entreprise_id === e.id && m.statut === "actif").length,
      nb_fiches_employes: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.statut !== "sorti").length,
      nb_comptes_actives: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.compte_application_statut === "actif").length,
      nb_comptes_pause: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.compte_application_statut === "pause").length,
      nb_comptes_facturables: (employes ?? []).filter((item) => item.entreprise_id === e.id && ["actif", "pause"].includes(item.compte_application_statut ?? "")).length,
      nb_invitations_envoyees: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.invitation_envoyee_at).length,
      nb_applications_installees: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.application_installee_at).length,
      nb_connectes_30j: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.derniere_connexion_at && new Date(item.derniere_connexion_at).getTime() >= Date.now() - 30 * 86400000).length,
      derniere_connexion: (employes ?? []).filter((item) => item.entreprise_id === e.id && item.derniere_connexion_at).map((item) => item.derniere_connexion_at as string).sort().at(-1) ?? null,
      options_actives: [...new Set((droits ?? []).filter((item) => item.entreprise_id === e.id).map((item) => item.cle_permission.replace("acces_", "")))].sort(),
      offre_recommandee: (besoins ?? []).find((item) => item.entreprise_id === e.id)?.offre_recommandee ?? "essentiel",
    })) as EntrepriseAbonnement[];
    tarifsPostes = (postes ?? []).map((poste) => ({ entreprise_id: poste.entreprise_id, poste_id: poste.id, nom: poste.nom, code_offre: poste.code_offre, tarif_compte_mensuel: Number(poste.tarif_compte_mensuel), nb_comptes_facturables: (employes ?? []).filter((employe) => employe.entreprise_id === poste.entreprise_id && employe.poste_id === poste.id && ["actif", "pause"].includes(employe.compte_application_statut ?? "")).length }));
    const{data:appareils}=await supabase.from("appareils_comptes").select("entreprise_id,utilisateur_id,revoque_at").is("revoque_at",null);
    for(const entreprise of entreprises){const actifs=(appareils??[]).filter(a=>a.entreprise_id===entreprise.id),comptes=new Map<string,number>();for(const appareil of actifs)comptes.set(appareil.utilisateur_id,(comptes.get(appareil.utilisateur_id)??0)+1);const utilisateursDepasses=[...comptes.entries()].filter(([,nombre])=>nombre>2).map(([utilisateurId])=>utilisateurId);const montantDepassements=utilisateursDepasses.reduce((total,utilisateurId)=>{const employe=(employes??[]).find(item=>item.entreprise_id===entreprise.id&&item.utilisateur_id===utilisateurId);const poste=(postes??[]).find(item=>item.id===employe?.poste_id);return total+Number(poste?.tarif_compte_mensuel??0);},0);appareilsParEntreprise.set(entreprise.id,{nb_appareils_actifs:actifs.length,nb_comptes_plus_de_deux:utilisateursDepasses.length,maximum_appareils_compte:Math.max(0,...comptes.values()),montant_depassements_ht:montantDepassements});}
  } else {
    const [{ data }, { data: usages }, { data: tarifs }, { data: besoins },{data:usageAppareils}] = await Promise.all([supabase.rpc("plateforme_entreprises"), supabase.rpc("plateforme_usage_entreprises"), supabase.rpc("plateforme_postes_tarifs"), supabase.rpc("plateforme_besoins"),supabase.rpc("plateforme_usage_appareils")]);
    const usageParEntreprise = new Map<string, Partial<EntrepriseAbonnement>>(((usages ?? []) as Array<Partial<EntrepriseAbonnement> & { entreprise_id: string }>).map((usage) => [usage.entreprise_id, usage]));
    const offreParEntreprise = new Map<string, string>(((besoins ?? []) as Array<{entreprise_id:string;offre_recommandee:string|null}>).map((besoin) => [besoin.entreprise_id, besoin.offre_recommandee ?? "essentiel"]));
    entreprises = ((data ?? []) as EntrepriseAbonnement[]).map((entreprise) => ({ ...entreprise, ...(usageParEntreprise.get(entreprise.id) ?? {}), offre_recommandee: offreParEntreprise.get(entreprise.id) ?? "essentiel" }));
    tarifsPostes = (tarifs ?? []) as typeof tarifsPostes;
    appareilsParEntreprise=new Map(((usageAppareils??[])as Array<{entreprise_id:string;nb_appareils_actifs:number;nb_comptes_plus_de_deux:number;maximum_appareils_compte:number;montant_depassements_ht:number}>).map(usage=>[usage.entreprise_id,{nb_appareils_actifs:Number(usage.nb_appareils_actifs),nb_comptes_plus_de_deux:Number(usage.nb_comptes_plus_de_deux),maximum_appareils_compte:Number(usage.maximum_appareils_compte),montant_depassements_ht:Number(usage.montant_depassements_ht)}]));
  }

  let membresPlateforme: MembrePlateforme[] = [];
  if (isEmailLoginDisabled()) {
    const { data } = await supabase.from("plateforme_admins").select("email, role, nom, ajoute_par, created_at").order("created_at");
    membresPlateforme = (data ?? []) as MembrePlateforme[];
  } else {
    const { data } = await supabase.rpc("plateforme_lister_admins");
    membresPlateforme = (data ?? []) as MembrePlateforme[];
  }

  const parStatut = (cle: string) => entreprises.filter((e) => e.abonnement_statut === cle).length;
  const impayes = entreprises.filter((e) => Boolean(e.suspension_prevue_at)).length;
  const alertesAppareils=[...appareilsParEntreprise.values()].reduce((total,usage)=>total+usage.nb_comptes_plus_de_deux,0);
  const revenuMensuelRecurrent = entreprises.filter((e)=>e.abonnement_statut==="actif").reduce((total,e)=>{
    const comptes=e.nb_comptes_facturables??e.nb_comptes_actives??e.nb_membres_actifs;
    const offre=offreParCle(e.abonnement_offre??e.offre_recommandee??"essentiel");
    const appareils=appareilsParEntreprise.get(e.id)?.montant_depassements_ht??0;
    const mensuel=prixAbonnementMensuel(comptes,offre,appareils).total;
    return total+mensuel*(e.abonnement_periodicite==="annuel"?1-REDUCTION_ANNUELLE:1);
  },0);

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
          <h1 className="text-xl font-semibold">Plateforme — entreprises clientes</h1>
          <p className="text-sm text-neutral-500">
            Vue réservée au propriétaire. Chaque entreprise possède un code et un statut d&apos;abonnement à gérer.
          </p>
          </div>
          <div className="flex gap-2">
            <Link href="/plateforme/roles-demo" className="rounded-md border px-3 py-2 text-sm font-medium">Rôles de démonstration</Link>
            <Link href="/plateforme/support" className="rounded-md border px-3 py-2 text-sm font-medium">Support</Link>
            <Link href="/plateforme/facturation" className="rounded-md border px-3 py-2 text-sm font-medium">Relevés de facturation</Link>
          </div>
        </div>

        {msg.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
        {msg.succes && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{msg.succes}</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {[
            { label: "Entreprises", valeur: entreprises.length },
            { label: "Actives", valeur: parStatut("actif") },
            { label: "En essai", valeur: parStatut("essai") },
            { label: "Suspendues", valeur: parStatut("suspendu") },
            { label: "Impayés à suivre", valeur: impayes },
            { label: "Alertes appareils", valeur: alertesAppareils },
            { label: "MRR HT", valeur: `${revenuMensuelRecurrent.toLocaleString("fr-FR",{maximumFractionDigits:0})} €` },
            { label: "ARR HT", valeur: `${(revenuMensuelRecurrent*12).toLocaleString("fr-FR",{maximumFractionDigits:0})} €` },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="text-xs uppercase text-neutral-500">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold">{s.valeur}</div>
            </div>
          ))}
        </div>
        <form action={creerEntreprisePlateformeAction} className="grid gap-2 rounded-md border p-4 sm:grid-cols-[2fr_1fr_1fr_auto]"><div className="sm:col-span-4"><h2 className="font-semibold">Ajouter une entreprise cliente</h2><p className="text-xs text-neutral-500">L’entreprise est créée en essai avec ses postes de départ. Son administrateur pourra ensuite être invité.</p></div><input name="nom" required placeholder="Nom de l’entreprise" className={input}/><input name="siret" placeholder="SIRET" className={input}/><input name="ville" placeholder="Ville" className={input}/><button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Créer</button></form>
        <form action={genererSnapshotFacturationAction} className="flex flex-wrap items-end gap-3 rounded-md border border-blue-200 bg-blue-50/50 p-4"><div className="flex-1"><h2 className="font-semibold">Relevé mensuel des comptes facturables</h2><p className="text-xs text-neutral-500">Les comptes actifs et en pause sont figés avec le tarif de leur poste pour le mois choisi.</p></div><label className="text-xs text-neutral-500">Mois<input name="mois" type="month" defaultValue={new Date().toISOString().slice(0,7)} className={`${input} mt-1 block`}/></label><button className="rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white">Générer le relevé</button></form>

        <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="font-semibold">Équipe plateforme</h2>
          <p className="text-xs text-neutral-500">Les collaborateurs LIRIA qui peuvent assister toutes les entreprises. Accès total pour l&apos;instant ; les niveaux d&apos;accès seront affinés ensuite.</p>
          <ul className="mt-3 space-y-2">
            {membresPlateforme.map((m) => (
              <li key={m.email} className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-100 p-2 text-sm dark:border-neutral-800">
                <div>
                  <strong>{m.nom || m.email}</strong>
                  {m.nom && <span className="ml-2 text-neutral-500">{m.email}</span>}
                  <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{ROLE_LABEL[m.role] ?? m.role}</span>
                </div>
                <form action={retirerAdminPlateformeAction}>
                  <input type="hidden" name="email" value={m.email} />
                  <button className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">Retirer</button>
                </form>
              </li>
            ))}
            {membresPlateforme.length === 0 && <li className="text-sm text-neutral-500">Aucun membre listé.</li>}
          </ul>
          <form action={ajouterAdminPlateformeAction} className="mt-3 grid gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
            <input name="email" type="email" required placeholder="email@liria.fr" className={input} />
            <input name="nom" placeholder="Nom (optionnel)" className={input} />
            <select name="role" className={input} defaultValue="total">
              <option value="total">Accès total</option>
              <option value="support">Support</option>
              <option value="facturation">Facturation</option>
              <option value="lecture">Lecture seule</option>
            </select>
            <button className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Ajouter</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">Après ajout : créez le compte de connexion dans Supabase (Authentication → Add user) avec le même email, puis communiquez le mot de passe au collaborateur.</p>
        </section>

        <div className="space-y-3">
          {entreprises.map((e) => {
            const st = statutAbonnement(e.abonnement_statut);
            const action = modifierAbonnementAction.bind(null, e.id);
            const comptesFacturables = e.nb_comptes_facturables ?? e.nb_comptes_actives ?? e.nb_membres_actifs;
            const offre = offreParCle(e.abonnement_offre ?? e.offre_recommandee ?? "essentiel");
            const usageAppareils=appareilsParEntreprise.get(e.id)??{nb_appareils_actifs:0,nb_comptes_plus_de_deux:0,maximum_appareils_compte:0,montant_depassements_ht:0};
            const prix = prixAbonnementMensuel(comptesFacturables, offre, usageAppareils.montant_depassements_ht);
            return (
              <article key={e.id} className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold">{e.nom}</h2>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                        <span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />{st.libelle}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Code <span className="font-mono tracking-widest">{e.code_adhesion ?? "—"}</span>
                      {e.reference_interne && <> · {e.reference_interne}</>}
                      {" · "}{e.nb_membres_actifs}/{e.nb_membres} membre(s) actif(s)
                      {" · créée le "}{new Date(e.created_at).toLocaleDateString("fr-FR")}
                    </p>
                    <div className="mt-2 inline-flex items-baseline gap-2 rounded-md bg-[#c9a24a]/10 px-3 py-1.5">
                      <span className="text-lg font-semibold text-[#0d1b2a] dark:text-[#c9a24a]">{prix.total} €<span className="text-xs font-normal">/mois</span></span>
                      <span className="text-[11px] text-neutral-500">
                        offre {offre.nom} {prix.base} € (jusqu&apos;à {prix.employesInclus} comptes){prix.employesSupplementaires > 0 ? ` + ${prix.employesSupplementaires} × ${prix.parEmployeSup} €` : ""}{prix.supplementAppareils > 0 ? ` + ${prix.supplementAppareils.toLocaleString("fr-FR")} € appareils` : ""}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                      <p className="rounded bg-neutral-50 px-2 py-1.5 dark:bg-neutral-900"><strong className="block text-base">{e.nb_fiches_employes ?? 0}</strong> employés facturables</p>
                      <p className="rounded bg-blue-50 px-2 py-1.5 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><strong className="block text-base">{e.nb_comptes_facturables ?? e.nb_comptes_actives ?? 0}</strong> comptes facturables{e.nb_comptes_pause ? ` · ${e.nb_comptes_pause} en pause` : ""}</p>
                      <p className="rounded bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><strong className="block text-base">{e.nb_invitations_envoyees ?? 0}</strong> invitations</p>
                      <p className="rounded bg-green-50 px-2 py-1.5 text-green-900 dark:bg-green-950/30 dark:text-green-200"><strong className="block text-base">{e.nb_connectes_30j ?? 0}</strong> connectés · 30 j</p>
                      <p className="rounded bg-violet-50 px-2 py-1.5 text-violet-900 dark:bg-violet-950/30 dark:text-violet-200"><strong className="block text-base">{e.nb_applications_installees ?? 0}</strong> installations</p>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">Options utilisées : {e.options_actives?.length ? e.options_actives.join(", ") : "aucune"}{e.derniere_connexion ? ` · dernière connexion ${new Date(e.derniere_connexion).toLocaleString("fr-FR")}` : ""}</p>
                    <div className={`mt-2 rounded-md border p-3 text-sm ${usageAppareils.nb_comptes_plus_de_deux>0?"border-red-300 bg-red-50 text-red-900":"border-green-200 bg-green-50 text-green-900"}`}><strong>{usageAppareils.nb_appareils_actifs} appareil(s) actif(s)</strong><span className="ml-2 text-xs">2 appareils inclus par compte</span>{usageAppareils.nb_comptes_plus_de_deux>0&&<p className="mt-1 font-semibold">⚠ {usageAppareils.nb_comptes_plus_de_deux} compte(s) dépassent la limite · {usageAppareils.montant_depassements_ht.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})} HT/mois ajouté(s) au tarif de leur poste · maximum observé : {usageAppareils.maximum_appareils_compte}</p>}</div>
                    <p className="mt-2 text-sm font-semibold">Prix automatique mensuel : {prix.total.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})} HT</p>
                    {e.stripe_subscription_id&&<div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="rounded bg-green-50 px-2 py-1 font-medium text-green-800">Stripe Billing relié · {e.abonnement_periodicite??"périodicité inconnue"}</span>{e.derniere_facture_url&&<Link href={e.derniere_facture_url} target="_blank" rel="noreferrer" className="underline">Dernière facture ({e.derniere_facture_statut??"statut inconnu"})</Link>}{e.abonnement_essai_fin&&<span>fin d’essai {new Date(e.abonnement_essai_fin).toLocaleDateString("fr-FR")}</span>}</div>}
                    <details className="mt-3 rounded border bg-neutral-50 p-3 dark:bg-neutral-900"><summary className="cursor-pointer text-sm font-semibold">Tarifs par poste</summary><div className="mt-3 space-y-2">{tarifsPostes.filter((poste) => poste.entreprise_id === e.id).map((poste) => <form key={poste.poste_id} action={modifierTarifPostePlateformeAction.bind(null, poste.poste_id)} className="grid items-end gap-2 text-sm sm:grid-cols-[1fr_130px_130px_auto]"><div><strong>{poste.nom}</strong><p className="text-xs text-neutral-500">{poste.nb_comptes_facturables} compte(s) facturable(s)</p></div><label className="text-xs text-neutral-500">Offre<input name="code_offre" defaultValue={poste.code_offre} className={`${input} mt-1 w-full`}/></label><label className="text-xs text-neutral-500">€/compte/mois<input name="tarif" type="number" min="0" step="0.01" defaultValue={poste.tarif_compte_mensuel} className={`${input} mt-1 w-full`}/></label><button className="rounded border px-3 py-2">Enregistrer</button></form>)}</div></details>
                  </div>
                </div>

                {e.suspension_prevue_at?<section className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Règlement non reçu — suspension automatique dans <AbonnementCountdown echeance={e.suspension_prevue_at}/></p><p className="mt-1 text-xs">Échéance : {new Date(e.suspension_prevue_at).toLocaleString("fr-FR")}{e.impaye_message?` · ${e.impaye_message}`:""}</p></div><form action={enregistrerReglementPlateformeAction.bind(null,e.id)} className="flex gap-2"><input name="note" placeholder="Référence du règlement" className={input}/><button className="rounded-md bg-green-700 px-3 py-2 text-xs font-semibold text-white">Règlement reçu</button></form></div></section>:<form action={signalerImpayePlateformeAction.bind(null,e.id)} className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20"><label className="min-w-[240px] flex-1 text-xs text-neutral-600">Message destiné à l’administrateur<input name="message" defaultValue="Règlement mensuel non reçu" className={`${input} mt-1 w-full`}/></label><button className="rounded-md border border-amber-700 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200">Signaler l’impayé · délai 10 jours</button></form>}

                <form action={entrerEntreprisePlateformeAction.bind(null,e.id)} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20"><label className="min-w-[240px] flex-1 text-xs text-neutral-600 dark:text-neutral-300">Motif obligatoire de l’intervention<input name="motif" required minLength={5} placeholder="Ex. Assistance au paramétrage demandée par le client" className={`${input} mt-1 w-full`}/></label><button className="rounded-md bg-blue-900 px-3 py-2 text-xs font-semibold text-white">Accéder comme administrateur</button><p className="w-full text-[11px] text-neutral-500">L’entrée et la sortie sont journalisées. Ce compte plateforme n’est pas ajouté aux salariés facturables.</p></form>

                <form action={action} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <div className="space-y-1">
                    <label className="text-xs text-neutral-500">Statut</label>
                    <select name="statut" defaultValue={e.abonnement_statut} className={input}>
                      <option value="essai">Essai</option>
                      <option value="actif">Actif</option>
                      <option value="suspendu">Suspendu</option>
                      <option value="annule">Annulé</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-neutral-500">Échéance</label>
                    <input name="echeance" type="date" defaultValue={e.abonnement_echeance ?? ""} className={input} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-neutral-500">Note</label>
                    <input name="note" defaultValue={e.abonnement_note ?? ""} placeholder="tarif, contact…" className={input + " w-full"} />
                  </div>
                  <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
                    Enregistrer
                  </button>
                </form>
              </article>
            );
          })}
          {entreprises.length === 0 && (
            <p className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
              Aucune entreprise inscrite pour l&apos;instant.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
