import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidePlayer } from "@/app/guida/GuidePlayer";
import { guides, type GuideKey } from "@/lib/guide";

// Vitest's node transform uses classic JSX; production uses Next's transform.
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const render = (initial: GuideKey, startAt = 0) => renderToStaticMarkup(
  React.createElement(GuidePlayer, { guides: guides(), initial, startAt }),
);

describe("the guide's first response", () => {
  it("renders useful content without connecting to YouTube", () => {
    const html = render("manuale");
    expect(html).toContain("Carica il video YouTube");
    expect(html).toContain("16 capitoli");
    expect(html).toContain("Notifiche e comunicazioni");
    expect(html).toContain("Sottotitoli SRT");
    expect(html).not.toMatch(/<(?:iframe|script|video)\b/);
    expect(html).not.toMatch(/(?:src|href)=["'][^"']+\.mp4/);
  });

  it("prepares a deep-linked chapter without autoplay", () => {
    const html = render("manuale", 416.34646258503403);
    expect(html).toContain("Partenza da 6:56");
    expect(html).toContain("aria-current=\"true\"");
    expect(html).toContain("t=416s");
    expect(html).not.toContain("<iframe");
  });

  it("offers the short film with its own seven chapters and captions", () => {
    const html = render("sintesi");
    expect(html).toContain("7 capitoli");
    expect(html).toContain("3:00");
    expect(html).toContain("ExecLingo_Sintesi_3min.srt");
    expect(html).not.toContain("ExecLingo_Manuale.srt");
    expect(html).toContain("dEGY0PMMO7M");
  });
});
