# ELSATIA Gestion Pro — Fonctions terrain et hors ligne (phase E)

Lot : `ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1` · Base `52d3282` (ledger 278) · 2026-09-09

## 1. Périmètre livré

| Besoin terrain arbitré | État |
|---|---|
| Consultation des chantiers récents | **Socle livré** — magasin `consultation`, écriture sur demande explicite |
| Pointage (arrivée / départ) | **Livré** — file + rejeu idempotent |
| Brouillon de note de frais | **Livré** — file + rejeu idempotent |
| Capture photo | **Existant, inchangé** — `capture=` fonctionne hors ligne, le fichier reste dans le formulaire |
| Préparation des justificatifs | **Partiel** — voir réserve § 6 |
| Documents choisis explicitement | **Socle livré** — magasin `consultation` |

## 2. La décision qui a évité une migration

Le schéma du Train V3 a été interrogé plutôt que supposé. Trois constats l'ont rendue inutile :

1. **`sessions_pointage.id`, `pointages.id` et `notes_frais.id` ont pour défaut
   `gen_random_uuid()`** — donc le client peut fournir l'identifiant. Cet identifiant devient
   à la fois la clé d'idempotence et la clé primaire de la ligne.
2. **`cloturer_session_pointage` accepte déjà `p_depart_at` en paramètre** : l'heure de départ
   est *déjà* fournie par l'appelant. Aucun changement de contrat.
3. **Aucun déclencheur ne réécrit `arrivee_at`**, et `RLS UPDATE = false` sur
   `sessions_pointage` protège les sessions de toute modification hors RPC.

**Traçabilité sans migration** : deux horloges coexistent déjà. `created_at` (serveur, non
falsifiable) et `arrivee_at` / `depart_at` (appareil, instant du geste). L'écart entre les deux
révèle le report. Un pointage transmis quatre heures après l'arrivée se lit sans ambiguïté.

### La migration proposée, et pourquoi elle ne bloque rien

`supabase/proposed/pointage-origine-hors-ligne.sql.proposed` — **hors `supabase/migrations`,
sans numéro de ledger, non appliquée.**

`pointages.origine_pointage` est contraint à quatre valeurs, dont aucune ne signifie « préparé
hors ligne ». Un pointage différé est donc enregistré `gps_complet` : c'est vrai (il porte bien
une position GPS) mais incomplet — cela tait la seule chose qui le distingue. La V1 compense par
une mention en clair dans `commentaire` : lisible par un humain, inexploitable par une requête.

La proposition ajouterait `'hors_ligne_differe'` et une colonne `capture_at`. Elle rendrait le
fait **lisible sans calcul**, ce qui compte pour un contrôle anti-fraude. Trois questions
relèvent du métier et non de la technique — exclusivité avec `arrivee_oubliee`, doublon éventuel
entre `capture_at` et `arrivee_at`, effet sur les exports de paie et
`verifier_pointage_coherence`. C'est pourquoi le fichier s'arrête là.

**Aucune synchronisation n'est classée bloquée.** La V1 fonctionne sans cette migration.

## 3. Architecture

```
  Appareil                                    Serveur
  ────────────────────────────────────       ─────────────────────────────────────
  contrat.ts        (PUR, 50 tests)
     │ états · transitions · idempotence
     ▼
  base-locale.ts    IndexedDB
     │ nom = elsatia:gp:<entreprise>:<utilisateur>
     ▼
  synchronisation.ts ───── POST ───────────► /api/mobile/offline/mutations
     │ ouverture + retour réseau                  │ identité à 3 issues
     │ jamais en tâche de fond                    │ identité déclarée vérifiée
     ▼                                            ▼
  FileHorsLigne.tsx                            client Supabase NORMAL
     état visible · rejeu · abandon              (mêmes RLS que l'écran)
```

### 3.1 Pourquoi le NOM de la base porte l'identité

Une base IndexedDB est indexée par origine, comme un cache de service worker. Une base unique
« elsatia-gp » serait partagée par tous les comptes de l'appareil — et un téléphone de chantier
est partagé.

