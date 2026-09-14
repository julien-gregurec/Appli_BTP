/**
 * Planning v2 (GP V1, lot F) — modèle et calculs PURS, sans base ni navigateur.
 *
 * Un ÉVÈNEMENT est horodaté (début, fin, en heure de Paris), typé, coloré, rattaché à un chantier et
 * un client, et AFFECTÉ à des salariés, des équipes et des ressources matérielles. Les vues (jour,
 * semaine, mois, par salarié, équipe, chantier, ressource, compacte) sont des projections d'une même
 * liste ; les conflits sont recalculés ici pour l'écran, et par la base (`conflits_planning`) pour la
 * vérité. Rien ne bloque une saisie volontaire : un conflit est signalé, une ressource matérielle
 * déjà prise est refusée par la base.
 */

export const TYPES_EVENEMENT = [
  { cle: "chantier", libelle: "Chantier", couleur: "#2563eb" },
  { cle: "intervention", libelle: "Intervention", couleur: "#0891b2" },
  { cle: "rendez_vous", libelle: "Rendez-vous", couleur: "#7c3aed" },
  { cle: "conge", libelle: "Congé", couleur: "#9ca3af" },
  { cle: "absence", libelle: "Absence", couleur: "#f59e0b" },
  { cle: "formation", libelle: "Formation", couleur: "#059669" },
  { cle: "livraison", libelle: "Livraison", couleur: "#d97706" },
  { cle: "deplacement", libelle: "Déplacement", couleur: "#64748b" },
  { cle: "autre", libelle: "Autre", couleur: "#475569" },
] as const;
export type TypeEvenement = (typeof TYPES_EVENEMENT)[number]["cle"];

export const STATUTS_EVENEMENT = ["planifie", "confirme", "en_cours", "termine", "annule"] as const;
export type StatutEvenement = (typeof STATUTS_EVENEMENT)[number];

export type Affectation = { employeId?: string | null; equipeId?: string | null; ressourceId?: string | null };

export type Evenement = {
  id: string;
  titre: string;
  type: TypeEvenement;
  statut: StatutEvenement;
  /** ISO 8601 avec fuseau (timestamptz). */
  debut: string;
  fin: string;
  journeeEntiere: boolean;
  couleur: string | null;
  chantierId: string | null;
  clientId: string | null;
  adresse: string | null;
  notes: string | null;
  affectations: Affectation[];
};

export type Ressource = { id: string; type: "vehicule" | "nacelle" | "machine" | "materiel" | "autre"; nom: string; couleur: string | null; actif: boolean };
export type Equipe = { id: string; nom: string; couleur: string | null; membres: string[] };
export type Salarie = { id: string; nom: string; actif: boolean };
export type Disponibilite = { employeId: string; jourSemaine: number; debut: string; fin: string };

export type Vue = "jour" | "semaine" | "mois" | "salarie" | "equipe" | "chantier" | "ressource" | "compacte";
export const VUES: ReadonlyArray<{ cle: Vue; libelle: string }> = [
  { cle: "jour", libelle: "Jour" }, { cle: "semaine", libelle: "Semaine" }, { cle: "mois", libelle: "Mois" },
  { cle: "salarie", libelle: "Par salarié" }, { cle: "equipe", libelle: "Par équipe" }, { cle: "chantier", libelle: "Par chantier" },
  { cle: "ressource", libelle: "Par ressource" }, { cle: "compacte", libelle: "Compacte" },
];

export const FUSEAU = "Europe/Paris";
export const PAS_MINUTES = 15;

// ── Dates (Paris) ───────────────────────────────────────────────────────────────

/** Composantes locales Paris d'un instant. */
export function local(iso: string | Date): { annee: number; mois: number; jour: number; heure: number; minute: number; jourSemaine: number } {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const js = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { annee: Number(p.year), mois: Number(p.month), jour: Number(p.day), heure: Number(p.hour), minute: Number(p.minute), jourSemaine: (js + 6) % 7 };
}

