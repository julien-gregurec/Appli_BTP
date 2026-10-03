/**
 * ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 — test d'échelle contre un VRAI
 * PostgREST (db-max-rows = 1000, comme supabase/config.toml) et la vérité
 * PostgreSQL (superutilisateur, sans RLS ni plafond).
 *
 * Pour chaque volume (jeu scripts/perf/rentabilite_charge.sql) :
 *   1. vérité DB : formule de /rentabilite recalculée en SQL, sans RLS ;
 *   2. chemin HISTORIQUE (V7) rejoué à l'identique : mêmes select, mêmes
 *      filtres, même addition côté Next → faux dès que le jeu dépasse 1 000 lignes ;
 *   3. chemin CORRIGÉ (src/lib/rentabilite.ts) → égal à la vérité, au centime.
 *
 * Ignoré sans pile locale. Lancer (voir le rapport, § Reproduire) :
 *   GP_RENTABILITE_VOLUMES="500=http://localhost:3011=rent_500,1462=http://localhost:3013=rent_1462" \
 *   npx vitest run src/lib/rentabilite.integration.test.ts
 */
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { lireHeuresChantier, lirePagePointagesValidesChantier, lireRentabiliteChantier, lireRentabilitePage, lireRentabiliteTotaux, lireToutesRentabilitesChantiers } from "@/lib/rentabilite";

const VOLUMES = (process.env.GP_RENTABILITE_VOLUMES ?? "")
  .split(",")
  .filter(Boolean)
  .map((entree) => {
    const [n, url, db] = entree.split("=");
    return { n: Number(n), url, db };
  });
const SECRET = process.env.GP_RENTABILITE_JWT_SECRET ?? "elsatia-local-perf-jwt-secret-0123456789abcdef";
const ENTREPRISE = "a0000000-0000-0000-0000-000000000001";
const DIRIGEANT = "10000000-0000-0000-0000-000000000006";
const CHANTIER_CHARGE = "Charge rentabilité V1 - 01";

