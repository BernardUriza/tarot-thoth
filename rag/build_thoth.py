#!/usr/bin/env python3
"""Build the Thoth deck and its retrieval corpus from the Spanish PDF of
"El Libro de Thoth" (Aleister Crowley, trad. Dion Conde, 2008).

The book is already organized the way a tarot reading queries it: one section
per card. So the corpus is segmented by the book's own headings instead of by
blind fixed-size windows, and every chunk carries the card it belongs to.

Outputs, under --out (default ../three/thoth):
  deck.json     the 78 cards: names, pages, attribution, excerpt, image
  chunks.json   every passage of the book, tagged with card / section / page
  cards/*.jpg   the card images embedded in the PDF

If ../three/thoth/cards-hd/<id>.jpg exists (redrawn by hd_gemini.mjs, now retired), deck.json points at it as
the card's `imageHd`; run this again after redrawing cards.

Needs poppler's `pdftotext` and `pdfimages` on PATH. The script fails loudly
if it does not find exactly 78 cards, each with an image and text.

Usage: python3 build_thoth.py "/path/to/El Libro de Thoth.pdf"
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

ATU_EN = [
    'The Fool', 'The Magus', 'The Priestess', 'The Empress', 'The Emperor',
    'The Hierophant', 'The Lovers', 'The Chariot', 'Adjustment', 'The Hermit',
    'Fortune', 'Lust', 'The Hanged Man', 'Death', 'Art', 'The Devil',
    'The Tower', 'The Star', 'The Moon', 'The Sun', 'The Aeon', 'The Universe',
]
ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI',
         'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI']

# The translation says "Oros" almost everywhere and "Discos" once; both are the suit of Disks.
SUITS = {'BASTOS': ('wands', 'Bastos', 'Wands'), 'COPAS': ('cups', 'Copas', 'Cups'),
         'ESPADAS': ('swords', 'Espadas', 'Swords'), 'OROS': ('disks', 'Oros', 'Disks'),
         'DISCOS': ('disks', 'Oros', 'Disks')}
RANKS = {'CABALLERO': ('knight', 'Knight'), 'REINA': ('queen', 'Queen'),
         'PRÍNCIPE': ('prince', 'Prince'), 'PRINCESA': ('princess', 'Princess')}
NUMBERS = {'AS': 1, 'DOS': 2, 'TRES': 3, 'CUATRO': 4, 'CINCO': 5, 'SEIS': 6,
           'SIETE': 7, 'OCHO': 8, 'NUEVE': 9, 'DIEZ': 10}
MINOR_EN = {
    'wands': ['Dominion', 'Virtue', 'Completion', 'Strife', 'Victory', 'Valour', 'Swiftness', 'Strength', 'Oppression'],
    'cups': ['Love', 'Abundance', 'Luxury', 'Disappointment', 'Pleasure', 'Debauch', 'Indolence', 'Happiness', 'Satiety'],
    'swords': ['Peace', 'Sorrow', 'Truce', 'Defeat', 'Science', 'Futility', 'Interference', 'Cruelty', 'Ruin'],
    'disks': ['Change', 'Works', 'Power', 'Worry', 'Success', 'Failure', 'Prudence', 'Gain', 'Wealth'],
}
GROUP_NUMBER = {'ACES': 1, 'DOS': 2, 'TRES': 3, 'CUATROS': 4, 'CINCOS': 5, 'SEISES': 6,
                'SIETES': 7, 'OCHOS': 8, 'NUEVES': 9, 'DIECES': 10}

RE_ATU = re.compile(r'^(0|[IVX]{1,5})\. ([A-ZÁÉÍÓÚÑ(): ]{4,}?)(?: \d)?$')
RE_COURT = re.compile(r'^(CABALLERO|REINA|PRÍNCIPE|PRINCESA) DE (BASTOS|COPAS|ESPADAS|OROS|DISCOS)$')
RE_MINOR = re.compile(r'(AS|DOS|TRES|CUATRO|CINCO|SEIS|SIETE|OCHO|NUEVE|DIEZ) DE (BASTOS|COPAS|ESPADAS|OROS|DISCOS)')
RE_GROUP = re.compile(r'^LOS CUATRO (ACES|DOS|TRES|CUATROS|CINCOS|SEISES|SIETES|OCHOS|NUEVES|DIECES)$')
RE_TOC = re.compile(r'^(.+?)\s*\.{5,}\s*(\d+)$')
# Headings that close whatever card was open: the book moves on to another part.
RE_TERMINATOR = re.compile(r'^(PARTE |APÉNDICE|INVOCACIÓN|LOS ATU: MNEMOT|LOS CUATRO |EL COMPORTAMIENTO)')
DIVINATION_HEADING = 'CARACTERÍSTICAS GENERALES DE LOS TRIUNFOS'
LAST_HEADING = 'APÉNDICE B'  # correspondence tables: layout noise once flattened to text, left out
SMALL_WORDS = {'de', 'del', 'la', 'las', 'los', 'el', 'y', 'o', 'a', 'en'}

FULL_LINE = 100   # a prose line in this PDF runs ~110-120 chars; shorter means the paragraph ended
SHORT_LINE = 70   # verse, attributions, sub-headings
CHUNK_WORDS = 230
CHUNK_MIN_WORDS = 80
PARAGRAPH_MAX_WORDS = 320
MIN_WORDS = 8


def run(*cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def key(text):
    """Accent-, case- and punctuation-insensitive form, to match a heading against the table of contents."""
    text = unicodedata.normalize('NFD', text.upper())
    return re.sub(r'[^A-Z0-9]', '', ''.join(c for c in text if unicodedata.category(c) != 'Mn'))


def nice(heading):
    """'VI. LOS AMANTES (O: LOS HERMANOS)' style caps -> 'Los Amantes (o: Los Hermanos)'."""
    words, out = heading.lower().split(), []
    for i, word in enumerate(words):
        starts_phrase = i == 0 or words[i - 1][-1] in ':.'
        if word == '(o:' or (word in SMALL_WORDS and not starts_phrase):
            out.append(word)
        else:
            out.append(re.sub(r'\w', lambda m: m.group().upper(), word, count=1))
    return ' '.join(out)


def read_pages(pdf):
    """Page texts (index 0 = page 1), cleaned of bidi marks, page numbers and wrapped headings."""
    pages = []
    for number, raw in enumerate(run('pdftotext', str(pdf), '-').split('\f'), 1):
        raw = re.sub('[‎‏‪-‮]', '', raw)
        lines = [line.strip() for line in raw.split('\n')]
        while lines and (not lines[-1] or lines[-1] == str(number)):
            lines.pop()
        merged = []
        for line in lines:
            # "LA RAÍZ DE LOS PODERES DEL FUEGO: AS DE" + "BASTOS" is one heading split by the page width
            if merged and merged[-1].endswith(' DE') and merged[-1] == merged[-1].upper() and line:
                merged[-1] += ' ' + line
            else:
                merged.append(line)
        pages.append(merged)
    return pages


def read_toc(pages):
    """{page: {heading key: heading}} from the book's own table of contents."""
    toc, first_body_page = {}, None
    for lines in pages[:14]:
        for line in lines:
            match = RE_TOC.match(line)
            if not match:
                continue
            heading, page = match.group(1).strip(), int(match.group(2))
            if heading == 'CONTENIDO' or len(key(heading)) < 4:
                continue
            first_body_page = first_body_page or page
            toc.setdefault(page, {})[key(heading)] = heading
    return toc, first_body_page


