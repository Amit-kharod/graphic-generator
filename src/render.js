/* Caption overlay renderer (browser + node).
   Style: Open Sans, white text, soft black halo hugging the text. */
const R = (() => {
  const SCALE = 2, DW = 1080, DH = 1920, W = DW * SCALE, H = DH * SCALE;
  const SMALL = 30, MAIN = 36, LEAD = 1.58, MAX_W = 960;
  const DEFAULT_Y = 1150, DEFAULT_HALO = 105;
  const ASC = 2189 / 2048, DESC = 600 / 2048;          // Open Sans hhea metrics
  const FAM = { reg: "OSReg", semi: "OSSemi" };
  const Q = 0.5;                                          // halo works at 1/4 of output res

  let makeCanvas = (w, h) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
  };
  const setCanvasFactory = (fn) => { makeCanvas = fn; };

  const _m = { ctx: null };
  function measure(s, weight, size) {
    if (!_m.ctx) _m.ctx = makeCanvas(8, 8).getContext("2d");
    _m.ctx.font = `${size * SCALE}px ${FAM[weight]}`;
    return _m.ctx.measureText(s).width / SCALE;
  }

  function wrap(s, weight, size) {
    if (measure(s, weight, size) <= MAX_W) return [s];
    const sep = ["  |  ", " · ", " "].find((x) => s.includes(x));
    if (!sep) return [s];
    const out = []; let cur = "";
    for (const p of s.split(sep)) {
      const cand = cur ? cur + sep + p : p;
      if (measure(cand, weight, size) <= MAX_W || !cur) cur = cand;
      else { out.push(cur); cur = p; }
    }
    out.push(cur);
    return out;
  }

  /* lines: [[text, 'main'|'small'], ...]  ->  [{text, weight, size}] after wrapping */
  function layout(lines) {
    const spec = [];
    for (const [s, kind] of lines) {
      if (!s) continue;
      const weight = kind === "main" ? "semi" : "reg";
      const size = kind === "main" ? MAIN : SMALL;
      for (const part of wrap(s, weight, size)) spec.push({ text: part, weight, size });
    }
    return spec;
  }

  function drawLines(ctx, spec, cy, k, shadow) {
    const total = spec.reduce((a, l) => a + l.size * LEAD, 0);
    let y = cy - total / 2;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#fff";
    if (shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.6667)"; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
    }
    for (const l of spec) {
      const px = l.size * k;
      const mid = (y + (l.size * LEAD) / 2) * k;          // Pillow anchor "mm"
      // FreeType rounds ascender up / descender down per pixel size; match it
      const base = mid + Math.round((Math.ceil(ASC * px) - Math.ceil(DESC * px)) / 2);
      ctx.font = `${px}px ${FAM[l.weight]}`;
      ctx.fillText(l.text, (DW / 2) * k, base);
      y += l.size * LEAD;
    }
  }

  /* gaussian ~ 3 box blurs (same approach Pillow uses) */
  function boxes(sigma, n = 3) {
    let wl = Math.floor(Math.sqrt((12 * sigma * sigma) / n + 1)); if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    return Array.from({ length: n }, (_, i) => ((i < m ? wl : wu) - 1) / 2);
  }
  function boxH(src, dst, w, h, r) {
    const iarr = 1 / (r + r + 1);
    for (let y = 0; y < h; y++) {
      const row = y * w; let acc = 0;
      for (let x = -r; x <= r; x++) acc += x >= 0 && x < w ? src[row + x] : 0;
      for (let x = 0; x < w; x++) {
        dst[row + x] = acc * iarr;
        const xo = x - r, xi = x + r + 1;
        if (xo >= 0) acc -= src[row + xo];
        if (xi < w) acc += src[row + xi];
      }
    }
  }
  function boxV(src, dst, w, h, r) {
    const iarr = 1 / (r + r + 1);
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += y >= 0 && y < h ? src[y * w + x] : 0;
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = acc * iarr;
        const yo = y - r, yi = y + r + 1;
        if (yo >= 0) acc -= src[yo * w + x];
        if (yi < h) acc += src[yi * w + x];
      }
    }
  }
  function gauss(a, w, h, sigma) {
    const t = new Float32Array(a.length);
    for (const r of boxes(sigma)) { boxH(a, t, w, h, r); boxV(t, a, w, h, r); }
    return a;
  }

  /* main entry: returns a canvas (2160x3840, or cropped when tight) */
  function render(lines, opt = {}) {
    const cy = opt.y ?? DEFAULT_Y, halo = opt.halo ?? DEFAULT_HALO;
    const spec = layout(lines);

    // 1. halo at quarter resolution
    const qw = DW * Q, qh = DH * Q;
    const qc = makeCanvas(qw, qh), qx = qc.getContext("2d");
    drawLines(qx, spec, cy, Q, false);
    const qd = qx.getImageData(0, 0, qw, qh);
    const a = new Float32Array(qw * qh);
    for (let i = 0; i < a.length; i++) a[i] = qd.data[i * 4 + 3];
    gauss(a, qw, qh, 20 * SCALE / 4);                    // Pillow: blur 40px @ full res
    for (let i = 0; i < a.length; i++) a[i] = Math.round(a[i]) > 12 ? 255 : 0;
    gauss(a, qw, qh, 18 * SCALE / 4);                    // Pillow: blur 36px @ full res
    let x0 = qw, y0 = qh, x1 = 0, y1 = 0;
    for (let i = 0; i < a.length; i++) {
      const v = Math.floor((Math.round(a[i]) * halo) / 255);
      qd.data[i * 4] = qd.data[i * 4 + 1] = qd.data[i * 4 + 2] = 0;
      qd.data[i * 4 + 3] = v;
      if (v > 0) {
        const x = i % qw, y = (i / qw) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    qx.clearRect(0, 0, qw, qh); qx.putImageData(qd, 0, 0);

    // 2. compose at full resolution
    const c = makeCanvas(W, H), x = c.getContext("2d");
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(qc, 0, 0, W, H);
    drawLines(x, spec, cy, SCALE, true);
    qc.width = qc.height = 0;

    const f = W / qw;
    c.bbox = x1 < x0 ? [0, 0, W, H] : [x0 * f, y0 * f, (x1 + 1) * f, (y1 + 1) * f];
    if (!opt.tight || x1 < x0) return c;
    const pad = 8;
    const cx0 = Math.max(0, Math.floor(x0 * f) - pad), cy0 = Math.max(0, Math.floor(y0 * f) - pad);
    const cx1 = Math.min(W, Math.ceil((x1 + 1) * f) + pad), cy1 = Math.min(H, Math.ceil((y1 + 1) * f) + pad);
    const t = makeCanvas(cx1 - cx0, cy1 - cy0);
    t.getContext("2d").drawImage(c, cx0, cy0, cx1 - cx0, cy1 - cy0, 0, 0, cx1 - cx0, cy1 - cy0);
    c.width = c.height = 0;
    return t;
  }

  /* ───── templates (same as gen_overlays.py) ───── */
  const num = (v) => { const m = String(v ?? "").match(/^\s*(~?\s*\d[\d.,]*)/); return m ? m[1].replace(/\s/g, "") : String(v ?? "").trim(); };

  function fmtSets(sets, weight) {
    const out = [];
    for (let p of String(sets).split(/[,|]/)) {
      p = p.trim(); if (!p) continue;
      let m = p.match(/^(\d+)\s*(?:reps?)?\s*[x×*]\s*([\d.]+)\s*(kg|lb|lbs)?$/i);
      if (m) { out.push(`${m[1]} x ${m[2]} ${m[3] || "kg"}`); continue; }
      m = p.match(/^(\d+)\s*(reps?|sec|s|min)?$/i);
      if (m) {
        let unit = (m[2] || "reps").toLowerCase(); unit = { rep: "reps", s: "sec" }[unit] || unit;
        out.push(weight && unit === "reps" ? `${m[1]} x ${num(weight)} kg` : `${m[1]} ${unit}`);
        continue;
      }
      out.push(p);
    }
    return out.join("  |  ");
  }

  const TYPES = {
    intro:    { label: "Intro",    fields: [["ep", "Episode", "3", 1], ["date", "Date", "Sat, 26 Sep", 1], ["title", "Subtitle", "My Journey"]] },
    moment:   { label: "Moment",   fields: [["time", "Time", "5:30 am"], ["text", "Text", "Head to gym", 1]] },
    food:     { label: "Food",     fields: [["time", "Time", "8:30 am"], ["name", "Food name", "Protein Shake + Creatine", 1], ["items", "Ingredients", "50g whey · 5g creatine"], ["kcal", "Calories", "150"], ["protein", "Protein (g)", "40"]] },
    exercise: { label: "Exercise", fields: [["name", "Exercise", "Shoulder Press", 1], ["sets", "Sets", "12x12.5, 9x12.5", 1], ["weight", "Same weight every set (kg)", "7.5"], ["note", "Note", "New PR"]] },
    workout:  { label: "Workout",  fields: [["name", "Session", "Back Day 3", 1], ["duration", "Duration", "1h 13m"], ["volume", "Volume", "2,753 kg"], ["prs", "PRs", "1"]] },
    weight:   { label: "Weight",   fields: [["kg", "Weight (kg)", "72.5", 1], ["label", "Label", "Weight"]] },
    total:    { label: "Day total", fields: [["kcal", "Calories", "2200", 1], ["protein", "Protein (g)", "120", 1], ["target_kcal", "Target kcal", "2500"], ["target_protein", "Target protein", "140"], ["label", "Label", "Day Total"]] },
    text:     { label: "Text",     fields: [] },
  };

  function build(type, f) {
    const v = (k) => (f[k] ?? "").toString().trim();
    const L = [];
    switch (type) {
      case "intro":
        L.push([v("ep") && `Ep ${v("ep")}`, "small"], [v("date"), "main"], [v("title"), "small"]); break;
      case "moment":
        L.push([v("time"), "small"], [v("text"), "main"]); break;
      case "food": {
        L.push([v("time"), "small"], [v("name"), "main"], [v("items"), "small"]);
        const mac = [];
        if (v("kcal")) mac.push(`${num(v("kcal"))} kcal`);
        if (v("protein")) mac.push(`${num(v("protein"))}g Protein`);
        L.push([mac.join("  |  "), "small"]); break;
      }
      case "exercise":
        L.push([v("name"), "main"], [v("sets") && fmtSets(v("sets"), v("weight")), "small"], [v("note"), "small"]); break;
      case "workout": {
        const parts = [v("duration"), v("volume")].filter(Boolean);
        if (v("prs")) { const p = num(v("prs")); parts.push(`${p} PR${p === "1" ? "" : "s"}`); }
        L.push([v("name"), "main"], [parts.join("  |  "), "small"]); break;
      }
      case "weight":
        if (v("kg")) L.push([`${v("label") || "Weight"} - ${num(v("kg"))} kg`, "main"]); break;
      case "total":
        L.push([v("label") || "Day Total", "main"]);
        if (v("kcal") || v("protein")) L.push([`${num(v("kcal"))} kcal  |  ${num(v("protein"))}g Protein`, "small"]);
        if (v("target_kcal") && v("target_protein"))
          L.push([`target ${num(v("target_kcal"))} kcal  |  ${num(v("target_protein"))}g`, "small"]);
        break;
      case "text":
        for (const [k, val] of f._items || []) if ((k === "main" || k === "small") && val) L.push([val, k]);
        break;
    }
    return L.filter(([s]) => s);
  }

  function missing(type, f) {
    return TYPES[type].fields.filter(([k, , , req]) => req && !(f[k] ?? "").toString().trim()).map(([, lab]) => lab);
  }

  /* paste-blocks format:  [type] then key: value lines */
  function parse(text) {
    const blocks = []; let cur = null; let settings = {};
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim(); if (!line || line.startsWith("#")) return;
      const m = line.match(/^\[\s*([A-Za-z_]+)\s*\]$/);
      if (m) {
        const t = m[1].toLowerCase();
        cur = { type: t, f: { _items: [] }, line: i + 1 };
        if (t === "settings") settings = cur.f; else blocks.push(cur);
        return;
      }
      const ix = line.indexOf(":");
      if (!cur || ix < 0) throw new Error(`Line ${i + 1}: can't read "${line}". Each block starts with [type], then key: value lines.`);
      const k = line.slice(0, ix).trim().toLowerCase(), val = line.slice(ix + 1).trim();
      cur.f[k] = val; cur.f._items.push([k, val]);
    });
    for (const b of blocks) {
      if (!TYPES[b.type]) throw new Error(`Unknown block [${b.type}] (line ${b.line}). Use: ${Object.keys(TYPES).join(", ")}`);
      const miss = missing(b.type, b.f);
      if (miss.length) throw new Error(`[${b.type}] block (line ${b.line}) is missing: ${miss.join(", ")}`);
      if (b.type === "text" && !build("text", b.f).length) throw new Error(`[text] block (line ${b.line}) needs main: or small: lines`);
      b.y = b.f.y ? +b.f.y : settings.y ? +settings.y : undefined;
      b.halo = b.f.halo ? +b.f.halo : settings.halo ? +settings.halo : undefined;
    }
    return blocks;
  }

  const slug = (s) => (s || "x").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "x";

  return { render, build, parse, missing, fmtSets, slug, TYPES, setCanvasFactory,
           DW, DH, W, H, DEFAULT_Y, DEFAULT_HALO };
})();
if (typeof module !== "undefined") module.exports = R;
