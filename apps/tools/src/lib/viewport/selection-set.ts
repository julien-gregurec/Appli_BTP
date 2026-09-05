/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §5 — ensemble d'entités sélectionnées.
 *
 * Module pur, sans React : la sélection multiple est une liste d'identifiants et trois règles,
 * pas un état d'interface. La mettre ici plutôt que dans le composant permet de la tester sans
 * rendu, et surtout d'avoir UNE définition de « ajouter / retirer » plutôt qu'une par appelant.
 *
 * ## Pourquoi une LISTE ORDONNÉE et pas un `Set`
 *
 * L'ordre porte une information : la dernière entité ajoutée est celle dont on parle. C'est elle
 * que le panneau propriétés détaille quand la sélection est simple, et c'est elle qui alimente
 * `selectedEntityId` pour les consommateurs restés en sélection unique (§5). Un `Set` rendrait
 * ce choix dépendant de l'ordre d'insertion interne — vrai en pratique, mais non garanti par le
 * contrat, donc une base fragile pour une compatibilité.
 *
 * ## Compatibilité (§5)
 *
 * Ce lot n'édite PAS plusieurs entités à la fois (§9). La sélection multiple sert à désigner et à
 * décrire ; l'édition par poignée continue de ne connaître qu'une entité — celle que
 * `primarySelection` désigne. C'est ce qui permet d'ajouter le multiple sans toucher au chemin
 * d'édition existant.
 */

/** Sélection vide, en référence STABLE : un `[]` littéral périmerait les mémos à chaque rendu. */
export const EMPTY_SELECTION: readonly string[] = Object.freeze([]);

/**
 * Entité « principale » d'une sélection : la dernière ajoutée.
 *
 * La plus récente plutôt que la première, parce que c'est celle que l'utilisateur vient de
 * désigner et donc celle qu'il s'attend à voir décrite. Sur une sélection simple, les deux
 * définitions coïncident — d'où une compatibilité exacte avec `selectedEntityId`.
 */
export function primarySelection(selection: readonly string[]): string | null {
  return selection.length > 0 ? selection[selection.length - 1] : null;
}

/** Normalise une sélection unique héritée en liste. */
export function selectionFromId(entityId: string | null | undefined): readonly string[] {
  return entityId ? [entityId] : EMPTY_SELECTION;
}

/**
 * Ajoute l'entité si elle est absente, la retire si elle est présente.
 *
 * Retirer déplace la « principale » sur l'entité restante la plus récente, ce qui est la seule
 * suite cohérente : le panneau ne peut pas continuer de décrire ce qu'on vient de désélectionner.
 */
export function toggleSelection(selection: readonly string[], entityId: string): readonly string[] {
  return selection.includes(entityId) ? selection.filter((id) => id !== entityId) : [...selection, entityId];
}

/**
 * §5 — sélection résultant d'un clic.
 *
 * `additive` traduit le Shift du desktop. Le contrat est délibérément exprimé en INTENTION
 * (« ajouter à la sélection ») et non en touche : le mobile n'a pas de Shift, et pourra le
 * satisfaire par un appui long ou un mode dédié sans que cette règle change (§5).
 *
 * Le clic à vide se comporte différemment selon l'intention, et c'est voulu : un clic simple dans
 * le vide désélectionne tout — le geste universel pour « rien » — tandis qu'un Shift+clic
 * manqué laisse la sélection intacte. Vider une sélection patiemment construite parce qu'un
 * Shift+clic a raté sa cible de trois pixels serait une perte sèche, et sans annulation possible
 * puisque la sélection n'entre pas dans l'historique.
 */
export function applySelectionClick(
  selection: readonly string[],
  entityId: string | null,
  additive: boolean,
): readonly string[] {
  if (!entityId) return additive ? selection : EMPTY_SELECTION;
  if (!additive) return [entityId];
  return toggleSelection(selection, entityId);
}

/**
 * Restreint une sélection aux entités qui existent encore, en préservant l'ordre.
 *
 * Appelée quand la scène change sous une sélection établie (changement d'étape de chantier,
 * paramètre modifié qui fait disparaître une entité). Filtrer plutôt que tout vider conserve ce
 * qui reste valable : passer d'une étape à l'autre ne doit pas punir l'utilisateur qui avait
 * sélectionné trois entités dont deux subsistent.
 */
export function pruneSelection(selection: readonly string[], existingIds: ReadonlySet<string>): readonly string[] {
  if (selection.every((id) => existingIds.has(id))) return selection;
  return selection.filter((id) => existingIds.has(id));
}
