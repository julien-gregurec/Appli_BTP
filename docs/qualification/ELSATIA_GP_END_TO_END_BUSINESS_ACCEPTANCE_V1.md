# ELSATIA Gestion Pro — Recette métier de bout en bout V1

**Date d'exécution :** 2 et 3 octobre 2026
**Périmètre :** application Liria Gestion Pro V3 (`package.json` 3.0.0), branche `claude/loving-heisenberg-ygkjck`, tête de départ `4d92ddb`.
**Environnement :** local uniquement — Supabase CLI local (Docker, `127.0.0.1:54321/54322`), `next build` + `next start` sur `127.0.0.1:3000`, Chromium Playwright. Aucune Preview, aucune Production, aucun Stripe (clés absentes).
**Entreprise synthétique :** ALSACE TEST BTP (SIRET fictif 12345678900011, Strasbourg).

## Verdict

# `GP_BUSINESS_ACCEPTANCE_PARTIAL`

Les parcours du quotidien d'une entreprise BTP — paramétrage, devis, chantier, pointage, facture simple, encaissement, clôture — passent en local **après 21 défauts corrigés** sur la branche. Un P0 (création de chantier impossible) et 12 P1 (dont une lacune produit) ont été trouvés ; le P0 et 8 P1 sont corrigés et re-vérifiés.

La qualification n'est pas complète pour trois raisons :

1. **P1 ouverts.**
   - Confidentialité : par l'API, un salarié lit le coût horaire et le taux de ses collègues (B28).
   - Produit : acomptes, avoirs, situations et relances n'existent que dans des modules bêta masqués en V3 (B10).
   - Module bêta : la facture de situation ne déduit pas les acomptes et n'applique pas la retenue de garantie (B22, B23).
2. **Production non vérifiée.** Plusieurs défauts viennent de l'état de la base reconstruite depuis les migrations (B01, B04). Leur présence en production n'a pas pu être contrôlée : elle était hors périmètre.
3. **Données historiques.** Les factures déjà émises en production avec les défauts B16, B20 et B34 doivent être auditées (requêtes fournies plus bas).

## Résumé

| Parcours | Contrôles | PASS | FAIL final | Commentaire |
|---|---:|---:|---:|---|
| S1 Paramétrage (entreprise, 6 comptes, rôles, clients, fournisseurs, articles, logo) | 40 | 36 | 4 | 2 artefacts de script, 1 module bêta hors V3, 1 P3 ouvert (logo) |
| S2 Prospection / devis (multi-TVA, remises, duplication, PDF, envoi, acceptation) | 33 | 25 | 8 | 4 corrigés puis re-vérifiés, 2 artefacts, 2 ouverts (ventilation TVA, statut prospect) |
| S3 Chantier (équipe, planning, pointages GPS, oubli, validation, dépenses, documents, alertes) | 41 | 36 | 5 | 2 corrigés (B12), 1 conforme (durée min. 15 min), 2 UX ouverts (B13) |
| S4 Facturation standard (facture, paiements, retard, clôture, rentabilité) | 31 | 25 | 6 | double paiement et remise corrigés, 3 artefacts, relance absente (B10) |
| S4 Bêta (acompte, situation, avoir) | 13 | 10 | 3 | 1 artefact, 2 P1 bêta ouverts (B22, B23) |
| Permissions (matrice fonction × rôle + sondes API/RLS) | 221 | 220 | 1 | B28 ouvert |
| Erreurs utilisateur | 14 | 13 | 1 | hors ligne sans message (P3) |
| Mobile (375/390/768/1024/1440) | 65 | 64 | 1 | un bouton déborde à 768 px |
| Accessibilité pratique | 23 | 16 | 6 | libellés non associés, erreurs non annoncées |
| Endurance (6 cycles) + invariants | 24 | 20 | 4 | les 4 FAIL portent sur des données d'avant correctif ; 0 dérive après |
| Cohérence UI = DB (heures) | 4 | 4 | 0 | après correctif B37 |
| **Total (dernier résultat par contrôle)** | **509** | **469** | **39** | +1 SKIP |

Les 39 FAIL finaux se répartissent ainsi :

- 13 correspondent à des défauts **corrigés puis re-vérifiés** sous un contrôle « Correctif … » ;
- 10 sont des **artefacts de script** (sélecteur, boîte de confirmation non acceptée, base de comparaison faussée par un défaut précédent) ;
- 16 sont **ouverts** et listés plus bas.

| Bugs | Total | Corrigés | Ouverts |
|---|---:|---:|---:|
| P0 | 1 | 1 | 0 (à confirmer en prod) |
| P1 | 12 (dont lacune B10) | 8 | 3 + 1 lacune produit |
| P2 | 14 | 9 | 5 |
| P3 | 11 | 3 | 8 |

