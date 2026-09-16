import { redirect } from "next/navigation";

/**
 * Progressi and Percorso were two pages about the same thing.
 *
 * They read the same tables and disagreed about how to say it: one showed the
 * skills out of a hundred, the other out of ten; one listed the capabilities
 * as a flat list, the other as stages with dates. Somebody who opened both
 * did not learn twice as much, they stopped trusting either — which is
 * exactly what was reported.
 *
 * So there is one page now, and this is the old address. Kept rather than
 * deleted: it is in sent emails, in browser history, and on home screens.
 */
export default function ProgressPage() {
  redirect("/percorso");
}
