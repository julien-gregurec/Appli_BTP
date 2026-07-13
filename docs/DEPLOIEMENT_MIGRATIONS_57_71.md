# Déploiement contrôlé du lot migrations 57 à 71

## État

Le code est validé localement mais ne doit pas être publié avant la base. Les migrations 57 à 71 ne sont pas encore appliquées au projet Supabase `uykukebthgmqtxlmkpnn`.

Le script `supabase/production/sortie_mode_prototype.sql` est exclu de cette opération. Il ne doit être exécuté que lors de la bascule coordonnée vers les comptes personnels.

## Avant l’exécution

1. Vérifier qu’une sauvegarde récente de la base est disponible dans Supabase.
2. Ouvrir une session avec le compte propriétaire du projet.
3. Ne pas pousser `main` et ne pas déclencher Vercel avant la fin des contrôles SQL.
4. Utiliser un nouveau snippet SQL pour chaque migration afin d’éviter le mélange de requêtes déjà observé dans l’éditeur Supabase.

## Ordre obligatoire

Exécuter exactement dans cet ordre les fichiers de `supabase/migrations/` :

1. `20260713000057_archivage_notes_frais_socle.sql`
2. `20260713000058_archivage_notes_frais_audit_exports.sql`
3. `20260713000059_archivage_notes_frais_permissions_workflow.sql`
4. `20260713000060_archivage_notes_frais_integrite_stockage.sql`
5. `20260713000061_archivage_notes_frais_exports_securises.sql`
6. `20260713000062_demandes_conges.sql`
7. `20260713000063_comptes_facturation_plateforme.sql`
8. `20260713000064_personnalisation_documents.sql`
9. `20260713000065_pointage_planning_heures_chantier.sql`
10. `20260713000066_devis_chantier_sans_prix.sql`
11. `20260713000067_reparation_outillage_travaux_vehicules.sql`
12. `20260713000068_codes_qr_borne_stock_securisee.sql`
13. `20260713000069_socle_droits_personnels_complet.sql`
14. `20260713000070_pointage_strictement_nom_propre.sql`
15. `20260713000071_releves_facturation_comptes.sql`

En CLI, après authentification et liaison du projet :

```bash
npx supabase login
npx supabase link --project-ref uykukebthgmqtxlmkpnn
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Le `dry-run` est obligatoire. Si la liste distante indique qu’une migration 57 ou supérieure a déjà été exécutée manuellement, ne pas lancer `db push` avant d’avoir réconcilié l’historique.

## Contrôles SQL après application

```sql
select to_regclass('public.documents_notes_frais') is not null as documents_frais;
select to_regclass('public.journal_audit_notes_frais') is not null as audit_frais;
select to_regclass('public.demandes_conges') is not null as conges;
select to_regclass('public.codes_identification') is not null as qr_codes;
select to_regclass('public.facturation_comptes_mensuelle') is not null as facturation_comptes;

select proname
from pg_proc join pg_namespace on pg_namespace.oid=pg_proc.pronamespace
where nspname='public' and proname in (
  'transition_note_frais','enregistrer_mouvement_stock_borne',
  'mes_devis_chantiers_sans_prix','plateforme_releve_facturation',
  'peut_pointer_pour_employe'
)
order by proname;

select id,public,file_size_limit
from storage.buckets
where id in ('notes-frais','notes-frais-exports')
order by id;

select cle,count(*) filter(where autorise) as postes_autorises
from public.permissions_disponibles d
left join public.permissions_poste p on p.cle_permission=d.cle
where cle in ('demander_ses_conges','utiliser_borne_stock','voir_devis_chantier_sans_prix')
group by cle order by cle;
```

Les deux buckets doivent afficher `public = false`. Les cinq fonctions doivent être présentes.

Si pgTAP est disponible, exécuter ensuite les trois fichiers de `supabase/tests/` dans un environnement de test, jamais en supposant qu’ils remplacent les essais fonctionnels.

## Essais fonctionnels avant publication

- créer un brouillon de note de frais avec un compte salarié, importer une image, vérifier l’empreinte et soumettre ;
- vérifier qu’un autre salarié ne voit pas cette note ;
- valider, verrouiller puis vérifier que le fichier ne peut plus être remplacé ;
- créer une demande de congé, l’approuver et contrôler les lignes du planning ;
- vérifier qu’un responsable peut valider un pointage mais ne peut pas pointer pour un collègue ;
- définir un code stock d’employé, scanner un article et un chantier, puis contrôler l’auteur du mouvement ;
- vérifier qu’une sortie sans chantier est refusée ;
- consulter un devis chantier depuis « Mes travaux » et confirmer l’absence totale des prix ;
- mettre un outil hors service, puis en réparation ou au rebut ;
- générer un relevé mensuel plateforme et contrôler les comptes actifs, en pause et fermés pendant le mois.

## Publication

Après seulement ces contrôles : pousser les commits locaux validés, attendre le build Vercel, puis refaire les essais essentiels sur l’URL publique.

La bascule `DISABLE_EMAIL_LOGIN=false` et le script de sortie du prototype constituent une opération séparée. Elle exige le test préalable du compte propriétaire, d’un compte ouvrier et d’un compte responsable.
