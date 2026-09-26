import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function autorise(request: NextRequest) {
  const secret = process.env.PAYROLL_IMPORT_SECRET;
  const recu = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || secret.length < 32 || !recu) return false;
  const a = Buffer.from(recu);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!autorise(request)) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  const formData = await request.formData();
  const entrepriseReference = String(formData.get("entreprise_reference") ?? "").trim();
  const employeReference = String(formData.get("employe_reference") ?? "").trim();
  const periodeSaisie = String(formData.get("periode") ?? "").trim();
  const montant = Number(formData.get("montant_net_a_payer"));
  const datePaiement = String(formData.get("date_paiement_prevue") ?? "").trim() || null;
  const reference = String(formData.get("reference_expert_comptable") ?? "").trim() || null;
  const fichier = formData.get("bulletin");
  if (!entrepriseReference || !employeReference || !/^\d{4}-\d{2}$/.test(periodeSaisie) || !Number.isFinite(montant) || montant <= 0 || !(fichier instanceof File)) {
    return NextResponse.json({ error: "Données de paie invalides" }, { status: 400 });
  }
  if (fichier.size === 0 || fichier.size > 20 * 1024 * 1024) return NextResponse.json({ error: "PDF absent ou trop volumineux" }, { status: 400 });
  const contenu = Buffer.from(await fichier.arrayBuffer());
  if (contenu.subarray(0, 5).toString("ascii") !== "%PDF-") return NextResponse.json({ error: "Le fichier n’est pas un PDF valide" }, { status: 415 });
  const admin = createAdminClient();
  const { data: entreprise } = await admin.from("entreprises").select("id").eq("reference_interne", entrepriseReference).maybeSingle();
  if (!entreprise) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });
  // ACL canonique (migration 255) : service_role ne lit plus `employes` ni `bulletins_paie`. Résolution du
  // salarié et enregistrement (bulletin + trace bancaire, dans la même transaction) passent par des RPC de
  // service ; une panne de lecture n'est plus confondue avec un salarié inconnu.
  const periode = `${periodeSaisie}-01`;
  const { data: preparation, error: preparationError } = await admin.rpc("paie_import_preparer_bulletin_service", {
    p_entreprise_id: entreprise.id,
    p_employe_reference: employeReference,
    p_periode: periode,
  });
  if (preparationError) return NextResponse.json({ error: "Import temporairement indisponible" }, { status: 503 });
  const cible = (preparation as Array<{ employe_id: string; version: number }> | null)?.[0];
  if (!cible) return NextResponse.json({ error: "Salarié introuvable" }, { status: 404 });
  const { employe_id: employeId, version } = cible;
  const empreinte = createHash("sha256").update(contenu).digest("hex");
  const nomSain = fichier.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "bulletin.pdf";
  const storagePath = `${entreprise.id}/${employeId}/${periodeSaisie}/v${version}-${randomUUID()}-${nomSain}`;
  const { error: uploadError } = await admin.storage.from("bulletins-paie").upload(storagePath, contenu, { contentType: "application/pdf", upsert: false });
  if (uploadError) return NextResponse.json({ error: "Stockage du bulletin impossible" }, { status: 502 });
  const { data: bulletinId, error: insertError } = await admin.rpc("paie_import_enregistrer_bulletin_service", {
    p_entreprise_id: entreprise.id,
    p_employe_id: employeId,
    p_periode: periode,
    p_version: version,
    p_montant_net: montant,
    p_date_paiement_prevue: datePaiement,
    p_nom_fichier: fichier.name,
    p_taille_octets: fichier.size,
    p_empreinte_sha256: empreinte,
    p_storage_path: storagePath,
    p_reference_expert_comptable: reference,
  });
  if (insertError || !bulletinId) {
    await admin.storage.from("bulletins-paie").remove([storagePath]);
    return NextResponse.json({ error: "Enregistrement du bulletin impossible" }, { status: 500 });
  }
  return NextResponse.json({ id: bulletinId, statut: "a_verifier", message: "Bulletin reçu ; contrôle humain requis avant virement" }, { status: 201 });
}