def card_from_heading(line):
    match = RE_ATU.match(line)
    if match and match.group(1) in ROMAN:
        n = ROMAN.index(match.group(1))
        return {'id': f'atu-{n:02d}', 'kind': 'atu', 'number': n, 'numeral': ROMAN[n], 'suit': None,
                'name': nice(match.group(2)), 'title': None, 'nameEn': ATU_EN[n]}
    match = RE_COURT.match(line)
    if match:
        rank, rank_en = RANKS[match.group(1)]
        suit, suit_es, suit_en = SUITS[match.group(2)]
        return {'id': f'{rank}-{suit}', 'kind': 'court', 'number': None, 'numeral': None, 'suit': suit,
                'name': f'{nice(match.group(1))} de {suit_es}', 'title': None, 'nameEn': f'{rank_en} of {suit_en}'}
    match = RE_MINOR.search(line)
    if match and line == line.upper() and ':' in line:
        n = NUMBERS[match.group(1)]
        suit, suit_es, suit_en = SUITS[match.group(2)]
        # the title sits on either side of the colon: "DOMINIO: DOS DE BASTOS" / "SEIS DE OROS: ÉXITO"
        title = (line[:match.start()] + line[match.end():]).strip(' :.')
        name_en = f'Ace of {suit_en}' if n == 1 else f'{n} of {suit_en}'
        return {'id': f'{suit}-{n:02d}', 'kind': 'minor', 'number': n, 'numeral': None, 'suit': suit,
                'name': f'{nice(match.group(1))} de {suit_es}', 'title': nice(title),
                'nameEn': name_en, 'titleEn': None if n == 1 else MINOR_EN[suit][n - 2]}
    return None