Résultats bruts : `docs/qualification/recette-metier-donnees/results.jsonl`.
Scripts rejouables : `scripts/recette-metier/` (voir « Rejouer la recette »).

## Méthode

Chaque étape a été faite dans l'interface réelle (Playwright), sous l'identité de l'utilisateur concerné. Les valeurs affichées ont ensuite été comparées à la base (`UI value == DB value`) et à un **calcul indépendant** :

- HT ligne = quantité × PU × (1 − remise ligne) ;
- la remise globale s'applique au HT et à la TVA ;
- l'arrondi se fait au centime en fin de calcul.

Les contrôles de sécurité ont aussi été rejoués **directement contre PostgREST** avec le jeton de chaque utilisateur, pour vérifier que la base refuse ce que l'écran se contente de masquer.

### Comptes créés (tous par l'interface)

| Rôle demandé | Compte | Poste | Activation |
|---|---|---|---|
| Gérant | gerant@alsace-test-btp.test | Gérant | inscription + création d'entreprise |
| Conducteur | conducteur@… | Conducteur de travaux (modèle) | fiche employé → n° d'inscription → inscription |
| Chef de chantier | chef@… | Chef de chantier (modèle) | idem |
| Salarié | salarie@… | Ouvrier (modèle) | idem, pointage activé par le gérant |
| Comptable | comptable@… | Comptable (modèle) | idem |
| Droits limités | limite@… | « Accès limité » (créé : consultation clients et chantiers) | idem |

Un second tenant, « AUTRE ENTREPRISE TEST », a été créé pour tester le cloisonnement entre entreprises.

## Parcours

### Semaine 1 — Paramétrage : PASS (après correctifs B01, B02)

- Inscription, création d'entreprise et redirection vers le questionnaire d'offre : OK. Le dashboard est accessible sans Stripe pendant l'essai.
- Les 9 rôles prédéfinis sont installés à la création ; la réinstallation est idempotente. Le poste personnalisé et l'enregistrement de ses droits fonctionnent.
- Fiches employés avec coût et taux horaires, puis activation de 5 comptes par numéro d'inscription : 5/5.
- Paramètres (raison sociale, assurances, pénalités 10 %, pied de page) : enregistrés et repris sur les documents.
- Logo : PNG accepté, PDF refusé. **Un fichier texte déclaré `image/png` est accepté (B03).**
- Clients particulier, professionnel et collectivité ; prospect. **Un client sans nom ni société était accepté (B02, corrigé).** Délai de paiement négatif refusé.
- Fournisseurs et 5 prestations (TVA 20 / 10 / 5,5 %) : OK. Prestation à prix négatif refusée.
- Le module Ouvrages est bêta, masqué en V3 : hors périmètre.

**Impasses UX notées :**

- le compte Ouvrier est activé avec le pointage personnel désactivé ; le gérant doit penser à l'activer dans *Accès et rôles* (B15) ;
- les champs du poste dans *Accès et rôles* n'ont pas de libellé associé.

### Semaine 2 — Prospection / devis : PASS (après correctifs B05, B06, B07)

- Devis D1 : 5 lignes, 3 taux de TVA, remises ligne de 5 % et 2,5 %, remise globale de 3 %.
  - Calcul indépendant : **6 923,16 HT / 802,24 TVA / 7 725,40 TTC**.
  - Base = UI = calcul, au centime. 5 lignes sur 5 conformes.
- Cas d'arrondi (3 × 3,33 € à 5,5 % + 2 × 0,04 € à 20 %) : TTC = HT + TVA au centime.
- Double clic sur « Créer le devis » : un seul devis. Devis sans client : message « Choisis un client ».
- **Quantité négative et remise > 100 % étaient acceptées (devis à −240 € et −60 €, B05, corrigé).**
- Duplication D1 → D2 (variante) : montants identiques, chantier conservé, D2 en brouillon non numéroté. Modification de D2 (isolation 120 m²) : 8 584,12 € TTC attendus et obtenus, D1 inchangé. D2 refusé, D1 reste accepté.
- Numérotation : `DEV-AAAA-NNN` attribuée à l'envoi. Un brouillon imprimé porte « DEVIS BROUILLON ».
- Envoi : bouton « Envoyer par email » (mailto). Acceptation : le chantier passe automatiquement en « accepté ». Un devis accepté n'est plus modifiable ni supprimable dans l'interface.
- Impression : identité vendeur (raison sociale, adresse, SIRET), client (SIRET), numéro, montants, assurance décennale et pied de page présents. **Dates imprimées en ISO `2026-10-02` (B06, corrigé : `02/10/2026`).** Un devis de 60 lignes tient sur 4 pages A4, totaux en fin ; **pas de numérotation « page x/y »** (P3).
- **Pas de ventilation de la TVA par taux** sur devis et factures : un seul total TVA (B08, ouvert). C'est une mention de facture à arbitrer : aucune n'a été inventée.
- Après acceptation, le prospect reste « prospect » (B09, P3).

