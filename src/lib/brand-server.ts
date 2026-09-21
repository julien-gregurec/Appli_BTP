import "server-only";
import { creerConfigurationMarqueServeur } from "@/lib/brand";

export const BRAND_SERVER = creerConfigurationMarqueServeur(process.env);