def paragraphs_of(lines):
    """Re-flow hard-wrapped (page, line) pairs into (page, paragraph). Short lines (verse) stand alone."""
    paragraphs, current, start = [], [], None
    for page, line in lines + [(None, '')]:
        if line:
            start = start if current else page
            current.append(line)
        ends = not line or len(line) < SHORT_LINE or (len(line) < FULL_LINE and line[-1] in '.!?:”"»)]')
        if ends and current:
            paragraphs.append((start, ' '.join(current)))
            current = []
    return paragraphs


def split_long(paragraph):
    words = paragraph.split()
    if len(words) <= PARAGRAPH_MAX_WORDS:
        return [paragraph]
    pieces, current = [], []
    for sentence in re.split(r'(?<=[.!?])\s+', paragraph):
        if current and len(' '.join(current + [sentence]).split()) > CHUNK_WORDS:
            pieces.append(' '.join(current))
            current = []
        current.append(sentence)
    return pieces + [' '.join(current)]


def pack(paragraphs):
    """Paragraph-aligned (page, text) chunks of about CHUNK_WORDS words; page is where the chunk starts."""
    chunks, current, count = [], [], 0
    for page, paragraph in ((page, piece) for page, p in paragraphs for piece in split_long(p)):
        words = len(paragraph.split())
        if current and count + words > CHUNK_WORDS and count >= CHUNK_MIN_WORDS:
            chunks.append(current)
            current, count = [], 0
        current.append((page, paragraph))
        count += words
    if current and chunks and count < CHUNK_MIN_WORDS:
        chunks[-1] += current  # a short tail joins the previous chunk instead of standing alone
    elif current:
        chunks.append(current)
    return [(chunk[0][0], '\n'.join(text for _, text in chunk)) for chunk in chunks]


def excerpt_of(text, limit=320):
    """Opening sentences of a card's section, for the card caption."""
    out = ''
    for sentence in re.split(r'(?<=[.!?])\s+', text.replace('\n', ' ')):
        if out and len(out) + len(sentence) > limit:
            break
        out = f'{out} {sentence}'.strip()
    return out


def segment(pages):
    """Walk the book once, splitting it at card headings and table-of-contents headings."""
    toc, first_body_page = read_toc(pages)
    if first_body_page is None:
        sys.exit('No table of contents found in the first pages: is this the right PDF?')
    cards, blocks = {}, []
    state = {'card': None, 'related': None, 'number': None, 'section': None, 'lead': False}
    divination = False

    def open_block():
        blocks.append({'card': state['card'], 'related': state['related'], 'number': state['number'],
                       'section': state['section'], 'lines': []})
        return blocks[-1]

    block = open_block()

    for page, lines in enumerate(pages, 1):
        if page < first_body_page:
            continue
        headings = toc.get(page, {})
        for line in lines:
            if line == LAST_HEADING:
                return cards, blocks
            if divination and line in ROMAN:
                card = cards[f'atu-{ROMAN.index(line):02d}']
                state.update(card=card['id'], section=f"{card['name']} › Significado adivinatorio")
                block = open_block()
                continue
            card = None if divination else card_from_heading(line)
            if card and card['id'] not in cards:
                card.update(pages=[page, page], attribution=[])
                cards[card['id']] = card
                state.update(card=card['id'], related=None, number=None, section=card['name'], lead=True)
                block = open_block()
                continue
            if line.startswith(DIVINATION_HEADING):
                divination = True
                state.update(card=None, related=None, number=None, section='Los Triunfos en la práctica')
                block = open_block()
                continue
            if line and key(line) in headings:
                title = nice(headings[key(line)])
                if RE_TERMINATOR.match(line):
                    group = RE_GROUP.match(line)
                    state.update(card=None, related=None, section=title,
                                 number=GROUP_NUMBER[group.group(1)] if group else None)
                elif state['card']:
                    state['section'] = f"{cards[state['card']]['name']} › {title}"
                else:
                    # the essays appended to Part Two are filed under the Atu they comment on
                    if line in ('EL LOCO', 'EL MAGUS'):
                        state['related'] = 'atu-00' if line == 'EL LOCO' else 'atu-01'
                    state['section'] = f'Apéndice › {title}' if state['related'] else title
                block = open_block()
                continue
            if state['card'] and not divination:
                cards[state['card']]['pages'][1] = page
            # the short lines right under a card heading are its attribution (letter, planet, dates)
            if state['lead'] and line and len(line) < SHORT_LINE:
                cards[state['card']]['attribution'].append(line)
                continue
            if line:
                state['lead'] = False
            if line.isdigit() and len(line) < 3:
                continue  # footnote markers
            block['lines'].append((page, line))
    return cards, blocks