### Semaine 3 — Chantier : PASS (après correctifs B04, B12, B35, B37)

- **Création de chantier impossible pour tous les rôles, gérant compris : « new row violates row-level security policy » (B04, P0, corrigé).**
- La fiche chantier affiche le devis accepté. Statut « en cours ». Équipe : ouvrier, chef et conducteur affectés ; l'affectation en double est idempotente. Tâche ajoutée.
- Planning : 6 affectations (2 salariés × 3 jours × 8 h). Heures négatives refusées. Le champ date est limité à la semaine affichée.
- Pointage GPS simulé (Colmar), arrivée puis départ :
  - double clic sur l'arrivée : une seule session ;
  - départ après moins de 15 min : refusé (durée minimale, conforme) ;
  - journée de 8 h → 7 h normales + 1 h supplémentaire (horaire théorique de 7 h) ;
  - l'arrivée a été antidatée en base pour simuler la journée complète (manipulation documentée).
- Pointage oublié (07:30–16:30, pause 60 min) : 8 h « à vérifier ». Date future refusée. 16:00 → 08:00 est interprété comme un poste de nuit de 16 h, avec une anomalie critique signalée (B14).
- **Une 2ᵉ et une 3ᵉ déclaration le même jour sur le même chantier étaient acceptées (8 + 4 + 8 h, B12, corrigé).** L'endurance a ensuite montré **48 h déclarées le même jour sur 6 chantiers (B35, corrigé : plafond 24 h).**
- Validation par le chef : validation et rejet (motif obligatoire) fonctionnent. Mais les pointages oubliés à valider sont rangés dans « Anciennes saisies d'heures », section **repliée**, et la carte n'affiche ni le motif du salarié, ni le statut, ni le niveau d'anomalie (B13, P2 ouvert).
- Dépenses fournisseurs :
  - 1 250 € HT à 20 % → 1 500 € TTC ; 333,33 € HT à 5,5 % → TVA 18,33 €, TTC 351,66 € (UI = DB) ;
  - montant négatif refusé ; numéro de pièce en double refusé.
- Documents : photo JPEG synthétique et plan PDF ajoutés. Exécutable renommé refusé, fichier vide refusé.
- Alertes : bloc « Alertes opérationnelles » présent au tableau de bord du gérant.
- Rentabilité : main-d'œuvre **424,00 € = 16 h × 26,50 €**, achats 1 583,33 € (UI = DB).
- **Les totaux d'heures (« Mon pointage », « Total par employé », réalisé du planning, copilote) comptaient les pointages rejetés : 28 h affichées pour 16 h retenues (B37, corrigé).**

### Semaine 4 — Facturation : PASS sur le parcours standard (après B16, B17, B24, B25, B34), PARTIEL sur la facturation avancée

- Facture depuis devis accepté : échéance = émission + 45 j (délai du client), brouillon non numéroté et non payable, `FAC-2026-NNN` à l'émission. Lignes verrouillées par la base après émission.
- **La facture ignorait la remise globale du devis : 7 964,33 € au lieu de 7 725,40 € TTC, soit 238,93 € de trop (B16, corrigé ; re-vérifié au centime avec une remise de 5 %).**
- Paiements :
  - **un double clic enregistrait 2 × 3 000 € (B17, corrigé : verrou de la facture et anti-doublon) ;**
  - dépassement du reste dû refusé, montant négatif refusé ;
  - suppression d'un paiement → statut et montant payé recalculés ; solde → « payée ».
- Retard : échéance déplacée au 15/09, passage en « en retard » **manuel**, aucun passage automatique (B18) ; la facture apparaît en retard dans la liste.
- **Relance d'impayé : absente du parcours standard V3**, elle n'existe que dans le CRM bêta (B10).
- **Une facture émise pouvait être annulée en un clic, sans avoir (FAC-2026-008, B24, corrigé).**
- **Une même facture pouvait être recréée indéfiniment depuis un devis accepté (31 devis facturés 2 à 3 fois en endurance, B34, corrigé).** La fiche devis renvoie désormais vers la facture existante.
- Impression de facture : n°, client, SIRET vendeur, échéance `16/11/2026`, « Pénalités de retard : 10 % », « Indemnité forfaitaire de recouvrement : 40 € », montants, assurance, pied de page : tous présents.
- **La rentabilité comptait les factures brouillon dans le CA : 39 801,26 € affichés pour 19 504,63 € émis (B25, corrigé).** Après correctif : CA, main-d'œuvre et achats affichés = base.
- Clôture : chantier « terminé ». Les factures encore ouvertes restent visibles. La date de fin réelle n'est pas renseignée automatiquement (B26, P3).

