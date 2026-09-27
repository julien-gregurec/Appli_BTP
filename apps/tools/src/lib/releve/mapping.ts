/**
 * Conversion lignes SQL (snake_case) ↔ entités du domaine `@elsatia/releve-domain`.
 * Aucune règle métier ici : seulement des noms de colonnes et des types numériques
 * (`numeric` PostgREST peut arriver en chaîne).
 */
import type {
  ActivityEntry, Batiment, Chantier, Etage, EntityMeta, Piece, Releve, ReleveId, SearchHit, TenantId, UserId, Version, Zone,
} from "@elsatia/releve-domain";

export type MetaRow = {
  entreprise_id: string; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null;
  revision: number | string; deleted_at: string | null;
};
export type ReleveRow = MetaRow & {
  id: string; proprietaire_id: string; schema_version: number; nom: string; reference: string | null; statut: Releve["statut"];
  visibilite: Releve["visibilite"]; chantier_nom: string; chantier_adresse: string | null; chantier_code_postal: string | null;
  chantier_ville: string | null; chantier_gp_id: string | null; client_nom: string | null; client_gp_id: string | null;
  date_releve: string | null; notes: string | null;
};
export type ChantierRow = MetaRow & {
  id: string; releve_id: string; nom: string; adresse: string | null; code_postal: string | null; ville: string | null;
  chantier_gp_id: string | null; ordre: number; notes: string | null;
  // Lot 3 (migration 701) : facultatives pour relire une ligne d'un serveur antérieur.
  client_nom?: string | null; client_gp_id?: string | null; reference?: string | null; description?: string | null;
  date_releve?: string | null; statut?: Chantier["statut"];
};
export type BatimentRow = MetaRow & { id: string; releve_id: string; chantier_id: string; nom: string; ordre: number; notes: string | null };
export type EtageRow = MetaRow & {
  id: string; releve_id: string; batiment_id: string; nom: string; niveau: number; altitude_mm: number | string | null;
  hauteur_sous_plafond_mm: number | string | null; etat: Etage["etat"]; ordre: number; type_niveau?: Etage["typeNiveau"];
};
export type ZoneRow = MetaRow & { id: string; releve_id: string; etage_id: string; nom: string; type: Zone["type"]; ordre: number };
export type PieceRow = MetaRow & {
  id: string; releve_id: string; etage_id: string; zone_id: string | null; nom: string; usage: Piece["usage"];
  hauteur_sous_plafond_mm: number | string | null; ordre: number;
  commentaire?: string | null; statut?: Piece["statut"]; surface_calculee_mm2?: number | string | null; volume_calcule_mm3?: number | string | null;
};
export type VersionRow = {
  id: string; entreprise_id: string; releve_id: string; numero: number; type_version: Version["typeVersion"]; version_base_id: string | null;
  libelle: string | null; revision_source: number | string;
  empreinte: string; created_at: string; created_by: string | null;
};

const num = (value: number | string) => (typeof value === "number" ? value : Number(value));
const numOrNull = (value: number | string | null) => (value === null ? null : num(value));

function meta(row: MetaRow): EntityMeta {
  return {
    entrepriseId: row.entreprise_id as TenantId, createdAt: row.created_at, updatedAt: row.updated_at,
    createdBy: row.created_by as UserId | null, updatedBy: row.updated_by as UserId | null,
    revision: num(row.revision), deletedAt: row.deleted_at,
  };
}

export function releveFromRow(row: ReleveRow): Releve {
  return {
    ...meta(row), id: row.id as ReleveId, kind: "releve", schemaVersion: row.schema_version, proprietaireId: row.proprietaire_id as UserId,
    nom: row.nom, reference: row.reference, statut: row.statut, visibilite: row.visibilite,
    chantier: { nom: row.chantier_nom, adresse: row.chantier_adresse, codePostal: row.chantier_code_postal, ville: row.chantier_ville, gpChantierId: row.chantier_gp_id },
    client: { nom: row.client_nom, gpClientId: row.client_gp_id }, dateReleve: row.date_releve, notes: row.notes,
  };
}

export function chantierFromRow(row: ChantierRow): Chantier {
  return {
    ...meta(row), id: row.id as Chantier["id"], releveId: row.releve_id as ReleveId, nom: row.nom, adresse: row.adresse,
    codePostal: row.code_postal, ville: row.ville, gpChantierId: row.chantier_gp_id, ordre: row.ordre, notes: row.notes,
    clientNom: row.client_nom ?? null, clientGpId: row.client_gp_id ?? null, reference: row.reference ?? null,
    description: row.description ?? null, dateReleve: row.date_releve ?? null, statut: row.statut ?? "en_cours",
  };
}

export function batimentFromRow(row: BatimentRow): Batiment {
  return { ...meta(row), id: row.id as Batiment["id"], releveId: row.releve_id as ReleveId, chantierId: row.chantier_id as Batiment["chantierId"], nom: row.nom, ordre: row.ordre, notes: row.notes };
}

