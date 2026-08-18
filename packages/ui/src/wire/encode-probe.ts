// The encoders' diagnostic ledger: what went in, what came out, what did not.
//
// SEPARATE FROM encode.ts on purpose, and the reason is a guard rather than
// tidiness. `lint:silent-drops` holds every function in `src/wire/` that
// discriminates a `MessagePart` responsible for all six variants, and it is
// right to. Nothing in this file discriminates one: every entry point takes the
// variant as a STRING, read at the call site out of a branch that had already
// discriminated it. So instrumenting the drops cannot introduce a new switch to
// go stale when a seventh variant lands, and the parts that reach `dropped()`
// are typed `unknown` so they cannot be inspected here even by accident.
//
// ZERO COST WITH NO SUBSCRIBER. The encoders build a probe only inside a
// `wireDiagnosticsActive()` branch and reach it through `probe?.`, so with
// nobody listening the whole ledger is one symbol read per encode and a handful
// of skipped optional calls.
//
// SSR: no window, no globals at module scope. The TextEncoder is built on first
// use, the same rule `read.ts` follows.
import { emitWireDiagnostic, withPayload, type EncodeAttachmentReport } from './diagnostics';

/** Built on first use and cached -- never at module scope, so this module keeps
 *  importing cleanly in a runtime that lacks the global. Only ever reached from
 *  inside an active-diagnostics branch. */
let encoder: TextEncoder | undefined;

/**
 * UTF-8 byte length of the encoded body, or undefined when it cannot be one.
 *
 * `JSON.stringify` is not total: a circular `tool.output` or a BigInt anywhere
 * in a host's own data throws, and a diagnostic must never be the thing that
 * breaks an encode. The field goes absent, which reads as "not reported" rather
 * than as a size.
 */
function bodyBytes(body: unknown): number | undefined {
  try {
    encoder ??= new TextEncoder();
    return encoder.encode(JSON.stringify(body)).length;
  } catch {
    return undefined;
  }
}

/**
 * Bytes a base64 payload stands for, WITHOUT decoding it.
 *
 * Four base64 characters carry three bytes, less the padding. Decoding a 40 MB
 * attachment to count it would make the diagnostic more expensive than the
 * encode it is watching.
 */
export function base64Bytes(data: string): number {
  const clean = data.replace(/\s/g, '');
  if (clean === '') return 0;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - pad);
}

export interface EncodeProbe {
  /** One part seen in the thread. `variant` is `part.type`, read at a site that
   *  has the part in hand -- this function never looks. */
  seen(variant: string): void;
  /** One part that reached the wire. */
  encoded(variant: string): void;
  /** One part that did NOT. `part` is carried only to be published under the
   *  payload key, and is `unknown` so it cannot be inspected here. */
  dropped(
    variant: string,
    reason: string,
    messageIndex: number,
    partIndex: number,
    part: unknown,
  ): void;
  /** One `file` part's outcome, plus the filename held back for the payload
   *  key. Called exactly once per file part, whatever became of it. */
  attachment(report: EncodeAttachmentReport, filename?: string): void;
  /** Emit `encode.request`. Called once, after the body is built. */
  finish(
    format: 'openai' | 'anthropic',
    threadMessages: number,
    body: ReadonlyArray<{ role: string }>,
  ): void;
}

/**
 * A ledger for one encode call.
 *
 * Built ONLY inside an active-diagnostics branch. It holds counts and, for the
 * payload key, filenames; it never holds message text.
 *
 * NO `streamId`, deliberately. An encode is not a read: it happens before there
 * is a response to correlate to, and minting an id here would invent a
 * relationship the kit cannot vouch for. `traceId`/`label` DO carry, because
 * those are the app's own declaration and the app is the one layer that knows
 * the encoded request and the read that answered it are the same turn.
 */
export function createEncodeProbe(opts: { traceId?: string; label?: string }): EncodeProbe {
  const correlation = {
    ...(opts.traceId !== undefined ? { traceId: opts.traceId } : {}),
    ...(opts.label !== undefined ? { label: opts.label } : {}),
  };
  const partsIn: Record<string, number> = {};
  const partsEncoded: Record<string, number> = {};
  const attachments: EncodeAttachmentReport[] = [];
  const filenames: Array<{ filename?: string }> = [];

  const bump = (into: Record<string, number>, key: string) => {
    into[key] = (into[key] ?? 0) + 1;
  };

  return {
    seen: (variant) => bump(partsIn, variant),
    encoded: (variant) => bump(partsEncoded, variant),
    dropped(variant, reason, messageIndex, partIndex, part) {
      emitWireDiagnostic({
        type: 'encode.dropped',
        t: Date.now(),
        ...correlation,
        variant,
        count: 1,
        messageIndex,
        partIndex,
        reason,
        // The part itself, by reference and unread. This function does not know
        // what a part is and must not: knowing would mean discriminating one.
        ...withPayload(() => ({ part })),
      });
    },
    attachment(report, filename) {
      attachments.push(report);
      // Positionally aligned with `attachments`, so a panel with the payload key
      // turned on can name the file in row N without the name ever sitting
      // beside the metadata.
      filenames.push(filename !== undefined ? { filename } : {});
    },
    finish(format, threadMessages, body) {
      const byRole: Record<string, number> = {};
      for (const message of body) bump(byRole, message.role);
      const bytes = bodyBytes(body);
      emitWireDiagnostic({
        type: 'encode.request',
        t: Date.now(),
        ...correlation,
        format,
        threadMessages,
        wireMessages: body.length,
        // Stated, not omitted: zero is the answer that tells a developer the
        // system prompt lives somewhere the kit cannot see.
        systemMessages: byRole.system ?? 0,
        byRole,
        partsIn,
        partsEncoded,
        attachments,
        ...(bytes !== undefined ? { bytes } : {}),
        // The encoded body, and the filenames held back from the ledger above.
        ...withPayload(() => ({
          body,
          ...(filenames.length > 0 ? { attachments: filenames } : {}),
        })),
      });
    },
  };
}