**Facturation avancée (module bêta, activé pour ALSACE TEST BTP uniquement par une ligne `entreprise_feature_flags`, qui simule l'activation par la plateforme) :**

- Acompte 30 % : **6 700,69 € au lieu de 6 499,67 €, remise globale oubliée (B19, corrigé)**.
- Avoir de 10 % lié à l'acompte : montant négatif correct après correctif ; le reste dû à l'écran est diminué.
  - **L'encaissement de l'acompte complet restait accepté malgré l'avoir (B20, corrigé).**
  - **L'avoir imprimé ne citait pas la facture rectifiée (B21, corrigé : « Avoir sur facture n° … »).**
- Garde-fou de dépassement sur les acomptes (30 % + 60 % + 80 % > 100 %) : refusé.
- **Situation à 60 % après un acompte de 30 % : facturée 10 917,41 € HT, l'acompte n'est pas déduit (90 % du marché facturé pour 60 % d'avancement). La facture de situation n'est pas plafonnée (B22, P1 bêta, ouvert).**
- **La retenue de garantie de 5 % (545,87 €) est calculée mais ni imprimée ni déduite du net à payer (B23, P1 bêta, ouvert).**

## Multi-utilisateurs et permissions

221 contrôles significatifs : 220 PASS.

- 132 contrôles écran × rôle : l'accès obtenu est comparé à la configuration du poste en base.
- 37 attentes métier explicites.
- 6 contrôles de données sensibles affichées.
- 33 sondes API/RLS, plus le multi-tenant et l'accès anonyme.

### Matrice écran × rôle (accès obtenu)

| Écran | Gérant | Conducteur | Chef chantier | Comptable | Salarié (Ouvrier) | Accès limité |
|---|---|---|---|---|---|---|
| `/dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/clients` | ✅ | ✅ | ✅ | ✅ | ⛔ | ✅ |
| `/clients/nouveau` | ✅ | ✅ | ✅ | ✅ | ⛔ | ✅¹ |
| `/chantiers` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/chantiers/nouveau` | ✅ | ✅ | ✅ | ✅ | ✅¹ | ✅¹ |
| `/devis` | ✅ | ✅ | ⛔ | ✅ | ⛔ | ⛔ |
| `/devis/nouveau` | ✅ | ✅ | ⛔ | ✅ | ⛔ | ⛔ |
| `/factures` | ✅ | ✅ | ⛔ | ✅ | ⛔ | ⛔ |
| `/prestations` | ✅ | ✅ | ⛔ | ✅ | ⛔ | ⛔ |
| `/planning` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/pointage` | ✅ | ⛔ | ✅ | ✅ | ✅ | ✅ |
| `/pointage/gestion` | ✅ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| `/employes` | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| `/employes/nouveau` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| `/depenses` | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| `/fournisseurs` | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ |
| `/rentabilite` | ✅ | ✅ | ⛔ | ✅ | ⛔ | ⛔ |
| `/tresorerie` | ✅ | ✅ | ⛔ | ✅ | ⛔ | ⛔ |
| `/exports` | ✅ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| `/parametres` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| `/parametres/acces` | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| `/plateforme` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |

¹ La page s'ouvre en mode consultation : bandeau, formulaire masqué. La création est refusée par le proxy et par la RLS (vérifié par POST et par l'API). Une page « nouveau » accessible en lecture seule est une impasse UX mineure.

### Le salarié ne voit pas

- **IBAN :** aucune ligne de `coordonnees_bancaires` par l'API, rien à l'écran (un RIB fictif chiffré a été créé pour le test).
- **Coûts internes :**
  - à l'écran, sur la fiche chantier : aucun budget, aucun prix ni aucun montant de devis ;
  - aucun coût horaire de collègue sur 5 écrans ;
  - **mais par l'API, `employes.cout_horaire` et `taux_horaire` de 4 collègues sur 5 sont lisibles (B28, P1 ouvert).**
- **Données RH :** pointages des collègues invisibles ; bulletins de paie et journal d'activité : 0 ligne.
- **Paramètres plateforme :** `/parametres`, `/parametres/acces` et `/plateforme` sont refusés ; l'export comptable et l'impression de devis ou de facture aussi.

### Écritures refusées par la base (jeton de l'utilisateur, appel direct de l'API)

- Escalade de privilèges : se mettre au poste Gérant ; s'ajouter `gerer_utilisateurs` ; appeler `enregistrer_permissions_poste`.
- Modifier le SIRET de l'entreprise. Créer un client (salarié, accès limité). Modifier un chantier (accès limité).
- Créer un pointage au nom d'un collègue ; valider son propre pointage ; modifier ses heures validées ou son coût horaire.
- **Après correctif B27 :**
  - modifier le TTC d'une facture émise : avant, le gérant et le comptable passaient 7 964,33 € à 1 € ;
  - renuméroter une facture : avant, la facture devenait `FAC-2026-999` ;
  - changer les prix d'un devis accepté.

  Les données ont été restaurées à l'identique.
- Cloisonnement entre entreprises : 0 ligne lue sur 9 tables, 0 modification, RPC refusée. Accès anonyme : 0 ligne, mise à jour des compteurs refusée.

## Erreurs utilisateur

| Cas | Résultat |
|---|---|
| Double clic (devis, paiement, arrivée de pointage) | 1 enregistrement (paiement : après correctif B17) |
| Deux clics avec 3 s de latence réseau | **2 clients créés avant correctif B29** ; 1 après (garde globale de soumission) |
| Rafraîchir après création | pas de doublon |
| Retour navigateur après création | pas de doublon |
| Formulaire incomplet | client sans nom refusé (B02) ; devis sans client refusé |
| Upload invalide | exécutable et fichier vide refusés (documents), PDF refusé (logo) ; texte déclaré PNG accepté (B03) |
| Date invalide | `2026-02-30` refusée ; échéance antérieure à l'émission refusée (B30) ; chantier fin < début refusé (B07) ; pointage futur refusé |
| Montant négatif | devis, dépense, paiement, prestation, budget de chantier (B31) refusés |
| Suppression liée (API) | client, chantier, employé, fournisseur, facture émise et payée, devis facturé : tous refusés |
| Hors ligne au pointage | aucun message explicite (B32, P3) |

## Mobile

Viewports 375, 390, 768, 1024 et 1440 px. Parcours terrain du salarié, du chef et du gérant : 65 contrôles, 64 PASS.

- Aucun débordement horizontal, sauf un bouton de « Mon espace » à 768 px (P3).
- Le bouton « Pointer l'arrivée » est visible sans défilement et mesure au moins 44 px à 375 et 390 px.
- Le menu mobile s'ouvre pour chaque rôle.

## Accessibilité pratique

- OK : `lang="fr"`, intitulé sur tous les boutons et liens, focus visible au clavier, formulaire client atteint et soumis au clavier (Tab, Entrée), confirmations de suppression natives donc accessibles au clavier.
- À corriger (P2/P3, ouverts) :
  - libellés visibles mais **non associés** aux champs dans l'éditeur de devis (8/15), la fiche facture (6/6), les paramètres (21/51), les dépenses (9/15) et l'upload de document ;
  - le sélecteur de poste d'*Accès et rôles* n'a pas de libellé ;
  - les messages d'erreur ne sont pas annoncés (ni `role="alert"` ni région `aria-live`).

## Cohérence des données (UI == DB)

| Donnée | Vérification | Résultat |
|---|---|---|
| Total devis | 5 lignes × 3 TVA × remises : UI = DB = calcul indépendant ; puis 72 devis en endurance | PASS, 0 écart |
| TVA | arrondi au centime, TTC = HT + TVA | PASS |
| Total facture | facture = devis remisé | PASS après B16 (seule FAC-2026-001, émise avant correctif, reste à 7 964,33 €) |
| Paiement | montant payé = somme des paiements ≤ TTC net d'avoirs ; statut cohérent | PASS après B17 et B20 (FAC-2026-004, d'avant correctif, reste en anomalie) |
| Heures | « Mes heures » et « Total par employé » = base hors rejetés | PASS après B37 |
| Rentabilité | CA émis, main-d'œuvre (h × coût), achats | PASS après B25 |
| Échéances | émission + délai du client (45 j), affichée et imprimée `16/11/2026` | PASS |
| Numérotation | FAC 99 numéros et DEV 69 numéros continus, sans doublon ; brouillons jetés sans numéro | PASS |

