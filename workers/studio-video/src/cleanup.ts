/** Only discard an attempted upload after a definitive terminal DB response. */
export function mayDiscardUpload(
  state: { status: string; lease_token: string | null } | null,
  error: unknown,
  lease: string,
): boolean {
  return (
    !error &&
    state?.lease_token === lease &&
    ["failed", "cancelled"].includes(state.status)
  );
}
