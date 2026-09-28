// §9 AUTH · §10 STORAGE · §11 EMAIL · §12 STRIPE · §13 REDIS · §14 HTTP
import { join } from "node:path";
import { brevoSandbox } from "../../../smoke-email-preview.mjs";
import { Identifiant, NATURE, Reseau, STATUT, Saut, masquerEmail, resultat } from "../lib/core.mjs";
import { APPS_WEB, destinataireAutorise, estHoteProduction } from "../lib/target.mjs";
import { PNG_1X1, depuisScript, estDefinie, exigerApiPreview, exigerCible, exigerVars, jsonOuNull, lignesSignificatives, scriptDistant, scriptLocal } from "./helpers.mjs";

const BUCKET = "pointage-preuves";

function supabase(c) {
  exigerApiPreview(c);
  const base = c.envs.gp.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  const cle = c.envs.gp.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || c.envs.gp.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!estDefinie(cle)) throw new Identifiant("gp.env : clé Supabase publique absente");
  return { base, cle };
}

/** Comptes de recette : e-mail (cible) + mot de passe (qualification.env). */
function comptes(c) {
  const out = [];
  for (const [t, v] of [["tenant_a", "ELSATIA_QA_PASSWORD_A"], ["tenant_b", "ELSATIA_QA_PASSWORD_B"]]) {
    const q = c.cible?.qa?.[t];
    if (!q) throw new Saut(`qa.${t} non déclaré dans le fichier de cible`);
    if (!estDefinie(c.q(v))) throw new Identifiant(`${v} absente`);
    out.push({ t, email: q.email, entreprise: q.entreprise_id, mdp: c.q(v) });
  }
  return out;
}

async function connecter(c, { base, cle }, email, mdp) {
  const r = await c.rt.fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: cle, "content-type": "application/json" }, body: JSON.stringify({ email, password: mdp }) });
  const j = r.ok ? await jsonOuNull(r) : null;
  if (j?.access_token) { c.masque.ajouter(j.access_token); c.masque.ajouter(j.refresh_token); }
  return { statut: r.status, session: j?.access_token ? j : null };
}

