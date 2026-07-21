-- Droit explicite pour utiliser les fonctionnalités IA (assistant, génération de
-- devis, analyse de documents/photos, dictée, suggestions messagerie/rentabilité).
-- Autorisé partout par défaut (comportement actuel inchangé) : l'administrateur
-- restreint ensuite poste par poste dans Paramètres > Accès s'il le souhaite.

insert into public.permissions_disponibles(cle,module,description)
values('acces_ia','Intelligence artificielle','Utiliser l’assistant IA et les fonctionnalités IA (devis, documents, dictée, messagerie, rentabilité)')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'acces_ia',true
from public.postes p
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;

notify pgrst, 'reload schema';
