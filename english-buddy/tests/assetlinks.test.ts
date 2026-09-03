import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/assetlinks.json/route";

const ORIGINAL = process.env.ASSETLINKS_SHA256;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ASSETLINKS_SHA256;
  else process.env.ASSETLINKS_SHA256 = ORIGINAL;
});

describe("Android Digital Asset Links", () => {
  it("always publishes the Google Play app-signing certificate", async () => {
    process.env.ASSETLINKS_SHA256 = "34:C7:UPLOAD";

    const response = await GET();
    const body = await response.json();
    const fingerprints = body[0].target.sha256_cert_fingerprints;

    expect(fingerprints).toContain(
      "37:ED:AC:C9:2B:34:2C:74:36:39:21:FF:D2:9E:B5:31:36:D6:5D:CB:CF:ED:1E:D0:3E:9F:71:9D:ED:20:5A:6A"
    );
    expect(fingerprints).toContain("34:C7:UPLOAD");
  });
});
