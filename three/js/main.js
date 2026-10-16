// Tarot Thoth: wires the stage, the deck and the screens together.
import * as THREE from 'three';
import { loadRules } from './rules.js';
import { loadThoth } from './thoth/rag.js';
import { askOracle } from './oracle.js';
import { voiceAvailable, createSpeaker, createDictation } from './voice.js';
import { displayName } from './thoth/names.js';
import { dignitiesOf } from './thoth/dignity.js';
import { createStage } from './stage/scene.js';
import { createStars, createSparks } from './stage/effects.js';
import { createCards } from './stage/cards.js';
import { $, el, cardInfo } from './ui/dom.js';
import { createScreens } from './ui/screens.js';
import { createReadingView } from './ui/reading.js';
import { wireBook } from './ui/book.js';
import { createDeckView } from './ui/deck.js';

const rules = await loadRules();
const { slots } = rules.spread;
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const api = (new URLSearchParams(location.search).get('api') ?? (isLocal ? rules.oracle.api_local : rules.oracle.api)).replace(/\/+$/, '');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const labelLayer = $('labels');
const labels = [...labelLayer.querySelectorAll('.label')];

const stage = createStage(rules.layout);
const driftStars = createStars(stage.scene, rules.effects.stars);
const sparks = createSparks(stage.scene, rules.effects);
const cards = createCards(stage, rules, (mesh) => sparks.burst(mesh.position, mesh.scale.x));
// susurro speaks and listens only when the server holds a key for it
const hasVoice = await voiceAvailable(api);
const readingView = createReadingView(rules.oracle, reducedMotion, hasVoice ? createSpeaker(api, rules.voice) : null);
const deckView = createDeckView(slots);
const screens = createScreens((screen) => { if (screen === 'reading') readingView.render(reading); });

// the screens leave room for what the stage draws: the band of cards over the
// reading, and one card's share of the row for each label of the spread
function fitToStage() {
  const { view } = stage;
  const band = rules.layout.reading_top_px + (view.readScale * view.cardH) / view.perPx + 24;
  document.documentElement.style.setProperty('--reading-band', `${Math.round(band)}px`);
  labelLayer.style.setProperty('--label-width', `${Math.floor(view.spacing / view.perPx)}px`);
}
fitToStage();
addEventListener('resize', fitToStage);
labels.forEach((label, i) => { label.querySelector('.slot').textContent = slots[i]; });
$('question').maxLength = rules.spread.question_max_chars;

const clock = new THREE.Clock();
const pointer = new THREE.Vector2();
let thoth = null;
let hovered = null;
let shuffling = false;
let reading = null;
let order = []; // the whole deck as the last shuffle left it; the spread is its first three

