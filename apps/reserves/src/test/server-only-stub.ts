// Next.js intercepte l'import « server-only » à la compilation ; hors de son bundler
// (ici Vitest), le vrai paquet lève systématiquement. On le neutralise exactement comme
// le fait la configuration de test de Gestion Pro, et uniquement pour les tests.
export {};
