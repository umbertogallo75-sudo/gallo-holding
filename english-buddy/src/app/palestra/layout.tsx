import type { ReactNode } from "react";
import styles from "./games.module.css";

/**
 * The gym's own skin.
 *
 * Every colour in here is a custom property declared on `.root`, and for a
 * while `.root` was on nothing at all: the tokens were written, the pages
 * referred to them, and none of them resolved — so the panes had no
 * background, the text took whatever it inherited, and in a dark app half the
 * exercises were barely readable. Wrapping the whole section once is what
 * makes the palette exist, and puts it in one place rather than on six pages
 * that could each forget it.
 */
export default function PalestraLayout({ children }: { children: ReactNode }) {
  return <div className={styles.root}>{children}</div>;
}
