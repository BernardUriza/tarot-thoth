// The El Libro screen: free-text search over the whole book.
import { $, el, passageNode } from './dom.js';

export function wireBook(thoth) {
  const results = $('book-results');

  $('book-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = $('book-query').value.trim();
    if (!query) return results.replaceChildren();
    const hits = thoth.search(query);
    results.replaceChildren(...(hits.length
      ? hits.map((chunk, i) => Object.assign(passageNode(chunk), { style: `animation-delay:${i * 70}ms` }))
      : [el('p', 'empty', 'El libro no dice nada con esas palabras.')]));
  });
}