def extract_images(pdf, cards, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        run('pdfimages', '-j', '-p', str(pdf), f'{tmp}/img')
        for card in cards.values():
            found = sorted(Path(tmp).glob(f"img-{card['pages'][0]:03d}-*.jpg"))
            if len(found) != 1:
                sys.exit(f"{card['id']}: expected 1 card image on page {card['pages'][0]}, found {len(found)}")
            shutil.copyfile(found[0], out_dir / f"{card['id']}.jpg")
            card['image'] = f"cards/{card['id']}.jpg"
            # a high-definition redrawing made afterwards by hd_gemini.mjs, when one was accepted
            if (out_dir.parent / 'cards-hd' / f"{card['id']}.jpg").exists():
                card['imageHd'] = f"cards-hd/{card['id']}.jpg"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent.parent / 'three' / 'thoth')
    args = parser.parse_args()

    pages = read_pages(args.pdf)
    cards, blocks = segment(pages)

    chunks = []
    for block in blocks:
        for page, text in pack(paragraphs_of(block['lines'])):
            if len(text.split()) < MIN_WORDS:
                continue  # a heading with nothing under it
            chunks.append({'id': len(chunks), 'card': block['card'], 'related': block['related'],
                           'number': block['number'], 'section': block['section'], 'page': page, 'text': text})

    for card in cards.values():
        own = [c for c in chunks if c['card'] == card['id'] and 'adivinatorio' not in c['section']]
        card['attribution'] = ' · '.join(card['attribution'])
        card['excerpt'] = excerpt_of(own[0]['text']) if own else ''
        card['chunks'] = len(own)

    kinds = {kind: sum(c['kind'] == kind for c in cards.values()) for kind in ('atu', 'court', 'minor')}
    problems = [f"{c['id']}: no text" for c in cards.values() if not c['chunks']]
    if kinds != {'atu': 22, 'court': 16, 'minor': 40}:
        problems.append(f'expected 22 atu / 16 court / 40 minor, found {kinds}')
    starts = [c['pages'][0] for c in cards.values()]
    if starts != sorted(starts):
        problems.append('card sections are not in page order')
    if sum(c['card'] is not None and 'adivinatorio' in c['section'] for c in chunks) < 22:
        problems.append('missing divinatory meanings for some Atu')
    if problems:
        sys.exit('The book did not segment as expected:\n  ' + '\n  '.join(problems))

    extract_images(args.pdf, cards, args.out / 'cards')

    info = run('pdfinfo', str(args.pdf))
    source = {'title': 'El Libro de Thoth', 'author': 'Aleister Crowley',
              'translation': 'Dion Conde, 2008', 'pages': int(re.search(r'Pages:\s+(\d+)', info).group(1))}
    deck = {'source': source, 'cards': list(cards.values())}
    (args.out / 'deck.json').write_text(json.dumps(deck, ensure_ascii=False, indent=1), encoding='utf-8')
    (args.out / 'chunks.json').write_text(json.dumps({'source': source, 'chunks': chunks}, ensure_ascii=False),
                                          encoding='utf-8')

    words = sum(len(c['text'].split()) for c in chunks)
    print(f"{len(cards)} cards {kinds}, {len(chunks)} chunks, {words} words -> {args.out}")
    print(f"  per-card chunks: {sum(c['card'] is not None for c in chunks)}, "
          f"theory chunks: {sum(c['card'] is None for c in chunks)}")


if __name__ == '__main__':
    main()
