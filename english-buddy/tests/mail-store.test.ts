import { createClient } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  aliasFor,
  BODY_RETENTION_DAYS,
  deleteMail,
  ensureMailSchema,
  forgetOldBodies,
  listMail,
  newAliasLocalPart,
  readMail,
  regenerateAlias,
  rememberSender,
  resetMailSchemaCache,
  saveIncoming,
  senderIsKnown,
  userForAlias,
} from "@/lib/mail/store";

const client = createClient({ url: ":memory:" });

beforeEach(async () => {
  for (const table of ["mail_aliases", "mail_items", "mail_senders"]) {
    await client.execute(`DROP TABLE IF EXISTS ${table}`);
  }
  resetMailSchemaCache();
  await ensureMailSchema(client);
});

const incoming = (userId: string, from = "jane@acme.co.uk") => ({
  userId,
  fromAddress: from,
  fromName: "Jane",
  subject: "Pricing",
  bodyText: "Could you confirm by Friday?",
  senderKnown: false,
});

/**
 * The address is the credential. Everything about who a message belongs to
 * rests on it, so these are the cases that decide whether one person can end
 * up reading another's correspondence.
 */
describe("l'indirizzo personale", () => {
  it("gives an account the same address every time it is asked", async () => {
    const first = await aliasFor("u1", client);
    expect(await aliasFor("u1", client)).toBe(first);
    expect(await userForAlias(first, client)).toBe("u1");
  });

  it("gives different accounts different addresses", async () => {
    expect(await aliasFor("u1", client)).not.toBe(await aliasFor("u2", client));
  });

  it("closes the old door when the address is changed, rather than opening a second one", async () => {
    const old = await aliasFor("u1", client);
    const fresh = await regenerateAlias("u1", client);
    expect(fresh).not.toBe(old);
    expect(await userForAlias(old, client)).toBeNull();
    expect(await userForAlias(fresh, client)).toBe("u1");
  });

  it("is not guessable, and not mistypeable", async () => {
    const samples = new Set(Array.from({ length: 200 }, () => newAliasLocalPart()));
    expect(samples.size).toBe(200);
    for (const alias of samples) {
      expect(alias).toMatch(/^m-[a-z2-9]{12}$/);
      // No characters that get misread off a screen.
      expect(alias.slice(2)).not.toMatch(/[01lio]/);
    }
  });

  it("does not answer for an address nobody owns", async () => {
    expect(await userForAlias("m-nothinghere", client)).toBeNull();
  });
});

describe("le mail ricevute", () => {
  it("shows each person only their own", async () => {
    const { id: mine } = await saveIncoming(incoming("u1"), client);
    await saveIncoming(incoming("u2"), client);
    expect((await listMail("u1", client)).map((m) => m.id)).toEqual([mine]);
    expect(await readMail(mine, "u2", client)).toBeNull();
    expect(await readMail(mine, "u1", client)).not.toBeNull();
  });

  it("refuses to delete somebody else's", async () => {
    const { id: mine } = await saveIncoming(incoming("u1"), client);
    await deleteMail(mine, "u2", client);
    expect(await readMail(mine, "u1", client)).not.toBeNull();
    await deleteMail(mine, "u1", client);
    expect(await readMail(mine, "u1", client)).toBeNull();
  });

  it("recognises the address the account registered with", async () => {
    expect(await senderIsKnown("u1", "Marco@Example.com", "marco@example.com", client)).toBe(true);
    expect(await senderIsKnown("u1", "other@work.it", "marco@example.com", client)).toBe(false);
  });

  it("remembers a second address once, for that account only", async () => {
    await saveIncoming(incoming("u1", "marco@work.it"), client);
    await rememberSender("u1", "MARCO@WORK.IT", client);
    expect(await senderIsKnown("u1", "marco@work.it", null, client)).toBe(true);
    expect(await senderIsKnown("u2", "marco@work.it", null, client)).toBe(false);
    // The message already in the list stops asking too.
    expect((await listMail("u1", client))[0].senderKnown).toBe(true);
  });

  it("forgets the original text after a month and keeps what was made from it", async () => {
    const { id } = await saveIncoming(incoming("u1"), client);
    const old = new Date(Date.now() - (BODY_RETENTION_DAYS + 1) * 86_400_000).toISOString();
    await client.execute({
      sql: "UPDATE mail_items SET received_at = ?, summary_it = 'Chiede conferma', reply_en = 'Confirmed.' WHERE id = ?",
      args: [old, id],
    });
    expect(await forgetOldBodies("u1", new Date(), client)).toBe(1);
    const item = await readMail(id, "u1", client);
    expect(item?.bodyText).toBe("");
    expect(item?.summaryIt).toBe("Chiede conferma");
    expect(item?.replyEn).toBe("Confirmed.");
  });

  it("leaves recent messages alone", async () => {
    await saveIncoming(incoming("u1"), client);
    expect(await forgetOldBodies("u1", new Date(), client)).toBe(0);
  });
});

/**
 * The mail service redelivers whatever it did not get a clean answer to, and
 * has a Replay button besides. Without this, the first forwarded email of the
 * evening would have become three copies in the list — one per attempt — each
 * having paid for its own call to the model.
 */
describe("la stessa consegna, due volte", () => {
  it("keeps one message however many times it is delivered", async () => {
    const first = await saveIncoming({ ...incoming("u1"), sourceId: "evt_1" }, client);
    const again = await saveIncoming({ ...incoming("u1"), sourceId: "evt_1" }, client);
    expect(again.id).toBe(first.id);
    expect(again.alreadySeen).toBe(true);
    expect(first.alreadySeen).toBe(false);
    expect(await listMail("u1", client)).toHaveLength(1);
  });

  it("still keeps two genuinely different messages apart", async () => {
    await saveIncoming({ ...incoming("u1"), sourceId: "evt_1" }, client);
    await saveIncoming({ ...incoming("u1"), sourceId: "evt_2" }, client);
    expect(await listMail("u1", client)).toHaveLength(2);
  });

  it("does not merge messages that arrived before ids were recorded", async () => {
    // Rows without a source id are all distinct, not all the same one.
    await saveIncoming(incoming("u1"), client);
    await saveIncoming(incoming("u1"), client);
    expect(await listMail("u1", client)).toHaveLength(2);
  });
});