export const etapesServices = [
  {
    id: "auth.gotrue", section: 9, titre: "Auth : login, refresh, logout, reset (comptes de recette)", nature: NATURE.SAFE_WRITE, critique: false, requise: true,
    async executer(c) {
      exigerCible(c);
      const sb = supabase(c);
      const cpt = comptes(c);
      if (c.rt.horsLigne) throw new Reseau("mode --offline : GoTrue non appelé");
      const h = { apikey: sb.cle, "content-type": "application/json" };
      const erreurs = [];
      const details = [];
      const verifier = (cond, ok, ko) => { if (cond) details.push(`✓ ${ok}`); else erreurs.push(ko); };

      const anon = await c.rt.fetch(`${sb.base}/auth/v1/user`, { headers: { apikey: sb.cle } });
      verifier(anon.status === 401 || anon.status === 403, "anonyme : /auth/v1/user refusé", `anonyme : /auth/v1/user → HTTP ${anon.status}`);
      const faux = await c.rt.fetch(`${sb.base}/auth/v1/token?grant_type=password`, { method: "POST", headers: h, body: JSON.stringify({ email: cpt[0].email, password: `faux-${Date.now()}` }) });
      verifier(faux.status === 400, "mauvais mot de passe refusé (400)", `mauvais mot de passe → HTTP ${faux.status}`);

      for (const u of cpt) {
        const lbl = `${u.t} (${masquerEmail(u.email)})`;
        const { statut, session } = await connecter(c, sb, u.email, u.mdp);
        if (!session) { erreurs.push(`${lbl} : login HTTP ${statut}`); continue; }
        details.push(`✓ ${lbl} : login`);
        const me = await c.rt.fetch(`${sb.base}/auth/v1/user`, { headers: { apikey: sb.cle, Authorization: `Bearer ${session.access_token}` } });
        const mj = me.ok ? await jsonOuNull(me) : null;
        verifier(mj?.email?.toLowerCase() === u.email.toLowerCase(), `${lbl} : /user rend le bon compte`, `${lbl} : /user HTTP ${me.status}`);
        const rf = await c.rt.fetch(`${sb.base}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: h, body: JSON.stringify({ refresh_token: session.refresh_token }) });
        const rj = rf.ok ? await jsonOuNull(rf) : null;
        if (rj?.access_token) { c.masque.ajouter(rj.access_token); c.masque.ajouter(rj.refresh_token); }
        verifier(Boolean(rj?.access_token) && rj.refresh_token !== session.refresh_token, `${lbl} : refresh → nouvelle session (rotation)`, `${lbl} : refresh HTTP ${rf.status}`);
        const jeton = rj?.access_token ?? session.access_token;
        const out = await c.rt.fetch(`${sb.base}/auth/v1/logout`, { method: "POST", headers: { apikey: sb.cle, Authorization: `Bearer ${jeton}` } });
        verifier(out.status === 204 || out.status === 200, `${lbl} : logout`, `${lbl} : logout HTTP ${out.status}`);
        if (rj?.refresh_token) {
          const apres = await c.rt.fetch(`${sb.base}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: h, body: JSON.stringify({ refresh_token: rj.refresh_token }) });
          verifier(apres.status >= 400 && apres.status < 500, `${lbl} : refresh après logout refusé`, `${lbl} : refresh après logout → HTTP ${apres.status} (session non révoquée)`);
        }
      }

      // Reset : UNIQUEMENT vers une adresse de l'allowlist de recette, et seulement en mode complet.
      const cibleReset = cpt.find((u) => destinataireAutorise(c.cible, u.email));
      if (!c.ecrituresAutorisees) details.push("reset : non envoyé (écritures non autorisées)");
      else if (!cibleReset) details.push("reset : aucun compte de recette dans brevo.recipient_allowlist — non envoyé");
      else {
        const rec = await c.rt.fetch(`${sb.base}/auth/v1/recover`, { method: "POST", headers: h, body: JSON.stringify({ email: cibleReset.email }) });
        verifier(rec.ok, `reset demandé pour ${masquerEmail(cibleReset.email)} (RÉCEPTION à constater dans la boîte)`, `reset → HTTP ${rec.status}`);
        c.etat.confirmationsManuelles.push(`e-mail de réinitialisation Supabase Auth reçu par ${masquerEmail(cibleReset.email)} (lien vers /auth/confirm de Gestion Pro)`);
      }
      return erreurs.length ? resultat(STATUT.NO_GO, erreurs[0], [...erreurs, ...details]) : resultat(STATUT.GO, "GoTrue : login, refresh, logout, révocation, reset", details);
    },
  },
  {
    id: "storage.buckets", section: 10, titre: "Storage : buckets, anonymat, objet jetable (service)", nature: NATURE.READ, critique: false, requise: true,
    async executer(c) {
      exigerCible(c);
      exigerVars(c, "gp", ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
      const args = ["--env-file", join(c.options.envDir, "gp.env"), "--preview-ref", c.cible.supabase.project_ref];
      if (c.ecrituresAutorisees) args.push("--write");
      return depuisScript(c, scriptDistant(c, "scripts/preview/storage-smoke.mjs", args), c.ecrituresAutorisees ? "19 buckets conformes ; upload/URL signée/suppression OK" : "19 buckets conformes (lecture seule)", "Storage : NO-GO");
    },
  },
  {
    id: "storage.cross-tenant", section: 10, titre: "Storage : upload/lecture/URL signée/suppression et isolation inter-entreprises", nature: NATURE.SAFE_WRITE, critique: false, requise: true,
    async executer(c) {
      exigerCible(c);
      const sb = supabase(c);
      const [a, b] = comptes(c);
      if (c.rt.horsLigne) throw new Reseau("mode --offline : Storage non appelé");
      const sa = (await connecter(c, sb, a.email, a.mdp)).session;
      const sbb = (await connecter(c, sb, b.email, b.mdp)).session;
      if (!sa || !sbb) return resultat(STATUT.NO_GO, "connexion d'un compte de recette impossible");
      const H = (s, extra = {}) => ({ apikey: sb.cle, Authorization: `Bearer ${s.access_token}`, ...extra });
      const chemin = `${a.entreprise}/preview-qualification/${c.maintenant}.png`;
      const url = (p) => `${sb.base}/storage/v1/object/${p}`;
      const erreurs = [];
      const details = [];
      const verifier = (cond, ok, ko) => { if (cond) details.push(`✓ ${ok}`); else erreurs.push(ko); };
      const lire = async (s) => { const r = await c.rt.fetch(url(`authenticated/${BUCKET}/${chemin}`), { headers: H(s) }); return { statut: r.status, octets: r.ok ? Buffer.from(await r.arrayBuffer()) : null }; };
      try {
        const up = await c.rt.fetch(url(`${BUCKET}/${chemin}`), { method: "POST", headers: H(sa, { "content-type": "image/png", "x-upsert": "false" }), body: PNG_1X1 });
        verifier(up.ok, "A : upload dans son entreprise", `A : upload HTTP ${up.status} (le compte A doit avoir la permission gerer_pointage)`);
        if (up.ok) {
          const la = await lire(sa);
          verifier(la.octets?.equals(PNG_1X1), "A : lecture authentifiée, octets identiques", `A : lecture HTTP ${la.statut}`);
          const sg = await c.rt.fetch(url(`sign/${BUCKET}/${chemin}`), { method: "POST", headers: H(sa, { "content-type": "application/json" }), body: JSON.stringify({ expiresIn: 60 }) });
          const lien = sg.ok ? (await jsonOuNull(sg))?.signedURL : null;
          if (lien) {
            const g = await c.rt.fetch(`${sb.base}/storage/v1${lien.startsWith("/") ? "" : "/"}${lien}`);
            verifier(g.ok && Buffer.from(await g.arrayBuffer()).equals(PNG_1X1), "A : URL signée 60 s lisible", `A : URL signée HTTP ${g.status}`);
          } else erreurs.push(`A : signature HTTP ${sg.status}`);
          const pub = await c.rt.fetch(url(`public/${BUCKET}/${chemin}`));
          verifier(!pub.ok, `anonyme : URL publique refusée (HTTP ${pub.status})`, "anonyme : objet privé lisible par URL publique");
          const lb = await lire(sbb);
          verifier(!lb.octets, `B : lecture de l'objet de A refusée (HTTP ${lb.statut})`, "B : lit l'objet de l'entreprise A (FUITE)");
          const sgb = await c.rt.fetch(url(`sign/${BUCKET}/${chemin}`), { method: "POST", headers: H(sbb, { "content-type": "application/json" }), body: JSON.stringify({ expiresIn: 60 }) });
          verifier(!sgb.ok, `B : signature refusée (HTTP ${sgb.status})`, "B : obtient une URL signée sur l'objet de A (FUITE)");
          const upb = await c.rt.fetch(url(`${BUCKET}/${a.entreprise}/preview-qualification/${c.maintenant}-b.png`), { method: "POST", headers: H(sbb, { "content-type": "image/png" }), body: PNG_1X1 });
          verifier(!upb.ok, `B : écriture dans le dossier de A refusée (HTTP ${upb.status})`, "B : écrit dans le dossier de l'entreprise A (FUITE)");
          await c.rt.fetch(url(BUCKET), { method: "DELETE", headers: H(sbb, { "content-type": "application/json" }), body: JSON.stringify({ prefixes: [chemin] }) });
          const toujours = await lire(sa);
          verifier(Boolean(toujours.octets), "B : suppression de l'objet de A sans effet", "B : a supprimé l'objet de l'entreprise A (FUITE)");
          const del = await c.rt.fetch(url(BUCKET), { method: "DELETE", headers: H(sa, { "content-type": "application/json" }), body: JSON.stringify({ prefixes: [chemin] }) });
          const apres = await lire(sa);
          verifier(del.ok && !apres.octets, "A : suppression effective", `A : suppression HTTP ${del.status}, relecture ${apres.statut}`);
        }
      } finally {
        // Nettoyage de secours (clé de service) : aucun objet de recette ne reste.
        if (estDefinie(c.envs.gp.SUPABASE_SERVICE_ROLE_KEY)) {
          const k = c.envs.gp.SUPABASE_SERVICE_ROLE_KEY;
          await c.rt.fetch(url(BUCKET), { method: "DELETE", headers: { apikey: k, Authorization: `Bearer ${k}`, "content-type": "application/json" }, body: JSON.stringify({ prefixes: [chemin, `${a.entreprise}/preview-qualification/${c.maintenant}-b.png`] }) }).catch(() => {});
        }
      }
      return erreurs.length ? resultat(STATUT.NO_GO, erreurs[0], [...erreurs, ...details]) : resultat(STATUT.GO, "Storage : cycle complet et isolation A/B", details);
    },
  },
  {
    id: "email.brevo", section: 11, titre: "E-mail : configuration, bac à sable, envoi réel vers l'allowlist", nature: NATURE.READ, critique: false, requise: true,
    async executer(c) {
      exigerCible(c);
      exigerVars(c, "gp", ["BREVO_API_KEY", "EMAIL_FROM_ADDRESS"]);
      const to = c.options.emailTo ?? c.cible.brevo?.recipient_allowlist?.[0];
      if (!to) throw new Identifiant("brevo.recipient_allowlist vide");
      if (!destinataireAutorise(c.cible, to)) return resultat(STATUT.NO_GO, `destinataire ${masquerEmail(to)} hors allowlist de recette : refus`);
      if (c.etape("preflight.brevo")?.statut === STATUT.NO_GO) return resultat(STATUT.NO_GO, "compte Brevo non confirmé recette (preflight.brevo) : aucun envoi, même en bac à sable");
      const chk = scriptLocal(c, "scripts/smoke-email-preview.mjs", ["--check"], c.envs.gp);
      const details = lignesSignificatives(c, chk.sortie);
      if (chk.code !== 0) return resultat(STATUT.NO_GO, "configuration e-mail non conforme", details);
      if (c.rt.horsLigne) throw new Reseau("mode --offline : Brevo non appelé");
      const sb = await brevoSandbox(c.envs.gp, to, { fetchImpl: (u, i) => c.rt.fetch(u, i) });
      if (!sb.ok) return resultat(STATUT.NO_GO, `Brevo bac à sable : HTTP ${sb.statut}`, details);
      details.push(`✓ Brevo bac à sable (X-Sib-Sandbox: drop) : HTTP ${sb.statut}`);
      if (!c.ecrituresAutorisees) return resultat(c.options.mode === "full" ? STATUT.SKIPPED : STATUT.GO, c.options.mode === "full" ? "envoi réel suspendu par l'arrêt de sécurité (bac à sable seul)" : "Brevo : clé, expéditeur et charge utile validés (bac à sable)", details);
      const r = await c.rt.fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": c.envs.gp.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: c.envs.gp.EMAIL_FROM_NAME || "ELSATIA", email: c.envs.gp.EMAIL_FROM_ADDRESS },
          to: [{ email: to }],
          subject: `[PREVIEW][QUALIFICATION] ELSATIA ${c.train.train} ${(c.etat.git?.head ?? "").slice(0, 8)}`,
          textContent: `Qualification Preview ELSATIA ${c.train.train} (${new Date(c.maintenant).toISOString()}). Message de recette envoyé uniquement à l'allowlist.`,
        }),
      });
      const j = r.ok ? await jsonOuNull(r) : null;
      if (!r.ok) return resultat(STATUT.NO_GO, `Brevo envoi réel : HTTP ${r.status}`, details);
      details.push(`✓ envoi réel accepté vers ${masquerEmail(to)} (messageId ${j?.messageId ? "reçu" : "absent"})`);
      c.etat.confirmationsManuelles.push(`e-mail « [PREVIEW][QUALIFICATION] ELSATIA » reçu par ${masquerEmail(to)}`);
      return resultat(STATUT.GO, "Brevo : envoi réel accepté (réception à constater)", details);
    },
  },
  {
    id: "stripe.verify", section: 12, titre: "Stripe Test : webhooks, portail, prix", nature: NATURE.READ, critique: false, requise: true,
    async executer(c) {
      exigerCible(c);
      exigerVars(c, "gp", ["STRIPE_SECRET_KEY"]);
      if (c.etape("preflight.stripe-mode")?.statut === STATUT.NO_GO) return resultat(STATUT.NO_GO, "Stripe : mode non confirmé Test (preflight.stripe-mode) — aucun appel");
      const gpOrigin = c.cible.vercel.projects.gp.preview_origin;
      const scope = estDefinie(c.envs.gp.STRIPE_TOOLS_SECRET_KEY) ? "abonnement,tools" : "abonnement";
      const args = ["--env-file", join(c.options.envDir, "gp.env"), "--gp-origin", gpOrigin, "--scope", scope];
      if (!new URL(gpOrigin).hostname.endsWith(".vercel.app")) args.push("--allow-custom-domain");
      const v = scriptDistant(c, "scripts/preview/stripe-test-verify.mjs", args);
      const p = scriptDistant(c, "scripts/verify-stripe-prices.mjs", ["--strict"], { STRIPE_SECRET_KEY: c.envs.gp.STRIPE_SECRET_KEY, STRIPE_PRICES_VERIFY_STRICT: "1" });
      const details = [...lignesSignificatives(c, v.sortie), ...lignesSignificatives(c, p.sortie, 20)];
      const statuts = [v.statut, p.statut];
      const pire = [STATUT.NO_GO, STATUT.BLOCKED_NETWORK, STATUT.BLOCKED_CREDENTIAL].find((s) => statuts.includes(s)) ?? STATUT.GO;
      return resultat(pire, pire === STATUT.GO ? `Stripe Test conforme (${scope}) ; prix = catalogue` : `Stripe : ${v.statut} (endpoints/portail/prix) · ${p.statut} (montants)`, details);
    },
  },
  {
    id: "redis.check", section: 13, titre: "Redis : connectivité, TLS, noeviction", nature: NATURE.READ, critique: false, requise: false,
    async executer(c) {
      const url = c.q("STUDIO_REDIS_URL") ?? c.envs.worker?.STUDIO_REDIS_URL;
      if (!estDefinie(url)) {
        if (c.cible?.redis?.required) throw new Identifiant("STUDIO_REDIS_URL absente alors que redis.required = true");
        throw new Saut("pas d'URL Redis : worker Studio hors périmètre V5");
      }
      if (c.etape("preflight.redis")?.statut !== STATUT.GO) return resultat(STATUT.NO_GO, "Redis non confirmé Preview (preflight.redis) : aucun appel");
      const args = c.ecrituresAutorisees ? ["--roundtrip"] : [];
      return depuisScript(c, scriptDistant(c, "scripts/preview/redis-check.mjs", args, { STUDIO_REDIS_URL: url }), "Redis : PONG, TLS, maxmemory-policy = noeviction", "Redis : NO-GO");
    },
  },
  {
    id: "http.smoke", section: 14, titre: "Smokes HTTP des domaines Preview", nature: NATURE.READ, critique: false, requise: true,
    async executer(c) {
      exigerCible(c);
      const args = [];
      let perso = false;
      for (const app of APPS_WEB) {
        const o = c.cible.vercel.projects[app].preview_origin;
        if (estHoteProduction(new URL(o).hostname, c.cible.vercel.allowed_custom_preview_domains ?? [])) return resultat(STATUT.NO_GO, `origine ${app} = domaine de Production : aucun appel`);
        args.push(`--${app}`, o);
        if (!new URL(o).hostname.endsWith(".vercel.app")) perso = true;
      }
      if (perso) args.push("--allow-custom-domain");
      if (c.options.toolsBilling) args.push("--tools-billing");
      const env = estDefinie(c.q("VERCEL_AUTOMATION_BYPASS_SECRET")) ? { VERCEL_AUTOMATION_BYPASS_SECRET: c.q("VERCEL_AUTOMATION_BYPASS_SECRET") } : {};
      return depuisScript(c, scriptDistant(c, "scripts/preview/http-smoke.mjs", args, env), "GP, Tools, Colors, Réserves : pages publiques 200, pages protégées fermées", "smoke HTTP : NO-GO");
    },
  },
];
