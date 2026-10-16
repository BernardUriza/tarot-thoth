// Small DOM builders shared by the screens.
import { displayName, englishName, pagesOf } from '../thoth/names.js';

export const $ = (id) => document.getElementById(id);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Name, attribution and the opening of the card's section in the book.
export function cardInfo(card, tag = 'div') {
  const node = el(tag);
  node.append(
    el('h3', '', displayName(card)),
    el('p', 'meta', [englishName(card), card.attribution, pagesOf(card)].filter(Boolean).join(' · ')),
    el('p', 'excerpt', card.excerpt),
  );
  return node;
}

export function passageNode(chunk) {
  const node = el('blockquote', 'passage');
  node.append(el('cite', '', `${chunk.section} · p. ${chunk.page}`), el('p', '', chunk.text));
  return node;
}
