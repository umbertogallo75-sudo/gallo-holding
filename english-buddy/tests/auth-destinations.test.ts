import { describe, expect, it } from "vitest";
import {
  LOGIN_SUCCESS_PATH,
  oauthSuccessPath,
  PASSWORD_SIGNUP_SUCCESS_PATH,
} from "@/lib/auth-destinations";

describe("post-authentication destinations", () => {
  it("keeps the public home separate from product and onboarding routes", () => {
    expect(LOGIN_SUCCESS_PATH).toBe("/home");
    expect(PASSWORD_SIGNUP_SUCCESS_PATH).toBe("/onboarding");
    expect(oauthSuccessPath(false)).toBe("/home");
    expect(oauthSuccessPath(true)).toBe("/onboarding?signup=1");
  });
});
