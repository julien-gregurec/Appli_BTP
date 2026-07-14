-- Corrige le libellé créé lors d'un ancien collage SQL avec un mauvais encodage.
update public.postes
set nom = 'Compte dépôt'
where nom in ('Compte d√©p√¥t', 'Compte dÃ©pÃ´t');

notify pgrst, 'reload schema';
