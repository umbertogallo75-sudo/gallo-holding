import { describe, expect, it } from "vitest";
import { aliasFromAddress, htmlToText, parseInbound, splitAddress, MAX_BODY_CHARS } from "@/lib/mail/inbound";

/**
 * The services that can receive mail for a domain and call a webhook all
 * describe the same message differently. Tying the feature to one supplier's
 * vocabulary before we have picked one is how you end up rewriting it, so
 * these are the shapes actually in use.
 */
describe("reading what an inbound provider sends", () => {
  it("reads the plain shape", () => {
    const mail = parseInbound({
      to: "m-abc123@in.execlingo.it",
      from: "Jane Smith <jane@acme.co.uk>",
      subject: "Q3 pricing",
      text: "Could you confirm the price by Friday?",
    });
    expect(mail).toEqual({
      toAlias: "m-abc123",
      fromAddress: "jane@acme.co.uk",
      fromName: "Jane Smith",
      subject: "Q3 pricing",
      text: "Could you confirm the price by Friday?",
    });
  });

  it("reads addresses given as objects and lists", () => {
    const mail = parseInbound({
      data: {
        to: [{ address: "m-xyz@in.execlingo.it", name: "Sam" }],
        from: [{ email: "bob@example.com", name: "Bob" }],
        subject: "Hi",
        TextBody: "Hello there",
      },
    });
    expect(mail?.toAlias).toBe("m-xyz");
    expect(mail?.fromAddress).toBe("bob@example.com");
    expect(mail?.fromName).toBe("Bob");
    expect(mail?.text).toBe("Hello there");
  });

  it("falls back to the HTML part when there is no text one", () => {
    const mail = parseInbound({
      to: "m-abc@in.execlingo.it",
      from: "x@y.com",
      "body-html": "<div>Dear Marco,<br>we <b>cannot</b> ship before June.<script>alert(1)</script></div>",
    });
    expect(mail?.text).toBe("Dear Marco,\nwe cannot ship before June.");
    expect(mail?.text).not.toContain("alert");
  });

  it("finds the account whatever the mail system did to the address", () => {
    // Case is not preserved reliably, and a plus tag is how people file mail.
    expect(aliasFromAddress("M-ABC123@IN.EXECLINGO.IT")).toBe("m-abc123");
    expect(aliasFromAddress("m-abc123+cliente@in.execlingo.it")).toBe("m-abc123");
    expect(aliasFromAddress("Sam <m-abc123@in.execlingo.it>")).toBe("m-abc123");
  });

  it("refuses what it cannot route", () => {
    expect(parseInbound(null)).toBeNull();
    expect(parseInbound({ from: "a@b.com", text: "hi" })).toBeNull();
    expect(parseInbound("not an object")).toBeNull();
  });

  it("caps the body instead of trusting whatever arrives", () => {
    const mail = parseInbound({ to: "m-a@in.execlingo.it", from: "a@b.com", text: "x".repeat(50_000) });
    expect(mail?.text.length).toBe(MAX_BODY_CHARS);
  });

  it("splits a display name from an address, and survives neither", () => {
    expect(splitAddress('"Rossi, Marco" <m@r.it>')).toEqual({ name: "Rossi, Marco", address: "m@r.it" });
    expect(splitAddress("plain@example.com")).toEqual({ name: "", address: "plain@example.com" });
    expect(htmlToText("<p>a</p><p>b</p>")).toBe("a\nb");
  });
});
