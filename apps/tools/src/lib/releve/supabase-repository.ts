/**
 * Adaptateur Supabase du port `ReleveRepository` (web et WebView Capacitor).
 *
 * Tools n'a ni route API ni server action (export statique natif) : toutes les écritures
 * passent par PostgREST sous RLS. L'autorisation effective est celle du serveur
 * (`tools_releve_peut`) ; ce fichier ne fait que traduire le port en requêtes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ReleveConflictError, ReleveNotFoundError,
  type NewBatiment, type NewEtage, type NewPiece, type NewReleve, type NewZone, type ReleveId, type RelevePatch,
  type ReleveRepository, type StructureKind, type StructurePatch, type TenantId,
} from "@elsatia/releve-domain";
import {
  batimentFromRow, etageFromRow, pieceFromRow, releveFromRow, relevePatchToRow, versionFromRow, zoneFromRow,
  type BatimentRow, type EtageRow, type PieceRow, type ReleveRow, type VersionRow, type ZoneRow,
} from "./mapping";

export type ReleveSupabaseClient = Pick<SupabaseClient, "from" | "rpc">;

const TABLES: Record<StructureKind, string> = {
  batiment: "tools_releves_batiments", etage: "tools_releves_etages", zone: "tools_releves_zones", piece: "tools_releves_pieces",
};
const VERSION_COLUMNS = "id,entreprise_id,releve_id,numero,libelle,revision_source,empreinte,created_at,created_by";

export class ReleveRemoteError extends Error {
  constructor(message: string, public readonly code?: string) { super(message); this.name = "ReleveRemoteError"; }
}

/** Traduit une erreur PostgREST en message utilisateur, sans exposer le détail SQL. */
function fail(action: string, error: { code?: string; message?: string }): never {
  if (error.code === "42501") throw new ReleveRemoteError(`${action} : action non autorisée pour votre compte.`, error.code);
  if (error.code === "23503") throw new ReleveRemoteError(`${action} : élément parent introuvable dans ce relevé.`, error.code);
  if (error.code === "23514" || error.code === "22P02") throw new ReleveRemoteError(`${action} : valeur refusée par le serveur.`, error.code);
  throw new ReleveRemoteError(`${action} impossible. Vérifiez votre connexion.`, error.code);
}

export class SupabaseReleveRepository implements ReleveRepository {
  constructor(private readonly client: ReleveSupabaseClient) {}

  async listReleves(tenantId: TenantId) {
    const { data, error } = await this.client.from("tools_releves").select("*").eq("entreprise_id", tenantId).order("updated_at", { ascending: false });
    if (error) fail("Chargement des relevés", error);
    return ((data ?? []) as ReleveRow[]).map(releveFromRow);
  }

  async getStructure(releveId: ReleveId) {
    const [releve, batiments, etages, zones, pieces] = await Promise.all([
      this.client.from("tools_releves").select("*").eq("id", releveId).maybeSingle(),
      this.client.from(TABLES.batiment).select("*").eq("releve_id", releveId),
      this.client.from(TABLES.etage).select("*").eq("releve_id", releveId),
      this.client.from(TABLES.zone).select("*").eq("releve_id", releveId),
      this.client.from(TABLES.piece).select("*").eq("releve_id", releveId),
    ]);
    for (const result of [releve, batiments, etages, zones, pieces]) if (result.error) fail("Chargement du relevé", result.error);
    if (!releve.data) return null;
    return {
      releve: releveFromRow(releve.data as ReleveRow),
      batiments: ((batiments.data ?? []) as BatimentRow[]).map(batimentFromRow),
      etages: ((etages.data ?? []) as EtageRow[]).map(etageFromRow),
      zones: ((zones.data ?? []) as ZoneRow[]).map(zoneFromRow),
      pieces: ((pieces.data ?? []) as PieceRow[]).map(pieceFromRow),
    };
  }

  async createReleve(input: NewReleve) {
    const { data, error } = await this.client.from("tools_releves").insert({
      id: input.id, entreprise_id: input.entrepriseId, ...relevePatchToRow(input),
    }).select("*").single();
    if (error) fail("Création du relevé", error);
    return releveFromRow(data as ReleveRow);
  }

