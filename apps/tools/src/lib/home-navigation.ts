import type { CategoryId } from "./categories";

export function toggleCategoryFilter(current: CategoryId | null, requested: CategoryId): CategoryId | null {
  return current === requested ? null : requested;
}

export function revealFilteredTools(target: Pick<HTMLElement, "scrollIntoView"> | null): boolean {
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}
