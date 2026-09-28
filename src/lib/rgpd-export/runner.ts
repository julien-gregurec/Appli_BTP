// Worker d'export RGPD : prend UN job (bail exclusif), lit les données matérialisées page par page,
// copie les fichiers en flux, ajoute Studio (contrat inter-projets) et dépose une archive ZIP
// structurée. La complétude finale est décidée en base (rgpd_export_terminer) : le worker ne peut
// que la dégrader, jamais l'affirmer contre le manifeste.
//
// Mémoire bornée : une page de lignes (≤ 1 000) et un morceau de fichier à la fois ; le CSV d'une
// section est écrit sur disque pendant la même passe, puis versé dans l'archive. Seul l'index du
// manifeste (quelques centaines d'octets par fichier) reste en mémoire.
// Journalisation : événements et compteurs uniquement, jamais le contenu de l'archive.
import { createReadStream, createWriteStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ColonnesCsv } from "./csv";
import { EcrivainZip, nomEntreeSur } from "./zip";
import {
  FORMAT_EXPORT,
  LISEZ_MOI,
  cheminsArchive,
  type Categorie,
  type FichierIndex,
  type MetaExport,
  type SectionIndex,
  type StatutFichier,
  type StatutStudio,
  type TypeExport,
} from "./format";

// ── Ports ──────────────────────────────────────────────────────────────────────────────────────
export interface Reclamation {
  job_id: string;
  bail: string;
  tentative: number;
  type_export: TypeExport;
  entreprise_id: string | null;
  format_version: string;
  reprise: boolean;
  studio_sujet_connu: boolean;
}

export interface SectionBase {
  section: string;
  table_nom: string;
  entreprise_id: string | null;
  application: string;
  domaine: string;
  categorie: Categorie;
  nb_lignes: number;
}

export interface FichierBase {
  seq: number;
  section: string;
  ligne_id: string | null;
  colonne: string;
  bucket: string;
  chemin: string;
  nom: string | null;
  mime: string | null;
  taille_declaree: number | null;
  taille_stockage: number | null;
  sha256_declare: string | null;
  statut: "A_INCLURE" | "ABSENT" | "HORS_TENANT" | "EXCLU_POLITIQUE";
}

export interface Materialisation {
  statut: "RUNNING" | "FAILED";
  code?: string;
  resume?: Record<string, unknown>;
  instantane_at?: string;
  demandeur_studio?: string | null;
}

export interface ExportDbPort {
  reclamer(): Promise<Reclamation | null>;
  prolonger(job: string, bail: string): Promise<void>;
  materialiser(job: string, bail: string): Promise<Materialisation>;
  sections(job: string, bail: string): Promise<SectionBase[]>;
  page(job: string, bail: string, section: string, apres: number, limite: number): Promise<{ seq: number; ligne: Record<string, unknown> }[]>;
  fichiers(job: string, bail: string, apres: number, limite: number): Promise<FichierBase[]>;
  classification(): Promise<unknown[]>;
  terminer(job: string, bail: string, chemin: string, sha256: string, octets: number, complet: boolean, resume: Record<string, unknown>): Promise<{ statut: string; complet: boolean; objets_obsoletes?: string[] }>;
  echouer(job: string, bail: string, code: string, reessayable: boolean): Promise<{ statut: string }>;
}

export interface StockagePort {
  /** Flux du fichier ; null = introuvable (404). Lève ErreurTransitoire sur panne. */
  lire(bucket: string, chemin: string): Promise<AsyncIterable<Uint8Array> | null>;
  televerserArchive(chemin: string, fichierLocal: string, octets: number): Promise<void>;
  supprimerArchives(chemins: string[]): Promise<void>;
}

export interface StudioExport {
  statut: "ok" | "aucun_compte";
  format: string;
  donnees?: Record<string, unknown>;
  fichiers?: Array<{ bucket: string; cle: string; nom: string | null; mime: string | null; octets: number | null; categorie: string; url: string | null }>;
}

export interface StudioPort {
  /** Lève ErreurTransitoire si Studio est injoignable. */
  exporter(userId: string, jobId: string): Promise<StudioExport>;
  /** Flux d'un fichier Studio depuis son URL signée (projet dédié). null = introuvable. */
  lireUrl(url: string): Promise<AsyncIterable<Uint8Array> | null>;
}

export class ErreurTransitoire extends Error {
  constructor(readonly code: string, options?: { cause?: unknown }) {
    super(code, options);
  }
}
export class ErreurDefinitive extends Error {
  constructor(readonly code: string, options?: { cause?: unknown }) {
    super(code, options);
  }
}
/** Le bail a été repris par un autre worker (interruption) : on s'arrête sans rien écrire. */
export class ErreurBailPerdu extends Error {
  constructor() {
    super("BAIL_PERDU");
  }
}

