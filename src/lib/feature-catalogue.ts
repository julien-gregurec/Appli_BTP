export type FeatureStatus = "active" | "beta" | "experimental" | "disabled";

export type FeatureKey =
  | "dashboard" | "profile" | "messaging" | "clients" | "quotes" | "services" | "invoices"
  | "advanced_invoicing" | "crm" | "tenders" | "jobs" | "my_work" | "works" | "interventions"
  | "subcontractors" | "planning" | "time_tracking" | "employees" | "leave" | "expenses"
  | "travel" | "payroll" | "suppliers" | "orders" | "supplier_invoices" | "recurring_costs"
  | "stock" | "inventories" | "stock_terminal" | "warehouse" | "store" | "fleet" | "tools"
  | "profitability" | "cashflow" | "accounting_exports" | "banking" | "connectors" | "subscription"
  | "settings";

export type FeatureDefinition = {
  status: FeatureStatus;
  visibleByDefault: boolean;
  plans?: string[];
  adminOnly?: boolean;
};

const CORE: FeatureDefinition = { status: "active", visibleByDefault: true };
const BETA: FeatureDefinition = { status: "beta", visibleByDefault: false };
const DISABLED: FeatureDefinition = { status: "disabled", visibleByDefault: false };

/**
 * Catalogue produit Liria Gestion Pro V3.
 *
 * Une permission détermine ce qu'un utilisateur a le droit de faire. Une feature
 * détermine ce que le produit commercial expose réellement. Les deux contrôles
 * sont volontairement indépendants : une ancienne permission ne peut donc pas
 * rendre visible un module encore expérimental.
 */
export const FEATURE_CATALOGUE: Record<FeatureKey, FeatureDefinition> = {
  dashboard: CORE, profile: CORE, messaging: CORE, clients: CORE, quotes: CORE, services: CORE,
  invoices: CORE, jobs: CORE, my_work: CORE, planning: CORE, time_tracking: CORE, employees: CORE,
  leave: CORE, expenses: CORE, suppliers: CORE, orders: CORE, supplier_invoices: CORE,
  recurring_costs: CORE, stock: CORE, inventories: CORE, stock_terminal: CORE, warehouse: CORE,
  fleet: CORE, tools: CORE, profitability: CORE, cashflow: CORE, accounting_exports: CORE,
  subscription: { ...CORE, adminOnly: true }, settings: { ...CORE, adminOnly: true },

  // Modules conservés dans le code et la base, mais retirés du produit V3 tant
  // que leurs parcours complets n'ont pas été validés en conditions réelles.
  advanced_invoicing: BETA, works: BETA, interventions: BETA, subcontractors: BETA,
  travel: BETA, payroll: BETA, crm: BETA,

  // Intégrations et offres post-V3 explicitement hors périmètre commercial.
  tenders: DISABLED, store: DISABLED, banking: DISABLED, connectors: DISABLED,
};

const PATH_FEATURES: Array<[string, FeatureKey]> = [
  ["/facturation-avancee", "advanced_invoicing"], ["/appels-offres", "tenders"],
  ["/grands-deplacements", "travel"], ["/paiements-bancaires", "banking"],
  ["/notes-frais", "expenses"], ["/sous-traitants", "subcontractors"],
  ["/stock/borne", "stock_terminal"], ["/inventaires", "inventories"],
  ["/connecteurs", "connectors"], ["/prestations", "services"],
  ["/interventions", "interventions"], ["/fournisseurs", "suppliers"],
  ["/commandes", "orders"], ["/depenses", "supplier_invoices"], ["/charges", "recurring_costs"],
  ["/mes-travaux", "my_work"], ["/mon-espace", "profile"], ["/messagerie", "messaging"],
  ["/abonnement", "subscription"], ["/parametres", "settings"], ["/rentabilite", "profitability"],
  ["/tresorerie", "cashflow"], ["/exports", "accounting_exports"], ["/ouvrages", "works"],
  ["/boutique", "store"], ["/planning", "planning"], ["/pointage", "time_tracking"],
  ["/employes", "employees"], ["/conges", "leave"], ["/fournisseurs", "suppliers"],
  ["/stock", "stock"], ["/depot", "warehouse"], ["/flotte", "fleet"], ["/outillage", "tools"],
  ["/factures", "invoices"], ["/devis", "quotes"], ["/clients", "clients"], ["/chantiers", "jobs"],
  ["/paie", "payroll"], ["/crm", "crm"], ["/dashboard", "dashboard"],
];

export function featureForPath(pathname: string): FeatureKey | null {
  return PATH_FEATURES.find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] ?? null;
}

export function isFeatureActive(features: readonly FeatureKey[], feature: FeatureKey) {
  return features.includes(feature);
}
