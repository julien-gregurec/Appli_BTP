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
 * - **Périmètre** : une enveloppe = un chantier du projet relevé ↔ un chantier GP. Un projet
 *   multi-chantiers produit une enveloppe par chantier lié.
 */

import { mesureMode, type Chantier, type MesureMode, type ReleveAggregate, type ReleveElement, type Version, type QuantiteUnite, type Point2D } from "./model";

export const GP_SYNC_CONTRACT_VERSION = 1 as const;

export const GP_SYNC_SECTIONS = [
  "client", "chantier", "building", "floor", "room", "walls", "openings", "measurements",
  "quantities", "photos", "annotations", "materials", "exports",
  // Recovery V2 : sections du contrat produit absentes de la première version (additives).
  "zone", "coverings", "equipments", "versions",
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
/** mm³ → m³. */
export function mm3ToM3(valueMm3: number): number { return round3(valueMm3 / 1_000_000_000); }
function round3(value: number): number { return Math.round(value * 1000) / 1000 || 0; }
const pointToM = (point: Point2D) => ({ x: mmToM(point.x), y: mmToM(point.y) });
const nullableM = (value: number | null) => (value === null ? null : mmToM(value));

type GpPoint = { x: number; y: number };
type GpAncre = { kind: "point"; floorRef: string; point: GpPoint } | { kind: "entite"; refKind: string; ref: string };

export type ReleveGpEnvelope = {
  readonly contractVersion: typeof GP_SYNC_CONTRACT_VERSION;
  readonly idempotencyKey: string;
  readonly source: {
    readonly app: "tools";
    readonly module: "releve-metre";
    readonly releveId: string;
    readonly chantierRef: string;
    readonly versionId: string;
    readonly versionNumero: number;
    readonly versionType: Version["typeVersion"];
    readonly empreinte: string;
    readonly exportedAt: string;
  };
  readonly tenant: { readonly entrepriseId: string };
  readonly client: { readonly gpClientId: string | null; readonly nom: string | null };
  readonly chantier: { readonly ref: string; readonly gpChantierId: string; readonly nom: string; readonly adresse: string | null; readonly codePostal: string | null; readonly ville: string | null };
  readonly building: ReadonlyArray<{ readonly ref: string; readonly nom: string; readonly ordre: number }>;
  readonly floor: ReadonlyArray<{
    readonly ref: string; readonly buildingRef: string; readonly nom: string; readonly niveau: number; readonly etat: string;
    readonly altitudeM: number | null; readonly hauteurSousPlafondM: number | null;
    readonly zones: ReadonlyArray<{ readonly ref: string; readonly nom: string; readonly type: string }>;
  }>;
  /** Zones à plat (aussi imbriquées dans `floor[].zones` pour compatibilité). */
  readonly zone: ReadonlyArray<{ readonly ref: string; readonly floorRef: string; readonly nom: string; readonly type: string }>;
  readonly room: ReadonlyArray<{ readonly ref: string; readonly floorRef: string; readonly zoneRef: string | null; readonly nom: string; readonly usage: string; readonly hauteurSousPlafondM: number | null }>;
  readonly walls: ReadonlyArray<{ readonly ref: string; readonly floorRef: string; readonly roomRef: string | null; readonly a: GpPoint; readonly b: GpPoint; readonly epaisseurM: number; readonly hauteurM: number | null; readonly type: string; readonly adjacentRoomRefs: readonly string[]; readonly materialRef: string | null }>;
  /** Portes et fenêtres : `family` distingue door / window / other (trémie, passage). */
  readonly openings: ReadonlyArray<{ readonly ref: string; readonly wallRef: string; readonly family: "door" | "window" | "other"; readonly type: string; readonly decalageM: number; readonly largeurM: number; readonly hauteurM: number; readonly allegeM: number | null; readonly sens: string; readonly metadata: Readonly<Record<string, unknown>> | null }>;
  readonly measurements: ReadonlyArray<{ readonly ref: string; readonly cible: { kind: string; ref: string }; readonly type: string; readonly valeur: number; readonly unite: "m" | "m²" | "m³" | "rad"; readonly source: string; readonly mode: MesureMode; readonly precisionM: number | null; readonly priseLe: string }>;
  /** Lignes compatibles `lignes_metres` (designation, formule, resultat, unite). Jamais de prix. */
  readonly quantities: ReadonlyArray<{ readonly ref: string; readonly cle: string; readonly designation: string; readonly floorRef: string | null; readonly roomRef: string | null; readonly formule: string; readonly resultat: number; readonly unite: GpUnite; readonly qualite: string; readonly materialRef: string | null; readonly gpPrestationRef: string | null; readonly sources: ReadonlyArray<{ readonly kind: string; readonly ref: string }>; readonly gpOuvrageRef: string | null }>;
  readonly photos: ReadonlyArray<{ readonly ref: string; readonly mediaRef: string; readonly storagePath: string; readonly mimeType: string; readonly bytes: number; readonly ancre: GpAncre; readonly legende: string | null }>;
  readonly annotations: ReadonlyArray<{ readonly ref: string; readonly forme: string; readonly texte: string; readonly geometrie: Readonly<Record<string, unknown>> | null; readonly ancre: GpAncre; readonly audioStoragePath: string | null }>;
  readonly materials: ReadonlyArray<{ readonly ref: string; readonly libelle: string; readonly categorie: string; readonly unite: GpUnite; readonly pertePourcent: number; readonly gpPrestationRef: string | null; readonly revetement: string | null }>;
  /** Revêtements : matériaux typés par un revêtement, avec les quantités qui les portent. */
  readonly coverings: ReadonlyArray<{ readonly ref: string; readonly materialRef: string; readonly revetement: string; readonly support: string; readonly libelle: string; readonly quantityRefs: readonly string[] }>;
  readonly exports: ReadonlyArray<{ readonly mediaRef: string; readonly kind: "plan_pdf" | "plan_dxf" | "plan_svg" | "metre_csv"; readonly storagePath: string; readonly mimeType: string; readonly bytes: number }>;
  /** Hors liste contractuelle : mobilier et équipements (informatif pour GP). */
  readonly equipments: ReadonlyArray<{ readonly ref: string; readonly floorRef: string; readonly roomRef: string | null; readonly categorie: string; readonly libelle: string; readonly position: GpPoint; readonly rotationRad: number }>;
  /** Lignée de la version transmise (elle-même puis ses bases connues), la plus récente d'abord. */
  readonly versions: ReadonlyArray<{ readonly ref: string; readonly numero: number; readonly type: Version["typeVersion"]; readonly baseRef: string | null; readonly empreinte: string; readonly createdAt: string }>;
};

export type GpEnvelopeIssue = {
  readonly code: "chantier_ambiguous" | "chantier_missing" | "gp_chantier_missing" | "version_mismatch" | "tenant_mismatch" | "media_missing" | "opening_without_wall";
  readonly message: string;
};
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
    ? { kind: "point", floorRef: ancre.etageId, point: pointToM(ancre.point) }
    : { kind: "entite", refKind: ancre.ref.kind, ref: ancre.ref.id };
}

