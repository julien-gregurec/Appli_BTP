// Versions actuelles des documents contractuels acceptés à l'inscription.
// Doit rester synchronisé avec la ligne "Version X.Y" de docs/juridique/cgu.md
// et docs/juridique/cgv.md — juridique.test.ts vérifie cette synchronisation.
// Toute nouvelle version de l'un de ces documents doit changer la constante
// correspondante : les comptes déjà inscrits ne sont pas réputés avoir
// accepté une version publiée après leur inscription.
export const VERSION_CGU = "1.0";
export const VERSION_CGV = "1.0";
