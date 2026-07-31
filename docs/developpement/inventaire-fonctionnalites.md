# Inventaire des fonctionnalités visibles — Liria Gestion Pro

## 1. Date de l'inventaire

31 juillet 2026.

## 2. Commit et branche analysés

- Worktree : `/Users/juliengregurec/Projects/liria-claude`
- Branche : `claude/developpement-parallele`
- Commit de base : `4d92ddbedccf8b2948f8b224739b622298b174c0` (identique à `main` au moment de l'inventaire ; ce worktree n'ajoute que de la documentation par-dessus)
- 178 migrations SQL présentes, la plus récente : `20260729000183_medias_devis.sql`

## 3. Méthode utilisée

Lecture statique uniquement, aucune exécution de l'application :
- Recensement des 125 routes (`find src/app -name page.tsx`)
- Lecture du catalogue de permissions déclaré dans les migrations (`permissions_disponibles`)
- Lecture ciblée des fichiers `page.tsx` et `src/app/actions/*.ts` correspondants (taille en lignes utilisée comme indicateur de profondeur, puis lecture du contenu pour les modules ambigus ou récents)
- Recherche de marqueurs textuels (`TODO`, `bientôt`, `désactivé`, `pas encore`, etc.)
- Croisement avec `.env.local.example` pour les dépendances externes déclarées
- Croisement avec les messages de commit accessibles via `git log` (contexte, pas contenu de code)

## 4. Limites de l'analyse

