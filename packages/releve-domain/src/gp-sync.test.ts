import { describe, expect, it } from "vitest";
import { releveFixture, TENANT_A, TENANT_B, USER_OWNER } from "./fixtures";
import { buildGpEnvelope, GP_SYNC_READINESS, GP_SYNC_SECTIONS, gpIdempotencyKey, mm2ToM2, mmToM, toGpUnite } from "./gp-sync";
import type { ElementType, MediaFile, ReleveAggregate, ReleveElement, Version } from "./model";

const meta = { entrepriseId: TENANT_A, createdAt: "2026-09-26T10:00:00Z", updatedAt: "2026-09-26T10:00:00Z", createdBy: USER_OWNER, updatedBy: USER_OWNER, revision: 1, deletedAt: null };
const GP_CHANTIER = "a4000000-0000-0000-0000-000000000001";
const releve = releveFixture({ chantier: { nom: "Rue des Lilas", adresse: "3 rue des Lilas", codePostal: "67000", ville: "Strasbourg", gpChantierId: GP_CHANTIER }, client: { nom: "M. Martin", gpClientId: "a3000000-0000-0000-0000-000000000001" } });
const ids = { bat: "e2000000-0000-0000-0000-000000000001", etage: "e3000000-0000-0000-0000-000000000001", piece: "e5000000-0000-0000-0000-000000000001", photo: "e7000000-0000-0000-0000-000000000001", export: "e7000000-0000-0000-0000-000000000002" };

function element<T extends ElementType>(id: string, type: T, donnees: unknown, extra: Partial<ReleveElement> = {}): ReleveElement {
  return { ...meta, id, releveId: releve.id, type, etageId: ids.etage, pieceId: ids.piece, parentElementId: null, schemaVersion: 1, donnees, ...extra } as unknown as ReleveElement;
}
const media = (id: string, categorie: MediaFile["categorie"], mimeType: string, ext: string): MediaFile =>
  ({ ...meta, id, releveId: releve.id, categorie, mimeType, tailleOctets: 2048, nomFichier: null, storagePath: `${TENANT_A}/${releve.id}/${categorie}/${id}.${ext}` }) as MediaFile;