## PDF

PDF générés par Chromium (`page.pdf`) depuis les pages d'impression ; voir `recette-metier-donnees/preuves/`.

| Document | Vendeur | Client | N° | Dates | Montants | TVA | Pied | Pagination |
|---|---|---|---|---|---|---|---|---|
| Devis D1 | ✅ | ✅ (SIRET) | ✅ | ✅ (après B06) | ✅ | total seulement (B08) | ✅ assurances + texte | 1 p. |
| Devis 60 lignes | ✅ | ✅ | ✅ | ✅ | ✅ | total seulement | ✅ | 4 p., sans « page x/y » |
| Facture F1 | ✅ | ✅ | ✅ | ✅ échéance | ✅ | total seulement | ✅ pénalités 10 %, indemnité 40 € | 1 p. |
| Avoir | ✅ | ✅ | ✅ | ✅ | ✅ négatif | total seulement | ✅ | référence de la facture rectifiée après B21 |
| Facture de situation (bêta) | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | retenue de garantie et net à payer absents (B23) |

Aucune mention légale non décidée n'a été ajoutée. La ventilation de la TVA par taux et la numérotation des pages restent à arbitrer.

## Endurance

6 cycles par l'API, sous l'identité du gérant, du salarié et du chef : mêmes RPC, RLS et déclencheurs que l'application.

