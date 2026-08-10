import { NextResponse } from "next/server";

/**
 * Digital Asset Links: proves that the Android app (TWA) and execlingo.it
 * are the same owner, so the app opens fullscreen without browser chrome.
 * The SHA-256 fingerprints arrive from the Play Console after the first
 * upload — set ASSETLINKS_SHA256 (comma-separated) without code changes.
 */
export async function GET() {
  const prints = (process.env.ASSETLINKS_SHA256 ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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