On aurait pu filtrer chaque lecture sur un champ `entrepriseId`. Ce serait plus fragile : il
suffirait d'**un seul appel qui oublie le filtre** pour que les données d'une entreprise
s'affichent chez une autre, et rien ne le signalerait. Mettre l'identité dans le nom rend
l'erreur **impossible plutôt qu'improbable** : un mauvais compte n'ouvre pas la mauvaise base,
il ouvre une base **vide**.

C'est aussi ce qui rend la purge complète : `deleteDatabase`, et il ne reste rien — pas de
résidu qu'un filtre aurait manqué.

### 3.2 Les trois principes de la route de rejeu

Repris de Réserves, dont le moteur a fait ses preuves. Le **code** n'est pas partagé (§ 5).

1. **Aucun droit nouveau.** La route n'utilise que le client Supabase normal, donc sous les
   mêmes RLS que l'écran. Une permission révoquée entre-temps fait échouer le rejeu.
2. **L'identité déclarée est vérifiée.** Une saisie préparée par A ne part jamais sous B, même
   si la file d'A se retrouvait ouverte dans la session de B. La base l'impose déjà
   (`cree_par_utilisateur_id = auth.uid()` en RLS, `peut_pointer_pour_employe`) ; la route le
   vérifie **en plus**, pour que le refus soit clair et précoce plutôt qu'un refus de RLS opaque
   que l'utilisateur lirait comme une panne.
3. **Le rejeu est normal.** L'identifiant vient de l'appareil et sert de clé primaire :
   rejouer bute sur la clé primaire, ce qui se lit comme un **succès**.

### 3.3 Rejeu et conflit se distinguent sur le nom de la contrainte

C'est le détail qui rend l'idempotence exacte plutôt qu'approximative :

| Contrainte violée | Signification | Issue |
|---|---|---|
| `sessions_pointage_pkey` | Même identifiant : déjà passé | **rejeu** → `synchronise` |
| `sessions_pointage_ouverte_employe_unique` | Une **autre** session est ouverte | **conflit** → arbitrage humain |
| `notes_frais_pkey` | Même identifiant | **rejeu** |

Pour le départ, `cloturer_session_pointage` lève « Le départ a déjà été enregistré » : c'est le
signal de rejeu. Le message « Session introuvable » signifie que l'arrivée qui crée la session
est restée derrière dans la file — ce n'est pas un refus, c'est un « pas encore », et la
mutation retourne en file.

### 3.4 Ce que la table de transitions interdit

Le point important est ce qui est **absent** : rien ne mène de `synchronise` ou de `conflit`
vers `en_attente`.

Sans cela, une reprise maladroite qui remettrait un pointage d'arrivée **acquitté** en file
créerait une **seconde session ouverte** pour le même salarié. Et un conflit « réessayé » comme
une panne réseau tournerait indéfiniment sans jamais aboutir, en masquant le besoin d'arbitrage.

### 3.5 `applique` et `rejeu` mènent au même état

Cœur de l'idempotence : du point de vue de l'appareil, « le serveur vient de l'enregistrer » et
« il l'avait déjà enregistré » sont **le même succès**. Les distinguer ferait rejouer sans fin
une mutation dont la première réponse s'est perdue sur le réseau — exactement le cas que la file
existe pour traiter.

### 3.6 Une panne n'est pas un refus

`indisponible` renvoie la mutation en `en_attente`, pas en `echec`. Marquer un échec exigerait
un geste humain pour une coupure de trois secondes. La route rend d'ailleurs **503 et non 401**
quand le service d'authentification est injoignable : le client doit réessayer, pas demander à
l'utilisateur de se reconnecter.

### 3.7 Reprise à l'ouverture et au retour du réseau — jamais en tâche de fond

`Background Sync` existe sur Android, pas sur iOS. S'en servir donnerait **deux comportements
différents à deux salariés de la même équipe** selon leur téléphone. Une règle unique, même
moins puissante, est préférable — ne serait-ce que parce qu'elle s'explique en une phrase à
celui qui s'en sert.

### 3.8 Une file invisible est pire que pas de file

