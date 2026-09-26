-- Remise à zéro du décor de recette ELSATIA Réserves (base JETABLE uniquement).
--
-- La recette navigateur consomme des états à usage unique : une invitation acceptée ne
-- peut pas l'être deux fois, et un intervenant déjà rattaché ne rejoue pas le parcours.
-- Sans remise à zéro, la recette n'est jouable qu'une fois — donc, en pratique, jamais
-- rejouée. Ce script rend le parcours IDEMPOTENT : on repart systématiquement du même
-- décor, celui que `prepare-reserves-v3-recipe.sql` a posé.
--
-- Périmètre volontairement restreint aux organisations de recette. Le script refuse de
-- s'exécuter s'il ne reconnaît pas le décor : c'est le garde-fou qui empêche de le
-- lancer par erreur sur une base qui ne serait pas la base jetable.

do $$
begin
  if not exists (
    select 1 from public.reserves_chantiers
    where id = 'e0000000-0000-0000-0000-000000000001'
      and nom = 'RECETTE_A_Groupe scolaire'
  ) then
    raise exception
      'Décor de recette introuvable : ce script ne doit être joué que sur la base jetable.';
  end if;
end $$;

-- Tout ce que le parcours produit est effacé ; le décor lui-même est conservé.
delete from public.reserves_historique;
delete from public.reserves_photos;
delete from public.reserves_notifications_lectures;
delete from public.reserves_notifications_envois;
delete from public.reserves_evenements_notifications;
delete from public.reserves_conversations_lectures;
delete from public.reserves_messages;
delete from public.reserves_conversations;
delete from public.reserves;
delete from public.reserves_invitations;

-- L'entreprise extérieure redevient une entreprise INVITÉE sans aucun accès : c'est
-- précisément l'état que le parcours doit faire changer, et rien d'autre ne le rétablit.
update public.reserves_intervenants
set entreprise_intervenante_id = null,
    statut = 'invitee'
where id = 'e2000000-0000-0000-0000-00000000000b';
