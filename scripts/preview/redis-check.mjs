#!/usr/bin/env node
/**
 * ELSATIA — Pack Preview : contrôle Redis du worker Studio, SANS dépendance (client RESP minimal
 * sur net/tls de Node) — utilisable sans `npm ci` du worker.
 *
 * Lecture seule par défaut : AUTH (depuis l'URL), PING, INFO server, INFO memory, puis état des
 * files BullMQ du worker (préfixe `bull:`) via TYPE / LLEN / ZCARD :
 *   studio-renders-v1        (job « render », worker.ts)
 *   studio-analysis-media-v1 (job « analyze », analysis-worker.ts)
 * Règles (alignées sur workers/studio-video/src/redis-readiness.ts) :
 *   erreur  : version < 5.0.0 · maxmemory_policy ≠ noeviction · schéma ≠ redis/rediss · PING ≠ PONG
 *   avert.  : version < 6.2.0 · redis:// (sans TLS) vers un hôte non local · politique non publiée
 * --roundtrip (safe-run) : SET elsatia:preview-smoke:<ts> EX 30 → GET → DEL (clé jetable, TTL).
 *
 * Usage :
 *   node scripts/preview/redis-check.mjs --env-file ~/elsatia-preview/worker.env [--roundtrip]
 *   (ou STUDIO_REDIS_URL dans l'environnement du shell)
 * L'URL (mot de passe) n'est jamais affichée. Sortie : 0 GO · 1 NO-GO · 2 refus.
 */
import net from "node:net";
import tls from "node:tls";
import { Refus, SORTIE, chargerFichierEnv, estPointEntree, ligne, lireOptions } from "./lib/preview-guard.mjs";

export const FILES = ["studio-renders-v1", "studio-analysis-media-v1"];
const ETATS_FILE = ["wait", "active", "paused", "prioritized", "delayed", "failed", "completed"];

export function encoder(args) {
  return `*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join("")}`;
}

/** Analyse UNE réponse RESP2 depuis un tampon. Renvoie { valeur, fin } ou null si incomplet. */
export function analyser(buf, i = 0) {
  if (i >= buf.length) return null;
  const type = String.fromCharCode(buf[i]);
  const eol = buf.indexOf("\r\n", i);
  if (eol < 0) return null;
  const tete = buf.toString("utf8", i + 1, eol);
  if (type === "+") return { valeur: tete, fin: eol + 2 };
  if (type === "-") return { valeur: new Error(tete), fin: eol + 2 };
  if (type === ":") return { valeur: Number(tete), fin: eol + 2 };
  if (type === "$") {
    const n = Number(tete);
    if (n < 0) return { valeur: null, fin: eol + 2 };
    if (buf.length < eol + 2 + n + 2) return null;
    return { valeur: buf.toString("utf8", eol + 2, eol + 2 + n), fin: eol + 2 + n + 2 };
  }
  if (type === "*") {
    const n = Number(tete);
    let pos = eol + 2;
    const out = [];
    for (let k = 0; k < n; k += 1) {
      const r = analyser(buf, pos);
      if (!r) return null;
      out.push(r.valeur);
      pos = r.fin;
    }
    return { valeur: out, fin: pos };
  }
  throw new Error("réponse RESP inattendue");
}

export function lireInfo(texte) {
  const out = {};
  for (const l of String(texte).split(/\r?\n/)) {
    const m = /^([a-z_0-9]+):(.*)$/.exec(l.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const versionNum = (v) => String(v ?? "0").split(".").map(Number).reduce((acc, n, k) => acc + (n || 0) * [10000, 100, 1][k], 0);
const estLocal = (h) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(h);

/** Pure : règles de conformité. */
export function evaluer({ protocole, hote, pong, infoServer, infoMemory }) {
  const out = [];
  if (!["redis:", "rediss:"].includes(protocole)) out.push(["error", "REDIS-SCHEME", "schéma redis:// ou rediss:// attendu"]);
  if (protocole === "redis:" && !estLocal(hote)) out.push(["warning", "REDIS-NO-TLS", "connexion sans TLS vers un hôte distant (rediss:// conseillé)"]);
  out.push(pong === "PONG" ? ["ok", "REDIS-PING", "PONG"] : ["error", "REDIS-PING", "PING sans PONG"]);
  const version = infoServer.redis_version;
  if (!version) out.push(["warning", "REDIS-VERSION", "version non publiée"]);
  else if (versionNum(version) < versionNum("5.0.0")) out.push(["error", "REDIS-VERSION", `version ${version} < 5.0.0 (BullMQ)`]);
  else if (versionNum(version) < versionNum("6.2.0")) out.push(["warning", "REDIS-VERSION", `version ${version} < 6.2.0 recommandée`]);
  else out.push(["ok", "REDIS-VERSION", version]);
  const politique = infoMemory.maxmemory_policy;
  if (!politique) out.push(["warning", "REDIS-EVICTION", "maxmemory_policy non publiée : vérifier noeviction dans la console du fournisseur"]);
  else if (politique !== "noeviction") out.push(["error", "REDIS-EVICTION", `maxmemory_policy=${politique} : BullMQ exige noeviction (sinon perte de jobs)`]);
  else out.push(["ok", "REDIS-EVICTION", "noeviction"]);
  return out;
}

function connecter(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const port = Number(url.port || 6379);
    const socket = url.protocol === "rediss:"
      ? tls.connect({ host: url.hostname, port, servername: url.hostname })
      : net.connect({ host: url.hostname, port });
    const minuterie = setTimeout(() => { socket.destroy(); reject(new Error("délai de connexion dépassé")); }, timeoutMs);
    socket.once(url.protocol === "rediss:" ? "secureConnect" : "connect", () => { clearTimeout(minuterie); resolve(socket); });
    socket.once("error", (e) => { clearTimeout(minuterie); reject(new Error(e.code ?? "erreur de connexion")); });
  });
}

function session(socket) {
  let tampon = Buffer.alloc(0);
  const attente = [];
  socket.on("data", (d) => {
    tampon = Buffer.concat([tampon, d]);
    for (;;) {
      if (!attente.length) break;
      const r = analyser(tampon);
      if (!r) break;
      tampon = tampon.subarray(r.fin);
      attente.shift()(r.valeur);
    }
  });
  return (...args) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`délai dépassé (${args[0]})`)), 8000);
    attente.push((v) => { clearTimeout(t); resolve(v); });
    socket.write(encoder(args));
  });
}

