import { NextResponse } from "next/server";

// Google Play Console > Integrità dell'app > Certificato di firma dell'app.
// This is the certificate Android sees after Play App Signing; the upload-key
// certificate alone cannot verify production installs.
const PLAY_APP_SIGNING_SHA256 =
  "37:ED:AC:C9:2B:34:2C:74:36:39:21:FF:D2:9E:B5:31:36:D6:5D:CB:CF:ED:1E:D0:3E:9F:71:9D:ED:20:5A:6A";

/**
 * Digital Asset Links: proves that the Android app (TWA) and execlingo.it
 * are the same owner, so the app opens fullscreen without browser chrome.
 * The SHA-256 fingerprints arrive from the Play Console after the first
 * upload — set ASSETLINKS_SHA256 (comma-separated) without code changes.
 */
export async function GET() {
  const prints = Array.from(new Set([
    PLAY_APP_SIGNING_SHA256,
    ...(process.env.ASSETLINKS_SHA256 ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]));
  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "it.execlingo.app",
        sha256_cert_fingerprints: prints,
      },
    },
  ]);
}
