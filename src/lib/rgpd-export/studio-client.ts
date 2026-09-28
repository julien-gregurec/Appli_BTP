// Contrat inter-projets d'export Studio (B + I1) — côté plateforme.
// La plateforme ne lit AUCUNE table Studio et n'en garde aucune copie : elle signe une demande
// d'export à usage unique (sujet opaque par audience, job, 60 s) avec sa clé d'identité, l'envoie
// au projet Studio dédié, et reçoit en réponse les données Studio du sujet + des URL signées
// courtes vers ses fichiers. Studio vérifie avec la clé PUBLIQUE (JWKS) ; aucune clé Studio ici.
import { STUDIO_AUDIENCE, type IdentityIssuer } from "@elsatia/identity";
import { FORMAT_STUDIO } from "./format";
import { ErreurTransitoire, type StudioExport, type StudioPort } from "./runner";
import { lireFlux } from "./supabase-ports";

const REPONSE_MAX_OCTETS = 50 * 1024 * 1024;

export interface OptionsStudioClient {
  issuer: IdentityIssuer;
  /** https://<studio>/api/elsatia/export (configuré, jamais tiré d'une requête). */
  url: string;
  /** Origines autorisées pour les URL de fichiers renvoyées par Studio (Storage du projet dédié). */
  originesFichiers: string[];
  fetcher?: typeof fetch;
  delaiMs?: number;
}

function reponseValide(v: unknown): v is StudioExport {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (r.format !== FORMAT_STUDIO) return false;
  if (r.statut === "aucun_compte") return true;
  if (r.statut !== "ok" || typeof r.donnees !== "object" || r.donnees === null || !Array.isArray(r.fichiers)) return false;
  return (r.fichiers as unknown[]).every((f) => {
    const x = f as Record<string, unknown>;
    return typeof x?.bucket === "string" && typeof x.cle === "string" && typeof x.categorie === "string"
      && (x.url === null || typeof x.url === "string");
  });
}

export function studioExportClient(o: OptionsStudioClient): StudioPort {
  const fetcher = o.fetcher ?? fetch;
  const origines = new Set(o.originesFichiers.map((u) => new URL(u).origin));
  return {
    async exporter(userId, jobId) {
      const { token } = o.issuer.issueExportRequest({ userId, audience: STUDIO_AUDIENCE, jobId });
      let reponse: Response;
      try {
        reponse = await fetcher(o.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(o.delaiMs ?? 30_000),
        });
      } catch (cause) {
        throw new ErreurTransitoire("STUDIO_INDISPONIBLE", { cause });
      }
      if (reponse.status >= 500 || reponse.status === 429) throw new ErreurTransitoire("STUDIO_INDISPONIBLE");
      if (!reponse.ok) throw new ErreurTransitoire("STUDIO_CONTRAT_REFUSE");
      const taille = Number(reponse.headers.get("content-length") ?? "0");
      if (taille > REPONSE_MAX_OCTETS) throw new ErreurTransitoire("STUDIO_REPONSE_TROP_GRANDE");
      let corps: unknown;
      try {
        corps = await reponse.json();
      } catch {
        throw new ErreurTransitoire("STUDIO_REPONSE_INVALIDE");
      }
      if (!reponseValide(corps)) throw new ErreurTransitoire("STUDIO_REPONSE_INVALIDE");
      return corps;
    },
    async lireUrl(url) {
      let cible: URL;
      try {
        cible = new URL(url);
      } catch {
        return null;
      }
      // Défense SSRF : seules les URL du Storage Studio configuré sont suivies.
      if (!origines.has(cible.origin)) return null;
      return lireFlux(cible.toString(), fetcher);
    },
  };
}
