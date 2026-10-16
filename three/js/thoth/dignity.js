// Elemental dignity: how a card's neighbours strengthen or weaken it. This is
// what the Thoth deck uses where other decks use reversed cards. The elements,
// the contrary pairs and the names of the verdicts come from rules.yml.

export function elementOf(card, dignity) {
  return card.kind === 'atu' ? dignity.atu[card.id] : dignity.suits[card.suit];
}

function relation(a, b, dignity) {
  if (a === b) return 'same';
  const contrary = dignity.contraries.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return contrary ? 'contrary' : 'friendly';
}

// own: the card's element; flanks: the elements next to it (two, or one at an end).
export function judge(own, flanks, dignity) {
  // "If a card pass between two which are naturally contrary, it is not affected by either much"
  if (flanks.length === 2 && relation(flanks[0], flanks[1], dignity) === 'contrary') return 'unaffected';
  const relations = flanks.map((flank) => relation(own, flank, dignity));
  const contrary = relations.filter((r) => r === 'contrary').length;
  if (contrary === relations.length) return 'weakened';
  if (contrary) return 'mixed';
  return relations.every((r) => r === 'same') ? 'strong' : 'supported';
}

// One verdict per card of the row: { element, level, label, ill, glow, text }.
// A card left unjudged (an end card when dignity.ends is `none`) gets null.
export function dignitiesOf(drawn, dignity) {
  const elements = drawn.map((card) => elementOf(card, dignity));
  return drawn.map((_, i) => {
    const flanks = [i - 1, i + 1].filter((j) => j >= 0 && j < drawn.length).map((j) => elements[j]);
    if (flanks.length < 2 && dignity.ends === 'none') return null;
    const level = judge(elements[i], flanks, dignity);
    const { label, glow } = dignity.levels[level];
    const name = (element) => dignity.elements[element];
    const where = flanks.length === 2 ? `entre ${name(flanks[0])} y ${name(flanks[1])}` : `junto a ${name(flanks[0])}`;
    return { element: elements[i], level, label, glow, ill: level === 'weakened', text: `${label} · ${name(elements[i])} ${where}` };
  });
}
