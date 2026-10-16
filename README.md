# Tarot Thoth

Live: **https://tarot.bernarduriza.com**

A three-card Thoth tarot reading in the browser, grounded in the book instead of in a prompt. You ask a question, shuffle, deal past / present / future, flip the cards, and the oracle answers with the passages of Crowley's *The Book of Thoth* that belong to the cards you drew.

## How it works

- **The page** (`three/`) is plain ES modules on three.js. No bundler, no framework: open `index.html` from any static server. The deck floats in a starfield, cards flip with a particle burst, and everything a person might tune lives in `three/rules.yml` (spread, timings, retrieval weights, elemental dignities).
- **Retrieval runs in the browser.** `rag/build_thoth.py` segments the Spanish PDF of *El Libro de Thoth* by the book's own headings, so every chunk already knows which card it belongs to. The page loads that corpus and searches it with MiniSearch, boosting hits on the card's own section.
- **Elemental dignity instead of reversals.** Thoth cards are not read upside down. Each card's strength follows from the elements of its neighbours, the way Book T describes it; the rules and the contested attributions are documented in `rules.yml`.
- **The reading comes from AIRE** through the [cristal.cli](https://github.com/BernardUriza/cristal.cli) server (`POST /tarot/reading`), which carries the retrieved passages to a Claude persona and streams the reading back as it is written. When nobody answers, the book speaks for itself.
- **Voice.** When the server holds a key for [susurro](https://github.com/BernardUriza/susurro), the page reads the spread aloud and takes the question by dictation.

## Run it locally

```bash
python3 rag/build_thoth.py "/path/to/El Libro de Thoth.pdf"   # builds three/thoth/ (deck, corpus, card scans)
cd three && python3 -m http.server 8860
```

Open http://localhost:8860. The page talks to the cristal.cli server on `localhost:8131` (see `rules.yml` → `oracle.api_local`); open it with `?api=<url>` to point it anywhere else.

`three/thoth/` is generated from a copyrighted book and is not committed. Rebuild it locally.

## Deploy

```bash
bash three/provision.sh   # once: Static Web App + custom domain
bash three/deploy.sh      # every release, from a machine that has three/thoth/
```

## Tests

```bash
cd three && node --test test/pure.test.mjs
```
