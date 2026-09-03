import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// These checks intentionally inspect source configuration so the privacy
// guard also runs in web CI, where an Android SDK is not installed. The
// release gate must additionally inspect the final AAB's merged manifest.
const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8")
  .replace(/<!--[\s\S]*?-->/g, "");
const gradle = readFileSync(new URL("../android/app/build.gradle.kts", import.meta.url), "utf8")
  .replace(/\/\/[^\n]*/g, "");

function attributesFor(tagName: string, androidName: string): Record<string, string>[] {
  const tags = manifest.match(new RegExp(`<${tagName}\\b[^>]*>`, "g")) ?? [];
  return tags.map((tag) => Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((match) => [match[1], match[2]]),
  )).filter((attributes) => attributes["android:name"] === androidName);
}

describe("Android privacy configuration before native consent is implemented", () => {
  it("does not include the native Firebase Analytics or advertising SDKs", () => {
    expect(gradle).not.toMatch(/com\.google\.firebase:firebase-analytics/);
    expect(gradle).not.toMatch(/com\.google\.android\.gms:play-services-(?:ads|measurement)/);
  });

  it("deactivates native Analytics and advertising ID collection explicitly", () => {
    expect(attributesFor("meta-data", "firebase_analytics_collection_deactivated"))
      .toEqual([expect.objectContaining({ "android:value": "true" })]);
    expect(attributesFor("meta-data", "google_analytics_adid_collection_enabled"))
      .toEqual([expect.objectContaining({ "android:value": "false" })]);
  });

  it("removes advertising permissions inherited from transitive SDK manifests", () => {
    expect(manifest).toContain('xmlns:tools="http://schemas.android.com/tools"');
    for (const permission of [
      "com.google.android.gms.permission.AD_ID",
      "android.permission.ACCESS_ADSERVICES_AD_ID",
      "android.permission.ACCESS_ADSERVICES_ATTRIBUTION",
    ]) {
      expect(attributesFor("uses-permission", permission))
        .toEqual([expect.objectContaining({ "tools:node": "remove" })]);
    }
  });

  it("preserves opt-in FCM, install attribution and native Billing", () => {
    expect(attributesFor("meta-data", "firebase_messaging_auto_init_enabled"))
      .toEqual([expect.objectContaining({ "android:value": "false" })]);
    expect(attributesFor("meta-data", "firebase_messaging_installation_id_enabled"))
      .toEqual([expect.objectContaining({ "android:value": "true" })]);
    expect(gradle).toContain('implementation("com.google.firebase:firebase-installations")');
    expect(gradle).toContain('implementation("com.google.firebase:firebase-messaging")');
    expect(gradle).toMatch(/implementation\("com\.android\.installreferrer:installreferrer:/);
    expect(gradle).toMatch(/implementation\("com\.android\.billingclient:billing-ktx:/);
  });
});
