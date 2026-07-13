import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { validerJustificatif } from "@/lib/expenses/files";
import { sha256 } from "@/lib/expenses/integrity";
import { timestampProvider } from "@/lib/expenses/timestamp";
import { ajouterAudit } from "@/lib/expenses/audit";

export const runtime = "nodejs";

const TYPES = new Set([
  "facture", "ticket_caisse", "recu_paiement", "recu_carte_bancaire",
  "facture_electronique_originale", "autre_justificatif",
]);

export async function POST(request: Request) {
  if (isEmailLoginDisabled()) return NextResponse.json({ error: "Compte personnel sécurisé requis" }, { status: 403 });
  try {
    const ctx = await getContexteEntreprise();
    const supabase = await createClient();
    const form = await request.formData();
    const noteId = String(form.get("note_id") ?? "");
    const typeDocument = String(form.get("type_document") ?? "");
    const documentEntier = form.get("document_entier") === "1";
    const fichiers = form.getAll("fichiers").filter((item): item is File => item instanceof File && item.size > 0);
    if (!/^[0-9a-f-]{36}$/i.test(noteId)) return NextResponse.json({ error: "Dépense invalide" }, { status: 400 });
    if (!TYPES.has(typeDocument)) return NextResponse.json({ error: "Type de justificatif invalide" }, { status: 400 });
    if (!documentEntier) return NextResponse.json({ error: "Confirmez que le document est visible en entier" }, { status: 400 });
    if (!fichiers.length || fichiers.length > 20) return NextResponse.json({ error: "Ajoutez entre 1 et 20 pages" }, { status: 400 });

    const [{ data: note }, { data: politique }] = await Promise.all([
      supabase.from("notes_frais").select("id,entreprise_id,statut,verrouille_at").eq("id", noteId).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
      supabase.from("politiques_conservation_notes_frais").select("mode_archivage,taille_max_octets,analyse_antivirus_obligatoire").eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    ]);
    if (!note) return NextResponse.json({ error: "Dépense inaccessible" }, { status: 404 });
    if (note.verrouille_at || !["brouillon", "a_completer", "correction_demandee"].includes(note.statut)) {
      return NextResponse.json({ error: "Cette dépense ne peut plus recevoir de remplacement. Ajoutez une nouvelle version administrative." }, { status: 409 });
    }
    if (politique?.analyse_antivirus_obligatoire) {
      return NextResponse.json({ error: "L’analyse antivirus obligatoire n’est pas encore reliée à un prestataire réel" }, { status: 503 });
    }

    const tailleMax = Number(politique?.taille_max_octets ?? 15 * 1024 * 1024);
    const prepares = await Promise.all(fichiers.map(async (fichier) => {
      const bytes = new Uint8Array(await fichier.arrayBuffer());
      const format = validerJustificatif(bytes, fichier.name, tailleMax);
      return { fichier, bytes, ...format, empreinte: sha256(bytes) };
    }));
    const controlesDoublons = await Promise.all(prepares.map((item) => supabase.rpc("existe_doublon_note_frais", {
      p_entreprise_id: ctx.entrepriseId,
      p_empreinte: item.empreinte,
      p_note_id: noteId,
    })));
    const doublonPossible = controlesDoublons.some((resultat) => resultat.data === true);

    const premier = prepares[0];
    const { data: document, error: documentError } = await supabase.from("documents_notes_frais").insert({
      entreprise_id: ctx.entrepriseId,
      note_frais_id: noteId,
      type_document: typeDocument,
      facture_electronique_originale: typeDocument === "facture_electronique_originale",
      nombre_pages: prepares.length,
      nom_fichier_original: premier.fichier.name,
      type_mime_original: premier.mime,
      taille_originale: prepares.reduce((total, item) => total + item.bytes.length, 0),
      empreinte_sha256_originale: premier.empreinte,
      importe_par: ctx.userId,
    }).select("id").single();
    if (documentError || !document) throw new Error(documentError?.message ?? "Création du document impossible");

    const horodatage = await timestampProvider().timestamp(premier.empreinte);
    for (let index = 0; index < prepares.length; index += 1) {
      const item = prepares[index];
      const page = index + 1;
      const base = `companies/${ctx.entrepriseId}/expenses/${noteId}`;
      const originalPath = `${base}/original/${document.id}/${crypto.randomUUID()}.${item.extension}`;
      const { error: uploadError } = await supabase.storage.from("notes-frais").upload(originalPath, item.bytes, {
        contentType: item.mime,
        upsert: false,
        cacheControl: "0",
      });
      if (uploadError) throw new Error(uploadError.message);
      const { error: versionError } = await supabase.from("versions_documents_notes_frais").insert({
        entreprise_id: ctx.entrepriseId,
        document_id: document.id,
        numero_version: 1,
        numero_page: page,
        role_fichier: "original",
        storage_path: originalPath,
        nom_fichier_original: item.fichier.name,
        type_mime_declare: item.fichier.type || null,
        type_mime_detecte: item.mime,
        taille_octets: item.bytes.length,
        empreinte_sha256: item.empreinte,
        antivirus_statut: "non_configure",
        horodatage_provider: horodatage.provider,
        horodatage_reference: horodatage.reference,
        created_by: ctx.userId,
      });
      if (versionError) throw new Error(versionError.message);

      if (politique?.mode_archivage === "reinforced_archive") {
        const archivePath = `${base}/archive/${document.id}/${crypto.randomUUID()}.${item.extension}`;
        const { error: archiveUploadError } = await supabase.storage.from("notes-frais").upload(archivePath, item.bytes, {
          contentType: item.mime,
          upsert: false,
          cacheControl: "0",
        });
        if (archiveUploadError) throw new Error(archiveUploadError.message);
        const { error: archiveVersionError } = await supabase.from("versions_documents_notes_frais").insert({
          entreprise_id: ctx.entrepriseId,
          document_id: document.id,
          numero_version: 1,
          numero_page: page,
          role_fichier: "archive_figee",
          storage_path: archivePath,
          nom_fichier_original: item.fichier.name,
          type_mime_declare: item.fichier.type || null,
          type_mime_detecte: item.mime,
          taille_octets: item.bytes.length,
          empreinte_sha256: item.empreinte,
          transformation: "copie_octet_pour_octet",
          antivirus_statut: "non_configure",
          horodatage_provider: horodatage.provider,
          horodatage_reference: horodatage.reference,
          created_by: ctx.userId,
        });
        if (archiveVersionError) throw new Error(archiveVersionError.message);
      }
      await ajouterAudit(supabase, {
        entrepriseId: ctx.entrepriseId,
        action: "fichier_importe",
        ressourceType: "document_note_frais",
        ressourceId: document.id,
        empreinteDocument: item.empreinte,
        metadata: { page, mime: item.mime, taille: item.bytes.length, nomOriginal: item.fichier.name },
      });
    }
    if (politique?.mode_archivage === "reinforced_archive") {
      await supabase.from("documents_notes_frais").update({ empreinte_sha256_archive: premier.empreinte }).eq("id", document.id);
    }
    await ajouterAudit(supabase, {
      entrepriseId: ctx.entrepriseId,
      action: "document_cree",
      ressourceType: "note_frais",
      ressourceId: noteId,
      metadata: { documentId: document.id, pages: prepares.length, typeDocument },
    });
    return NextResponse.json({
      success: true,
      documentId: document.id,
      doublonPossible,
      message: doublonPossible ? "Document ajouté. Une empreinte identique existe déjà dans l’entreprise : vérification recommandée." : "Document ajouté et empreinte enregistrée.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import impossible" }, { status: 400 });
  }
}
