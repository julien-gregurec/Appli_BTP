/**
 * ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1 — preuve d'échelle contre un VRAI
 * PostgREST (db-max-rows = 1000, comme supabase/config.toml) et la vérité
 * PostgreSQL (superutilisateur, sans RLS ni plafond).
 *
 * Pour chaque volume du jeu scripts/qualification/gp-residual/seed.sql
 * (500, 1 000, 1 462, 5 000, 20 000 lignes par chemin) :
 *   1. vérité : la formule de l'écran recalculée en SQL ;
 *   2. chemin HISTORIQUE rejoué à l'identique (mêmes select, même addition
 *      côté Next) → faux dès que le volume dépasse 1 000 (preuve RED) ;
 *   3. chemin CORRIGÉ (src/lib/fiches-agregats.ts, pilotage-agregats.ts,
 *      lecture-complete.ts) → égal à la vérité, au centime (GREEN).
 * Les durées et tailles de réponse sont écrites dans GP_RESIDUEL_MESURES.
 *
 * Ignoré sans pile locale. Lancer (voir le rapport, § Reproduire) :
 *   GP_RESIDUEL_URL=http://localhost:3011 GP_RESIDUEL_DB=gpres \
 *   npx vitest run src/lib/gp-residuel.postgrest.test.ts
 */
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { lireChantiersClient, lireContenuDoe, lireCurseur, lireDocumentsChantier, lirePageCurseur, lireSyntheseChantier, lireSyntheseClient, lireSyntheseDepenses, lireSyntheseMissionsSousTraitant, lireSyntheseParc, type Curseur } from "@/lib/fiches-agregats";
import { lireAlertesParc, lireAlertesStock, lireContenuExportPaie, lireDashboardChantiers, lirePageDossiersPaie, lireSyntheseCrm, lireSyntheseNotesFraisParEmploye, lireSynthesePaie } from "@/lib/pilotage-agregats";
import { lireToutesLesLignes } from "@/lib/supabase/lecture-complete";

const URL_BANC = process.env.GP_RESIDUEL_URL;
const DB = process.env.GP_RESIDUEL_DB ?? "gpres";
const MESURES = process.env.GP_RESIDUEL_MESURES;
const SECRET = process.env.GP_RESIDUEL_JWT_SECRET ?? "elsatia-local-perf-jwt-secret-0123456789abcdef";
const VOLUMES = [
  { n: 500, p: "a0500" },
  { n: 1000, p: "a1000" },
  { n: 1462, p: "a1462" },
  { n: 5000, p: "a5000" },
  { n: 20000, p: "a2000" },
] as const;
const TEMOIN = "ae000";

const uuid = (prefixe: string, n: number) => `${prefixe}${n.toString(16).padStart(32 - prefixe.length, "0")}`.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
const ids = (p: string) => ({
  e: uuid(`${p}e`, 1), admin: uuid(`${p}a`, 1), ouvrier: uuid(`${p}a`, 2), client: uuid(`${p}c`, 1), st: uuid(`${p}d`, 1),
  vehicule: uuid(`${p}f`, 1), outil: uuid(`${p}f`, 2), chantier: uuid(`${p}ca`, 1), periode: uuid(`${p}e5`, 1), conversation: uuid(`${p}e6`, 1),
});