**Volumes cumulés :** 60 chantiers, 60 devis, 90 factures émises, 30 brouillons supplémentaires, ~130 paiements (dont partiels), 300 pointages oubliés. Environ 3 s par cycle, 0 erreur technique.

**Dérives détectées puis corrigées :**

- refacturation illimitée d'un devis (B34) : 31 devis facturés au-delà de leur montant, par exemple 163 825,56 € pour un devis de 54 608,52 € ;
- 48 h par jour et par salarié (B35).

**Après correctifs, 2 cycles supplémentaires :** 0 écart sur les totaux de devis, facture = devis, paiements ≤ TTC net d'avoirs, statuts, numérotation, absence de doublon de pointage et rentabilité. Les refacturations sont refusées 20/20 et le plafond journalier est vérifié (3 × 8 h acceptés, le 4ᵉ refusé).

## Bugs

Format : reproduction · impact · preuve · cause probable · statut.

### P0

**B04 — Création et modification de chantier impossibles pour tous les rôles**

- Reproduction : `/chantiers/nouveau`, enregistrer en tant que gérant.
- Impact : aucun chantier ne peut être créé, ce qui bloque tout le parcours chantier, planning et pointage.
- Preuve : `new row violates row-level security policy for table "chantiers"`.
- Cause : la migration `20260715000081` a supprimé la politique permissive `FOR ALL` « membres accèdent aux chantiers ». Il ne reste en écriture que les politiques RESTRICTIVES `role_gestion_*`, et PostgreSQL refuse toute commande sans politique permissive.
- Statut : **corrigé**, migration `20261002000185` (base permissive limitée aux membres actifs ; `gerer_chantiers` reste exigé). **À confirmer en production :** vérifier `pg_policy` sur `chantiers`.

### P1

**B01 — Base reconstruite à neuf inutilisable**

- Reproduction : `supabase db reset` avec une CLI récente.
- Impact : le gérant boucle sur l'onboarding ; `service_role` n'a accès à aucune table.
- Cause : les premières migrations reposaient sur l'exposition automatique des tables (droits implicites `anon`, `authenticated`, `service_role` et `EXECUTE` à `PUBLIC`). Les nouveaux projets Supabase et la CLI locale ne l'appliquent plus ; l'option `auto_expose_new_tables` disparaît le 2026-10-30.
- Preuve : 26 tables sans droit `authenticated` ; `permission denied for function est_membre_actif`.
- Statut : **corrigé**, migration `20261002000184`.
  - Droits complets pour `service_role`.
  - Droits CRUD pour `authenticated` sur 16 tables métier protégées par RLS.
  - `EXECUTE` sur `est_membre_actif` et `entreprise_sans_membres`.
  - **Aucun droit pour `anon`.** L'activation de l'exposition automatique, refusée car elle ouvrait tout à `anon`, n'a pas été utilisée.
  - À vérifier en production : sans effet si les droits implicites y existent.

**B05 — Devis à montant négatif**

- Reproduction : quantité −2, ou remise de ligne 150 %.
- Impact : devis à −240 € et −60 € enregistrés.
- Statut : **corrigé**, `src/app/actions/devis.ts` (quantité ≥ 0, remises 0–100 %, TVA de la liste, total ≥ 0 ; une ligne de remise à prix négatif reste possible).

**B10 — Lacune produit V3**

- Constat : acomptes, situations, avoirs et relances d'impayés n'existent que dans *Facturation avancée* et *CRM*, modules bêta masqués par défaut.
- Impact : l'entreprise type ne peut pas facturer d'acompte ni émettre d'avoir dans le produit commercial.
- Statut : **ouvert**, décision produit.

