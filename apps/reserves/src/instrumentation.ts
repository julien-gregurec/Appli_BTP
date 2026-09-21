// Reserves does not use Sentry/GP's instrumentation. Deliberately empty:
// this file's only purpose is to exist here so Next's instrumentation
// convention resolves to this app instead of the monorepo root's
// (apps/reserves sets turbopack.root to the repo root for its file: linked
// packages, which otherwise causes Next to discover and load Gestion Pro's
// src/instrumentation.ts — and, through it, @sentry/nextjs, a dependency
// apps/reserves does not have).
export async function register() {}
