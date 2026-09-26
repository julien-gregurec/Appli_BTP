// Exécution réelle du planificateur de purge RGPD (src/lib/rgpd-purge-planificateur.ts)
// contre PostgreSQL local + mock PostgREST/Storage (mock_supabase_server.mjs), via le
// vrai @supabase/supabase-js — même adaptateur que le cron /api/cron/abonnements.
// Voir docs/qualification/ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1.md §7.
//
// Usage : node --experimental-strip-types .qualification-tools/planificateur_purge_e2e.mts
//   (variables : RGPD_PURGE_PLANIFICATEUR_MODE, RGPD_PURGE_DECISION_REF, MOCK_URL,
//    MOCK_SERVICE_ROLE_KEY)
import { createClient } from "@supabase/supabase-js";
import {
  creerPortPurgeSupabase,
  lireConfigPlanificateurPurge,
  planifierPurgesRgpd,
} from "../src/lib/rgpd-purge-planificateur.ts";

const url = process.env.MOCK_URL ?? "http://localhost:54321";
const cle = process.env.MOCK_SERVICE_ROLE_KEY ?? "service_role_key_local";
const admin = createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });

// Compte les appels HTTP réellement émis (preuve que le mode off n'accède pas à la base).
let appelsHttp = 0;
const fetchOrigine = globalThis.fetch;
globalThis.fetch = (...args: Parameters<typeof fetch>) => {
  appelsHttp += 1;
  return fetchOrigine(...args);
};

const config = lireConfigPlanificateurPurge(process.env);
const bilan = await planifierPurgesRgpd(creerPortPurgeSupabase(admin), config, new Date());
console.log(JSON.stringify({ config, appelsHttp, bilan }, null, 2));