**B16 — Facture depuis devis : remise globale ignorée**

- Constat : 7 964,33 € facturés au lieu de 7 725,40 €.
- Cause : `creer_facture_depuis_devis` copie les lignes, et les factures n'ont pas de remise globale.
- Statut : **corrigé**, migration `20261002000187` (remise combinée par ligne, totaux identiques au devis).

**B17 — Double clic sur paiement : double encaissement**

- Cause : contrôle « lecture puis insertion » sans verrou.
- Statut : **corrigé**, migration `20261002000188` (verrou `FOR UPDATE` de la facture, anti-doublon 30 s, plafond du reste dû ; Stripe exempté).

**B19 — Facturation avancée : remise globale ignorée**

- Constat : acompte, avoir et situation ignorent la remise globale.
- Statut : **corrigé**, migration `20261003000189`.

**B22 — Situation : acomptes non déduits, aucun plafond (bêta)**

- Constat : 30 % + 60 % facturés pour 60 % d'avancement.
- Statut : **ouvert**. La présentation de la déduction est une règle métier à arbitrer.

**B23 — Retenue de garantie absente (bêta)**

- Constat : ni imprimée, ni déduite du net à payer de la facture de situation.
- Statut : **ouvert**.

**B24 — Facture émise annulable sans avoir**

- Statut : **corrigé**, transitions UI et migration `20261003000190`.

**B27 — Documents émis modifiables par l'API**

- Constat : TTC d'une facture émise, numéro, prix d'un devis accepté.
- Statut : **corrigé**, migration `20261003000191`.

**B28 — Fuite de coûts internes par l'API (confidentialité)**

- Constat : un salarié lit `cout_horaire` et `taux_horaire` des collègues ; la politique `employes` est « membre actif » sur toutes les colonnes.
- Statut : **ouvert**.
- Correctif proposé : le modèle déjà appliqué aux prix du stock (migration 108), c'est-à-dire révocation de la colonne et RPC contrôlée par `voir_cout_interne_employe`. Cela demande d'adapter les lectures de `employes.cout_horaire` dans l'application : non trivial, non fait.

**B34 — Refacturation illimitée d'un devis**

- Statut : **corrigé**, migration `20261003000192` et fiche devis.

### P2

