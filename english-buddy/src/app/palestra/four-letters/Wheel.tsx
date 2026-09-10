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
  const dragging = useRef(false);

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

  function onPointerDown(event: React.PointerEvent) {
    if (state !== "idle") return;
    const seat = seatAt(event.clientX, event.clientY);
    if (seat === null) return;
    dragging.current = true;
    box.current?.setPointerCapture(event.pointerId);
    onClear();
    onPick(seat);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!dragging.current || state !== "idle") return;
    const seat = seatAt(event.clientX, event.clientY);
    if (seat !== null) onPick(seat);
  }

  function onPointerUp(event: React.PointerEvent) {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      box.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* the pointer was already gone */
    }
    onSubmit();
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
            onClick={() => {
              // A plain tap, for anyone who does not want to drag.
              if (dragging.current || state !== "idle") return;
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
