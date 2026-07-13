-- Le trigger de numéro d'inscription doit pouvoir appeler le générateur interne
-- même lorsque la création est faite par anon (prototype) ou authenticated.
-- On exécute le trigger avec les droits du propriétaire sans exposer directement
-- le générateur de numéros aux rôles applicatifs.

alter function public.trg_numero_inscription_employe() security definer;
alter function public.trg_numero_inscription_employe() set search_path = public;

revoke all on function public.generer_numero_inscription_employe() from public, anon, authenticated;
revoke all on function public.trg_numero_inscription_employe() from public, anon, authenticated;

notify pgrst, 'reload schema';
