# Runbook — E-mail indisponible (SEV3)

Preuve locale : drill S10 (Brevo simulé en panne, vrai `envoyerEmailBrevo`).

## 1. Détection
- Sonde profonde `/api/health` (Bearer `CRON_SECRET`) → `email = "ko"`, statut `DEGRADED`.
  La sonde publique vérifie seulement la cohérence de configuration (`BREVO_API_KEY`, expéditeur).
- Journaux : `Envoi email impossible (Brevo a répondu <code>)` — l'envoi **échoue explicitement**,
  jamais en silence (le corps de la réponse Brevo n'est jamais journalisé : il peut contenir l'adresse).
- status.brevo.com.

## 2. Confinement
- Rien à couper : l'application fonctionne sans e-mail. Si des flux dépendent d'un e-mail
  (invitation, lien de partage envoyé, mot de passe oublié) et génèrent des relances en boucle :
  **`invitations`** sur la portée concernée.
- Statut public `email` → `DEGRADED` (« les notifications e-mail sont retardées »).

## 3. Diagnostic
- Clé révoquée / quota Brevo / domaine expéditeur non vérifié / IP bloquée.
- Si la clé a fuité : `FUITE_SECRET.md`.

## 4. Restauration
- Corriger la cause (clé, quota). Rotation de `BREVO_API_KEY` : Vercel (GP, Réserves) puis redéploiement.

## 5. Validation
- Sonde profonde `email = "ok"`. Envoi test vers une adresse interne.
- **E-mails perdus pendant la panne** : il n'existe pas de file d'envoi rejouable pour tous les flux.
  Recenser les échecs dans les journaux (horodatage, type d'envoi) ; Réserves conserve ses envois
  (`reserves_notifications_envois`) ; relancer manuellement les envois critiques (invitations :
  « renvoyer » depuis l'écran ; documents : renvoi depuis la fiche).

## 6. Réouverture
- Lever `invitations` si posé. Statut `email` → `OPERATIONAL`.
