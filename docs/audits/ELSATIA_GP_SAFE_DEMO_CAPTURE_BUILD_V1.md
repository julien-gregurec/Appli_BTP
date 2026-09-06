# ELSATIA-GP-SAFE-DEMO-CAPTURE-BUILD-V1

**Date** : 2026-09-06 · **Branche** : `feat/gp-safe-demo-capture-build-v1` · **Base** : `integration/tools-final-prepilot-canonical-v1` (`6d6c8f3`)
**Production touchée** : NON · **Preview touchée** : NON · **Déploiement** : NON

Suite de `ELSATIA_GP_SAFE_DEMO_CAPTURE_ENVIRONMENT_AUDIT_V1.md`. Construit l'environnement local
qui produit les cinq captures de Gestion Pro destinées au site ELSATIA, sans jamais toucher
à une base distante ni à une donnée réelle.

---

## 1. Environnement

Tout se passe sur le Supabase local du poste (conteneur Docker `supabase_db_btp-platform`) :

| | |
|---|---|
| API Supabase | `http://127.0.0.1:54321` |
| Base | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Application | `next dev` sur `http://127.0.0.1:3005` (worktree isolé) |
| Migrations | à jour — `20260905000265` |

Aucune variable ne pointe ailleurs : `.env.development.local` fixe déjà `NEXT_PUBLIC_SUPABASE_URL`
sur `127.0.0.1:54321` et l'emporte sur `.env.local` dans Next.js.

---

## 2. Fichiers livrés

| Fichier | Rôle |
|---|---|
| `supabase/local/creer_entreprise_demo_captures.sql` | Crée l'entreprise fictive `DEMO-CAPT` et l'ensemble de son activité. Idempotent. |
| `supabase/local/compte_demo_captures.sql` | Crée le compte de démonstration local et le rattache à l'entreprise + au salarié terrain. Idempotent. |
| `scripts/seed-demo-captures-local.mjs` | Lanceur : **vérifie que la cible est locale avant toute écriture**, puis exécute les deux SQL dans l'ordre. |
| `scripts/capturer-site-elsatia.mjs` | Produit les 5 captures WebP aux formats exacts, avec contrôle des données affichées. |
| `.gitignore` | Ignore `/captures/` : les images produites ne sont pas versionnées. |

Les SQL vivent dans `supabase/local/` et **non** dans `supabase/production/` : ils sont donc hors
du registre de `scripts/garde-scripts-production.mjs` et ne peuvent partir vers aucun projet distant
par ce chemin.

---

## 3. Corrections des deux défauts identifiés à l'audit

### D1 — `employes.cout_horaire` (bloquant)

La colonne a été supprimée par `20260818000205_securiser_cout_horaire_employe.sql`, qui isole le coût
salarial dans la table dédiée `public.employes_cout_horaire` (RLS par permission). Le nouveau script
n'insère plus cette colonne : il alimente `employes_cout_horaire(employe_id, entreprise_id, cout_horaire)`
après création de chaque salarié. **La colonne n'est jamais réintroduite.**

### D2 — planning et tableau de bord vides

L'ancien jeu s'arrêtait à la semaine précédente. La génération va désormais de **S-30 à S+1** :

- `/planning` s'ouvre sur la semaine courante et affiche **30 affectations / 234 h / 6 ouvriers** ;
- le bloc « Prochaines affectations » du tableau de bord (`date >= aujourd'hui`) trouve **30 affectations**.

Les pointages ne sont posés que sur les journées **passées** : on ne pointe pas une journée qui n'a pas eu lieu.

### Correction complémentaire (non demandée, mais visible à l'écran)

Les chantiers encore ouverts recevaient une échéance déjà dépassée, ce qui affichait des alertes rouges
« retard estimé N j » sur le tableau de bord. Les chantiers actifs reçoivent maintenant une fin
prévisionnelle à venir et aucune date de fin réelle.

---

## 4. Données

Entreprise **ELSATIA Démonstration** (`raison_sociale` : ELSATIA Démonstration SAS, SIRET `99999999999999`,
`reference_interne = 'DEMO-CAPT'`, offre Entreprise annuelle, abonnement actif).

