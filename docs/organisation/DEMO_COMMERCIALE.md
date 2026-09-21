# Démonstration commerciale ELSATIA Gestion Pro

Document opérationnel pour présenter ELSATIA à un prospect avec un compte de démonstration propre, isolé et réinitialisable. Aucun mot de passe n'est consigné ici.

## Identification de l'entreprise démo

- **Nom affiché** : Atelier Bâtiment Lyonnais (entreprise BTP fictive, aménagement intérieur — cohérente avec les adresses Lyon des données)
- **Marqueur technique unique** : `entreprises.reference_interne = 'DEMO-18M'`
- **Offre** : Entreprise (annuel) — expose l'ensemble des modules commercialisables listés en P10, y compris l'assistant IA et l'IA devis (actifs en Production depuis AI-PROD-ACTIVATION-V1/IA-DEVIS-PROD-ACTIVATION-V1), hors Boutique/Powens (toujours désactivés partout, y compris en démo — voir « Ce qu'il ne faut jamais faire »)
- **Historique** : 18 mois d'activité simulée (permet des graphiques de rentabilité et un planning déjà remplis, plus crédible qu'une entreprise vide)

Cette entreprise préexistait à P11 sous une forme différente (créée par un script `creer_entreprise_demo_18_mois.sql` déjà présent dans le dépôt, référencé par l'outil interne `/plateforme/roles-demo`). P11 a corrigé un bug bloquant du script (voir plus bas), l'a exécuté réellement en Production, renommé et associé à l'offre Entreprise.

## Données présentes

| Catégorie | Volume | Détail |
|---|---|---|
| Postes / rôles | 7 | Administrateur, Conducteur de travaux, Chef de chantier, Chef d'équipe, Ouvrier, Comptable, Responsable RH — droits distincts par poste |
| Employés | 12 | Prénoms/noms français génériques, emails `@example.test` (domaine réservé aux tests, RFC 2606, jamais délivrable), cartes BTP fictives, habilitations (CACES, SST, habilitation électrique, travail en hauteur) |
| Clients | 30 | Mélange particuliers / professionnels, adresses Lyon |
| Chantiers | 30 | États variés : facturé, terminé, en cours, accepté |
| Devis | 108 | Répartis sur 18 mois, statuts accepté / envoyé / refusé |
| Factures | 72 | Émises depuis les devis acceptés, avec paiements partiels ou complets |
| Pointages | 2 340 | 78 semaines, heures normales + heures supplémentaires ponctuelles |
| Fournisseurs | 8 | Enseignes BTP génériques (Würth, Point.P, Kiloutou...) |
| Articles de stock | 30 | Plaques, rails, montants, visserie, enduits... |
| Véhicules | 8 | Utilitaires Renault Master/Trafic |
| Outillage | 24 | Perforateurs, visseuses, lasers, scies, aspirateurs de chantier |

Toutes les notes internes portent le préfixe `[DEMO 18M]` ; toutes les références utilisent les préfixes `DEMO-`, `DEV-DEMO-`, `FAC-DEMO-`. Aucune donnée réelle, aucune vraie adresse email.

## Compte de connexion

- **Email** : `julien.gregurec+demo-elsatia@gmail.com` (alias Gmail dédié, distinct du compte administrateur réel, adresse contrôlée par Julien)
- **Entreprise rattachée** : `Atelier Bâtiment Lyonnais` (`DEMO-18M`) uniquement, poste **Administrateur**, statut `actif`
- **Mot de passe** : généré aléatoirement à la création, jamais affiché ni consigné nulle part (ni ici, ni dans un log, ni dans le dépôt). Pour se connecter, utiliser la fonction « mot de passe oublié » sur `/login` avec l'adresse ci-dessus si le mot de passe n'est pas connu.
- **Confirmation email** : requise par la configuration Auth Production. Un email de confirmation a été envoyé à l'adresse ci-dessus lors de la création ; le lien doit être ouvert une fois avant la première connexion.

## Parcours de démonstration recommandé (10–15 min)

1. **Dashboard** — vue d'ensemble : chantiers en cours, activité des 6 derniers mois, encaissements.
2. **Client** — ouvrir une fiche client, montrer l'historique (devis, chantiers, factures liés).
3. **Chantier** — ouvrir un chantier « en cours », montrer l'équipe affectée et l'avancement.
4. **Planning** — montrer une semaine chargée avec plusieurs employés sur plusieurs chantiers.
5. **Pointage** — montrer les heures validées sur un chantier.
6. **Devis** — ouvrir un devis accepté, montrer les lignes et le calcul TTC.
7. **PDF** — télécharger le PDF du devis (rendu serveur réel, identique à l'impression).
8. **Email** — montrer le bouton d'envoi (ne pas déclencher un envoi réel pendant une démo prospect — voir garde-fous).
9. **Facture** — montrer la facture issue de ce devis, son statut de paiement.
10. **Rentabilité** — montrer le module rentabilité avec des chiffres déjà significatifs (18 mois d'historique).
11. **Abonnement** — montrer la page `/abonnement`, l'offre Entreprise, cohérente avec `/tarifs`.

## Scénario prospect à raconter

« Une entreprise reçoit une demande client, crée la fiche client, ouvre le chantier, planifie l'équipe, suit les heures sur le terrain, établit le devis, le transforme en facture une fois accepté, et suit la rentabilité du chantier — le tout dans un seul outil. »

Toutes les données du compte démo soutiennent ce scénario (chantiers à tous les stades, devis dans les trois statuts, factures avec et sans paiement complet).

## Isolation

L'entreprise démo est strictement isolée de l'entreprise réelle `elsatia` (RLS multi-tenant déjà validée en P4-P6, revalidée pour ce cas précis en P11) : aucune visibilité croisée sur les clients, chantiers, devis, factures, documents, PDF ou fichiers Storage. Le marqueur `reference_interne='DEMO-18M'` est unique et ne collisionne jamais avec `elsatia` (`reference_interne='ENT-001'`).

## Procédure de réinitialisation

Script : `supabase/production/reset_entreprise_demo_18_mois.sql`

```bash
cd /Users/juliengregurec/Projects/elsatia-main
# relier explicitement le workspace au projet Supabase Production avant d'exécuter :
# supabase/.temp/project-ref doit contenir exhvuzegsefmoguxoiak (jamais le projet Preview)
npx supabase db query --file supabase/production/reset_entreprise_demo_18_mois.sql --linked
npx supabase db query --file supabase/production/creer_entreprise_demo_18_mois.sql --linked
```

Le premier script vide intégralement les données métier de l'entreprise `DEMO-18M` (clients, chantiers, devis, factures, pointages, stock, véhicules, outillage...) sans jamais toucher `elsatia`. Le second recrée le jeu de données de référence à l'identique (script idempotent). Toujours exécuter les deux dans cet ordre, depuis le workspace `elsatia-main` (relié au projet Supabase Production `exhvuzegsefmoguxoiak` — les anciens chemins `liria-codex`/`elsatia-production-bootstrap` référencés ici par le passé n'existent plus, ROADMAP-CLEANUP-V1).

### Garde-fous intégrés au script de reset

- Cible exclusivement l'entreprise dont `reference_interne='DEMO-18M'` — jamais par nom (modifiable), jamais par ID en dur.
- Refuse de s'exécuter si aucune entreprise `DEMO-18M` n'existe.
- Vérifie explicitement que l'entreprise ciblée n'est pas `ENT-001` (elsatia réelle) avant toute suppression.
- Les factures démo sont repassées en `brouillon` avant suppression de leurs lignes, pour respecter le déclencheur `trg_lignes_factures_brouillon_only` (garde-fou d'intégrité réel de l'application, jamais désactivé).

## Limites connues

- Le compte démo est sur l'offre Entreprise : les modules Boutique et Powens restent invisibles (toujours désactivés partout en Production). L'IA (assistant + IA devis) est active en Production depuis AI-PROD-ACTIVATION-V1/IA-DEVIS-PROD-ACTIVATION-V1 et donc disponible sur le compte démo comme sur tout compte réel — représente fidèlement ce qu'un client peut réellement acheter au lancement.
- Recette mobile/tablette/desktop réalisée en P11 (voir REGISTRE_CENTRAL.md) — signaler tout écart visuel constaté lors d'une future démo réelle.
- Les 18 mois de données sont figés au moment du (re)seed ; après plusieurs mois d'usage réel de l'application, cet historique cessera de paraître « récent » (les dates sont relatives à `current_date` au moment de l'exécution du script, donc un reset les recale automatiquement).

## Ce qu'il ne faut jamais faire

- Ne jamais utiliser le compte administrateur réel `elsatia` pour la démo.
- Ne jamais envoyer un email de devis/facture à une vraie adresse depuis ce compte pendant une démonstration face à un prospect (le bouton d'envoi peut être montré sans être cliqué, ou déclenché uniquement vers une adresse que vous contrôlez, en dehors d'une présentation live).
- Ne jamais activer IA, Boutique ou Powens pour « impressionner » — ce ne serait pas ce que le client achète réellement au lancement.
- Ne jamais utiliser Stripe Live pour démontrer un paiement — Stripe Test uniquement, et seulement si strictement nécessaire.
- Ne jamais exécuter le script de reset sans vérifier au préalable que vous êtes bien connecté au projet Supabase Production (`exhvuzegsefmoguxoiak`) via `--linked` depuis `elsatia-production-bootstrap`.
