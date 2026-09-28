import { TimelineValidationError } from "./timeline";
import { renderableText } from "./presentation";
export interface BrandKitInput {
  company_name: string;
  tagline: string;
  phone: string;
  website: string;
  email: string;
  logo_asset_id: string | null;
}
export interface StudioBrandKit extends BrandKitInput {
  id: string;
  workspace_id: string;
  revision: number;
  updated_at: string;
  logo: { id: string; original_filename: string } | null;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limits = {
  company_name: 100,
  tagline: 140,
  phone: 40,
  website: 200,
  email: 254,
} as const;
const formats: Partial<Record<keyof typeof limits, RegExp>> = {
  phone: /^[0-9+().\s-]+$/,
  website: /^[A-Za-z0-9.:/_~%?=&#+@-]+$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};
/** Mirrors studio_save_brand_kit so the form answers immediately; the database stays authoritative. */
export function parseBrandKitInput(value: unknown): BrandKitInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TimelineValidationError("Identité de marque invalide.");
  const v = value as Record<string, unknown>;
  const out = {} as BrandKitInput;
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const raw = v[key] ?? "";
    if (typeof raw !== "string")
      throw new TimelineValidationError("Identité de marque invalide.");
    const text = renderableText(raw);
    if (text.length > limits[key])
      throw new TimelineValidationError(
        `Champ trop long (${limits[key]} caractères maximum).`,
      );
    const format = formats[key];
    if (text && format && !format.test(text))
      throw new TimelineValidationError(
        key === "phone"
          ? "Téléphone : chiffres, espaces et + ( ) . - uniquement."
          : key === "website"
            ? "Site : adresse sans espace ni caractère spécial."
            : "Adresse e-mail invalide.",
      );
    out[key] = text;
  }
  const logo = v.logo_asset_id ?? null;
  if (logo !== null && (typeof logo !== "string" || !uuid.test(logo)))
    throw new TimelineValidationError("Logo invalide.");
  out.logo_asset_id = logo;
  return out;
}