| Bug | Statut |
|---|---|
| B02 client sans nom ni société | **corrigé** |
| B08 TVA non ventilée par taux sur les documents | ouvert, mention à arbitrer |
| B12 pointages oubliés en double ou en chevauchement le même jour | **corrigé** (migration 186) |
| B13 validation des pointages oubliés cachée dans une section repliée ; carte sans motif, statut ni anomalie ; date ISO | ouvert |
| B15 pointage désactivé par défaut pour le rôle Ouvrier | ouvert, choix produit |
| B18 aucun passage automatique « en retard » | ouvert |
| B20 encaissement au-delà du reste net d'avoir | **corrigé** (migration 189) |
| B21 avoir sans référence de la facture rectifiée | **corrigé** |
| B25 CA de rentabilité incluant les brouillons ; copilote ignorant les avoirs ; alertes « à encaisser » sur brouillons et avoirs | **corrigé** |
| B29 double soumission systémique (212 formulaires sans état d'envoi) | **corrigé** (`GardeDoubleSoumission`) |
| B30 échéance antérieure à l'émission | **corrigé** |
| B35 48 h par jour déclarées sur plusieurs chantiers | **corrigé** (migration 193) |
| B37 heures rejetées comptées dans les totaux | **corrigé**. Reste à arbitrer : les pointages « à vérifier » comptent-ils ? (chantier et rentabilité : validés seulement ; pointage : hors rejetés) |
| Accessibilité : libellés non associés, erreurs non annoncées | ouvert |

### P3

| Bug | Statut |
|---|---|
| B03 logo contrôlé sur le type MIME déclaré uniquement | ouvert |
| B06 dates ISO sur les documents | **corrigé** |
| B07 chantier avec fin avant début | **corrigé** |
| B09 prospect non converti en client à l'acceptation | ouvert |
| B14 16:00 → 08:00 interprété en poste de nuit (anomalie critique signalée) | à confirmer |
| B26 « terminé » sans date de fin réelle | ouvert |
| B31 budget prévisionnel négatif | **corrigé** |
| B32 hors ligne : aucun message au pointage | ouvert |
| B33 devis accepté non facturé supprimable par l'API | ouvert |
| B36 facture brouillon non supprimable, les brouillons s'accumulent | ouvert |
| PDF sans « page x/y » ; bouton qui déborde à 768 px ; fichier copie `src/app/(app)/outillage/[id]/page 2.tsx` | ouvert |

## Audit des données de production à prévoir (lecture seule)

Ces requêtes repèrent les documents émis avant les correctifs. Elles n'ont **pas** été exécutées sur la production.

```sql
-- B16 : factures simples différentes de leur devis remisé
select f.numero, f.montant_ttc, d.numero devis, d.montant_ttc
from factures f join devis d on d.id = f.devis_origine_id
where f.type = 'simple' and d.remise_globale > 0 and abs(f.montant_ttc - d.montant_ttc) > 0.01;

-- B34 : devis facturés au-delà de leur montant
select d.numero, d.montant_ttc, sum(f.montant_ttc) facture
from devis d join factures f on f.devis_origine_id = d.id and f.statut <> 'annulee'
group by d.id having sum(f.montant_ttc) > d.montant_ttc + 0.01;

-- B17/B20 : encaissements au-delà du TTC net d'avoirs
select f.numero, f.montant_ttc, f.montant_paye,
  (select coalesce(sum(a.montant_ttc), 0) from factures a where a.facture_origine_id = f.id and a.type = 'avoir' and a.statut <> 'annulee') avoirs
from factures f
where f.montant_paye > f.montant_ttc + (select coalesce(sum(a.montant_ttc), 0) from factures a where a.facture_origine_id = f.id and a.type = 'avoir' and a.statut <> 'annulee') + 0.005;

-- B35 : journées > 24 h
select employe_id, date, sum(heures_normales + heures_supplementaires)
from pointages where verification_statut <> 'rejete'
group by 1, 2 having sum(heures_normales + heures_supplementaires) > 24;

-- B04 : politiques d'écriture sur chantiers
select polname, polcmd, polpermissive from pg_policy where polrelid = 'public.chantiers'::regclass;
```

## Correctifs livrés (branche `claude/loving-heisenberg-ygkjck`)

**Migrations** `20261002000184` à `20261003000193` :

- 184 : droits explicites ;
- 185 : écriture des chantiers ;
- 186 : doublon de pointage oublié ;
- 187 : remise du devis reportée sur la facture ;
- 188 : garde-fous des paiements ;
- 189 : remise en facturation avancée et avoirs dans le reste dû ;
- 190 : facture émise non annulable ;
- 191 : documents émis immuables ;
- 192 : devis facturé une seule fois ;
- 193 : plafond journalier de pointage.

**Code :**

- `actions/clients.ts`, `actions/devis.ts`, `actions/chantiers.ts`, `actions/factures.ts`, `actions/rentabilite.ts` ;
- `lib/factures.ts`, `lib/rentabilite.ts`, `lib/ai/copilote.ts` ;
- `components/DocumentImprimable.tsx`, `components/GardeDoubleSoumission.tsx` (nouveau) ;
- pages `devis/[id]`, `dashboard`, `rentabilite`, `pointage`, `pointage/gestion`, `planning`, `imprimer/factures/[id]`.

**Contrôles après correctifs :**

- `npm run typecheck`, `npm run lint` (0 erreur, 25 avertissements déjà présents), `vitest` 104/104, `verify:migrations` (188), `verify:secrets` (aucun secret), `next build` : OK ;
- pgTAP : 6 suites, 53 tests passés après les correctifs.

Le bilan PASS/FAIL ci-dessus agrège les résultats de chaque étape. Faute de temps, l'ensemble des scripts n'a pas été rejoué de bout en bout sur une base vierge après le dernier correctif.

## Rejouer la recette

```bash
npm ci && npm i --no-save playwright pg
npx supabase start            # local uniquement ; puis npx supabase db reset --local
# .env.local : URL/clé anon/service_role locales (npx supabase status)
npm run build && npx next start -H 127.0.0.1 -p 3000
node scripts/recette-metier/01-creation-entreprise.mjs   # puis 02 → 16 dans l'ordre
```

- Les scripts refusent toute URL d'application, de base ou de Supabase non locale.
- Les résultats sont écrits dans `RECETTE_OUT` (par défaut `/tmp/claude-0/recette`).
- `11-permissions.mjs` doit être lancé avec `node --experimental-strip-types`.

## Limites

- Stripe, Powens, OpenAI, email réel, push et Sentry n'ont pas été testés (aucune clé ; flux sortants bloqués).
- L'envoi d'email est simulé par le lien `mailto`.
- La facturation avancée a été activée en base pour une seule entreprise, pour la tester.
- Le test de pointage antidate une arrivée en base pour simuler une journée de 8 h.
- L'audit WCAG n'est pas complet : contrôles pratiques automatisés seulement.
- Production non consultée : les causes liées à l'état de la base (B01, B04) restent à confirmer en production.
