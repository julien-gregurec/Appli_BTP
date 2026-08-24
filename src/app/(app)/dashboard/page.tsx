import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { euros, statutDevis } from "@/lib/devis";
import { statutChantier } from "@/lib/chantier-statuts";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { PointageArriveeDepart } from "@/components/PointageArriveeDepart";
import { MobileModuleGrid, type MobileModuleLink } from "@/components/MobileModuleGrid";
import { DashboardAnalytics } from "@/components/DashboardAnalytics";
import { DashboardWidget, DashboardWidgetFirstConnection } from "@/components/DashboardWidgets";
import { BriefingMatin, type LigneBriefing } from "@/components/BriefingMatin";
import { Lien as Link } from "@/components/Lien";
import { iaEstActive } from "@/lib/preview-features";
import { CentreAlertesOperationnelles, type AlerteOperationnelle } from "@/components/CentreAlertesOperationnelles";
import { DOMAINE_VERS_PERMISSION_DELEGATION, type DelegationAlerte, type EmployeDelegable } from "@/lib/alertes-delegation";
import { activeFeaturesForCompany } from "@/lib/feature-flags";
import { featureForPath } from "@/lib/feature-catalogue";
import { estPlateformeAdmin } from "@/lib/plateforme";

function un<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null;
  return Array.isArray(valeur) ? valeur[0] ?? null : valeur;
}

