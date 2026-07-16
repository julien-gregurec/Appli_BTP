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
  const { data: employe } = await admin.from("employes").select("id").eq("entreprise_id", entreprise.id).eq("reference_interne", employeReference).maybeSingle();
  if (!employe) return NextResponse.json({ error: "Salarié introuvable" }, { status: 404 });
  const periode = `${periodeSaisie}-01`;
  const { data: versions } = await admin.from("bulletins_paie").select("version").eq("entreprise_id", entreprise.id).eq("employe_id", employe.id).eq("periode", periode).order("version", { ascending: false }).limit(1);
  const version = Number(versions?.[0]?.version ?? 0) + 1;
  const empreinte = createHash("sha256").update(contenu).digest("hex");
  const nomSain = fichier.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "bulletin.pdf";
  const storagePath = `${entreprise.id}/${employe.id}/${periodeSaisie}/v${version}-${randomUUID()}-${nomSain}`;
  const { error: uploadError } = await admin.storage.from("bulletins-paie").upload(storagePath, contenu, { contentType: "application/pdf", upsert: false });
  if (uploadError) return NextResponse.json({ error: "Stockage du bulletin impossible" }, { status: 502 });
  const { data: bulletin, error: insertError } = await admin.from("bulletins_paie").insert({
    entreprise_id: entreprise.id,
    employe_id: employe.id,
    periode,
    version,
    montant_net_a_payer: montant,
    date_paiement_prevue: datePaiement,
    statut: "a_verifier",
    nom_fichier_original: fichier.name,
    type_mime: "application/pdf",
    taille_octets: fichier.size,
    empreinte_sha256: empreinte,
    storage_path: storagePath,
    reference_expert_comptable: reference,
  }).select("id").single();
  if (insertError || !bulletin) {
    await admin.storage.from("bulletins-paie").remove([storagePath]);
    return NextResponse.json({ error: "Enregistrement du bulletin impossible" }, { status: 500 });
  }
  await admin.from("journal_paiements_bancaires").insert({ entreprise_id: entreprise.id, action: "bulletin_recu_expert", ressource_type: "bulletin_paie", ressource_id: bulletin.id, nouveau_statut: "a_verifier", metadata: { reference_expert_comptable: reference } });
  return NextResponse.json({ id: bulletin.id, statut: "a_verifier", message: "Bulletin reçu ; contrôle humain requis avant virement" }, { status: 201 });
}