export interface OptionsRunner {
  db: ExportDbPort;
  stockage: StockagePort;
  studio?: StudioPort | null;
  log?: (evenement: string, detail: Record<string, unknown>) => void;
  now?: () => Date;
  tailleePage?: number;
  dossierTemporaire?: string;
  /** Test : interrompt le worker après N sections (simulation de coupure). */
  interrompreApresSections?: number;
}

export interface ResultatRunner {
  etat: "aucun_job" | "ready" | "failed" | "retry" | "bail_perdu";
  job_id?: string;
  code?: string;
  complet?: boolean;
  octets?: number;
  entrees?: number;
  lignes?: number;
  fichiers?: Record<string, number>;
  duree_ms?: number;
  /** Ventilation du temps (ms) : matérialisation, données, fichiers, Studio, dépôt + fin. */
  phases?: Record<string, number>;
}

// ── Exécution ──────────────────────────────────────────────────────────────────────────────────
const COMPRESSES = /^(text\/|application\/(json|xml|pdf)|image\/(svg\+xml|bmp))/;

export async function executerUnExport(o: OptionsRunner): Promise<ResultatRunner> {
  const log = o.log ?? (() => {});
  const now = o.now ?? (() => new Date());
  const debut = Date.now();
  const r = await o.db.reclamer();
  if (!r) return { etat: "aucun_job" };
  const job = r.job_id;
  const bail = r.bail;
  log("rgpd_export.claimed", { job, tentative: r.tentative, type: r.type_export, reprise: r.reprise });

  const dossier = mkdtempSync(join(o.dossierTemporaire ?? tmpdir(), "elsatia-export-"));
  const phases: Record<string, number> = {};
  let top = Date.now();
  const phase = (nom: string) => {
    phases[nom] = Date.now() - top;
    top = Date.now();
  };
  try {
    const mat = await o.db.materialiser(job, bail);
    phase("materialisation_ms");
    if (mat.statut === "FAILED") {
      log("rgpd_export.failed", { job, code: mat.code });
      return { etat: "failed", job_id: job, code: mat.code };
    }

    const cheminLocal = join(dossier, "archive.zip");
    const sortie = createWriteStream(cheminLocal);
    const zip = new EcrivainZip(sortie, now());
    const motifs: string[] = [];
    const empreintes: string[] = [];
    const noter = (e: { nom: string; sha256: string }) => empreintes.push(`${e.sha256}  ${e.nom}`);
    let dernierProlongement = Date.now();
    const prolonger = async (force = false) => {
      if (force || Date.now() - dernierProlongement > 60_000) {
        await o.db.prolonger(job, bail);
        dernierProlongement = Date.now();
      }
    };

    // 1. Données, section par section, page par page.
    const limite = o.tailleePage ?? 1000;
    const sections = await o.db.sections(job, bail);
    const index: SectionIndex[] = [];
    let lignes = 0;
    let nSections = 0;
    for (const s of sections) {
      if (o.interrompreApresSections !== undefined && nSections >= o.interrompreApresSections) {
        throw new Error("INTERRUPTION_SIMULEE");
      }
      nSections++;
      await prolonger();
      const cible = { entreprise_id: s.entreprise_id, application: s.application, table: s.table_nom.replace(/^auth\./, "") };
      const nomJson = cheminsArchive.donnees(cible);
      const nomCsv = cheminsArchive.csv(cible);
      const fichierCsv = join(dossier, "section.csv");
      const csv = createWriteStream(fichierCsv);
      const etat: { colonnes: ColonnesCsv | null } = { colonnes: null };
      let n = 0;
      const ecrireCsv = async (t: string) => {
        if (!csv.write(t)) await once(csv, "drain");
      };
      async function* json() {
        yield Buffer.from("[\n");
        let apres = 0;
        for (;;) {
          const page = await o.db.page(job, bail, s.section, apres, limite);
          if (page.length === 0) break;
          for (const { seq, ligne } of page) {
            if (!etat.colonnes) {
              etat.colonnes = new ColonnesCsv(ligne);
              await ecrireCsv(etat.colonnes.entete());
            }
            await ecrireCsv(etat.colonnes.ligne(ligne));
            yield Buffer.from((n === 0 ? "" : ",\n") + JSON.stringify(ligne));
            n++;
            apres = seq;
          }
          await prolonger();
          if (page.length < limite) break;
        }
        yield Buffer.from("\n]\n");
      }
      noter(await zip.ajouter(nomJson, json()));
      csv.end();
      await once(csv, "finish");
      if (n !== s.nb_lignes) {
        // Les lignes matérialisées ne changent pas pendant le bail : un écart est une anomalie.
        throw new ErreurTransitoire("COMPTE_LIGNES_DIVERGENT");
      }
      if (n > 0) noter(await zip.ajouter(nomCsv, createReadStream(fichierCsv)));
      rmSync(fichierCsv, { force: true });
      lignes += n;
      index.push({ section: s.section, table: s.table_nom, application: s.application, domaine: s.domaine, categorie: s.categorie,
        entreprise_id: s.entreprise_id, lignes: n, json: nomJson, csv: n > 0 ? nomCsv : null });
    }

    phase("donnees_ms");
    // 2. Fichiers (manifeste de la base → copie en flux, empreinte recalculée).
    const manifeste: FichierIndex[] = [];
    const dejaInclus = new Map<string, FichierIndex>();
    let apresF = 0;
    for (;;) {
      const page = await o.db.fichiers(job, bail, apresF, 500);
      if (page.length === 0) break;
      for (const f of page) {
        apresF = f.seq;
        const base: FichierIndex = { source: "gestion_pro", section: f.section, ligne_id: f.ligne_id, colonne: f.colonne,
          bucket: f.bucket, chemin: f.chemin, nom: f.nom, mime: f.mime, statut: f.statut === "A_INCLURE" ? "INCLUS" : f.statut,
          octets: f.taille_stockage ?? f.taille_declaree, sha256: null, sha256_attendu: f.sha256_declare, archive: null };
        if (f.statut !== "A_INCLURE") {
          if (f.statut === "ABSENT" || f.statut === "HORS_TENANT") motifs.push(`FICHIER_${f.statut}`);
          manifeste.push(base);
          continue;
        }
        const cle = `${f.bucket}/${f.chemin}`;
        const deja = dejaInclus.get(cle);
        if (deja) {
          manifeste.push({ ...base, statut: deja.statut, octets: deja.octets, sha256: deja.sha256, archive: deja.archive });
          continue;
        }
        const nomArchive = cheminsArchive.fichier(f.bucket, f.chemin);
        if (!nomEntreeSur(nomArchive)) {
          manifeste.push({ ...base, statut: "HORS_TENANT" });
          motifs.push("FICHIER_HORS_TENANT");
          continue;
        }
        const flux = await o.stockage.lire(f.bucket, f.chemin);
        if (!flux) {
          manifeste.push({ ...base, statut: "ILLISIBLE" });
          motifs.push("FICHIER_ILLISIBLE");
          continue;
        }
        const e = await zip.ajouter(nomArchive, flux, { compresser: COMPRESSES.test(f.mime ?? "") });
        noter(e);
        let statut: StatutFichier = "INCLUS";
        if (f.sha256_declare && f.sha256_declare.toLowerCase() !== e.sha256) {
          statut = "EMPREINTE_DIVERGENTE";
          motifs.push("FICHIER_EMPREINTE_DIVERGENTE");
        }
        const inclus = { ...base, statut, octets: e.octets, sha256: e.sha256, archive: nomArchive };
        dejaInclus.set(cle, inclus);
        manifeste.push(inclus);
        await prolonger();
      }
      if (page.length < 500) break;
    }

    phase("fichiers_ms");
    // 3. Studio (projet dédié, B + I1) : export individuel seulement.
    let studio: MetaExport["studio"] = { statut: "NON_APPLICABLE", format: null, sections: 0, fichiers: 0 };
    if (r.type_export === "UTILISATEUR" && r.studio_sujet_connu) {
      studio = await exporterStudio(o, r, mat.demandeur_studio ?? null, zip, manifeste, motifs, noter);
    }

    phase("studio_ms");
    // 4. Méta-données, manifeste, classification, empreintes.
    const compteFichiers = manifeste.reduce((acc, f) => ({ ...acc, [f.statut]: (acc[f.statut] ?? 0) + 1 }),
      {} as Record<StatutFichier, number>);
    const motifsUniques = [...new Set(motifs)].sort();
    const meta: MetaExport = {
      format: FORMAT_EXPORT,
      job_id: job,
      type: r.type_export,
      entreprise_id: r.entreprise_id,
      demandeur_id: mat.demandeur_studio ?? null,
      genere_le: now().toISOString(),
      instantane_le: mat.instantane_at ?? null,
      complet: motifsUniques.length === 0,
      motifs_incompletude: motifsUniques,
      sections: index,
      fichiers: compteFichiers,
      studio,
      perimetre_utilisateur: (mat.resume as { perimetre_utilisateur?: unknown } | undefined)?.perimetre_utilisateur ?? null,
    };
    noter(await zip.ajouterTexte(cheminsArchive.manifeste, JSON.stringify(manifeste, null, 1)));
    noter(await zip.ajouterTexte(cheminsArchive.classification, JSON.stringify(await o.db.classification(), null, 1)));
    noter(await zip.ajouterTexte(cheminsArchive.meta, JSON.stringify(meta, null, 2)));
    noter(await zip.ajouterTexte(cheminsArchive.lisezMoi, LISEZ_MOI));
    await zip.ajouterTexte(cheminsArchive.empreintes, empreintes.join("\n") + "\n");
    const fin = await zip.fermer();
    sortie.end();
    await once(sortie, "finish");
    if (statSync(cheminLocal).size !== fin.octets) throw new ErreurTransitoire("ARCHIVE_TAILLE_DIVERGENTE");

    // 5. Dépôt puis fin (la base vérifie la présence de l'objet et recalcule la complétude).
    await prolonger(true);
    const chemin = `${job}/${r.tentative}.zip`;
    await o.stockage.televerserArchive(chemin, cheminLocal, fin.octets);
    const t = await o.db.terminer(job, bail, chemin, fin.sha256, fin.octets, meta.complet, {
      lignes, sections: index.length, entrees: fin.entrees, fichiers: compteFichiers, studio: studio.statut, motifs: motifsUniques,
    });
    if (t.objets_obsoletes?.length) await o.stockage.supprimerArchives(t.objets_obsoletes).catch(() => {});
    phase("depot_ms");
    const res: ResultatRunner = { etat: "ready", job_id: job, complet: t.complet, octets: fin.octets, entrees: fin.entrees,
      lignes, fichiers: compteFichiers, duree_ms: Date.now() - debut, phases };
    log("rgpd_export.ready", { job, complet: t.complet, octets: fin.octets, entrees: fin.entrees, lignes, duree_ms: res.duree_ms, ...phases });
    return res;
  } catch (erreur) {
    if (erreur instanceof ErreurBailPerdu) {
      log("rgpd_export.lease_lost", { job });
      return { etat: "bail_perdu", job_id: job };
    }
    if (erreur instanceof Error && erreur.message === "INTERRUPTION_SIMULEE") {
      log("rgpd_export.interrupted", { job });
      return { etat: "bail_perdu", job_id: job, code: "INTERRUPTION_SIMULEE" };
    }
    const definitive = erreur instanceof ErreurDefinitive;
    const code = erreur instanceof ErreurTransitoire || erreur instanceof ErreurDefinitive ? erreur.code : "ERREUR_WORKER";
    try {
      const e = await o.db.echouer(job, bail, code, !definitive);
      log("rgpd_export.error", { job, code, statut: e.statut });
      return { etat: e.statut === "PENDING" ? "retry" : "failed", job_id: job, code };
    } catch (e2) {
      if (e2 instanceof ErreurBailPerdu) return { etat: "bail_perdu", job_id: job };
      throw e2;
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

async function exporterStudio(
  o: OptionsRunner,
  r: Reclamation,
  demandeur: string | null,
  zip: EcrivainZip,
  manifeste: FichierIndex[],
  motifs: string[],
  noter: (e: { nom: string; sha256: string }) => void,
): Promise<MetaExport["studio"]> {
  const vide = (statut: StatutStudio): MetaExport["studio"] => ({ statut, format: null, sections: 0, fichiers: 0 });
  if (!o.studio || !demandeur) {
    // Un sujet Studio existe mais le contrat n'est pas configuré : jamais « complet ».
    motifs.push("EXPORT_STUDIO_NON_CONFIGURE");
    return vide("NON_CONFIGURE");
  }
  const e = await o.studio.exporter(demandeur, r.job_id); // ErreurTransitoire → réessai du job
  if (e.statut === "aucun_compte") return { ...vide("AUCUN_COMPTE"), format: e.format };
  noter(await zip.ajouterTexte(cheminsArchive.studioDonnees, JSON.stringify(e.donnees ?? {}, null, 1)));
  let n = 0;
  for (const f of e.fichiers ?? []) {
    const base: FichierIndex = { source: "studio", section: `studio/${f.categorie}`, ligne_id: null, colonne: "storage_key",
      bucket: f.bucket, chemin: f.cle, nom: f.nom, mime: f.mime, statut: "EXCLU_POLITIQUE", octets: f.octets, sha256: null,
      sha256_attendu: null, archive: null };
    const nom = cheminsArchive.studioFichier(f.bucket, f.cle);
    if (!f.url || f.categorie !== "OWN_DATA" || !nomEntreeSur(nom)) {
      manifeste.push(base);
      continue;
    }
    const flux = await o.studio.lireUrl(f.url);
    if (!flux) {
      manifeste.push({ ...base, statut: "ILLISIBLE" });
      motifs.push("EXPORT_STUDIO_FICHIER_ILLISIBLE");
      continue;
    }
    const x = await zip.ajouter(nom, flux, { compresser: false });
    noter(x);
    manifeste.push({ ...base, statut: "INCLUS", octets: x.octets, sha256: x.sha256, archive: nom });
    n++;
  }
  return { statut: "INCLUS", format: e.format, sections: Object.keys(e.donnees ?? {}).length, fichiers: n };
}
