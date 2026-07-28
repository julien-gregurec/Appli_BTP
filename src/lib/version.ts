export type InformationsVersion = {
  version: string;
  commit: string;
  dateBuild: string;
  environnement: string;
  dateDeploiement: string;
  urlDeploiement: string | null;
};

export function informationsVersion(): InformationsVersion {
  return {
    version: process.env.LIRIA_APP_VERSION || "indisponible",
    commit: process.env.LIRIA_BUILD_COMMIT || "indisponible",
    dateBuild: process.env.LIRIA_BUILD_DATE || "indisponible",
    environnement: process.env.LIRIA_BUILD_ENVIRONMENT || process.env.NODE_ENV || "indisponible",
    dateDeploiement: process.env.LIRIA_DEPLOYMENT_DATE || process.env.LIRIA_BUILD_DATE || "indisponible",
    urlDeploiement: process.env.LIRIA_DEPLOYMENT_URL || null,
  };
}

export function formatDateVersion(value: string) {
  if (value === "indisponible") return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "medium",
    timeZone: "Europe/Paris",
  }).format(date);
}
