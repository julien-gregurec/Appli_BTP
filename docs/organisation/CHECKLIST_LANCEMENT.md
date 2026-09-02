# Checklist de lancement commercial — ELSATIA Gestion Pro

Document unique de suivi avant ouverture à de vrais clients. Chaque section est un chantier **obligatoire**. Il n'y a qu'un seul **GO commercial public**, prononcé une fois **tous** les chantiers ci-dessous validés — pas seulement 1 à 7. Regroupement :

- **Prérequis techniques** : chantiers 1 (dépendances), 2 (recette fonctionnelle), 5 (environnement Production distinct), 7 (exploitation courante).
- **Prérequis juridiques et commerciaux** : chantiers 3 (identité juridique — forme = entreprise individuelle, cf. § 3), 3bis (suivi de la marque INPI jusqu'à la fin du délai d'opposition du 21-10-2026 puis nouvelle vérification), 3ter (décision de commercialisation phasée), 4 (documents légaux définitifs), 6 (Stripe réel).
- **Réseaux sociaux** : chantier 10 — prérequis de **préparation commerciale** lorsque les réseaux sont retenus pour le lancement, pas un prérequis technique au fonctionnement de l'application.
- **Refonte UI-V2** : chantier 11 — refonte visuelle validée par Julien ; prérequis de l'ouverture publique (les captures site/stores en dépendent), non bloquant pour les essais et démonstrations internes.
- **Bascule Production** : chantier 8 (jour J uniquement).
- **GO public final** : prononcé après validation de tous les points ci-dessus + la revérification INPI post-21-10-2026 sans opposition. Ce GO unique doit rester cohérent entre ce document, `REGISTRE_CENTRAL.md`, `P15_GO_LIVE_CHECKLIST.md` et `docs/commercial/GO_LIVE_COMMERCIAL_CHECKLIST.md`.

Chantier 9 (dette documentaire) : hygiène continue, non bloquant.

Dernière mise à jour : 2026-09-01, mise à jour pilotage « marque, commercialisation, réseaux sociaux et refonte visuelle » : forme juridique confirmée = **entreprise individuelle (EI)**, régime fiscal/social (micro ou réel) **non arbitré** — 🔴 arbitrage expert-comptable requis avant immatriculation et Stripe Live (§ 3) ; calendrier INPI complet et règles de formulation publique (§ 3bis) ; décision de commercialisation phasée (§ 3ter) ; nouvelles sections 10 (réseaux sociaux) et 11 (refonte visuelle ELSATIA-UI-V2, cf. `ELSATIA_UI_V2_REFONTE.md`). Historique antérieur : 2026-08-07, après clôture de la recette d'isolation multi-entreprises (lecture, écriture, Storage HTTP réel), l'audit final pré-commercialisation en lecture seule, et le lot technique B3-B5 (changement de mot de passe, icônes PWA, correctif `js-yaml`). Voir `docs/organisation/REGISTRE_CENTRAL.md` pour le détail de chaque recette.