function openingFamily(type: string): "door" | "window" | "other" {
  if (type === "porte" || type === "porte_fenetre") return "door";
  if (type === "fenetre" || type === "baie") return "window";
  return "other";
}

/**
 * Construit l'enveloppe d'une version pour UN chantier du projet. Fonction pure : aucune
 * I/O, testable, identique sur web, mobile et futur module de capture natif.
 *
 * `chantierId` peut être omis quand le projet n'a qu'un chantier actif. Le chantier GP cible
 * est celui du chantier Tools, à défaut celui du site principal du projet.
 * `history` (facultatif) : versions connues du relevé, pour transmettre la lignée.
 */
export function buildGpEnvelope(aggregate: ReleveAggregate, version: Version, exportedAt: string, chantierId?: string, history: readonly Version[] = []): GpEnvelopeResult {
  const { releve } = aggregate;
  const issues: GpEnvelopeIssue[] = [];
  const alive = <T extends { deletedAt: string | null }>(items: readonly T[]) => items.filter((item) => !item.deletedAt);
  const chantiers = alive(aggregate.chantiers);
  let chantier: Chantier | undefined;
  if (chantierId) chantier = chantiers.find((item) => item.id === chantierId);
  else if (chantiers.length === 1) chantier = chantiers[0];
  else if (chantiers.length > 1) issues.push({ code: "chantier_ambiguous", message: "Plusieurs chantiers : précisez celui à transmettre." });
  if (!chantier && !issues.length) issues.push({ code: "chantier_missing", message: "Chantier du relevé introuvable." });
  const gpChantierId = chantier?.gpChantierId ?? releve.chantier.gpChantierId;
  if (chantier && !gpChantierId) issues.push({ code: "gp_chantier_missing", message: "Le chantier n'est rattaché à aucun chantier Gestion Pro." });
  if (version.releveId !== releve.id) issues.push({ code: "version_mismatch", message: "La version n'appartient pas à ce relevé." });
  if (version.entrepriseId !== releve.entrepriseId) issues.push({ code: "tenant_mismatch", message: "Version d'une autre entreprise." });

  // Périmètre du chantier : bâtiments → étages → pièces ; éléments d'étage de ces étages,
  // plus les éléments sans étage (matériaux, quantités et mesures de niveau projet).
  const batiments = alive(aggregate.batiments).filter((item) => item.chantierId === chantier?.id).sort((a, b) => a.ordre - b.ordre);
  const batimentIds = new Set(batiments.map((item) => item.id as string));
  const etages = alive(aggregate.etages).filter((item) => batimentIds.has(item.batimentId)).sort((a, b) => a.niveau - b.niveau || a.ordre - b.ordre);
  const etageIds = new Set(etages.map((item) => item.id as string));
  const zones = alive(aggregate.zones).filter((item) => etageIds.has(item.etageId));
  const pieces = alive(aggregate.pieces).filter((item) => etageIds.has(item.etageId));
  const elements = aggregate.elements.filter((item) => !item.etageId || etageIds.has(item.etageId));

  const medias = new Map(alive(aggregate.medias).map((media) => [media.id as string, media]));
  const murs = ofType(elements, "mur");
  const murIds = new Set(murs.map((mur) => mur.id as string));
  const ouvertures = ofType(elements, "ouverture");
  for (const ouverture of ouvertures) if (!ouverture.parentElementId || !murIds.has(ouverture.parentElementId)) issues.push({ code: "opening_without_wall", message: `Ouverture ${ouverture.id} sans mur hôte actif.` });
  const photos = ofType(elements, "photo_anchor");
  for (const photo of photos) if (!medias.has(photo.donnees.mediaId)) issues.push({ code: "media_missing", message: `Photo ${photo.id} : fichier introuvable.` });
  if (issues.length || !chantier || !gpChantierId) return { ok: false, issues };

  const materiaux = ofType(elements, "materiau");
  const materiauxById = new Map(materiaux.map((materiau) => [materiau.id as string, materiau]));
  const hspEtage = new Map(etages.map((etage) => [etage.id as string, etage.hauteurSousPlafondMm]));
  const quantites = ofType(elements, "quantite");
  const versionsById = new Map(history.filter((item) => item.releveId === version.releveId).map((item) => [item.id as string, item]));
  const lignee: Version[] = [version];
  for (let base = version.versionBaseId ? versionsById.get(version.versionBaseId) : undefined; base && !lignee.includes(base); base = base.versionBaseId ? versionsById.get(base.versionBaseId) : undefined) lignee.push(base);
  const envelope: ReleveGpEnvelope = {
    contractVersion: GP_SYNC_CONTRACT_VERSION,
    idempotencyKey: gpIdempotencyKey(releve.id, version.numero, gpChantierId),
    source: { app: "tools", module: "releve-metre", releveId: releve.id, chantierRef: chantier.id, versionId: version.id, versionNumero: version.numero, versionType: version.typeVersion, empreinte: version.empreinte, exportedAt },
    tenant: { entrepriseId: releve.entrepriseId },
    client: { gpClientId: releve.client.gpClientId, nom: releve.client.nom },
    chantier: { ref: chantier.id, gpChantierId, nom: chantier.nom, adresse: chantier.adresse, codePostal: chantier.codePostal, ville: chantier.ville },
    building: batiments.map((item) => ({ ref: item.id, nom: item.nom, ordre: item.ordre })),
    floor: etages.map((etage) => ({
      ref: etage.id, buildingRef: etage.batimentId, nom: etage.nom, niveau: etage.niveau, etat: etage.etat,
      altitudeM: nullableM(etage.altitudeMm), hauteurSousPlafondM: nullableM(etage.hauteurSousPlafondMm),
      zones: zones.filter((zone) => zone.etageId === etage.id).map((zone) => ({ ref: zone.id, nom: zone.nom, type: zone.type })),
    })),
    zone: zones.map((zone) => ({ ref: zone.id, floorRef: zone.etageId, nom: zone.nom, type: zone.type })),
    room: pieces.map((piece) => ({ ref: piece.id, floorRef: piece.etageId, zoneRef: piece.zoneId, nom: piece.nom, usage: piece.usage, hauteurSousPlafondM: nullableM(piece.hauteurSousPlafondMm ?? hspEtage.get(piece.etageId) ?? null) })),
    walls: murs.map((mur) => ({ ref: mur.id, floorRef: mur.etageId!, roomRef: mur.pieceId, a: pointToM(mur.donnees.a), b: pointToM(mur.donnees.b), epaisseurM: mmToM(mur.donnees.epaisseurMm), hauteurM: nullableM(mur.donnees.hauteurMm), type: mur.donnees.typeMur, adjacentRoomRefs: [...(mur.donnees.piecesAdjacentesIds ?? [])], materialRef: mur.donnees.materiauId ?? null })),
    openings: ouvertures.map((item) => ({ ref: item.id, wallRef: item.parentElementId!, family: openingFamily(item.donnees.typeOuverture), type: item.donnees.typeOuverture, decalageM: mmToM(item.donnees.decalageMm), largeurM: mmToM(item.donnees.largeurMm), hauteurM: mmToM(item.donnees.hauteurMm), allegeM: nullableM(item.donnees.allegeMm), sens: item.donnees.sens, metadata: item.donnees.metadata ?? null })),
    measurements: ofType(elements, "mesure").map((item) => {
      const { unite, valeur } = item.donnees;
      return { ref: item.id, cible: { kind: item.donnees.cible.kind, ref: item.donnees.cible.id }, type: item.donnees.typeMesure, valeur: unite === "mm" ? mmToM(valeur) : unite === "mm2" ? mm2ToM2(valeur) : unite === "mm3" ? mm3ToM3(valeur) : valeur, unite: unite === "mm" ? "m" as const : unite === "mm2" ? "m²" as const : unite === "mm3" ? "m³" as const : "rad" as const, source: item.donnees.source, mode: mesureMode(item.donnees.source), precisionM: nullableM(item.donnees.precisionMm), priseLe: item.donnees.priseLe };
    }),
    quantities: quantites.map((item) => {
      const materiau = item.donnees.materiauId ? materiauxById.get(item.donnees.materiauId) : undefined;
      const piece = item.pieceId ? pieces.find((candidate) => candidate.id === item.pieceId) : undefined;
      return { ref: item.id, cle: item.donnees.cle, designation: [piece?.nom, item.donnees.libelle, materiau?.donnees.libelle].filter(Boolean).join(" — "), floorRef: item.etageId, roomRef: item.pieceId, formule: item.donnees.formule, resultat: round3(item.donnees.valeur), unite: toGpUnite(item.donnees.unite), qualite: item.donnees.qualite, materialRef: item.donnees.materiauId, gpPrestationRef: materiau?.donnees.gpPrestationRef ?? null, sources: (item.donnees.sources ?? []).map((ref) => ({ kind: ref.kind, ref: ref.id })), gpOuvrageRef: item.donnees.gpOuvrageRef ?? null };
    }),
    photos: photos.map((item) => {
      const media = medias.get(item.donnees.mediaId)!;
      return { ref: item.id, mediaRef: media.id, storagePath: media.storagePath, mimeType: media.mimeType, bytes: media.tailleOctets, ancre: ancreToGp(item.donnees.ancre), legende: item.donnees.legende };
    }),
    annotations: ofType(elements, "annotation").map((item) => ({ ref: item.id, forme: item.donnees.forme ?? "texte", texte: item.donnees.texte, geometrie: item.donnees.geometrie ?? null, ancre: ancreToGp(item.donnees.ancre), audioStoragePath: item.donnees.mediaAudioId ? medias.get(item.donnees.mediaAudioId)?.storagePath ?? null : null })),
    materials: materiaux.map((item) => ({ ref: item.id, libelle: item.donnees.libelle, categorie: item.donnees.categorie, unite: toGpUnite(item.donnees.unite), pertePourcent: item.donnees.pertePourcent, gpPrestationRef: item.donnees.gpPrestationRef, revetement: item.donnees.revetement ?? null })),
    coverings: materiaux.filter((item) => item.donnees.revetement).map((item) => ({ ref: item.id, materialRef: item.id, revetement: item.donnees.revetement!, support: item.donnees.categorie, libelle: item.donnees.libelle, quantityRefs: quantites.filter((quantite) => quantite.donnees.materiauId === item.id).map((quantite) => quantite.id as string) })),
    exports: alive(aggregate.medias).filter((media) => media.categorie === "exports" && EXPORT_KINDS[media.mimeType]).map((media) => ({ mediaRef: media.id, kind: EXPORT_KINDS[media.mimeType], storagePath: media.storagePath, mimeType: media.mimeType, bytes: media.tailleOctets })),
    equipments: ofType(elements, "equipement").map((item) => ({ ref: item.id, floorRef: item.etageId!, roomRef: item.pieceId, categorie: item.donnees.categorie, libelle: item.donnees.libelle, position: pointToM(item.donnees.position), rotationRad: item.donnees.rotationRad })),
    versions: lignee.map((item) => ({ ref: item.id, numero: item.numero, type: item.typeVersion, baseRef: item.versionBaseId, empreinte: item.empreinte, createdAt: item.createdAt })),
  };
  return { ok: true, envelope };
}
