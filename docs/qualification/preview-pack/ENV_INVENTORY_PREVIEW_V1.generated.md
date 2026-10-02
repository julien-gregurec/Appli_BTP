# ELSATIA — Inventaire des variables Preview (généré)

> Généré par `npm run preview:env-inventory` depuis `config/env-manifest.json` — ne pas éditer à la main.
> Aucune valeur. Classes : REQUIRED / CONDITIONAL / OPTIONAL (cible `preview`). Voir
> `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md` §2.

| App | Total | Required | Conditional | Optional | Preview-only | Public | Secret | Build-time |
|---|---|---|---|---|---|---|---|---|
| gestion_pro | 135 | 21 | 88 | 26 | 1 | 11 | 20 | 12 |
| colors | 6 | 6 | 0 | 0 | 0 | 4 | 1 | 5 |
| tools | 9 | 2 | 3 | 4 | 0 | 8 | 0 | 9 |
| reserves | 11 | 5 | 3 | 3 | 1 | 4 | 2 | 5 |
| studio | 27 | 7 | 8 | 12 | 0 | 3 | 4 | 4 |
| studio_worker | 15 | 3 | 1 | 11 | 0 | 1 | 2 | 1 |

### gestion_pro — ELSATIA Gestion Pro (inclut Boutique, DOE, API de facturation Tools)

