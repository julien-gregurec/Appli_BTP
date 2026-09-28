-- ELSATIA — Baseline performance V1 : 80 photos dans la conversation d'un chantier du jeu GP
-- (métadonnées seules, comme une équipe qui envoie ses photos de chantier), pour vérifier que la
-- limite « téléchargements signés » (60 / min / utilisateur) ne casse pas l'affichage de la page
-- Photos & documents. Base jetable uniquement. Variable psql : chantier.
\set ON_ERROR_STOP 1
with emp as (
  select id from public.employes where entreprise_id = 'a0000000-0000-4000-a000-000000000001' and utilisateur_id = 'facc0000-0000-4000-a000-000000000001'
), conv as (
  insert into public.conversations_internes (id, entreprise_id, type, titre, chantier_id, cree_par_employe_id)
  select 'c0c00000-0000-4000-8000-000000000001', 'a0000000-0000-4000-a000-000000000001', 'chantier', 'Photos chantier (perf)', :'chantier', emp.id from emp
  on conflict (id) do nothing returning id
), msg as (
  insert into public.messages_internes (id, entreprise_id, conversation_id, auteur_employe_id, contenu)
  select 'c0c00000-0000-4000-8000-0000000000aa', 'a0000000-0000-4000-a000-000000000001', 'c0c00000-0000-4000-8000-000000000001', emp.id, 'Photos du jour'
  from emp where exists (select 1 from conv)
  returning id
)
insert into public.pieces_jointes_messages (entreprise_id, conversation_id, message_id, chantier_id, storage_path, nom_original, mime_type, type_media, taille_octets)
select 'a0000000-0000-4000-a000-000000000001', 'c0c00000-0000-4000-8000-000000000001', msg.id, :'chantier',
  'a0000000-0000-4000-a000-000000000001/c0c00000-0000-4000-8000-000000000001/photo-' || g || '.jpg', 'photo-' || g || '.jpg', 'image/jpeg', 'image', 350000
from msg cross join generate_series(1, 80) g;
-- Objets Storage correspondants (métadonnées, chemin <entreprise>/<conversation>/…, convention
-- des policies messagerie_medias_*) : la page peut alors les signer comme en production.
insert into storage.objects (bucket_id, name, metadata)
select 'messagerie-medias', p.storage_path, '{"mimetype":"image/jpeg","size":350000}'::jsonb
from public.pieces_jointes_messages p
where p.conversation_id = 'c0c00000-0000-4000-8000-000000000001'
  and not exists (select 1 from storage.objects o where o.bucket_id = 'messagerie-medias' and o.name = p.storage_path);
select count(*) medias from public.pieces_jointes_messages where chantier_id = :'chantier';