function jwt(sub: string) {
  const b64 = (objet: object) => Buffer.from(JSON.stringify(objet)).toString("base64url");
  const corps = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${corps}.${createHmac("sha256", SECRET).update(corps).digest("base64url")}`;
}

/** Client PostgREST mesuré : durée cumulée et octets reçus. */
function client(url: string, sub: string) {
  const mesure = { octets: 0, requetes: 0, lignesTronquees: [] as string[] };
  const fetchMesure: typeof fetch = async (entree, init) => {
    const reponse = await fetch(entree, init);
    const corps = await reponse.clone().arrayBuffer();
    mesure.octets += corps.byteLength;
    mesure.requetes += 1;
    // Sans « Prefer: count », PostgREST répond « 0-999/* » : une réponse de
    // 1 000 lignes exactement est au plafond max_rows, donc potentiellement tronquée.
    const plage = reponse.headers.get("content-range") ?? "";
    if (/^0-999\//.test(plage)) mesure.lignesTronquees.push(`${String(entree).split("?")[0]} ${plage}`);
    return reponse;
  };
  const rest = new PostgrestClient(url, { headers: { Authorization: `Bearer ${jwt(sub)}` }, fetch: fetchMesure });
  return { supabase: rest as unknown as SupabaseClient, mesure };
}

function psql(db: string, sql: string): string {
  return execFileSync("su", ["postgres", "-c", `psql -X -At -F '|' -d ${db}`], { input: sql, encoding: "utf8" }).trim();
}

type Totaux = { facture: number; heures: number; coutMo: number; achats: number; sousTraitance: number; stock: number; notes: number; indemnites: number; marge: number };

/** Vérité PostgreSQL (superutilisateur) : formule de /rentabilite, toutes lignes, sans plafond. */
function verite(db: string): { totaux: Totaux; parChantier: Map<string, { heures: number; marge: number; coutMo: number; facture: number }>; chantierCharge: { id: string; heuresValidees: number; heuresPlanifiees: number; nbValides: number } } {
  const sql = `
    with ch as (select id from public.chantiers where entreprise_id = '${ENTREPRISE}'),
    l as (
      select ch.id,
        coalesce((select sum(montant_ht) from public.factures f where f.chantier_id = ch.id and f.statut not in ('annulee','avoir_emis')), 0) as facture,
        coalesce((select sum(p.heures_normales + p.heures_supplementaires) from public.pointages p where p.chantier_id = ch.id and p.verification_statut = 'valide'), 0) as heures,
        coalesce((select sum((p.heures_normales + p.heures_supplementaires) * coalesce(c.cout_horaire, 0)) from public.pointages p left join public.employes_cout_horaire c on c.employe_id = p.employe_id where p.chantier_id = ch.id and p.verification_statut = 'valide'), 0) as mo,
        coalesce((select sum(montant_ht) from public.depenses_fournisseurs d where d.chantier_id = ch.id and d.statut <> 'annulee' and d.categorie <> 'sous_traitance'), 0) as achats,
        coalesce((select sum(montant_ht) from public.depenses_fournisseurs d where d.chantier_id = ch.id and d.statut <> 'annulee' and d.categorie = 'sous_traitance'), 0) as st,
        coalesce((select sum(m.quantite * a.prix_achat_ht) from public.mouvements_stock m join public.articles_stock a on a.id = m.article_id where m.chantier_id = ch.id and m.type = 'sortie'), 0) as stock,
        coalesce((select sum(montant_ttc) from public.notes_frais n where n.chantier_id = ch.id and n.statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')), 0) as notes,
        coalesce((select sum(montant_total) from public.indemnites_deplacement_paie i where i.chantier_id = ch.id), 0) as ind
      from ch)
    select id, facture, heures, mo, achats, st, stock, notes, ind, facture - mo - achats - st - stock - notes - ind from l;`;
  const lignes = psql(db, sql).split("\n").map((ligne) => ligne.split("|"));
  const totaux: Totaux = { facture: 0, heures: 0, coutMo: 0, achats: 0, sousTraitance: 0, stock: 0, notes: 0, indemnites: 0, marge: 0 };
  const parChantier = new Map<string, { heures: number; marge: number; coutMo: number; facture: number }>();
  for (const [id, facture, heures, mo, achats, st, stock, notes, ind, marge] of lignes) {
    totaux.facture += Number(facture); totaux.heures += Number(heures); totaux.coutMo += Number(mo); totaux.achats += Number(achats);
    totaux.sousTraitance += Number(st); totaux.stock += Number(stock); totaux.notes += Number(notes); totaux.indemnites += Number(ind); totaux.marge += Number(marge);
    parChantier.set(id, { heures: Number(heures), marge: Number(marge), coutMo: Number(mo), facture: Number(facture) });
  }
  const [id, heuresValidees, heuresPlanifiees, nbValides] = psql(db, `
    select c.id,
      (select coalesce(sum(heures_normales + heures_supplementaires), 0) from public.pointages p where p.chantier_id = c.id and p.verification_statut = 'valide'),
      (select coalesce(sum(heures), 0) from public.affectations a where a.chantier_id = c.id),
      (select count(*) from public.pointages p where p.chantier_id = c.id and p.verification_statut = 'valide')
    from public.chantiers c where c.entreprise_id = '${ENTREPRISE}' and c.nom = '${CHANTIER_CHARGE}';`).split("|");
  return { totaux, parChantier, chantierCharge: { id, heuresValidees: Number(heuresValidees), heuresPlanifiees: Number(heuresPlanifiees), nbValides: Number(nbValides) } };
}

type Rel<T> = T | T[] | null;
const un = <T,>(valeur: Rel<T>): T | null => (Array.isArray(valeur) ? (valeur[0] ?? null) : valeur);

/** Chemin HISTORIQUE (V7) de /rentabilite, rejoué à l'identique (mêmes requêtes, même addition),
 *  avec la règle de CA corrigée par GP BUSINESS HARDENING V9.1 (B25) : émis net d'avoirs émis. */
async function historiqueRentabilite(supabase: SupabaseClient) {
  const [{ data: chantiers }, { data: factures }, { data: devis }, { data: donneesPointages }, { data: depenses }, { data: donneesIndemnites }, { data: donneesMouvementsStock }, { data: donneesNotesFrais }, { data: couts }] = await Promise.all([
    supabase.from("chantiers").select("id, reference_interne, nom, statut, client:clients(nom, prenom, societe)").eq("entreprise_id", ENTREPRISE).order("created_at", { ascending: false }),
    supabase.from("factures").select("chantier_id, montant_ht, statut, type").eq("entreprise_id", ENTREPRISE),
    supabase.from("devis").select("chantier_id, montant_ht, statut").eq("entreprise_id", ENTREPRISE).eq("statut", "accepte"),
    supabase.from("pointages").select("chantier_id, employe_id, heures_normales, heures_supplementaires").eq("entreprise_id", ENTREPRISE).eq("verification_statut", "valide"),
    supabase.from("depenses_fournisseurs").select("chantier_id, montant_ht, statut, categorie").eq("entreprise_id", ENTREPRISE),
    supabase.rpc("couts_indemnites_paie_par_chantier", { p_entreprise_id: ENTREPRISE }),
    supabase.from("mouvements_stock").select("chantier_id, quantite, article:articles_stock(prix_achat_ht)").eq("entreprise_id", ENTREPRISE).eq("type", "sortie").not("chantier_id", "is", null),
    supabase.from("notes_frais").select("chantier_id, montant_ttc, statut").eq("entreprise_id", ENTREPRISE).not("chantier_id", "is", null).in("statut", ["valide", "exporte_comptabilite", "verrouille", "archive", "validee", "remboursee"]),
    supabase.from("employes_cout_horaire").select("employe_id, cout_horaire").eq("entreprise_id", ENTREPRISE),
  ]);
  const pointages = (donneesPointages ?? []) as { chantier_id: string; employe_id: string; heures_normales: number; heures_supplementaires: number }[];
  const coutHoraireParEmploye = new Map((couts ?? []).map((cout) => [cout.employe_id, cout.cout_horaire]));
  const indemnitesPaie = (donneesIndemnites ?? []) as { chantier_id: string; total: number }[];
  const mouvementsStock = (donneesMouvementsStock ?? []) as { chantier_id: string; quantite: number; article: Rel<{ prix_achat_ht: number }> }[];
  const notesFrais = (donneesNotesFrais ?? []) as { chantier_id: string; montant_ttc: number }[];
  const lignes = (chantiers ?? []).map((chantier) => {
    const factureHt = (factures ?? []).filter((item) => item.chantier_id === chantier.id && !["brouillon", "annulee"].includes(item.statut)).reduce((s, item) => s + Number(item.montant_ht), 0);
    let heures = 0; let coutMainOeuvre = 0;
    for (const pointage of pointages.filter((item) => item.chantier_id === chantier.id)) {
      const total = Number(pointage.heures_normales) + Number(pointage.heures_supplementaires);
      heures += total; coutMainOeuvre += total * Number(coutHoraireParEmploye.get(pointage.employe_id) ?? 0);
    }
    const depensesChantier = (depenses ?? []).filter((item) => item.chantier_id === chantier.id && item.statut !== "annulee");
    const coutSousTraitance = depensesChantier.filter((item) => item.categorie === "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
    const coutAchats = depensesChantier.filter((item) => item.categorie !== "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
    const coutIndemnitesPaie = Number(indemnitesPaie.find((item) => item.chantier_id === chantier.id)?.total ?? 0);
    const coutStock = mouvementsStock.filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.quantite) * Number(un(item.article)?.prix_achat_ht ?? 0), 0);
    const coutNotesFrais = notesFrais.filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.montant_ttc), 0);
    const marge = factureHt - coutMainOeuvre - coutAchats - coutSousTraitance - coutIndemnitesPaie - coutStock - coutNotesFrais;
    return { id: chantier.id as string, factureHt, heures, coutMainOeuvre, coutAchats, coutSousTraitance, coutIndemnitesPaie, coutStock, coutNotesFrais, marge, budget: (devis ?? []).length };
  });
  const somme = (cle: keyof (typeof lignes)[number]) => lignes.reduce((s, ligne) => s + Number(ligne[cle]), 0);
  const totaux: Totaux = { facture: somme("factureHt"), heures: somme("heures"), coutMo: somme("coutMainOeuvre"), achats: somme("coutAchats"), sousTraitance: somme("coutSousTraitance"), stock: somme("coutStock"), notes: somme("coutNotesFrais"), indemnites: somme("coutIndemnitesPaie"), marge: somme("marge") };
  return { totaux, lignes };
}

/** Chemin HISTORIQUE (V7) de la section heures de la fiche chantier. */
async function historiqueFicheChantier(supabase: SupabaseClient, chantierId: string) {
  const [{ data: affectations }, { data: pointages }] = await Promise.all([
    supabase.from("affectations").select("heures").eq("chantier_id", chantierId).eq("entreprise_id", ENTREPRISE),
    supabase.from("pointages").select("id,date,heures_normales,heures_supplementaires,tache,verification_statut,employe:employes(prenom,nom)").eq("chantier_id", chantierId).eq("entreprise_id", ENTREPRISE).order("date", { ascending: false }),
  ]);
  const valides = (pointages ?? []).filter((p) => p.verification_statut === "valide");
  return {
    heuresPlanifiees: (affectations ?? []).reduce((total, item) => total + Number(item.heures ?? 0), 0),
    heuresValidees: valides.reduce((s, p) => s + Number(p.heures_normales) + Number(p.heures_supplementaires), 0),
    nbValides: valides.length,
  };
}

const centimes = (valeur: number) => Math.round(valeur * 100);
const ecartTotaux = (a: Totaux, b: Totaux) => (Object.keys(a) as (keyof Totaux)[]).filter((cle) => centimes(a[cle]) !== centimes(b[cle]));

describe.skipIf(VOLUMES.length === 0)("rentabilité et fiche chantier : exact au-delà de 1 000 lignes (vrai PostgREST)", () => {
  const mesures: Record<string, unknown>[] = [];

  for (const volume of VOLUMES) {
    it(`${volume.n} pointages : /rentabilite, IA, copilote et fiche chantier = vérité DB`, async () => {
      const attendu = verite(volume.db);

      // ── Chemin historique : faux dès que le jeu dépasse 1 000 lignes.
      const avant = client(volume.url, DIRIGEANT);
      const t0 = performance.now();
      const historique = await historiqueRentabilite(avant.supabase);
      const msAvant = performance.now() - t0;
      const ficheAvant = await historiqueFicheChantier(client(volume.url, DIRIGEANT).supabase, attendu.chantierCharge.id);
      const chantiersFauxAvant = historique.lignes.filter((l) => {
        const v = attendu.parChantier.get(l.id);
        return !v || centimes(v.heures) !== centimes(l.heures) || centimes(v.marge) !== centimes(l.marge);
      }).length;
      if (volume.n > 1000) {
        // Garde : le jeu déclenche réellement la troncature (sinon le test ne prouverait rien).
        expect(avant.mesure.lignesTronquees.length).toBeGreaterThan(0);
        expect(ecartTotaux(historique.totaux, attendu.totaux)).not.toEqual([]);
      }

      // ── Chemin corrigé : totaux en base, pages bornées.
      const apres = client(volume.url, DIRIGEANT);
      const t1 = performance.now();
      const [totaux, page, meilleurs] = await Promise.all([
        lireRentabiliteTotaux(apres.supabase, ENTREPRISE),
        lireRentabilitePage(apres.supabase, ENTREPRISE, { tri: "recent", limite: 50, decalage: 0 }),
        lireRentabilitePage(apres.supabase, ENTREPRISE, { tri: "marge_desc", limite: 8, decalage: 0, avecActivite: true }),
      ]);
      const msApres = performance.now() - t1;
      const octetsApres = apres.mesure.octets;
      expect(apres.mesure.lignesTronquees).toEqual([]);
      const corrige: Totaux = { facture: totaux.factureHt, heures: totaux.heures, coutMo: totaux.coutMainOeuvre, achats: totaux.coutAchats, sousTraitance: totaux.coutSousTraitance, stock: totaux.coutStock, notes: totaux.coutNotesFrais, indemnites: totaux.coutIndemnitesPaie, marge: totaux.marge };
      expect(ecartTotaux(corrige, attendu.totaux)).toEqual([]);
      expect(totaux.nbChantiers).toBe(attendu.parChantier.size);
      for (const ligne of [...page, ...meilleurs]) {
        const v = attendu.parChantier.get(ligne.chantierId)!;
        expect(centimes(ligne.heures)).toBe(centimes(v.heures));
        expect(centimes(ligne.coutMainOeuvre)).toBe(centimes(v.coutMo));
        expect(centimes(ligne.marge)).toBe(centimes(v.marge));
      }
      const margesTriees = [...attendu.parChantier.values()].filter((v) => v.facture > 0 || v.heures > 0).map((v) => centimes(v.marge)).sort((a, b) => b - a).slice(0, 8);
      expect(meilleurs.map((l) => centimes(l.marge))).toEqual(margesTriees);

      // Toutes les lignes (copilote) : chaque chantier une fois, exact.
      const toutes = await lireToutesRentabilitesChantiers(apres.supabase, ENTREPRISE, "marge_asc");
      expect(new Set(toutes.map((l) => l.chantierId)).size).toBe(attendu.parChantier.size);

      // Analyse IA : un chantier, > 1 000 pointages dès 2 000.
      const unChantier = await lireRentabiliteChantier(apres.supabase, ENTREPRISE, attendu.chantierCharge.id);
      expect(centimes(unChantier!.heures)).toBe(centimes(attendu.chantierCharge.heuresValidees));
      expect(centimes(unChantier!.marge)).toBe(centimes(attendu.parChantier.get(attendu.chantierCharge.id)!.marge));

      // Fiche chantier : heures planifiées / validées exactes.
      const heures = await lireHeuresChantier(apres.supabase, ENTREPRISE, attendu.chantierCharge.id);
      expect(centimes(heures.heuresValidees)).toBe(centimes(attendu.chantierCharge.heuresValidees));
      expect(centimes(heures.heuresPlanifiees)).toBe(centimes(attendu.chantierCharge.heuresPlanifiees));
      expect(heures.nbPointagesValides).toBe(attendu.chantierCharge.nbValides);

      // Fiche chantier : dernière page de la liste (la plus coûteuse), relue sous RLS.
      const derniere = Math.max(0, Math.ceil(heures.nbPointagesValides / 50) - 1) * 50;
      const t2 = performance.now();
      const ids = await lirePagePointagesValidesChantier(apres.supabase, ENTREPRISE, attendu.chantierCharge.id, { limite: 50, decalage: derniere });
      const { data: lignesPage } = await apres.supabase.from("pointages").select("id,date,heures_normales,heures_supplementaires,tache,verification_statut,employe:employes(prenom,nom)").eq("chantier_id", attendu.chantierCharge.id).eq("entreprise_id", ENTREPRISE).eq("verification_statut", "valide").in("id", ids);
      const msDernierePage = performance.now() - t2;
      const idsVerite = psql(volume.db, `select id from public.pointages where chantier_id = '${attendu.chantierCharge.id}' and verification_statut = 'valide' order by date desc, id limit 50 offset ${derniere};`).split("\n").filter(Boolean);
      expect(ids).toEqual(idsVerite);
      expect(lignesPage).toHaveLength(idsVerite.length);

      mesures.push({
        n: volume.n,
        veriteMarge: attendu.totaux.marge.toFixed(2), veriteHeures: attendu.totaux.heures.toFixed(2),
        avantMarge: historique.totaux.marge.toFixed(2), avantHeures: historique.totaux.heures.toFixed(2), avantChantiersFaux: `${chantiersFauxAvant}/${attendu.parChantier.size}`,
        avantMs: Math.round(msAvant), avantOctets: avant.mesure.octets, avantTronquees: avant.mesure.lignesTronquees.length,
        apresMarge: totaux.marge.toFixed(2), apresHeures: totaux.heures.toFixed(2), apresMs: Math.round(msApres), apresOctets: octetsApres,
        ficheAvant: `${ficheAvant.heuresValidees.toFixed(2)} h validées / ${ficheAvant.heuresPlanifiees.toFixed(2)} h planifiées (${ficheAvant.nbValides})`,
        ficheDernierePageMs: Math.round(msDernierePage),
        ficheVerite: `${attendu.chantierCharge.heuresValidees.toFixed(2)} / ${attendu.chantierCharge.heuresPlanifiees.toFixed(2)} (${attendu.chantierCharge.nbValides})`,
      });
    }, 120_000);
  }

  it.runIf(VOLUMES.length > 0)("mesures", () => {
    console.table(mesures);
    if (process.env.GP_RENTABILITE_MESURES) writeFileSync(process.env.GP_RENTABILITE_MESURES, JSON.stringify(mesures, null, 2));
  });
});
