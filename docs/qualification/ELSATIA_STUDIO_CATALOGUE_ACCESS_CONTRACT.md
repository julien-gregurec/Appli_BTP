# ELSATIA STUDIO × CATALOGUE ELSATIA — contrat d'intégration identité / accès

Exigence Julien (2026-09-20) : avant tout déploiement commercial, Studio doit être raccordé au système d'habilitation ELSATIA (catalogue des applications, `a_acces_application`, habilitation Studio) **sans coupler la base métier Studio à Gestion Pro**. Ce document fixe le contrat ; le raccordement lui-même relève du train plateforme ELSATIA (autre application) et **ne bloque pas** Studio.

## 1. Principe : Studio consomme une décision d'accès, il ne lit jamais la base plateforme

- Studio a son projet Supabase dédié, ses utilisateurs Auth et sa base (voir le runbook dédié). Aucune requête, vue ni FK de Studio vers Gestion Pro.
- La plateforme ELSATIA reste l'autorité sur « ce compte a-t-il droit à Studio, sous quel plan ». Elle **émet** une décision ; Studio la **vérifie** et l'applique.

## 2. Décision d'accès : jeton d'habilitation signé (recommandé)

La plateforme émet, pour une application donnée, un jeton court (5 minutes) signé (JWS, clé asymétrique, JWKS publiée) :

```
iss   : identifiant de la plateforme ELSATIA
aud   : "studio"                                 (une audience par application du catalogue)
sub   : identifiant de compte plateforme (opaque, stable)
email : adresse vérifiée par la plateforme       (sert à rattacher le compte Studio)
app   : "studio"
ent   : { granted: true, plan: "<code plan>", capabilities: ["export_1080","share_links",...], valid_until: <ts> }
iat, exp, jti
```

Règles côté Studio : refus si signature, `iss`, `aud`, `exp` ou `jti` (rejeu) invalides ; **fail-closed** (jeton absent/expiré/indisponible = pas d'accès pour les nouveaux comptes ; les comptes existants gardent l'accès jusqu'à `valid_until` puis passent en lecture seule, jamais en suppression) ; l'adresse e-mail du jeton doit être vérifiée ; rotation de clés par `kid`.

Rattachement : à la première vérification valide, Studio crée ou retrouve son utilisateur Auth (échange de jeton / connexion fédérée propre à Studio) et enregistre `platform_subject` (hash) dans **sa** base. Aucune donnée métier Studio ne remonte à la plateforme (seulement des compteurs d'usage si la plateforme le demande, par un canal séparé).

## 3. Côté plateforme (à préparer dans le train plateforme, pas dans Studio)

1. Entrée **Studio** au catalogue des applications (identifiant, nom, domaine, plans, capacités).
2. Habilitation `studio` rattachée aux comptes/entreprises via le mécanisme existant (`a_acces_application`).
3. Émetteur de jeton d'habilitation (fonction serveur) + JWKS ; journal d'émission sans donnée métier.
4. Retrait/expiration d'habilitation : le jeton suivant est refusé (Studio réagit au prochain contrôle).

## 4. Côté Studio : ce qui est prêt et ce qui reste

| Élément | État |
|---|---|
| Base et Auth dédiés, sans dépendance GP | prêt (`apps/studio/supabase`) |
| Interrupteur d'ouverture d'inscription (`STUDIO_SIGNUP_MODE=open|allowlist|closed`, liste d'adresses/domaines) | prêt : sert d'habilitation provisoire tant que le jeton n'existe pas (ouverture fermée) |
| Interface `EntitlementProvider` (une seule méthode : décision pour un compte) et implémentations `allowlist` / `closed` | prête ; l'implémentation `platform-token` attend l'émetteur plateforme |
| Vérification JWS + rejeu (`jti`) + rattachement `platform_subject` | à faire quand l'émetteur existe (contrat ci-dessus) |
| Capacités de plan (`capabilities`) → plafonds d'admission, filigrane | mécanismes prêts (`studio_render_limits`, `render_watermark`) ; le mapping plan → valeurs attend Q-001 (facturation ELSATIA commune) |

## 5. Ce que ce contrat interdit

FK ou vue croisée Studio ↔ Gestion Pro ; lecture directe du catalogue depuis la base Studio ; clé service plateforme dans Studio ; SSO par cookie de domaine partagé sans lot de tests dédié ; accès par défaut en cas d'indisponibilité de la plateforme.
