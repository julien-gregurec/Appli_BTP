# ELSATIA — Registre des décisions propriétaire V1

Date : 22 septembre 2026. Revue rapide (~30 min) des rapports existants (`docs/`, `PROMPT_CODEX_RGPD.md`, `RELAIS_CODEX_ABONNEMENT.md`, `PRODUCTION_CHECKLIST.md`, `docs/juridique/`). Aucune modification de code. Aucune décision n'est prise ici : ce document liste ce qui reste à trancher par le propriétaire produit/métier, avec l'option conservatrice actuellement appliquée par défaut.

Légende blocage : **Pilote** / **1er client payant** / **Self-service** / **Prod publique**.

---

### D1 — COMMERCIAL_DECISION_REQUIRED : remise annuelle
**Question** : la remise de −20 % pour paiement annuel (`REDUCTION_ANNUELLE = 0.2`, `src/lib/plateforme.ts`) est-elle définitive, alors que `docs/juridique/cgv.md` art. 4.3 la présente encore comme « à titre indicatif » ?
**Pourquoi** : un CGV publié avec une valeur « indicative » n'est pas opposable proprement ; le code, lui, applique déjà −20 % en le facturant réellement.
**Options** : (a) figer −20 % et retirer « à titre indicatif » des CGV ; (b) choisir un autre taux avant ouverture commerciale.
**Conséquences** : (a) simple mise à jour juridique, aucun changement code ; (b) changement code + CGV + communication tarifaire.
**Option conservatrice actuelle** : −20 % appliqué en réel dans le code, CGV encore formulé comme indicatif (incohérence à corriger dans un sens ou l'autre).
**Bloquant pour** : Self-service, Prod publique. Pas bloquant pour Pilote / 1er client payant en facturation manuelle.

### D2 — COMMERCIAL_DECISION_REQUIRED : grille de facturation par comptes supplémentaires
**Question** : la grille `facturation_comptes_mensuelle` / `plateforme_usage_entreprises` (base + prix par compte additionnel selon l'offre) est-elle validée commercialement pour être branchée sur Stripe Billing réel ?
**Pourquoi** : le mécanisme calcule déjà le montant dû/mois (migration `20260713000063`) mais reste une « source de vérité applicative », pas encore confirmée comme grille commerciale finale.
**Options** : (a) valider la grille actuelle telle quelle ; (b) ajuster les prix par compte avant activation Stripe.
**Conséquences** : (a) activation Stripe possible dès les clés en place ; (b) retarde l'automatisation, risque de re-versionner les contrats déjà signés entre-temps.
**Option conservatrice actuelle** : Stripe Billing reste désactivé (pas de clé de prod) ; le calcul tourne mais ne débite personne.
**Bloquant pour** : Self-service, Prod publique. Pas bloquant pour Pilote / 1er client payant (facturation manuelle possible).

### D3 — COMMERCIAL_DECISION_REQUIRED : entité juridique facturante et prix résiduels
**Question** : quelle entité (nom, adresse, SIRET, TVA, RIB) apparaît sur les factures Liria ? Quel délai de grâce avant suspension après échec de paiement ? Quel prix unitaire du dépassement IA et taille finale du pack à 29 € ? Quel montant définitif pour paramétrage/migration/formation ?
**Pourquoi** : listé explicitement comme non tranché dans `docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md` (§ « Points à décider avant commercialisation », points 1 à 4).
**Options** : trancher chaque point séparément ; ou geler l'ouverture commerciale tant qu'ils ne sont pas fixés.
**Conséquences** : sans entité facturante ni RIB validés, Stripe Billing production ne peut pas être activé légalement.
**Option conservatrice actuelle** : Stripe Billing production non activé, aucun prix de dépassement IA facturé automatiquement.
**Bloquant pour** : 1er client payant (si paiement carte réel exigé), Self-service, Prod publique. Pas bloquant pour Pilote.

### D4 — LEGAL_DECISION_REQUIRED : RGPD — sort des données à la suppression d'un compte entreprise
**Question** : à la suppression d'une entreprise, anonymise-t-on et conserve-t-on les factures/comptabilité 10 ans (recommandé), ou exporte-t-on puis supprime-t-on tout ? Purge à 30 jours (comme les CGV) ou immédiate sur confirmation forte ? L'admin d'entreprise peut-il déclencher seul une suppression totale, ou faut-il une validation plateforme ?
**Pourquoi** : trois questions explicitement posées à Julien dans `PROMPT_CODEX_RGPD.md` (§ « Décisions à faire confirmer »), non implémentées.
**Options** : (a) anonymiser + conserver 10 ans, délai 30 j, self-service ; (b) export puis suppression totale, purge immédiate, validation plateforme obligatoire.
**Conséquences** : (a) plus sûr juridiquement, plus simple à opérer, moins « radical » pour l'utilisateur ; (b) risque juridique (perte de pièces comptables obligatoires), plus lourd à sécuriser côté support.
**Option conservatrice actuelle** : droits RGPD export/suppression **non implémentés** à ce stade — fonctions annoncées dans les CGV/politique de confidentialité mais pas encore livrées.
**Bloquant pour** : Prod publique (obligation légale annoncée aux clients). Pas bloquant pour Pilote.

### D5 — LEGAL_DECISION_REQUIRED : anonymisation vs conservation d'identité (salarié)
**Question** : lors de l'anonymisation d'une fiche employé (niveau A), quelles données de paie/pointage doit-on obligatoirement conserver au titre des obligations sociales, et pour quelle durée ?
**Pourquoi** : le principe (anonymiser nom/contact/photo, garder ce qui est légalement obligatoire) est posé dans `PROMPT_CODEX_RGPD.md` mais le périmètre exact des données à garder n'est pas validé par un conseil RGPD/DPO.
**Options** : (a) valider un périmètre minimal type (bulletins, pointages liés à la paie) avec durée standard ; (b) faire trancher au cas par cas par l'expert-comptable/DPO.
**Conséquences** : (a) permet d'implémenter `anonymiser_employe` rapidement ; (b) retarde la fonction tant que le périmètre n'est pas figé.
**Option conservatrice actuelle** : fonction d'anonymisation non implémentée.
**Bloquant pour** : Prod publique. Pas bloquant pour Pilote / 1er client payant.

### D6 — LEGAL_DECISION_REQUIRED : durée de rétention et destruction papier des justificatifs de notes de frais
**Question** : durée de conservation définitive des justificatifs de dépenses (dix ans proposé) et à quel moment/condition l'entreprise peut autoriser la destruction de l'original papier ?
**Pourquoi** : `docs/ARCHIVAGE_JUSTIFICATIFS.md` propose dix ans « sous réserve de validation par l'entreprise et ses conseils » et précise que l'autorisation de détruire le papier ne doit jamais être déduite du logiciel.
**Options** : (a) valider dix ans + procédure d'autorisation explicite de destruction ; (b) durée différente selon type de pièce (comptable vs justificatif salarié).
**Conséquences** : (a) cohérent avec l'obligation comptable générale ; (b) plus précis mais plus complexe à paramétrer par entreprise.
**Option conservatrice actuelle** : conservation par défaut, rappel systématique à l'utilisateur de garder le papier tant que l'entreprise n'a pas confirmé une conservation conforme ; aucune suppression automatique.
**Bloquant pour** : rien de bloquant techniquement aujourd'hui (le module fonctionne avec la valeur par défaut) — mais nécessaire avant de communiquer une politique de rétention officielle en Prod publique.

### D7 — LEGAL_DECISION_REQUIRED : archivage renforcé et signature — valeur probante
**Question** : qui valide juridiquement le mode `reinforced_archive` et un éventuel prestataire de signature électronique qualifiée avant de les présenter comme ayant une valeur probante ?
**Pourquoi** : `docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md` et `docs/ARCHIVAGE_JUSTIFICATIFS.md` interdisent explicitement de présenter ces fonctions comme qualifiées sans validation juriste + expert-comptable + prestataire.
**Options** : (a) contractualiser un prestataire qualifié avant toute communication commerciale sur ce point ; (b) ne jamais communiquer sur la valeur probante et rester en mode informatif.
**Conséquences** : (a) coût et délai prestataire ; (b) fonctionnalité reste « best effort », pas d'argument commercial dessus.
**Option conservatrice actuelle** : aucun prestataire branché, aucune mention de valeur probante affichée.
**Bloquant pour** : rien aujourd'hui (fonction non mise en avant). Bloquant seulement si l'argument commercial « valeur probante » est utilisé.

### D8 — DECISION_REQUIRED : bascule Preview → Production (sortie du mode prototype)
**Question** : quand bascule-t-on réellement `DISABLE_EMAIL_LOGIN=true → false` et applique-t-on `supabase/production/sortie_mode_prototype.sql`, qui coupe définitivement l'accès anonyme de démonstration ?
**Pourquoi** : `PRODUCTION_CHECKLIST.md` liste explicitement cette bascule comme une action volontairement non automatisée, nécessitant une décision et une exécution manuelle de Julien, avec sauvegarde préalable obligatoire.
**Options** : (a) basculer dès que l'hébergement/URL de prod est choisi et testé en préproduction ; (b) rester en mode prototype/démonstration plus longtemps.
**Conséquences** : (a) irréversible sans restauration de sauvegarde ; (b) retarde l'ouverture à de vrais comptes externes.
**Option conservatrice actuelle** : mode prototype toujours actif, script de sortie prêt mais non appliqué.
**Bloquant pour** : 1er client payant réel (hors pilote interne), Self-service, Prod publique. Pas bloquant pour Pilote en environnement contrôlé.

### D9 — Convergence monorepo
**Constat** : aucune décision de convergence monorepo en attente n'a été trouvée dans les rapports actuels — le projet est un dépôt applicatif unique (Next.js + Supabase), pas une structure monorepo. Rien à trancher sur ce point à ce stade.

---

**Synthèse blocage Prod publique** : D1, D2, D3, D4, D5, D8 sont bloquants avant une ouverture publique en self-service. D6 et D7 sont des points de prudence juridique à traiter avant toute communication commerciale dessus, sans bloquer le fonctionnement technique actuel.
