'use strict';
// lp-toolbar-geom.js — COH-02 (coherence audit): the in-canvas prompt toolbar must NEVER cover the
// pinned node it edits. The 2026-07-11 audit proved two holes in positionCanvasToolbar: (1) a MANUAL
// (dragged) position returned after a bare clamp without repeating the overlap test, and (2) the
// last-resort fallback clamped the full toolbar BELOW the pin without checking overlap — so on a
// cramped viewport it landed right on top of the node. This module is the PURE placement decision,
// unit-tested with real rectangle geometry (not string presence), and serialised into the webview via
// chooseToolbarPlacement.toString() (same fn.toString() trick as renderStageStatus). No DOM, no throw.
//
// chooseToolbarPlacement(o) — o = { pin:{x,y,w,h}, tb:{w,h}, wrap:{w,h}, chip?:{w,h}, manual?:{x,y} }.
// Returns one of:
//   { mode:'place',    x, y } — the full toolbar fits at (x,y) WITHOUT covering the pin.
//   { mode:'minimize', x, y } — the toolbar cannot clear the pin, but the small chip can at (x,y).
//   { mode:'dock' }           — not even the chip can clear the pin → dock at the top of the right rail.
// INVARIANT (the whole point): the returned rectangle NEVER overlaps the pin. Guaranteed for every case.
function chooseToolbarPlacement(o) {
  o = o || {};
  var pin = o.pin, tb = o.tb, wrap = o.wrap, manual = o.manual || null;
  function overlap(a, b) { return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y); }
  if (!pin || !tb || !wrap) return { mode: 'place', x: 6, y: 6 };
  var tw = tb.w || 0, th = tb.h || 0, W = wrap.w || 0, H = wrap.h || 0;
  function clampX(x, w) { return Math.max(6, Math.min(x, W - w - 6)); }
  function clampY(y, h) { return Math.max(6, Math.min(y, H - h - 6)); }
  function fits(c, w, h) { return !(c.x < 6 || c.y < 6 || c.x + w > W - 6 || c.y + h > H - 6); }

  // (1) MANUAL (dragged) position — honour ONLY if it fits the frame AND does not cover the pin. This
  // is the COH-02 fix: a drag that would hide the node falls through to auto-anchoring, never wins.
  if (manual && typeof manual.x === 'number' && typeof manual.y === 'number') {
    var mc = { x: clampX(manual.x, tw), y: clampY(manual.y, th), w: tw, h: th };
    if (fits(mc, tw, th) && !overlap(mc, pin)) return { mode: 'place', x: mc.x, y: mc.y };
    // else fall through — a manual position is a convenience, never a licence to cover the pin.
  }

  // (2) AUTO-ANCHOR — above → below → right → left; first that fits AND clears the pin.
  var full = [
    { x: clampX(pin.x, tw), y: pin.y - th - 8 },        // above
    { x: clampX(pin.x, tw), y: pin.y + pin.h + 8 },     // below
    { x: pin.x + pin.w + 8, y: clampY(pin.y, th) },     // right
    { x: pin.x - tw - 8,    y: clampY(pin.y, th) },     // left
  ];
  for (var i = 0; i < full.length; i++) {
    var c = { x: full[i].x, y: full[i].y, w: tw, h: th };
    if (!fits(c, tw, th)) continue;
    if (overlap(c, pin)) continue;
    return { mode: 'place', x: c.x, y: c.y };
  }

  // (3) No full placement clears the pin → auto-MINIMIZE to the small chip near the pin (COH-02: never
  // fall back ON TOP of the node). Same four anchors, chip-sized.
  var cw = (o.chip && o.chip.w) || 34, chh = (o.chip && o.chip.h) || 28;
  var chipC = [
    { x: clampX(pin.x, cw), y: pin.y - chh - 6 },
    { x: clampX(pin.x, cw), y: pin.y + pin.h + 6 },
    { x: pin.x + pin.w + 6, y: clampY(pin.y, chh) },
    { x: pin.x - cw - 6,    y: clampY(pin.y, chh) },
  ];
  for (var j = 0; j < chipC.length; j++) {
    var cc = { x: chipC[j].x, y: chipC[j].y, w: cw, h: chh };
    if (!fits(cc, cw, chh)) continue;
    if (overlap(cc, pin)) continue;
    return { mode: 'minimize', x: cc.x, y: cc.y };
  }

  // (4) Even the chip cannot clear the pin (extreme small viewport) → DOCK at the top of the right rail.
  return { mode: 'dock' };
}

module.exports = { chooseToolbarPlacement: chooseToolbarPlacement };
