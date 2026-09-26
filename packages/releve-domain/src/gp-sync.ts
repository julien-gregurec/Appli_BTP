/**
 * Contrat futur de transmission Relevé & Métré → Gestion Pro (contrat v1, **non branché**).
 *
 * Statut : `contract-only`. Aucune écriture GP n'est effectuée au lot 2. La cible GP existe
 * en partie (`metres`, `lignes_metres`, `documents_chantier`) mais le RPC d'import, la double
 * autorisation côté GP et l'unité m³ n'existent pas encore : voir {@link GP_SYNC_READINESS}.
 *
 * Règles figées dès maintenant :
 * - **GP autoritaire** sur client, chantier et prix. Tools ne transmet que des quantités,
 *   de la structure, de la géométrie et des pièces jointes. Jamais un prix.
 * - La transmission porte sur une **Version** immuable, jamais sur l'état courant : ce qui
 *   est envoyé est rejouable à l'identique.
 * - **Idempotence** : `idempotencyKey` = relevé + numéro de version + chantier GP. Un second
 *   envoi de la même version vers le même chantier est un no-op côté GP.
 * - **Unités** : millimètres dans Tools → mètres (3 décimales, `numeric(12,3)`) à la frontière.
 */

import type { ReleveAggregate, ReleveElement, Version, QuantiteUnite, Point2D } from "./model";

export const GP_SYNC_CONTRACT_VERSION = 1 as const;

export const GP_SYNC_SECTIONS = [
  "client", "chantier", "structure", "plan", "measures", "quantities",
  "photos", "annotations", "materials", "openings", "exports",
] as const;
export type GpSyncSection = (typeof GP_SYNC_SECTIONS)[number];

/** État de préparation de la cible GP, relu à chaque lot. */
export const GP_SYNC_READINESS = {
  status: "contract-only",
  targets: {
    metres: "exists",
    lignes_metres: "exists",
    documents_chantier: "exists",
    import_rpc: "missing",
    unite_m3: "missing",
    journal_idempotence: "exists-in-tools",
  },
  blockers: [
    "RPC GP `gp_importer_releve(envelope)` SECURITY DEFINER à créer (lot 17).",
    "Double autorisation à implémenter côté GP : capability `releve-metre` + permission `gerer_ouvrages`.",
    "`UNITES` GP (src/lib/devis.ts) ne contient pas « m³ » : à ajouter avant de transmettre des volumes.",
  ],
} as const;

export type GpUnite = "m²" | "ml" | "m³" | "u";
const GP_UNITES: Record<QuantiteUnite, GpUnite> = { m2: "m²", ml: "ml", m3: "m³", u: "u" };
export function toGpUnite(unite: QuantiteUnite): GpUnite { return GP_UNITES[unite]; }

/** mm → m, arrondi à 3 décimales (précision de `numeric(12,3)`). */
export function mmToM(valueMm: number): number { return round3(valueMm / 1000); }
/** mm² → m². */
export function mm2ToM2(valueMm2: number): number { return round3(valueMm2 / 1_000_000); }
function round3(value: number): number { return Math.round(value * 1000) / 1000 || 0; }
const pointToM = (point: Point2D) => ({ x: mmToM(point.x), y: mmToM(point.y) });
const nullableM = (value: number | null) => (value === null ? null : mmToM(value));

type GpAncre = { kind: "point"; etageRef: string; point: { x: number; y: number } } | { kind: "entite"; refKind: string; ref: string };

