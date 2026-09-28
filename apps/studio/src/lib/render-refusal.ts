/** Maps a PostgREST error from render admission to a fixed French message and HTTP status. */
const KNOWN: Record<string, { message: string; status: number }> = {
  RENDER_LIMIT_ACTIVE: {
    message:
      "Trop de rendus sont déjà en cours. Attendez la fin d'un rendu ou annulez-en un.",
    status: 429,
  },
  RENDER_LIMIT_RATE: {
    message: "Limite de rendus atteinte pour le moment. Réessayez plus tard.",
    status: 429,
  },
  RENDER_ADMISSION_CLOSED: {
    message: "La création de vidéos est temporairement suspendue.",
    status: 503,
  },
  ASSET_MISSING: {
    message:
      "Un média du montage est introuvable. Vérifiez la médiathèque avant de relancer.",
    status: 400,
  },
  TIMELINE_INVALID: {
    message: "Le montage n'est pas prêt à être rendu. Vérifiez ses durées.",
    status: 400,
  },
};
export function renderRefusal(error: { code?: string; message?: string }): {
  message: string;
  status: number;
} {
  if (error.code === "42501")
    return { message: "Création du rendu refusée.", status: 403 };
  if (error.code === "40001")
    return {
      message: "Cette version a changé. Rechargez avant de lancer le rendu.",
      status: 409,
    };
  const known = error.message ? KNOWN[error.message] : undefined;
  if (known) return known;
  // Other SQL messages are already curated French sentences for validation errors.
  if (error.code === "22023" && error.message)
    return { message: error.message, status: 400 };
  return { message: "Création du rendu refusée.", status: 400 };
}
