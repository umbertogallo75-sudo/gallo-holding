import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

function analyticsOnlyEnvironment() {
  return {
    ...process.env,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-TEST12345",
    NEXT_PUBLIC_GOOGLE_ADS_ID: "",
    NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "",
    NEXT_PUBLIC_META_PIXEL_ID: "",
    NEXT_PUBLIC_LINKEDIN_PARTNER_ID: "",
    NEXT_PUBLIC_LINKEDIN_SIGNUP_CONVERSION_ID: "",
  };
}

function linkedinOnlyEnvironment(conversionId?: string) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: "",
    NEXT_PUBLIC_GOOGLE_ADS_ID: "",
    NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "",
    NEXT_PUBLIC_META_PIXEL_ID: "",
    NEXT_PUBLIC_LINKEDIN_PARTNER_ID: "9624362",
  };

  delete environment.NEXT_PUBLIC_LINKEDIN_SIGNUP_CONVERSION_ID;
  if (conversionId !== undefined) {
    environment.NEXT_PUBLIC_LINKEDIN_SIGNUP_CONVERSION_ID = conversionId;
  }

  return environment;
}

describe("reportSignupConversion con GA4", () => {
  it("invia sign_up una sola volta allo stream Analytics configurato", async () => {
    const before = { ...process.env };
    const gtag = vi.fn();

    try {
      process.env = analyticsOnlyEnvironment();
      vi.stubGlobal("window", { gtag });

      vi.resetModules();
      const { reportSignupConversion } = await import("@/lib/conversions");
      reportSignupConversion();
      reportSignupConversion();

      expect(gtag).toHaveBeenCalledTimes(1);
      expect(gtag).toHaveBeenCalledWith("event", "sign_up", {
        send_to: "G-TEST12345",
      });
    } finally {
      process.env = before;
    }
  });

  it("recupera una registrazione OAuth se il consenso esiste ma la queue non è ancora pronta", async () => {
    const before = { ...process.env };
    const gtag = vi.fn();
    let ready: (() => void) | undefined;
    const browser = {
      gtag: undefined as typeof gtag | undefined,
      addEventListener: vi.fn((_name: string, listener: () => void) => {
        ready = listener;
      }),
    };

    try {
      process.env = analyticsOnlyEnvironment();
      vi.stubGlobal("window", browser);
      vi.stubGlobal("document", {
        cookie: "eb_consent=2%3Agranted%3Atest-receipt",
      });

      vi.resetModules();
      const { reportSignupConversion } = await import("@/lib/conversions");
      reportSignupConversion();
      reportSignupConversion();

      expect(browser.addEventListener).toHaveBeenCalledTimes(1);
      expect(gtag).not.toHaveBeenCalled();

      browser.gtag = gtag;
      ready?.();

      expect(gtag).toHaveBeenCalledTimes(1);
      expect(gtag).toHaveBeenCalledWith("event", "sign_up", {
        send_to: "G-TEST12345",
      });
    } finally {
      process.env = before;
    }
  });

  it("non accoda conversioni avvenute senza consenso", async () => {
    const before = { ...process.env };
    const addEventListener = vi.fn();

    try {
      process.env = analyticsOnlyEnvironment();
      vi.stubGlobal("window", { addEventListener });
      vi.stubGlobal("document", {
        cookie: "eb_consent=2%3Adenied%3Atest-receipt",
      });

      vi.resetModules();
      const { reportSignupConversion } = await import("@/lib/conversions");
      reportSignupConversion();

      expect(addEventListener).not.toHaveBeenCalled();
    } finally {
      process.env = before;
    }
  });
});

describe("reportSignupConversion con LinkedIn", () => {
  it("invia una sola volta la conversione specifica configurata per ExecLingo", async () => {
    const before = { ...process.env };
    const lintrk = vi.fn();

    try {
      process.env = linkedinOnlyEnvironment();
      vi.stubGlobal("window", { lintrk });

      vi.resetModules();
      const { reportSignupConversion } = await import("@/lib/conversions");
      reportSignupConversion();
      reportSignupConversion();

      expect(lintrk).toHaveBeenCalledTimes(1);
      expect(lintrk).toHaveBeenCalledWith("track", {
        conversion_id: 29840122,
      });
    } finally {
      process.env = before;
    }
  });

  it("ignora un Conversion ID non numerico", async () => {
    const before = { ...process.env };
    const lintrk = vi.fn();
    const addEventListener = vi.fn();

    try {
      process.env = linkedinOnlyEnvironment("not-a-number");
      vi.stubGlobal("window", { lintrk, addEventListener });

      vi.resetModules();
      const { reportSignupConversion } = await import("@/lib/conversions");
      reportSignupConversion();

      expect(lintrk).not.toHaveBeenCalled();
      expect(addEventListener).not.toHaveBeenCalled();
    } finally {
      process.env = before;
    }
  });
});
