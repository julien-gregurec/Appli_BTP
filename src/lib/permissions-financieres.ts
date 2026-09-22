export function peutExporterComptabilite(permissions: string[] | null): boolean {
  return permissions === null || permissions.includes("acces_exports");
}
