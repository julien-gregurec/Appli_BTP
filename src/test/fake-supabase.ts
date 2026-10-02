// Client Supabase en mémoire, limité aux opérations utilisées par la
// synchronisation Stripe Billing. Réservé aux tests : il reproduit les contraintes
// d'unicité utiles (doublon d'événement Stripe → code 23505).

type Ligne = Record<string, unknown>;
type Filtre = (ligne: Ligne) => boolean;
type Resultat = { data: unknown; error: { code?: string; message: string } | null; count?: number | null };

export class FakeSupabase {
  tables = new Map<string, Ligne[]>();
  uniques: Record<string, string[]>;
  private sequence = 0;

  constructor(uniques: Record<string, string[]> = {}) {
    this.uniques = uniques;
  }

  table(nom: string) {
    if (!this.tables.has(nom)) this.tables.set(nom, []);
    return this.tables.get(nom)!;
  }

  seed(nom: string, lignes: Ligne[]) {
    this.table(nom).push(...lignes.map((ligne) => ({ id: ligne.id ?? this.nouvelId(), ...ligne })));
  }

  nouvelId() {
    this.sequence += 1;
    return `id_${this.sequence}`;
  }

  from(nom: string) {
    return new Requete(this, nom);
  }

  async rpc() {
    return { data: null, error: null };
  }
}

class Requete implements PromiseLike<Resultat> {
  private filtres: Filtre[] = [];
  private operation: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private valeurs: Ligne | Ligne[] | null = null;
  private conflit: string | null = null;
  private compter = false;

  constructor(private base: FakeSupabase, private nom: string) {}

  select(_colonnes?: string, options?: { count?: string; head?: boolean }) {
    if (this.operation === "select") this.compter = Boolean(options?.count);
    return this;
  }
  insert(valeurs: Ligne | Ligne[]) {
    this.operation = "insert";
    this.valeurs = valeurs;
    return this;
  }
  update(valeurs: Ligne) {
    this.operation = "update";
    this.valeurs = valeurs;
    return this;
  }
  upsert(valeurs: Ligne, options?: { onConflict?: string }) {
    this.operation = "upsert";
    this.valeurs = valeurs;
    this.conflit = options?.onConflict ?? "id";
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  eq(colonne: string, valeur: unknown) {
    this.filtres.push((ligne) => ligne[colonne] === valeur);
    return this;
  }
  neq(colonne: string, valeur: unknown) {
    this.filtres.push((ligne) => ligne[colonne] !== valeur);
    return this;
  }
  is(colonne: string, valeur: unknown) {
    this.filtres.push((ligne) => (ligne[colonne] ?? null) === valeur);
    return this;
  }
  not(colonne: string, operateur: string, valeur: unknown) {
    if (operateur !== "is") throw new Error(`Opérateur non simulé : ${operateur}`);
    this.filtres.push((ligne) => (ligne[colonne] ?? null) !== valeur);
    return this;
  }
  in(colonne: string, valeurs: unknown[]) {
    this.filtres.push((ligne) => valeurs.includes(ligne[colonne]));
    return this;
  }
  lt(colonne: string, valeur: unknown) {
    this.filtres.push((ligne) => String(ligne[colonne] ?? "") < String(valeur));
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }

  async maybeSingle(): Promise<Resultat> {
    const resultat = this.executer();
    const lignes = (resultat.data as Ligne[] | null) ?? [];
    if (resultat.error) return resultat;
    if (lignes.length > 1) return { data: null, error: { message: "plusieurs lignes" } };
    return { data: lignes[0] ?? null, error: null };
  }

  async single(): Promise<Resultat> {
    const resultat = await this.maybeSingle();
    if (!resultat.error && resultat.data === null) return { data: null, error: { message: "aucune ligne" } };
    return resultat;
  }

  then<A = Resultat, B = never>(succes?: ((valeur: Resultat) => A | PromiseLike<A>) | null, echec?: ((raison: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.executer()).then(succes, echec);
  }

  private correspond(ligne: Ligne) {
    return this.filtres.every((filtre) => filtre(ligne));
  }

  private violeUnicite(ligne: Ligne, ignorer?: Ligne) {
    const colonnes = this.base.uniques[this.nom] ?? [];
    return colonnes.some((colonne) => ligne[colonne] != null && this.base.table(this.nom).some((existante) => existante !== ignorer && existante[colonne] === ligne[colonne]));
  }

  private executer(): Resultat {
    const table = this.base.table(this.nom);
    switch (this.operation) {
      case "select": {
        const lignes = table.filter((ligne) => this.correspond(ligne)).map((ligne) => ({ ...ligne }));
        return { data: lignes, error: null, count: this.compter ? lignes.length : null };
      }
      case "insert": {
        const lignes = Array.isArray(this.valeurs) ? this.valeurs : [this.valeurs!];
        for (const ligne of lignes) {
          if (this.violeUnicite(ligne)) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        const inserees = lignes.map((ligne) => ({ id: this.base.nouvelId(), created_at: new Date().toISOString(), ...ligne }));
        table.push(...inserees);
        return { data: inserees, error: null };
      }
      case "update": {
        const lignes = table.filter((ligne) => this.correspond(ligne));
        for (const ligne of lignes) Object.assign(ligne, this.valeurs);
        return { data: lignes, error: null };
      }
      case "upsert": {
        const valeurs = this.valeurs as Ligne;
        const cle = this.conflit!;
        const existante = table.find((ligne) => ligne[cle] === valeurs[cle]);
        if (existante) Object.assign(existante, valeurs);
        else table.push({ id: this.base.nouvelId(), created_at: new Date().toISOString(), ...valeurs });
        return { data: null, error: null };
      }
      case "delete": {
        const restantes = table.filter((ligne) => !this.correspond(ligne));
        this.base.tables.set(this.nom, restantes);
        return { data: null, error: null };
      }
    }
  }
}
