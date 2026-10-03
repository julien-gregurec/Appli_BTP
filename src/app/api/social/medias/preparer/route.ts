import { NextResponse } from "next/server";
import { adminSocial, consommerQuota, exigerSocial } from "@/lib/social/acces";
import { extension, validerTeleversement } from "@/lib/social/medias";
import { BUCKET_SOCIAL } from "@/lib/social/publication";

// Prépare un téléversement direct navigateur → stockage privé (lien signé à usage unique).
// Le fichier ne transite pas par la fonction serveur (limite de taille des requêtes).
export async function POST(request: Request) {
  let utilisateurId: string;
  try {
    utilisateurId = (await exigerSocial("televerser")).utilisateurId;
  } catch {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (!(await consommerQuota(`televersement:${utilisateurId}`, 60, 3600))) return NextResponse.json({ error: "Trop de téléversements : réessayer plus tard" }, { status: 429 });
  const corps = (await request.json().catch(() => null)) as { mime?: string; taille?: number } | null;
  const mime = String(corps?.mime ?? "");
  const erreur = validerTeleversement(mime, Number(corps?.taille ?? 0));
  if (erreur) return NextResponse.json({ error: erreur }, { status: 400 });
  const chemin = `televersements/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${extension(mime)}`;
  const { data, error } = await adminSocial().storage.from(BUCKET_SOCIAL).createSignedUploadUrl(chemin);
  if (error || !data) return NextResponse.json({ error: "Téléversement impossible à préparer" }, { status: 503 });
  return NextResponse.json({ chemin, token: data.token });
}