| Variable | Classe | Public | Secret | Build | Preview-only | Valeur imposée preview | Valeurs admises | Interdite preview | Condition |
|---|---|---|---|---|---|---|---|---|---|
| `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE` | REQUIRED |  |  |  |  | `false` |  |  |  |
| `ABONNEMENTS_PUBLICS_OUVERTS` | REQUIRED |  |  |  |  | `false` |  |  |  |
| `BANK_DATA_ENCRYPTION_KEY` | REQUIRED |  | oui |  |  |  |  |  |  |
| `ELSATIA_APPLICATION_ENV` | REQUIRED |  |  | oui |  | `preview` | local, test, preview, production |  |  |
| `FEATURE_AI_DEVIS_ENABLED` | REQUIRED |  |  |  |  | `false` |  |  |  |
| `FEATURE_AI_ENABLED` | REQUIRED |  |  |  |  | `false` |  |  |  |
| `FEATURE_BOUTIQUE_ENABLED` | REQUIRED |  |  |  |  | `false` |  |  |  |
| `FEATURE_CRONS_ENABLED` | REQUIRED |  |  |  |  | `false` |  |  |  |
| `FEATURE_RELANCES_AUTO_ENABLED` | REQUIRED |  |  |  |  | `false` |  |  |  |
| `LEGAL_TVA_REGIME_CONFIRME` | REQUIRED |  |  |  |  | `false` |  |  |  |
| `NEXT_PUBLIC_APP_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_COLORS_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_SUPABASE_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `RATE_LIMIT_HMAC_KEY` | REQUIRED |  | oui |  |  |  |  |  |  |
| `STRIPE_AUTOMATIC_TAX_ENABLED` | REQUIRED |  |  |  |  | `false` |  |  |  |
| `STRIPE_SECRET_KEY` | REQUIRED |  | oui |  |  |  |  |  |  |
| `STRIPE_WEBHOOK_ABONNEMENT_SECRET` | REQUIRED |  | oui |  |  |  |  |  |  |
| `STRIPE_WEBHOOK_EXPECTED_MODE` | REQUIRED |  |  |  |  | `test` | test, live |  |  |
| `SUPABASE_SERVICE_ROLE_KEY` | REQUIRED |  | oui |  |  |  |  |  |  |
| `TOOLS_STORE_ENVIRONMENT` | REQUIRED |  |  |  |  |  |  |  |  |
| `APPLE_ROOT_CA_BASE64` | CONDITIONAL |  |  |  |  |  |  |  | dès que les achats iOS Tools sont ouverts |
| `BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID` | CONDITIONAL |  |  |  |  |  |  |  | obligatoire dès que le trousseau contient plusieurs clés |
| `BANK_DATA_ENCRYPTION_KEYS` | CONDITIONAL |  | oui |  |  |  |  |  | dès la première rotation de clé bancaire (k2 et suivantes) |
| `BANK_DATA_ENCRYPTION_WRITE_FORMAT` | CONDITIONAL |  |  |  |  |  | v1, v2 |  | uniquement pour un retour arrière du code vers une version antérieure à la V1 |
| `BANK_OAUTH_STATE_HMAC_KEY` | CONDITIONAL |  | oui |  |  |  |  |  | dès que les paiements bancaires sont activés (recommandé ; sinon repli historique) |
| `BREVO_API_KEY` | CONDITIONAL |  | oui |  |  |  |  |  | dès que l'envoi d'e-mails est activé |
| `ELSATIA_IDENTITY_ISSUER` | CONDITIONAL |  |  |  |  |  |  |  | dès que Studio est déployé (GP émetteur et Studio vérificateur) |
| `ELSATIA_IDENTITY_SIGNING_KEYS` | CONDITIONAL |  | oui |  |  |  |  |  | dès que Studio est déployé |
| `ELSATIA_STUDIO_EXCHANGE_URL` | CONDITIONAL |  |  |  |  |  |  |  | dès que Studio est déployé |
| `ELSATIA_STUDIO_LIFECYCLE_URL` | CONDITIONAL |  |  |  |  |  |  |  | dès que Studio est déployé |
| `EMAIL_FROM_ADDRESS` | CONDITIONAL |  |  |  |  |  |  |  | dès que l'envoi d'e-mails est activé |
| `EMAIL_PREVIEW_ALLOWLIST` | CONDITIONAL |  |  |  | oui |  |  |  | pour recevoir un e-mail applicatif en Preview ou en local |
| `GOOGLE_PLAY_RTDN_AUDIENCE` | CONDITIONAL |  |  |  |  |  |  |  | dès que les achats Android Tools sont ouverts |
| `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les achats Android Tools sont ouverts |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | CONDITIONAL |  | oui |  |  |  |  |  | dès que les achats Android Tools sont ouverts |
| `NOTIFICATIONS_WEBHOOK_SECRET` | CONDITIONAL |  | oui |  |  |  |  |  | dès que les notifications push sont actives |
| `OPENAI_API_KEY` | CONDITIONAL |  | oui |  |  |  |  |  | dès que FEATURE_AI_ENABLED=true |
| `PAYROLL_IMPORT_SECRET` | CONDITIONAL |  | oui |  |  |  |  |  | dès que l'import de paie est activé |
| `POWENS_API_BASE_URL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les paiements bancaires sont activés |
| `POWENS_CLIENT_ID` | CONDITIONAL |  |  |  |  |  |  |  | dès que les paiements bancaires sont activés |
| `POWENS_CLIENT_SECRET` | CONDITIONAL |  | oui |  |  |  |  |  | dès que les paiements bancaires sont activés |
| `POWENS_WEBVIEW_BASE_URL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les paiements bancaires sont activés |
| `STRIPE_CONNECT_CLIENT_ID` | CONDITIONAL |  |  |  |  |  |  |  | dès que Stripe Connect est activé |
| `STRIPE_PRICE_BASE_GENERATIONS_PRECEDENTES` | CONDITIONAL |  |  |  |  |  |  |  | tant que des abonnements de génération précédente existent |
| `STRIPE_PRICE_BUSINESS_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_BUSINESS_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_BUSINESS_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_BUSINESS_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_ENTREPRISE_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_ENTREPRISE_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_ESSENTIEL_ANNUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_ESSENTIEL_MENSUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_MINI_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_PREMIUM_ANNUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_PREMIUM_MENSUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_PRO_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_PRO_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_ROLE_ADMINISTRATIF_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_ROLE_ADMINISTRATIF_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_ROLE_CHEF_EQUIPE_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_ROLE_CHEF_EQUIPE_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_ROLE_TERRAIN_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_COMPTE_SUP_ROLE_TERRAIN_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_ENTREPRISE_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_ENTREPRISE_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_ESSENTIEL_ANNUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_ESSENTIEL_MENSUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_IA_CREDITS_PACK_PONCTUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_IA_INTENSIVE_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_IA_INTENSIVE_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MINI_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MINI_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MODULE_MATERIEL_VEHICULES_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MODULE_MATERIEL_VEHICULES_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MODULE_NOTES_FRAIS_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MODULE_NOTES_FRAIS_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MODULE_POINTAGE_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MODULE_POINTAGE_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MODULE_RENTABILITE_AVANCEE_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MODULE_RENTABILITE_AVANCEE_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MODULE_STOCK_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_MODULE_STOCK_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_OPTION_IA_100_ANNUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_OPTION_IA_100_MENSUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_OPTION_IA_300_ANNUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_OPTION_IA_300_MENSUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_OPTION_IA_ILLIMITE_ANNUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_OPTION_IA_ILLIMITE_MENSUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_PREMIUM_ANNUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_PREMIUM_MENSUEL` *(dépréciée)* | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_PRO_ANNUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_PRICE_PRO_MENSUEL` | CONDITIONAL |  |  |  |  |  |  |  | dès que les abonnements en ligne sont ouverts (ABONNEMENTS_PUBLICS_OUVERTS=true ou abonnement Stripe existant) |
| `STRIPE_STATE_ATTESTATION_KEY_ID` | CONDITIONAL |  |  |  |  |  |  |  | dès que l'attestation d'état Stripe est active |
| `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` | CONDITIONAL |  | oui |  |  |  |  |  | dès que l'attestation d'état Stripe est active |
| `STRIPE_TOOLS_PRICE_ANNUAL` | CONDITIONAL |  |  |  |  |  |  |  | dès que la facturation Tools est ouverte |
| `STRIPE_TOOLS_PRICE_MONTHLY` | CONDITIONAL |  |  |  |  |  |  |  | dès que la facturation Tools est ouverte |
| `STRIPE_TOOLS_SECRET_KEY` | CONDITIONAL |  | oui |  |  |  |  |  | dès que la facturation Tools est ouverte |
| `STRIPE_TOOLS_WEBHOOK_SECRET` | CONDITIONAL |  | oui |  |  |  |  |  | dès que la facturation Tools est ouverte |
| `STRIPE_WEBHOOK_BOUTIQUE_SECRET` | CONDITIONAL |  | oui |  |  |  |  |  | dès que la Boutique est ouverte (FEATURE_BOUTIQUE_ENABLED=true) |
| `STRIPE_WEBHOOK_SECRET` | CONDITIONAL |  | oui |  |  |  |  |  | dès que Stripe Connect est activé |
| `STUDIO_ACCESS_ALLOWLIST` | CONDITIONAL |  |  |  |  |  |  |  | quand STUDIO_ACCESS_MODE=allowlist |
| `SUPPORT_EMAIL` | CONDITIONAL |  |  |  |  |  |  |  | dès que l'envoi d'e-mails est activé |
| `TOOLS_ALLOWED_ORIGINS` | CONDITIONAL |  |  |  |  |  |  |  | dès que Tools appelle l'API de facturation |
| `TOOLS_APP_URL` | CONDITIONAL |  |  |  |  |  |  |  | dès que la facturation Tools est ouverte |
| `VAPID_PRIVATE_KEY` | CONDITIONAL |  | oui |  |  |  |  |  | dès que les notifications push sont actives |
| `VAPID_PUBLIC_KEY` | CONDITIONAL |  |  |  |  |  |  |  | dès que les notifications push sont actives |
| `VAPID_SUBJECT` | CONDITIONAL |  |  |  |  |  |  |  | dès que les notifications push sont actives |
| `DISABLE_EMAIL_LOGIN` | OPTIONAL |  |  |  |  | `false` |  | **oui** |  |
| `ELSATIA_APP_VERSION` | OPTIONAL | oui |  | oui |  |  |  |  |  |
| `ELSATIA_ASSISTANCE_STRICTE` | OPTIONAL |  |  |  |  |  | true, 1, yes, 0, false |  |  |
| `ELSATIA_BUILD_COMMIT` | OPTIONAL | oui |  | oui |  |  |  |  |  |
| `ELSATIA_BUILD_DATE` | OPTIONAL | oui |  | oui |  |  |  |  |  |
| `ELSATIA_BUILD_ENVIRONMENT` | OPTIONAL | oui |  | oui |  |  |  |  |  |
| `ELSATIA_DEPLOYMENT_DATE` | OPTIONAL | oui |  | oui |  |  |  |  |  |
| `ELSATIA_DEPLOYMENT_URL` | OPTIONAL | oui |  | oui |  |  |  |  |  |
| `ELSATIA_LOCAL_DEMO` | OPTIONAL |  |  |  |  | `false` |  | **oui** |  |
| `EMAIL_FROM_NAME` | OPTIONAL |  |  |  |  |  |  |  |  |
| `IA_PLAFOND_QUOTIDIEN` *(dépréciée)* | OPTIONAL |  |  |  |  |  |  |  |  |
| `NEXT_PUBLIC_SENTRY_DSN` | OPTIONAL | oui |  | oui |  |  |  |  |  |
| `OPENAI_MODEL` | OPTIONAL |  |  |  |  |  |  |  |  |
| `PDF_ATTENTE_MAX_MS` | OPTIONAL |  |  |  |  |  |  |  |  |
| `PDF_CHROMIUM_EXECUTABLE_PATH` | OPTIONAL |  |  |  |  |  |  |  |  |
| `PDF_CONCURRENCE` | OPTIONAL |  |  |  |  |  |  |  |  |
| `PDF_DELAI_FERMETURE_MS` | OPTIONAL |  |  |  |  |  |  |  |  |
| `PDF_DUREE_MAX_MS` | OPTIONAL |  |  |  |  |  |  |  |  |
| `PDF_FILE_MAX` | OPTIONAL |  |  |  |  |  |  |  |  |
| `RGPD_PURGE_DECISION_REF` | OPTIONAL |  |  |  |  |  |  |  |  |
| `RGPD_PURGE_MAX_ENTREPRISES` | OPTIONAL |  |  |  |  |  |  |  |  |
| `RGPD_PURGE_PLANIFICATEUR_MODE` | OPTIONAL |  |  |  |  |  |  |  |  |
| `SENTRY_DSN` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STRIPE_PORTAL_CONFIGURATION_ID` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_ACCESS_MODE` | OPTIONAL |  |  |  |  |  | open, allowlist, closed |  |  |
| `TOOLS_STORE_ALLOW_SANDBOX` | OPTIONAL |  |  |  |  |  |  |  |  |

### colors — ELSATIA Colors

| Variable | Classe | Public | Secret | Build | Preview-only | Valeur imposée preview | Valeurs admises | Interdite preview | Condition |
|---|---|---|---|---|---|---|---|---|---|
| `ELSATIA_APPLICATION_ENV` | REQUIRED |  |  | oui |  | `preview` | local, test, preview, production |  |  |
| `NEXT_PUBLIC_COLORS_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_SUPABASE_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `SUPABASE_SERVICE_ROLE_KEY` | REQUIRED |  | oui |  |  |  |  |  |  |

