#!/usr/bin/env node
// RETIRED 2026-10-26: the /gemini skill is read-only (no `image`), so this script exits 2 before
// doing anything. The 22 trumps it redrew stay in ../three/thoth/cards-hd and build_thoth.py keeps
// using them; FOOT below remains the record of what each card must carry if they are ever redrawn
// with another tool.
//
// Redraw the low-resolution card scans (271 x 402, as embedded in the PDF) in
// high definition, one card per turn of a single Gemini chat.
//
// The Gemini side (image tool, attaching, waiting, downloading) is the /gemini
// skill's `image` subcommand; this file only knows the deck: which cards, and
// what each one must keep written on it.
//
//   node hd_gemini.mjs --cards atu            # the 22 trumps
//   node hd_gemini.mjs --cards atu-00,atu-18  # just these
//   [--out ../three/thoth/cards-hd] [--pause 25] [--chat <url>]
//
// Outputs already on disk are skipped, so an interrupted run resumes. One JSON
// line per card. What comes back is a REDRAWING, not a true upscale: every
// result needs a human look, above all the lettering and the two glyphs at the
// foot of each card.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const THOTH = resolve(HERE, '../three/thoth');
// The skill as this repository's constitution lock materializes it. GEMINI_SKILL points at another
// copy of the script, for the window between editing the skill and re-locking this repository.
const GEMINI = process.env.GEMINI_SKILL ?? resolve(HERE, '../../.claude/skills/gemini/scripts/gemini.mjs');

// What is printed at the foot of each trump: its Hebrew letter (left) and its
// astrological sign, planet or element (right). Named in the prompt because the
// scan is too small to read and the model otherwise invents them (it drew He
// for Qoph on The Moon).
const FOOT = {
  'atu-00': ['Aleph (א)', 'the alchemical symbol of Air'], 'atu-01': ['Beth (ב)', 'the symbol of Mercury (☿)'],
  'atu-02': ['Gimel (ג)', 'the crescent Moon (☽)'], 'atu-03': ['Daleth (ד)', 'the symbol of Venus (♀)'],
  'atu-04': ['Tzaddi (צ)', 'the sign of Aries (♈)'], 'atu-05': ['Vau (ו)', 'the sign of Taurus (♉)'],
  'atu-06': ['Zain (ז)', 'the sign of Gemini (♊)'], 'atu-07': ['Cheth (ח)', 'the sign of Cancer (♋)'],
  'atu-08': ['Lamed (ל)', 'the sign of Libra (♎)'], 'atu-09': ['Yod (י)', 'the sign of Virgo (♍)'],
  'atu-10': ['Kaph (כ)', 'the symbol of Jupiter (♃)'], 'atu-11': ['Teth (ט)', 'the sign of Leo (♌)'],
  'atu-12': ['Mem (מ)', 'the alchemical symbol of Water'], 'atu-13': ['Nun (נ)', 'the sign of Scorpio (♏)'],
  'atu-14': ['Samekh (ס)', 'the sign of Sagittarius (♐)'], 'atu-15': ['Ayin (ע)', 'the sign of Capricorn (♑)'],
  'atu-16': ['Pe (פ)', 'the symbol of Mars (♂)'], 'atu-17': ['He (ה)', 'the sign of Aquarius (♒)'],
  'atu-18': ['Qoph (ק)', 'the sign of Pisces (♓)'], 'atu-19': ['Resh (ר)', 'the symbol of the Sun (☉)'],
  'atu-20': ['Shin (ש)', 'the alchemical symbol of Fire'], 'atu-21': ['Tau (ת)', 'the symbol of Saturn (♄)'],
};

const UNNAMED = new Set(['atu-13']);
// Known gap: Art (atu-14). Dictated, it comes back with BOTH the scan's own glyphs and the dictated
// ones side by side (three tries, one in a fresh chat); left "as printed", it invents a glyph. It has
// no accepted redrawing; its attempts are in cards-hd/rejected/ and the page keeps the scan for it.

