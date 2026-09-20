import { resolveShare } from "../../../../lib/shares";
export const runtime = "nodejs";
/** Fresh one-minute URL for the shared video (the page renews it when playback fails after expiry). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const share = await resolveShare(token);
  return Response.json(share ? { url: share.url } : { error: "Lien indisponible." }, {
    status: share ? 200 : 404,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
