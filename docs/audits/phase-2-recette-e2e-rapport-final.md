# Phase 2 — Rapport final de recette E2E

Date : 31 juillet 2026

Environnement : Supabase local isolé `liria-phase2-recette` et application
locale `http://127.0.0.1:3100`

Production, push et déploiement public : non utilisés

## Conclusion

La recette E2E multi-rôles et multi-entreprises est réussie : 27 scénarios sur
27 passent sur Chromium desktop, iPhone/WebKit, Android/Chromium et iPad/WebKit.
Les contrôles couvrent l'authentification, la conservation de session,
l'isolation REST A/B, les routes autorisées/refusées de six rôles, les UUID
inter-tenant manipulés, l'administrateur plateforme et le responsive du
parcours ouvrier.

## Défaut découvert et correction

Une reconstruction complète après les migrations 185 à 190 conservait les
policies RLS des tables `entreprises`, `utilisateurs` et
`utilisateurs_entreprises`, mais aucun privilège DML pour `authenticated`.
PostgreSQL rejetait la lecture du profil avant l'évaluation de la RLS ; après
connexion, les comptes étaient donc renvoyés vers l'onboarding.

La migration
`20260731000192_restaurer_privileges_comptes_entreprises.sql` restaure
uniquement `SELECT`, `INSERT` et `UPDATE` pour `authenticated`, révoque tout
privilège à `anon` et laisse les policies RLS existantes filtrer chaque ligne.
Le numéro 192 préserve le numéro 191 déjà réservé au journal des interventions
plateforme.

Deux assertions pgTAP protègent désormais ces invariants : accès du rôle
authentifié au socle sous RLS et absence totale de privilège anonyme.

## Matrice Playwright

| Domaine | Couverture | Résultat |
|---|---|---:|
| Authentification | connexion, session, déconnexion, erreurs | Réussi |
| Isolation REST | 12 ressources A/B | Réussi |
| Données personnelles | pointages et notes de frais de l'ouvrier | Réussi |
| Rôles | ouvrier, chef d'équipe, conducteur, comptable, dirigeant, admin | Réussi |
| Accès directs | UUID clients, chantiers, devis, factures, notes de frais B depuis A | Réussi |
| Plateforme | entreprise technique C, aucune donnée métier privée A | Réussi |
| Responsive | desktop, iPhone, Android, iPad | Réussi |

Résultat final : **27 tests réussis, 0 échec**, en 22,2 secondes.

## Contrôles complémentaires

- TypeScript : réussi ;
- ESLint : 0 erreur, 3 avertissements historiques `<img>` ;
- Vitest : 29 fichiers, 106 tests réussis ;
- build Next.js : réussi, 115 pages générées ;
- pgTAP surface : 10 assertions réussies ;
- `git diff --check` : réussi.

Les rapports, captures et traces Playwright sont générés localement dans
`playwright-report/` et `test-results/` et sont exclus du suivi Git.

## Reproductibilité

La configuration se trouve dans `playwright.config.ts`. Le fixture métier A/B
reste celui des tests pgTAP ; `scripts/e2e/prepare-local-recipe.sql` ajoute
uniquement la représentation Auth locale, l'entreprise technique de la
plateforme, les entreprises actives et la neutralisation du mode borne dépôt.

Exécution, après démarrage de l'application et chargement du fixture local :

```bash
npm run test:e2e
```

Les variables `E2E_SUPABASE_URL` et `E2E_SUPABASE_ANON_KEY` doivent viser
explicitement Supabase local. Le helper refuse une URL non locale.