/** « AAAA-MM-JJ » local Paris. */
export function jourDe(iso: string | Date): string {
  const l = local(iso);
  return `${l.annee}-${String(l.mois).padStart(2, "0")}-${String(l.jour).padStart(2, "0")}`;
}

/** Décalage Paris (minutes) pour un jour donné, sans bibliothèque : on compare l'instant UTC à sa lecture locale. */
function decalageMinutes(annee: number, mois: number, jour: number, heure = 12): number {
  const utc = Date.UTC(annee, mois - 1, jour, heure, 0, 0);
  const l = local(new Date(utc));
  const localCommeUtc = Date.UTC(l.annee, l.mois - 1, l.jour, l.heure, l.minute, 0);
  return Math.round((localCommeUtc - utc) / 60000);
}

/** Instant ISO d'une heure locale Paris (« AAAA-MM-JJ », minutes depuis minuit). */
export function instant(jour: string, minutes: number): string {
  const [a, m, j] = jour.split("-").map(Number);
  const brut = Date.UTC(a, m - 1, j, 0, 0, 0) + minutes * 60000;
  const decalage = decalageMinutes(a, m, j, Math.floor(minutes / 60) % 24);
  return new Date(brut - decalage * 60000).toISOString();
}

export function minutesDepuisMinuit(iso: string): number {
  const l = local(iso);
  return l.heure * 60 + l.minute;
}

export function ajouterJours(jour: string, n: number): string {
  const [a, m, j] = jour.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function lundiDe(jour: string): string {
  const [a, m, j] = jour.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j, 12));
  return ajouterJours(jour, -((d.getUTCDay() + 6) % 7));
}

/** Jours couverts par une vue autour d'une date. */
export function joursDeVue(vue: Vue, jour: string): string[] {
  if (vue === "jour") return [jour];
  if (vue === "mois") {
    const [a, m] = jour.split("-").map(Number);
    const premier = `${a}-${String(m).padStart(2, "0")}-01`;
    const debut = lundiDe(premier);
    const jours: string[] = [];
    for (let i = 0; i < 42; i += 1) jours.push(ajouterJours(debut, i));
    // 6 semaines complètes, sauf la dernière si elle est entièrement hors du mois.
    return jours.filter((d, i) => i < 35 || d.slice(0, 7) === `${a}-${String(m).padStart(2, "0")}`);
  }
  const lundi = lundiDe(jour);
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
}

export const arrondirAuPas = (minutes: number, pas = PAS_MINUTES) => Math.round(minutes / pas) * pas;

// ── Projection ───────────────────────────────────────────────────────────────────

export type Ligne = { cle: string; libelle: string; genre: "salarie" | "equipe" | "chantier" | "ressource" | "jour" | "tous" };

/** Lignes de la grille selon la vue : jours (jour/semaine/mois) ou sujets. */
export function lignesDeVue(vue: Vue, jours: string[], o: { salaries: Salarie[]; equipes: Equipe[]; chantiers: Array<{ id: string; nom: string }>; ressources: Ressource[] }): Ligne[] {
  switch (vue) {
    case "salarie": return [...o.salaries.filter((s) => s.actif).map((s) => ({ cle: `s:${s.id}`, libelle: s.nom, genre: "salarie" as const })), { cle: "s:", libelle: "Sans salarié", genre: "salarie" as const }];
    case "equipe": return [...o.equipes.map((e) => ({ cle: `e:${e.id}`, libelle: e.nom, genre: "equipe" as const })), { cle: "e:", libelle: "Hors équipe", genre: "equipe" as const }];
    case "chantier": return [...o.chantiers.map((c) => ({ cle: `c:${c.id}`, libelle: c.nom, genre: "chantier" as const })), { cle: "c:", libelle: "Sans chantier", genre: "chantier" as const }];
    case "ressource": return [...o.ressources.filter((r) => r.actif).map((r) => ({ cle: `r:${r.id}`, libelle: r.nom, genre: "ressource" as const })), { cle: "r:", libelle: "Sans ressource", genre: "ressource" as const }];
    case "compacte": return [{ cle: "tous", libelle: "Tous", genre: "tous" }];
    default: return jours.map((j) => ({ cle: `j:${j}`, libelle: j, genre: "jour" as const }));
  }
}

