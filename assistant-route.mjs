/* Atlas — the assistant's server side.
 *
 * The browser never sees an API key. It POSTs the question here; this module
 * calls Claude with the key from the server's environment and streams the
 * answer back as Server-Sent Events.
 *
 * Set the key before starting the server:
 *   PowerShell:  $env:ANTHROPIC_API_KEY = "sk-ant-..."
 *   bash:        export ANTHROPIC_API_KEY="sk-ant-..."
 *
 * With no key (or no SDK installed) `status()` reports unavailable and the
 * browser falls back to its offline explainer — the app still works.
 */

const MODEL = 'claude-opus-5';
const MAX_BODY = 24 * 1024 * 1024;    // 24 MB — a photo of a worksheet, comfortably

/* One instruction set, kept byte-stable so it stays cache-eligible. */
const SYSTEM = `You are the study assistant inside Atlas, a homework tracker used by secondary-school and IB students.

A student pastes a question, task, or assignment brief that they find confusing — sometimes as text, sometimes as a photo or PDF of a worksheet. Your job is to make the QUESTION clear. You are not a homework-answering service.

Reply in markdown using exactly these sections, in this order, and nothing else:

## In plain words
One or two sentences restating the question in the simplest everyday English you can manage. No jargon. If the original is one long sentence, break it up.

## What it's actually asking for
A short bulleted list of the concrete things the student has to produce or show. Be specific about the deliverable — a number, a paragraph, a labelled diagram, a comparison, a justified opinion.

## Key words decoded
A bulleted list of the command terms and subject vocabulary in the question, each with a plain-English gloss of what it demands. Include IB/A-level command terms (evaluate, justify, derive, to what extent, distinguish, comment on) whenever they appear. Skip this section only if there is genuinely nothing worth decoding.

## How to approach it
Numbered steps describing the ORDER OF WORK — what to read, set up, or decide first, then next. Describe the method, not the answer.

Rules:
- Never give the final answer, the worked solution, the finished essay, or the specific numeric result. Explain what the question wants and how to get started; the student does the thinking.
- If the question is ambiguous or the image is unreadable, say so plainly in "In plain words" and explain what is unclear rather than guessing.
- Keep the whole reply under about 350 words. Short sentences. No preamble, no sign-off, no encouragement padding.
- Use the student's own subject vocabulary, but define it the first time.`;

let clientPromise = null;

/** Load the SDK lazily so the dashboard runs fine when it isn't installed. */
async function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk')
      .then((mod) => new mod.default())
      .catch((err) => {
        console.warn('[atlas] @anthropic-ai/sdk not installed — run `npm install`:', err.message);
        return null;
      });
  }
  return clientPromise;
}

export async function status() {
  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  let hasSdk = false;
  try { await import('@anthropic-ai/sdk'); hasSdk = true; } catch { hasSdk = false; }

  return {
    available: hasKey && hasSdk,
    hasKey,
    hasSdk,
    model: MODEL,
    reason: !hasSdk ? 'The Anthropic SDK is not installed. Run: npm install'
          : !hasKey ? 'No ANTHROPIC_API_KEY in the server environment.'
          : null
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Attachment too large (24 MB limit).')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('Malformed request body.')); }
    });
    req.on('error', reject);
  });
}

/**
 * Build the user content blocks. `attachments` are already base64 from the
 * browser: images become image blocks, PDFs become document blocks, and
 * anything textual is inlined as text.
 */
function buildContent({ question, attachments = [], course }) {
  const blocks = [];

  for (const file of attachments.slice(0, 5)) {
    if (!file || !file.data) continue;
    if (String(file.mediaType || '').startsWith('image/')) {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.data } });
    } else if (file.mediaType === 'application/pdf') {
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } });
    } else if (file.text) {
      blocks.push({ type: 'text', text: `Attached file "${file.name}":\n\n${String(file.text).slice(0, 40000)}` });
    }
  }

  const asked = String(question || '').trim().slice(0, 12000);
  const subject = course ? `\n\nSubject: ${String(course).slice(0, 80)}.` : '';
  blocks.push({
    type: 'text',
    text: asked
      ? `Here is the question I don't understand:\n\n${asked}${subject}`
      : `The attached file holds the question I don't understand. Read it and explain it.${subject}`
  });

  return blocks;
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** POST /api/assistant — streams the explanation back as SSE. */
export async function explain(req, res) {
  let payload;
  try {
    payload = await readBody(req);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err.message }));
    return;
  }

  if (!String(payload.question || '').trim() && !(payload.attachments || []).length) {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Nothing to explain — paste a question or attach a file.' }));
    return;
  }

  const client = await getClient();
  if (!client) {
    const s = await status();
    res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: s.reason || 'Assistant unavailable.' }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const history = Array.isArray(payload.history) ? payload.history.slice(-6) : [];

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      /* Claude Opus 5's classifiers can decline; "default" re-runs the request
         on Anthropic's recommended substitute rather than handing back a
         refusal — routed by refusal category. */
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        ...history
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) })),
        { role: 'user', content: buildContent(payload) }
      ]
    });

    /* Abandon the upstream call if the student closes the panel or reloads. */
    req.on('close', () => { try { stream.abort(); } catch { /* already finished */ } });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        sse(res, 'delta', { text: event.delta.text });
      }
    }

    const final = await stream.finalMessage();

    /* Always check stop_reason before trusting the content. */
    if (final.stop_reason === 'refusal') {
      sse(res, 'error', {
        message: 'Claude declined to answer this one' +
          (final.stop_details?.category ? ` (${final.stop_details.category})` : '') +
          '. Try rephrasing, or ask about a specific part of the question.'
      });
    } else {
      sse(res, 'done', {
        model: final.model,
        usage: { input: final.usage?.input_tokens ?? 0, output: final.usage?.output_tokens ?? 0 }
      });
    }
  } catch (err) {
    console.error('[atlas] assistant failed:', err);
    const message = err?.status === 401 ? 'The API key was rejected. Check ANTHROPIC_API_KEY.'
                  : err?.status === 429 ? 'Rate limited — wait a moment and try again.'
                  : err?.status >= 500 ? 'Claude is having trouble right now. Try again shortly.'
                  : err?.message || 'The assistant failed.';
    sse(res, 'error', { message });
  } finally {
    res.end();
  }
}
