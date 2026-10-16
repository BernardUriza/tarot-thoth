// How a Thoth card is called on screen and to the oracle.

export function displayName(card) {
  if (card.kind === 'atu') return `${card.numeral} · ${card.name}`;
  return card.title ? `${card.name} · ${card.title}` : card.name;
}

export function englishName(card) {
  return card.titleEn ? `${card.titleEn} (${card.nameEn})` : card.nameEn;
}

export function pagesOf(card) {
  const [first, last] = card.pages;
  return first === last ? `p. ${first}` : `pp. ${first}–${last}`;
}
