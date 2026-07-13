# Gestion et archivage des justificatifs de dépenses

## Périmètre livré

Le module couvre la création personnelle d’une dépense, l’import mobile de PDF et d’images, la conservation de l’original, le calcul SHA-256, la validation, la correction, le refus motivé, le verrouillage, le gel juridique (`legal_hold`), l’audit append-only et l’export ZIP pour l’expert-comptable.

Les données et les objets sont isolés par entreprise. Un salarié ne consulte que ses dépenses. Les responsables, comptables et administrateurs n’obtiennent que les droits explicitement attribués à leur poste. Le super-administrateur de plateforme n’obtient aucun accès au contenu client par défaut.

## Architecture

- Next.js 16 : pages serveur, actions serveur et routes API.
- Supabase Auth : identité individuelle obligatoire.
- PostgreSQL + RLS : isolation multi-entreprises et workflow autorisé côté base.
- Supabase Storage privé : bucket `notes-frais` pour les pièces et `notes-frais-exports` pour les ZIP.
- SHA-256 : empreinte calculée à l’import, contrôlée au téléchargement et avant chaque export.
- Horodatage : heure UTC du serveur via `TimestampProvider`. L’implémentation locale n’est pas qualifiée.
- OCR : interface fournisseur présente, mais aucun résultat n’est simulé. Un prestataire réel reste à configurer.
- Antivirus : aucun prestataire réel n’est configuré. Si l’administrateur le rend obligatoire, les imports sont bloqués volontairement.

## Modes d’archivage

### `simple_document_storage`

Mode par défaut. L’original numérique est conservé et transmis à la comptabilité. L’application rappelle de conserver le papier.

### `reinforced_archive`

Conserve l’original, une copie figée octet pour octet, leurs empreintes, l’heure serveur et la trace des opérations. Ce mode n’est pas présenté comme un système d’archivage électronique qualifié, comme une garantie de valeur probante ou comme une autorisation de détruire le papier.

## Migrations

À appliquer dans l’ordre :

1. `20260713000057_archivage_notes_frais_socle.sql`
2. `20260713000058_archivage_notes_frais_audit_exports.sql`
3. `20260713000059_archivage_notes_frais_permissions_workflow.sql`
4. `20260713000060_archivage_notes_frais_integrite_stockage.sql`
5. `20260713000061_archivage_notes_frais_exports_securises.sql`

## Variables d’environnement

Le socle réutilise les variables Supabase existantes :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DISABLE_EMAIL_LOGIN=false` en production pour activer le module sécurisé.

Variables futures à créer uniquement lors de la connexion d’un prestataire réel :

- identifiants du fournisseur OCR ;
- identifiants du scanner antivirus ;
- identifiants du service externe d’horodatage.

Ne jamais utiliser une clé `service_role` dans le navigateur.

## Commandes de vérification

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

## Déploiement

1. Sauvegarder la base et le stockage.
2. Appliquer les migrations dans l’ordre.
3. Tester avec trois comptes réels : salarié, responsable et comptable/administrateur.
4. Vérifier les buckets privés et l’expiration des liens.
5. Déployer le code.
6. Désactiver le mode prototype seulement après validation des invitations et des fiches employés liées.
7. Réaliser un test d’isolement avec deux entreprises distinctes.

## Procédure interne proposée — à faire valider

1. Le salarié importe l’original complet et confirme sa lisibilité.
2. Il vérifie fournisseur, date, HT, TVA, TTC, chantier et moyen de paiement.
3. Il conserve le papier tant que l’entreprise n’a pas confirmé une conservation conforme.
4. Le responsable contrôle le justificatif et valide, refuse avec motif ou demande une correction.
5. Le comptable ajoute sa référence et crée l’export de période.
6. L’export ZIP et son manifeste sont conservés dans un emplacement comptable maîtrisé.
7. L’administrateur verrouille les dossiers finalisés.
8. En cas de contrôle ou litige, il active immédiatement un `legal_hold`.
9. Aucune suppression n’est automatique. Une liste d’échéances doit être revue et approuvée.
10. Toute anomalie d’intégrité suspend le traitement et déclenche une enquête.

## Validations externes indispensables

- Durée de conservation et procédure : expert-comptable et conseil juridique.
- Possibilité de détruire les originaux papier : validation explicite, jamais déduite du logiciel.
- Mode renforcé et valeur probante : audit juridique et technique, prestataire qualifié si nécessaire.
- Base légale, information des salariés, conservation des journaux et adresses IP : DPO/conseil RGPD.
- OCR, antivirus et horodatage externe : choix, contrat, localisation des données et sous-traitants.

Valeur initiale proposée : dix ans pour les pièces comptables, sous réserve de validation par l’entreprise et ses conseils.
