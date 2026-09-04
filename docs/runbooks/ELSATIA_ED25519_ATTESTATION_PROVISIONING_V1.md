# ELSATIA — Provisioning de l'attestation d'état Stripe (Ed25519)

Version 1 — 2026-09-04. Lot `ELSATIA-ED25519-PRODUCTION-PREPARATION-V1`. **Documentation
opérateur.** Aucun déploiement, aucune migration Production, aucune mutation Stripe Live,
aucune clé privée affichée dans ce document ou ailleurs.

Contexte : `elsatia-production` (Vercel) n'a ni `STRIPE_STATE_ATTESTATION_KEY_ID` ni
`STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64`. Ce document prépare tout ce qui peut l'être hors
Production pour que le provisioning réel, au bon moment du cutover, soit une simple exécution de
commandes déjà écrites — voir `ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` pour le
runbook de cutover complet.

---

## 1. Ce que le code et les migrations exigent (audité)

Sources : [src/lib/stripe-state-attestation.ts](../../src/lib/stripe-state-attestation.ts),
[supabase/migrations/20260828000244_stripe_state_attestation_r72.sql](../../supabase/migrations/20260828000244_stripe_state_attestation_r72.sql),
[supabase/migrations/20260828000245_stripe_discount_observation_r73.sql](../../supabase/migrations/20260828000245_stripe_discount_observation_r73.sql),
[supabase/tests/platform_stripe_state_attestation_r72.test.sql](../../supabase/tests/platform_stripe_state_attestation_r72.test.sql).

| Question | Réponse auditée |
|---|---|
| Algorithme | **Ed25519** exclusivement (`key.asymmetricKeyType !== "ed25519"` rejeté côté app ; `pgsodium.crypto_sign_verify_detached` côté DB — même primitive, RFC 8032) |
| Format `STRIPE_STATE_ATTESTATION_KEY_ID` | Chaîne, **non secrète**, regex stricte `^[a-z0-9_.:-]{1,64}$` (identique app et DB) |
| Format `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` | Clé privée **PKCS8 DER, encodée base64** (`createPrivateKey({format:"der", type:"pkcs8"})`) — pas PEM, pas JWK |
| Signature produite | `sign(null, message, key)` → **64 octets bruts**, encodés base64 pour le transport (`signature bytea check(octet_length(signature)=64)` côté DB) |
| Format clé publique dans le registry | `stripe_attestation.public_keys.public_key` est un `bytea` **de 32 octets exactement** (`check (octet_length(public_key)=32)`) — la clé publique **brute** (point Ed25519), **pas** de wrapper SPKI/PEM en base |
| Registry — table | `stripe_attestation.public_keys` (`key_id` PK, `environment` `'test'|'live'`, `public_key bytea(32)`, `active_from`, `active_until`, `revoked_at`) |
| Registry — configuration jumelle | `stripe_attestation.configuration` : ligne singleton `(singleton=true, environment)` — **source de vérité** de l'environnement attesté, comparée à `p_attestation->>'environment'` à chaque finalisation |
| Migration créatrice | **`20260828000244_stripe_state_attestation_r72.sql`** crée le schéma `stripe_attestation` et les deux tables. `20260828000245_stripe_discount_observation_r73.sql` fait évoluer `canonical_payload`/le finaliseur vers le format **v2** (20 champs, dont `discount_presence`/`discount_count`/`discount_source_type`/`discount_source_id`) — c'est ce format v2 qui sera réellement en vigueur après cutover, et qui correspond exactement à `PayloadAttestationStripe`/`canonicaliserAttestationStripe()` côté app. |
| Registry pré-provisionné ou après cutover ? | **Après.** Les deux tables sont créées **vides** par 244 — aucune migration n'insère de ligne (seul le fixture de test pgTAP le fait, en base de test). Le schéma est explicitement conçu *fail-closed* : « la migration reste fail-closed tant qu'un environnement et une clé publique n'ont pas été installés » (commentaire de tête de 244). **Le provisioning des deux tables est une opération DBA distincte, à exécuter après que le ledger Production a atteint ≥245**, jamais avant. |
| Surface API | `stripe_attestation.*` est **hors des schémas exposés PostgREST** (`db.schemas`) et tous les GRANT à `anon`/`authenticated`/`service_role` sont révoqués sur le schéma et ses tables — seul un rôle applicatif dédié (`elsatia_discount_f4_writer`) a un accès **restreint** (`SELECT` sur les 3 tables, `INSERT` sur `consumed_attestations` uniquement — **pas** sur `public_keys`/`configuration`). Le provisioning du registry ne peut donc se faire que par une connexion privilégiée directe (rôle `postgres`/DBA), jamais via l'API applicative. |

