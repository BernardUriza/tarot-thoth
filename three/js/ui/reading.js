// The Lectura screen: what was drawn, an honest wait, and the reading arriving.
import { $, el, cardInfo, passageNode } from './dom.js';
import { readingAsText } from '../oracle.js';

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// Types `full` into `node` starting from what it already shows. AIRE has been
// delivering the whole reading in one piece, so this is what makes it arrive
// instead of pop; if it ever streams word by word there is nothing left to type.
function typeRest(node, full, seconds, done) {
  let shown = node.textContent.length;
  const step = Math.max(1, Math.round(full.length / (seconds * 60)));
  const finish = () => { clearInterval(timer); node.textContent = full; done(); };
  const timer = setInterval(() => {
    shown += step;
    node.textContent = full.slice(0, shown);
    if (shown >= full.length) finish();
  }, 16);
  node.addEventListener('click', finish, { once: true }); // impatient? one click shows it all
  return () => clearInterval(timer);
}

// speaker: the voice that can read the result aloud, or null when there is none.
export function createReadingView(oracle, reducedMotion, speaker) {
  const text = $('reading-text'), status = $('reading-status'), note = $('reading-note');
  const wait = $('reading-wait'), bar = $('reading-bar'), eta = $('reading-eta'), retry = $('retry'), copy = $('copy'), speak = $('speak');
  let spread = null;   // what prepare() was given: the question, the cards, their dignities
  let whole = null;    // the reading on screen once all of it is there
  let ticking = 0;
  let stopTyping = () => {};

  function quiet() {
    speaker?.stop();
    speak.classList.remove('live');
    speak.textContent = 'Escuchar la lectura';
  }

  function reset() {
    clearInterval(ticking);
    stopTyping();
    quiet();
  }

  // Everything known the moment the third card turns, before the oracle answers.
  function prepare({ asked, slots, drawn, retrieved, dignities }) {
    spread = { asked, slots, drawn, dignities };
    $('asked').textContent = asked ? `«${asked}»` : '';
    $('drawn').replaceChildren(...drawn.map((card, i) => {
      const article = cardInfo(card, 'article');
      article.className = 'panel';
      article.prepend(el('h2', '', slots[i]));
      if (dignities[i]) article.append(el('p', `dignity ${dignities[i].level}`, dignities[i].text));
      return article;
    }));
    $('reading-sources').replaceChildren(...retrieved.flat().map(passageNode));
  }

  // Nothing has arrived yet: say how long it has been and how long it usually takes.
  function showWait(reading) {
    const typical = oracle.typical_first_words_seconds;
    const tick = () => {
      const elapsed = (performance.now() - reading.askedAt) / 1000;
      const phrase = oracle.waiting_phrases[Math.floor(elapsed / oracle.waiting_phrase_seconds) % oracle.waiting_phrases.length];
      text.replaceChildren(el('span', 'loader'), phrase);
      // the bar never fills on a guess: past the usual time it parks near the end
      bar.style.width = `${Math.min(95, (elapsed / typical) * 90)}%`;
      eta.textContent = elapsed <= typical
        ? `Van ${clock(elapsed)} · AIRE suele empezar a escribir a los ${typical} s.`
        : `Van ${clock(elapsed)} · está tardando más de lo normal (${typical} s). Se abandona tras ${oracle.silence_seconds} s sin señal.`;
    };
    clearInterval(ticking);
    tick();
    ticking = setInterval(tick, 500);
    wait.hidden = false;
    status.textContent = oracle.waiting_phrases[0];
  }

  // reading: { status: 'pending' | 'writing' | 'done' | 'fallback', text, note, askedAt, shown }
  // Called on every change and on entering the screen; draws whatever is true now.
  function render(reading) {
    if (!reading || reading.shown) return;
    const settled = reading.status === 'done' || reading.status === 'fallback';
    note.hidden = true;
    retry.hidden = true;
    copy.hidden = true;
    speak.hidden = true;
    quiet();
    if (reading.status === 'pending') return showWait(reading);

    clearInterval(ticking);
    wait.hidden = true;
    text.classList.add('typing');
    if (!settled) return void (text.textContent = reading.text);

    reading.shown = true;
    if (text.querySelector('.loader') || !reading.text.startsWith(text.textContent)) text.textContent = '';
    const done = () => {
      text.classList.remove('typing');
      note.textContent = reading.note;
      note.hidden = false;
      retry.hidden = reading.status !== 'fallback';
      whole = reading;
      copy.textContent = 'Copiar lectura';
      copy.hidden = false;
      speak.hidden = !speaker;
      status.textContent = reading.text; // screen readers get the reading once, whole
    };
    stopTyping();
    if (reducedMotion.matches) { text.textContent = reading.text; done(); }
    else stopTyping = typeRest(text, reading.text, oracle.typewriter_seconds, done);
  }

  speak.addEventListener('click', async () => {
    if (speaker.playing) return quiet();
    speak.textContent = 'Preparando la voz…';
    try {
      await speaker.play(whole.text, quiet);
      speak.textContent = 'Detener';
      speak.classList.add('live');
    } catch (error) {
      quiet();
      speak.textContent = `Sin voz: ${error.message}`;
    }
  });

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(readingAsText({ ...spread, text: whole.text, note: whole.note }));
      copy.textContent = 'Copiada ✓';
    } catch {
      copy.textContent = 'No se pudo copiar';
    }
    setTimeout(() => { copy.textContent = 'Copiar lectura'; }, 2000);
  });

  return { reset, prepare, render };
}
