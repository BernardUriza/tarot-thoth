// Retrieval over "El Libro de Thoth", built by ../../../rag/build_thoth.py.
//
// The book has one section per card, so a drawn card is a key, not a query:
// its passages are looked up exactly. Free text (the querent's question, the
// search box) goes through a lexical BM25 index, which is plenty for one book.
import MiniSearch from 'minisearch';

// Same folding at index and query time: case, accents, stop words and plurals.
function termProcessor(stopwords) {
  return (term) => {
    const word = term.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    if (word.length < 2 || stopwords.has(word)) return null;
    if (word.length > 5 && word.endsWith('ces')) return `${word.slice(0, -3)}z`;
    if (word.length > 5 && word.endsWith('es')) return word.slice(0, -2);
    if (word.length > 4 && word.endsWith('s')) return word.slice(0, -1);
    return word;
  };
}

export async function loadThoth(retrieval, base = 'thoth/') {
  const [deck, corpus] = await Promise.all(
    ['deck.json', 'chunks.json'].map(async (file) => {
      const response = await fetch(base + file);
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      return response.json();
    }),
  );
  const { chunks } = corpus;
  const cards = new Map(deck.cards.map((card) => [card.id, card]));
  const isDivination = (chunk) => chunk.section.endsWith('Significado adivinatorio');

  const index = new MiniSearch({
    fields: ['text', 'section', 'cardName'],
    extractField: (chunk, field) => (field === 'cardName' ? cards.get(chunk.card)?.name ?? '' : chunk[field]),
    processTerm: termProcessor(new Set(retrieval.stopwords.split(/\s+/))),
    searchOptions: {
      boost: { cardName: retrieval.boost.card_name, section: retrieval.boost.section },
      prefix: (term) => term.length >= retrieval.prefix_min_length,
      fuzzy: retrieval.fuzzy,
    },
  });
  index.addAll(chunks);

  function search(query, { limit = retrieval.search_limit, filter } = {}) {
    const hits = index.search(query, filter ? { filter: (hit) => filter(chunks[hit.id]) } : undefined);
    return hits.slice(0, limit).map((hit) => chunks[hit.id]);
  }

  // What the book says about one drawn card: the opening of its section, the
  // passage of that section closest to the question, its practical meaning (Atu)
  // or the note on its number that names it (small cards). An ill-dignified card
  // also brings whatever its section says about being ill dignified.
  function passagesFor(card, question = '', illDignified = false) {
    const own = chunks.filter((chunk) => chunk.card === card.id && !isDivination(chunk));
    const picked = new Set(own.slice(0, 1));
    const closest = question.trim()
      ? search(question, { limit: retrieval.passages_per_card, filter: (chunk) => own.includes(chunk) })
      : [];
    [...closest, ...own].forEach((chunk) => picked.size < retrieval.passages_per_card && picked.add(chunk));

    if (illDignified) own.filter((chunk) => /dignific/i.test(chunk.text)).forEach((chunk) => picked.add(chunk));

    const divination = chunks.find((chunk) => chunk.card === card.id && isDivination(chunk));
    if (divination) picked.add(divination);
    if (card.kind === 'minor') {
      const group = chunks.filter((chunk) => chunk.card === null && chunk.number === card.number);
      const naming = group.find((chunk) => chunk.text.toLowerCase().includes(card.name.toLowerCase()));
      if (naming ?? group[0]) picked.add(naming ?? group[0]);
    }
    return [...picked];
  }

  return { source: deck.source, cards: deck.cards, search, passagesFor };
}
