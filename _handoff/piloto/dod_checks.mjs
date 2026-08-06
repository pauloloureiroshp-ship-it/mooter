// dod_checks.mjs — os 12 itens DoD do T1 (Moo Ranch, §5 da v1.0) como checks executáveis.
// Cada check: { id, desc, humano?, fn: async (page, ctx) => boolean }
//   ctx = { artefacto: caminho absoluto do index.html, outDir }
// Item 8 é humano: true (o harness reporta "n/d (humano)" — nunca finge).
// Checks 2-7 são HEURÍSTICAS de pixel-diff/luminância (declarado no desc): screenshots
// comparados num canvas 2D dentro da página (data: URLs não mancham o canvas — zero deps).
// Um humano pode sobrepor qualquer N heurístico jogando o artefacto (§4.1 do protocolo).

import { readdirSync } from "node:fs";
import { dirname, basename } from "node:path";

const estado = {}; // partilhado entre checks (ordem 1→12 garantida pelo harness)

async function shot(page) { return (await page.screenshot()).toString("base64"); }

// compara dois screenshots reduzidos a 320×200 dentro da página; devolve
// {ratioFortes, lumA, lumB} — ratioFortes = fração de píxeis com delta forte (>60/255)
// na região [x0..x1]×[y0..y1] (frações do frame; default = frame inteiro)
async function stats(page, a, b, region = {}) {
  const { x0 = 0, x1 = 1, y0 = 0, y1 = 1 } = region;
  return page.evaluate(async ([a, b, x0, x1, y0, y1]) => {
    const load = (s) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = 320, h = 200;
    const px = (im) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };
    const da = px(ia), db = px(ib);
    let fortes = 0, somaA = 0, somaB = 0, n = 0;
    for (let y = Math.floor(y0 * h); y < Math.floor(y1 * h); y++) for (let x = Math.floor(x0 * w); x < Math.floor(x1 * w); x++) {
      const i = 4 * (y * w + x);
      const la = 0.299 * da[i] + 0.587 * da[i + 1] + 0.114 * da[i + 2];
      const lb = 0.299 * db[i] + 0.587 * db[i + 1] + 0.114 * db[i + 2];
      somaA += la; somaB += lb; n++;
      if (Math.abs(da[i] - db[i]) > 60 || Math.abs(da[i + 1] - db[i + 1]) > 60 || Math.abs(da[i + 2] - db[i + 2]) > 60) fortes++;
    }
    return { ratioFortes: fortes / n, lumA: somaA / n, lumB: somaB / n };
  }, [a, b, x0, x1, y0, y1]);
}

