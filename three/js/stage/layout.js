// Where things sit: pure geometry, no three.js, so it can be proven in node.

const ROW_MARGIN = 0.3;                   // air left at the sides of the spread
const READING_GAP = 1.3;                  // centre-to-centre, in card widths
const READING_ROW = 2 * READING_GAP + 1;  // width of the three-card band, in card widths

// The camera backs off until the spread fits between the spread screen's own
// controls; every other placement is derived from the view it ends up with.
export function computeView(width, height, layout) {
  const cardH = layout.card_height;
  const cardW = (cardH * layout.card_px[0]) / layout.card_px[1];
  const tan = Math.tan((layout.fov * Math.PI) / 360);
  const aspect = width / height;
  const free = Math.max(0.3, (height - layout.spread_top_px - layout.spread_bottom_px) / height);
  // On a narrow screen the row, not the height, decides the distance: pack the
  // cards closer there so they come out bigger.
  const byHeight = (cardH * 1.12) / (2 * tan * free);
  const roomy = (2 * byHeight * tan * aspect - cardW - ROW_MARGIN) / 2;
  const spacing = Math.min(layout.spacing, Math.max(cardW + layout.min_gap, roomy));
  const distance = Math.max(byHeight, (2 * spacing + cardW + ROW_MARGIN) / (2 * tan * aspect));

  const h = 2 * distance * tan;
  const perPx = h / height;
  // as tall as the rules ask, unless three of them side by side would not fit a narrow screen
  const readScale = Math.min((layout.reading_card_fraction * h) / cardH, (0.92 * h * aspect) / (READING_ROW * cardW));
  return {
    distance, aspect, h, w: h * aspect, perPx, cardW, cardH, spacing,
    spreadY: (perPx * (layout.spread_bottom_px - layout.spread_top_px)) / 2,
    introScale: Math.min(layout.intro_max_scale, (layout.intro_card_fraction * h) / cardH),
    introY: h * layout.intro_lift_fraction,
    readScale,
    readY: h / 2 - perPx * layout.reading_top_px - (readScale * cardH) / 2,
  };
}

// Where card i rests on each screen; the render loop eases towards it.
export function restFor(screen, i, view, layout, { time = 0, shuffling = false } = {}) {
  switch (screen) {
    case 'intro': return {
      x: shuffling ? Math.sin(time * 19 + i * 2.1) * 0.55 : 0,
      y: view.introY + i * 0.015, z: i * 0.05, scale: view.introScale, roll: (i - 1) * 0.07,
    };
    case 'reading': return {
      x: (i - 1) * view.cardW * READING_GAP * view.readScale, y: view.readY, z: 0, scale: view.readScale, roll: (1 - i) * 0.04,
    };
    case 'book': return { x: (i - 1) * 0.4, y: view.h * 0.85, z: 0, scale: 0.6, roll: 0 };
    default: return { x: (i - 1) * view.spacing, y: view.spreadY, z: 0, scale: 1, roll: 0 };
  }
}
