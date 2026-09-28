// ELSATIA — Qualification Preview distante : contexte d'exécution (processus, réseau, journaux).
//
// Toutes les I/O des étapes passent par ce contexte, ce qui permet :
//  - le mode --offline (aucun appel distant : fetch, DNS, TCP et commandes distantes lèvent `Reseau`) ;
//  - les tests hors réseau (fetch / run / dns injectés) ;
//  - le masquage systématique de ce qui est journalisé.

import { spawnSync } from "node:child_process";
import { promises as dnsPromises } from "node:dns";
import { appendFileSync, mkdirSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { Reseau } from "./core.mjs";

const CODES_RESEAU = /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|CERT_|UNABLE_TO_VERIFY)/;

function estErreurReseau(e) {
  const code = e?.cause?.code ?? e?.code ?? "";
  return CODES_RESEAU.test(String(code)) || e?.name === "TimeoutError" || /fetch failed/.test(String(e?.message));
}

/**
 * @param {object} p
 * @param {boolean} p.horsLigne       aucun appel distant
 * @param {string|null} p.journalDir  répertoire des journaux par étape (masqués), ou null
 * @param {import("./core.mjs").Masque} p.masque
 */
export function creerRuntime({ horsLigne, journalDir, masque, fetchImpl = globalThis.fetch, spawnImpl = spawnSync, dnsImpl = dnsPromises, netImpl = net }) {
  if (journalDir) mkdirSync(journalDir, { recursive: true });
  let etapeCourante = "orchestrateur";

  const journal = (texte) => {
    if (!journalDir) return;
    appendFileSync(join(journalDir, `${etapeCourante}.log`), `${masque.appliquer(texte)}\n`);
  };

  return {
    horsLigne,
    masque,
    set etape(id) { etapeCourante = id; },
    journal,

    /** Commande LOCALE (git, node hors réseau, pg_restore --list…). Jamais bloquée hors ligne. */
    local(cmd, args, { env = {}, input, timeoutMs = 120_000, cwd } = {}) {
      journal(`$ ${cmd} ${args.join(" ")}`);
      const r = spawnImpl(cmd, args, { cwd, input, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
      if (r.error && r.error.code === "ENOENT") return { code: 127, stdout: "", stderr: `${cmd} introuvable` };
      const res = { code: r.status ?? (r.signal ? 124 : 1), stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
      journal(`[code ${res.code}]\n${res.stdout}\n${res.stderr}`);
      return res;
    },

    /** Commande DISTANTE (psql, pg_dump, supabase CLI, scripts réseau, Playwright). */
    distant(cmd, args, options = {}) {
      if (horsLigne) throw new Reseau(`mode --offline : ${cmd} non exécuté (aucun appel distant)`);
      return this.local(cmd, args, options);
    },

    async fetch(url, init = {}, timeoutMs = 20_000) {
      if (horsLigne) throw new Reseau("mode --offline : aucune requête HTTP");
      journal(`HTTP ${init.method ?? "GET"} ${new URL(url).origin}${new URL(url).pathname}`);
      try {
        const r = await fetchImpl(url, { ...init, redirect: init.redirect ?? "manual", signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
        journal(`→ ${r.status}`);
        return r;
      } catch (e) {
        if (estErreurReseau(e)) throw new Reseau(`${new URL(url).hostname} injoignable (${e?.cause?.code ?? e?.code ?? e?.name})`);
        throw e;
      }
    },

    async dns(hote) {
      if (horsLigne) throw new Reseau("mode --offline : aucune résolution DNS");
      try { return await dnsImpl.lookup(hote, { all: true }); } catch (e) { throw new Reseau(`DNS ${hote} : ${e.code ?? e.message}`); }
    },

    /** Ouverture TCP (sans rien envoyer) : prouve la joignabilité d'un port (PostgreSQL, Redis). */
    tcp(hote, port, timeoutMs = 8000) {
      if (horsLigne) return Promise.reject(new Reseau("mode --offline : aucune connexion TCP"));
      return new Promise((resolve, reject) => {
        const s = netImpl.connect({ host: hote, port: Number(port) });
        const fin = (err) => { s.destroy(); if (err) reject(new Reseau(`${hote}:${port} injoignable (${err.code ?? err.message})`)); else resolve(true); };
        s.setTimeout(timeoutMs, () => fin(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
        s.once("connect", () => fin(null));
        s.once("error", fin);
      });
    },
  };
}
