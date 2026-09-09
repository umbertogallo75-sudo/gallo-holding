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
/** Tile diameter and wheel width in pixels, as the stylesheet sets them. */
export const TILE_PX = 78;
export const WHEEL_PX = 340;
/** The narrow-screen pair, from the max-width:380px block. */
export const TILE_PX_SMALL = 68;
export const WHEEL_PX_SMALL = 315;

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
