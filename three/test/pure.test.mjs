// The parts of the page that need no browser. Run: node --test three/test/pure.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeView, restFor } from '../js/stage/layout.js';
import { readingRequest, bookFallback, readingAsText } from '../js/oracle.js';
import { displayName, englishName, pagesOf } from '../js/thoth/names.js';
import { judge, dignitiesOf } from '../js/thoth/dignity.js';

const layout = {
  card_px: [271, 402], card_height: 2, spacing: 1.9, min_gap: 0.15, fov: 40,
  spread_top_px: 120, spread_bottom_px: 240,
  intro_card_fraction: 0.36, intro_max_scale: 1.3, intro_lift_fraction: 0.15,
  reading_card_fraction: 0.22, reading_top_px: 84,
};

const lust = { id: 'atu-11', kind: 'atu', numeral: 'XI', name: 'El Deseo', nameEn: 'Lust', pages: [79, 82], excerpt: 'Leo.' };
const truce = { kind: 'minor', suit: 'swords', name: 'Cuatro de Espadas', title: 'Tregua', nameEn: '4 of Swords', titleEn: 'Truce', pages: [205, 205], excerpt: 'Chesed.' };
const queen = { kind: 'court', suit: 'cups', name: 'Reina de Copas', nameEn: 'Queen of Cups', pages: [129, 129], excerpt: 'Agua.' };

for (const [name, width, height] of [['desktop', 1280, 860], ['phone', 390, 844]]) {
  test(`the spread fits the ${name} viewport between its controls`, () => {
    const view = computeView(width, height, layout);
    const px = (world) => world / view.perPx;
    const [left, , right] = [0, 1, 2].map((i) => restFor('spread', i, view, layout));

    assert.ok(px(right.x - left.x + view.cardW) <= width, 'the row is no wider than the screen');
    assert.ok(right.x - left.x >= 2 * (view.cardW + layout.min_gap) - 1e-9, 'the cards do not overlap');
    const top = height / 2 - px(left.y + view.cardH / 2), bottom = height / 2 - px(left.y - view.cardH / 2);
    assert.ok(top >= layout.spread_top_px - 1, `cards start below the hint (${top.toFixed(0)}px)`);
    assert.ok(bottom <= height - layout.spread_bottom_px + 1, `cards end above the caption (${bottom.toFixed(0)}px)`);
  });

  test(`the reading band stays on the ${name} screen`, () => {
    const view = computeView(width, height, layout);
    const rests = [0, 1, 2].map((i) => restFor('reading', i, view, layout));
    const halfCard = (view.readScale * view.cardH) / 2;
    assert.ok(rests[0].y + halfCard <= view.h / 2, 'not cut off at the top');
    assert.ok(Math.abs(rests[0].x) + (view.readScale * view.cardW) / 2 <= view.w / 2, 'not cut off at the sides');
  });
}

test('the deck riffles only while shuffling', () => {
  const view = computeView(1280, 860, layout);
  assert.equal(restFor('intro', 0, view, layout, { time: 3 }).x, 0);
  assert.notEqual(restFor('intro', 0, view, layout, { time: 3, shuffling: true }).x, 0);
});

test('cards are named the way the deck prints them', () => {
  assert.equal(displayName(lust), 'XI · El Deseo');
  assert.equal(displayName(truce), 'Cuatro de Espadas · Tregua');
  assert.equal(englishName(truce), 'Truce (4 of Swords)');
  assert.equal(englishName(queen), 'Queen of Cups');
  assert.equal(pagesOf(lust), 'pp. 79–82');
  assert.equal(pagesOf(queen), 'p. 129');
});