export function etageFromRow(row: EtageRow): Etage {
  return {
    ...meta(row), id: row.id as Etage["id"], releveId: row.releve_id as ReleveId, batimentId: row.batiment_id as Etage["batimentId"],
    nom: row.nom, niveau: row.niveau, altitudeMm: numOrNull(row.altitude_mm), hauteurSousPlafondMm: numOrNull(row.hauteur_sous_plafond_mm),
    etat: row.etat, ordre: row.ordre, typeNiveau: row.type_niveau ?? null,
  };
}

export function zoneFromRow(row: ZoneRow): Zone {
  return { ...meta(row), id: row.id as Zone["id"], releveId: row.releve_id as ReleveId, etageId: row.etage_id as Zone["etageId"], nom: row.nom, type: row.type, ordre: row.ordre };
}

export function pieceFromRow(row: PieceRow): Piece {
  return {
    ...meta(row), id: row.id as Piece["id"], releveId: row.releve_id as ReleveId, etageId: row.etage_id as Piece["etageId"],
    zoneId: row.zone_id as Piece["zoneId"], nom: row.nom, usage: row.usage, hauteurSousPlafondMm: numOrNull(row.hauteur_sous_plafond_mm), ordre: row.ordre,
    commentaire: row.commentaire ?? null, statut: row.statut ?? "a_relever",
    surfaceCalculeeMm2: numOrNull(row.surface_calculee_mm2 ?? null), volumeCalculeMm3: numOrNull(row.volume_calcule_mm3 ?? null),
  };
}

export function versionFromRow(row: VersionRow): Version {
  return {
    id: row.id as Version["id"], entrepriseId: row.entreprise_id as TenantId, releveId: row.releve_id as ReleveId, numero: row.numero,
    typeVersion: row.type_version, versionBaseId: row.version_base_id as Version["versionBaseId"], libelle: row.libelle, revisionSource: num(row.revision_source), empreinte: row.empreinte, createdAt: row.created_at, createdBy: row.created_by as UserId | null,
  };
}

/** Colonnes éditables d'un relevé : jamais les métadonnées, que le serveur impose. */
export function relevePatchToRow(patch: Partial<{
  nom: string; reference: string | null; statut: Releve["statut"]; visibilite: Releve["visibilite"]; chantierNom: string;
  chantierAdresse: string | null; chantierCodePostal: string | null; chantierVille: string | null; chantierGpId: string | null;
  clientNom: string | null; clientGpId: string | null; dateReleve: string | null; notes: string | null;
}>): Record<string, unknown> {
  const columns: Record<string, string> = {
    nom: "nom", reference: "reference", statut: "statut", visibilite: "visibilite", chantierNom: "chantier_nom",
    chantierAdresse: "chantier_adresse", chantierCodePostal: "chantier_code_postal", chantierVille: "chantier_ville",
    chantierGpId: "chantier_gp_id", clientNom: "client_nom", clientGpId: "client_gp_id", dateReleve: "date_releve", notes: "notes",
  };
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) if (value !== undefined && columns[key]) row[columns[key]] = value;
  return row;
}

/** Colonnes SQL des champs modifiables d'un nœud (clés de `validateNodePatch` + `ordre`). */
const NODE_COLUMNS: Record<string, string> = {
  nom: "nom", notes: "notes", ordre: "ordre", adresse: "adresse", codePostal: "code_postal", ville: "ville", gpChantierId: "chantier_gp_id",
  clientNom: "client_nom", clientGpId: "client_gp_id", reference: "reference", description: "description", dateReleve: "date_releve",
  statut: "statut", chantierId: "chantier_id", niveau: "niveau", altitudeMm: "altitude_mm", hauteurSousPlafondMm: "hauteur_sous_plafond_mm",
  etat: "etat", typeNiveau: "type_niveau", type: "type", usage: "usage", zoneId: "zone_id", commentaire: "commentaire",
};

export function nodePatchToRow(patch: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const column = NODE_COLUMNS[key];
    if (!column) throw new Error(`Champ non modifiable : ${key}`);
    row[column] = value;
  }
  return row;
}

export type SearchRow = {
  releve_id: string; releve_nom: string; entite: SearchHit["entite"]; entite_id: string; libelle: string; chantier_id: string | null;
  batiment_id: string | null; etage_id: string | null; zone_id: string | null; piece_id: string | null; updated_at: string;
};
export function searchHitFromRow(row: SearchRow): SearchHit {
  return {
    releveId: row.releve_id, releveNom: row.releve_nom, entite: row.entite, entiteId: row.entite_id, libelle: row.libelle, chantierId: row.chantier_id,
    batimentId: row.batiment_id, etageId: row.etage_id, zoneId: row.zone_id, pieceId: row.piece_id, updatedAt: row.updated_at,
  };
}

export type JournalRow = {
  id: number | string; entite: ActivityEntry["entite"]; entite_id: string; action: ActivityEntry["action"]; champs: string[] | null;
  auteur_id: string | null; created_at: string; details: Record<string, unknown> | null;
};
export function activityFromRow(row: JournalRow): ActivityEntry {
  return {
    id: num(row.id), entite: row.entite, entiteId: row.entite_id, action: row.action, champs: row.champs ?? [], auteurId: row.auteur_id,
    createdAt: row.created_at, details: row.details ?? null,
  };
}
