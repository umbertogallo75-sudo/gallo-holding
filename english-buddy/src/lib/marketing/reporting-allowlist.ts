export type NumericIdAllowlist = {
  ids: ReadonlySet<string> | null;
  detail: string | null;
};

/**
 * Reads a comma-separated provider-ID allowlist without ever echoing its raw
 * value. Provider IDs are positive decimal integers; any malformed member
 * makes the whole list unusable so attribution fails closed.
 */
export function readNumericIdAllowlist(envName: string): NumericIdAllowlist {
  const raw = (process.env[envName] ?? "").trim();
  if (!raw) return { ids: null, detail: `Variabile ${envName} mancante.` };

  const values = raw.split(",").map((value) => value.trim());
  if (values.length === 0 || values.some((value) => !/^[1-9]\d*$/.test(value))) {
    return {
      ids: null,
      detail: `${envName} deve contenere solo ID numerici positivi separati da virgole.`,
    };
  }

  return { ids: new Set(values), detail: null };
}

/** Extracts a positive numeric ID from either a scalar or a provider resource name. */
export function numericResourceId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== "string") return null;
  const match = value.trim().match(/(?:^|\/)([1-9]\d*)$/);
  return match?.[1] ?? null;
}