| Objet | Volume | Détail |
|---|---|---|
| Postes | 7 | Administrateur, Conducteur de travaux, Chef de chantier, Chef d'équipe, Ouvrier, Comptable, Responsable RH — droits distincts |
| Salariés | 12 | Jean Exemple (gérant), Marie Démonstration, Paul Test, Sophie Exemple, puis 8 autres noms fictifs |
| Clients | 26 | Client Démonstration A / B, Client Exemple, sociétés « Société Démonstration N », particuliers fictifs |
| Chantiers | 26 | Dont **Résidence Horizon**, **Bureaux République**, **Centre médical Demo** en tête de liste ; statuts facturé / terminé / en pause / en cours / à préparer / accepté |
| Devis | 111 | 72 acceptés, 18 envoyés, 18 refusés, 3 brouillons — les quatre statuts sont visibles |
| Factures | 72 | 49 payées, 9 payées partiellement, 14 envoyées ; règlements par virement, CB et carte en ligne |
| Affectations | 960 | 30 sur la semaine courante, 30 à venir |
| Pointages | 930 | Uniquement sur des journées passées, tous validés |
| Tâches | 216 | Générées automatiquement par les devis acceptés (triggers réels de l'application) |
| Fournisseurs / articles / véhicules / outils / commandes | 8 / 24 / 6 / 18 / 4 | Alimentent les alertes de stock, d'entretien et de livraison du tableau de bord |

**Rien de réel** : e-mails en `@example.test`, téléphones dans la plage `06 39 98 xx xx` réservée à la
fiction (ARCEP), SIRET invalide, adresses inventées, notes internes préfixées `[DEMO CAPTURES]`,
mentions « Document fictif de démonstration — sans valeur contractuelle » sur les devis et factures.

---

## 5. Compte de démonstration

- **Adresse** : `demo-captures@invalid.local` — domaine réservé, jamais routable (RFC 2606).
- **Mot de passe** : `demo-captures-local`, écrit en clair dans `supabase/local/compte_demo_captures.sql`.
  C'est un mot de passe de **test local** : il n'ouvre que le conteneur Docker du poste, et n'a aucune
  valeur ailleurs. **Aucun secret de Julien n'est utilisé, demandé ni stocké.**
- **Rattachement** : poste Administrateur sur `DEMO-CAPT`, `entreprise_active_id` positionnée.
- **Rattachement terrain** : le compte est lié au salarié **Jean Exemple**, lui-même affecté à des
  chantiers cette semaine — condition nécessaire pour que la RPC `mes_devis_chantiers_sans_prix`
  réponde et que l'écran « Mes travaux » ne soit pas vide.
- Aucune confirmation d'e-mail requise (`enable_confirmations = false` en local) ; aucun envoi réel
  (Mailpit intercepte tout sur `127.0.0.1:54324`).

---

## 6. Garde-fous

1. **Lanceur (`seed-demo-captures-local.mjs`)** — refuse d'écrire quoi que ce soit si
   `NEXT_PUBLIC_SUPABASE_URL` n'a pas un hôte local, ou si le conteneur PostgreSQL visé n'est pas
   publié sur une adresse locale. C'est la garantie forte.
2. **Chaque fichier SQL** — refuse de s'exécuter sans le paramètre de session
   `elsatia.demo_captures_local = 'oui'`, que seul le lanceur positionne : un copier-coller dans un
   éditeur SQL distant échoue d'emblée. Le script exige aussi `session_user = 'postgres'` et refuse
   toute base portant un marqueur de Production (`DEMO-18M`, entreprise réelle « elsatia »).
3. **Script de capture** — refuse toute cible dont l'hôte n'est pas local, et tout compte dont
   l'adresse ne se termine pas par `@invalid.local`.
4. **Contrôle du rendu avant chaque capture** — la page est relue et la capture est abandonnée si
   elle contient une adresse e-mail hors `@example.test` / `@invalid.local`, un marqueur de donnée
   non fictive (`gregurec`, `@elsatia.fr`, `@gmail.com`, `Sentinelle Drill`, `Entreprise Test`,
   `DEMO-18M`, `Liria`…), un squelette ou indicateur de chargement, une fenêtre modale ouverte,
   un message d'erreur, ou une exception JavaScript.
5. **Vérification de résolution** — une image qui ne fait pas exactement la taille attendue
   interrompt le script.
6. **Emplacement des fichiers** — `supabase/local/` est hors du registre du garde-fou Production.

### Une suspension de trigger, assumée et documentée

La réinitialisation doit supprimer des devis acceptés et des factures émises, protégés par de vrais
garde-fous d'intégrité (`verrou_devis_accepte`, `verrou_lignes_devis_accepte`, `verrou_facture_emise`,
`lignes_factures_brouillon_only`). Ces triggers ne sont **pas supprimés** : ils sont désactivés le temps
du nettoyage local, puis immédiatement rétablis dans le même bloc. Aucun trigger n'est désactivé pendant
la **création** des données : les lignes sont toujours posées alors que le document est encore en brouillon,
exactement comme le fait l'application.

---

## 7. Captures

```bash
node scripts/seed-demo-captures-local.mjs      # jeu de données + compte (idempotent)
node scripts/capturer-site-elsatia.mjs         # 5 captures
```

Playwright headless : l'image ne contient que le document — ni barre d'adresse, ni onglets, ni cadre
de système, ni curseur. Animations et transitions coupées (`reducedMotion: reduce` + CSS injectée),
thème clair forcé, locale `fr-FR`, fuseau `Europe/Paris`.

| Fichier | Écran | Résolution | Poids | Budget |
|---|---|---|---|---|
| `gestion-pro-dashboard-desktop.webp` | `/dashboard` | 2560 × 1600 | 105 Ko | < 400 Ko ✔ |
| `gestion-pro-chantiers-desktop.webp` | `/chantiers` | 2560 × 1600 | 168 Ko | < 400 Ko ✔ |
| `gestion-pro-devis-desktop.webp` | `/devis` | 2560 × 1600 | 136 Ko | < 400 Ko ✔ |
| `gestion-pro-planning-desktop.webp` | `/planning` | 2560 × 1600 | 181 Ko | < 400 Ko ✔ |
| `gestion-pro-mes-travaux-mobile.webp` | `/mes-travaux` | 780 × 1688 | 69 Ko | < 250 Ko ✔ |