/** Lignes sur lesquelles un évènement apparaît (un évènement à deux salariés apparaît deux fois en vue salarié). */
export function lignesDeEvenement(e: Evenement, vue: Vue, equipes: Equipe[]): string[] {
  switch (vue) {
    case "salarie": {
      const directs = e.affectations.filter((a) => a.employeId).map((a) => `s:${a.employeId}`);
      const viaEquipes = e.affectations.filter((a) => a.equipeId).flatMap((a) => (equipes.find((q) => q.id === a.equipeId)?.membres ?? []).map((m) => `s:${m}`));
      const tous = [...new Set([...directs, ...viaEquipes])];
      return tous.length ? tous : ["s:"];
    }
    case "equipe": { const l = e.affectations.filter((a) => a.equipeId).map((a) => `e:${a.equipeId}`); return l.length ? l : ["e:"]; }
    case "chantier": return [e.chantierId ? `c:${e.chantierId}` : "c:"];
    case "ressource": { const l = e.affectations.filter((a) => a.ressourceId).map((a) => `r:${a.ressourceId}`); return l.length ? l : ["r:"]; }
    case "compacte": return ["tous"];
    default: return joursCouverts(e).map((j) => `j:${j}`);
  }
}

export function joursCouverts(e: Evenement): string[] {
  const jours: string[] = [];
  let j = jourDe(e.debut);
  const dernier = jourDe(new Date(new Date(e.fin).getTime() - 1));
  for (let i = 0; i < 366 && j <= dernier; i += 1) { jours.push(j); j = ajouterJours(j, 1); }
  return jours.length ? jours : [jourDe(e.debut)];
}

export type Bloc = {
  evenement: Evenement;
  ligne: string;
  jour: string;
  /** Minutes depuis minuit, bornées au jour. */
  debutMin: number;
  finMin: number;
  /** Rang et nombre de blocs concurrents sur la même ligne et le même jour (chevauchement visuel). */
  colonne: number;
  colonnes: number;
};

/** Blocs à dessiner pour une vue : un par (évènement, ligne, jour), avec colonnes de chevauchement. */
export function blocsDeVue(evenements: Evenement[], vue: Vue, jours: string[], equipes: Equipe[], o: { empiler?: boolean } = {}): Bloc[] {
  const blocs: Bloc[] = [];
  const jeuJours = new Set(jours);
  for (const e of evenements) {
    if (e.statut === "annule") continue;
    for (const ligne of lignesDeEvenement(e, vue, equipes)) {
      for (const jour of joursCouverts(e)) {
        if (!jeuJours.has(jour)) continue;
        // En vue par jour, la ligne EST le jour : un bloc par jour couvert, pas un produit cartésien.
        if (ligne.startsWith("j:") && ligne !== `j:${jour}`) continue;
        const debutMin = jourDe(e.debut) === jour ? minutesDepuisMinuit(e.debut) : 0;
        const finBrute = jourDe(e.fin) === jour ? minutesDepuisMinuit(e.fin) : 1440;
        const finMin = e.journeeEntiere ? 1440 : Math.max(debutMin + PAS_MINUTES, finBrute === 0 ? 1440 : finBrute);
        blocs.push({ evenement: e, ligne, jour, debutMin: e.journeeEntiere ? 0 : debutMin, finMin, colonne: 0, colonnes: 1 });
      }
    }
  }
  // Colonnes de chevauchement par (ligne, jour) : balayage par début.
  const groupes = new Map<string, Bloc[]>();
  for (const b of blocs) { const k = `${b.ligne}|${b.jour}`; groupes.set(k, [...(groupes.get(k) ?? []), b]); }
  for (const liste of groupes.values()) {
    liste.sort((a, b) => a.debutMin - b.debutMin || a.finMin - b.finMin);
    // Vues à colonnes-jours : la case n'a pas d'axe temporel, tous les blocs s'empilent dans l'ordre.
    if (o.empiler) { liste.forEach((b, i) => { b.colonne = i; b.colonnes = liste.length; }); continue; }
    const actifs: Bloc[] = [];
    let grappe: Bloc[] = [];
    const clore = () => { const n = Math.max(1, ...grappe.map((b) => b.colonne + 1)); grappe.forEach((b) => { b.colonnes = n; }); grappe = []; };
    for (const b of liste) {
      for (let i = actifs.length - 1; i >= 0; i -= 1) if (actifs[i].finMin <= b.debutMin) actifs.splice(i, 1);
      if (actifs.length === 0 && grappe.length) clore();
      const prises = new Set(actifs.map((a) => a.colonne));
      let c = 0; while (prises.has(c)) c += 1;
      b.colonne = c; actifs.push(b); grappe.push(b);
    }
    if (grappe.length) clore();
  }
  return blocs;
}