Statuts utilisés dans ce document : `VALIDÉ SUR PREVIEW` (vérifié sur `elsatia-preview`, à revalider une fois l'environnement Production provisionné) · `À FAIRE AVANT PRODUCTION` · `À VALIDER EN PRODUCTION` (dépend d'un environnement Production qui n'existe pas encore) · `BLOQUÉ PAR STRUCTURE JURIDIQUE` · `NON APPLICABLE`. Une case cochée signifie toujours « validé sur Preview », jamais « Production prête ».

## État déjà validé (ne pas revalider sans raison)

- [x] Preview `elsatia-preview` déployée et opérationnelle (commit `4e188ec9c69c54d66860e2cfe7bfddcd4b052dde` au moment de la recette R1-R7C).
- [x] Recette fonctionnelle Devis (R7A, R7B, R7C) validée en conditions réelles sur la Preview.
- [x] Recettes Prestations (R4), Fournisseurs (R5) et Clients (R6) validées.
- [x] 232 tests Vitest passent (`npm run test`).
- [x] TypeScript sans erreur (`npm run typecheck`).
- [x] Lint sans erreur (`npm run lint` — 0 erreur, 3 avertissements préexistants `<img>` sans rapport).
- [x] 189 migrations Supabase cohérentes, dernière `20260802000195_migration_prefixe_qr_lgp_vers_els.sql` au 2026-08-05 (vérifié par comptage direct, checklist Preview mise à jour en conséquence). **Mise à jour 2026-08-07 : 199 migrations désormais appliquées** (correctifs d'isolation `196` à `199`, `local=remote` reconfirmé) — voir `REGISTRE_CENTRAL.md`.
- [x] Pages juridiques déjà présentes dans l'application (route `/mentions-legales` construite avec succès).
- [x] Aucun secret détecté dans Git (état rapporté avant ce chantier ; non revérifié ligne par ligne dans cette session).

## Chantier technique du 2026-08-05 (traité dans cette session)

- [x] Vulnérabilité `fast-uri` (haute, host confusion) corrigée : 3.1.4 → 3.1.5.
- [x] Vulnérabilité `brace-expansion` (haute, DoS) corrigée au passage : 1.1.16 → 1.1.18.
- [x] `npm audit` : 0 vulnérabilité restante (high/critical/moderate/low).
- [x] Build, typecheck, lint et tests entièrement rejoués après correction — tous au vert.
- [x] Scripts de recette (`scripts/seed-elsatia-preview-year.mjs` et son test) intégrés à Git avec leur propre suite de tests (37/37, `node --test`).
- [x] `docs/exploitation/PREVIEW_ELSATIA_CHECKLIST.md` corrigée (188 → 189 migrations, nom du dernier fichier).
- [x] Commits poussés vers le dépôt distant, branche synchronisée jusqu'à `ff63e6d` inclus (sécurité, scripts de recette, checklist, dépôt de marque).

## 1. Sécurité des dépendances

- [x] `fast-uri` corrigé.
- [x] Vérification récurrente ajoutée à la CI : `npm audit --audit-level=high` sur les pull requests, les poussées `main` / `release/commercialisation-v1`, en lancement manuel et chaque lundi.

## 2. Recette fonctionnelle complète

- [x] Devis (création, calculs, PDF, brouillon).
- [x] `VALIDÉ SUR PREVIEW` — Authentification (inscription, confirmation, connexion, déconnexion, mot de passe oublié) en conditions réelles sur la Preview. Phases 0 à 4 validées ; phase 5 (mot de passe oublié) partiellement testée, quota d'envoi d'e-mails Supabase atteint pendant la recette — voir section 7. Voir `REGISTRE_CENTRAL.md`, ligne « Recette Auth ».
- [x] `VALIDÉ SUR PREVIEW` — Séparation stricte entre entreprises (isolation multi-tenant), lecture et écriture, sur les modules principaux. Recette close le 07-08-2026, sans anomalie résiduelle. Voir `REGISTRE_CENTRAL.md`, lignes « Recette Isolation Multi-Entreprises » et correctifs associés (RLS chantiers, factures, `devis.client_id`, `relances_impayes`).
- [x] `VALIDÉ SUR PREVIEW` — Fichiers privés (Storage) : upload autorisé, téléchargement direct refusé si privé, URL signée fonctionnelle. Testé en HTTP réel avec sessions authentiques A↔B, aucune fuite croisée. Voir `REGISTRE_CENTRAL.md`, ligne « Recette Storage — validation fonctionnelle HTTP réelle A↔B ».
- [ ] Factures : création, transformation depuis un devis accepté, statuts, PDF.
- [ ] Abonnement Stripe en mode test : Checkout, portail client, webhooks, échec de paiement.
- [ ] Parcours mobile et PWA : installation, mode hors ligne, mise à jour du service worker. Aspects techniques (manifest, icônes, service worker) validés le 07-08-2026 (lot B3-B5) ; installation réelle sur appareil non testée.

### Chantier technique du 2026-08-07 (lot B3-B5, hors périmètre Production)

- [x] Accès utilisateur au changement de mot de passe ajouté (Mon espace → Compte et sécurité), réutilisant le mécanisme existant, 5 tests unitaires.
- [x] Icônes PWA créées (192/512, variantes maskable) à partir de la marque ELSATIA existante, manifeste mis à jour, 1 test unitaire.
- [x] Vulnérabilité npm haute `js-yaml` corrigée (`npm audit --audit-level=high` → 0 vulnérabilité).
- [x] Build, typecheck, lint, 238 tests Vitest et 241 tests pgTAP rejoués après correction — tous au vert. Voir `REGISTRE_CENTRAL.md`, ligne « Lot technique pré-commercialisation B3-B5 ».

## 3. Identité juridique de l'entreprise

`BLOQUÉ PAR STRUCTURE JURIDIQUE` — bloquant racine dont dépendent les sections 4 et 6.

**Décision de forme juridique (mise à jour 2026-09-01)** : ELSATIA démarrera sous la forme d'une **entreprise individuelle (EI)**. Le **régime fiscal et social n'est pas arbitré** : le régime micro-entrepreneur ne doit être ni sélectionné, ni présenté comme décidé. Ne pas confondre la **forme juridique EI** et le **régime fiscal/social micro-entrepreneur** ; les documents et checklists ne doivent pas présenter « micro-entreprise » comme une décision acquise, et aucune procédure ne doit répondre « Oui » au régime micro avant l'arbitrage.

🔴 **Julien — action personnelle bloquante** : arbitrer le **régime fiscal et social de l'EI (micro ou réel)** avec un **expert-comptable**, **avant l'immatriculation** et **avant l'activation de Stripe Live**. Aucune préférence micro/réel n'est exprimée dans ce document.

- [ ] 🔴 Régime fiscal et social (micro **ou** réel) arbitré avec un expert-comptable — préalable à l'immatriculation et à Stripe Live.
- [ ] Immatriculation de l'entreprise individuelle (EI) qui encaissera l'abonnement (aucune structure n'existe à ce jour).
- [ ] Adresse professionnelle.
- [ ] SIRET.
- [ ] Régime de TVA tranché — découle du régime arbitré et de l'immatriculation.
- [ ] E-mail professionnel (`@elsatia.fr` ou équivalent).

### 3bis. Marque ELSATIA — point bloquant avant commercialisation (mis à jour 2026-08-05)

Recherche du 2026-08-05 sur `data.inpi.fr` (bases Marques France/UE/International, mise à jour au 31/07/2026) : aucune marque « ELSATIA » trouvée à cette date. Explication confirmée depuis par le récapitulatif de dépôt : le dépôt (01-08-2026) est postérieur à la dernière mise à jour de la base publique (31-07-2026), simple décalage de publication, pas une absence réelle de dépôt.

**Dépôt confirmé** (récapitulatif INPI reçu) :

- [x] Démarche bien « déposée » (récapitulatif signé et daté, redevances payées) — pas un brouillon.
- [x] Numéro national de dépôt : `5284384`, date de dépôt : `01-08-2026`, type : marque française verbale.
- [x] Classes retenues : `9` (logiciels enregistrés), `35` (gestion/organisation/administration des affaires, gestion informatisée de fichiers), `42` (développement, édition, maintenance, hébergement de logiciels, SaaS).
- [x] Accusé de réception / récapitulatif obtenu et conservé par l'utilisateur.
- [x] Déposant : personne physique, au nom de l'entité « Elsatia » **en cours de formation** (société pas encore créée) — cohérent avec le chantier 3 ci-dessus (aucune structure légale existante à ce jour). Le dépôt de marque n'attend donc pas la création de la société, mais celle-ci reste nécessaire pour les autres points du chantier 3 (SIRET, adresse professionnelle, encaissement).

Domaines `.fr` et `.com` déjà acquis (déclaré, non vérifié techniquement).

**Calendrier INPI (mise à jour 2026-09-01)** :

| Étape | Date |
| --- | --- |
| Dépôt INPI | **1er août 2026** |
| Publication au BOPI | **21 août 2026** |
| Fin du délai d'opposition | **21 octobre 2026** |
| Examen de fond et de forme finalisé par l'INPI | ensuite |
| Enregistrement définitif estimé | **janvier / février 2027**, en l'absence d'opposition, d'objection ou d'irrégularité |

Situation juridique à retenir :

- la propriété **définitive** de la marque s'acquiert à l'**enregistrement** ;
- si l'enregistrement est accordé, ses effets **remonteront à la date du dépôt (01-08-2026)** ;
- le dépôt ne supprime **pas** le risque lié à d'éventuels droits antérieurs.

**Règles de formulation publique (obligatoires tant que la marque n'est pas enregistrée)** :

- présenter ELSATIA comme **« marque déposée »** ou **« marque en cours d'enregistrement »** ;
- **ne pas** employer « marque enregistrée » ;
- **ne pas** utiliser le symbole **®** avant l'enregistrement définitif ;
- formulation publique autorisée : **« ELSATIA, marque française déposée auprès de l'INPI le 1er août 2026. »**

**Reste à faire** :

- [ ] Faire réaliser une recherche de similitudes phonétiques et visuelles (pré-diagnostic INPI ou conseil en propriété industrielle) — la recherche par nom exact ne suffit pas, et le dépôt reste opposable pendant sa période d'examen/publication.
- [ ] Suivre le dépôt jusqu'à la **fin du délai d'opposition (21-10-2026)** : premier jalon juridique important.
- [ ] **Nouvelle vérification du dossier INPI après le 21-10-2026** (opposition, objection ou notification de l'INPI) avant toute ouverture commerciale publique.
- [ ] Surveiller ensuite l'examen jusqu'au **certificat d'enregistrement définitif**.
- [ ] Valider les formulations juridiques employées publiquement (site, stores, documents commerciaux) conformément aux règles ci-dessus.

### 3ter. Commercialisation — décision de pilotage (2026-09-01)

Il **n'est pas nécessaire d'attendre janvier / février 2027** (enregistrement définitif) pour commencer à commercialiser les applications ELSATIA.

- [x] Poursuivre immédiatement le développement, les essais, les démonstrations et la préparation commerciale.
- [x] Ne **pas** bloquer Stripe, les stores, le site ou les documents commerciaux jusqu'à l'enregistrement définitif.
- [ ] Retenir le **21 octobre 2026** comme premier jalon juridique important.
- [ ] Privilégier une **commercialisation publique après le 21-10-2026**, sous réserve qu'aucune opposition ni notification problématique de l'INPI n'ait été reçue (revérification § 3bis).

⚠️ Cette décision **ne constitue pas à elle seule un GO commercial**. Toutes les autres conditions techniques, juridiques, financières et de sécurité de ce document (chantiers 1 à 8, sections 10 et 11) restent obligatoires.

## 4. Documents légaux définitifs

`BLOQUÉ PAR STRUCTURE JURIDIQUE` — les documents `docs/juridique/*.md` existent avec un contenu substantiel (non modifiés par ce lot documentaire) mais contiennent des placeholders (`[À COMPLÉTER]`, dates `[JJ/MM/AAAA]`) qui dépendent des informations de la section 3.

- [ ] Remplacer les champs provisoires des CGV.
- [ ] Remplacer les champs provisoires des CGU.
- [ ] Remplacer les champs provisoires des mentions légales.
- [ ] Remplacer les champs provisoires des documents RGPD.
- [ ] Faire relire l'ensemble par une personne compétente (juriste ou équivalent) avant publication — recommandé avant toute publication réelle, indépendamment de l'avancement technique.

## 5. Environnement de production distinct

```
ENVIRONNEMENT PRODUCTION À PROVISIONNER
```

Aucun projet Supabase ni Vercel de Production n'existe à ce jour ; `elsatia-preview` reste l'unique environnement. Voir `PRODUCTION_CHECKLIST.md` pour la checklist détaillée et la séquence de provisionnement proposée (non exécutée).

- [ ] Projet Vercel de production, séparé de `elsatia-preview`.
- [ ] Projet Supabase de production, séparé du projet Preview.
- [ ] Stratégie de sauvegarde testée et restaurable (pas seulement activée).
- [ ] Domaine `elsatia.fr` configuré et pointé.
- [ ] Configuration Auth de production (Site URL, redirections, templates) sur le domaine définitif.
- [ ] Variables d'environnement de production saisies et vérifiées (aucune valeur de test/Preview réutilisée).

## 6. Stripe réel

```
STRIPE LIVE NON CONFIGURÉ
```

`BLOQUÉ PAR STRUCTURE JURIDIQUE` — le code Stripe est présent et mature (Checkout, portail client, abonnement, Connect, webhooks avec vérification de signature et déduplication en base), mais la mise en mode live dépend de la structure juridique (section 3) et d'un environnement Production (section 5). Aucune activation live avant ces deux prérequis.

- [ ] Compte Stripe validé (KYC terminé).
- [ ] Tarifs réels configurés (Mini/Pro/Business/Entreprise, mensuel/annuel) conformes à `docs/organisation/TARIFICATION_CANONIQUE.md` (79/249/449/599, annuel = 10 × mensuel) ; `npm run verify:stripe-prices --strict` vert en Test puis en Live.
- [ ] TVA configurée correctement.
- [ ] Portail client activé.
- [ ] Webhooks de production configurés et testés.
- [ ] Règles de gestion des impayés définies et implémentées.

## 7. Exploitation courante

- [ ] `FOURNISSEUR EMAIL TRANSACTIONNEL À CHOISIR` — E-mails professionnels opérationnels (envoi transactionnel, réception support). Le code n'envoie aujourd'hui aucun email serveur (`src/lib/email.ts` ne construit que des liens `mailto:` côté client) ; les emails d'authentification dépendent uniquement du service natif Supabase Auth, dont le quota d'envoi a déjà été atteint pendant la recette sur Preview. Devis, factures et relances ne sont pas envoyés automatiquement côté serveur à ce jour. Aucun fournisseur choisi dans ce lot.
- [ ] `À VALIDER EN PRODUCTION` — Tâches automatiques (crons) activées et surveillées en production. Code présent (`/api/cron/abonnements`), non vérifiable sans environnement Production réel.
- [ ] `À VALIDER EN PRODUCTION` — Surveillance des erreurs (Sentry) branchée sur l'environnement de production. Sentry est intégré côté code (client/serveur/edge, configuration RGPD-consciente) mais ne s'active que si `NODE_ENV=production` et qu'un DSN Production est fourni.

## 8. Bascule de lancement (jour J uniquement)

Ne cocher qu'au moment réel du lancement, pas avant. Mise à jour 2026-08-07 : le « mode prototype » historique (accès `anon` étendu aux tables métier, script `sortie_mode_prototype.sql`) n'existe plus dans le schéma actuel — voir `PRODUCTION_CHECKLIST.md`. Les deux premiers points ci-dessous sont donc `NON APPLICABLE` tels que formulés à l'origine ; reformulés pour refléter l'état réel :

- [ ] `NON APPLICABLE` (mode prototype déjà inexistant sur Preview — à revérifier explicitement une fois la base Production créée, pour confirmer qu'aucun mécanisme équivalent n'y a été réintroduit par erreur).
- [ ] Vérifier qu'aucun grant `anon` inattendu n'existe sur une table métier de la base Production (seuls des catalogues publics en lecture seule sont légitimes — voir la liste exacte dans `PRODUCTION_CHECKLIST.md`).
- [ ] Supprimer les comptes et données de démonstration de l'environnement de production.

## 9. Dette documentaire

- [x] Scripts de recette non suivis réglés (versionnés dans Git avec tests).
- [x] `PREVIEW_ELSATIA_CHECKLIST.md` mise à jour (nombre de migrations).
- [x] Revue de `docs/organisation/REGISTRE_CENTRAL.md` : date de consolidation et tableau « État des autres sujets » actualisés (recette Preview R1-R7C, checklist de lancement, dépôt de marque). Le tableau des lots 1-7 (rebranding) reste inchangé — vérifié encore exact (lot 6 toujours non fusionné sur `lot6/nettoyage-final-elsatia`, lot 7 toujours non commencé).
- [x] 2026-08-07 — `PRODUCTION_CHECKLIST.md` entièrement réécrit (l'ancienne version décrivait un mode prototype obsolète) et ce document mis en cohérence avec l'état réel du dépôt (recette d'isolation close, lot technique B3-B5 intégré). Voir `REGISTRE_CENTRAL.md`.

## 10. Réseaux sociaux et identité en ligne (ajouté 2026-09-01)

Vérification publique du 2026-09-01 pour l'identifiant exact **« Elsatia »** :

- **Instagram** `@elsatia` : déjà utilisé — profil personnel « elsa », sans rapport avec l'entreprise.
- **TikTok** `@elsatia` : déjà utilisé — compte « sanju », 0 abonné, sans rapport avec l'entreprise.
- **Facebook** `facebook.com/elsatia` : déjà utilisé — redirige vers un profil personnel « Elsa Tia ».
- **LinkedIn** `linkedin.com/company/elsatia` : page introuvable ; aucune entreprise ELSATIA clairement identifiée dans les résultats publics ; nom de page d'entreprise **semble** disponible, à confirmer à la création.

Ces comptes personnels ne bloquent pas l'usage commercial de la marque, mais leur récupération n'est pas acquise.

**Identifiant social officiel à réserver** — même identifiant (ou aussi proche que possible) sur Facebook, Instagram, TikTok et LinkedIn. Ordre de préférence : 1. `@elsatiafr` (préférence actuelle) · 2. `@elsatia_fr` · 3. `@elsatia.app` · 4. autre variante courte validée avant création.

- [ ] Vérifier **en direct** la disponibilité réelle de chaque variante sur les quatre plateformes.
- [ ] Choisir et réserver l'identifiant officiel (même identifiant partout autant que possible).
- [ ] Créer la page **LinkedIn entreprise ELSATIA**.
- [ ] Créer / sécuriser les comptes Facebook, Instagram, TikTok : adresse `julien@elsatia.fr` quand c'est possible, **authentification forte activée**, moyens de récupération enregistrés, accès conservés dans un gestionnaire sécurisé.
- [ ] Ne créer aucune page définitive avec un identifiant différent sans validation de Julien.

🔴 **Julien — actions personnelles** : vérifier et valider l'identifiant social officiel ; créer ou valider la création des comptes Facebook / Instagram / TikTok / LinkedIn ; activer l'authentification forte et sécuriser les moyens de récupération. **Aucune création de compte ni publication externe automatique sans son autorisation explicite.**

## 11. Refonte visuelle et ergonomique — lot ELSATIA-UI-V2 (ajouté 2026-09-01)

Refonte visuelle **complète** ajoutée aux travaux obligatoires avant commercialisation. Commence par ELSATIA Gestion Pro (application maîtresse), puis déclinée sur Colors et Tools. Ne remet en cause aucune fonctionnalité validée, règle métier, sécurité, habilitation, isolation multi-entreprise, donnée, parcours Stripe, accès multi-applications, ni les PWA/natives ; préserve l'autonomie métier de Colors et Tools.

Cadrage, direction visuelle, navigation, écrans prioritaires, méthode de validation en 12 étapes, estimation (**≈ 3 à 5 semaines**, à recalculer après inventaire) et sous-lots **UI-V2-R1 → R10** : voir **`docs/organisation/ELSATIA_UI_V2_REFONTE.md`**. Lot **non démarré**.

**Séquencement (décision de pilotage 2026-09-01)** : le travail préparatoire — **R1 (audit), R2 (charte/design system) et les premières maquettes Gestion Pro (R3)** — **peut commencer avant le 21-10-2026**, en parallèle du suivi INPI et de la préparation Stripe/Production, afin de ne pas repousser inutilement l'ouverture publique. Le jalon INPI du 21-10 reste **indépendant** du travail préparatoire UI. Aucune mise en Production ni généralisation du nouveau design sans **validation de Julien**. Ne pas mélanger ce lot avec les migrations de sécurité ni les opérations Production sensibles.

- [ ] UI-V2-R1 — audit de l'existant (densité, navigation, hiérarchie).
- [ ] UI-V2-R2 — mini-charte ELSATIA et design system.
- [ ] UI-V2-R3 — 2-3 maquettes de tableau de bord Gestion Pro + variantes bureau / tablette / mobile.
- [ ] **Validation de la direction par Julien.** 🔴
- [ ] UI-V2-R4 — composants communs.
- [ ] UI-V2-R5 — migration progressive des 15 écrans prioritaires de Gestion Pro.
- [ ] UI-V2-R6 — responsive et accessibilité (bureau, tablette, mobile).
- [ ] UI-V2-R9 — tests de non-régression : aucune fonctionnalité ni permission perdue.
- [ ] UI-V2-R7 / R8 — déclinaison Colors puis Tools.
- [ ] **Julien valide la maquette finale avant déploiement général.** 🔴
- [ ] UI-V2-R10 — refaire les captures commerciales du site et App Store / Google Play **uniquement après** validation de l'interface V2 (lié au chantier 8).

## Condition d'arrêt

Ne pas cocher une case sans preuve vérifiée (capture, log de commande, rapport de recette). En cas de doute sur l'état réel d'un point, le laisser décoché plutôt que de le déclarer acquis par optimisme.
