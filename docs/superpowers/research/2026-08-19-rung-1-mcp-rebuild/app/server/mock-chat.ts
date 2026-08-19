/**
 * POST /api/chat — the local dev endpoint that streams the mocked reply.
 *
 * This runs in Node, inside the Vite dev/preview server (see vite.config.ts).
 * It stands in for the route a real deployment would run against a provider.
 *
 * The mock itself is the kit's own: `createMockResponder()` from
 * '@kitn.ai/ui/state' yields ready-made OpenAI chat-completions SSE frames —
 * banner comment, role delta, content deltas, a finish_reason frame with zeroed
 * usage, then `data: [DONE]`. So this handler does not format anything; it
 * relays each yielded string to the socket verbatim.
 *
 * Every frame is self-identifying as a mock: the stream opens with a
 * `: kai-mock` SSE comment, each frame carries `_kai_mock`, `model` reports as
 * `kai-mock` (no provider serves it) and usage is all zeros. Nothing here can be
 * mistaken for a real turn.
 *
 * Going live replaces this file's body with a provider call that re-frames to
 * the same OpenAI SSE shape; src/main.ts does not change at all.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMockResponder, MOCK_BANNER } from '@kitn.ai/ui/state';

/** What the browser POSTs: the whole thread, encoded by `toOpenAIMessages`. */
interface ChatRequestBody {
  messages?: { role: string; content: unknown }[];
}

/**
 * Canned support answers, chosen by keyword off the newest user turn.
 *
 * createMockResponder's own DEFAULT_MOCK_REPLIES cycle one-per-turn and are
 * about the mock itself; for a support widget a topical reply demonstrates the
 * multi-turn behaviour much better, so the routing is ours and only the
 * `replies` option is handed to the kit. Everything about how the reply is
 * FRAMED and STREAMED is still the kit's.
 */
const REPLIES: { match: RegExp; reply: string }[] = [
  {
    match: /order|ship|deliver|track|arrive|package/i,
    reply:
      "Happy to help with that. Orders leave our Rotterdam or Denver warehouse within **2–3 business days**, and you'll get a tracking link by email the moment the label is scanned.\n\nIf it's been longer than five business days with no tracking email, give me the order number (it looks like `AUR-xxxxxx`) and I'll look at where it's stuck.",
  },
  {
    match: /return|refund|money back|cancel|exchange/i,
    reply:
      "You've got **60 days** from delivery, and returns are free — no restocking fee, and the lamp doesn't need to be in the original box.\n\nStart it from your order confirmation email and a prepaid label comes back within a minute. Refunds land on the original card about three business days after the lamp is scanned into our warehouse.",
  },
  {
    match: /calendar|sync|app|schedule|connect|pair|wifi|bluetooth/i,
    reply:
      "Calendar sync lives in the Aurora app, and it takes about a minute:\n\n1. Open **Settings → Connections** in the app.\n2. Pick Google, Outlook or an ICS URL, then grant read-only access.\n3. Choose which calendar drives the wind-down — Aurora warms up ten minutes before your last meeting ends.\n\nThe lamp holds the schedule on-device, so it keeps working if your phone is somewhere else. Which calendar are you trying to connect?",
  },
  {
    match: /flicker|buzz|hum|noise|dim|strobe|brightness/i,
    reply:
      "Flicker at the bottom of the dimming range is almost always the **power supply**, not the lamp. Two things to check:\n\n- Is it running on the adapter that shipped in the box? A charger below 18W PD will brown out under 10% brightness.\n- Hold the dial for five seconds to re-run the driver calibration.\n\nIf it still flickers after both, that's a warranty replacement and I can start one right now — the new lamp ships before you send the old one back.",
  },
  {
    match: /warrant|broken|damage|defect|dead|not working|won'?t turn/i,
    reply:
      "Sorry — that's not the unboxing you paid for. The Aurora Lamp 2 carries a **3-year warranty**, and for damage reported inside 60 days we ship the replacement first and send a prepaid label for the original.\n\nCould you tell me roughly when it arrived and what it's doing (or not doing)? That's enough for me to get the replacement moving.",
  },
  {
    match: /price|cost|discount|student|coupon|cheap|pay/i,
    reply:
      "The Aurora Lamp 2 is **$189**, which includes the USB-C PD adapter, the 2m braided cable and the desk clamp.\n\nThere's a 15% education discount if you verify a school email at checkout, and no other codes are running right now — we'd rather keep the sticker price honest than run a permanent fake sale.",
  },
  {
    match: /spec|lumen|kelvin|cri|bright|temperature|watt|power/i,
    reply:
      "Here are the numbers people usually want:\n\n- **Colour temperature:** 2200K–6500K, continuously variable\n- **Brightness:** 60–1100 lumens, flicker-free down to 0.1%\n- **Colour accuracy:** CRI 97, R9 above 90\n- **Power:** USB-C PD, 18W maximum\n\nAnything in particular you're trying to match — a monitor, or the room's own daylight?",
  },
];

const FALLBACK =
  "Thanks for reaching out — I'm the Aurora support assistant. I can help with **orders and shipping**, **returns**, **setting up calendar sync**, **flicker or dimming trouble**, and **warranty claims**.\n\nWhich of those is closest to what you're after? If it's an order, the order number is the fastest way in.";

function pickReply(prompt: string): string {
  return REPLIES.find((entry) => entry.match.test(prompt))?.reply ?? FALLBACK;
}

/** The newest user turn, as plain text. `toOpenAIMessages` emits `content` as a
 *  string for a text-only turn and an array of parts once attachments are
 *  involved, so both shapes are flattened here. */
function latestUserText(body: ChatRequestBody): string {
  const turns = Array.isArray(body.messages) ? body.messages : [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn?.role !== 'user') continue;
    if (typeof turn.content === 'string') return turn.content;
    if (Array.isArray(turn.content)) {
      return turn.content
        .map((part) =>
          part && typeof part === 'object' && 'text' in part ? String(part.text) : '',
        )
        .join(' ');
    }
  }
  return '';
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('request body too large'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

let announced = false;

/** Connect-style middleware. Mounted at /api/chat by the Vite plugin. */
export async function mockChatEndpoint(
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
): Promise<void> {
  if (req.method !== 'POST') {
    next();
    return;
  }

  if (!announced) {
    announced = true;
    console.log(`\n[mock-chat] ${MOCK_BANNER.replace(/^:\s*/, '')}\n`);
  }

  let prompt = '';
  try {
    const raw = await readBody(req);
    prompt = latestUserText(raw ? (JSON.parse(raw) as ChatRequestBody) : {});
  } catch {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'invalid JSON body' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.setHeader('x-accel-buffering', 'no'); // don't let a proxy buffer the stream
  res.flushHeaders?.();

  // A fresh responder per request: the reply is chosen here, so the kit's
  // built-in per-turn cycling isn't what varies the answer. `announce: false`
  // because the banner above already says it once per process rather than once
  // per request; the in-band tells are all still there.
  const respond = createMockResponder({
    replies: [pickReply(prompt)],
    delayMs: 28,
    chunkSize: 2,
    announce: false,
  });

  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  try {
    for await (const frame of respond(prompt)) {
      if (closed) break; // visitor navigated away or aborted mid-stream
      res.write(frame);
    }
  } catch (err) {
    console.error('[mock-chat] stream failed:', err);
  } finally {
    if (!closed) res.end();
  }
}