### tools — ELSATIA Tools

| Variable | Classe | Public | Secret | Build | Preview-only | Valeur imposée preview | Valeurs admises | Interdite preview | Condition |
|---|---|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_SUPABASE_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_TOOLS_BILLING_API_URL` | CONDITIONAL | oui |  | oui |  |  |  |  | dès que l'abonnement Tools est ouvert |
| `NEXT_PUBLIC_TOOLS_COLORS_URL` | CONDITIONAL | oui |  | oui |  |  |  |  | pour afficher les liens inter-applications d'une Preview Tools |
| `NEXT_PUBLIC_TOOLS_GESTION_PRO_URL` | CONDITIONAL | oui |  | oui |  |  |  |  | pour afficher les liens inter-applications d'une Preview Tools |
| `ELSATIA_TOOLS_NATIVE` | OPTIONAL |  |  | oui |  |  | 1 |  |  |
| `NEXT_PUBLIC_TOOLS_ENV` | OPTIONAL | oui |  | oui |  | `preview` | local, preview, production, native-dev, native-production |  |  |
| `NEXT_PUBLIC_TOOLS_RUNTIME` | OPTIONAL | oui |  | oui |  |  | native, web |  |  |
| `NEXT_PUBLIC_TOOLS_URL` | OPTIONAL | oui |  | oui |  |  |  |  |  |

### reserves — ELSATIA Réserves

| Variable | Classe | Public | Secret | Build | Preview-only | Valeur imposée preview | Valeurs admises | Interdite preview | Condition |
|---|---|---|---|---|---|---|---|---|---|
| `ELSATIA_APPLICATION_ENV` | REQUIRED |  |  | oui |  | `preview` | local, test, preview, production |  |  |
| `NEXT_PUBLIC_RESERVES_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_SUPABASE_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `SUPABASE_SERVICE_ROLE_KEY` | REQUIRED |  | oui |  |  |  |  |  |  |
| `BREVO_API_KEY` | CONDITIONAL |  | oui |  |  |  |  |  | dès que l'envoi d'e-mails est activé |
| `EMAIL_FROM_ADDRESS` | CONDITIONAL |  |  |  |  |  |  |  | dès que l'envoi d'e-mails est activé |
| `EMAIL_PREVIEW_ALLOWLIST` | CONDITIONAL |  |  |  | oui |  |  |  | pour recevoir un e-mail applicatif en Preview ou en local |
| `EMAIL_FROM_NAME` | OPTIONAL |  |  |  |  |  |  |  |  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` *(dépréciée)* | OPTIONAL | oui |  | oui |  |  |  |  |  |
| `PDF_CHROMIUM_EXECUTABLE_PATH` | OPTIONAL |  |  |  |  |  |  |  |  |

### studio — ELSATIA Studio

| Variable | Classe | Public | Secret | Build | Preview-only | Valeur imposée preview | Valeurs admises | Interdite preview | Condition |
|---|---|---|---|---|---|---|---|---|---|
| `ELSATIA_APPLICATION_ENV` | REQUIRED |  |  | oui |  | `preview` | local, test, preview, production |  |  |
| `NEXT_PUBLIC_STUDIO_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `NEXT_PUBLIC_SUPABASE_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `STUDIO_LEGAL_PUBLISHED` | REQUIRED |  |  |  |  |  | 0, 1 |  |  |
| `STUDIO_SIGNUP_MODE` | REQUIRED |  |  |  |  |  | open, allowlist, closed |  |  |
| `STUDIO_STORAGE_SERVICE_KEY` | REQUIRED |  | oui |  |  |  |  |  |  |
| `ELSATIA_IDENTITY_HANDOFF_URL` | CONDITIONAL |  |  |  |  |  |  |  | dès que Studio est déployé |
| `ELSATIA_IDENTITY_ISSUER` | CONDITIONAL |  |  |  |  |  |  |  | dès que Studio est déployé (GP émetteur et Studio vérificateur) |
| `ELSATIA_IDENTITY_JWKS` | CONDITIONAL |  |  |  |  |  |  |  | si ELSATIA_IDENTITY_JWKS_URL n'est pas posée |
| `ELSATIA_IDENTITY_JWKS_URL` | CONDITIONAL |  |  |  |  |  |  |  | si ELSATIA_IDENTITY_JWKS n'est pas posée |
| `STUDIO_ANALYSIS_PYTHON` | CONDITIONAL |  |  |  |  |  |  |  | quand STUDIO_AI_ANALYSIS=1 |
| `STUDIO_AUTH_SERVICE_KEY` | CONDITIONAL |  | oui |  |  |  |  |  | dès que Studio est déployé |
| `STUDIO_CRON_SECRET` | CONDITIONAL |  | oui |  |  |  |  |  | dès que Studio est déployé |
| `STUDIO_SIGNUP_ALLOWLIST` | CONDITIONAL |  |  |  |  |  |  |  | quand STUDIO_SIGNUP_MODE=allowlist |
| `STUDIO_ACCEPTANCE` | OPTIONAL |  |  |  |  |  | 0, 1 | **oui** |  |
| `STUDIO_AI_ANALYSIS` | OPTIONAL |  |  |  |  |  | 0, 1 |  |  |
| `STUDIO_ENABLED` | OPTIONAL |  |  |  |  |  | 1, 0, true, false, on, off |  |  |
| `STUDIO_IDENTITY_MAX_SESSION_S` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_IDENTITY_MODE` | OPTIONAL |  |  |  |  |  | elsatia, local |  |  |
| `STUDIO_IDENTITY_REVALIDATE_S` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_LEGAL_TEXT_VERSION` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_MAIL_FROM` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_MAIL_PROVIDER` | OPTIONAL |  |  |  |  |  | mailpit, resend |  |  |
| `STUDIO_RENDER_INTERNAL_PREVIEW` | OPTIONAL |  |  |  |  |  | 0, 1 | **oui** |  |
| `STUDIO_RESEND_API_KEY` | OPTIONAL |  | oui |  |  |  |  |  |  |
| `STUDIO_RUNTIME_TRACE` | OPTIONAL |  |  |  |  |  | 0, 1 | **oui** |  |

### studio_worker — Worker vidéo Studio (hors Vercel)

| Variable | Classe | Public | Secret | Build | Preview-only | Valeur imposée preview | Valeurs admises | Interdite preview | Condition |
|---|---|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | REQUIRED | oui |  | oui |  |  |  |  |  |
| `STUDIO_REDIS_URL` | REQUIRED |  | oui |  |  |  |  |  |  |
| `STUDIO_STORAGE_SERVICE_KEY` | REQUIRED |  | oui |  |  |  |  |  |  |
| `STUDIO_ANALYSIS_PYTHON` | CONDITIONAL |  |  |  |  |  |  |  | quand STUDIO_AI_ANALYSIS=1 |
| `STUDIO_AI_ANALYSIS` | OPTIONAL |  |  |  |  |  | 0, 1 |  |  |
| `STUDIO_AI_TEST_PROVIDER_FAILURE` | OPTIONAL |  |  |  |  |  | 0, 1 | **oui** |  |
| `STUDIO_ANALYSIS_CONCURRENCY` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_ANALYSIS_TIMEOUT_SECONDS` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_ANALYSIS_TMP` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_FFMPEG_PATH` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_FFPROBE_PATH` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_RENDER_DIAGNOSTICS` | OPTIONAL |  |  |  |  |  | 0, 1 | **oui** |  |
| `STUDIO_RENDER_TIMEOUT_SECONDS` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_RENDER_TMP` | OPTIONAL |  |  |  |  |  |  |  |  |
| `STUDIO_TEMPLATE_COMPARISON` | OPTIONAL |  |  |  |  |  | 0, 1 | **oui** |  |
