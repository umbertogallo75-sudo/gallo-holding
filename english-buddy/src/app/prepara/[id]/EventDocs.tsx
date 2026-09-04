import Link from "next/link";
import { Upload } from "@/app/documenti/Upload";

/**
 * The papers that belong to this meeting.
 *
 * The same reading as anywhere else in the app, tied to this appointment — so
 * the training before a call about a contract is training on that contract,
 * not on contracts.
 */
export function EventDocs({ id, docs }: { id: string; docs: { id: string; title: string; kind: string }[] }) {
  return (
    <>
      {docs.length ? (
        <section className="card" style={{ padding: "6px 16px" }}>
          {docs.map((doc) => (
            <Link key={doc.id} href={`/documenti/${doc.id}`} className="mailRow">
              <span className="mailDot ready" aria-hidden />
              <span className="mailRowText">
                <span className="mailSubject">{doc.title}</span>
                <span className="mailMeta">{doc.kind} · allenati su questo</span>
              </span>
              <span className="stepGo" aria-hidden>→</span>
            </Link>
          ))}
        </section>
      ) : null}
      <Upload eventId={id} />
    </>
  );
}