// ── Conflits (miroir de conflits_planning) ────────────────────────────────────────

export type Conflit = { evenementId: string; type: "salarie_double" | "ressource_double" | "hors_disponibilite" | "surcharge" | "conge"; sujetId: string; detail: string };

const chevauche = (a: Evenement, b: Evenement) => a.debut < b.fin && b.debut < a.fin;
/** Heures comptées d'un évènement : 7 h par jour pour une journée entière (comme la synchronisation SQL). */
const heures = (e: Evenement) => (e.journeeEntiere ? 7 * joursCouverts(e).length : (new Date(e.fin).getTime() - new Date(e.debut).getTime()) / 3600000);

export function salariesDe(e: Evenement, equipes: Equipe[]): string[] {
  return [...new Set([
    ...e.affectations.filter((a) => a.employeId).map((a) => a.employeId!),
    ...e.affectations.filter((a) => a.equipeId).flatMap((a) => equipes.find((q) => q.id === a.equipeId)?.membres ?? []),
  ])];
}

/**
 * Conflits d'une liste d'évènements : même salarié sur deux évènements qui se chevauchent, ressource
 * déjà utilisée, horaire hors disponibilité déclarée, plus de `plafondHeures` par jour, congé.
 */
export function detecterConflits(evenements: Evenement[], o: { equipes: Equipe[]; disponibilites?: Disponibilite[]; plafondHeures?: number }): Conflit[] {
  const actifs = evenements.filter((e) => e.statut !== "annule");
  const conflits: Conflit[] = [];
  const plafond = o.plafondHeures ?? 10;
  for (let i = 0; i < actifs.length; i += 1) {
    const a = actifs[i];
    const sa = salariesDe(a, o.equipes);
    const ra = a.affectations.filter((x) => x.ressourceId).map((x) => x.ressourceId!);
    for (let j = i + 1; j < actifs.length; j += 1) {
      const b = actifs[j];
      if (!chevauche(a, b)) continue;
      const sb = salariesDe(b, o.equipes);
      for (const s of sa) if (sb.includes(s)) {
        const detail = `Déjà affecté à « ${b.titre} »`;
        conflits.push({ evenementId: a.id, type: (a.type === "conge" || b.type === "conge") ? "conge" : "salarie_double", sujetId: s, detail });
        conflits.push({ evenementId: b.id, type: (a.type === "conge" || b.type === "conge") ? "conge" : "salarie_double", sujetId: s, detail: `Déjà affecté à « ${a.titre} »` });
      }
      for (const r of ra) if (b.affectations.some((x) => x.ressourceId === r)) {
        conflits.push({ evenementId: a.id, type: "ressource_double", sujetId: r, detail: `Ressource déjà utilisée par « ${b.titre} »` });
        conflits.push({ evenementId: b.id, type: "ressource_double", sujetId: r, detail: `Ressource déjà utilisée par « ${a.titre} »` });
      }
    }
    if (o.disponibilites && !a.journeeEntiere) {
      const l = local(a.debut);
      const d = minutesDepuisMinuit(a.debut), f = minutesDepuisMinuit(a.fin);
      for (const s of sa) {
        const dispos = o.disponibilites.filter((x) => x.employeId === s && x.jourSemaine === l.jourSemaine);
        if (dispos.length && !dispos.some((x) => d >= hm(x.debut) && f <= hm(x.fin))) conflits.push({ evenementId: a.id, type: "hors_disponibilite", sujetId: s, detail: "Horaire hors des disponibilités déclarées" });
      }
    }
  }
  // Surcharge : total des heures par salarié et par jour.
  const charge = new Map<string, number>();
  const travail = actifs.filter((e) => e.type !== "conge" && e.type !== "absence");
  for (const e of travail) for (const s of salariesDe(e, o.equipes)) for (const j of joursCouverts(e)) {
    const k = `${s}|${j}`; charge.set(k, (charge.get(k) ?? 0) + Math.min(heures(e), 24) / joursCouverts(e).length);
  }
  for (const e of travail) for (const s of salariesDe(e, o.equipes)) for (const j of joursCouverts(e)) {
    if ((charge.get(`${s}|${j}`) ?? 0) > plafond) conflits.push({ evenementId: e.id, type: "surcharge", sujetId: s, detail: `Plus de ${plafond} h le ${j}` });
  }
  return dedoublonner(conflits);
}

