'use strict';
// lp-toolbar-geom.test.js — COH-02: the in-canvas toolbar must NEVER cover the pinned node. This is a
// REAL geometric test (concrete rectangles at the audit's widths 320/390/768/820/1024), not a
// string-presence check. It exercises the pure decision `chooseToolbarPlacement` directly and asserts
// the resulting rectangle — whatever mode is chosen (place / minimize / dock) — never overlaps the pin.
const { test } = require('node:test');
const assert = require('node:assert');
const { chooseToolbarPlacement } = require('./lp-toolbar-geom.js');

const TB = { w: 300, h: 180 };   // a realistic full-toolbar size
const CHIP = { w: 34, h: 28 };

function overlap(a, b) { return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y); }
// The rectangle the webview would actually paint for each mode (mirrors positionCanvasToolbar's apply).
function resultRect(pl, wrap) {
  if (pl.mode === 'place') return { x: pl.x, y: pl.y, w: TB.w, h: TB.h };
  if (pl.mode === 'minimize') return { x: pl.x, y: pl.y, w: CHIP.w, h: CHIP.h };
  // dock: the chip parks at the top of the right edge (Math.max(6, wrap.w-cw-6), 6)
  return { x: Math.max(6, wrap.w - CHIP.w - 6), y: 6, w: CHIP.w, h: CHIP.h };
}

const WIDTHS = [320, 390, 768, 820, 1024];
const HEIGHT = 780;

for (const W of WIDTHS) {
  const wrap = { w: W, h: HEIGHT };
  // Pins across the frame: near each edge, dead-centre, and a large hero block.
  const pins = [
    { x: 10, y: 10, w: 120, h: 40 },                         // top-left
    { x: W - 130, y: 10, w: 120, h: 40 },                    // top-right
    { x: 10, y: HEIGHT - 60, w: 120, h: 40 },                // bottom-left
    { x: Math.max(6, W / 2 - 60), y: HEIGHT / 2 - 20, w: 120, h: 40 }, // centre
    { x: 20, y: 120, w: Math.max(40, W - 40), h: 260 },      // a big hero block (little room anywhere)
  ];
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    test('COH-02: W=' + W + ' pin#' + i + ' — auto placement never covers the pin', () => {
      const pl = chooseToolbarPlacement({ pin, tb: TB, wrap, chip: CHIP });
      const r = resultRect(pl, wrap);
      assert.ok(!overlap(r, pin), 'mode=' + pl.mode + ' rect=' + JSON.stringify(r) + ' overlaps pin ' + JSON.stringify(pin) + ' at W=' + W);
      // and the rect stays inside the frame (except a legitimate dock at the very right edge)
      assert.ok(r.x >= 6 && r.y >= 6 && r.x + r.w <= W - 6 + 1 && r.y + r.h <= HEIGHT - 6 + 1, 'rect within frame at W=' + W);
    });
  }
}

// The COH-02 core: a MANUAL (dragged) position that would cover the pin must be REFUSED — the decision
// falls through to a non-covering auto placement, never honoured.
test('COH-02: a manual drag ON TOP of the pin is refused (falls through to a non-covering placement)', () => {
  const wrap = { w: 1024, h: 780 };
  const pin = { x: 400, y: 300, w: 160, h: 60 };
  const manual = { x: 410, y: 305 }; // dropped directly over the pin
  const pl = chooseToolbarPlacement({ pin, tb: TB, wrap, chip: CHIP, manual });
  const r = resultRect(pl, wrap);
  assert.ok(!overlap(r, pin), 'a pin-covering manual position was refused; chosen ' + pl.mode + ' ' + JSON.stringify(r));
});

test('COH-02: a manual drag that CLEARS the pin is honoured as placed', () => {
  const wrap = { w: 1024, h: 780 };
  const pin = { x: 400, y: 300, w: 160, h: 60 };
  const manual = { x: 40, y: 40 }; // top-left corner, well clear of the pin
  const pl = chooseToolbarPlacement({ pin, tb: TB, wrap, chip: CHIP, manual });
  assert.strictEqual(pl.mode, 'place');
  assert.ok(!overlap({ x: pl.x, y: pl.y, w: TB.w, h: TB.h }, pin));
});

test('COH-02: an extreme cramped viewport where nothing fits → dock (never a place over the pin)', () => {
  // a pin that fills almost the whole tiny frame: no full toolbar and no chip can clear it near the pin.
  const wrap = { w: 200, h: 150 };
  const pin = { x: 8, y: 8, w: 184, h: 134 };
  const pl = chooseToolbarPlacement({ pin, tb: TB, wrap, chip: CHIP });
  const r = resultRect(pl, wrap);
  assert.ok(pl.mode === 'dock' || !overlap(r, pin), 'cramped → dock or a non-covering chip, never a covering toolbar');
});

test('COH-02: the explicit minimized-chip geometry also docks when the cow itself cannot clear the pin', () => {
  const wrap = { w: 200, h: 150 };
  const pin = { x: 8, y: 8, w: 184, h: 134 };
  const pl = chooseToolbarPlacement({ pin, tb: CHIP, wrap, chip: CHIP });
  assert.strictEqual(pl.mode, 'dock', 'runtime must reopen the full prompt in the rail; it may not clamp the cow over the pin');
});
