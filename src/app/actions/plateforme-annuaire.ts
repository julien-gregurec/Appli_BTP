"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { chargerHabilitationsAnnuaire } from "@/lib/plateforme-annuaire-habilitations";
import { COOKIE_VUE_ANNUAIRE, TAILLE_MAX_VUE } from "@/lib/plateforme-annuaire";

export async function enregistrerVueAnnuaireAction(formData: FormData) {
  const habilitations = await chargerHabilitationsAnnuaire();
  if (!habilitations.peutConsulter) redirect("/dashboard");

  const vue = String(formData.get("vue") ?? "").slice(0, TAILLE_MAX_VUE);
  const magasin = await cookies();
  magasin.set(COOKIE_VUE_ANNUAIRE, vue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/plateforme",
    maxAge: 60 * 60 * 24 * 180,
  });

  redirect(vue ? `/plateforme/entreprises?${vue}` : "/plateforme/entreprises");
}

export async function oublierVueAnnuaireAction() {
  const habilitations = await chargerHabilitationsAnnuaire();
  if (!habilitations.peutConsulter) redirect("/dashboard");

  const magasin = await cookies();
  magasin.delete({ name: COOKIE_VUE_ANNUAIRE, path: "/plateforme" });
  redirect("/plateforme/entreprises");
}
