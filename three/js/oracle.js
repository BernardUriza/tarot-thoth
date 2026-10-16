// The reading: asked of AIRE through the cristal.cli server, which streams it
// as it is written, or, when nobody answers, read straight out of the book.
import { displayName, englishName } from './thoth/names.js';

export function readingRequest(question, slots, drawn, retrieved, dignities) {
  return {
    question,
    cards: drawn.map((card, i) => ({
      slot: slots[i],
      name: `${displayName(card)} (${englishName(card)})`,
      dignity: dignities[i]?.text ?? '',
      passages: retrieved[i].map(({ section, page, text }) => ({ section, page, text })),
    })),
  };
}

// No oracle: let the book speak. Each card's most direct passage is the last one
// retrieved (its practical meaning or the note on its number) or, failing that,
// the opening of its section.
export function bookFallback(slots, drawn, retrieved, passagesPerCard) {
  return drawn.map((card, i) => {
    const passage = retrieved[i].length > passagesPerCard ? retrieved[i].at(-1).text : card.excerpt;
    return `${slots[i]} — ${displayName(card)}\n${passage}`;
  }).join('\n\n');
}

// The reading as plain text, to paste somewhere else: question, spread, reading.
export function readingAsText({ asked, slots, drawn, dignities, text, note }) {
  const spread = drawn.map((card, i) => {
    const dignity = dignities[i] ? ` — ${dignities[i].text}` : '';
    return `${slots[i]}: ${displayName(card)} (${englishName(card)})${dignity}`;
  });
  return [`Tarot Thoth${asked ? ` — «${asked}»` : ''}`, spread.join('\n'), text, note].join('\n\n');
}

// The server answers with one JSON event per line.
async function* eventsOf(response) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    const lines = (pending + value).split('\n');
    pending = lines.pop();
    for (const line of lines) if (line.trim()) yield JSON.parse(line);
  }
}

// Resolves to { status: 'done' | 'fallback', text, note }. onText gets the
// reading so far each time more of it arrives. The oracle is given up on after
// `silenceSeconds` without a single event, not after a fixed total: a long
// reading that keeps coming is fine, a dead line is not.
export async function askOracle(api, { question, slots, drawn, retrieved, dignities, passagesPerCard, silenceSeconds }, onText) {
  const abort = new AbortController();
  let silence = 0;
  const listen = () => {
    clearTimeout(silence);
    silence = setTimeout(() => abort.abort(new Error(`${silenceSeconds} s sin respuesta`)), silenceSeconds * 1000);
  };
  try {
    listen();
    const response = await fetch(`${api}/tarot/reading`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(readingRequest(question, slots, drawn, retrieved, dignities)),
      signal: abort.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let written = '';
    for await (const event of eventsOf(response)) {
      listen();
      if (event.type === 'text') onText(written += event.text);
      if (event.type === 'error') throw new Error(event.detail);
      if (event.type === 'result') {
        return {
          status: 'done',
          text: event.reading,
          note: `Lectura de AIRE${event.model ? ` (${event.model})` : ''} a partir de los pasajes de abajo.`,
        };
      }
    }
    throw new Error('la respuesta se cortó');
  } catch (error) {
    const reason = abort.signal.aborted ? abort.signal.reason.message : error.message;
    return {
      status: 'fallback',
      text: bookFallback(slots, drawn, retrieved, passagesPerCard),
      note: `El oráculo no respondió (${reason}); esto es lo que dice el Libro de Thoth sobre cada carta, sin interpretar.`,
    };
  } finally {
    clearTimeout(silence);
  }
}
