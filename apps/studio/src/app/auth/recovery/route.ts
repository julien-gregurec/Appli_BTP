import { NextResponse, type NextRequest } from "next/server";
import { createStudioClient } from "../../../lib/supabase";
import { studioOrigin } from "../../../lib/config";
import { notices } from "../../../lib/notices";
/** Password-recovery links: PKCE code, or token_hash for a custom email template. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const client = await createStudioClient();
  let failed = true;
  if (code) failed = !!(await client.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && request.nextUrl.searchParams.get("type") === "recovery")
    failed = !!(await client.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }))
      .error;
  return NextResponse.redirect(
    new URL(
      failed
        ? `/login?error=${encodeURIComponent(notices.invalidLink)}`
        : "/reset-password",
      studioOrigin(),
    ),
  );
}
