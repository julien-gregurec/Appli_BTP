// Contrôle GoTrue/PostgREST réel (pile locale, projet dédié Studio) des surfaces post-H.
// Usage : source $STACK_DIR/env.sh && node packages/elsatia-identity/scripts/studio-post-h-smoke.mjs (pile local-stack.sh démarrée).
import { createHmac, randomUUID } from "node:crypto";
const sec = process.env.STUDIO_GOTRUE_JWT_SECRET, AUTH = process.env.STUDIO_GOTRUE_URL, REST = process.env.STUDIO_REST_URL;
const jwt = (p) => { const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"); const b = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600, ...p })).toString("base64url"); return `${h}.${b}.${createHmac("sha256", sec).update(`${h}.${b}`).digest("base64url")}`; };
const anon = jwt({ role: "anon" }), service = jwt({ role: "service_role" });
const results = []; const check = (name, cond, detail) => { results.push({ name, ok: !!cond, detail }); };
const rest = async (path, key, init = {}) => { const r = await fetch(REST + path, { ...init, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers || {}) } }); let body = null; try { body = await r.json(); } catch {} return { status: r.status, body }; };
// GoTrue : inscription publique fermée sur le projet dédié.
const su = await fetch(AUTH + "/signup", { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email: `posth-${randomUUID()}@example.test`, password: "Xx1!" + randomUUID() }) });
check("GoTrue : POST /signup refusé (inscription Studio publique fermée)", su.status >= 400, su.status);
// Utilisateur Auth créé par l'admin (comme le pont), NON lié : jeton valide mais aucun accès.
const created = await fetch(AUTH + "/admin/users", { method: "POST", headers: { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json" }, body: JSON.stringify({ email: `posth-${randomUUID()}@example.test`, email_confirm: true }) });
const user = await created.json(); check("GoTrue admin : utilisateur créé", created.status === 200 || created.status === 201, created.status);
const userJwt = jwt({ role: "authenticated", sub: user.id, aud: "authenticated" });
const ws = randomUUID();
let r = await rest("/rpc/studio_save_brand_kit", userJwt, { method: "POST", body: JSON.stringify({ p_workspace: ws, p_data: { company_name: "X" }, p_revision: null }) });
check("PostgREST : studio_save_brand_kit refusé à un compte hors pont (42501)", r.status >= 400 && r.body?.code === "42501", `${r.status} ${r.body?.code}`);
r = await rest("/rpc/studio_invite_member", userJwt, { method: "POST", body: JSON.stringify({ p_workspace: ws, p_email: "a@b.test", p_role: "viewer", p_token_hash: "0".repeat(64), p_days: 7 }) });
check("PostgREST : studio_invite_member refusé (42501)", r.body?.code === "42501", `${r.status} ${r.body?.code}`);
for (const t of ["studio_render_shares", "studio_workspace_invitations"]) {
  r = await rest(`/${t}?select=*`, userJwt);
  check(`PostgREST : lecture directe ${t} refusée (hachés jamais exposés)`, r.status >= 400, `${r.status} ${r.body?.code}`);
}
for (const t of ["studio_brand_kits", "studio_render_shares", "studio_workspace_invitations", "studio_usage_events", "studio_render_limits"]) {
  r = await rest(`/${t}`, service, { method: "POST", body: JSON.stringify({}) });
  check(`PostgREST : écriture directe service_role sur ${t} refusée`, r.status >= 400, `${r.status} ${r.body?.code}`);
  r = await rest(`/${t}`, userJwt, { method: "POST", body: JSON.stringify({}) });
  check(`PostgREST : écriture directe authenticated sur ${t} refusée`, r.status >= 400, `${r.status} ${r.body?.code}`);
}
for (const f of ["studio_resolve_render_share", "studio_resolve_invitation"]) {
  r = await rest(`/rpc/${f}`, anon, { method: "POST", body: JSON.stringify({ p_token_hash: "0".repeat(64) }) });
  check(`PostgREST : ${f} refusé à anon`, r.status >= 400, `${r.status} ${r.body?.code}`);
  r = await rest(`/rpc/${f}`, userJwt, { method: "POST", body: JSON.stringify({ p_token_hash: "0".repeat(64) }) });
  check(`PostgREST : ${f} refusé à authenticated`, r.status >= 400, `${r.status} ${r.body?.code}`);
  r = await rest(`/rpc/${f}`, service, { method: "POST", body: JSON.stringify({ p_token_hash: "0".repeat(64) }) });
  check(`PostgREST : ${f} admis pour service_role (jeton inconnu → null)`, r.status === 200 && r.body === null, `${r.status} ${JSON.stringify(r.body)}`);
}
r = await rest("/rpc/studio_pending_invitation_for", service, { method: "POST", body: JSON.stringify({ p_email: "a@b.test" }) });
check("PostgREST : studio_pending_invitation_for absent (porte d'inscription non portée)", r.status === 404, r.status);
r = await rest("/rpc/studio_deletion_prepare", service, { method: "POST", body: JSON.stringify({ p_user: user.id }) });
check("PostgREST : studio_deletion_prepare absent (suppression post-H non portée)", r.status === 404, r.status);
await fetch(AUTH + `/admin/users/${user.id}`, { method: "DELETE", headers: { apikey: service, authorization: `Bearer ${service}` } });
for (const x of results) console.log(`${x.ok ? "ok  " : "FAIL"} ${x.name} [${x.detail}]`);
const bad = results.filter((x) => !x.ok).length; console.log(`${results.length - bad}/${results.length}`); process.exit(bad ? 1 : 0);
