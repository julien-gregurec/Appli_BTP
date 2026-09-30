# Runbook — Attaque abusive (SEV2)

(Bourrage d'identifiants, inscriptions en masse, scraping, abus d'uploads / d'invitations / de
liens, déni de service applicatif.)

## 1. Détection
- `journal_abus_securite` (refus de la limitation anti-abus, en base) ; pics 429 ; CPU/connexions
  Supabase ; factures Brevo/OpenAI anormales ; santé `DEGRADED`/`OUTAGE`.
  ```sql
  select cle, count(*) from public.journal_abus_securite where detecte_at > now() - interval '1 hour' group by 1 order by 2 desc;
  ```

## 2. Confinement (du plus ciblé au plus large)
1. Fonction visée : `uploads`, `invitations`, `liens_publics`, `exports`, `paiements` (portée ciblée).
2. Application visée : `app_coupee` sur cette application seule.
3. Réseau : Vercel Firewall / Attack Challenge Mode, règles IP ; Supabase : restrictions réseau,
   désactivation temporaire des inscriptions (Auth → Providers).
4. Compte abusif : bannir + révoquer ses sessions (`SECURITE_INCIDENT.md` §1).
- La limitation anti-abus est en base : elle reste active en lecture seule (tables exemptées) et
  **fail-closed** (503 « protection anti-abus indisponible ») si la base ne répond plus.

## 3. Diagnostic
- IP / comptes / entreprises sources ; route ; objectif (données ? coût ? disponibilité ?).
- Données extraites ? → `CROSS_TENANT.md`. Secret utilisé ? → `FUITE_SECRET.md`.

## 4. Restauration
- Ajuster les politiques de `src/lib/security/rate-limit.ts` (déploiement) si un seuil manque.
- Nettoyer les objets créés par l'abus (uploads, invitations : `SECURITE_INCIDENT.md` §3).

## 5. Validation
- `journal_abus_securite` revenu au bruit de fond ; santé `OPERATIONAL`.

## 6. Réouverture
- Lever les contrôles du plus large au plus ciblé, en surveillant 30 min entre chaque étape.
