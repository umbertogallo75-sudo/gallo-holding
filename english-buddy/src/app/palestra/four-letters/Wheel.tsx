"use client";

import { useRef } from "react";
import { seatCentres, tilePxFor } from "@/lib/games/wheel-layout";
import styles from "../wheel.module.css";

/** One hue per seat, so the same letter is not always the same colour. */
const TILE_COLOURS = ["#e0562f", "#2f9be0", "#7bbf3a", "#c94ba0", "#e8a51c", "#5b5be0"];

export type WheelProps = {
  letters: string[];
  picked: number[];
  /** 0 → 1, how much of the clock is left. Drawn as the ring. */
  remaining: number;
  low: boolean;
  state: "idle" | "right" | "wrong";
  onPick: (position: number) => void;
  onSubmit: () => void;
  onClear: () => void;
  /**
   * Whether a single tap submits. True where every word is the same length,
   * so filling the slots can only mean one thing; false where the player
   * decides how long their word is and confirms it themselves.
   */
  submitOnTap?: boolean;
};

/**
 * The wheel: tiles on a ring, the countdown drawn as the ring itself, and a
 * finger that can either tap letters one at a time or drag through them in one
 * stroke — the way this kind of game has always been played.
 *
 * Dragging is done with pointer events and elementFromPoint rather than by
 * measuring geometry, so it keeps working whatever the tiles are sized at.
 */
export function Wheel({ letters, picked, remaining, low, state, onPick, onSubmit, onClear, submitOnTap = true }: WheelProps) {
  const box = useRef<HTMLDivElement>(null);

  const seats = letters.length;
  // Percentages of the wheel, handed straight to left/top. Derived, not
  // stored: they depend only on how many letters there are.
  const centres = seatCentres(seats);

  function seatAt(clientX: number, clientY: number): number | null {
    const element = document.elementFromPoint(clientX, clientY);
    const tile = element?.closest<HTMLElement>("[data-seat]");
    if (!tile) return null;
    const seat = Number(tile.dataset.seat);
    return Number.isInteger(seat) ? seat : null;
  }

  /**
   * A tap and a drag are two different gestures, and they were one.
   *
   * Pressing a tile started a drag immediately: it cleared whatever was
   * already selected and, on release, submitted. So in Parola lunga — where a
   * word is built letter by letter — every new tap wiped the letters before
   * it, and joining two letters on the same side of the circle without
   * crossing a third was the only way through. A tester put it as "difficoltà
   * di unire lettere che sono nello stesso emiciclo"; it was not the geometry,
   * it was the gesture.
   *
   * Now a press is only a drag once the finger reaches a different tile.
   * Until then it is a tap, and a tap adds one letter to what is already
   * there.
   */
  const startSeat = useRef<number | null>(null);
  const dragged = useRef(false);

  function onPointerDown(event: React.PointerEvent) {
    if (state !== "idle") return;
    const seat = seatAt(event.clientX, event.clientY);
    if (seat === null) return;
    startSeat.current = seat;
    dragged.current = false;
    box.current?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (startSeat.current === null || state !== "idle") return;
    const seat = seatAt(event.clientX, event.clientY);
    if (seat === null) return;
    if (!dragged.current) {
      // Still on the tile it started on: not a drag yet.
      if (seat === startSeat.current) return;
      dragged.current = true;
      onClear();
      onPick(startSeat.current);
    }
    onPick(seat);
  }

  function onPointerUp(event: React.PointerEvent) {
    const wasDrag = dragged.current;
    const seat = startSeat.current;
    startSeat.current = null;
    dragged.current = false;
    try {
      box.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* the pointer was already gone */
    }
    if (state !== "idle") return;
    if (wasDrag) {
      onSubmit();
      return;
    }
    if (seat === null) return;
    // A tap. Where a tap is the whole move (Quattro lettere) it starts a fresh
    // word; where a word is built letter by letter it adds to it.
    if (submitOnTap) {
      onClear();
      onPick(seat);
      onSubmit();
    } else {
      onPick(seat);
    }
  }

  const trail = picked.map((seat) => centres[seat]).filter(Boolean);
  const ringColour = low ? "#e0562f" : "#7bbf3a";

  return (
    <div
      ref={box}
      className={styles.wheel}
      style={{ "--tile-size": `${tilePxFor(seats)}px`, "--tile-size-small": `${tilePxFor(seats, true)}px` } as React.CSSProperties}
      data-low={low}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden>
        <circle className={styles.ringTrack} cx="50" cy="50" r="46" strokeWidth="4" />
        <circle
          className={styles.ringLive}
          cx="50"
          cy="50"
          r="46"
          strokeWidth="4"
          stroke={ringColour}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - Math.min(Math.max(remaining, 0), 1)}
        />
      </svg>
      <div className={styles.dish} aria-hidden />

      {trail.length > 1 ? (
        <svg className={styles.trail} viewBox="0 0 100 100" aria-hidden>
          <polyline
            className={styles.trailLine}
            stroke={ringColour}
            points={trail.map((point) => `${point.x},${point.y}`).join(" ")}
          />
        </svg>
      ) : null}

      {letters.map((letter, seat) => {
        const used = picked.includes(seat);
        return (
          <button
            key={seat}
            type="button"
            data-seat={seat}
            className={`${styles.tile} ${used ? styles.tileOn : ""}`}
            style={
              {
                "--x": `${centres[seat].x}%`,
                "--y": `${centres[seat].y}%`,
                "--tile": TILE_COLOURS[seat % TILE_COLOURS.length],
              } as React.CSSProperties
            }
            onClick={(event) => {
              // Only a keyboard-generated click gets here: a real tap was
              // already handled on pointer-up, and doing it twice would add
              // the letter twice.
              if (event.detail !== 0 || state !== "idle") return;
              onPick(seat);
              if (submitOnTap) onSubmit();
            }}
            aria-label={`lettera ${letter}`}
          >
            <span>{letter}</span>
          </button>
        );
      })}
    </div>
  );
}
