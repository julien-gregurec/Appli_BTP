import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

const url = process.env.LIRIA_LOCAL_URL;
const anonKey = process.env.LIRIA_LOCAL_ANON_KEY;
const serviceRoleKey = process.env.LIRIA_LOCAL_SERVICE_ROLE_KEY;
const jwtSecret = process.env.LIRIA_LOCAL_JWT_SECRET;

if (!url || !anonKey || !serviceRoleKey || !jwtSecret) {
  throw new Error(
    "Variables requises: LIRIA_LOCAL_URL, LIRIA_LOCAL_ANON_KEY, LIRIA_LOCAL_SERVICE_ROLE_KEY, LIRIA_LOCAL_JWT_SECRET",
  );
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  throw new Error("Ce test destructif est strictement réservé à Supabase local.");
}

const companyA = "a0000000-0000-0000-0000-000000000001";
const companyB = "b0000000-0000-0000-0000-000000000001";
const userA = "10000000-0000-0000-0000-000000000001";
const employeeA = "a2000000-0000-0000-0000-000000000001";
const employeeB = "b2000000-0000-0000-0000-000000000001";
const conversationA = "af000000-0000-0000-0000-000000000001";
const conversationB = "bf000000-0000-0000-0000-000000000001";
const chantierA = "a4000000-0000-0000-0000-000000000001";
const chantierB = "b4000000-0000-0000-0000-000000000001";
function localJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  const signature = createHmac("sha256", jwtSecret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}
const userAToken = localJwt({
  aud: "authenticated",
  role: "authenticated",
  sub: userA,
  email: "admin-a@invalid.local",
  iss: "supabase-demo",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const clientA = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${userAToken}` } },
});

const assertions = [];
function check(condition, message) {
  assertions.push({ ok: Boolean(condition), message });
  if (!condition) throw new Error(message);
}

check(Boolean(userAToken), "Jeton local admin A généré");

const { data: buckets, error: bucketsError } = await admin.storage.listBuckets();
check(!bucketsError, `Lecture des buckets: ${bucketsError?.message ?? "OK"}`);
const privateBuckets = (buckets ?? []).filter((bucket) => !bucket.public);
check(privateBuckets.length > 0, "Au moins un bucket privé doit exister");

const created = [];
for (const bucket of privateBuckets) {
  const configuredMime = bucket.allowed_mime_types?.[0] ?? "application/octet-stream";
  const mime = configuredMime.endsWith("/*")
    ? `${configuredMime.slice(0, -1)}${configuredMime.startsWith("image/") ? "png" : configuredMime.startsWith("video/") ? "mp4" : "octet-stream"}`
    : configuredMime;
  const pathsByBucket = {
    "chantier-documents": [
      `${companyA}/${chantierA}/plan.pdf`,
      `${companyB}/${chantierB}/plan.pdf`,
    ],
    "messagerie-medias": [
      `${companyA}/${conversationA}/test-a.jpg`,
      `${companyB}/${conversationB}/test-b.jpg`,
    ],
    "notes-frais": [
      `${companyA}/${employeeA}/phase1-a.pdf`,
      `${companyB}/${employeeB}/phase1-b.pdf`,
    ],
    "notes-frais-exports": [
      `companies/${companyA}/exports/phase1-a.zip`,
      `companies/${companyB}/exports/phase1-b.zip`,
    ],
  };
  const [ownPath, foreignPath] = pathsByBucket[bucket.id] ?? [
    `${companyA}/phase1/${bucket.id}-a.bin`,
    `${companyB}/phase1/${bucket.id}-b.bin`,
  ];
  for (const [path, marker] of [
    [ownPath, "A"],
    [foreignPath, "B"],
  ]) {
    const { error } = await admin.storage
      .from(bucket.id)
      .upload(path, new Blob([`phase1-${marker}`], { type: mime }), {
        upsert: true,
        contentType: mime,
      });
    check(!error, `Préparation service-role ${bucket.id}/${marker}: ${error?.message ?? "OK"}`);
    created.push([bucket.id, path]);
  }

  const ownSigned = await clientA.storage.from(bucket.id).createSignedUrl(ownPath, 60);
  check(
    !ownSigned.error && Boolean(ownSigned.data?.signedUrl),
    `${bucket.id}: URL A autorisée (${ownSigned.error?.message ?? "OK"})`,
  );

  const foreignSigned = await clientA.storage.from(bucket.id).createSignedUrl(foreignPath, 60);
  check(Boolean(foreignSigned.error), `${bucket.id}: URL B refusée`);

  const foreignList = await clientA.storage.from(bucket.id).list(`${companyB}/phase1`);
  check(Boolean(foreignList.error) || (foreignList.data?.length ?? 0) === 0, `${bucket.id}: liste B vide`);

  const foreignReplace = await clientA.storage
    .from(bucket.id)
    .update(foreignPath, new Blob(["attaque"], { type: mime }), {
      contentType: mime,
    });
  check(Boolean(foreignReplace.error), `${bucket.id}: remplacement B refusé`);

  const foreignDelete = await clientA.storage.from(bucket.id).remove([foreignPath]);
  const foreignAfterDelete = await admin.storage.from(bucket.id).createSignedUrl(foreignPath, 60);
  check(
    Boolean(foreignDelete.error) || (!foreignAfterDelete.error && Boolean(foreignAfterDelete.data?.signedUrl)),
    `${bucket.id}: suppression B refusée ou sans effet`,
  );
}

const expiryBucket = privateBuckets[0];
const expiryPath =
  expiryBucket.id === "bulletins-paie"
    ? `${companyA}/phase1/${expiryBucket.id}-a.bin`
    : created.find(([bucket]) => bucket === expiryBucket.id)?.[1];
// Une durée d'une seconde rendait le contrôle non déterministe selon la seconde
// d'émission du JWT et la latence locale de Kong. Cinq secondes vérifient la
// même propriété d'expiration sans faux négatif lié au changement de seconde.
const shortUrl = await clientA.storage.from(expiryBucket.id).createSignedUrl(expiryPath, 5);
check(!shortUrl.error && Boolean(shortUrl.data?.signedUrl), "URL courte créée");
const copiedBefore = await fetch(shortUrl.data.signedUrl);
check(copiedBefore.ok, "URL copiée utilisable sans session avant expiration");
await new Promise((resolve) => setTimeout(resolve, 6500));
const copiedAfter = await fetch(shortUrl.data.signedUrl);
check(!copiedAfter.ok, "URL copiée refusée après expiration");

const longUrl = await clientA.storage.from(expiryBucket.id).createSignedUrl(expiryPath, 60);
check(!longUrl.error && Boolean(longUrl.data?.signedUrl), "URL créée avant retrait");
const { error: suspendError } = await clientA.rpc("changer_statut_compte_application", {
  p_entreprise_id: companyA,
  p_employe_id: employeeA,
  p_statut: "pause",
});
check(!suspendError, `Adhésion A suspendue localement (${suspendError?.message ?? "OK"})`);
const afterRemoval = await clientA.storage.from(expiryBucket.id).createSignedUrl(expiryPath, 60);
check(Boolean(afterRemoval.error), "Nouvelle URL refusée après retrait de l’entreprise");
const preexistingAfterRemoval = await fetch(longUrl.data.signedUrl);
check(preexistingAfterRemoval.ok, "URL déjà signée reste un jeton porteur jusqu’à son expiration");

for (const [bucket, path] of created) {
  await admin.storage.from(bucket).remove([path]);
}

console.log(
  JSON.stringify(
    {
      result: "PASS",
      privateBuckets: privateBuckets.map((bucket) => bucket.id),
      assertions: assertions.length,
      signedUrlSemantics:
        "Une URL signée est un jeton porteur: la session n’est plus consultée après émission; limiter le TTL.",
      localFixtureState:
        "Le compte A reste volontairement en pause; exécuter npm run db:reset après ce test local destructif.",
    },
    null,
    2,
  ),
);