- **Aucune exécution** : rien n'a été lancé (pas de `npm run dev`, pas de connexion, pas de clic). Une page qui existe et qui semble complète peut malgré tout échouer à l'usage (erreur runtime, variable d'environnement manquante en production, régression récente).
- Pour les modules à fort volume de code (125 pages, 5 900+ lignes d'actions serveur), seule une partie a été lue en détail ; le reste est classé sur la base de la taille du fichier, du nommage des routes et des permissions associées — pas d'une lecture ligne à ligne.
- Aucune vérification en base réelle (aucune requête Supabase exécutée) : les états ci-dessous reposent sur le code, pas sur les données de production.
- Le travail de sécurité (`release/commercialisation-v1`, dossier `docs/audits/`) n'a pas été consulté : ces fichiers n'existent d'ailleurs pas dans cette branche (ils ont été ajoutés uniquement sur `release/commercialisation-v1`).
- Toute case marquée **« impossible à confirmer sans exécution »** doit être vérifiée manuellement avant toute communication commerciale.

## 5–6. Arborescence des modules et routes principales

### Ventes & relation client
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| Ventes | Clients | `/clients`, `/clients/[id]`, `/clients/nouveau` | Visible | Fonctionnelle | `acces_clients` | `src/app/(app)/clients/page.tsx` (136 l.) |
| Ventes | CRM (relances, appels) | `/crm` | Visible | Fonctionnelle | `acces_crm` | `src/app/(app)/crm/page.tsx` |
| Ventes | Appels d'offres | `/appels-offres` | Visible | Visible mais partielle — non lue en détail | `acces_appels_offres` | `src/app/(app)/appels-offres/page.tsx` |
| Ventes | Devis (+ prestations, ouvrages) | `/devis`, `/devis/[id]`, `/devis/nouveau`, `/prestations`, `/ouvrages` | Visible | Fonctionnelle | `acces_devis` | `src/app/(app)/devis/[id]/page.tsx` (226 l.), `src/app/actions/devis.ts` (260 l.) |
| Ventes | Factures | `/factures`, `/factures/[id]` | Visible | Fonctionnelle | `acces_factures` | `src/app/(app)/factures/[id]/page.tsx` (250 l.), `src/app/actions/factures.ts` |
| Ventes | Facturation avancée (situations, acomptes, avoirs, DGD) | `/facturation-avancee` | Visible | Fonctionnelle | `acces_facturation_avancee` | `src/app/(app)/facturation-avancee/page.tsx` |
| Ventes | Impressions PDF devis/factures/DOE/commandes | `/imprimer/*` | Masquée (jamais liée directement, appelée depuis les fiches) | Fonctionnelle | selon module source | `src/app/imprimer/*/[id]/page.tsx` |
| Finance | Trésorerie | `/tresorerie` | Visible | Fonctionnelle | `acces_rentabilite` (pilotage) | `src/app/(app)/tresorerie/page.tsx` |
| Finance | Charges & dépenses | `/charges`, `/depenses`, `/depenses/[id]` | Visible | Fonctionnelle | `acces_achats` | `src/app/(app)/depenses/[id]/page.tsx` |

### Chantiers & terrain
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| Chantiers | Fiche chantier (doc, DOE, comptes-rendus, e-mails, localisation) | `/chantiers`, `/chantiers/[id]`, `/chantiers/[id]/documents`, `/doe`, `/comptes-rendus`, `/emails`, `/localisation` | Visible | Fonctionnelle | `acces_chantiers` | `src/app/(app)/chantiers/[id]/page.tsx` (225 l., non modifié par ce worktree) |
| Chantiers | Suivi de zone GPS pendant le pointage | Intégré à `/pointage` + `/chantiers/[id]/localisation` | Visible, transparent (bandeau explicite) | Fonctionnelle côté code, **jamais testée en conditions réelles par l'utilisateur final** | `valider_pointages` (alerte), `gerer_chantiers` (position) | `src/components/SuiviZoneChantier.tsx`, `supabase/migrations/20260723000137_suivi_zone_chantier.sql` |
| Chantiers | Petit déplacement automatique (frais de route, `distance_siege_km`) | `/chantiers/[id]/localisation`, `/paie/parametres` | Visible | Fonctionnelle (vérifiée sur données de test selon le message du commit `13a4d83`) | `gerer_chantiers`, `gerer_paie` | commit `13a4d83`, `src/app/(app)/chantiers/[id]/localisation/page.tsx` |
| Chantiers | Interventions (contrats, bons de travail) | `/interventions` | Visible | Visible mais partielle — non lue en détail | `acces_interventions` | `src/app/(app)/interventions/page.tsx` |
| Chantiers | Planning | `/planning` | Visible | Fonctionnelle | `acces_planning` | `src/app/(app)/planning/page.tsx` (247 l.) |
| Chantiers | Pointage GPS (+ gestion équipe) | `/pointage`, `/pointage/gestion` | Visible | Fonctionnelle | `acces_pointage`, `gerer_pointage` | `src/app/(app)/pointage/page.tsx`, `pointage/gestion/page.tsx` |
| Chantiers | Mes travaux (vue salarié) | `/mes-travaux` | Visible | Fonctionnelle | permission ouvrier de base | `src/app/(app)/mes-travaux/page.tsx` |
| Chantiers | Messagerie interne / chantier | `/messagerie` | Visible | Fonctionnelle | `acces_messagerie` | `src/app/(app)/messagerie/page.tsx`, `src/app/actions/messagerie.ts` |

### Équipe, RH & paie
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| RH | Employés (fiche, carte BTP) | `/employes`, `/employes/[id]`, `/carte` | Visible | Fonctionnelle | `acces_employes`, `gerer_employes` | `src/app/(app)/employes/page.tsx` (316 l., le plus long fichier de page) |
| RH | Congés | `/conges` | Visible | Fonctionnelle | permission congés | `src/app/(app)/conges/page.tsx` |
| RH | Notes de frais (+ admin, exports, paramètres) | `/notes-frais`, `/notes-frais/[id]`, `/exports`, `/parametres/notes-frais` | Visible | Fonctionnelle | `gerer_notes_frais` | `src/app/actions/notes-frais.ts` (263 l.), `notes-frais-admin.ts` |
| RH / Paie | Paie (bulletins, dossiers, profils employé) | `/paie`, `/paie/[id]`, `/paie/[id]/[dossierId]`, `/paie/profils/[employeId]`, `/paie/parametres` | Visible | **Visible mais partielle** — préparation/calcul des bulletins présents (`src/app/actions/paie.ts`, 200 l.), mais le virement réel des salaires dépend de Powens (non contracté, voir dépendances §9) | `gerer_paie`, `acces_paiements_bancaires` | `supabase/migrations/20260723000141_preparation_paie.sql`, `docs/PAIEMENTS_BANCAIRES_ET_PAIE.md` |
| RH / Paie | Grands déplacements | `/grands-deplacements` | Visible | Fonctionnelle (vérifiée sur données de test selon commit `656e1c8`/`c6b5e10`) | `gerer_paie` | `src/app/actions/grands-deplacements.ts` (100 l.) |
| RH | Banque & paie (vue consolidée) | `/banque-paie`, `/paiements-bancaires` | Visible | **Visible mais partielle** — dépend de Powens (contrat non souscrit) pour l'exécution réelle des virements ; préparation des lots fonctionnelle | `acces_paiements_bancaires`, `preparer_virements`, `valider_virements`, `executer_virements` | `src/app/actions/paiements-bancaires.ts` (308 l.), `.env.local.example` (`POWENS_*` vides) |

### Achats, stock & matériel
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| Achats | Fournisseurs | `/fournisseurs`, `/fournisseurs/[id]` | Visible | Fonctionnelle | `acces_achats` | `src/app/(app)/fournisseurs/page.tsx` |
| Achats | Commandes | `/commandes`, `/commandes/[id]`, `/commandes/nouveau` | Visible | Fonctionnelle | `acces_achats` | `src/app/actions/commandes.ts` (237 l.) |
| Achats | Connecteurs fournisseurs | `/connecteurs` | Visible | Visible mais partielle — dépend d'accords/API officielles par fournisseur (documenté historiquement dans `RELAIS_CHATGPT.md`, non revérifié ici) | `acces_connecteurs` | `src/app/(app)/connecteurs/page.tsx` |
| Stock | Stock, dépôt, borne, réception | `/stock`, `/stock/[id]`, `/stock/borne`, `/stock/reception`, `/depot` | Visible | Fonctionnelle | `acces_stock`, `mode_compte_depot` | `src/app/(app)/stock/page.tsx` |
| Stock | Inventaires | `/inventaires`, `/inventaires/[id]` | Visible | Fonctionnelle | `acces_stock` | `src/app/(app)/inventaires/[id]/page.tsx` (211 l.) |
| Matériel | Outillage | `/outillage`, `/outillage/[id]`, `/outillage/nouveau` | Visible | Fonctionnelle | `acces_outillage` | `src/app/(app)/outillage/page.tsx` |
| Matériel | Flotte automobile | `/flotte`, `/flotte/[id]`, `/flotte/nouveau` | Visible | Fonctionnelle | `acces_flotte` | `src/app/(app)/flotte/page.tsx` |
| Achats | Sous-traitants | `/sous-traitants`, `/sous-traitants/[id]` | Visible | Fonctionnelle | `acces_sous_traitants` | `src/app/actions/sous-traitants.ts` |

### Pilotage
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| Pilotage | Tableau de bord | `/dashboard` | Visible | Fonctionnelle | tous (filtré par permissions) | `src/app/(app)/dashboard/page.tsx` (290 l.) |
| Pilotage | Rentabilité | `/rentabilite` | Visible | Fonctionnelle | `acces_rentabilite` | `src/app/actions/rentabilite.ts` |
| Pilotage | Exports comptables | `/exports` | Visible | Fonctionnelle | `acces_exports` | `src/app/(app)/exports/page.tsx` |

### Boutique Liria (matériel)
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| Boutique | Catalogue, produit, panier, commande | `/boutique`, `/boutique/[produitId]`, `/boutique/panier`, `/boutique/commande/[id]` | Visible | Fonctionnelle — paiement réel via Stripe Checkout (même intégration que l'abonnement) | `acces_boutique` | `src/app/actions/boutique.ts` (169 l.), `src/lib/stripe-boutique.ts` |
| Boutique (admin Liria) | Catalogue côté plateforme | `/plateforme/boutique` | Masquée (réservée aux admins Liria) | Visible mais partielle — non lue en détail | admin plateforme uniquement | `src/app/(app)/plateforme/boutique/page.tsx` |

### Intelligence artificielle
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| IA | Assistant IA (transversal : devis, documents, dictée, messagerie, rentabilité) | intégré dans plusieurs pages, API `/api/assistant/chat` | Visible | Fonctionnelle, dépend de `OPENAI_API_KEY` configurée | `acces_ia` | `src/app/actions/assistant.ts` (181 l.), `src/lib/ai/*` |
| IA | Option IA à paliers (100/300/illimité appels/jour) | `/abonnement` | Visible | **Visible mais partielle** — mécanique complète (essai 15 j, paliers, coupure d'accès) mais **facturation réelle non opérationnelle tant que les 6 prix Stripe ne sont pas créés** (`STRIPE_PRICE_OPTION_IA_*` vides dans `.env.local.example`) | `gerer_parametres` (choix du palier) | `supabase/migrations/20260723000134`, `136_option_ia_*.sql`, `src/lib/stripe-abonnement.ts` |

### Abonnement, SaaS & inscription
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| SaaS | Abonnement (offre, coût, Option IA, module non inclus) | `/abonnement`, `/abonnement/module-non-inclus` | Visible | Fonctionnelle pour la gestion d'offre ; voir limite Option IA ci-dessus | `gerer_parametres` | `src/app/(app)/abonnement/page.tsx` (151 l.) |
| SaaS | Tarifs publics | `/tarifs` | Public | Fonctionnelle | public | `src/app/tarifs/page.tsx` |
| SaaS | Inscription, onboarding, questionnaire besoins | `/signup`, `/onboarding`, `/onboarding/besoins`, `/onboarding/demarrage` | Public / nouvel utilisateur | Fonctionnelle | — | `src/app/signup/page.tsx`, `src/app/onboarding/*` |
| SaaS | Paiement (retours Stripe) | `/paiement/succes`, `/paiement/annule`, `/paiement/abonnement/succes`, `/paiement/abonnement/annule` | Technique (retour de redirection) | Fonctionnelle | — | `src/app/paiement/*` |
| SaaS | Abonnement suspendu (impayé) | `/abonnement-suspendu` | Conditionnelle (uniquement si impayé) | Fonctionnelle | — | référencé dans `RELAIS_CHATGPT.md` (migration 75) |
| Compte | En attente (validation compte) | `/en-attente` | Conditionnelle | Fonctionnelle | — | `src/app/en-attente/page.tsx` |

### Plateforme Liria (back-office interne, réservé à l'éditeur)
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| Plateforme | Liste entreprises, remises/avoirs, Option IA | `/plateforme` | Masquée (admin Liria uniquement) | Fonctionnelle | `est_plateforme_admin()` | `src/app/(app)/plateforme/page.tsx` (279 l.) |
| Plateforme | Support entreprises | `/plateforme/support` | Masquée | Fonctionnelle | admin plateforme | `src/app/(app)/plateforme/support/page.tsx` |
| Plateforme | Facturation SaaS (relevés) | `/plateforme/facturation` | Masquée | Fonctionnelle | admin plateforme | référencé `RELAIS_CHATGPT.md` |
| Plateforme | Rôles de démonstration | `/plateforme/roles-demo` | Masquée | Fonctionnelle (outil de démo interne) | admin plateforme | `src/app/(app)/plateforme/roles-demo/page.tsx` |
| Plateforme | Tarification (configuration des offres) | `/plateforme/tarification` | Masquée | Visible mais partielle — non lue en détail | admin plateforme | `src/app/(app)/plateforme/tarification/page.tsx` |

### Comptes, accès & paramètres
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| Accès | Connexion, mot de passe oublié/nouveau | `/login`, `/mot-de-passe-oublie`, `/nouveau-mot-de-passe` | Public | Fonctionnelle | — | `src/app/login/page.tsx` |
| Paramètres | Paramètres entreprise (identité, horaires, suivi de zone, etc.) | `/parametres` | Visible | Fonctionnelle | `acces_parametres` | `src/app/(app)/parametres/page.tsx` |
| Paramètres | Matrice des droits par poste (+ aperçu) | `/parametres/acces`, `/parametres/acces/apercu/[id]` | Visible | Fonctionnelle | `gerer_utilisateurs` | `src/app/(app)/parametres/acces/page.tsx` (251 l.) |
| Paramètres | Import de données (migration depuis un autre logiciel) | `/parametres/import` | Visible | Fonctionnelle (mapping manuel, pas de préréglage éditeur officiel) | `gerer_utilisateurs` | `src/app/actions/import.ts` (234 l.) |
| Paramètres | Notifications (préférences, activation push) | `/parametres/notifications` | Visible | Fonctionnelle, **testée de bout en bout** | tous | `src/components/PushNotificationsSettings.tsx` |
| Paramètres | Export/suppression des données (RGPD) | `/parametres/donnees` | Visible | Fonctionnelle | `gerer_parametres` | `src/app/(app)/parametres/donnees/page.tsx` |
| Paramètres | Version déployée (support) | `/parametres/version` | Visible | Fonctionnelle (page technique, pas de changelog fonctionnel) | `acces_parametres` | `src/app/(app)/parametres/version/page.tsx` |
| Compte | Mon espace (fiche salarié personnelle) | `/mon-espace` | Visible | Fonctionnelle | tous | `src/app/(app)/mon-espace/page.tsx` |

### Site public & légal
| Domaine | Module | Route | Visibilité | État estimé | Rôles concernés | Source |
|---|---|---|---|---|---|---|
| Marketing | Page d'accueil publique | `/` | Public | Fonctionnelle, contenu structuré et daté (remplace un ancien redirect brut selon commit `74b7b67`) | — | `src/app/page.tsx` |
| Marketing | Aide / support | `/aide` | Visible | Fonctionnelle | tous | `src/app/(app)/aide/page.tsx` |
| Légal | CGU, CGV, confidentialité, cookies, mentions légales | `/cgu`, `/cgv`, `/confidentialite`, `/cookies`, `/mentions-legales` | Public | Visible mais partielle — contenu juridique non audité par un juriste dans le cadre de cet inventaire | — | `src/app/cgu/page.tsx`, etc. |
| PWA | Page hors-ligne | `/offline` | Technique | Fonctionnelle | — | `src/app/offline/page.tsx` |

## 7. Rôles/permissions visibles dans le code

Catalogue extrait des migrations (`insert into permissions_disponibles`) : 24 permissions d'accès de premier niveau (`acces_*`, une par module ci-dessus), plus des permissions d'action plus fines par module (ex. `gerer_chantiers`, `valider_pointages`, `gerer_paie`, `gerer_utilisateurs`, `voir_indicateurs_financiers`, `preparer_virements`/`valider_virements`/`executer_virements` pour la banque). Un rôle `est_plateforme_admin()` distinct et séparé gouverne tout `/plateforme/*`. La liste complète des ~24 clés `acces_*` figure dans les migrations correspondantes (non recopiée intégralement ici pour rester lisible).

## 8. État estimé — synthèse

| État | Modules concernés |
|---|---|
| **Fonctionnelle** | Ventes, chantiers, RH, stock, matériel, pilotage, boutique (paiement), IA transversale, plateforme Liria, comptes/paramètres, marketing |
| **Visible mais partielle** | Paie et Banque/paiements bancaires (bloquées sur le contrat Powens), Option IA (bloquée sur la création des prix Stripe), Appels d'offres, Interventions, Connecteurs, Tarification plateforme, CGU/CGV/mentions légales (contenu non audité juridiquement) |
| **Impossible à confirmer sans exécution** | Toute case ci-dessus marquée « Fonctionnelle » repose sur la lecture du code, pas sur un test réel — voir §4 |

Aucune fonctionnalité n'a été identifiée comme franchement « bêta » au sens d'un marqueur explicite dans le code, ni comme entièrement désactivée.

## 9. Dépendances externes repérées

D'après `.env.local.example` :
- **Supabase** (base de données, auth, storage) — cœur de l'application
- **OpenAI** (`OPENAI_API_KEY`) — assistant IA
- **Stripe** — abonnement SaaS, Option IA, boutique, Stripe Connect (paiement des clients par les entreprises)
- **Powens** — banque/virements/paie réelle — **non souscrit** (`POWENS_CLIENT_ID`/`POWENS_CLIENT_SECRET` vides dans l'exemple)
- **VAPID / Web Push** — notifications push navigateur (configuré et testé selon `RELAIS_CHATGPT.md`)
- **Sentry** — suivi d'erreurs (`docs/SENTRY.md` existe, non relu ici)
- **Vercel Cron** (`CRON_SECRET`) — tâches planifiées (abonnements, notifications, paie)

## 10. Fonctionnalités bêta ou masquées

- Tout `/plateforme/*` : masqué au grand public, réservé aux administrateurs Liria.
- `/plateforme/boutique`, `/plateforme/tarification` : masqués, contenu non détaillé dans cet inventaire.
- Aucun marqueur `beta`/feature-flag explicite trouvé dans le code applicatif lu.

## 11. Fonctionnalités présentes mais non accessibles

- **Option IA — facturation réelle** : le code de bascule essai→facturation existe (`/api/cron/abonnements`) mais échouera silencieusement tant que les 6 prix Stripe ne sont pas créés (voir §9 de la conversation d'origine).
- **Paie / Banque — exécution réelle des virements** : code présent (préparation, validation, RIB chiffrés) mais l'exécution effective dépend d'un contrat Powens non souscrit.

## 12. Éléments obsolètes ou en doublon

- Rien d'obsolète identifié dans le code lu. Un ancien guide utilisateur (mentionné dans `RELAIS_CHATGPT.md`, non retrouvé dans l'arborescence actuelle du dépôt) est structurellement dépassé par l'ampleur des modules ajoutés depuis (paie, déplacements, boutique, Option IA, suivi de zone, page marketing publique) — à confirmer/retrouver avant toute réutilisation.
- Deux documents de sécurité distincts coexistent : `docs/AUDIT_SECURITE.md` (ancien, sur `main`) et `docs/audits/phase-3-securite-applicative-*.md` (récent, uniquement sur `release/commercialisation-v1`). Ne pas les confondre lors d'une future consolidation.

## 13. Points à vérifier ultérieurement dans l'application

- Suivi de zone chantier : jamais testé par l'utilisateur final en conditions réelles (contrairement aux notifications push).
- Boutique : flux de paiement Stripe Checkout non testé de bout en bout dans le cadre de cet inventaire (code présent, non exécuté).
- Paie et grands/petits déplacements : « vérifiés sur données de test » selon les messages de commit — à revalider sur un cas réel avant mise en avant commerciale.
- Connecteurs fournisseurs, appels d'offres, interventions : profondeur fonctionnelle non vérifiée en détail (lecture rapide uniquement).
- Contenu juridique (CGU/CGV/confidentialité/cookies/mentions légales) : présence confirmée, contenu non audité juridiquement dans le cadre de ce travail.

## 14. Pointeur vers les audits de sécurité (Codex)

Le travail de sécurité applicative (phase 3 : migration 193, pgTAP, Storage, Playwright, CSP, rate limiting, etc.) est traité exclusivement par Codex sur la branche `release/commercialisation-v1`, worktree `/Users/juliengregurec/Projects/liria-codex`, documenté dans `docs/audits/phase-3-securite-applicative-etat-initial.md` et `docs/audits/phase-3-securite-applicative-rapport-final.md` (fichiers présents uniquement sur cette branche, non lus ni recopiés ici). Se référer à ces documents pour l'état de sécurité — cet inventaire ne traite que de la visibilité et de l'état fonctionnel des écrans.

## 15. Base pour le futur manuel utilisateur

Cet inventaire peut servir de plan pour un manuel structuré en suivant les mêmes grands domaines : Ventes & relation client, Chantiers & terrain, Équipe/RH/Paie, Achats & stock, Pilotage, Boutique, Intelligence artificielle, Abonnement, Comptes & paramètres. Pour chaque module marqué « Fonctionnelle », un chapitre peut être rédigé directement ; pour les modules « Visible mais partielle », le manuel devra préciser clairement la limite (ex. « nécessite un contrat Powens », « nécessite la configuration des prix Stripe ») plutôt que de la passer sous silence.

## 16. Éléments à ne pas présenter commercialement pour le moment

- **Paie — virement réel des salaires** et **Banque — exécution des virements fournisseurs** : tant que Powens n'est pas contracté, ne pas présenter ces flux comme opérationnels de bout en bout ; la préparation/le calcul le sont, l'exécution bancaire ne l'est pas.
- **Option IA — facturation automatique par palier** : ne pas annoncer de tarification IA précise tant que les prix Stripe ne sont pas créés et vérifiés.
- **Connecteurs fournisseurs, appels d'offres, interventions** : présence confirmée mais profondeur non vérifiée — éviter les démonstrations non préparées sur ces trois modules avant relecture plus approfondie.
- **Contenu juridique** (CGU/CGV/confidentialité) : à faire valider par un juriste avant toute mise en avant commerciale formelle (école, prospects, presse).
