// The whole deck, face up, in the order the shuffle left it: the proof that
// all 78 cards were in play and that the spread is simply its first three.
import { $, el } from './dom.js';
import { displayName } from '../thoth/names.js';

const KINDS = [['atu', 'arcanos mayores'], ['court', 'cartas de corte'], ['minor', 'cartas menores']];

export function createDeckView(slots) {
  const panel = $('deck'), grid = $('deck-grid'), count = $('deck-count');
  let order = [];

  // 78 scans are only fetched if someone actually opens the panel
  function draw() {
    if (!panel.open || grid.childElementCount) return;
    grid.replaceChildren(...order.map((card, i) => {
      const figure = el('figure', i < slots.length ? 'drawn' : '');
      const image = el('img');
      Object.assign(image, { src: `thoth/${card.image}`, alt: '', loading: 'lazy', width: 271, height: 402 });
      const position = i < slots.length ? `${i + 1} · ${slots[i]}` : `${i + 1}`;
      figure.append(image, el('figcaption', '', position), el('span', 'name', displayName(card)));
      return figure;
    }));
  }
  panel.addEventListener('toggle', draw);

  // shuffled: the deck exactly as the shuffle left it, top card first
  function set(shuffled) {
    order = shuffled;
    grid.replaceChildren();
    const distinct = new Set(order.map((card) => card.id)).size;
    const kinds = KINDS.map(([kind, name]) => `${order.filter((card) => card.kind === kind).length} ${name}`).join(', ');
    count.textContent = `${order.length} cartas, ${distinct} distintas: ${kinds}. Las ${slots.length} de arriba son tu tirada.`;
    draw();
  }

  return { set };
}