---

## 2. Couple Ed25519 généré localement pour ce lot

Généré avec `node:crypto` (`generateKeyPairSync("ed25519")`), **aucun appel réseau, aucune
donnée Production touchée**. Auto-vérifié avant remise (signature 64 octets, `SELF_VERIFY=PASS`,
`PUBLIC_KEY_MATCHES_PRIVATE=PASS` — la clé publique ci-dessous correspond bien à la clé privée
du fichier local, sans jamais afficher cette dernière).

- **KEY_ID proposé** (non secret) : `elsatia-prod-test-2026-09-04`
- **Clé publique brute, 32 octets, hex** (non secrète, à enregistrer dans le registry) :
  `a753da29398a3feb5b748a52cd74c8cd1e2a5785d2928253563b399840d91257`

  *(64 caractères hex = 32 octets, vérifié.)*
- **Clé privée** : générée une seule fois, jamais affichée. D'abord écrite dans un fichier
  temporaire `600` sous `/private/tmp/...` (session Claude), puis **déplacée le 2026-09-04** vers
  le volume chiffré FileVault/APFS déjà utilisé pour les sauvegardes DR (lot
  `ELSATIA-ED25519-PREPARATION-CLOSURE-V1`) :
  `/Volumes/ELSATIA-PRODUCTION-DR/secrets-cutover/ed25519/production_test_private_key_b64.txt`
  — dossier `700`, fichier `600`, propriétaire uniquement. Copie vérifiée par SHA-256 identique
  avant suppression de l'original ; original confirmé absent de `/private/tmp/...`. Ce fichier
  n'est **pas** dans le dépôt Git (hors de `/Users/juliengregurec/Projects/elsatia-main`),
  n'apparaît dans aucun commit, aucun log, aucune sortie de commande de ce lot.
- **Environnement attesté** : `test` — cohérent avec la posture actuelle de `elsatia-production`
  (Stripe reste TEST après cutover, `STRIPE_WEBHOOK_EXPECTED_MODE=test`,
  `ABONNEMENTS_PUBLICS_OUVERTS=false`). Un couple **`live`** distinct sera nécessaire au passage
  Stripe Live (lot P15, hors périmètre ici).

**À supprimer par l'opérateur une fois le provisioning Vercel + DB terminé** (commande donnée en
§3, étape finale). Tant que ce n'est pas fait, le fichier ne doit pas être copié ailleurs.

---

## 3. Procédure manuelle opérateur (à exécuter par Julien, au bon moment du cutover)

### 3.1 Ajouter les variables Vercel Production

Ne jamais coller la valeur de la clé privée dans un terminal partagé/enregistré ; la commande
ci-dessous la lit directement depuis le fichier, sans jamais l'afficher à l'écran :

```bash
# Depuis n'importe quel dossier, avec le CLI Vercel authentifié sur le compte julien-gregurec.
# --project cible explicitement elsatia-production, sans dépendre d'un dossier lié.

# 1. KEY_ID — non secret
vercel env add STRIPE_STATE_ATTESTATION_KEY_ID production --project elsatia-production --value "elsatia-prod-test-2026-09-04" --yes

# 2. Clé privée — lue depuis le fichier local, jamais affichée, stockée comme Secret
vercel env add STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64 production --project elsatia-production --sensitive \
  < "/Volumes/ELSATIA-PRODUCTION-DR/secrets-cutover/ed25519/production_test_private_key_b64.txt"
```

La seconde commande crée par défaut une variable **sensible** (non relisible depuis le dashboard
après création) — c'est le comportement souhaité pour une clé privée.

### 3.2 Enregistrer la clé publique dans le registry DB — **au bon moment seulement**

