import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  createIdentityVerifier,
  createStudioIdentityBroker,
  IdentityError,
  remoteJwks,
  staticJwks,
  STUDIO_AUDIENCE,
  supabaseStudioAuthAdmin,
  supabaseStudioStore,
  type JwksSource,
  type StudioIdentityBroker,
} from "@elsatia/identity";
import { studioLegalPublished } from "@elsatia/studio-domain";
import { supabaseConfig } from "./config";
import { identityMode } from "./identity-policy";

// Studio sur projet Supabase DÉDIÉ + compte ELSATIA commun (décision B + I1).
// Studio ne détient que des clés PUBLIQUES de l'identité centrale et sa propre clé service :
//   ELSATIA_IDENTITY_ISSUER       émetteur attendu (propre à l'environnement)
//   ELSATIA_IDENTITY_JWKS         JWKS épinglé (JSON)            ─┐ l'un OU l'autre
//   ELSATIA_IDENTITY_JWKS_URL     JWKS publié par la plateforme  ─┘ (épinglé prioritaire)
//   ELSATIA_IDENTITY_HANDOFF_URL  https://<gp>/identity/studio/handoff
//   STUDIO_AUTH_SERVICE_KEY       clé service du projet Studio (serveur uniquement)
export { identityMode };

let jwksCache: { key: string; source: JwksSource } | null = null;
function jwksSource(): JwksSource {
  const pinned = process.env.ELSATIA_IDENTITY_JWKS;
  const url = process.env.ELSATIA_IDENTITY_JWKS_URL;
  const key = `${pinned ?? ""}\u0000${url ?? ""}`;
  if (jwksCache?.key === key) return jwksCache.source;
  let source: JwksSource;
  if (pinned) source = staticJwks(JSON.parse(pinned));
  else if (url) source = remoteJwks({ url });
  else throw new IdentityError("CONFIG_INVALID", { detail: "ELSATIA_IDENTITY_JWKS(_URL) absente" });
  jwksCache = { key, source };
  return source;
}

/** Client service du projet Studio. Jamais exposé au navigateur ; aucune clé plateforme ici. */
export function studioAuthAdmin() {
  const key = process.env.STUDIO_AUTH_SERVICE_KEY;
  if (!key) throw new IdentityError("CONFIG_INVALID", { detail: "STUDIO_AUTH_SERVICE_KEY absente" });
  return createClient(supabaseConfig().url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function studioBroker(): StudioIdentityBroker {
  const issuer = process.env.ELSATIA_IDENTITY_ISSUER;
  if (!issuer) throw new IdentityError("CONFIG_INVALID", { detail: "ELSATIA_IDENTITY_ISSUER absente" });
  const admin = studioAuthAdmin();
  return createStudioIdentityBroker({
    verifier: createIdentityVerifier({ issuer, audience: STUDIO_AUDIENCE, jwks: jwksSource() }),
    store: supabaseStudioStore(admin),
    auth: supabaseStudioAuthAdmin(admin),
    // Précondition locale Studio : pas de création de compte tant que les conditions Studio ne
    // sont pas publiées (FAIL-CLOSED), même si la plateforme accorde le droit.
    canProvision: () => studioLegalPublished(process.env.STUDIO_LEGAL_PUBLISHED),
    log: (event, detail) => console.info(JSON.stringify({ scope: "studio-identity", event, ...detail })),
  });
}

export function handoffUrl(nonce: string): URL {
  const value = process.env.ELSATIA_IDENTITY_HANDOFF_URL;
  if (!value) throw new IdentityError("CONFIG_INVALID", { detail: "ELSATIA_IDENTITY_HANDOFF_URL absente" });
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
    throw new IdentityError("CONFIG_INVALID", { detail: "ELSATIA_IDENTITY_HANDOFF_URL doit être en https" });
  url.searchParams.set("nonce", nonce);
  return url;
}
