import "server-only";
import {
  creerControleAccesApplications,
  type ClientAccesApplications,
} from "@elsatia/application-access";
import { createClient } from "@/lib/supabase/server";

export {
  AccesApplicationRefuseError,
  CODES_APPLICATIONS_ELSATIA,
} from "@elsatia/application-access";
export type {
  ApplicationElsatiaAutorisee,
  CodeApplicationElsatia,
} from "@elsatia/application-access";

const controle = creerControleAccesApplications(async () => (
  await createClient() as unknown as ClientAccesApplications
));

export const verifierAccesApplication = controle.verifierAccesApplication;
export const exigerAccesApplication = controle.exigerAccesApplication;
export const listerApplicationsAutorisees = controle.listerApplicationsAutorisees;
