# Checklist GO-Live Stripe (P15)

Checklist courte de bascule Stripe Test → Live. Ne rien cocher tant que l'élément n'est pas réellement vérifié. Référence complète : `P15_STRIPE_LIVE_PREPARATION.md` et `STRIPE_LIVE_CHECKLIST.md` (P13).

**État au 24/08/2026** : aucune case ci-dessous n'est cochée, et c'est l'état réel — rien de ce
qui suit n'a été fait (voir `GO_LIVE_FINAL.md` et `PRE_LIVE_CLEANUP_V1.md`). Le nettoyage
technique/documentaire pré-Live (PRE-LIVE-CLEANUP-V1) est terminé ; les blocages restants
avant de pouvoir cocher la première case sont externes (INPI/INSEE, banque, régime fiscal/TVA).

**Maj 2026-09-01** : le **GO commercial public** dépend aussi, en plus de la bascule Stripe
ci-dessous, du suivi de marque INPI (revérification après le 21-10-2026), de la refonte
**UI-V2** validée par Julien et de la présence en ligne — voir la section
« Marque, interface et présence en ligne » ci-dessous et `CHECKLIST_LANCEMENT.md`. Il n'existe
qu'**un seul GO commercial final**, commun à tous ces documents.

## Administratif (bloquant, externe)

- [ ] INPI/INSEE finalisé (SIREN/SIRET confirmés par écrit) — forme = **entreprise individuelle (EI)**
- [ ] 🔴 Régime fiscal et social de l'EI (micro-entrepreneur **ou** réel — **non arbitré** à ce jour) tranché **avec un expert-comptable**, avant l'immatriculation et avant Stripe Live
- [ ] TVA confirmée (découle du régime arbitré)
- [ ] Compte bancaire dédié ouvert
- [ ] IBAN disponible et saisi côté Stripe
- [ ] Juridique final (mentions légales, CGV, CGU finalisées avec les informations officielles)

## Compte Stripe

- [ ] Email du compte Stripe professionnel (`julien@elsatia.fr` ou équivalent)
- [ ] 2FA activée sur le compte Stripe
- [ ] KYC Stripe soumis et validé

## Objets Live

- [ ] 4 Produits Live créés (Mini/Pro/Business/Entreprise)
- [ ] 8 Prices Live créés (mensuel + annuel × 4 offres)
- [ ] Webhook Live créé, 8 événements corrects, secret récupéré

## Déploiement

- [ ] Variables Vercel Production basculées en valeurs Live (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`, `STRIPE_WEBHOOK_ABONNEMENT_SECRET`)
- [ ] Production redéployée avec les nouvelles variables

## Validation réelle

- [ ] Paiement réel unique effectué (recette contrôlée, carte réelle de Julien)
- [ ] Webhook Live reçu et traité sans erreur
- [ ] Abonnement Live actif confirmé côté application
- [ ] Portail client Live vérifié fonctionnel
- [ ] Annulation/remboursement de la recette effectué proprement, aucune trace applicative résiduelle

## Marque, interface et présence en ligne (prérequis d'ouverture publique — maj 2026-09-01)

- [ ] Dossier INPI **revérifié après le 21 octobre 2026** (fin du délai d'opposition).
- [ ] **Aucune opposition ni notification bloquante connue** de l'INPI.
- [ ] Formulations juridiques publiques conformes : « marque déposée », jamais « marque enregistrée » ni le symbole ® avant l'enregistrement définitif.
- [ ] **Interface UI-V2 validée par Julien** (direction puis maquette finale) — cf. `ELSATIA_UI_V2_REFONTE.md`, `CHECKLIST_LANCEMENT.md` § 11.
- [ ] Tests **bureau, tablette et mobile** passés sur l'interface V2.
- [ ] **Tests de non-régression** : aucune fonctionnalité ni permission perdue après la refonte.
- [ ] **Anciennes captures commerciales remplacées** (site + App Store / Google Play) par des captures de l'interface V2.
- [ ] Si des réseaux sociaux sont **retenus pour le lancement** : comptes créés et sécurisés (authentification forte, récupération) — cf. `CHECKLIST_LANCEMENT.md` § 10. *Prérequis de préparation commerciale, pas un prérequis technique au fonctionnement de l'application.*

## Lancement

- [ ] Logs applicatifs propres (aucune erreur Stripe)
- [ ] **GO commercial public final** prononcé — **GO unique**, une seule décision cohérente entre `CHECKLIST_LANCEMENT.md`, `REGISTRE_CENTRAL.md`, ce document et `docs/commercial/GO_LIVE_COMMERCIAL_CHECKLIST.md`. Ne rien annoncer publiquement tant que tous les prérequis ci-dessus (administratif, Stripe, marque/interface/présence en ligne) ne sont pas cochés.
