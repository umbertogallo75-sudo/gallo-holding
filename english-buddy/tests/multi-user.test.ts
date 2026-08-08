import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET = "test-secret-that-is-definitely-32-characters-long";
process.env.APP_ACCESS_CODE = "owner-secret-code";

import { createAuthUser, findUserIdByAccessCode } from "@/lib/auth-users";
import { getRelevantLearningContext, saveMistake, startSession, saveMessage } from "@/lib/learning/service";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-multiuser-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(join(migrations, file), "utf8"));
  }
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("multi-user accounts and data separation", () => {
  it("maps the owner env code to the owner id", async () => {
    expect(await findUserIdByAccessCode("owner-secret-code", client)).toBe("owner");
  });

  it("registers users and resolves each personal code to its own id", async () => {
    const marco = await createAuthUser("Marco", "codice-di-marco-123", client);
    const laura = await createAuthUser("Laura", "codice-di-laura-456", client);
    expect(marco).not.toBe(laura);
    expect(await findUserIdByAccessCode("codice-di-marco-123", client)).toBe(marco);
    expect(await findUserIdByAccessCode("codice-di-laura-456", client)).toBe(laura);
    expect(await findUserIdByAccessCode("codice-inesistente", client)).toBeNull();
  });

  it("rejects a duplicate personal code at the database level", async () => {
    await expect(createAuthUser("Copia", "codice-di-marco-123", client)).rejects.toThrow();
  });

  it("keeps each user's learning data fully separate", async () => {
    const marco = (await findUserIdByAccessCode("codice-di-marco-123", client))!;
    const laura = (await findUserIdByAccessCode("codice-di-laura-456", client))!;

    for (const [user, name] of [[marco, "Marco"], [laura, "Laura"]] as const) {
      await client.execute({ sql: "INSERT INTO profiles (id, display_name) VALUES (?, ?)", args: [user, name] });
      await client.execute({ sql: "INSERT INTO learning_state (user_id) VALUES (?)", args: [user] });
    }

    const marcoSession = await startSession(marco, "text-5", client);
    await saveMessage(marco, marcoSession, "user", "I am agree with you", null, client);
    await saveMistake(marco, { incorrect: "I am agree", correct: "I agree", category: "grammar", severity: "meaningful", note: "" }, client);

    const lauraSession = await startSession(laura, "text-2", client);

    const marcoContext = await getRelevantLearningContext(marco, marcoSession, client);
    const lauraContext = await getRelevantLearningContext(laura, lauraSession, client);

    expect(marcoContext.profile?.displayName).toBe("Marco");
    expect(marcoContext.recentMistakes).toHaveLength(1);
    expect(marcoContext.recentMessages).toHaveLength(1);

    expect(lauraContext.profile?.displayName).toBe("Laura");
    expect(lauraContext.recentMistakes).toHaveLength(0);
    expect(lauraContext.recentMessages).toHaveLength(0);
  });
});
