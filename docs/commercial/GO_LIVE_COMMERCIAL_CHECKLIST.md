# Go-live commercial ELSATIA — checklist

Checklist de passage au premier client réel payant. À utiliser comme liste de contrôle avant toute activation Stripe Live — ne remplace pas `docs/organisation/STRIPE_LIVE_CHECKLIST.md` (bascule technique Test → Live), qui reste la référence pour cette partie.

## Prérequis administratifs et juridiques

- [ ] Formalité INPI validée (SIREN/SIRET reçus) — **en attente au 21-08-2026**, voir `docs/organisation/P14C_DOSSIER_IMMATRICULATION_MICRO.md`.
- [ ] Compte bancaire dédié ouvert, IBAN disponible — rendez-vous préparé pour le 27-08-2026, voir `docs/organisation/RDV_BANCAIRE_PREPARATION.md`.
- [ ] Documents juridiques finalisés avec SIREN/SIRET/régime de TVA définitif (8 documents `docs/juridique/*.md` + `elsatia-site/src/content/legal.ts`).
- [ ] Relecture avocat effectuée (dossier de synthèse déjà préparé, voir `docs/organisation/P14_FINALISATION_MICRO_JURIDIQUE.md`).

## Prérequis techniques Stripe (lot P15, pas avant les prérequis ci-dessus)

- [ ] KYC Stripe Live complété.
- [ ] Stripe Live activé.
- [ ] Webhook Live configuré et testé.
- [ ] Paiement réel testé de bout en bout (montant minime, remboursé si besoin).

## Prérequis produit et exploitation

- [ ] Monitoring en place (Sentry Production déjà actif — voir historique lot P6).
- [ ] Support opérationnel — `docs/commercial/SUPPORT_PREMIERS_CLIENTS.md`.
- [ ] Site vitrine en ligne — `elsatia.fr`, déjà en Production.
- [ ] Formulaire Contact opérationnel — validé en C1-E, voir `elsatia-site/docs/C1E_CONTACT_PRODUCTION.md`.
- [ ] Démo prête — `docs/commercial/SCRIPT_DEMO_ELSATIA.md`, compte démo réinitialisable (`docs/organisation/DEMO_COMMERCIALE.md`).

## Étapes commerciales

- [ ] Premier prospect identifié et qualifié — `docs/commercial/KIT_PROSPECTION_ELSATIA.md`.
- [ ] Premier client réel accompagné du prospect au premier usage — `docs/commercial/PREMIER_CLIENT_CHECKLIST.md`.

## Ce qui reste explicitement bloqué au 21-08-2026

Tant que le retour INPI et le rendez-vous bancaire ne sont pas finalisés, restent bloqués :
- Activation Stripe Live.
- KYC Stripe.
- Ouverture/finalisation du compte bancaire.
- Finalisation juridique définitive (SIREN/SIRET dans les documents).
- Tout passage payant réel d'un client.

Ces blocages sont volontaires et ne doivent pas être contournés — voir les garde-fous du lot C4 et les lots précédents (P14, P14C, C1-E).
