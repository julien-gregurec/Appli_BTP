// Faux client Supabase (service role) pour les tests d'intégration du webhook
// d'abonnement Stripe Billing, sans dépendre d'une vraie base Postgres.
// Reproduit uniquement le sous-ensemble de l'API postgrest-js réellement
// utilisé par src/lib/stripe-abonnement.ts et le webhook (.eq/.in/.is,
// .single/.maybeSingle, insert/update/upsert/delete, .rpc), avec assez de
// fidélité pour vérifier idempotence, conflits uniques et enchaînements réels.

type Ligne = Record<string, unknown>;
type Filtre = (ligne: Ligne) => boolean;

type OptionsSelect = { count?: "exact"; head?: boolean };
type OptionsUpsert = { onConflict?: string };

class FausseRequete implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private filtres: Filtre[] = [];
  private singleMode: "single" | "maybe" | null = null;

  constructor(
    private lignes: Ligne[],
    private mode: "select" | "insert" | "update" | "upsert" | "delete",
    private payload: Ligne | Ligne[] | undefined,
    private optionsSelect: OptionsSelect | undefined,
    private optionsUpsert: OptionsUpsert | undefined,
    private colonnesUniques: string[],
  ) {}

  eq(colonne: string, valeur: unknown) {
    this.filtres.push((ligne) => ligne[colonne] === valeur);
    return this;
  }

  in(colonne: string, valeurs: unknown[]) {
    this.filtres.push((ligne) => valeurs.includes(ligne[colonne]));
    return this;
  }

  is(colonne: string, valeur: unknown) {
    this.filtres.push((ligne) => (ligne[colonne] ?? null) === valeur);
    return this;
  }

  single() {
    this.singleMode = "single";
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }

  private correspondent() {
    return this.lignes.filter((ligne) => this.filtres.every((f) => f(ligne)));
  }

  private violeUnicite(candidat: Ligne, ignorer?: Ligne) {
    return this.colonnesUniques.some((colonne) => {
      const valeur = candidat[colonne];
      if (valeur === undefined || valeur === null) return false;
      return this.lignes.some((existante) => existante !== ignorer && existante[colonne] === valeur);
    });
  }

  then<TResult1 = { data: unknown; error: unknown; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const resultat = this.executer();
    return Promise.resolve(resultat).then(onfulfilled, onrejected);
  }

  private executer(): { data: unknown; error: unknown; count?: number } {
    if (this.mode === "select") {
      const correspondantes = this.correspondent();
      if (this.optionsSelect?.count === "exact") {
        return { data: this.optionsSelect.head ? null : correspondantes, error: null, count: correspondantes.length };
      }
      if (this.singleMode === "single") {
        if (correspondantes.length !== 1) return { data: null, error: { message: "Ligne introuvable ou ambiguë" } };
        return { data: correspondantes[0], error: null };
      }
      if (this.singleMode === "maybe") {
        if (correspondantes.length > 1) return { data: null, error: { message: "Plusieurs lignes trouvées" } };
        return { data: correspondantes[0] ?? null, error: null };
      }
      return { data: correspondantes, error: null };
    }

    if (this.mode === "insert") {
      const nouvelles = Array.isArray(this.payload) ? this.payload : [this.payload as Ligne];
      for (const nouvelle of nouvelles) {
        if (this.violeUnicite(nouvelle)) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
      }
      for (const nouvelle of nouvelles) this.lignes.push({ ...nouvelle });
      return { data: nouvelles, error: null };
    }

    if (this.mode === "update") {
      const correspondantes = this.correspondent();
      for (const ligne of correspondantes) Object.assign(ligne, this.payload);
      return { data: correspondantes, error: null };
    }

    if (this.mode === "upsert") {
      const lignesPayload = Array.isArray(this.payload) ? this.payload : [this.payload as Ligne];
      const colonnesConflit = (this.optionsUpsert?.onConflict ?? "id").split(",").map((c) => c.trim());
      const resultats: Ligne[] = [];
      for (const nouvelle of lignesPayload) {
        const existante = this.lignes.find((ligne) => colonnesConflit.every((c) => ligne[c] === nouvelle[c]));
        if (existante) {
          Object.assign(existante, nouvelle);
          resultats.push(existante);
        } else {
          const cree = { ...nouvelle };
          this.lignes.push(cree);
          resultats.push(cree);
        }
      }
      return { data: resultats, error: null };
    }

    if (this.mode === "delete") {
      const correspondantes = this.correspondent();
      for (const ligne of correspondantes) {
        const index = this.lignes.indexOf(ligne);
        if (index >= 0) this.lignes.splice(index, 1);
      }
      return { data: correspondantes, error: null };
    }

    return { data: null, error: { message: "Mode non supporté" } };
  }
}

export type BaseFausse = Record<string, Ligne[]>;

export function creerFausseBaseAdmin(
  base: BaseFausse,
  colonnesUniques: Record<string, string[]> = {},
  rpcs: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }> = {},
) {
  return {
    base,
    from(table: string) {
      if (!base[table]) base[table] = [];
      const lignes = base[table];
      const uniques = colonnesUniques[table] ?? [];
      return {
        select: (_colonnes?: string, options?: OptionsSelect) => new FausseRequete(lignes, "select", undefined, options, undefined, uniques),
        insert: (payload: Ligne | Ligne[]) => new FausseRequete(lignes, "insert", payload, undefined, undefined, uniques),
        update: (payload: Ligne) => new FausseRequete(lignes, "update", payload, undefined, undefined, uniques),
        upsert: (payload: Ligne | Ligne[], options?: OptionsUpsert) => new FausseRequete(lignes, "upsert", payload, undefined, options, uniques),
        delete: () => new FausseRequete(lignes, "delete", undefined, undefined, undefined, uniques),
      };
    },
    rpc(nom: string, args: Record<string, unknown> = {}) {
      const gestionnaire = rpcs[nom];
      return Promise.resolve(gestionnaire ? gestionnaire(args) : { data: null, error: null });
    },
  };
}
