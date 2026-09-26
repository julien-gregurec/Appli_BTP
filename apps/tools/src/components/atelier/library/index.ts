/**
 * Bibliothèque visuelle des modèles ELSATIA (TRACING-WORKSHOP-UI-V1 §5/§7).
 *
 * Projection du registre géométrique réel : aucun modèle n'est défini ici, aucun aperçu
 * n'est une image — les vignettes sont générées par le moteur.
 */

export { ModelCard, type ModelCardProps } from "./ModelCard";
export { ModelThumbnail } from "./ModelThumbnail";
export {
  DIFFICULTY_LABELS,
  buildTraceLibrary,
  filterLibrary,
  headlineParameters,
  libraryFamilies,
  libraryOuvrages,
  type LibraryEntry,
  type LibraryFamilyId,
  type LibraryFilter,
} from "./library-model";