Sortie : `captures/gp-demo/` (ignoré par git) + `manifeste.json`.
Formats obtenus par `viewport 1280×800 @ deviceScaleFactor 2` et `viewport 390×844 @ deviceScaleFactor 2`,
encodage WebP sRGB via `sharp` (qualité 86, abaissée automatiquement si un budget était dépassé).

---

## 8. Contrôles passés

| Contrôle | Résultat |
|---|---|
| Seed sur base locale à jour | OK |
| Second passage (idempotence) | OK — même état, réinitialisation ciblée, aucun doublon |
| Connexion du compte de démonstration | OK |
| Les 5 routes répondent en 200, session conservée | OK |
| Données sensibles dans le rendu | Aucune — contrôle automatique passé sur les 5 vues |
| Erreurs console | 15 messages, **tous** des échecs de WebSocket HMR du serveur de développement Next.js ; aucune erreur applicative, aucune exception |
| `npm run lint` | 0 erreur (3 avertissements `<img>` préexistants, hors périmètre) |
| `npm run typecheck` | OK (racine + `apps/tools`) |
| `npx vitest run` (racine) | 92 fichiers / 806 tests — tous passent |
| `npm --prefix apps/tools run test` | 171/172 fichiers — **1 échec préexistant** `apps/tools/src/lib/seo.test.ts`, sans rapport avec ce lot (aucun fichier de `apps/tools` n'est modifié ici) |
| `npm run build` | OK — racine + `apps/tools`, sortie 0 |

---

## 9. Le script Production historique reste cassé — à traiter séparément

`supabase/production/creer_entreprise_demo_18_mois.sql` **n'est pas corrigé dans ce lot** (consigne
explicite). Il reste inutilisable en l'état sur toute base à jour :

1. il insère `employes.cout_horaire`, colonne supprimée depuis `20260818000205` ;
2. `supabase/production/reset_entreprise_demo_18_mois.sql`, qui l'accompagne, supprime des devis
   acceptés et repasse des factures émises en brouillon : `verrou_devis_accepte` et
   `verrou_facture_emise` refusent ces deux opérations. La procédure de réinitialisation de la
   démo **Production** documentée dans `docs/organisation/DEMO_COMMERCIALE.md` est donc cassée elle aussi.

Un lot dédié sera nécessaire si la démonstration commerciale en Production doit être réparée.

Dans le même esprit, `scripts/seed-demo-history.mjs` est mort depuis la migration
`20260714000078` (RPC `dev_contexte_entreprise` supprimée) — à supprimer ou réécrire, hors périmètre ici.

---

## 10. Limites connues

1. **Rendu de développement.** Les captures viennent de `next dev`. Le HTML et le CSS sont ceux de
   production, mais pour un rendu strictement identique au site déployé, refaire les 5 vues sur un
   `next build && next start` local.
2. **Planning : formulaire d'ajout visible.** La page `/planning` d'un compte disposant de
   `gerer_planning` affiche le formulaire « Ajouter au planning » au-dessus de la grille, qui occupe
   environ 40 % de la capture. C'est le vrai écran, non retouché. Pour cadrer sur la grille, le champ
   `defilement` de `scripts/capturer-site-elsatia.mjs` accepte un décalage vertical en pixels CSS
   (laissé à 0 partout). Aucune capture n'est modifiée par CSS : on ne montre pas une interface qui
   n'existe pas.
3. **Tableau de bord : haut de page.** La capture montre le briefing du jour et la grille des modules,
   c'est-à-dire ce que l'utilisateur voit en arrivant. Les blocs « Devis à suivre », « Chantiers actifs »
   et « Prochaines affectations » sont plus bas ; ils sont bien alimentés, mais hors cadre à 1280 × 800.
   Même remède que ci-dessus si on veut les mettre en avant.
4. **Données datées relativement à l'exécution.** Rejouer le seed avant chaque campagne de captures.
5. **Une bulle « Aide » est présente en bas à droite** sur les vues desktop : c'est un composant réel
   de l'application, conservé volontairement.
6. **Le test `apps/tools/src/lib/seo.test.ts` échoue avant ce lot** ; il n'est ni causé ni corrigé ici.
7. Les captures ne sont pas versionnées (`/captures/` est ignoré) : elles sont reproductibles en deux
   commandes, il n'y a aucune raison d'alourdir le dépôt avec des binaires.

---

## 11. Production, Preview, déploiement

- **Production** : NON. Aucune migration, aucun seed, aucune écriture, aucune connexion.
- **Preview** : NON. `supabase/.temp/project-ref` reste inchangé ; aucun `--linked` n'a été utilisé.
- **Déploiement** : NON. Aucun Vercel, aucun Stripe, aucun Brevo, aucun envoi d'e-mail.
- Toutes les écritures ont eu lieu dans le conteneur Docker local, sur la seule entreprise `DEMO-CAPT`.
