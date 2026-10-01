import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { euros } from "@/lib/devis";
import type { DelegationAlerte } from "@/lib/alertes-delegation";

/**
 * Centre d'alertes opérationnelles du tableau de bord : calcul, état par utilisateur (ignorées,
 * déléguées) et pagination (ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1).
 *
 * Mesuré : avec 5 ans d'historique, la fixture de capacité produit 2 686 alertes ; la page les
 * sérialisait TOUTES (4,9 Mo de HTML, ~1,1 s), et filtrait masquages et délégations par
 * `.in("alerte_cle", [2 686 clés])` — une URL PostgREST d'environ 120 Ko, au-delà des limites
 * usuelles des proxys. Désormais :
 *   • toutes les alertes restent calculées côté serveur (compteurs, briefing, filtres exacts) ;
 *   • le client reçoit un RÉSUMÉ (compteurs, domaines) et une PREMIÈRE PAGE ; la suite est
 *     chargée à la demande (`chargerAlertesOperationnellesAction`), aucune alerte n'est perdue ;
 *   • masquages et délégations sont lus par entreprise/utilisateur (clés seules, paginées par
 *     lots de 1 000 pour ne jamais être tronqués par `max_rows`) ; le détail d'une délégation
 *     (noms, commentaire) n'est lu que pour les alertes affichées.
 */

export const TAILLE_PAGE_ALERTES = 30;

export type Alerte = {
  id: string;
  domaine: string;
  niveau: "critique" | "attention";
  titre: string;
  detail: string;
  href: string;
  date?: string;
};
export type AlerteSignee = Alerte & { signature: string };
export type FiltreAlertes = "toutes" | "mes_alertes" | "deleguees_par_moi" | "ignorees";

type Client = { nom: string | null; prenom: string | null; societe: string | null } | null;
export type SourcesAlertes = {
  facturesAlertes: Array<{ id: string; numero: string | null; montant_ttc: number; montant_paye: number; date_echeance: string; client: Client | Client[] }>;
  devisAlertes: Array<{ id: string; numero: string | null; montant_ttc: number; date_validite: string }>;
  relancesEnEchec: Array<{ id: string; type_document: string; document_id: string; erreur_public_safe: string | null }>;
  articles: Array<{ id: string; reference: string; designation: string; quantite_stock: number; seuil_alerte: number; unite: string }>;
  vehicules: Array<{ id: string; immatriculation: string; marque: string; modele: string; kilometrage: number; controle_technique_echeance: string | null; assurance_echeance: string | null; prochain_entretien_date: string | null; prochain_entretien_km: number | null }>;
  outils: Array<{ id: string; reference: string; designation: string; prochaine_verification: string | null }>;
  commandes: Array<{ id: string; numero: string; date_livraison_prevue: string | null; fournisseur: { nom: string } | { nom: string }[] | null }>;
};

export type VoirAlertes = { devis: boolean; factures: boolean; stock: boolean; flotte: boolean; outillage: boolean; achats: boolean };

function un<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null;
  return Array.isArray(valeur) ? valeur[0] ?? null : valeur;
}

