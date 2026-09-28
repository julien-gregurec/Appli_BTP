// Export RGPD Studio (projet dédié) — contrat inter-projets B + I1, côté Studio.
// Entrée : demande signée « elsatia-export-request+jwt » (clé PUBLIQUE de la plateforme).
// Ordre imposé : vérification cryptographique → consommation du jti (usage unique) → lecture.
// Sortie : données du sujet (périmètre OWN_DATA / SHARED décidé en base) et URL signées courtes
// vers ses seuls fichiers OWN_DATA. Aucune clé plateforme ici, aucune donnée GP reçue.
import { IdentityError, TRANSIENT_CODES, type ExportRequestClaims } from "@elsatia/identity";

export const FORMAT_STUDIO_EXPORT = "elsatia.studio-export/1";
export const URL_FICHIER_SECONDES = 600;

export interface DependancesExport {
  verifier: (token: string) => Promise<ExportRequestClaims>;
  consommer: (jti: string, job: string, expireLe: string) => Promise<boolean>;
  lireSujet: (sujet: string, job: string) => Promise<Record<string, unknown>>;
  signer: (bucket: string, cle: string, secondes: number) => Promise<string | null>;
  log?: (evenement: string, detail: Record<string, unknown>) => void;
}

export interface ReponseExport {
  status: number;
  body: Record<string, unknown>;
}

const BUCKETS = new Set(["studio-originals", "studio-renders"]);

export async function servirExport(corps: unknown, d: DependancesExport): Promise<ReponseExport> {
  const token = (corps as { token?: unknown } | null)?.token;
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) return { status: 400, body: { code: "MALFORMED" } };
  let claims: ExportRequestClaims;
  try {
    claims = await d.verifier(token);
  } catch (erreur) {
    if (erreur instanceof IdentityError) {
      const status = TRANSIENT_CODES.has(erreur.code) ? 503 : erreur.code === "MALFORMED" ? 400 : 401;
      return { status, body: { code: erreur.code } };
    }
    return { status: 500, body: { code: "INTERNAL" } };
  }
  try {
    if (!(await d.consommer(claims.jti, claims.job, new Date(claims.exp * 1000).toISOString())))
      return { status: 409, body: { code: "REPLAY" } };
    const r = await d.lireSujet(claims.sub, claims.job);
    if (r.statut === "aucun_compte") return { status: 200, body: { statut: "aucun_compte", format: FORMAT_STUDIO_EXPORT } };
    if (r.statut !== "ok") return { status: 409, body: { code: "ACCOUNT_INACTIVE" } };
    const donnees: Record<string, unknown> = { ...r };
    const brut = donnees.fichiers as unknown[] | undefined;
    delete donnees.fichiers;
    delete donnees.statut;
    const fichiers = [];
    for (const f of (brut ?? []) as Array<Record<string, unknown>>) {
      const bucket = String(f.bucket ?? "");
      const cle = String(f.cle ?? "");
      const propre = f.categorie === "OWN_DATA" && BUCKETS.has(bucket) && /^studio\/[0-9a-f-]{36}\//.test(cle);
      fichiers.push({ bucket, cle, nom: f.nom ?? null, mime: f.mime ?? null, octets: f.octets ?? null, categorie: f.categorie,
        url: propre ? await d.signer(bucket, cle, URL_FICHIER_SECONDES) : null });
    }
    d.log?.("studio_export.served", { job: claims.job, fichiers: fichiers.length });
    return { status: 200, body: { statut: "ok", format: FORMAT_STUDIO_EXPORT, donnees, fichiers } };
  } catch {
    return { status: 503, body: { code: "STUDIO_DB_UNAVAILABLE" } };
  }
}
