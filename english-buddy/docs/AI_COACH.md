# AI Coach

## Model usage

- One model call per turn: OpenAI **Responses API**, model `OPENAI_MODEL` (default `gpt-5.6-sol`), `reasoning.effort: low`, `max_output_tokens: 1200`.
- Output is forced through a **strict JSON schema** (`coach_turn` in `src/lib/ai/types.ts`) and re-validated with Zod. A malformed response never breaks the conversation — it degrades to a plain reply.
- The API key lives server-side only. The browser talks to `/api/coach`.

## Turn contract

```json
{
  "reply": "...",
  "correction": "one short fix or empty",
  "mistakes": [{ "incorrect", "correct", "category", "severity", "note" }],
  "expressions": [{ "expression", "meaning" }],
  "reviewed_items": [{ "text", "success" }],
  "skill_updates": { "listening": 0, ... }   // deltas -2..2, only with evidence
}
```

`reviewed_items` is how natural spaced repetition closes the loop: due items are injected into the prompt, and when the user demonstrates (or fumbles) one, the model reports it and the schedule updates.

## Coaching behavior (encoded in `src/lib/ai/prompt.ts`)

- Priorities: communication > comprehension > fluency > vocabulary > confidence > grammar.
- No overcorrection: at most one brief correction per turn in short modes; only repeated, meaning-changing, or clearly unnatural mistakes.
- Reviews are woven into conversation, never announced as flashcards.
- Topics alternate between business (finance, M&A, negotiation, leadership) and normal life.
- Modes: `text-2`, `text-5`, `guided`, `surprise`, `buddy` — each with explicit length/behavior guidance.

## Cost control

- Compact context (learning memory + last 12 messages of the current session), never full history.
- One call per turn, small default model, capped output tokens.
- Micro modes instruct very short turns, which keeps output tokens low.
