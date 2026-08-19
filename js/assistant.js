/* Atlas — the study assistant.
 *
 * Paste a question you don't understand; get it back in plain words, with the
 * command terms decoded and a method to start from. It never hands over the
 * answer — that is the point, not a limitation.
 *
 * Two engines:
 *   claude   the server route (assistant-route.mjs) streams a real explanation.
 *            The API key lives on the server; the browser never sees it.
 *   offline  a local rewriter that runs with no key and no network. Weaker,
 *            but genuinely useful: it decodes command terms, separates the
 *            sub-tasks, and lays out an order of work.
 */
(function (global) {
  'use strict';

  var U = global.Atlas.util;

  var state = {
    available: null,        // null = not yet checked
    reason: null,
    model: null,
    busy: false,
    thread: []              // {role, content, engine, at}
  };

  var KEY_THREAD = 'atlas.assistant.v1';

  /* -------------------------------------------------------------- status */

  function checkStatus() {
    if (location.protocol === 'file:') {
      state.available = false;
      state.reason = 'Run the local server to reach Claude.';
      return Promise.resolve(state);
    }
    return fetch('api/assistant/status', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        state.available = !!(s && s.available);
        state.reason = s ? s.reason : 'The assistant endpoint did not answer.';
        state.model = s ? s.model : null;
        return state;
      })
      .catch(function () {
        state.available = false;
        state.reason = 'The assistant endpoint did not answer.';
        return state;
      });
  }

  /* ------------------------------------------------------------- thread */

  function loadThread() {
    try {
      var raw = localStorage.getItem(KEY_THREAD);
      state.thread = raw ? JSON.parse(raw) : [];
    } catch (e) { state.thread = []; }
    return state.thread;
  }

  function saveThread() {
    try {
      /* Keep the tail — attachments are not persisted, only the words. */
      localStorage.setItem(KEY_THREAD, JSON.stringify(state.thread.slice(-12)));
    } catch (e) { /* quota — not worth breaking the app over */ }
  }

  function clearThread() {
    state.thread = [];
    saveThread();
  }

  /* --------------------------------------------------------- ask claude */

  /**
   * @param {{question:string, attachments:Array, course?:string}} input
   * @param {{onDelta:Function, onDone:Function, onError:Function}} handlers
   */
  function askClaude(input, handlers) {
    var history = state.thread.slice(-4).map(function (m) {
      return { role: m.role, content: m.content };
    });

    var payload = {
      question: input.question,
      course: input.course || '',
      history: history,
      attachments: (input.attachments || []).map(function (f) {
        return { name: f.name, mediaType: f.mediaType, data: f.data, text: f.text };
      })
    };

    return fetch('api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.error || 'The assistant answered ' + res.status + '.');
        });
      }
      return consumeSse(res, handlers);
    });
  }

  /** Read the SSE body, dispatching `delta` / `done` / `error` events. */
  function consumeSse(res, handlers) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var full = '';

    function pump() {
      return reader.read().then(function (chunk) {
        if (chunk.done) return full;
        buffer += decoder.decode(chunk.value, { stream: true });

        var frames = buffer.split('\n\n');
        buffer = frames.pop();                       // keep the partial frame

        frames.forEach(function (frame) {
          var event = 'message', data = '';
          frame.split('\n').forEach(function (line) {
            if (line.indexOf('event:') === 0) event = line.slice(6).trim();
            else if (line.indexOf('data:') === 0) data += line.slice(5).trim();
          });
          if (!data) return;

          var parsed;
          try { parsed = JSON.parse(data); } catch (e) { return; }

          if (event === 'delta') { full += parsed.text; handlers.onDelta(parsed.text, full); }
          else if (event === 'error') { handlers.onError(new Error(parsed.message)); }
          else if (event === 'done') { handlers.onDone(full, parsed); }
        });

        return pump();
      });
    }

    return pump();
  }

  /* ----------------------------------------------------- offline engine */

  /* Command terms are where most of the confusion lives: a student can know
     the content and still not know what "evaluate" is asking them to produce.
     `weight` decides which term leads the summary — an argumentative command
     outranks a computational one, and 0 means "decode it, but it is a
     qualifier, not the instruction". */
  var COMMAND_TERMS = {
    'to what extent':    { weight: 3, gloss: 'Say how far you agree, and argue both sides before deciding.' },
    'evaluate':          { weight: 3, gloss: 'Weigh strengths against weaknesses and reach a judgement.' },
    'assess':            { weight: 3, gloss: 'Weigh it up and give a judgement, with reasons.' },
    'discuss':           { weight: 3, gloss: 'Give a balanced account — several viewpoints, with evidence.' },
    'justify':           { weight: 3, gloss: 'Give evidence and reasons that support the answer.' },
    'examine':           { weight: 3, gloss: 'Look closely at the assumptions and the relationships.' },
    'analyse':           { weight: 3, gloss: 'Break it into parts and say how the parts relate.' },
    'analyze':           { weight: 3, gloss: 'Break it into parts and say how the parts relate.' },

    'explain':           { weight: 2, gloss: 'Give reasons or causes — the "why", not just the "what".' },
    'compare':           { weight: 2, gloss: 'Say what is similar. Cover both things together, not one then the other.' },
    'contrast':          { weight: 2, gloss: 'Say what is different, point by point.' },
    'distinguish':       { weight: 2, gloss: 'Make the difference between them clear.' },
    'comment on':        { weight: 2, gloss: 'Give an informed opinion, backed by evidence.' },
    'suggest':           { weight: 2, gloss: 'Propose a possible answer — more than one may be valid.' },
    'predict':           { weight: 2, gloss: 'Say what will happen, based on the pattern or theory.' },
    'deduce':            { weight: 2, gloss: 'Reach a conclusion from what you have been given.' },
    'derive':            { weight: 2, gloss: 'Get to the result by working through the algebra or logic.' },
    'describe':          { weight: 2, gloss: 'Say what it is like. No reasons needed, just detail.' },
    'summarise':         { weight: 2, gloss: 'Give the key points in a much shorter form.' },
    'summarize':         { weight: 2, gloss: 'Give the key points in a much shorter form.' },

    'calculate':         { weight: 1, gloss: 'Work out a number. Show the steps that got you there.' },
    'determine':         { weight: 1, gloss: 'Find the one correct answer, from the data or by reasoning.' },
    'estimate':          { weight: 1, gloss: 'Give an approximate value, and say how you got it.' },
    'construct':         { weight: 1, gloss: 'Build or draw it — a graph, a diagram, an argument.' },
    'sketch':            { weight: 1, gloss: 'Draw the rough shape with axes and key features labelled.' },
    'annotate':          { weight: 1, gloss: 'Add short labels or notes to a diagram or text.' },
    'outline':           { weight: 1, gloss: 'Give the main points only, briefly.' },
    'define':            { weight: 1, gloss: 'Give the exact meaning. One or two sentences.' },
    'identify':          { weight: 1, gloss: 'Name it. A word or a phrase is enough.' },
    'state':             { weight: 1, gloss: 'Give a short, specific answer. No explanation wanted.' },

    /* Qualifiers — worth decoding, but they are never the instruction. */
    'with reference to': { weight: 0, gloss: 'You must quote or cite the source they named.' },
    'in the context of': { weight: 0, gloss: 'Keep your answer tied to the situation they described.' },
    'using the data':    { weight: 0, gloss: 'Your answer has to cite the numbers you were given.' }
  };

  var JARGON_HINTS = [
    [/\bwith respect to\b/gi, 'as it changes with'],
    [/\bhence\b/gi, 'so'],
    [/\bthereby\b/gi, 'and so'],
    [/\butilis(e|ing|ation)\b/gi, 'use'],
    [/\bin the context of\b/gi, 'for'],
    [/\bit is required that\b/gi, 'you must'],
    [/\bnotwithstanding\b/gi, 'even so']
  ];

  function findCommandTerms(text) {
    var lower = ' ' + text.toLowerCase() + ' ';
    var found = [];
    Object.keys(COMMAND_TERMS).forEach(function (term) {
      var pattern = new RegExp('(^|[^a-z])' + term.replace(/ /g, '\\s+') + '([^a-z]|$)', 'i');
      if (pattern.test(lower)) {
        found.push({ term: term, gloss: COMMAND_TERMS[term].gloss, weight: COMMAND_TERMS[term].weight });
      }
    });
    /* Heaviest command first, then longest — so "to what extent" wins over the
       "state" hiding inside it, and "evaluate" outranks "calculate". */
    return found.sort(function (a, b) {
      return (b.weight - a.weight) || (b.term.length - a.term.length);
    }).slice(0, 6);
  }

  /** The term that actually sets the shape of the answer, if there is one. */
  function primaryTerm(terms) {
    for (var i = 0; i < terms.length; i++) if (terms[i].weight > 0) return terms[i];
    return null;
  }

  function splitTasks(text) {
    /* Numbered or lettered parts, then sentences, then clause joins. */
    var parts = text.split(/(?:^|\s)(?:\(?[a-d]\)|\(?(?:i{1,3}|iv|v)\)|\d\s*[.)])\s+/i)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 12; });
    if (parts.length > 1) return parts;

    return text.split(/(?<=[.?;])\s+|\s+(?:and then|then|as well as)\s+/i)
      .map(function (s) { return s.trim().replace(/^[,;]\s*/, ''); })
      .filter(function (s) { return s.length > 12; });
  }

  function plainify(sentence) {
    var out = sentence;
    JARGON_HINTS.forEach(function (pair) { out = out.replace(pair[0], pair[1]); });
    return out.replace(/\s+/g, ' ').trim();
  }

  /** Build the same four-section markdown the Claude engine returns. */
  function offlineExplain(question) {
    var text = String(question || '').trim();
    if (!text) return '## In plain words\nThere is nothing to explain yet — paste the question first.';

    var terms = findCommandTerms(text);
    var main = primaryTerm(terms);
    var tasks = splitTasks(text);
    var hasNumbers = /\d/.test(text);
    var sourceMatch = /\b(table|graph|figure|diagram|source|text|passage|data|extract)\b/i.exec(text);
    var sourceWord = sourceMatch ? sourceMatch[1].toLowerCase() : null;

    function trim(s, n) {
      var t = plainify(s);
      return t.length > n ? t.slice(0, n - 1).replace(/\s\S*$/, '') + '…' : t;
    }

    var out = '## In plain words\n';
    out += main
      ? 'The command word is **' + main.term + '**. ' + main.gloss +
        '\n\nStripped back: ' + trim(tasks[0] || text, 200) + '\n'
      : trim(tasks[0] || text, 220) + '\n';

    out += '\n## What it\'s actually asking for\n';
    if (tasks.length > 1) {
      tasks.slice(0, 5).forEach(function (t) {
        out += '- ' + trim(t, 150).replace(/^[a-z]/, function (c) { return c.toUpperCase(); }) + '\n';
      });
    } else {
      out += '- ' + (main ? 'One thing: ' + main.term + ' — ' + main.gloss.charAt(0).toLowerCase() + main.gloss.slice(1) : 'A single answer to the sentence above.') + '\n';
      if (hasNumbers) out += '- A worked numerical answer, with the steps shown.\n';
      if (sourceWord) out += '- Direct use of the ' + sourceWord + ' they gave you — refer to it explicitly.\n';
    }

    if (terms.length) {
      out += '\n## Key words decoded\n';
      terms.forEach(function (t) { out += '- **' + t.term + '** — ' + t.gloss + '\n'; });
    }

    out += '\n## How to approach it\n';
    var step = 1;
    if (sourceWord) out += (step++) + '. Read the ' + sourceWord + ' first and note what it actually shows.\n';
    out += (step++) + '. Underline the command word (' + (main ? main.term : 'the main verb') + ') — it decides the shape of your answer.\n';
    if (tasks.length > 1) out += (step++) + '. Answer each part separately. There are about ' + tasks.length + ' of them.\n';
    if (hasNumbers) out += (step++) + '. Write down the values you are given and the one you are solving for, with units.\n';
    out += (step++) + '. Draft the answer in the form the command word demands, then check you did that and not something adjacent.\n';

    out += '\n---\n*Offline mode — this is Atlas\'s own rewriter, not Claude. Set `ANTHROPIC_API_KEY` on the server for a much better explanation.*';
    return out;
  }

  /* ------------------------------------------------------------- public */

  /**
   * Ask a question. Streams when Claude is available, otherwise answers
   * instantly from the offline rewriter.
   */
  function ask(input, handlers) {
    if (state.busy) return Promise.reject(new Error('Already working on one.'));
    state.busy = true;

    var userEntry = {
      role: 'user',
      content: input.question || '(attached file)',
      attachments: (input.attachments || []).map(function (f) { return { name: f.name, kind: f.kind, size: f.size }; }),
      at: new Date().toISOString()
    };
    state.thread.push(userEntry);
    saveThread();

    function finish(text, engine) {
      state.thread.push({ role: 'assistant', content: text, engine: engine, at: new Date().toISOString() });
      saveThread();
      state.busy = false;
    }

    if (state.available === false) {
      var offline = offlineExplain(input.question);
      handlers.onDelta(offline, offline);
      finish(offline, 'offline');
      handlers.onDone(offline, { engine: 'offline' });
      return Promise.resolve(offline);
    }

    return askClaude(input, {
      onDelta: handlers.onDelta,
      onDone: function (full, meta) {
        finish(full, 'claude');
        handlers.onDone(full, Object.assign({ engine: 'claude' }, meta));
      },
      onError: function (err) {
        state.busy = false;
        handlers.onError(err);
      }
    }).catch(function (err) {
      state.busy = false;
      /* The server went away mid-session — degrade rather than dead-end. */
      var fallback = offlineExplain(input.question);
      handlers.onDelta(fallback, fallback);
      finish(fallback, 'offline');
      handlers.onDone(fallback, { engine: 'offline', degradedFrom: err.message });
      return fallback;
    });
  }

  global.Atlas.assistant = {
    state: state,
    checkStatus: checkStatus,
    loadThread: loadThread,
    clearThread: clearThread,
    ask: ask,
    offlineExplain: offlineExplain,
    findCommandTerms: findCommandTerms,
    COMMAND_TERMS: COMMAND_TERMS
  };
})(window);