  async updateReleve(releveId: ReleveId, patch: RelevePatch, expectedRevision: number) {
    const { data, error } = await this.client.from("tools_releves").update(relevePatchToRow(patch))
      .eq("id", releveId).eq("revision", expectedRevision).select("*").maybeSingle();
    if (error) fail("Enregistrement du relevé", error);
    if (data) return releveFromRow(data as ReleveRow);
    const current = await this.client.from("tools_releves").select("revision").eq("id", releveId).maybeSingle();
    if (current.data) throw new ReleveConflictError(Number((current.data as { revision: number | string }).revision));
    throw new ReleveNotFoundError("Relevé");
  }

  async setReleveDeleted(releveId: ReleveId, deleted: boolean) {
    // L'horodatage réel est imposé par le serveur (trigger) ; la valeur envoyée n'est qu'un signal.
    const { data, error } = await this.client.from("tools_releves").update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq("id", releveId).select("*").maybeSingle();
    if (error) fail(deleted ? "Suppression du relevé" : "Restauration du relevé", error);
    if (!data) throw new ReleveNotFoundError("Relevé");
    return releveFromRow(data as ReleveRow);
  }

  async createBatiment(input: NewBatiment) {
    const { data, error } = await this.client.from(TABLES.batiment).insert({ id: input.id, releve_id: input.releveId, nom: input.nom, ordre: input.ordre, notes: input.notes }).select("*").single();
    if (error) fail("Ajout du bâtiment", error);
    return batimentFromRow(data as BatimentRow);
  }

  async createEtage(input: NewEtage) {
    const { data, error } = await this.client.from(TABLES.etage).insert({
      id: input.id, releve_id: input.releveId, batiment_id: input.batimentId, nom: input.nom, niveau: input.niveau,
      altitude_mm: input.altitudeMm, hauteur_sous_plafond_mm: input.hauteurSousPlafondMm, etat: input.etat, ordre: input.ordre,
    }).select("*").single();
    if (error) fail("Ajout de l'étage", error);
    return etageFromRow(data as EtageRow);
  }

  async createZone(input: NewZone) {
    const { data, error } = await this.client.from(TABLES.zone).insert({ id: input.id, releve_id: input.releveId, etage_id: input.etageId, nom: input.nom, type: input.type, ordre: input.ordre }).select("*").single();
    if (error) fail("Ajout de la zone", error);
    return zoneFromRow(data as ZoneRow);
  }

  async createPiece(input: NewPiece) {
    const { data, error } = await this.client.from(TABLES.piece).insert({
      id: input.id, releve_id: input.releveId, etage_id: input.etageId, zone_id: input.zoneId, nom: input.nom, usage: input.usage,
      hauteur_sous_plafond_mm: input.hauteurSousPlafondMm, ordre: input.ordre,
    }).select("*").single();
    if (error) fail("Ajout de la pièce", error);
    return pieceFromRow(data as PieceRow);
  }

  async updateStructureNode(kind: StructureKind, id: string, patch: StructurePatch) {
    const row: Record<string, unknown> = {};
    if (patch.nom !== undefined) row.nom = patch.nom;
    if (patch.ordre !== undefined) row.ordre = patch.ordre;
    const { error } = await this.client.from(TABLES[kind]).update(row).eq("id", id);
    if (error) fail("Modification", error);
  }

  async setStructureNodeDeleted(kind: StructureKind, id: string, deleted: boolean) {
    // La cascade (étages, zones, pièces, éléments) est exécutée par le serveur.
    const { error } = await this.client.from(TABLES[kind]).update({ deleted_at: deleted ? new Date().toISOString() : null }).eq("id", id);
    if (error) fail(deleted ? "Suppression" : "Restauration", error);
  }

  async createVersion(releveId: ReleveId, libelle: string | null) {
    const { data, error } = await this.client.rpc("tools_releve_creer_version", { p_releve_id: releveId, p_libelle: libelle });
    if (error) fail("Création de version", error);
    return versionFromRow(data as VersionRow);
  }

  async listVersions(releveId: ReleveId) {
    const { data, error } = await this.client.from("tools_releves_versions").select(VERSION_COLUMNS).eq("releve_id", releveId).order("numero", { ascending: false });
    if (error) fail("Chargement des versions", error);
    return ((data ?? []) as VersionRow[]).map(versionFromRow);
  }
}