**Condition stricte avant d'exécuter ceci** : le ledger `supabase_migrations.schema_migrations`
de `elsatia-production` doit déjà contenir `20260828000244_stripe_state_attestation_r72` **et**
`20260828000245_stripe_discount_observation_r73` (donc être postérieur à l'application des
migrations du cutover — étape T0 du runbook de cutover, avant les contrôles fonctionnels
Stripe TEST de T+45). **Ne jamais exécuter ceci avant.**

```sql
-- Connexion privilégiée directe (rôle postgres/DBA), PAS via l'API PostgREST/service_role
-- applicatif : ce schéma est volontairement hors de la surface RPC.

insert into stripe_attestation.configuration (singleton, environment)
values (true, 'test');

insert into stripe_attestation.public_keys (key_id, environment, public_key, active_from)
values (
  'elsatia-prod-test-2026-09-04',
  'test',
  decode('a753da29398a3feb5b748a52cd74c8cd1e2a5785d2928253563b399840d91257', 'hex'),
  now()
);
```

### 3.3 Vérifier la correspondance KEY_ID ↔ clé publique (sans exposer la clé privée)

Après les deux insertions, sur la même connexion privilégiée :

```sql
select key_id, environment, encode(public_key,'hex') as public_key_hex, active_from, revoked_at
from stripe_attestation.public_keys
where key_id = 'elsatia-prod-test-2026-09-04';
```

Le `public_key_hex` retourné doit être **exactement**
`a753da29398a3feb5b748a52cd74c8cd1e2a5785d2928253563b399840d91257`. Puis, côté application (sans
toucher à des données réelles), un test ciblé équivalent à
`supabase/tests/platform_stripe_state_attestation_r72.test.sql` peut être rejoué contre
Production **en lecture/écriture strictement transactionnelle et annulée** si l'opérateur veut
une preuve signature↔vérification bout-en-bout avant la première vraie remise attestée — non
requis pour le provisioning lui-même, la vérification SQL ci-dessus suffit à confirmer la
correspondance.

### 3.4 Nettoyage

```bash
shred -u "/Volumes/ELSATIA-PRODUCTION-DR/secrets-cutover/ed25519/production_test_private_key_b64.txt" 2>/dev/null \
  || rm -f "/Volumes/ELSATIA-PRODUCTION-DR/secrets-cutover/ed25519/production_test_private_key_b64.txt"
```

À exécuter **après** confirmation que la variable Vercel a bien été créée (`vercel env ls
production` doit lister `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` en `sensitive`). Le
répertoire du scratchpad de cette session est de toute façon privé et temporaire, mais la
suppression explicite ferme la boucle proprement.

---

## 4. Placement dans le runbook de cutover

À insérer dans `ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md`, **entre T0 (migrations, §18)
et les contrôles Stripe TEST (§23, T+45)** : dès que le ledger confirme `…244` et `…245`
présentes, exécuter §3.1–3.3 ci-dessus avant tout parcours qui exercerait une remise Stripe
attestée. Le critère GO-T0 existant (« Registry Ed25519 prête ») se vérifie ainsi : **présente
et cohérente** seulement après cette séquence — avant, son absence est normale et ne doit pas
être traitée comme un défaut.

---

## 5. Ce qui reste hors de ce lot

- Aucune écriture en Supabase Production n'a été faite ici (§3.2/§3.3 sont préparées, non
  exécutées — conforme à l'instruction « ne rien écrire tant que le runbook ne l'autorise pas »).
- Aucune variable Vercel Production n'a été ajoutée ici (§3.1 préparée, non exécutée — ajout de
  configuration Production laissé à l'opérateur).
- Couple **Live** : à générer séparément au lot P15 (Stripe Live), avec son propre `KEY_ID` et
  sa propre ligne `environment='live'` dans le registry — ne jamais réutiliser le couple `test`
  ci-dessus pour Live.

---

## 6. Verdict

Format, algorithme, migration créatrice, mode de provisioning et timing sont tous confirmés et
documentés. Un couple Ed25519 valide et auto-vérifié est prêt (clé privée jamais affichée, fichier
temporaire local à supprimer après usage). Les commandes Vercel et SQL sont écrites et prêtes à
l'exécution, conditionnées au bon moment du cutover (`…244`/`…245` appliquées).

```text
ELSATIA-ED25519-PRODUCTION-PREPARATION-V1 VALIDÉ — COUPLE ED25519 PRÊT À PROVISIONNER AU CUTOVER
```
