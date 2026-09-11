import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LETTERS } from "@/lib/games/four-letters";
import {
  closestPair,
  seatCentres,
  seatsFit,
  seatsStayInside,
  SEAT_RADIUS,
  MIN_READABLE_SLOT_PX,
  NARROWEST_PX,
  ORDINARY_PX,
  SHELL_PADDING_PX,
  slotPxFor,
  slotsRowFits,
  slotsRowPx,
  TILE_PX,
  TILE_PX_SMALL,
  tilePxFor,
  WHEEL_PX,
  WHEEL_PX_SMALL,
} from "@/lib/games/wheel-layout";

describe("the letter wheel", () => {
  it("spreads the seats evenly around the ring, starting at the top", () => {
    const seats = seatCentres(4);
    expect(seats).toHaveLength(4);
    // First one straight up, then clockwise.
    expect(seats[0].x).toBeCloseTo(50);
    expect(seats[0].y).toBeCloseTo(50 - SEAT_RADIUS);
    expect(seats[1].x).toBeCloseTo(50 + SEAT_RADIUS);
    expect(seats[1].y).toBeCloseTo(50);
    expect(seats[2].y).toBeCloseTo(50 + SEAT_RADIUS);
    // Every seat is exactly the radius from the middle.
    for (const seat of seats) expect(Math.hypot(seat.x - 50, seat.y - 50)).toBeCloseTo(SEAT_RADIUS);
  });

  it("never puts two letters on top of each other — the bug this file exists for", () => {
    // Both screen sizes the stylesheet declares, at the size the game deals.
    expect(seatsFit(LETTERS, WHEEL_PX, TILE_PX)).toBe(true);
    expect(seatsFit(LETTERS, WHEEL_PX_SMALL, TILE_PX_SMALL)).toBe(true);
    // And with room to spare, so a slightly narrower phone is still fine.
    const gap = (closestPair(seatCentres(LETTERS)) / 100) * WHEEL_PX_SMALL;
    expect(gap).toBeGreaterThan(TILE_PX_SMALL * 1.15);
  });

  it("fits every tray size the games actually deal, on both screens", () => {
    // Four letters for one game, six to nine for the long-word one.
    for (let count = 4; count <= 9; count += 1) {
      expect(seatsFit(count, WHEEL_PX, tilePxFor(count)), `${count} lettere, schermo largo`).toBe(true);
      expect(seatsFit(count, WHEEL_PX_SMALL, tilePxFor(count, true)), `${count} lettere, schermo stretto`).toBe(true);
      // Not merely touching: a finger needs room between them.
      const gap = (closestPair(seatCentres(count)) / 100) * WHEEL_PX_SMALL;
      expect(gap, `${count} lettere: troppo stretto`).toBeGreaterThan(tilePxFor(count, true) * 1.15);
      expect(seatsStayInside(WHEEL_PX, tilePxFor(count))).toBe(true);
      expect(seatsStayInside(WHEEL_PX_SMALL, tilePxFor(count, true))).toBe(true);
    }
  });

  it("shrinks the tiles as the ring gets crowded, never the other way", () => {
    for (let count = 4; count < 9; count += 1) {
      expect(tilePxFor(count + 1)).toBeLessThanOrEqual(tilePxFor(count));
      expect(tilePxFor(count, true)).toBeLessThan(tilePxFor(count));
    }
  });

  it("keeps every tile inside the ring it is drawn in", () => {
    expect(seatsStayInside(WHEEL_PX, TILE_PX)).toBe(true);
    expect(seatsStayInside(WHEEL_PX_SMALL, TILE_PX_SMALL)).toBe(true);
  });

  it("would refuse a layout that does not fit, rather than quietly overlapping", () => {
    // Sanity: the check has to be able to fail, or it proves nothing above.
    expect(seatsFit(4, 120, 78)).toBe(false);
    expect(seatsStayInside(200, 190)).toBe(false);
    expect(seatsFit(12, WHEEL_PX_SMALL, TILE_PX)).toBe(false);
  });

  it("is positioned with left/top, not with a percentage translate", () => {
    // A percentage inside translate() resolves against the element's own box,
    // which is exactly how the letters ended up stacked in the middle.
    const css = readFileSync(join(__dirname, "..", "src", "app", "palestra", "wheel.module.css"), "utf8");
    const tileRule = css.slice(css.indexOf(".tile {"), css.indexOf("}", css.indexOf(".tile {")));
    expect(tileRule).toContain("left:var(--x)");
    expect(tileRule).toContain("top:var(--y)");
    expect(tileRule).not.toMatch(/translateY\(calc\(var\(--r\)/);
  });

  it("fits the row of slots on one line on an ordinary phone", () => {
    // The bug: nine slots at the four-letter size came to 494px against the
    // 357 an ordinary phone gives you. A row that does not fit does not just
    // look cramped — it widens the page and drags the score bar and the
    // buttons off the right edge with it.
    for (let count = 4; count <= 9; count += 1) {
      expect(slotsRowFits(count, ORDINARY_PX), `${count} caselle su ${ORDINARY_PX}px`).toBe(true);
    }
  });

  it("lets the row wrap on a narrow phone instead of shrinking past legibility", () => {
    // Below about 32px a circle stops being a letter you can read, so the row
    // folds rather than shrinking further — and the stylesheet is what makes
    // folding safe. Without flex-wrap the row would widen the page again.
    const css = readFileSync(join(__dirname, "..", "src", "app", "palestra", "wheel.module.css"), "utf8");
    const rule = css.slice(css.indexOf(".slots {"), css.indexOf("}", css.indexOf(".slots {")));
    expect(rule).toContain("flex-wrap:wrap");
    expect(rule).toContain("max-width:100%");
    for (let count = 4; count <= 9; count += 1) {
      expect(slotPxFor(count), `${count} caselle`).toBeGreaterThanOrEqual(MIN_READABLE_SLOT_PX);
    }
    // A single slot always fits, so a folded row can never overflow.
    expect(slotsRowFits(1, NARROWEST_PX)).toBe(true);
  });

  it("shrinks the slots as the word gets longer, never the other way", () => {
    for (let count = 4; count < 9; count += 1) {
      expect(slotPxFor(count + 1)).toBeLessThanOrEqual(slotPxFor(count));
    }
  });

  it("would refuse a row that does not fit, so the check above means something", () => {
    expect(slotsRowFits(20, NARROWEST_PX)).toBe(false);
    expect(slotsRowFits(9, 200)).toBe(false);
    expect(slotsRowPx(9)).toBeGreaterThan(slotsRowPx(4));
    expect(slotsRowPx(0)).toBe(0);
    expect(SHELL_PADDING_PX).toBeGreaterThan(0);
  });
});