Un salarié qui a pointé dans un sous-sol veut savoir si c'est parti. Sans réponse, il repointe —
et se retrouve avec deux arrivées, ou avec la conviction que l'application ne marche pas.

`FileHorsLigne` affiche l'état de chaque saisie. Trois choix :

- **Rien ne s'affiche quand la file est vide** — un bandeau « 0 en attente » est du bruit.
- **Le rejeu est un bouton, jamais une boucle** — un réessai automatique sur un refus métier
  (permission révoquée, chantier clos) tournerait sans jamais aboutir.
- **Un conflit ne propose pas « Réessayer »**, seulement « Abandonner » — proposer un bouton
  qui ne peut pas fonctionner est une promesse qu'on ne tient pas.

## 4. Sécurité du stockage local

| Exigence | Réalisation |
|---|---|
| Isolation par entreprise **et** utilisateur | Dans le **nom** de la base, pas dans un filtre |
| Purge à la déconnexion | `localStorage` + `sessionStorage` + caches SW + `deleteDatabase` |
| Refus d'envoi sous une autre identité | Vérifié dans le contrat, dans la route, **et** par les RLS |
| Aucun secret stocké | Le magasin `consultation` ne reçoit que des données métier demandées |
| Horodatage plausible | Refus au-delà de +5 min ou de −30 jours |

### Limite déclarée sur la purge

`indexedDB.databases()` **n'existe pas sur Firefox**. Quand elle manque, l'énumération est
impossible : `purgerBasesLocales()` rend alors `0` — et le dit par sa valeur de retour, plutôt
que de laisser croire à une purge complète. C'est une limite réelle, consignée comme telle.

Sur ce navigateur, les bases d'une session précédente survivent à la déconnexion. Elles restent
inaccessibles à un autre compte (le nom porte l'identité), mais elles occupent de la place.
Firefox mobile est minoritaire sur le terrain ; le point est noté, non résolu.

## 5. Position sur Réserves — code non partagé, principes repris

`apps/reserves/src/lib/offline/` (1 450 lignes, tests inclus) est de grande qualité. Son
`contrat.ts` est pur. La tentation d'en faire un paquet partagé est réelle. Elle est écartée :

1. **Réserves est autonome et sa V6 vient d'être recettée** (`75b5c62`). En extraire le cœur la
   modifierait au bénéfice d'un lot qui ne la concerne pas. Le risque est asymétrique.
2. **Les charges utiles n'ont rien en commun** : réserves de chantier avec photos et annotations
   de plan d'un côté, sessions de pointage GPS et brouillons de notes de frais de l'autre. Une
   abstraction commune serait vide — et une abstraction vide coûte plus cher qu'une répétition
   assumée.
3. **Le lot l'interdit** : « ne généralise pas artificiellement le moteur hors ligne ».

Repris explicitement, et cité dans le code : le vocabulaire d'états et la table de transitions ;
les trois principes de la route de rejeu ; la résolution d'identité **à trois issues** — dont le
défaut qu'elle corrige avait été rencontré par Réserves.

## 6. Réserves ouvertes

1. **Justificatifs photo hors ligne : préparation seulement.** Un fichier capturé hors réseau
   reste dans le formulaire ; il n'est pas versé dans IndexedDB. Stocker des images demande un
   magasin de blobs, une gestion de quota et une purge propre — un lot en soi. En l'état, une
   note de frais préparée hors ligne part **sans** son justificatif, que le salarié joint au
   retour du réseau. **C'est une limite fonctionnelle réelle**, pas un détail.
2. **Consultation hors ligne : socle sans écrans.** Les magasins et les fonctions de lecture et
   d'écriture existent et sont testés, mais aucun écran ne propose encore « emporter ce
   chantier » ou « emporter ce document ». Le geste explicite reste à brancher.
3. **Aucune mesure navigateur.** IndexedDB, la file et le rejeu n'ont été éprouvés que par
   tests unitaires sur les modules purs. Le comportement réel est mesuré en phase H.
4. **`purgerBasesLocales` inopérante sur Firefox** (§ 4).
