import Link from "next/link";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { euros, statutDevis } from "@/lib/devis";
import { statutChantier } from "@/lib/chantier-statuts";
import { permissionsUtilisateur } from "@/lib/permissions";
import { PointageArriveeDepart } from "@/components/PointageArriveeDepart";
import { MobileModuleGrid, type MobileModuleLink } from "@/components/MobileModuleGrid";
import { DashboardAnalytics } from "@/components/DashboardAnalytics";
import { DashboardWidget, DashboardWidgetPreferences } from "@/components/DashboardWidgets";

function un<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null;
  return Array.isArray(valeur) ? valeur[0] ?? null : valeur;
}

export default async function DashboardPage() {
  const ctx = await getContexteEntreprise();
  const permissions = await permissionsUtilisateur(ctx);
  const supabase = await createClient();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const autorise = (cle: string) => permissions === null || permissions.includes(cle);
  const voirVueEnsembleChantiers = permissions === null || permissions.includes("gerer_chantiers") || permissions.includes("voir_heures_chantiers");
  const voir = {
    devis: autorise("acces_devis"), factures: autorise("acces_factures"), chantiers: autorise("acces_chantiers") && voirVueEnsembleChantiers,
    planning: autorise("acces_planning"), stock: autorise("acces_stock"), flotte: autorise("acces_flotte"),
    outillage: autorise("acces_outillage"), achats: autorise("acces_achats"), pointage: autorise("acces_pointage"),
  };
  // En mode prototype aucune identité individuelle n'est fiable : les chiffres globaux
  // restent masqués. En authentification réelle, ils exigent un droit dédié.
  const voirIndicateursFinanciers = permissions !== null && permissions.includes("voir_indicateurs_financiers");
  const peutPointer = permissions !== null && permissions.includes("saisir_son_pointage");
  const peutGererPlanning = permissions === null || permissions.includes("gerer_planning");
  const auMoinsUnModule = permissions === null || permissions.some((cle) => cle.startsWith("acces_"));
  const raccourcis = ([
    { permission: null, href: "/mon-espace", label: "Mon espace", icon: "profil" },
    { permission: "voir_devis_chantier_sans_prix", href: "/mes-travaux", label: "Mes travaux", icon: "travaux" },
    { permission: "acces_pointage", href: "/pointage", label: "Pointage", icon: "pointage" },
    { permission: "acces_planning", href: "/planning", label: "Planning", icon: "planning" },
    ...(voirVueEnsembleChantiers ? [{ permission: "acces_chantiers", href: "/chantiers", label: "Chantiers", icon: "chantiers" as const }] : []),
    { permission: "acces_employes", href: "/employes", label: "Employés", icon: "employes" },
    { permission: "acces_clients", href: "/clients", label: "Clients", icon: "clients" },
    { permission: "acces_devis", href: "/devis", label: "Devis", icon: "devis" },
    { permission: "acces_factures", href: "/factures", label: "Factures", icon: "factures" },
    { permission: "acces_facturation_avancee", href: "/facturation-avancee", label: "Situations", icon: "facturation" },
    { permission: "acces_ouvrages", href: "/ouvrages", label: "Ouvrages", icon: "ouvrages" },
    { permission: "acces_interventions", href: "/interventions", label: "Interventions", icon: "interventions" },
    { permission: "acces_crm", href: "/crm", label: "CRM", icon: "crm" },
    { permission: "acces_achats", href: "/commandes", label: "Achats", icon: "achats" },
    { permission: "acces_stock", href: "/stock", label: "Stock", icon: "stock" },
    { permission: "acces_flotte", href: "/flotte", label: "Flotte", icon: "flotte" },
    { permission: "acces_outillage", href: "/outillage", label: "Outillage", icon: "outillage" },
    { permission: "saisir_ses_notes_frais", href: "/notes-frais", label: "Notes de frais", icon: "frais" },
    { permission: "demander_ses_conges", href: "/conges", label: "Congés", icon: "conges" },
    { permission: "acces_rentabilite", href: "/rentabilite", label: "Rentabilité", icon: "rentabilite" },
    { permission: "acces_exports", href: "/exports", label: "Exports", icon: "exports" },
    { permission: "acces_connecteurs", href: "/connecteurs", label: "Connecteurs", icon: "connecteurs" },
    { permission: "acces_parametres", href: "/parametres", label: "Paramètres", icon: "parametres" },
  ] as Array<MobileModuleLink & { permission: string | null }>).filter((module) => module.permission === null || autorise(module.permission));

  const { data: employeCompte } = permissions !== null && (peutPointer || voir.planning)
    ? await supabase.from("employes").select("id,prenom,nom").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).eq("statut", "actif").maybeSingle()
    : { data: null };
  let requeteAffectations = supabase.from("affectations").select("id, date, heures, tache, chantier:chantiers(nom), employe:employes(prenom, nom)").eq("entreprise_id", ctx.entrepriseId).gte("date", aujourdhui).order("date").limit(6);
  if (permissions !== null && !peutGererPlanning) requeteAffectations = requeteAffectations.eq("employe_id", employeCompte?.id ?? "00000000-0000-0000-0000-000000000000");

  const [devisResult, facturesResult, chantiersResult, affectationsResult, articlesResult, vehiculesResult, outilsResult, commandesResult, chantiersPointageResult, sessionsPointageResult] = await Promise.all([
    voir.devis ? supabase.from("devis").select("id, numero, statut, montant_ttc, date_emission, date_validite, client:clients(nom, prenom, societe)").eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }) : null,
    voir.factures ? supabase.from("factures").select("id, numero, statut, date_emission, date_echeance, montant_ttc, montant_paye, client:clients(nom, prenom, societe)").eq("entreprise_id", ctx.entrepriseId) : null,
    voir.chantiers ? supabase.from("chantiers").select("id, nom, statut").eq("entreprise_id", ctx.entrepriseId).order("updated_at", { ascending: false }) : null,
    voir.planning ? requeteAffectations : null,
    voir.stock ? supabase.from("articles_stock").select("id, reference, designation, quantite_stock, seuil_alerte, unite").eq("entreprise_id", ctx.entrepriseId).eq("actif", true) : null,
    voir.flotte ? supabase.from("vehicules").select("id, immatriculation, marque, modele, kilometrage, controle_technique_echeance, assurance_echeance, prochain_entretien_date, prochain_entretien_km").eq("entreprise_id", ctx.entrepriseId).in("statut", ["actif", "maintenance"]) : null,
    voir.outillage ? supabase.from("outils").select("id, reference, designation, prochaine_verification").eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(hors_service,perdu)") : null,
    voir.achats ? supabase.from("commandes_fournisseurs").select("id, numero, statut, date_livraison_prevue, fournisseur:fournisseurs(nom)").eq("entreprise_id", ctx.entrepriseId).in("statut", ["envoyee", "confirmee", "recue_partiel"]) : null,
    peutPointer && employeCompte ? supabase.from("chantiers").select("id,nom").eq("entreprise_id",ctx.entrepriseId).not("statut","in",'(archive,annule)').order("nom") : null,
    peutPointer && employeCompte ? supabase.from("sessions_pointage").select("id,arrivee_at,tache,employe:employes(id,prenom,nom),chantier:chantiers(id,nom)").eq("entreprise_id",ctx.entrepriseId).eq("employe_id",employeCompte.id).is("depart_at",null).order("arrivee_at",{ascending:false}) : null,
  ]);
  const devis = devisResult?.data ?? [], factures = facturesResult?.data ?? [], chantiers = chantiersResult?.data ?? [];
  const affectations = affectationsResult?.data ?? [], articles = articlesResult?.data ?? [], vehicules = vehiculesResult?.data ?? [];
  const outils = outilsResult?.data ?? [], commandes = commandesResult?.data ?? [];
  const chantiersPointage = chantiersPointageResult?.data ?? [], sessionsPointage = sessionsPointageResult?.data ?? [];
  const {data:notifications}=permissions!==null?await supabase.from("notifications_utilisateurs").select("id,titre,message,lien,niveau,created_at").eq("entreprise_id",ctx.entrepriseId).is("lue_at",null).order("created_at",{ascending:false}).limit(8):{data:[]};

  const totalFacture = (factures ?? []).filter((f) => f.statut !== "annulee").reduce((s, f) => s + Number(f.montant_ttc ?? 0), 0);
  const totalEncaisse = (factures ?? []).reduce((s, f) => s + Number(f.montant_paye ?? 0), 0);
  const resteAEncaisser = Math.max(0, totalFacture - totalEncaisse);
  const devisAcceptes = (devis ?? []).filter((d) => d.statut === "accepte").reduce((s, d) => s + Number(d.montant_ttc ?? 0), 0);
  const statutsActifs = ["accepte", "a_preparer", "en_attente_validation", "en_commande_materiel", "en_cours", "en_pause"];
  const chantiersActifs = (chantiers ?? []).filter((c) => statutsActifs.includes(c.statut));
  const devisASuivre = (devis ?? []).filter((d) => ["brouillon", "envoye"].includes(d.statut)).slice(0, 5);
  type Alerte = { id: string; domaine: string; niveau: "critique" | "attention"; titre: string; detail: string; href: string; date?: string };
  const alertes: Alerte[] = [];
  const joursAvant = (date: string) => Math.round((Date.parse(`${date}T12:00:00`) - Date.parse(`${aujourdhui}T12:00:00`)) / 86_400_000);
  const ajouterEcheance = (alerte: Omit<Alerte, "niveau">, date: string, anticipation = 30) => {
    const jours = joursAvant(date);
    if (jours <= anticipation) alertes.push({ ...alerte, date, niveau: jours <= 0 ? "critique" : "attention" });
  };

  for (const facture of factures ?? []) {
    if (facture.date_echeance && !["payee", "annulee", "avoir_emis"].includes(facture.statut)) {
      const client = un(facture.client);
      ajouterEcheance({ id: `facture-${facture.id}`, domaine: "Facturation", titre: `${facture.numero ?? "Facture"} à encaisser`, detail: voirIndicateursFinanciers ? `${client?.societe || [client?.prenom, client?.nom].filter(Boolean).join(" ") || "Client"} · reste ${euros(Number(facture.montant_ttc) - Number(facture.montant_paye))}` : `${client?.societe || [client?.prenom, client?.nom].filter(Boolean).join(" ") || "Client"} · échéance de règlement`, href: `/factures/${facture.id}` }, facture.date_echeance, 7);
    }
  }
  for (const itemDevis of devis ?? []) {
    if (itemDevis.date_validite && itemDevis.statut === "envoye") ajouterEcheance({ id: `devis-${itemDevis.id}`, domaine: "Commercial", titre: `${itemDevis.numero ?? "Devis"} arrive à expiration`, detail: voirIndicateursFinanciers ? `Montant ${euros(itemDevis.montant_ttc)}` : "Validité à contrôler", href: `/devis/${itemDevis.id}` }, itemDevis.date_validite, 7);
  }
  for (const article of articles ?? []) {
    const stock = Number(article.quantite_stock), seuil = Number(article.seuil_alerte);
    if (stock <= seuil) alertes.push({ id: `stock-${article.id}`, domaine: "Stock", niveau: stock <= 0 ? "critique" : "attention", titre: `${article.reference} · ${article.designation}`, detail: `${stock} ${article.unite} disponible(s), seuil ${seuil}`, href: "/stock" });
  }
  for (const vehicule of vehicules ?? []) {
    const nom = `${vehicule.immatriculation} · ${vehicule.marque} ${vehicule.modele}`;
    if (vehicule.controle_technique_echeance) ajouterEcheance({ id: `ct-${vehicule.id}`, domaine: "Flotte", titre: `Contrôle technique · ${nom}`, detail: "Échéance réglementaire", href: `/flotte/${vehicule.id}` }, vehicule.controle_technique_echeance);
    if (vehicule.assurance_echeance) ajouterEcheance({ id: `assurance-${vehicule.id}`, domaine: "Flotte", titre: `Assurance · ${nom}`, detail: "Renouvellement à vérifier", href: `/flotte/${vehicule.id}` }, vehicule.assurance_echeance);
    if (vehicule.prochain_entretien_date) ajouterEcheance({ id: `entretien-date-${vehicule.id}`, domaine: "Flotte", titre: `Entretien · ${nom}`, detail: "Échéance calendrier", href: `/flotte/${vehicule.id}` }, vehicule.prochain_entretien_date);
    if (vehicule.prochain_entretien_km && Number(vehicule.kilometrage) >= Number(vehicule.prochain_entretien_km)) alertes.push({ id: `entretien-km-${vehicule.id}`, domaine: "Flotte", niveau: "critique", titre: `Entretien kilométrique · ${nom}`, detail: `${Number(vehicule.kilometrage).toLocaleString("fr-FR")} km relevés pour ${Number(vehicule.prochain_entretien_km).toLocaleString("fr-FR")} km prévus`, href: `/flotte/${vehicule.id}` });
  }
  for (const outil of outils ?? []) {
    if (outil.prochaine_verification) ajouterEcheance({ id: `outil-${outil.id}`, domaine: "Outillage", titre: `Vérification · ${outil.reference}`, detail: outil.designation, href: `/outillage/${outil.id}` }, outil.prochaine_verification);
  }
  for (const commande of commandes ?? []) {
    if (commande.date_livraison_prevue) {
      const fournisseur = un(commande.fournisseur);
      ajouterEcheance({ id: `commande-${commande.id}`, domaine: "Achats", titre: `Livraison ${commande.numero}`, detail: fournisseur?.nom ?? "Fournisseur", href: `/commandes/${commande.id}` }, commande.date_livraison_prevue, 3);
    }
  }
  const ordreNiveau = { critique: 0, attention: 1 };
  alertes.sort((a, b) => ordreNiveau[a.niveau] - ordreNiveau[b.niveau] || (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const nbCritiques = alertes.filter((a) => a.niveau === "critique").length;
  const domainesAlertes = [...new Set(alertes.map((a) => a.domaine))];
  const prenomAffiche = ctx.prenom && ctx.prenom.toLocaleLowerCase("fr") !== "prototype" ? ctx.prenom : null;
  const chantierGraphique = voir.chantiers ? [...new Set((chantiers ?? []).map((chantier) => chantier.statut))].map((statut) => {
    const presentation = statutChantier(statut);
    return { label: presentation.libelle, value: (chantiers ?? []).filter((chantier) => chantier.statut === statut).length, color: presentation.couleur };
  }) : undefined;
  const moisGraphique = voirIndicateursFinanciers && (voir.devis || voir.factures) ? Array.from({length:6},(_,index)=>{
    const date=new Date();date.setDate(1);date.setMonth(date.getMonth()-(5-index));
    const cle=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
    const label=new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(date).replace(".","");
    return {label,devis:(devis??[]).filter(item=>item.date_emission?.startsWith(cle)&&item.statut!=="annule").reduce((s,item)=>s+Number(item.montant_ttc),0),factures:(factures??[]).filter(item=>item.date_emission?.startsWith(cle)&&item.statut!=="annulee").reduce((s,item)=>s+Number(item.montant_ttc),0)};
  }) : undefined;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Bonjour{prenomAffiche ? ` ${prenomAffiche}` : ""}</h1>
          <p className="text-sm text-neutral-500">{ctx.entrepriseNom}</p>
        </div>

        <DashboardWidgetPreferences options={[
          ...((notifications??[]).length ? [{id:"notifications",label:"Notifications"}] : []),
          ...(raccourcis.length ? [{id:"modules",label:"Raccourcis modules"}] : []),
          ...((chantierGraphique || moisGraphique || (voirIndicateursFinanciers && voir.factures)) ? [{id:"analyses",label:"Graphiques et analyses"}] : []),
          ...(voirIndicateursFinanciers && (voir.factures || voir.devis) ? [{id:"indicateurs",label:"Indicateurs financiers"}] : []),
          ...((voir.devis || voir.chantiers) ? [{id:"suivi",label:"Devis et chantiers à suivre"}] : []),
          ...((voir.factures || voir.devis || voir.achats || voir.stock || voir.flotte || voir.outillage) ? [{id:"alertes",label:"Alertes opérationnelles"}] : []),
          ...(peutPointer && employeCompte ? [{id:"pointage",label:"Pointage rapide"}] : []),
          ...(voir.planning ? [{id:"planning",label:"Prochaines affectations"}] : []),
        ]}/>

        {(notifications??[]).length>0&&<DashboardWidget id="notifications"><section className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Mes notifications</h2><p className="text-xs text-neutral-500">Décisions, demandes et vérifications qui vous concernent.</p></div><span className="rounded-full bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white">{notifications?.length}</span></div><div className="grid gap-2 sm:grid-cols-2">{notifications?.map(notification=><Link key={notification.id} href={notification.lien??"/dashboard"} className={`rounded-lg border bg-white p-3 text-sm ${notification.niveau==="critique"?"border-red-400":notification.niveau==="attention"?"border-amber-300":"border-blue-200"}`}><strong>{notification.titre}</strong>{notification.message&&<p className="mt-1 text-xs text-neutral-600">{notification.message}</p>}</Link>)}</div></section></DashboardWidget>}

        {raccourcis.length > 0 && (
          <DashboardWidget id="modules"><MobileModuleGrid modules={raccourcis} /></DashboardWidget>
        )}

        {!auMoinsUnModule && <section className="rounded-md border border-dashed p-6 text-center"><h2 className="font-semibold">Aucun module attribué</h2><p className="mt-1 text-sm text-neutral-500">Un administrateur doit encore définir les accès de votre poste.</p></section>}

        {(chantierGraphique || moisGraphique || (voirIndicateursFinanciers && voir.factures)) && (
          <DashboardWidget id="analyses"><DashboardAnalytics
            chantiers={chantierGraphique}
            months={moisGraphique}
            finance={voirIndicateursFinanciers && voir.factures ? { facture: totalFacture, encaisse: totalEncaisse } : undefined}
          /></DashboardWidget>
        )}

        {voirIndicateursFinanciers && (voir.factures || voir.devis) && <DashboardWidget id="indicateurs"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {voir.factures && <><Link href="/factures" className="rounded-md border border-neutral-200 p-4 transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"><div className="text-xs text-neutral-500">Total facturé</div><div className="mt-1 font-mono text-xl font-semibold">{euros(totalFacture)}</div></Link><Link href="/factures?statut=payee" className="rounded-md border border-neutral-200 p-4 transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"><div className="text-xs text-neutral-500">Encaissé</div><div className="mt-1 font-mono text-xl font-semibold text-green-700 dark:text-green-400">{euros(totalEncaisse)}</div></Link><Link href="/factures" className="rounded-md border border-neutral-200 p-4 transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"><div className="text-xs text-neutral-500">Reste à encaisser</div><div className="mt-1 font-mono text-xl font-semibold text-amber-700 dark:text-amber-400">{euros(resteAEncaisser)}</div></Link></>}
          {voir.devis && <Link href="/devis?statut=accepte" className="rounded-md border border-neutral-200 p-4 transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"><div className="text-xs text-neutral-500">Devis acceptés</div><div className="mt-1 font-mono text-xl font-semibold">{euros(devisAcceptes)}</div></Link>}
        </div></DashboardWidget>}

        {(voir.devis || voir.chantiers) && <DashboardWidget id="suivi"><div className="grid gap-4 md:grid-cols-2">
          {voir.devis && <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Devis à suivre</h2><Link href="/devis" className="text-xs text-neutral-500 hover:underline">Tout voir</Link></div>
            {devisASuivre.length ? <div className="space-y-2">{devisASuivre.map((devis) => { const st = statutDevis(devis.statut); const client = un(devis.client); return <Link key={devis.id} href={`/devis/${devis.id}`} className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><div><div className="font-medium">{devis.numero ?? "Brouillon"}</div><div className="text-xs text-neutral-500">{client?.societe || [client?.prenom, client?.nom].filter(Boolean).join(" ") || "—"}</div></div><div className="text-right">{voirIndicateursFinanciers && <div className="font-mono">{euros(devis.montant_ttc)}</div>}<div className="text-xs" style={{ color: st.couleur }}>{st.libelle}</div></div></Link>; })}</div> : <p className="text-sm text-neutral-500">Aucun devis en attente.</p>}
          </section>}

          {voir.chantiers && <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Chantiers actifs</h2><Link href="/chantiers" className="text-xs text-neutral-500 hover:underline">Tout voir</Link></div>
            {chantiersActifs.length ? <div className="space-y-2">{chantiersActifs.slice(0, 6).map((chantier) => { const st = statutChantier(chantier.statut); return <Link key={chantier.id} href={`/chantiers/${chantier.id}`} className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><span className="font-medium">{chantier.nom}</span><span className="inline-flex items-center gap-1.5 text-xs text-neutral-500"><span className="h-2 w-2 rounded-full" style={{ background: st.couleur }} />{st.libelle}</span></Link>; })}</div> : <p className="text-sm text-neutral-500">Aucun chantier actif.</p>}
          </section>}
        </div></DashboardWidget>}

        {(voir.factures || voir.devis || voir.achats || voir.stock || voir.flotte || voir.outillage) && <DashboardWidget id="alertes"><section className={`rounded-md border p-4 ${alertes.length ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"}`}>
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-sm font-semibold">Centre d’alertes opérationnelles</h2><p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">Uniquement les domaines autorisés pour votre poste.</p></div>
            <div className="flex gap-2 text-xs"><span className="rounded-full bg-red-100 px-2 py-1 text-red-700 dark:bg-red-950 dark:text-red-300">{nbCritiques} critique{nbCritiques > 1 ? "s" : ""}</span><span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-950 dark:text-amber-300">{alertes.length - nbCritiques} à anticiper</span></div>
          </div>
          {alertes.length ? <div className="mt-3 grid grid-cols-2 gap-2">{alertes.slice(0, 12).map((alerte) => <Link key={alerte.id} href={alerte.href} className="flex items-start gap-3 rounded-md border border-black/5 bg-white/70 p-3 text-sm transition hover:bg-white dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/30"><span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${alerte.niveau === "critique" ? "bg-red-600" : "bg-amber-500"}`} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate">{alerte.titre}</strong><span className="flex-none text-[10px] uppercase tracking-wide text-neutral-500">{alerte.domaine}</span></span><span className="mt-0.5 block text-xs text-neutral-600 dark:text-neutral-400">{alerte.detail}{alerte.date ? ` · ${alerte.date}` : ""}</span></span></Link>)}</div> : <p className="mt-3 text-sm text-green-800 dark:text-green-300">Aucune alerte active. Toutes les échéances suivies sont sous contrôle.</p>}
          {domainesAlertes.length > 0 && <p className="mt-3 text-xs text-neutral-500">Domaines concernés : {domainesAlertes.join(" · ")}</p>}
        </section></DashboardWidget>}

        {peutPointer && employeCompte && chantiersPointage.length > 0 && <DashboardWidget id="pointage"><PointageArriveeDepart employes={[{id:employeCompte.id,nom:`${employeCompte.prenom ?? ""} ${employeCompte.nom}`.trim()}]} chantiers={chantiersPointage.map((chantier)=>({id:chantier.id,nom:chantier.nom}))} sessions={sessionsPointage.map((session)=>{const employe=un(session.employe),chantier=un(session.chantier);return{id:session.id,arrivee_at:session.arrivee_at,tache:session.tache,employe:employe?{id:employe.id,nom:`${employe.prenom ?? ""} ${employe.nom}`.trim()}:null,chantier:chantier?{id:chantier.id,nom:chantier.nom}:null};})} /></DashboardWidget>}

        {peutPointer && !employeCompte && <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>Pointage indisponible</strong><p className="mt-1">Votre compte doit être lié à votre fiche employé pour pointer en votre nom.</p></section>}

        {voir.planning && <DashboardWidget id="planning"><section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Prochaines affectations</h2><Link href="/planning" className="text-xs text-neutral-500 hover:underline">Ouvrir le planning</Link></div>
          {affectations?.length ? <div className="grid grid-cols-3 gap-2">{affectations.map((affectation) => { const chantier = un(affectation.chantier); const employe = un(affectation.employe); return <div key={affectation.id} className="rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900"><div className="text-xs text-neutral-500">{new Date(`${affectation.date}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · {Number(affectation.heures)} h</div><div className="mt-1 font-medium">{employe ? `${employe.prenom} ${employe.nom}` : "—"}</div><div className="text-xs text-neutral-500">{chantier?.nom ?? "—"}{affectation.tache ? ` · ${affectation.tache}` : ""}</div></div>; })}</div> : <p className="text-sm text-neutral-500">Aucune affectation à venir.</p>}
        </section></DashboardWidget>}
      </div>
    </main>
  );
}