function jwt(sub: string) {
  const b64 = (objet: object) => Buffer.from(JSON.stringify(objet)).toString("base64url");
  const corps = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${corps}.${createHmac("sha256", SECRET).update(corps).digest("base64url")}`;
}

function client(sub: string) {
  const mesure = { octets: 0, requetes: 0 };
  const fetchMesure: typeof fetch = async (entree, init) => {
    const reponse = await fetch(entree, init);
    mesure.octets += (await reponse.clone().arrayBuffer()).byteLength;
    mesure.requetes += 1;
    return reponse;
  };
  const rest = new PostgrestClient(URL_BANC!, { headers: { Authorization: `Bearer ${jwt(sub)}` }, fetch: fetchMesure });
  return { sb: rest as unknown as SupabaseClient, mesure };
}

function verite(sql: string): number[] {
  return execFileSync("su", ["postgres", "-c", `psql -X -At -F '|' -d ${DB}`], { input: sql, encoding: "utf8" }).trim().split("|").map(Number);
}

const centimes = (x: number) => Math.round(x * 100);
const somme = <T,>(lignes: T[] | null, f: (l: T) => number) => (lignes ?? []).reduce((s, l) => s + f(l), 0);

async function chrono<T>(f: () => Promise<T>): Promise<{ r: T; ms: number }> {
  const debut = performance.now();
  const r = await f();
  return { r, ms: Math.round(performance.now() - debut) };
}

function noter(chemin: string, n: number, valeurs: Record<string, unknown>) {
  if (MESURES) appendFileSync(MESURES, `${JSON.stringify({ chemin, n, ...valeurs })}\n`);
}

/** Le chemin historique doit être exact jusqu'à 1 000 lignes et faux au-delà (preuve RED rejouée). */
function attendreHistorique(n: number, historique: number, vrai: number) {
  if (n <= 1000) expect(historique).toBe(vrai);
  else expect(historique).not.toBe(vrai);
}

describe.skipIf(!URL_BANC)("GP résiduel : exactitude au-delà de 1 000 lignes (PostgREST réel, max_rows = 1000)", () => {
  for (const { n, p } of VOLUMES) {
    const id = ids(p);

    it(`fiche client — facturé / encaissé (${n} factures)`, async () => {
      const [facture, paye] = verite(`select sum(montant_ttc) filter (where statut <> 'annulee'), sum(montant_paye) from factures where client_id = '${id.client}'`);
      const { sb } = client(id.admin);
      const h = await chrono(async () => (await sb.from("factures").select("id, numero, statut, date_emission, montant_ttc, montant_paye").eq("client_id", id.client).eq("entreprise_id", id.e).order("created_at", { ascending: false })).data);
      const hFacture = somme(h.r, (f) => (f.statut !== "annulee" ? Number(f.montant_ttc) : 0));
      attendreHistorique(n, centimes(hFacture), centimes(facture));
      const c = await chrono(() => lireSyntheseClient(sb, id.e, id.client));
      expect(centimes(c.r.totalFacture)).toBe(centimes(facture));
      expect(centimes(c.r.totalPaye)).toBe(centimes(paye));
      expect(c.r.nbFactures).toBe(n);
      noter("fiche client", n, { avant_ms: h.ms, apres_ms: c.ms, avant_lignes: h.r?.length, verite: facture, historique: hFacture, corrige: c.r.totalFacture });
    }, 120_000);

    it(`fiche client — chantiers paginés complets (${n} chantiers)`, async () => {
      const { sb } = client(id.admin);
      const h = (await sb.from("chantiers").select("id, reference_interne, nom, statut, ville").eq("client_id", id.client).order("created_at", { ascending: false })).data ?? [];
      attendreHistorique(n, h.length, n);
      const premiere = await chrono(() => lireChantiersClient(sb, id.e, id.client, 50, null));
      expect(premiere.r.lignes).toHaveLength(50);
      if (n <= 1462) {
        const vus = new Set<string>();
        let curseur: Curseur | null = null;
        for (;;) {
          const page = await lireChantiersClient(sb, id.e, id.client, 200, curseur);
          for (const ligne of page.lignes) vus.add(ligne.id);
          if (!page.suivant) break;
          curseur = lireCurseur(page.suivant);
        }
        expect(vus.size).toBe(n);
      }
      noter("fiche client chantiers", n, { avant_lignes: h.length, premiere_page_ms: premiere.ms });
    }, 120_000);

    it(`fiche sous-traitant — facturé HT / réglé, missions (${n})`, async () => {
      const [ht, regle] = verite(`select sum(montant_ht) filter (where statut <> 'annulee'), sum(montant_regle) from depenses_fournisseurs where fournisseur_id = '${id.st}'`);
      const [prev, actives] = verite(`select sum(montant_previsionnel_ht) filter (where statut <> 'annulee'), count(*) filter (where statut in ('prevue','en_cours')) from sous_traitants_chantiers where fournisseur_id = '${id.st}'`);
      const { sb } = client(id.admin);
      const h = await chrono(async () => Promise.all([
        sb.from("sous_traitants_chantiers").select("id,mission,date_debut,date_fin,montant_previsionnel_ht,statut,notes,chantier:chantiers(id,nom,reference_interne)").eq("entreprise_id", id.e).eq("fournisseur_id", id.st).order("created_at", { ascending: false }),
        sb.from("depenses_fournisseurs").select("id,numero_piece,date_piece,date_echeance,montant_ht,montant_ttc,montant_regle,statut,chantier:chantiers(id,nom)").eq("entreprise_id", id.e).eq("fournisseur_id", id.st).order("date_piece", { ascending: false }),
      ]));
      const hHt = somme(h.r[1].data, (f) => (f.statut !== "annulee" ? Number(f.montant_ht) : 0));
      const hPrev = somme(h.r[0].data, (a) => (a.statut !== "annulee" ? Number(a.montant_previsionnel_ht) : 0));
      attendreHistorique(n, centimes(hHt), centimes(ht));
      attendreHistorique(n, centimes(hPrev), centimes(prev));
      const c = await chrono(() => Promise.all([lireSyntheseDepenses(sb, id.e, { fournisseurId: id.st }), lireSyntheseMissionsSousTraitant(sb, id.e, id.st)]));
      expect(centimes(c.r[0].totalHt)).toBe(centimes(ht));
      expect(centimes(c.r[0].totalRegle)).toBe(centimes(regle));
      expect(centimes(c.r[1].previsionnelHt)).toBe(centimes(prev));
      expect(c.r[1].nbActives).toBe(actives);
      noter("fiche sous-traitant", n, { avant_ms: h.ms, apres_ms: c.ms, verite: ht, historique: hHt, corrige: c.r[0].totalHt });
    }, 120_000);

    it(`fiches véhicule et outil — coût TTC (${n} factures chacun) et historiques`, async () => {
      const [veh] = verite(`select sum(montant_ttc) filter (where statut <> 'annulee') from depenses_fournisseurs where vehicule_id = '${id.vehicule}'`);
      const [out] = verite(`select sum(montant_ttc) filter (where statut <> 'annulee') from depenses_fournisseurs where outil_id = '${id.outil}'`);
      const { sb } = client(id.admin);
      const h = await chrono(async () => Promise.all([
        sb.from("depenses_fournisseurs").select("id,numero_piece,date_piece,montant_ttc,statut,categorie,travaux_effectues,justificatif_storage_path,fournisseur:fournisseurs(nom),chantier:chantiers(id,nom)").eq("vehicule_id", id.vehicule).eq("entreprise_id", id.e).order("date_piece", { ascending: false }),
        sb.from("depenses_fournisseurs").select("id,numero_piece,date_piece,montant_ttc,statut,justificatif_storage_path,fournisseur:fournisseurs(nom)").eq("outil_id", id.outil).eq("entreprise_id", id.e).order("date_piece", { ascending: false }),
      ]));
      attendreHistorique(n, centimes(somme(h.r[0].data, (d) => (d.statut !== "annulee" ? Number(d.montant_ttc) : 0))), centimes(veh));
      attendreHistorique(n, centimes(somme(h.r[1].data, (d) => (d.statut !== "annulee" ? Number(d.montant_ttc) : 0))), centimes(out));
      const c = await chrono(() => Promise.all([lireSyntheseDepenses(sb, id.e, { vehiculeId: id.vehicule }), lireSyntheseDepenses(sb, id.e, { outilId: id.outil })]));
      expect(centimes(c.r[0].totalTtc)).toBe(centimes(veh));
      expect(centimes(c.r[1].totalTtc)).toBe(centimes(out));
      // Historique kilométrique : parcours complet par curseur, sans doublon.
      const releves = (await sb.from("releves_kilometrage").select("id").eq("vehicule_id", id.vehicule).eq("entreprise_id", id.e).order("date_releve", { ascending: false })).data ?? [];
      attendreHistorique(n, releves.length, n);
      const derniere = await chrono(() => lirePageCurseur<{ id: string; date_releve: string }>(sb.from("releves_kilometrage").select("*").eq("vehicule_id", id.vehicule).eq("entreprise_id", id.e) as never, "date_releve", 50, { date: "2020-01-05", id: "ffffffff-ffff-ffff-ffff-ffffffffffff" }));
      if (n <= 1462) {
        const vus = new Set<string>();
        let curseur: Curseur | null = null;
        for (;;) {
          const page = await lirePageCurseur<{ id: string; date_releve: string }>(sb.from("releves_kilometrage").select("id,date_releve").eq("vehicule_id", id.vehicule).eq("entreprise_id", id.e) as never, "date_releve", 250, curseur);
          for (const ligne of page.lignes) vus.add(ligne.id);
          if (!page.suivant) break;
          curseur = lireCurseur(page.suivant);
        }
        expect(vus.size).toBe(n);
      }
      // Bandeaux /outillage et /flotte : compteurs du parc (V + 1 outils, V + 1 véhicules).
      const [nbOutils, outilsEchus, horsService, nbVehicules, vehiculesEchus] = verite(`select (select count(*) from outils where entreprise_id = '${id.e}'), (select count(*) from outils where entreprise_id = '${id.e}' and prochaine_verification <= current_date), (select count(*) from outils where entreprise_id = '${id.e}' and statut = 'hors_service'), (select count(*) from vehicules where entreprise_id = '${id.e}'), (select count(*) from vehicules where entreprise_id = '${id.e}' and (controle_technique_echeance <= current_date or assurance_echeance <= current_date or prochain_entretien_date <= current_date))`);
      const hOutils = (await sb.from("outils").select("id,statut,prochaine_verification").eq("entreprise_id", id.e).order("reference")).data ?? [];
      attendreHistorique(n + 1, hOutils.length, nbOutils);
      const aujourdhui = execFileSync("su", ["postgres", "-c", `psql -X -At -d ${DB}`], { input: "select current_date", encoding: "utf8" }).trim();
      const parc = await lireSyntheseParc(sb, id.e, aujourdhui);
      expect(parc.outils).toEqual({ nb: nbOutils, alertes: outilsEchus, horsService });
      expect(parc.vehicules).toEqual({ nb: nbVehicules, alertes: vehiculesEchus });
      noter("fiches véhicule/outil", n, { verite_outils: nbOutils, historique_outils: hOutils.length, avant_ms: h.ms, apres_ms: c.ms, page_profonde_ms: derniere.ms, verite_vehicule: veh, corrige_vehicule: c.r[0].totalTtc });
    }, 180_000);

    it(`fiche chantier — documents (${n}), synthèse chiffrée, DOE`, async () => {
      const [docs] = verite(`select count(*) from documents_chantier where chantier_id = '${id.chantier}'`);
      const [ttc, regle] = verite(`select sum(montant_ttc) filter (where statut <> 'annulee'), sum(montant_regle) from depenses_fournisseurs where chantier_id = '${id.chantier}'`);
      const [nbNotes, notesValidees, notesEnCours] = verite(`select count(*), sum(montant_ttc) filter (where statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')), sum(montant_ttc) filter (where statut not in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee','refuse','refusee')) from notes_frais where chantier_id = '${id.chantier}'`);
      const [articles, fiches] = verite(`select count(distinct article_id), (select count(*) from fiches_techniques_articles f where f.article_id in (select article_id from mouvements_stock where chantier_id = '${id.chantier}' and type = 'sortie')) from mouvements_stock where chantier_id = '${id.chantier}' and type = 'sortie'`);
      const { sb, mesure } = client(id.admin);
      const h = await chrono(async () => (await sb.from("documents_chantier").select("id,nom,categorie,note,mime_type,audience,created_at").eq("chantier_id", id.chantier).eq("entreprise_id", id.e).order("created_at", { ascending: false })).data ?? []);
      attendreHistorique(n, h.r.length, docs);
      const c = await chrono(() => lireDocumentsChantier(sb, id.e, id.chantier, 6, null));
      expect(c.r.total).toBe(docs);
      const v1 = await chrono(async () => { const avant = mesure.octets; await sb.rpc("chantier_donnees_chiffrees", { p_entreprise_id: id.e, p_chantier_id: id.chantier, p_heures: false, p_achats: true, p_notes: true }); return mesure.octets - avant; });
      const v2 = await chrono(async () => { const avant = mesure.octets; const s = await lireSyntheseChantier(sb, id.e, id.chantier, { achats: true, notes: true }); return { s, octets: mesure.octets - avant }; });
      expect(centimes(v2.r.s.facturesFournisseurs.totalTtc)).toBe(centimes(ttc));
      expect(centimes(v2.r.s.facturesFournisseurs.totalRegle)).toBe(centimes(regle));
      expect(v2.r.s.notesFrais.nb).toBe(nbNotes);
      expect(centimes(v2.r.s.notesFrais.totalValidees)).toBe(centimes(notesValidees));
      expect(centimes(v2.r.s.notesFrais.totalEnCours)).toBe(centimes(notesEnCours));
      expect(v2.r.s.notesFrais.liste.length).toBeLessThanOrEqual(50);
      // DOE : historique (3 lectures plafonnées) vs contenu complet.
      const hMouvements = (await sb.from("mouvements_stock").select("article_id").eq("entreprise_id", id.e).eq("chantier_id", id.chantier).eq("type", "sortie")).data ?? [];
      attendreHistorique(n, new Set(hMouvements.map((m) => m.article_id)).size, articles);
      const doe = await chrono(() => lireContenuDoe(sb, id.e, id.chantier));
      expect(doe.r.documents).toHaveLength(docs);
      expect(doe.r.articleIds).toHaveLength(articles);
      expect(doe.r.fichesTechniques).toHaveLength(fiches);
      noter("fiche chantier", n, { documents_avant_ms: h.ms, documents_apres_ms: c.ms, synthese_v1_ms: v1.ms, synthese_v1_octets: v1.r, synthese_v2_ms: v2.ms, synthese_v2_octets: v2.r.octets, doe_ms: doe.ms, verite_documents: docs, historique_documents: h.r.length });
    }, 180_000);

    it(`paie — indicateurs de période, anomalies, export complet (${n} dossiers)`, async () => {
      const [primes, notes, acomptes, indemnites, nbAnomalies] = verite(`select sum(total_primes), sum(total_notes_frais), sum(total_acomptes), sum(total_paniers + total_trajets + total_transports + total_grands_deplacements), (select count(*) from anomalies_paie where periode_id = '${id.periode}' and corrigee_at is null) from dossiers_paie_salaries where periode_id = '${id.periode}'`);
      const [pieces] = verite(`select count(*) from pieces_jointes_paie where dossier_id in (select id from dossiers_paie_salaries where periode_id = '${id.periode}')`);
      const { sb } = client(id.admin);
      // Historique : addition sur la page de 25 dossiers affichée.
      const h = await chrono(async () => (await sb.from("dossiers_paie_salaries").select("id,total_primes,employe:employes!inner(nom)", { count: "exact" }).eq("periode_id", id.periode).eq("entreprise_id", id.e).order("nom", { referencedTable: "employes" }).range(0, 24)).data ?? []);
      expect(centimes(somme(h.r, (d) => Number(d.total_primes)))).not.toBe(centimes(primes));
      const hAnomalies = (await sb.from("anomalies_paie").select("id").eq("periode_id", id.periode).is("corrigee_at", null).order("niveau")).data ?? [];
      attendreHistorique(n, hAnomalies.length, nbAnomalies);
      const c = await chrono(() => lireSynthesePaie(sb, id.e, id.periode, {}));
      expect(centimes(c.r.primes)).toBe(centimes(primes));
      expect(centimes(c.r.notesFrais)).toBe(centimes(notes));
      expect(centimes(c.r.acomptes)).toBe(centimes(acomptes));
      expect(centimes(c.r.indemnitesDeplacement)).toBe(centimes(indemnites));
      expect(c.r.nbAnomalies).toBe(nbAnomalies);
      expect(c.r.nb).toBe(n);
      // Filtre statut : identique au filtre de la liste.
      const [nbControle] = verite(`select count(*) from dossiers_paie_salaries where periode_id = '${id.periode}' and statut = 'a_controler'`);
      expect((await lireSynthesePaie(sb, id.e, id.periode, { statut: "a_controler" })).nb).toBe(nbControle);
      // Page de dossiers et export : servis en base (visibilité évaluée une fois).
      const pageDossiers = await chrono(() => lirePageDossiersPaie<{ id: string }>(sb, id.e, id.periode, {}, 25, Math.max(0, n - 25)));
      expect(pageDossiers.r.total).toBe(n);
      expect(pageDossiers.r.lignes).toHaveLength(25);
      const e = await chrono(async () => {
        const contenu = await lireContenuExportPaie<{ id: string }, { id: string }>(sb, id.e, id.periode, true);
        return { dossiers: contenu.dossiers.length, pieces: contenu.pieces.length };
      });
      expect(e.r.dossiers).toBe(n);
      expect(e.r.pieces).toBe(pieces);
      noter("paie", n, { avant_ms: h.ms, apres_ms: c.ms, page_dossiers_ms: pageDossiers.ms, export_ms: e.ms, verite_primes: primes, historique_primes_page: somme(h.r, (d) => Number(d.total_primes)), corrige_primes: c.r.primes });
    }, 300_000);

    it(`notes de frais — groupes de validation par salarié (${n} notes)`, async () => {
      const lignes = execFileSync("su", ["postgres", "-c", `psql -X -At -F '|' -d ${DB}`], { input: `select employe_id, count(*), sum(montant_ttc), count(*) filter (where statut in ('soumis','en_verification','correction_demandee')) from notes_frais where entreprise_id = '${id.e}' group by employe_id`, encoding: "utf8" }).trim().split("\n").map((l) => l.split("|"));
      const vrai = new Map(lignes.map(([emp, nb, total, av]) => [emp, { nb: Number(nb), total: Number(total), aVerifier: Number(av) }]));
      const { sb } = client(id.admin);
      const h = (await sb.from("notes_frais").select("id,montant_ttc,statut,employe_id").eq("entreprise_id", id.e).order("date_frais", { ascending: false }).limit(300)).data ?? [];
      const hAVerifier = h.filter((note) => ["soumis", "en_verification", "correction_demandee"].includes(note.statut)).length;
      const vraiAVerifier = [...vrai.values()].reduce((s, g) => s + g.aVerifier, 0);
      expect(hAVerifier).toBeLessThan(vraiAVerifier); // historique : 300 notes les plus récentes seulement
      const c = await chrono(() => lireSyntheseNotesFraisParEmploye(sb, id.e, {}));
      expect(c.r).toHaveLength(vrai.size);
      for (const g of c.r) {
        const v = vrai.get(g.employeId ?? "")!;
        expect(g.nb).toBe(v.nb);
        expect(centimes(g.total)).toBe(centimes(v.total));
        expect(g.aVerifier).toBe(v.aVerifier);
      }
      noter("notes de frais", n, { apres_ms: c.ms, verite_a_verifier: vraiAVerifier, historique_a_verifier: hAVerifier });
    }, 120_000);

    it(`CRM et tableau de bord (${n})`, async () => {
      const [nbRel, reste] = verite(`select count(*), sum(montant_ttc - montant_paye) from factures where entreprise_id = '${id.e}' and statut in ('envoyee','payee_partiel','en_retard') and montant_ttc > montant_paye`);
      const [rappels] = verite(`select count(*) from appels_contacts where entreprise_id = '${id.e}' and not coalesce(termine,false) and a_rappeler_at is not null`);
      const [actifs, alertesStock] = verite(`select count(*) filter (where statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause')), (select count(*) from articles_stock where entreprise_id = '${id.e}' and actif and quantite_stock <= seuil_alerte) from chantiers where entreprise_id = '${id.e}'`);
      const { sb } = client(id.admin);
      const h = await chrono(async () => (await sb.from("factures").select("id,montant_ttc,montant_paye").eq("entreprise_id", id.e).in("statut", ["envoyee", "payee_partiel", "en_retard"]).order("date_echeance")).data ?? []);
      const hReste = somme(h.r.filter((f) => Number(f.montant_ttc) > Number(f.montant_paye)), (f) => Number(f.montant_ttc) - Number(f.montant_paye));
      attendreHistorique(n, centimes(hReste), centimes(reste));
      const c = await chrono(() => lireSyntheseCrm(sb, id.e));
      expect(c.r.nbARelancer).toBe(nbRel);
      expect(centimes(c.r.resteAEncaisser)).toBe(centimes(reste));
      expect(c.r.rappelsOuverts).toBe(rappels);
      const hd = await chrono(async () => (await sb.from("chantiers").select("id, nom, statut, date_fin_prevue").eq("entreprise_id", id.e).order("updated_at", { ascending: false })).data ?? []);
      const d = await chrono(() => Promise.all([lireDashboardChantiers(sb, id.e, "2026-10-01"), lireAlertesStock(sb, id.e, 50)]));
      expect(d.r[0].parStatut.reduce((s, x) => s + x.nb, 0)).toBe(n + 1);
      expect(d.r[0].nbActifs).toBe(actifs);
      expect(d.r[1].nb).toBe(alertesStock);
      const [outilsAlerte, vehiculesAlerte] = verite(`select (select count(*) from outils where entreprise_id = '${id.e}' and statut not in ('hors_service','perdu') and prochaine_verification <= current_date + 30), (select count(*) from vehicules where entreprise_id = '${id.e}' and statut in ('actif','maintenance') and (controle_technique_echeance <= current_date + 30 or assurance_echeance <= current_date + 30 or prochain_entretien_date <= current_date + 30 or (prochain_entretien_km is not null and kilometrage >= prochain_entretien_km)))`);
      const jour = execFileSync("su", ["postgres", "-c", `psql -X -At -d ${DB}`], { input: "select current_date", encoding: "utf8" }).trim();
      const parc = await lireAlertesParc(sb, id.e, jour);
      expect(parc.nbOutils).toBe(outilsAlerte);
      expect(parc.nbVehicules).toBe(vehiculesAlerte);
      expect(parc.outils.length).toBe(Math.min(200, outilsAlerte));
      const [effectif] = verite(`select count(*) from employes where entreprise_id = '${id.e}' and statut = 'actif'`);
      const hEffectif = (await sb.from("employes").select("id").eq("entreprise_id", id.e).eq("statut", "actif")).data ?? [];
      attendreHistorique(n, hEffectif.length, effectif);
      expect(Number((await sb.rpc("gp_effectif_actif", { p_entreprise_id: id.e })).data)).toBe(effectif);
      noter("crm/dashboard", n, { crm_avant_ms: h.ms, crm_apres_ms: c.ms, dashboard_chantiers_avant_ms: hd.ms, dashboard_apres_ms: d.ms, verite_reste: reste, historique_reste: hReste });
    }, 180_000);

    it(`listes : messagerie, interventions, commandes, droits (${n})`, async () => {
      const { sb } = client(id.admin);
      const [dernierMessage] = execFileSync("su", ["postgres", "-c", `psql -X -At -d ${DB}`], { input: `select id from messages_internes where conversation_id = '${id.conversation}' order by created_at desc, id desc limit 1`, encoding: "utf8" }).trim().split("\n");
      const hMessages = (await sb.from("messages_internes").select("id").eq("conversation_id", id.conversation).order("created_at")).data ?? [];
      expect(hMessages.some((m) => m.id === dernierMessage)).toBe(n <= 1000);
      const page = await lirePageCurseur<{ id: string; created_at: string }>(sb.from("messages_internes").select("id,created_at").eq("conversation_id", id.conversation) as never, "created_at", 200, null);
      expect(page.lignes[0].id).toBe(dernierMessage);
      const [ouvertes] = verite(`select count(*) from interventions where entreprise_id = '${id.e}' and statut in ('a_planifier','planifiee','en_cours')`);
      const hInterventions = (await sb.from("interventions").select("id,statut").eq("entreprise_id", id.e).order("date_prevue", { ascending: true })).data ?? [];
      attendreHistorique(n, hInterventions.filter((i) => ["a_planifier", "planifiee", "en_cours"].includes(i.statut)).length, ouvertes);
      const [droits] = verite(`select count(*) from permissions_poste where entreprise_id = '${id.e}' and autorise`);
      const hDroits = (await sb.from("permissions_poste").select("poste_id, cle_permission, autorise").eq("entreprise_id", id.e).eq("autorise", true)).data ?? [];
      expect(hDroits.length).toBeLessThan(droits);
      const cDroits = await lireToutesLesLignes<{ poste_id: string }>((o) => sb.from("permissions_poste").select("poste_id, cle_permission, autorise", o).eq("entreprise_id", id.e).eq("autorise", true).order("poste_id").order("cle_permission"));
      expect(cDroits.data).toHaveLength(droits);
      noter("listes", n, { messages_historique_contient_dernier: hMessages.some((m) => m.id === dernierMessage), droits_verite: droits, droits_historique: hDroits.length });
    }, 120_000);

    it(`sécurité — profil sans droit finance et autre tenant (${n})`, async () => {
      const { sb } = client(id.ouvrier);
      const d = await lireSyntheseDepenses(sb, id.e, { vehiculeId: id.vehicule });
      expect(d).toEqual({ nb: 0, nbActives: 0, totalHt: 0, totalTtc: 0, totalRegle: 0 });
      expect((await lireSyntheseClient(sb, id.e, id.client)).nbFactures).toBe(0);
      const docs = await lireDocumentsChantier(sb, id.e, id.chantier, 6, null);
      expect(docs.total).toBe(0);
      expect((await lireSyntheseCrm(sb, id.e)).resteAEncaisser).toBe(0);
      expect((await lireSynthesePaie(sb, id.e, id.periode, {})).nb).toBe(1); // son propre dossier, comme la RLS
      const admin = client(id.admin).sb;
      const autre = ids(TEMOIN);
      for (const appel of [
        () => lireSyntheseDepenses(admin, autre.e, { vehiculeId: autre.vehicule }),
        () => lireSyntheseClient(admin, autre.e, autre.client),
        () => lireDocumentsChantier(admin, autre.e, autre.chantier, 6, null),
        () => lireSynthesePaie(admin, autre.e, autre.periode, {}),
        () => lireContenuDoe(admin, autre.e, autre.chantier),
        () => lireSyntheseNotesFraisParEmploye(admin, autre.e, {}),
        () => lireDashboardChantiers(admin, autre.e, "2026-10-01"),
      ]) await expect(appel()).rejects.toThrow(/GP_AGREGAT_REFUSE/);
    }, 120_000);
  }
});