test('the oracle is sent only what the server accepts', () => {
  const chunk = { id: 7, card: 'atu-11', related: null, number: null, section: 'El Deseo', page: 79, text: 'Leo.' };
  const request = readingRequest('¿Y ahora?', ['Pasado'], [lust], [[chunk]], [{ text: 'Sin afectar · Fuego' }]);
  assert.deepEqual(request, {
    question: '¿Y ahora?',
    cards: [{ slot: 'Pasado', name: 'XI · El Deseo (Lust)', dignity: 'Sin afectar · Fuego', passages: [{ section: 'El Deseo', page: 79, text: 'Leo.' }] }],
  });
});

test('without an oracle each card gets its most direct passage', () => {
  const passage = (text) => ({ section: 's', page: 1, text });
  const text = bookFallback(['Pasado', 'Presente'], [lust, queen],
    [[passage('apertura'), passage('cercano'), passage('significado')], [passage('apertura'), passage('otro')]], 2);
  assert.equal(text, 'Pasado — XI · El Deseo\nsignificado\n\nPresente — Reina de Copas\nAgua.');
});

const dignity = {
  elements: { fire: 'Fuego', water: 'Agua', air: 'Aire', earth: 'Tierra' },
  suits: { wands: 'fire', cups: 'water', swords: 'air', disks: 'earth' },
  contraries: [['fire', 'water'], ['air', 'earth']],
  ends: 'pair',
  atu: { 'atu-11': 'fire' },
  levels: Object.fromEntries(['strong', 'supported', 'unaffected', 'mixed', 'weakened'].map((level) => [level, { label: level, glow: 1 }])),
};

// Mathers' own worked examples in Book T ("A Few Examples by G.H. Frater S.R.M.D."):
// left, middle, right, and what he says of the middle card.
const W = 'fire', C = 'water', S = 'air', P = 'earth';
for (const [left, middle, right, level, mathers] of [
  [S, S, S, 'strong', 'Very strong and potent in action'],
  [W, S, W, 'supported', 'Not quite so strong'],
  [C, S, C, 'supported', 'Rather good than otherwise'],
  [S, W, S, 'supported', 'Moderately strong'],
  [P, W, P, 'supported', 'Fairly strong'],
  [C, W, C, 'weakened', 'Weak, evil'],
  [S, C, S, 'supported', 'Medium strong'],
  [P, C, P, 'supported', 'Perfect success and happiness'],
  [S, C, P, 'unaffected', 'the Sw. and P. being opposite elements counteract each other'],
  [S, C, W, 'mixed', 'Fairly good'],
  // the example that contradicts Book T's own rule; the page calls it mixed rather than pick a side
  [P, S, C, 'mixed', 'Very weak'],
]) {
  test(`dignity: ${middle} between ${left} and ${right} is ${level} (Mathers: "${mathers}")`, () => {
    assert.equal(judge(middle, [left, right], dignity), level);
  });
}

test('the ends of the row are judged against their only neighbour, or not at all', () => {
  const row = [truce, lust, queen]; // air, fire, water
  assert.deepEqual(dignitiesOf(row, dignity).map((d) => d.level), ['supported', 'mixed', 'weakened']);
  assert.equal(dignitiesOf(row, dignity)[2].text, 'weakened · Agua junto a Fuego');
  assert.deepEqual(dignitiesOf(row, { ...dignity, ends: 'none' }).map((d) => d?.level ?? null), [null, 'mixed', null]);
});

test('a copied reading carries the question, the spread with its dignities, and the reading', () => {
  const copied = readingAsText({
    asked: '¿Y ahora?', slots: ['Pasado', 'Presente'], drawn: [lust, queen],
    dignities: [{ text: 'Mal dignificada · Fuego junto a Agua' }, null], text: 'La lectura.', note: 'Lectura de AIRE.',
  });
  assert.equal(copied, [
    'Tarot Thoth — «¿Y ahora?»',
    'Pasado: XI · El Deseo (Lust) — Mal dignificada · Fuego junto a Agua\nPresente: Reina de Copas (Queen of Cups)',
    'La lectura.',
    'Lectura de AIRE.',
  ].join('\n\n'));
});
