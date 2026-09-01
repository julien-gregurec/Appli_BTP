# Go-live commercial ELSATIA — checklist

Checklist de passage au premier client réel payant. À utiliser comme liste de contrôle avant toute activation Stripe Live — ne remplace pas `docs/organisation/STRIPE_LIVE_CHECKLIST.md` (bascule technique Test → Live), qui reste la référence pour cette partie.

Il n'existe qu'**un seul GO commercial public final**, décision unique et cohérente entre ce document, `docs/organisation/CHECKLIST_LANCEMENT.md`, `docs/organisation/REGISTRE_CENTRAL.md` et `docs/organisation/P15_GO_LIVE_CHECKLIST.md`.

## Prérequis administratifs et juridiques

- [ ] 🔴 **Régime fiscal et social de l'EI (micro *ou* réel) arbitré** par Julien avec un expert-comptable — **préalable bloquant** à l'immatriculation et à Stripe Live. Aucune préférence exprimée. Voir `CHECKLIST_LANCEMENT.md` § 3.
- [ ] Formalité INPI validée (SIREN/SIRET reçus) — **en attente au 21-08-2026**, voir `docs/organisation/P14C_DOSSIER_IMMATRICULATION_EI.md`. Forme de lancement = **entreprise individuelle (EI)** ; le régime micro-entrepreneur n'est **pas** arbitré (ne pas confondre forme EI et régime micro).
- [ ] Compte bancaire dédié ouvert, IBAN disponible — rendez-vous préparé pour le 27-08-2026, voir `docs/organisation/RDV_BANCAIRE_PREPARATION.md`.
- [ ] Documents juridiques finalisés avec SIREN/SIRET/régime de TVA définitif (8 documents `docs/juridique/*.md` + `elsatia-site/src/content/legal.ts`).
- [ ] Relecture avocat effectuée (dossier de synthèse déjà préparé, voir `docs/organisation/P14_FINALISATION_JURIDIQUE_EI.md`).

## Marque ELSATIA (maj 2026-09-01)

- [ ] Dossier INPI **revérifié après le 21 octobre 2026** (fin du délai d'opposition).
- [ ] **Aucune opposition ni notification bloquante connue** de l'INPI.
- [ ] Formulations juridiques publiques conformes (« marque déposée », jamais « marque enregistrée » ni ® avant l'enregistrement définitif) — voir `docs/organisation/CHECKLIST_LANCEMENT.md` § 3bis.

## Interface — refonte UI-V2 (maj 2026-09-01)

- [ ] **Interface UI-V2 validée par Julien** (direction, puis maquette finale) — cf. `docs/organisation/ELSATIA_UI_V2_REFONTE.md`.
- [ ] Tests **bureau, tablette et mobile** passés sur l'interface V2.
- [ ] **Tests de non-régression** : aucune fonctionnalité ni permission perdue après la refonte.
- [ ] **Anciennes captures commerciales remplacées** (site + App Store / Google Play) par des captures de l'interface V2.

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

## Présence en ligne (si retenue pour le lancement — maj 2026-09-01)

Prérequis de **préparation commerciale**, **pas** un prérequis technique au fonctionnement de l'application.

- [ ] Identifiant social officiel choisi et réservé (préférence `@elsatiafr`) — cf. `docs/organisation/CHECKLIST_LANCEMENT.md` § 10.
- [ ] Comptes Facebook / Instagram / TikTok / LinkedIn **créés et sécurisés** (authentification forte, moyens de récupération enregistrés) si les réseaux sont utilisés au lancement.
- [ ] Page LinkedIn entreprise ELSATIA en ligne.

## Étapes commerciales

- [ ] Premier prospect identifié et qualifié — `docs/commercial/KIT_PROSPECTION_ELSATIA.md`.
- [ ] Premier client réel accompagné du prospect au premier usage — `docs/commercial/PREMIER_CLIENT_CHECKLIST.md`.
- [ ] **GO commercial public final** prononcé — décision **unique** et cohérente avec `CHECKLIST_LANCEMENT.md`, `REGISTRE_CENTRAL.md` et `P15_GO_LIVE_CHECKLIST.md`, une fois **tous** les prérequis ci-dessus validés + la revérification INPI post-21-10-2026 sans opposition.

## Ce qui reste explicitement bloqué au 21-08-2026

Tant que le retour INPI et le rendez-vous bancaire ne sont pas finalisés, restent bloqués :
- Activation Stripe Live.
- KYC Stripe.
- Ouverture/finalisation du compte bancaire.
- Finalisation juridique définitive (SIREN/SIRET dans les documents).
- Tout passage payant réel d'un client.

Ces blocages sont volontaires et ne doivent pas être contournés — voir les garde-fous du lot C4 et les lots précédents (P14, P14C, C1-E).