/** Même calcul, même ordre et mêmes textes que le tableau de bord avant pagination. */
export function construireAlertes(sources: SourcesAlertes, aujourdhui: string, voirIndicateursFinanciers: boolean): AlerteSignee[] {
  const alertes: Alerte[] = [];
  const joursAvant = (date: string) => Math.round((Date.parse(`${date}T12:00:00`) - Date.parse(`${aujourdhui}T12:00:00`)) / 86_400_000);
  const ajouterEcheance = (alerte: Omit<Alerte, "niveau">, date: string, anticipation = 30) => {
    const jours = joursAvant(date);
    if (jours <= anticipation) alertes.push({ ...alerte, date, niveau: jours <= 0 ? "critique" : "attention" });
  };

  for (const facture of sources.facturesAlertes) {
    const client = un(facture.client);
    ajouterEcheance({ id: `facture-${facture.id}`, domaine: "Facturation", titre: `${facture.numero ?? "Facture"} à encaisser`, detail: voirIndicateursFinanciers ? `${client?.societe || [client?.prenom, client?.nom].filter(Boolean).join(" ") || "Client"} · reste ${euros(Number(facture.montant_ttc) - Number(facture.montant_paye))}` : `${client?.societe || [client?.prenom, client?.nom].filter(Boolean).join(" ") || "Client"} · échéance de règlement`, href: `/factures/${facture.id}` }, facture.date_echeance, 7);
  }
  for (const itemDevis of sources.devisAlertes) {
    ajouterEcheance({ id: `devis-${itemDevis.id}`, domaine: "Commercial", titre: `${itemDevis.numero ?? "Devis"} arrive à expiration`, detail: voirIndicateursFinanciers ? `Montant ${euros(itemDevis.montant_ttc)}` : "Validité à contrôler", href: `/devis/${itemDevis.id}` }, itemDevis.date_validite, 7);
  }
  // RELANCES-AUTO-V1 §51 : uniquement les échecs (7 derniers jours) — pas une alerte "à
  // relancer" en doublon des échéances devis/facture déjà remontées ci-dessus.
  for (const relance of sources.relancesEnEchec) {
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
  for (const article of sources.articles) {
    const stock = Number(article.quantite_stock), seuil = Number(article.seuil_alerte);
    if (stock <= seuil) alertes.push({ id: `stock-${article.id}`, domaine: "Stock", niveau: stock <= 0 ? "critique" : "attention", titre: `${article.reference} · ${article.designation}`, detail: `${stock} ${article.unite} disponible(s), seuil ${seuil}`, href: "/stock" });
  }
  for (const vehicule of sources.vehicules) {
    const nom = `${vehicule.immatriculation} · ${vehicule.marque} ${vehicule.modele}`;
    if (vehicule.controle_technique_echeance) ajouterEcheance({ id: `ct-${vehicule.id}`, domaine: "Flotte", titre: `Contrôle technique · ${nom}`, detail: "Échéance réglementaire", href: `/flotte/${vehicule.id}` }, vehicule.controle_technique_echeance);
    if (vehicule.assurance_echeance) ajouterEcheance({ id: `assurance-${vehicule.id}`, domaine: "Flotte", titre: `Assurance · ${nom}`, detail: "Renouvellement à vérifier", href: `/flotte/${vehicule.id}` }, vehicule.assurance_echeance);
    if (vehicule.prochain_entretien_date) ajouterEcheance({ id: `entretien-date-${vehicule.id}`, domaine: "Flotte", titre: `Entretien · ${nom}`, detail: "Échéance calendrier", href: `/flotte/${vehicule.id}` }, vehicule.prochain_entretien_date);
    if (vehicule.prochain_entretien_km && Number(vehicule.kilometrage) >= Number(vehicule.prochain_entretien_km)) alertes.push({ id: `entretien-km-${vehicule.id}`, domaine: "Flotte", niveau: "critique", titre: `Entretien kilométrique · ${nom}`, detail: `${Number(vehicule.kilometrage).toLocaleString("fr-FR")} km relevés pour ${Number(vehicule.prochain_entretien_km).toLocaleString("fr-FR")} km prévus`, href: `/flotte/${vehicule.id}` });
  }
  for (const outil of sources.outils) {
    if (outil.prochaine_verification) ajouterEcheance({ id: `outil-${outil.id}`, domaine: "Outillage", titre: `Vérification · ${outil.reference}`, detail: outil.designation, href: `/outillage/${outil.id}` }, outil.prochaine_verification);
  }
  for (const commande of sources.commandes) {
    if (commande.date_livraison_prevue) {
      const fournisseur = un(commande.fournisseur);
      ajouterEcheance({ id: `commande-${commande.id}`, domaine: "Achats", titre: `Livraison ${commande.numero}`, detail: fournisseur?.nom ?? "Fournisseur", href: `/commandes/${commande.id}` }, commande.date_livraison_prevue, 3);
    }
  }
  const ordreNiveau = { critique: 0, attention: 1 };
  alertes.sort((a, b) => ordreNiveau[a.niveau] - ordreNiveau[b.niveau] || (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  return alertes.map((alerte) => ({ ...alerte, signature: [alerte.niveau, alerte.date ?? "", alerte.titre, alerte.detail].join("|") }));
}

type Sb = SupabaseClient;

/**
 * Lit les sources d'alertes visibles (mêmes requêtes que le tableau de bord). Les sources sans
 * ordre propre sont triées par id : l'ordre des alertes à égalité est ainsi stable d'une page à
 * l'autre, condition d'une pagination sans doublon ni trou.
 */
export async function lireSourcesAlertes(supabase: Sb, entrepriseId: string, voir: VoirAlertes, aujourdhui: string): Promise<SourcesAlertes> {
  const septJoursAvantIso = new Date(new Date(aujourdhui).getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const [indicateurs, articles, vehicules, outils, commandes, relances] = await Promise.all([
    voir.devis || voir.factures ? supabase.rpc("dashboard_indicateurs", { p_entreprise_id: entrepriseId, p_aujourdhui: aujourdhui }) : null,
    voir.stock ? requeteArticles(supabase, entrepriseId) : null,
    voir.flotte ? requeteVehicules(supabase, entrepriseId) : null,
    voir.outillage ? requeteOutils(supabase, entrepriseId) : null,
    voir.achats ? requeteCommandes(supabase, entrepriseId) : null,
    voir.devis || voir.factures ? requeteRelancesEnEchec(supabase, entrepriseId, septJoursAvantIso) : null,
  ]);
  const ind = (indicateurs?.data ?? {}) as { factures_alertes?: SourcesAlertes["facturesAlertes"] | null; devis_alertes?: SourcesAlertes["devisAlertes"] | null };
  return {
    facturesAlertes: ind.factures_alertes ?? [],
    devisAlertes: ind.devis_alertes ?? [],
    relancesEnEchec: (relances?.data ?? []) as SourcesAlertes["relancesEnEchec"],
    articles: (articles?.data ?? []) as SourcesAlertes["articles"],
    vehicules: (vehicules?.data ?? []) as SourcesAlertes["vehicules"],
    outils: (outils?.data ?? []) as SourcesAlertes["outils"],
    commandes: (commandes?.data ?? []) as SourcesAlertes["commandes"],
  };
}

export const requeteArticles = (supabase: Sb, entrepriseId: string) => supabase.from("articles_stock").select("id, reference, designation, quantite_stock, seuil_alerte, unite").eq("entreprise_id", entrepriseId).eq("actif", true).order("id");
export const requeteVehicules = (supabase: Sb, entrepriseId: string) => supabase.from("vehicules").select("id, immatriculation, marque, modele, kilometrage, controle_technique_echeance, assurance_echeance, prochain_entretien_date, prochain_entretien_km").eq("entreprise_id", entrepriseId).in("statut", ["actif", "maintenance"]).order("id");
export const requeteOutils = (supabase: Sb, entrepriseId: string) => supabase.from("outils").select("id, reference, designation, prochaine_verification").eq("entreprise_id", entrepriseId).not("statut", "in", "(hors_service,perdu)").order("id");
export const requeteCommandes = (supabase: Sb, entrepriseId: string) => supabase.from("commandes_fournisseurs").select("id, numero, statut, date_livraison_prevue, fournisseur:fournisseurs(nom)").eq("entreprise_id", entrepriseId).in("statut", ["envoyee", "confirmee", "recue_partiel"]).order("id");
export const requeteRelancesEnEchec = (supabase: Sb, entrepriseId: string, depuisIso: string) => supabase.from("relances_documents").select("id,type_document,document_id,niveau,erreur_public_safe,created_at").eq("entreprise_id", entrepriseId).eq("statut", "echec").gte("created_at", depuisIso).order("created_at", { ascending: false }).limit(20);

const LOT = 1000;
/** Lecture complète par lots (au-delà de `max_rows`), triée par une colonne unique. */
async function lireParLots<T>(lire: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const tout: T[] = [];
  for (let de = 0; ; de += LOT) {
    const { data, error } = await lire(de, de + LOT - 1);
    if (error) throw error;
    tout.push(...(data ?? []));
    if (!data || data.length < LOT) return tout;
  }
}

export type DelegationCle = { alerte_cle: string; employe_id: string; delegue_par_user_id: string };

/** État de l'utilisateur sur les alertes : masquages et délégations (clés seules). */
export async function lireEtatAlertes(supabase: Sb, entrepriseId: string, userId: string) {
  const [masquages, delegations] = await Promise.all([
    lireParLots<{ alerte_cle: string; signature: string }>((de, a) => supabase.from("alertes_operationnelles_ignorees").select("alerte_cle,signature").eq("entreprise_id", entrepriseId).eq("utilisateur_id", userId).order("alerte_cle").range(de, a)),
    lireParLots<DelegationCle>((de, a) => supabase.from("alertes_operationnelles_delegations").select("alerte_cle,employe_id,delegue_par_user_id").eq("entreprise_id", entrepriseId).order("alerte_cle").range(de, a)),
  ]);
  return { masquages, delegations };
}

export type CentreAlertes = {
  actives: AlerteSignee[];
  ignorees: AlerteSignee[];
  delegationsParCle: Map<string, DelegationCle>;
};

/** Sépare actives et ignorées (signature identique) et ne garde que les délégations d'alertes actives. */
export function repartirAlertes(alertes: AlerteSignee[], etat: { masquages: { alerte_cle: string; signature: string }[]; delegations: DelegationCle[] }): CentreAlertes {
  const signaturesIgnorees = new Map(etat.masquages.map((masquage) => [masquage.alerte_cle, masquage.signature]));
  const ignorees = alertes.filter((alerte) => signaturesIgnorees.get(alerte.id) === alerte.signature);
  const actives = alertes.filter((alerte) => signaturesIgnorees.get(alerte.id) !== alerte.signature);
  const clesActives = new Set(actives.map((alerte) => alerte.id));
  const delegationsParCle = new Map(etat.delegations.filter((d) => clesActives.has(d.alerte_cle)).map((d) => [d.alerte_cle, d]));
  return { actives, ignorees, delegationsParCle };
}

export function filtrerAlertes(centre: CentreAlertes, filtre: FiltreAlertes, employeCourantId: string | null, utilisateurCourantId: string): AlerteSignee[] {
  if (filtre === "ignorees") return centre.ignorees;
  if (filtre === "mes_alertes") return centre.actives.filter((alerte) => employeCourantId && centre.delegationsParCle.get(alerte.id)?.employe_id === employeCourantId);
  if (filtre === "deleguees_par_moi") return centre.actives.filter((alerte) => centre.delegationsParCle.get(alerte.id)?.delegue_par_user_id === utilisateurCourantId);
  return centre.actives;
}

export type ResumeAlertes = {
  total: number;
  critiques: number;
  domaines: string[];
  ignorees: number;
  delegationsActives: number;
  mesAlertes: number;
  delegueesParMoi: number;
};

export function resumerAlertes(centre: CentreAlertes, employeCourantId: string | null, utilisateurCourantId: string): ResumeAlertes {
  return {
    total: centre.actives.length,
    critiques: centre.actives.filter((alerte) => alerte.niveau === "critique").length,
    domaines: [...new Set(centre.actives.map((alerte) => alerte.domaine))],
    ignorees: centre.ignorees.length,
    delegationsActives: centre.delegationsParCle.size,
    mesAlertes: filtrerAlertes(centre, "mes_alertes", employeCourantId, utilisateurCourantId).length,
    delegueesParMoi: filtrerAlertes(centre, "deleguees_par_moi", employeCourantId, utilisateurCourantId).length,
  };
}

export type PageAlertes = {
  filtre: FiltreAlertes;
  alertes: AlerteSignee[];
  delegations: Record<string, DelegationAlerte>;
  total: number;
};

/** Détail des délégations des seules alertes affichées (≤ une page : URL bornée). */
export async function lireDelegationsDetaillees(supabase: Sb, entrepriseId: string, cles: string[]): Promise<Record<string, DelegationAlerte>> {
  if (!cles.length) return {};
  const { data } = await supabase
    .from("alertes_operationnelles_delegations")
    .select("alerte_cle,employe_id,delegue_par_user_id,delegue_at,commentaire,employe:employes(prenom,nom),delegue_par:utilisateurs!alertes_operationnelles_delegations_delegue_par_user_id_fkey(prenom,nom)")
    .eq("entreprise_id", entrepriseId)
    .in("alerte_cle", cles);
  type Nom = { prenom: string | null; nom: string | null };
  return Object.fromEntries(
    ((data ?? []) as Array<{ alerte_cle: string; employe_id: string; delegue_par_user_id: string; delegue_at: string; commentaire: string | null; employe: Nom | Nom[] | null; delegue_par: Nom | Nom[] | null }>).map((delegation) => {
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
}

export async function pageAlertes(
  supabase: Sb,
  entrepriseId: string,
  centre: CentreAlertes,
  options: { filtre: FiltreAlertes; debut: number; nombre: number; employeCourantId: string | null; utilisateurCourantId: string },
): Promise<PageAlertes> {
  const liste = filtrerAlertes(centre, options.filtre, options.employeCourantId, options.utilisateurCourantId);
  const debut = Math.max(0, Math.floor(options.debut));
  const nombre = Math.min(Math.max(1, Math.floor(options.nombre)), 200);
  const alertes = liste.slice(debut, debut + nombre);
  const cles = options.filtre === "ignorees" ? [] : alertes.filter((alerte) => centre.delegationsParCle.has(alerte.id)).map((alerte) => alerte.id);
  return { filtre: options.filtre, alertes, delegations: await lireDelegationsDetaillees(supabase, entrepriseId, cles), total: liste.length };
}
