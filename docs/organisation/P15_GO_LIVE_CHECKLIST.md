# Checklist GO-Live Stripe (P15)

Checklist courte de bascule Stripe Test → Live. Ne rien cocher tant que l'élément n'est pas réellement vérifié. Référence complète : `P15_STRIPE_LIVE_PREPARATION.md` et `STRIPE_LIVE_CHECKLIST.md` (P13).

**État au 24/08/2026** : aucune case ci-dessous n'est cochée, et c'est l'état réel — rien de ce
qui suit n'a été fait (voir `GO_LIVE_FINAL.md` et `PRE_LIVE_CLEANUP_V1.md`). Le nettoyage
technique/documentaire pré-Live (PRE-LIVE-CLEANUP-V1) est terminé ; les seuls blocages
restants avant de pouvoir cocher la première case sont externes (INPI/INSEE, banque, TVA).

## Administratif (bloquant, externe)

- [ ] INPI/INSEE finalisé (SIREN/SIRET confirmés par écrit)
- [ ] Régime micro-entreprise confirmé
- [ ] TVA confirmée (régime réel déterminé)
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

## Lancement

- [ ] Logs applicatifs propres (aucune erreur Stripe)
- [ ] GO commercial payant annoncé