const aggregate: ReleveAggregate = {
  releve,
  batiments: [{ ...meta, id: ids.bat, releveId: releve.id, nom: "Bâtiment A", ordre: 0, notes: null }] as never,
  etages: [{ ...meta, id: ids.etage, releveId: releve.id, batimentId: ids.bat, nom: "RDC", niveau: 0, altitudeMm: null, hauteurSousPlafondMm: 2500, etat: "existant", ordre: 0 }] as never,
  zones: [],
  pieces: [{ ...meta, id: ids.piece, releveId: releve.id, etageId: ids.etage, zoneId: null, nom: "Séjour", usage: "sejour", hauteurSousPlafondMm: null, ordre: 0 }] as never,
  elements: [
    element("m1", "mur", { a: { x: 0, y: 0 }, b: { x: 4200, y: 0 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" }),
    element("o1", "ouverture", { decalageMm: 600, largeurMm: 900, hauteurMm: 2150, allegeMm: null, typeOuverture: "porte", sens: "gauche" }, { parentElementId: "m1" as never }),
    element("x1", "mesure", { cible: { kind: "element", id: "m1" }, typeMesure: "longueur", valeur: 4203, unite: "mm", source: "laser", precisionMm: 2, priseLe: "2026-09-26T10:00:00Z" }),
    element("mat1", "materiau", { libelle: "Carrelage 60×60", categorie: "sol", unite: "m2", pertePourcent: 10, gpPrestationRef: null }),
    element("q1", "quantite", { cle: "sol", libelle: "Sol", valeur: 18.4567, unite: "m2", formule: "longueur*largeur", qualite: "exacte", materiauId: "mat1" }),
    element("ph1", "photo_anchor", { mediaId: ids.photo, ancre: { kind: "point", etageId: ids.etage, point: { x: 1500, y: 250 } }, directionRad: 0, legende: "Fissure" }),
    element("an1", "annotation", { ancre: { kind: "entite", ref: { kind: "element", id: "m1" } }, texte: "Mur humide", mediaAudioId: null }),
    element("gone", "mur", { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, epaisseurMm: 50, hauteurMm: null, typeMur: "cloison" }, { deletedAt: "2026-09-26T11:00:00Z" }),
  ],
  medias: [media(ids.photo, "photos", "image/jpeg", "jpg"), media(ids.export, "exports", "application/pdf", "pdf")],
};
const version: Version = { id: "e8000000-0000-0000-0000-000000000001" as never, entrepriseId: TENANT_A, releveId: releve.id, numero: 3, libelle: null, revisionSource: 12, empreinte: "f".repeat(64), createdAt: "2026-09-26T12:00:00Z", createdBy: USER_OWNER };

describe("contrat GP v1 (non branché)", () => {
  it("couvre les onze sections demandées et reste au statut contract-only", () => {
    expect(GP_SYNC_SECTIONS).toEqual(["client", "chantier", "structure", "plan", "measures", "quantities", "photos", "annotations", "materials", "openings", "exports"]);
    expect(GP_SYNC_READINESS.status).toBe("contract-only");
    expect(GP_SYNC_READINESS.targets.import_rpc).toBe("missing");
  });

  it("construit une enveloppe idempotente en mètres, sans aucun prix", () => {
    const result = buildGpEnvelope(aggregate, version, "2026-09-26T12:30:00Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { envelope } = result;
    for (const section of GP_SYNC_SECTIONS) expect(envelope).toHaveProperty(section);
    expect(envelope.idempotencyKey).toBe(gpIdempotencyKey(releve.id, 3, GP_CHANTIER));
    expect(envelope.chantier.gpChantierId).toBe(GP_CHANTIER);
    expect(envelope.structure[0].etages[0].pieces[0]).toMatchObject({ nom: "Séjour", hauteurSousPlafondM: 2.5 });
    expect(envelope.plan.murs).toEqual([expect.objectContaining({ ref: "m1", b: { x: 4.2, y: 0 }, epaisseurM: 0.2 })]);
    expect(envelope.openings).toEqual([expect.objectContaining({ murRef: "m1", largeurM: 0.9, decalageM: 0.6 })]);
    expect(envelope.measures[0]).toMatchObject({ valeur: 4.203, unite: "m" });
    expect(envelope.quantities[0]).toMatchObject({ designation: "Séjour — Sol — Carrelage 60×60", resultat: 18.457, unite: "m²" });
    expect(envelope.photos[0]).toMatchObject({ storagePath: aggregate.medias[0].storagePath, ancre: { kind: "point", point: { x: 1.5, y: 0.25 } } });
    expect(envelope.annotations[0]).toMatchObject({ texte: "Mur humide", ancre: { kind: "entite", ref: "m1" } });
    expect(envelope.exports).toEqual([expect.objectContaining({ kind: "plan_pdf" })]);
    expect(JSON.stringify(envelope)).not.toMatch(/prix|price|montant/i);
  });

  it("refuse une version sans chantier GP, d'un autre tenant, ou incohérente", () => {
    const unlinked = buildGpEnvelope({ ...aggregate, releve: releveFixture() }, version, "2026-09-26T12:30:00Z");
    expect(unlinked.ok ? [] : unlinked.issues.map((issue) => issue.code)).toEqual(["gp_chantier_missing"]);
    const foreign = buildGpEnvelope(aggregate, { ...version, entrepriseId: TENANT_B }, "2026-09-26T12:30:00Z");
    expect(foreign.ok ? [] : foreign.issues.map((issue) => issue.code)).toEqual(["tenant_mismatch"]);
    const orphan = buildGpEnvelope({ ...aggregate, elements: aggregate.elements.filter((item) => item.id !== "m1"), medias: [] }, version, "2026-09-26T12:30:00Z");
    expect(orphan.ok ? [] : orphan.issues.map((issue) => issue.code).sort()).toEqual(["media_missing", "opening_without_wall"]);
  });

  it("convertit les unités à la frontière (3 décimales, numeric(12,3))", () => {
    expect([mmToM(1234.56), mmToM(-0.4), mm2ToM2(18_456_789), toGpUnite("m3"), toGpUnite("ml")]).toEqual([1.235, 0, 18.457, "m³", "ml"]);
  });
});
