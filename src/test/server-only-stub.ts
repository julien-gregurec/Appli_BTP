// Stub pour les tests : remplace le vrai paquet "server-only" (voir vitest.config.ts).
// Hors du bundler Next.js, `import "server-only"` lève systématiquement une
// erreur — ce stub neutralise l'import sans rien vérifier, comme le fait
// Next.js en dehors du rendu client.
export {};