export const CHECKS = [
  {
    id: 1, desc: "Abre sem erros de consola",
    fn: async (page) => {
      const erros = [];
      const onC = (m) => { if (m.type() === "error") erros.push(m.text()); };
      const onP = (e) => erros.push(String(e));
      page.on("console", onC); page.on("pageerror", onP);
      await page.reload({ waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(3000); // three.js + boot da cena
      page.off("console", onC); page.off("pageerror", onP);
      estado.errosConsola = erros;
      return erros.length === 0;
    },
  },
  {
    id: 2, desc: "WASD move o personagem no campo 16×16 (heurística pixel-diff: mover tem de exceder 2× a deriva idle)",
    fn: async (page) => {
      const i0 = await shot(page); await page.waitForTimeout(800);
      const idle = await stats(page, i0, await shot(page));
      estado.idleRatio = idle.ratioFortes;
      const tentar = async () => {
        const a = await shot(page);
        await page.keyboard.down("w"); await page.keyboard.down("a");
        await page.waitForTimeout(800);
        await page.keyboard.up("a"); await page.keyboard.up("w");
        return stats(page, a, await shot(page));
      };
      const limiar = () => Math.max(0.01, 2 * estado.idleRatio);
      let mov = await tentar();
      if (mov.ratioFortes <= limiar()) { // jogos com "click para começar"/focus
        await page.mouse.click(640, 400); await page.waitForTimeout(300);
        mov = await tentar();
      }
      return mov.ratioFortes > limiar();
    },
  },
  {
    id: 3, desc: "Clique coloca bloco (heurística pixel-diff na região central vs controlo sem clique)",
    fn: async (page) => {
      const R = { x0: 0.3, x1: 0.7, y0: 0.35, y1: 0.75 };
      const c0 = await shot(page); await page.waitForTimeout(400);
      const ctrl = await stats(page, c0, await shot(page), R);
      const a = await shot(page);
      await page.mouse.click(640, 450); await page.waitForTimeout(400);
      const d = await stats(page, a, await shot(page), R);
      return d.ratioFortes > Math.max(0.0008, 2 * ctrl.ratioFortes);
    },
  },
  {
    id: 4, desc: "Clique remove bloco (heurística: novo clique no mesmo ponto — esquerdo, senão direito — muda a região acima do controlo sem clique)",
    fn: async (page) => {
      const R = { x0: 0.3, x1: 0.7, y0: 0.35, y1: 0.75 };
      const c0 = await shot(page); await page.waitForTimeout(400);
      const ctrl = await stats(page, c0, await shot(page), R); // ruído de animação da cena
      const limiar = Math.max(0.0008, 2 * ctrl.ratioFortes);
      const a = await shot(page);
      await page.mouse.click(640, 450); await page.waitForTimeout(400);
      let d = await stats(page, a, await shot(page), R);
      if (d.ratioFortes <= limiar) {
        const b = await shot(page);
        await page.mouse.click(640, 450, { button: "right" }); await page.waitForTimeout(400);
        d = await stats(page, b, await shot(page), R);
      }
      return d.ratioFortes > limiar;
    },
  },
  {
    id: 5, desc: "3 tipos de bloco seleccionáveis via hotbar 1-2-3 (heurística: teclas 2,3,1 mudam a faixa inferior do ecrã em ≥2 de 3)",
    fn: async (page) => {
      const R = { y0: 0.8, y1: 1 }; // hotbar/HUD vive em baixo; a vaca raramente
      let mudancas = 0;
      for (const k of ["2", "3", "1"]) {
        const a = await shot(page);
        await page.keyboard.press(k); await page.waitForTimeout(300);
        const d = await stats(page, a, await shot(page), R);
        if (d.ratioFortes > 0.0002) mudancas++;
      }
      return mudancas >= 2;
    },
  },
  {
    id: 6, desc: "Ciclo dia/noite visível (luminância média a 30s de distância — meia volta do loop de 60s — difere >8/255)",
    fn: async (page) => {
      const a = await shot(page);
      await page.waitForTimeout(30000);
      const s = await stats(page, a, await shot(page));
      estado.lumDelta = +Math.abs(s.lumA - s.lumB).toFixed(1);
      return Math.abs(s.lumA - s.lumB) > 8;
    },
  },
  {
    id: 7, desc: "A vaca NPC move-se sozinha (heurística: sem input, 2s produzem mudança forte localizada — entre 0,05% e 50% do frame)",
    fn: async (page) => {
      const a = await shot(page);
      await page.waitForTimeout(2000);
      const s = await stats(page, a, await shot(page));
      return s.ratioFortes > 0.0005 && s.ratioFortes < 0.5;
    },
  },
  {
    id: 8, desc: "Condição de vitória dispara quando a vaca está cercada", humano: true,
    fn: async () => { throw new Error("humano: cercar uma vaca errante por raycast-clicks não é automatizável com fiabilidade — marcar jogando (§4.1)"); },
  },
  {
    id: 9, desc: "HUD completo: contagem de blocos + timer + estado de vitória (mecânico-DOM: ≥2 tokens numéricos no texto da página)",
    fn: async (page) => {
      const txt = await page.evaluate(() => document.body.innerText || "");
      const numeros = [...new Set(txt.match(/\d+/g) || [])];
      if (numeros.length >= 2) return true;
      throw new Error("HUD sem texto DOM detectável — possivelmente desenhada em canvas; rever por humano (§4.1)");
    },
  },
  {
    id: 10, desc: "FPS ≥ 50 medido no browser (mediana rAF sobre 5s)",
    fn: async (page) => {
      const ts = await page.evaluate(() => new Promise((res) => {
        const t = []; const tick = (x) => { t.push(x); if (x - t[0] < 5000) requestAnimationFrame(tick); else res(t); };
        requestAnimationFrame(tick);
      }));
      if (ts.length < 10) return false;
      const deltas = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
      const fps = 1000 / deltas[Math.floor(deltas.length / 2)];
      estado.fpsMediana = +fps.toFixed(1);
      return fps >= 50;
    },
  },
  {
    id: 11, desc: "Um único ficheiro index.html (mecânico: o dir do artefacto contém exactamente 1 ficheiro, chamado index.html)",
    fn: async (_page, ctx) => {
      const dir = dirname(ctx.artefacto);
      const ficheiros = readdirSync(dir).filter((f) => !f.startsWith("."));
      return basename(ctx.artefacto).toLowerCase() === "index.html" && ficheiros.length === 1;
    },
  },
  {
    id: 12, desc: "Zero assets externos além do script three.js do CDN (mecânico: reload com captura de pedidos; só http(s) com 'three' no URL)",
    fn: async (page) => {
      const pedidos = [];
      const onReq = (r) => pedidos.push(r.url());
      page.on("request", onReq);
      await page.reload({ waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(3000);
      page.off("request", onReq);
      const externos = pedidos.filter((u) => /^https?:/i.test(u));
      const proibidos = externos.filter((u) => !/three/i.test(u));
      estado.pedidosExternos = externos; estado.pedidosProibidos = proibidos;
      return proibidos.length === 0;
    },
  },
];
