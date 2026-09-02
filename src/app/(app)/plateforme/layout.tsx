import { exigerAal2Plateforme } from "@/lib/auth/mfa-server";

export default async function PlateformeLayout({ children }: { children: React.ReactNode }) {
  await exigerAal2Plateforme("/plateforme");
  return children;
}
