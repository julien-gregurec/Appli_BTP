/** Banc de recette : doublure de `next/navigation` — les navigations sont notées, pas exécutées. */
declare global {
  interface Window { __navigations: string[] }
}

export function useRouter() {
  return {
    push: (url: string) => { window.__navigations.push(url); },
    replace: (url: string) => { window.__navigations.push(url); },
    refresh: () => undefined,
    back: () => undefined,
  };
}