function promptFor(card) {
  const lines = [
    'Restore this small scan of a tarot card to high definition.',
    'This is a faithful restoration, not a redesign: keep exactly the same composition, figures, poses, colours and hand-painted style. Do not add, remove, move or reinterpret anything.',
    'Sharpen the line work, recover fine detail and paint texture, and remove the JPEG blocking and scan noise.',
    'Keep the pale card border with its engraved frame, the full card visible edge to edge, portrait orientation, same proportions.',
  ];
  if (card.kind === 'atu') {
    const [letter, sign] = FOOT[card.id];
    // Gemini declines the card when its title is spelled out in the prompt (Death, twice), so that one is left unnamed.
    const title = UNNAMED.has(card.id) ? 'the title exactly as printed' : `the title "${card.nameEn}"`;
    lines.push(`Lettering must stay exactly as on the card: the numeral "${card.numeral}" in the oval at the top, and ${title} at the foot, flanked by the Hebrew letter ${letter} on the left and ${sign} on the right.`);
    // without this it sometimes draws each of them twice (Lust and Art did)
    lines.push('Each of those two symbols appears exactly once: one Hebrew letter at the left end of the title strip, one sign at the right end, nothing else beside the title.');
  } else {
    lines.push('Keep every word, numeral and symbol printed on the card exactly as it is; do not invent lettering.');
  }
  return lines.join(' ');
}

// One turn of the skill. It prints its JSON result and exits non-zero on failure.
function redraw(card, out, chat) {
  const promptFile = join(tmpdir(), `thoth-hd-${card.id}.txt`);
  writeFileSync(promptFile, promptFor(card));
  const args = [GEMINI, 'image', '--file', promptFile, '--attach', resolve(THOTH, card.image), '--out', out];
  if (chat) args.push('--chat', chat);
  try {
    return JSON.parse(execFileSync('node', args, { encoding: 'utf8', timeout: 400000, stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    // the skill exits 1 with its JSON on stdout; anything else (a crash, a timeout) is reported as it came
    try { return JSON.parse(error.stdout); } catch { return { ok: false, error: `${error.message} ${error.stderr ?? ''}`.trim().slice(0, 400) }; }
  }
}

console.error('hd_gemini.mjs is retired: the gemini skill is read-only since 2026-10-26 (no image generation). The existing cards-hd/ redraws stay valid.');
process.exit(2);

const flags = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((flag) => { const [key, ...value] = flag.trim().split(' '); return [key, value.join(' ') || true]; }));
if (!flags.cards) { console.error('usage: hd_gemini.mjs --cards atu|<id,id,…> [--out dir] [--pause seconds] [--chat url]'); process.exit(2); }
if (!existsSync(GEMINI)) { console.error(`the gemini skill is not installed in this repository: ${GEMINI}`); process.exit(2); }

const deck = JSON.parse(readFileSync(resolve(THOTH, 'deck.json'), 'utf8')).cards;
const wanted = flags.cards === 'atu' ? deck.filter((card) => card.kind === 'atu') : flags.cards.split(',').map((id) => {
  const card = deck.find((c) => c.id === id.trim());
  if (!card) throw new Error(`unknown card ${id}`);
  return card;
});
const outDir = resolve(flags.out ?? resolve(THOTH, 'cards-hd'));
mkdirSync(outDir, { recursive: true });
const todo = wanted.filter((card) => !existsSync(resolve(outDir, `${card.id}.jpg`)));

let chat = flags.chat === true ? undefined : flags.chat;
let failed = false;
for (const [i, card] of todo.entries()) {
  const result = redraw(card, resolve(outDir, `${card.id}.jpg`), chat);
  console.log(JSON.stringify({ card: card.id, ...result }));
  // Gemini declining one card in words (it refuses Death) is a finished turn: note it and go on.
  // Any other failure leaves the chat in an unknown state: stop instead of piling more onto it.
  if (!result.ok && !result.reply) process.exit(1);
  if (!result.ok) failed = true;
  chat = result.chatUrl ?? chat; // every later card continues the same conversation
  if (i < todo.length - 1) await new Promise((r) => setTimeout(r, Number(flags.pause ?? 25) * 1000));
}
process.exit(failed ? 1 : 0);
