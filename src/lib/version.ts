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
    version: process.env.ELSATIA_APP_VERSION || "indisponible",
    commit: process.env.ELSATIA_BUILD_COMMIT || "indisponible",
    dateBuild: process.env.ELSATIA_BUILD_DATE || "indisponible",
    environnement: process.env.ELSATIA_BUILD_ENVIRONMENT || process.env.NODE_ENV || "indisponible",
    dateDeploiement: process.env.ELSATIA_DEPLOYMENT_DATE || process.env.ELSATIA_BUILD_DATE || "indisponible",
    urlDeploiement: process.env.ELSATIA_DEPLOYMENT_URL || null,
  };
}

// Formateur construit une seule fois : voir ELSATIA_NEXT_MEMORY_CAPACITY_V1.
const FORMAT_DATE_VERSION = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "medium",
  timeZone: "Europe/Paris",
});

export function formatDateVersion(value: string) {
  if (value === "indisponible") return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return FORMAT_DATE_VERSION.format(date);
}