function shuffle(list) {
  const random = new Uint32Array(list.length);
  crypto.getRandomValues(random);
  for (let i = list.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function deal() {
  if (!thoth || shuffling) return;
  reading = null;
  readingView.reset();
  order = shuffle([...thoth.cards]);
  cards.setFaces(order);
  labels.forEach((label, i) => {
    label.querySelector('.name').textContent = '';
    label.setAttribute('aria-label', `${slots[i]}: voltear carta`);
  });
  $('hint').textContent = 'Toca cada carta para voltearla.';
  $('caption').replaceChildren(el('p', 'meta', 'Lo que el Libro de Thoth dice de cada carta aparece aquí al voltearla.'));
  $('to-reading').hidden = true;

  // riffle the deck in place, then send the cards out one after another
  shuffling = true;
  setTimeout(() => {
    shuffling = false;
    cards.meshes.forEach((mesh, i) => { mesh.userData.moveAt = clock.elapsedTime + i * rules.motion.deal_stagger_seconds; });
    screens.show('spread');
  }, reducedMotion.matches ? 0 : rules.motion.shuffle_seconds * 1000);
}

function openCard(mesh) {
  const data = mesh.userData;
  const settled = clock.elapsedTime >= data.moveAt + rules.motion.settle_seconds;
  if (screens.current !== 'spread' || data.open || !data.card || !settled) return;
  data.open = true;
  labels[data.slot].querySelector('.name').textContent = displayName(data.card);
  labels[data.slot].setAttribute('aria-label', `${slots[data.slot]}: ${displayName(data.card)}`);

  const caption = $('caption');
  caption.replaceChildren(el('h2', '', slots[data.slot]), cardInfo(data.card));
  caption.classList.remove('swap');
  void caption.offsetWidth; // restart the entrance animation
  caption.classList.add('swap');

  if (cards.meshes.every((m) => m.userData.open)) {
    $('hint').textContent = 'La tirada está completa.';
    $('to-reading').hidden = false;
    startReading();
  }
}

// The oracle is asked the moment the third card turns, so most of its wait is
// spent while the querent is still looking at the spread.
async function startReading() {
  const asked = $('question').value.trim();
  const drawn = cards.meshes.map((mesh) => mesh.userData.card);
  // the spread is complete, so each card's dignity is settled: it follows from its neighbours
  const dignities = dignitiesOf(drawn, rules.dignity);
  cards.meshes.forEach((mesh, i) => { mesh.userData.glowFactor = dignities[i]?.glow ?? 1; });
  const retrieved = drawn.map((card, i) => thoth.passagesFor(card, asked, dignities[i]?.ill));
  const mine = reading = { status: 'pending', text: '', askedAt: performance.now() };
  const show = () => { if (mine === reading && screens.current === 'reading') readingView.render(mine); };
  readingView.prepare({ asked, slots, drawn, retrieved, dignities });
  deckView.set(order); // only now, with the three cards turned, can the rest of the deck be shown
  show();

  const answer = await askOracle(api, {
    question: asked, slots, drawn, retrieved, dignities,
    passagesPerCard: rules.retrieval.passages_per_card, silenceSeconds: rules.oracle.silence_seconds,
  }, (written) => { Object.assign(mine, { status: 'writing', text: written }); show(); });
  Object.assign(mine, answer);
  show();
}

function trackPointer(event) {
  pointer.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
}

addEventListener('pointermove', (event) => {
  trackPointer(event);
  hovered = screens.current === 'book' ? null : cards.pick(pointer);
  document.body.style.cursor = hovered ? 'pointer' : '';
});
// The cards answer a click on every screen, not only where they are dealt: the
// deck deals, a face-down card turns over, and any other card spins once.
// Screens lie over the canvas, so the click is caught on the page and aimed by hand.
addEventListener('click', (event) => {
  if (event.target.closest('button, input, a, summary, .panel, nav')) return;
  trackPointer(event);
  const mesh = cards.pick(pointer);
  if (!mesh) return;
  if (screens.current === 'intro') deal();
  else if (screens.current === 'spread' && !mesh.userData.open) openCard(mesh);
  else cards.spin(mesh);
});
labels.forEach((label, i) => label.addEventListener('click', () => openCard(cards.meshes[i])));
$('ask').addEventListener('submit', (event) => { event.preventDefault(); deal(); });
$('to-reading').addEventListener('click', () => screens.show('reading'));
$('see-spread').addEventListener('click', () => screens.show('spread'));
$('retry').addEventListener('click', startReading);

if (hasVoice && navigator.mediaDevices) {
  const dictation = createDictation(api, rules.voice);
  const button = $('dictate');
  const idle = () => { button.classList.remove('live'); button.textContent = 'Dictar la pregunta'; };
  const finish = async () => {
    button.classList.remove('live');
    button.textContent = 'Transcribiendo…';
    try {
      const heard = await dictation.stop();
      if (heard) $('question').value = heard.slice(0, rules.spread.question_max_chars);
      idle();
    } catch (error) {
      button.textContent = `No se pudo: ${error.message}`;
    }
  };
  button.hidden = false;
  button.addEventListener('click', async () => {
    if (dictation.recording) return finish();
    try {
      await dictation.start(finish);
      button.classList.add('live');
      button.textContent = 'Escuchando… toca para terminar';
    } catch (error) {
      button.textContent = `Sin micrófono: ${error.message}`;
    }
  });
}
$('again').addEventListener('click', () => {
  cards.meshes.forEach((mesh) => { mesh.userData.open = false; });
  $('question').value = '';
  screens.show('intro');
});

stage.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;
  const still = reducedMotion.matches;
  const waiting = screens.current === 'reading' && reading?.status === 'pending';

  cards.update({ dt, time, still, screen: screens.current, shuffling, hovered, waiting, pointer })
    .forEach(({ x, y }, i) => { labels[i].style.transform = `translate(${x}px, ${y}px) translateX(-50%)`; });
  if (!still) driftStars(time, pointer, 1 - Math.exp(-dt * rules.motion.ease_rate));
  sparks.update(dt);
  stage.renderer.render(stage.scene, stage.camera);
});

screens.show('intro');
try {
  thoth = await loadThoth(rules.retrieval);
  wireBook(thoth);
  const { title, author, translation, pages } = thoth.source;
  $('source').textContent = `Textos e imágenes: «${title}», ${author} (trad. ${translation}), ${pages} páginas.`;
  $('deal').disabled = false;
} catch (error) {
  $('intro-hint').textContent = `No se pudo cargar el mazo Thoth (${error.message}). Genera thoth/ con rag/build_thoth.py.`;
}
