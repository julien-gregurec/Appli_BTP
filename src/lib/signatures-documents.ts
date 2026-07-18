export const TYPES_DOCUMENT_SIGNATURE = [
  "devis",
  "facture",
  "commande",
  "intervention",
  "bon_livraison",
] as const;

export type TypeDocumentSignature = (typeof TYPES_DOCUMENT_SIGNATURE)[number];

export type SignatureDocument = {
  id: string;
  employe_id: string;
  nom_signataire: string;
  fonction_signataire: string | null;
  signature_sha256: string;
  document_sha256: string;
  signed_at: string;
  declaration: string;
};

export const LIBELLES_DOCUMENT_SIGNATURE: Record<TypeDocumentSignature, string> = {
  devis: "devis",
  facture: "facture",
  commande: "bon de commande",
  intervention: "bon d’intervention",
  bon_livraison: "bon de livraison",
};

export function estTypeDocumentSignature(value: string): value is TypeDocumentSignature {
  return (TYPES_DOCUMENT_SIGNATURE as readonly string[]).includes(value);
}

export function cheminRetourSignature(type: TypeDocumentSignature, documentId: string) {
  switch (type) {
    case "devis": return `/devis/${documentId}`;
    case "facture": return `/factures/${documentId}`;
    case "commande": return `/commandes/${documentId}`;
    case "intervention":
    case "bon_livraison": return "/interventions";
  }
}

// Sérialisation stable : deux objets équivalents produisent la même empreinte,
// indépendamment de l'ordre des clés renvoyées par le client SQL.
export function serialiserDocumentStable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serialiserDocumentStable).join(",")}]`;
  if (value && typeof value === "object") {
    const objet = value as Record<string, unknown>;
    return `{${Object.keys(objet).sort().map((cle) => `${JSON.stringify(cle)}:${serialiserDocumentStable(objet[cle])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
