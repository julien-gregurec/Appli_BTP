-- julien@elsatia.fr devient administrateur plateforme global, en plus de
-- julien.gregurec@gmail.com (conservé pour l'instant, retrait à décider plus tard).
-- Isolé du chantier multi-app : uniquement cette ligne, aucune autre table touchée.
insert into public.plateforme_admins (email, role, ajoute_par)
values ('julien@elsatia.fr', 'total', 'hotfix:plateforme_admin_v1')
on conflict (email) do nothing;

notify pgrst, 'reload schema';
