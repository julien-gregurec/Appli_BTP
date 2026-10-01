// Banc PostgREST réel (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
// Actif seulement si scripts/qualification/finance-aggregates/postgrest-bench.sh
// a été lancé et que ses variables (FINANCE_BENCH_*) sont exportées ; sinon les
// suites qui l'utilisent sont ignorées (CI sans base locale).
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const bancActif = Boolean(process.env.FINANCE_BENCH_URL && process.env.FINANCE_BENCH_DB);
export const PERIODE_BANC = { debut: "2026-01-01", fin: "2026-06-30" };
// Préfixe d'UUID de chaque entreprise du banc (voir seed.sql) → volume par table.
export const VOLUMES_BANC = [
  { prefixe: "f0500", volume: 500 },
  { prefixe: "f1000", volume: 1000 },
  { prefixe: "f1462", volume: 1462 },
  { prefixe: "f5000", volume: 5000 },
  { prefixe: "f2000", volume: 20000 },
] as const;
export const PREFIXE_TEMOIN = "fe000";

export const entrepriseBanc = (prefixe: string) => `${prefixe}e00-0000-0000-0000-000000000001`;

export function clientBanc(prefixe: string, profil: "ADMIN" | "OUVRIER" = "ADMIN"): SupabaseClient {
  const jeton = process.env[`FINANCE_BENCH_JWT_${prefixe.toUpperCase()}_${profil}`];
  if (!jeton) throw new Error(`Jeton de banc absent pour ${prefixe}/${profil}`);
  const base = process.env.FINANCE_BENCH_URL!;
  // supabase-js appelle `${url}/rest/v1/…` ; le banc sert PostgREST à la racine.
  return createClient("http://banc.local", process.env.FINANCE_BENCH_ANON ?? jeton, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${jeton}` },
      fetch: (entree, init) => fetch(String(entree instanceof Request ? entree.url : entree).replace("http://banc.local/rest/v1", base), init),
    },
  });
}

// Vérité PostgreSQL : requête superutilisateur directe, hors PostgREST et hors
// code applicatif. Renvoie la valeur JSON de la première colonne.
export function veritePg<T>(sql: string): T {
  const sortie = execFileSync("su", ["postgres", "-c", `psql -X -A -t -q -v ON_ERROR_STOP=1 -d ${process.env.FINANCE_BENCH_DB}`], {
    input: `select coalesce((${sql})::text, 'null');`,
    encoding: "utf8",
  });
  return JSON.parse(sortie.trim()) as T;
}