export default async function DashboardPage() {
  const ctx = await getContexteEntreprise();
  const [permissions, plateformeAdmin] = await Promise.all([permissionsUtilisateur(ctx), estPlateformeAdmin()]);
  const activeFeatures = await activeFeaturesForCompany(ctx, permissions, plateformeAdmin);
  const supabase = await createClient();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const septJoursAvantIso = new Date(new Date(aujourdhui).getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const autorise = (cle: string) => permissions === null || permissions.includes(cle);
  // La base filtre elle-même les chantiers selon le choix de l'administrateur :
  // vue globale (`acces_chantiers`) ou uniquement les chantiers affectés.
  // Les compteurs et graphiques utilisent donc exactement le même périmètre.
  const peutVoirChantiers = autorise("acces_chantiers") || autorise("voir_chantiers_assignes");
  const voir = {
    devis: autorise("acces_devis"), factures: autorise("acces_factures"), chantiers: peutVoirChantiers,
    planning: autorise("acces_planning"), stock: autorise("acces_stock"), flotte: autorise("acces_flotte"),
    outillage: autorise("acces_outillage"), achats: autorise("acces_achats"), pointage: autorise("acces_pointage"),
  };
  // En mode prototype aucune identité individuelle n'est fiable : les chiffres globaux
  // restent masqués. En authentification réelle, ils exigent un droit dédié.
  const voirIndicateursFinanciers = permissions !== null && permissions.includes("voir_indicateurs_financiers");
  const peutVoirBriefing = permissions === null || voirIndicateursFinanciers;
  const peutPointer = permissions !== null && permissions.includes("saisir_son_pointage");
  const peutGererPlanning = permissions === null || permissions.includes("gerer_planning");
  const auMoinsUnModule = permissions === null || permissions.some((cle) => cle.startsWith("acces_"));
  const raccourcis = ([
    { permission: null, href: "/mon-espace", label: "Mon espace", icon: "profil" },
    { permission: "voir_devis_chantier_sans_prix", href: "/mes-travaux", label: "Mes travaux", icon: "travaux" },
    { permission: "acces_pointage", href: "/pointage", label: "Pointage", icon: "pointage" },
    { permission: "acces_planning", href: "/planning", label: "Planning", icon: "planning" },
    ...(peutVoirChantiers ? [{ permission: null, href: "/chantiers", label: "Chantiers", icon: "chantiers" as const }] : []),
    { permission: "acces_employes", href: "/employes", label: "Employés", icon: "employes" },
    { permission: "acces_clients", href: "/clients", label: "Clients", icon: "clients" },
    { permission: "acces_devis", href: "/devis", label: "Devis", icon: "devis" },
    { permission: "acces_factures", href: "/factures", label: "Factures", icon: "factures" },
    { permission: "acces_facturation_avancee", href: "/facturation-avancee", label: "Situations", icon: "facturation" },
    { permission: "acces_ouvrages", href: "/ouvrages", label: "Ouvrages", icon: "ouvrages" },
    { permission: "acces_interventions", href: "/interventions", label: "Interventions", icon: "interventions" },
    { permission: "acces_sous_traitants", href: "/sous-traitants", label: "Sous-traitants", icon: "sous_traitants" },
    { permission: "acces_crm", href: "/crm", label: "CRM", icon: "crm" },
    { permission: "acces_achats", href: "/commandes", label: "Achats", icon: "achats" },
    { permission: "acces_stock", href: "/stock", label: "Stock", icon: "stock" },
    { permission: "acces_flotte", href: "/flotte", label: "Flotte", icon: "flotte" },
    { permission: "acces_outillage", href: "/outillage", label: "Outillage", icon: "outillage" },
    { permission: "saisir_ses_notes_frais", href: "/notes-frais", label: "Notes de frais", icon: "frais" },
    { permission: "saisir_ses_notes_frais", href: "/grands-deplacements", label: "Grands déplacements", icon: "frais" },
    { permission: "demander_ses_conges", href: "/conges", label: "Congés", icon: "conges" },
    { permission: "acces_rentabilite", href: "/rentabilite", label: "Rentabilité", icon: "rentabilite" },
    { permission: "acces_exports", href: "/exports", label: "Exports", icon: "exports" },
    { permission: "acces_paiements_bancaires", href: "/paiements-bancaires", label: "Banque & paie", icon: "banque" },
    { permission: "acces_connecteurs", href: "/connecteurs", label: "Connecteurs", icon: "connecteurs" },
    { permission: "acces_parametres", href: "/parametres", label: "Paramètres", icon: "parametres" },
  ] as Array<MobileModuleLink & { permission: string | null }>).filter((module) => {
    const feature = featureForPath(module.href);
    return (!feature || activeFeatures.includes(feature)) && (module.permission === null || autorise(module.permission));
  });

  const { data: employeCompte } = permissions !== null && (peutPointer || voir.planning || voir.factures || voir.devis || voir.stock || voir.flotte || voir.outillage || voir.achats)
    ? await supabase.from("employes").select("id,prenom,nom").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).eq("statut", "actif").maybeSingle()
    : { data: null };
  let requeteAffectations = supabase.from("affectations").select("id, date, heures, tache, chantier:chantiers(nom), employe:employes(prenom, nom)").eq("entreprise_id", ctx.entrepriseId).gte("date", aujourdhui).order("date").limit(6);
  if (permissions !== null && !peutGererPlanning) requeteAffectations = requeteAffectations.eq("employe_id", employeCompte?.id ?? "00000000-0000-0000-0000-000000000000");

  const [devisResult, facturesResult, chantiersResult, affectationsResult, articlesResult, vehiculesResult, outilsResult, commandesResult, chantiersPointageResult, sessionsPointageResult, employesActifsResult, congesAujourdhuiResult, notificationsResult, relancesEchecResult] = await Promise.all([
    voir.devis ? supabase.from("devis").select("id, numero, statut, montant_ttc, date_emission, date_validite, client:clients!devis_client_id_fkey(nom, prenom, societe)").eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }) : null,
    voir.factures ? supabase.from("factures").select("id, numero, statut, date_emission, date_echeance, montant_ttc, montant_paye, client:clients!factures_client_id_fkey(nom, prenom, societe)").eq("entreprise_id", ctx.entrepriseId) : null,
    voir.chantiers ? supabase.from("chantiers").select("id, nom, statut, date_fin_prevue").eq("entreprise_id", ctx.entrepriseId).order("updated_at", { ascending: false }) : null,
    voir.planning ? requeteAffectations : null,
    voir.stock ? supabase.from("articles_stock").select("id, reference, designation, quantite_stock, seuil_alerte, unite").eq("entreprise_id", ctx.entrepriseId).eq("actif", true) : null,
    voir.flotte ? supabase.from("vehicules").select("id, immatriculation, marque, modele, kilometrage, controle_technique_echeance, assurance_echeance, prochain_entretien_date, prochain_entretien_km").eq("entreprise_id", ctx.entrepriseId).in("statut", ["actif", "maintenance"]) : null,
    voir.outillage ? supabase.from("outils").select("id, reference, designation, prochaine_verification").eq("entreprise_id", ctx.entrepriseId).not("statut", "in", "(hors_service,perdu)") : null,
    voir.achats ? supabase.from("commandes_fournisseurs").select("id, numero, statut, date_livraison_prevue, fournisseur:fournisseurs(nom)").eq("entreprise_id", ctx.entrepriseId).in("statut", ["envoyee", "confirmee", "recue_partiel"]) : null,
    peutPointer && employeCompte ? supabase.from("chantiers").select("id,nom").eq("entreprise_id",ctx.entrepriseId).not("statut","in",'(archive,annule)').order("nom") : null,
    peutPointer && employeCompte ? supabase.from("sessions_pointage").select("id,arrivee_at,tache,employe:employes(id,prenom,nom),chantier:chantiers(id,nom)").eq("entreprise_id",ctx.entrepriseId).eq("employe_id",employeCompte.id).is("depart_at",null).order("arrivee_at",{ascending:false}) : null,
    peutVoirBriefing ? supabase.from("employes").select("id").eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif") : null,
    peutVoirBriefing ? supabase.from("demandes_conges").select("employe_id").eq("entreprise_id", ctx.entrepriseId).eq("statut", "approuvee").lte("date_debut", aujourdhui).gte("date_fin", aujourdhui) : null,
    permissions !== null ? supabase.from("notifications_utilisateurs").select("id,titre,message,lien,niveau,created_at").eq("entreprise_id", ctx.entrepriseId).is("lue_at", null).order("created_at", { ascending: false }).limit(8) : null,
    voir.devis || voir.factures ? supabase.from("relances_documents").select("id,type_document,document_id,niveau,erreur_public_safe,created_at").eq("entreprise_id", ctx.entrepriseId).eq("statut", "echec").gte("created_at", septJoursAvantIso).order("created_at", { ascending: false }).limit(20) : null,
  ]);
  const devis = devisResult?.data ?? [], factures = facturesResult?.data ?? [], chantiers = chantiersResult?.data ?? [];
  const affectations = affectationsResult?.data ?? [], articles = articlesResult?.data ?? [], vehicules = vehiculesResult?.data ?? [];
  const outils = outilsResult?.data ?? [], commandes = commandesResult?.data ?? [];
  const chantiersPointage = chantiersPointageResult?.data ?? [], sessionsPointage = sessionsPointageResult?.data ?? [];
  const employesActifs = employesActifsResult?.data ?? [], congesAujourdhui = congesAujourdhuiResult?.data ?? [];
  const notifications = notificationsResult?.data ?? [];
  const relancesEnEchec = relancesEchecResult?.data ?? [];

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
  // RELANCES-AUTO-V1 §51 : uniquement les échecs (7 derniers jours) — pas une alerte "à
  // relancer" en doublon des échéances devis/facture déjà remontées ci-dessus.
  for (const relance of relancesEnEchec) {
    const estDevis = relance.type_document === "devis";
    alertes.push({
      id: `relance-echec-${relance.id}`,
      domaine: estDevis ? "Commercial" : "Facturation",
      niveau: "attention",
      titre: `Échec d'envoi d'une relance ${estDevis ? "devis" : "facture"}`,
      detail: relance.erreur_public_safe ?? "Vérifier la configuration d'envoi d'e-mail",
      href: estDevis ? `/devis/${relance.document_id}` : `/factures/${relance.document_id}`,
    });
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
  const alertesAvecSignature: AlerteOperationnelle[] = alertes.map((alerte) => ({
    ...alerte,
    signature: [alerte.niveau, alerte.date ?? "", alerte.titre, alerte.detail].join("|"),
  }));
  const { data: masquagesAlertes } = permissions !== null && alertesAvecSignature.length > 0
    ? await supabase
      .from("alertes_operationnelles_ignorees")
      .select("alerte_cle,signature")
      .eq("entreprise_id", ctx.entrepriseId)
      .eq("utilisateur_id", ctx.userId)
      .in("alerte_cle", alertesAvecSignature.map((alerte) => alerte.id))
    : { data: [] as Array<{ alerte_cle: string; signature: string }> };
  const signaturesIgnorees = new Map((masquagesAlertes ?? []).map((masquage) => [masquage.alerte_cle, masquage.signature]));
  const alertesIgnorees = alertesAvecSignature.filter((alerte) => signaturesIgnorees.get(alerte.id) === alerte.signature);
  const alertesActives = alertesAvecSignature.filter((alerte) => signaturesIgnorees.get(alerte.id) !== alerte.signature);
  const prenomAffiche = ctx.prenom && ctx.prenom.toLocaleLowerCase("fr") !== "prototype" ? ctx.prenom : null;

  // Délégation d'alertes (ALERTES-DELEGATION-V1) : le bouton n'est proposé
  // que pour les domaines reliés à un droit de gestion existant, et jamais
  // affiché seul comme contrôle d'accès — la fonction SQL revalide tout.
  const domainesAlertesActives = [...new Set(alertesActives.map((alerte) => alerte.domaine))];
  const domainesDelegables = domainesAlertesActives.filter((domaine) => DOMAINE_VERS_PERMISSION_DELEGATION[domaine]);
  const domainesAutorisesDelegation = domainesDelegables.filter((domaine) => autorise(DOMAINE_VERS_PERMISSION_DELEGATION[domaine]));
  const [{ data: employesDelegablesData }, { data: delegationsData }] = await Promise.all([
    permissions !== null && domainesAutorisesDelegation.length > 0
      ? supabase.rpc("employes_delegables_alertes", { p_entreprise_id: ctx.entrepriseId })
      : Promise.resolve({ data: [] as Array<{ employe_id: string; prenom: string; nom: string; permissions: string[] }> }),
    permissions !== null && alertesActives.length > 0
      ? supabase
        .from("alertes_operationnelles_delegations")
        .select("alerte_cle,employe_id,delegue_par_user_id,delegue_at,commentaire,employe:employes(prenom,nom),delegue_par:utilisateurs!alertes_operationnelles_delegations_delegue_par_user_id_fkey(prenom,nom)")
        .eq("entreprise_id", ctx.entrepriseId)
        .in("alerte_cle", alertesActives.map((alerte) => alerte.id))
      : Promise.resolve({ data: [] as Array<{ alerte_cle: string; employe_id: string; delegue_par_user_id: string; delegue_at: string; commentaire: string | null; employe: { prenom: string; nom: string } | { prenom: string; nom: string }[] | null; delegue_par: { prenom: string; nom: string } | { prenom: string; nom: string }[] | null }> }),
  ]);
  const employesDelegables: EmployeDelegable[] = (
    (employesDelegablesData ?? []) as Array<{ employe_id: string; prenom: string; nom: string; permissions: string[] }>
  ).map((employe) => ({
    employeId: employe.employe_id, prenom: employe.prenom, nom: employe.nom, permissions: employe.permissions,
  }));
  const delegations: Record<string, DelegationAlerte> = Object.fromEntries(
    (delegationsData ?? []).map((delegation) => {
      const employe = un(delegation.employe);
      const delegueParUtilisateur = un(delegation.delegue_par);
      return [delegation.alerte_cle, {
        employeId: delegation.employe_id,
        employePrenom: employe?.prenom ?? "",
        employeNom: employe?.nom ?? "",
        deleguePar: delegueParUtilisateur ? `${delegueParUtilisateur.prenom ?? ""} ${delegueParUtilisateur.nom ?? ""}`.trim() : "",
        delegueParUserId: delegation.delegue_par_user_id,
        delegueAt: delegation.delegue_at,
        commentaire: delegation.commentaire,
      } satisfies DelegationAlerte];
    }),
  );

  const lignesBriefing: LigneBriefing[] = [];
  if (peutVoirBriefing) {
    const absentsAujourdhui = new Set(congesAujourdhui.map((c) => c.employe_id)).size;
    const presentsAujourdhui = Math.max(0, employesActifs.length - absentsAujourdhui);
    if (employesActifs.length > 0) {
      lignesBriefing.push({
        niveau: absentsAujourdhui > 0 ? "attention" : "bon",
        texte: `${presentsAujourdhui} salarié${presentsAujourdhui > 1 ? "s" : ""} présent${presentsAujourdhui > 1 ? "s" : ""}${absentsAujourdhui > 0 ? `, ${absentsAujourdhui} absent${absentsAujourdhui > 1 ? "s" : ""}` : ""}`,
      });
    }
    const chantiersEnRetard = (chantiers ?? [])
      .filter((c): c is typeof c & { date_fin_prevue: string } => statutsActifs.includes(c.statut) && !!c.date_fin_prevue && c.date_fin_prevue < aujourdhui);
    for (const c of chantiersEnRetard.slice(0, 2)) {
      const jours = Math.round((Date.parse(`${aujourdhui}T12:00:00`) - Date.parse(`${c.date_fin_prevue}T12:00:00`)) / 86_400_000);
      lignesBriefing.push({ niveau: "critique", texte: `Chantier ${c.nom} : retard estimé ${jours} j` });
    }
    if (voirIndicateursFinanciers && resteAEncaisser > 0) {
      lignesBriefing.push({ niveau: "bon", texte: `${euros(resteAEncaisser)} à encaisser` });
    }
    const facturesEnRetard = alertesActives.filter((a) => a.domaine === "Facturation" && a.niveau === "critique").length;
    if (facturesEnRetard > 0) {
      lignesBriefing.push({ niveau: "critique", texte: `${facturesEnRetard} facture${facturesEnRetard > 1 ? "s" : ""} impayée${facturesEnRetard > 1 ? "s" : ""}` });
    }
    const stockAlertes = alertesActives.filter((a) => a.domaine === "Stock");
    if (stockAlertes.length > 0) {
      lignesBriefing.push({ niveau: "attention", texte: `Stock faible : ${stockAlertes.slice(0, 2).map((a) => a.titre.split(" · ")[1] ?? a.titre).join(", ")}` });
    }
    const flotteAlertes = alertesActives.filter((a) => a.domaine === "Flotte");
    if (flotteAlertes.length > 0) {
      lignesBriefing.push({ niveau: flotteAlertes.some((a) => a.niveau === "critique") ? "critique" : "attention", texte: flotteAlertes[0].titre });
    }
    if (lignesBriefing.length === 0) {
      lignesBriefing.push({ niveau: "bon", texte: "Rien à signaler, tout est sous contrôle." });
    }
  }
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
  const optionsWidgets = [
    ...((notifications??[]).length ? [{id:"notifications",label:"Notifications"}] : []),
    ...(raccourcis.length ? [{id:"modules",label:"Raccourcis modules"}] : []),
    ...((chantierGraphique || moisGraphique || (voirIndicateursFinanciers && voir.factures)) ? [{id:"analyses",label:"Graphiques et analyses"}] : []),
    ...(voirIndicateursFinanciers && (voir.factures || voir.devis) ? [{id:"indicateurs",label:"Indicateurs financiers"}] : []),
    ...((voir.devis || voir.chantiers) ? [{id:"suivi",label:"Devis et chantiers à suivre"}] : []),
    ...((voir.factures || voir.devis || voir.achats || voir.stock || voir.flotte || voir.outillage) ? [{id:"alertes",label:"Alertes opérationnelles"}] : []),
    ...(peutPointer && employeCompte ? [{id:"pointage",label:"Pointage rapide"}] : []),
    ...(voir.planning ? [{id:"planning",label:"Prochaines affectations"}] : []),
  ];

  return (
    <main className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {peutVoirBriefing ? (
          <BriefingMatin prenom={prenomAffiche} lignes={lignesBriefing} peutUtiliserIA={iaEstActive() && aAccesIA(permissions)} />
        ) : (
          <div>
            <h1 className="text-xl font-semibold">Bonjour{prenomAffiche ? ` ${prenomAffiche}` : ""}</h1>
            <p className="text-sm text-neutral-500">{ctx.entrepriseNom}</p>
          </div>
        )}
        <DashboardWidgetFirstConnection options={optionsWidgets}/>

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

        {(voir.factures || voir.devis || voir.achats || voir.stock || voir.flotte || voir.outillage) && (
          <DashboardWidget id="alertes">
            <CentreAlertesOperationnelles
              alertes={alertesActives}
              alertesIgnorees={alertesIgnorees}
              domainesAutorisesDelegation={domainesAutorisesDelegation}
              employesDelegables={employesDelegables}
              delegations={delegations}
              employeCourantId={employeCompte?.id ?? null}
              utilisateurCourantId={ctx.userId}
            />
          </DashboardWidget>
        )}

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
