import "server-only";
export class StudioAuthUnavailable extends Error {
  constructor() {
    super(
      "Authentification temporairement indisponible. Réessayez dans un instant.",
    );
  }
}
/** Verify with Auth, never infer identity from a cached session. One infrastructure-only retry. */
export async function verifiedUser<T>(
  read: () => Promise<{
    data: { user: T | null };
    error: { name: string; status?: number } | null;
  }>,
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await read();
    if (!error) return data.user;
    const transient =
      error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500;
    if (!transient) return null;
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new StudioAuthUnavailable();
}