export type ReleveGpEnvelope = {
  readonly contractVersion: typeof GP_SYNC_CONTRACT_VERSION;
  readonly idempotencyKey: string;
  readonly source: {
    readonly app: "tools";
    readonly module: "releve-metre";
    readonly releveId: string;
    readonly versionId: string;
    readonly versionNumero: number;
    readonly empreinte: string;
    readonly exportedAt: string;
  };
  readonly tenant: { readonly entrepriseId: string };
  readonly client: { readonly gpClientId: string | null; readonly nom: string | null };
  readonly chantier: { readonly gpChantierId: string; readonly nom: string; readonly adresse: string | null; readonly codePostal: string | null; readonly ville: string | null };
  readonly structure: ReadonlyArray<{
    readonly ref: string; readonly nom: string;
    readonly etages: ReadonlyArray<{
      readonly ref: string; readonly nom: string; readonly niveau: number; readonly etat: string; readonly hauteurSousPlafondM: number | null;
      readonly zones: ReadonlyArray<{ readonly ref: string; readonly nom: string; readonly type: string }>;
      readonly pieces: ReadonlyArray<{ readonly ref: string; readonly nom: string; readonly usage: string; readonly zoneRef: string | null; readonly hauteurSousPlafondM: number | null }>;
    }>;
  }>;
  readonly plan: {
    readonly unite: "m";
    readonly murs: ReadonlyArray<{ readonly ref: string; readonly etageRef: string; readonly pieceRef: string | null; readonly a: { x: number; y: number }; readonly b: { x: number; y: number }; readonly epaisseurM: number; readonly hauteurM: number | null; readonly type: string }>;
    readonly equipements: ReadonlyArray<{ readonly ref: string; readonly etageRef: string; readonly pieceRef: string | null; readonly categorie: string; readonly libelle: string; readonly position: { x: number; y: number }; readonly rotationRad: number }>;
  };
  readonly openings: ReadonlyArray<{ readonly ref: string; readonly murRef: string; readonly type: string; readonly decalageM: number; readonly largeurM: number; readonly hauteurM: number; readonly allegeM: number | null; readonly sens: string }>;
  readonly measures: ReadonlyArray<{ readonly ref: string; readonly cible: { kind: string; ref: string }; readonly type: string; readonly valeur: number; readonly unite: "m" | "m²" | "rad"; readonly source: string; readonly precisionM: number | null; readonly priseLe: string }>;
  /** Lignes compatibles `lignes_metres` (designation, formule, resultat, unite). */
  readonly quantities: ReadonlyArray<{ readonly ref: string; readonly cle: string; readonly designation: string; readonly etageRef: string | null; readonly pieceRef: string | null; readonly formule: string; readonly resultat: number; readonly unite: GpUnite; readonly qualite: string; readonly materiauRef: string | null; readonly gpPrestationRef: string | null }>;
  readonly materials: ReadonlyArray<{ readonly ref: string; readonly libelle: string; readonly categorie: string; readonly unite: GpUnite; readonly pertePourcent: number; readonly gpPrestationRef: string | null }>;
  readonly photos: ReadonlyArray<{ readonly ref: string; readonly mediaRef: string; readonly storagePath: string; readonly mimeType: string; readonly bytes: number; readonly ancre: GpAncre; readonly legende: string | null }>;
  readonly annotations: ReadonlyArray<{ readonly ref: string; readonly texte: string; readonly ancre: GpAncre; readonly audioStoragePath: string | null }>;
  readonly exports: ReadonlyArray<{ readonly mediaRef: string; readonly kind: "plan_pdf" | "plan_dxf" | "plan_svg" | "metre_csv"; readonly storagePath: string; readonly mimeType: string; readonly bytes: number }>;
};

export type GpEnvelopeIssue = { readonly code: "gp_chantier_missing" | "version_mismatch" | "tenant_mismatch" | "media_missing" | "opening_without_wall"; readonly message: string };
export type GpEnvelopeResult = { readonly ok: true; readonly envelope: ReleveGpEnvelope } | { readonly ok: false; readonly issues: readonly GpEnvelopeIssue[] };

export function gpIdempotencyKey(releveId: string, versionNumero: number, gpChantierId: string): string {
  return `tools-releve:${releveId}:v${versionNumero}:gp-chantier:${gpChantierId}`;
}

const EXPORT_KINDS: Record<string, ReleveGpEnvelope["exports"][number]["kind"]> = {
  "application/pdf": "plan_pdf", "image/vnd.dxf": "plan_dxf", "image/svg+xml": "plan_svg", "text/csv": "metre_csv",
};

function ofType<T extends ReleveElement["type"]>(elements: readonly ReleveElement[], type: T) {
  return elements.filter((element): element is ReleveElement<T> => element.type === type && !element.deletedAt);
}