const hm = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
function dedoublonner(c: Conflit[]): Conflit[] {
  const vus = new Set<string>();
  return c.filter((x) => { const k = `${x.evenementId}|${x.type}|${x.sujetId}|${x.detail}`; if (vus.has(k)) return false; vus.add(k); return true; });
}

// ── Manipulations ────────────────────────────────────────────────────────────────

export function deplacer(e: Evenement, deltaMinutes: number): Evenement {
  const d = new Date(new Date(e.debut).getTime() + deltaMinutes * 60000).toISOString();
  const f = new Date(new Date(e.fin).getTime() + deltaMinutes * 60000).toISOString();
  return { ...e, debut: d, fin: f };
}

export function redimensionner(e: Evenement, nouvelleFinMinutes: number): Evenement {
  const jour = jourDe(e.debut);
  const debutMin = minutesDepuisMinuit(e.debut);
  const fin = Math.max(debutMin + PAS_MINUTES, Math.min(1440, arrondirAuPas(nouvelleFinMinutes)));
  return { ...e, fin: fin === 1440 ? instant(ajouterJours(jour, 1), 0) : instant(jour, fin) };
}

/** Déplace sur une autre ligne : remplace l'affectation correspondante (salarié, équipe, ressource) ou le chantier. */
export function changerLigne(e: Evenement, deCle: string, versCle: string): Evenement {
  if (deCle === versCle) return e;
  const [genre, id] = [versCle.slice(0, 1), versCle.slice(2)];
  const [genreDe, idDe] = [deCle.slice(0, 1), deCle.slice(2)];
  if (genre !== genreDe) return e;
  if (genre === "c") return { ...e, chantierId: id || null };
  const champ = genre === "s" ? "employeId" : genre === "e" ? "equipeId" : "ressourceId";
  const restantes = e.affectations.filter((a) => a[champ] !== idDe);
  const deja = restantes.some((a) => a[champ] === id);
  return { ...e, affectations: id && !deja ? [...restantes, { [champ]: id }] : restantes };
}

export function dupliquer(e: Evenement, nouvelId: string, deltaMinutes = 0): Evenement {
  return deplacer({ ...e, id: nouvelId, statut: "planifie" }, deltaMinutes);
}

export function couleurDe(e: Pick<Evenement, "type" | "couleur">): string {
  return e.couleur ?? TYPES_EVENEMENT.find((t) => t.cle === e.type)?.couleur ?? "#475569";
}

export const heureFr = (iso: string) => { const l = local(iso); return `${String(l.heure).padStart(2, "0")}:${String(l.minute).padStart(2, "0")}`; };