export async function executer({ urlTexte, roundtrip = false }, { log = console.log, maintenant = Date.now() } = {}) {
  let url;
  try { url = new URL(urlTexte); } catch { throw new Refus("STUDIO_REDIS_URL n'est pas une URL valide"); }
  const socket = await connecter(url);
  const cmd = session(socket);
  const constats = [];
  try {
    if (url.password) {
      const auth = url.username && url.username !== "default"
        ? await cmd("AUTH", decodeURIComponent(url.username), decodeURIComponent(url.password))
        : await cmd("AUTH", decodeURIComponent(url.password));
      if (auth instanceof Error) throw new Error("AUTH refusé");
    }
    const pong = await cmd("PING");
    const infoServer = lireInfo(await cmd("INFO", "server"));
    const infoMemory = lireInfo(await cmd("INFO", "memory"));
    constats.push(...evaluer({ protocole: url.protocol, hote: url.hostname, pong, infoServer, infoMemory }));
    for (const file of FILES) {
      const comptes = [];
      for (const etat of ETATS_FILE) {
        const cle = `bull:${file}:${etat}`;
        const type = await cmd("TYPE", cle);
        if (type === "list") comptes.push(`${etat}=${await cmd("LLEN", cle)}`);
        else if (type === "zset") comptes.push(`${etat}=${await cmd("ZCARD", cle)}`);
      }
      const meta = await cmd("EXISTS", `bull:${file}:meta`);
      constats.push(["info", "REDIS-QUEUE", `${file} : ${meta ? "initialisée" : "jamais initialisée (worker jamais démarré ?)"}${comptes.length ? ` — ${comptes.join(", ")}` : ""}`]);
      const echecs = comptes.find((c) => c.startsWith("failed="));
      if (echecs && Number(echecs.split("=")[1]) > 0) constats.push(["warning", "REDIS-QUEUE-FAILED", `${file} : jobs en échec présents (removeOnFail attendu : examiner studio_render_jobs.error_code)`]);
    }
    if (roundtrip) {
      const cle = `elsatia:preview-smoke:${maintenant}`;
      const set = await cmd("SET", cle, "ok", "EX", "30", "NX");
      const get = await cmd("GET", cle);
      const del = await cmd("DEL", cle);
      constats.push(set === "OK" && get === "ok" && del === 1 ? ["ok", "REDIS-ROUNDTRIP", "SET EX 30 / GET / DEL"] : ["error", "REDIS-ROUNDTRIP", "écriture/lecture/suppression incohérente"]);
    }
    await cmd("QUIT").catch(() => {});
  } finally {
    socket.destroy();
  }
  log(`ELSATIA — contrôle Redis Studio (${roundtrip ? "safe-run : 1 clé jetable" : "lecture seule"}, URL masquée)\n`);
  let erreurs = 0;
  for (const [niveau, code, message] of constats) {
    if (niveau === "error") erreurs += 1;
    log(ligne(niveau === "error" ? "ko" : niveau === "warning" ? "warn" : niveau === "ok" ? "ok" : "info", code, "redis", message));
  }
  log(erreurs ? `\nNO-GO : ${erreurs} erreur(s).` : "\nGO : Redis conforme pour BullMQ.");
  return erreurs ? SORTIE.NO_GO : SORTIE.GO;
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  try {
    const env = typeof o["env-file"] === "string" ? chargerFichierEnv(o["env-file"]) : process.env;
    if (!env.STUDIO_REDIS_URL) throw new Refus("STUDIO_REDIS_URL absente (--env-file worker.env ou shell)");
    process.exitCode = await executer({ urlTexte: env.STUDIO_REDIS_URL, roundtrip: Boolean(o.roundtrip) });
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; }
    else { console.error(`ÉCHEC : ${error instanceof Error ? error.message : String(error)}`); process.exitCode = SORTIE.NO_GO; }
  }
}