function ancreToGp(ancre: { kind: "point"; etageId: string; point: Point2D } | { kind: "entite"; ref: { kind: string; id: string } }): GpAncre {
  return ancre.kind === "point"
    ? { kind: "point", etageRef: ancre.etageId, point: pointToM(ancre.point) }
    : { kind: "entite", refKind: ancre.ref.kind, ref: ancre.ref.id };
}

/**
 * Construit l'enveloppe d'une version. Fonction pure : aucune I/O, testable, identique
 * sur web, mobile et futur module de capture natif.
 */
export function buildGpEnvelope(aggregate: ReleveAggregate, version: Version, exportedAt: string): GpEnvelopeResult {
  const { releve } = aggregate;
  const issues: GpEnvelopeIssue[] = [];
  if (!releve.chantier.gpChantierId) issues.push({ code: "gp_chantier_missing", message: "Le relevé n'est rattaché à aucun chantier Gestion Pro." });
  if (version.releveId !== releve.id) issues.push({ code: "version_mismatch", message: "La version n'appartient pas à ce relevé." });
  if (version.entrepriseId !== releve.entrepriseId) issues.push({ code: "tenant_mismatch", message: "Version d'une autre entreprise." });

  const alive = <T extends { deletedAt: string | null }>(items: readonly T[]) => items.filter((item) => !item.deletedAt);
  const medias = new Map(alive(aggregate.medias).map((media) => [media.id as string, media]));
  const murs = ofType(aggregate.elements, "mur");
  const murIds = new Set(murs.map((mur) => mur.id as string));
  const ouvertures = ofType(aggregate.elements, "ouverture");
  for (const ouverture of ouvertures) if (!ouverture.parentElementId || !murIds.has(ouverture.parentElementId)) issues.push({ code: "opening_without_wall", message: `Ouverture ${ouverture.id} sans mur hôte actif.` });
  const photos = ofType(aggregate.elements, "photo_anchor");
  for (const photo of photos) if (!medias.has(photo.donnees.mediaId)) issues.push({ code: "media_missing", message: `Photo ${photo.id} : fichier introuvable.` });
  if (issues.length) return { ok: false, issues };

  const zones = alive(aggregate.zones); const pieces = alive(aggregate.pieces); const etages = alive(aggregate.etages);
  const materiaux = ofType(aggregate.elements, "materiau");
  const materiauxById = new Map(materiaux.map((materiau) => [materiau.id as string, materiau]));
  const envelope: ReleveGpEnvelope = {
    contractVersion: GP_SYNC_CONTRACT_VERSION,
    idempotencyKey: gpIdempotencyKey(releve.id, version.numero, releve.chantier.gpChantierId!),
    source: { app: "tools", module: "releve-metre", releveId: releve.id, versionId: version.id, versionNumero: version.numero, empreinte: version.empreinte, exportedAt },
    tenant: { entrepriseId: releve.entrepriseId },
    client: { gpClientId: releve.client.gpClientId, nom: releve.client.nom },
    chantier: { gpChantierId: releve.chantier.gpChantierId!, nom: releve.chantier.nom, adresse: releve.chantier.adresse, codePostal: releve.chantier.codePostal, ville: releve.chantier.ville },
    structure: alive(aggregate.batiments).sort((a, b) => a.ordre - b.ordre).map((batiment) => ({
      ref: batiment.id, nom: batiment.nom,
      etages: etages.filter((etage) => etage.batimentId === batiment.id).sort((a, b) => a.niveau - b.niveau).map((etage) => ({
        ref: etage.id, nom: etage.nom, niveau: etage.niveau, etat: etage.etat, hauteurSousPlafondM: nullableM(etage.hauteurSousPlafondMm),
        zones: zones.filter((zone) => zone.etageId === etage.id).map((zone) => ({ ref: zone.id, nom: zone.nom, type: zone.type })),
        pieces: pieces.filter((piece) => piece.etageId === etage.id).map((piece) => ({ ref: piece.id, nom: piece.nom, usage: piece.usage, zoneRef: piece.zoneId, hauteurSousPlafondM: nullableM(piece.hauteurSousPlafondMm ?? etage.hauteurSousPlafondMm) })),
      })),
    })),
    plan: {
      unite: "m",
      murs: murs.map((mur) => ({ ref: mur.id, etageRef: mur.etageId!, pieceRef: mur.pieceId, a: pointToM(mur.donnees.a), b: pointToM(mur.donnees.b), epaisseurM: mmToM(mur.donnees.epaisseurMm), hauteurM: nullableM(mur.donnees.hauteurMm), type: mur.donnees.typeMur })),
      equipements: ofType(aggregate.elements, "equipement").map((item) => ({ ref: item.id, etageRef: item.etageId!, pieceRef: item.pieceId, categorie: item.donnees.categorie, libelle: item.donnees.libelle, position: pointToM(item.donnees.position), rotationRad: item.donnees.rotationRad })),
    },
    openings: ouvertures.map((item) => ({ ref: item.id, murRef: item.parentElementId!, type: item.donnees.typeOuverture, decalageM: mmToM(item.donnees.decalageMm), largeurM: mmToM(item.donnees.largeurMm), hauteurM: mmToM(item.donnees.hauteurMm), allegeM: nullableM(item.donnees.allegeMm), sens: item.donnees.sens })),
    measures: ofType(aggregate.elements, "mesure").map((item) => {
      const { unite, valeur } = item.donnees;
      return { ref: item.id, cible: { kind: item.donnees.cible.kind, ref: item.donnees.cible.id }, type: item.donnees.typeMesure, valeur: unite === "mm" ? mmToM(valeur) : unite === "mm2" ? mm2ToM2(valeur) : valeur, unite: unite === "mm" ? "m" as const : unite === "mm2" ? "m²" as const : "rad" as const, source: item.donnees.source, precisionM: nullableM(item.donnees.precisionMm), priseLe: item.donnees.priseLe };
    }),
    quantities: ofType(aggregate.elements, "quantite").map((item) => {
      const materiau = item.donnees.materiauId ? materiauxById.get(item.donnees.materiauId) : undefined;
      const piece = item.pieceId ? pieces.find((candidate) => candidate.id === item.pieceId) : undefined;
      return { ref: item.id, cle: item.donnees.cle, designation: [piece?.nom, item.donnees.libelle, materiau?.donnees.libelle].filter(Boolean).join(" — "), etageRef: item.etageId, pieceRef: item.pieceId, formule: item.donnees.formule, resultat: round3(item.donnees.valeur), unite: toGpUnite(item.donnees.unite), qualite: item.donnees.qualite, materiauRef: item.donnees.materiauId, gpPrestationRef: materiau?.donnees.gpPrestationRef ?? null };
    }),
    materials: materiaux.map((item) => ({ ref: item.id, libelle: item.donnees.libelle, categorie: item.donnees.categorie, unite: toGpUnite(item.donnees.unite), pertePourcent: item.donnees.pertePourcent, gpPrestationRef: item.donnees.gpPrestationRef })),
    photos: photos.map((item) => {
      const media = medias.get(item.donnees.mediaId)!;
      return { ref: item.id, mediaRef: media.id, storagePath: media.storagePath, mimeType: media.mimeType, bytes: media.tailleOctets, ancre: ancreToGp(item.donnees.ancre), legende: item.donnees.legende };
    }),
    annotations: ofType(aggregate.elements, "annotation").map((item) => ({ ref: item.id, texte: item.donnees.texte, ancre: ancreToGp(item.donnees.ancre), audioStoragePath: item.donnees.mediaAudioId ? medias.get(item.donnees.mediaAudioId)?.storagePath ?? null : null })),
    exports: alive(aggregate.medias).filter((media) => media.categorie === "exports" && EXPORT_KINDS[media.mimeType]).map((media) => ({ mediaRef: media.id, kind: EXPORT_KINDS[media.mimeType], storagePath: media.storagePath, mimeType: media.mimeType, bytes: media.tailleOctets })),
  };
  return { ok: true, envelope };
}
