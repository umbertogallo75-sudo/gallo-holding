/**
 * Where the letters sit on the wheel.
 *
 * This lived inside the component, where nothing could check it, and the first
 * version was wrong in a way that only showed on a real screen: it placed the
 * tiles with a percentage translate, which resolves against the tile's own box
 * rather than the wheel's, so every letter landed a letter's width from the
 * centre and they stacked on top of one another. Out here it can be tested.
 *
 * Coordinates are percentages of the wheel, so the component can hand them
 * straight to left/top — which do resolve against the container.
 */

export type Seat = { x: number; y: number };

/** How far from the centre the tiles sit, as a percentage of the wheel. */
export const SEAT_RADIUS = 34;
/** Wheel width in pixels, as the stylesheet sets it, on both screen sizes. */
export const WHEEL_PX = 340;
/** The narrow-screen width, from the max-width:380px block. */
export const WHEEL_PX_SMALL = 315;

/**
 * Tile size by how many letters are on the ring.
 *
 * Nine seats sit far closer together than four — the gap between neighbours
 * shrinks from 48% of the wheel to 23% — so one fixed tile size either wastes
 * the ring at four letters or overlaps at nine. The component sets this as a
 * custom property; seatsFit below is what proves each step is roomy enough.
 */
export function tilePxFor(count: number, small = false): number {
  if (count <= 5) return small ? 68 : 78;
  if (count <= 7) return small ? 60 : 68;
  return small ? 52 : 58;
}

/** The four-letter game's sizes, kept as names for the tests that cite them. */
export const TILE_PX = tilePxFor(4);
export const TILE_PX_SMALL = tilePxFor(4, true);

/** Seats evenly around the ring, the first one straight up. */
export function seatCentres(count: number, radius = SEAT_RADIUS): Seat[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
    return { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
  });
}

/** The closest any two seats come, in percent of the wheel. */
export function closestPair(seats: Seat[]): number {
  let closest = Infinity;
  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      const dx = seats[i].x - seats[j].x;
      const dy = seats[i].y - seats[j].y;
      closest = Math.min(closest, Math.hypot(dx, dy));
    }
  }
  return closest;
}

/** True when tiles of this size, on a wheel of this size, do not touch. */
export function seatsFit(count: number, wheelPx: number, tilePx: number, radius = SEAT_RADIUS): boolean {
  if (count < 2) return true;
  const gapPx = (closestPair(seatCentres(count, radius)) / 100) * wheelPx;
  return gapPx >= tilePx;
}

/** True when a tile at the outermost seat stays inside the wheel. */
export function seatsStayInside(wheelPx: number, tilePx: number, radius = SEAT_RADIUS): boolean {
  return (radius / 100) * wheelPx + tilePx / 2 <= wheelPx / 2;
}
