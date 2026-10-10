// Layout-faithful HTML -> Word (docx) converter.
//
// WHY THIS EXISTS
// The first Word exporter (wordFromBlocks.js's "legacy" path) read each
// block's HTML tags and ignored everything the PDF actually looks like:
// table cells were flattened to text, every box/border/background was
// dropped, inline colours and sizes were lost, flex/grid rows collapsed
// into run-on paragraphs, and the header/footer were hand-drawn
// approximations. The PDF is produced by a real browser laying out that
// same HTML with the shared letterhead CSS, so the browser is the one
// thing that knows what the document is supposed to look like.
//
// HOW IT WORKS
// 1. The block HTML is loaded into a hidden iframe carrying exactly the
//    CSS the PDF path uses (invoiceLetterheadCSS + the document's own
//    extraHeadCSS), at the real A4 content width.
// 2. Fonts are swapped for the Word-safe equivalents (Arial / Georgia)
//    BEFORE measuring, so line breaks and auto-sized table columns match
//    what Word will actually draw, instead of Inter's wider metrics.
// 3. The DOM is walked using getComputedStyle + getBoundingClientRect.
//    Everything is read from the browser's resolved layout, never guessed
//    from tags or class names: so any new block a document starts to emit
//    comes through correctly without a converter change.
//      - <table>, flex/grid rows and display:table rows  -> real Word tables,
//        column widths taken from the measured rectangles
//      - boxes with a background / border / padding        -> shaded, bordered
//        paragraphs or single-cell tables
//      - vertical gaps (margins, already collapsed by the browser) -> exact
//        paragraph spacing, so Word does not double-count them
//      - images -> inline pictures at their rendered size (object-fit crops
//        are baked in so photos are never stretched)
//      - gradient rules -> a real gradient image
//
// The header/footer artwork goes through the same path (they are produced
// from invoiceLetterheadHTML / invoiceFooterHTML), so the Word header and
// footer cannot drift from the PDF's.

import {
  Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  AlignmentType, VerticalAlign, TableLayoutType, LineRuleType,
} from "docx";

const NATURAL_LINE = 1.149;      // Arial's natural line height, in em
const lineTwips = (lineH, fontPx) => (lineH > 0 && fontPx > 0 ? Math.max(120, Math.round(lineH / (fontPx * NATURAL_LINE) * 240)) : 240);
const PX_TWIP = 15;              // 1 CSS px = 0.75pt = 15 twips
const twip = (px) => Math.round(px * PX_TWIP);
const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

// ── fonts ──────────────────────────────────────────────────────────────
export function mapFont(family) {
  const first = String(family || "").split(",")[0].replace(/["']/g, "").trim().toLowerCase();
  if (!first) return "Arial";
  if (/(inter|public sans|arial|helvetica|sans-serif|system-ui|segoe|roboto|calibri)/.test(first)) return "Arial";
  if (/(playfair|lora|georgia|caslon|serif|times|garamond|cambria)/.test(first) && !/sans/.test(first)) return "Georgia";
  if (/(mono|courier|consolas)/.test(first)) return "Courier New";
  return "Arial";
}

// ── colour helpers ─────────────────────────────────────────────────────
function parseColor(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i);
  if (!m) return null;
  let a = 1;
  if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (a < 0.05) return null;
  const hex = (n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16).padStart(2, "0");
  let r = parseFloat(m[1]), g = parseFloat(m[2]), b = parseFloat(m[3]);
  if (a < 1) { // blend onto white; Word has no alpha on shading
    r = r * a + 255 * (1 - a); g = g * a + 255 * (1 - a); b = b * a + 255 * (1 - a);
  }
  return `${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// ── measurement context ────────────────────────────────────────────────
export async function createStyledContext({ css = "", widthPx }) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:absolute;left:-99999px;top:0;visibility:hidden;border:0;width:${Math.ceil(widthPx) + 40}px;height:1200px;`;
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  // The Google-Fonts @import is dropped: it would delay (or fail) the
  // measurement, and the fonts are replaced with Word-safe ones below anyway.
  const safeCss = css.replace(/@import\s+url\([^)]*\)[^;]*;/g, "").replace(/@import\s+["'][^"']*["'][^;]*;/g, "");
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${safeCss}</style></head><body><div id="__root" style="width:${widthPx}px"></div></body></html>`);
  doc.close();
  const win = iframe.contentWindow;
  const root = doc.getElementById("__root");
  const probe = root.getBoundingClientRect().width;
  return {
    doc, win, root, widthPx,
    hasLayout: probe > 0,
    cleanup: () => { try { document.body.removeChild(iframe); } catch (e) { /* already gone */ } },
  };
}

// Replaces each element's font family with its Word-safe equivalent so the
// measured layout is the layout Word will produce.
function applyWordFonts(rootEl, win) {
  const all = [rootEl, ...rootEl.querySelectorAll("*")];
  const mapped = all.map((el) => mapFont(win.getComputedStyle(el).fontFamily));
  all.forEach((el, i) => { el.style.setProperty("font-family", `${mapped[i]}, ${mapped[i] === "Georgia" ? "serif" : "sans-serif"}`, "important"); });
}

async function waitForImages(rootEl, timeoutMs = 4000) {
  const imgs = Array.from(rootEl.querySelectorAll("img"));
  await Promise.all(imgs.map((img) => new Promise((resolve) => {
    if (img.complete) return resolve();
    const t = setTimeout(resolve, timeoutMs);
    img.addEventListener("load", () => { clearTimeout(t); resolve(); }, { once: true });
    img.addEventListener("error", () => { clearTimeout(t); resolve(); }, { once: true });
  })));
}

// ── image helpers ──────────────────────────────────────────────────────
function dataUrlToBytes(dataUrl) {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  let bytes;
  if (m[2]) {
    const bin = atob(m[3]);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(m[3]));
  }
  return { mime, bytes };
}
const mimeToType = (mime) => (/png/.test(mime) ? "png" : /jpe?g/.test(mime) ? "jpg" : /gif/.test(mime) ? "gif" : /bmp/.test(mime) ? "bmp" : null);

function canvasAvailable(win) {
  try {
    const c = win.document.createElement("canvas");
    return !!(c.getContext && c.getContext("2d"));
  } catch (e) { return false; }
}

// Draws the image at the size it is displayed, applying object-fit (cover /
// contain) so a cropped photo stays cropped in Word instead of being squashed.
function rasterizeImage(img, rect, win) {
  try {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh || !canvasAvailable(win)) return null;
    const fit = win.getComputedStyle(img).objectFit || "fill";
    const boxAspect = rect.width / rect.height, natAspect = nw / nh;
    const needsCrop = fit !== "fill" && Math.abs(boxAspect - natAspect) / natAspect > 0.02;
    if (!needsCrop) return null;
    const scale = 2;
    const cw = Math.max(2, Math.round(rect.width * scale)), ch = Math.max(2, Math.round(rect.height * scale));
    const canvas = win.document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    let sx = 0, sy = 0, sw = nw, sh = nh, dx = 0, dy = 0, dw = cw, dh = ch;
    if (fit === "cover" || fit === "scale-down" || fit === "none") {
      if (natAspect > boxAspect) { sw = nh * boxAspect; sx = (nw - sw) / 2; } else { sh = nw / boxAspect; sy = (nh - sh) / 2; }
    } else if (fit === "contain") {
      if (natAspect > boxAspect) { dh = cw / natAspect; dy = (ch - dh) / 2; } else { dw = ch * natAspect; dx = (cw - dw) / 2; }
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
    }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    const url = canvas.toDataURL("image/jpeg", 0.92);
    return dataUrlToBytes(url);
  } catch (e) { return null; } // tainted canvas (cross-origin) etc.
}

async function loadImageBytes(img, rect, win) {
  const cropped = rasterizeImage(img, rect, win);
  if (cropped) return { type: "jpg", bytes: cropped.bytes, width: rect.width, height: rect.height };
  const src = img.currentSrc || img.src || "";
  let info = null;
  if (src.startsWith("data:")) info = dataUrlToBytes(src);
  else if (src) {
    try {
      const res = await win.fetch(src, { mode: "cors" });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        info = { mime: (res.headers.get("content-type") || "").toLowerCase(), bytes: buf };
      }
    } catch (e) { info = null; }
  }
  if (!info) return null;
  let type = mimeToType(info.mime);
  let bytes = info.bytes;
  if (!type && /svg/.test(info.mime) && canvasAvailable(win) && img.naturalWidth) {
    try { // rasterise SVG through a canvas
      const canvas = win.document.createElement("canvas");
      canvas.width = Math.round(rect.width * 2); canvas.height = Math.round(rect.height * 2);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const u = dataUrlToBytes(canvas.toDataURL("image/png"));
      if (u) { type = "png"; bytes = u.bytes; }
    } catch (e) { return null; }
  }
  if (!type) return null;
  // Keep the displayed width; take height from the rendered box too, unless
  // the box was auto-sized from a not-yet-loaded image.
  let { width, height } = rect;
  if ((!height || height < 1) && img.naturalWidth) height = width * img.naturalHeight / img.naturalWidth;
  return { type, bytes, width, height };
}

// A real gradient image for gradient rules (header/footer divider etc.).
function gradientPng(backgroundImage, widthPx, heightPx, win) {
  if (!canvasAvailable(win)) return null;
  const colors = (backgroundImage.match(/rgba?\([^)]*\)/g) || []).map((c) => parseColor(c)).filter(Boolean);
  if (colors.length < 2) return null;
  try {
    const canvas = win.document.createElement("canvas");
    canvas.width = Math.max(64, Math.round(widthPx * 2)); canvas.height = Math.max(2, Math.round(heightPx * 2));
    const ctx = canvas.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, canvas.width, 0);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), `#${c}`));
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    return dataUrlToBytes(canvas.toDataURL("image/png"));
  } catch (e) { return null; }
}

// ── style readers ──────────────────────────────────────────────────────
function boxOf(el, win) {
  const cs = win.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const side = (s) => ({
    w: num(cs[`border${s}Width`]), style: cs[`border${s}Style`], color: parseColor(cs[`border${s}Color`]) || "000000",
    pad: num(cs[`padding${s}`]), mar: num(cs[`margin${s}`]),
  });
  const T = side("Top"), R = side("Right"), B = side("Bottom"), L = side("Left");
  const visible = (b) => b.w > 0.1 && b.style !== "none" && b.style !== "hidden";
  return {
    cs, rect: r, T, R, B, L,
    bg: parseColor(cs.backgroundColor),
    bgImage: cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage : "",
    hasBorder: visible(T) || visible(R) || visible(B) || visible(L),
    vis: { T: visible(T), R: visible(R), B: visible(B), L: visible(L) },
    // content box in page coordinates
    contentLeft: r.left + L.w + L.pad,
    contentRight: r.right - R.w - R.pad,
    contentTop: r.top + T.w + T.pad,
    contentBottom: r.bottom - B.w - B.pad,
  };
}

function wordBorder(b, visible) {
  if (!visible) return NONE_BORDER;
  const dashed = b.style === "dashed" ? BorderStyle.DASHED : b.style === "dotted" ? BorderStyle.DOTTED : b.style === "double" ? BorderStyle.DOUBLE : BorderStyle.SINGLE;
  // docx border size is in eighths of a point; 1px = 0.75pt = 6 eighths.
  return { style: dashed, size: Math.max(2, Math.round(b.w * 6)), color: b.color };
}

function runStyle(cs, el) {
  const fontPx = num(cs.fontSize) || 13;
  const decoration = `${cs.textDecorationLine || ""} ${cs.textDecoration || ""}`;
  const weight = cs.fontWeight === "bold" ? 700 : parseInt(cs.fontWeight, 10) || 400;
  const letter = cs.letterSpacing && cs.letterSpacing !== "normal" ? num(cs.letterSpacing) : 0;
  const color = parseColor(cs.color);
  const props = {
    font: mapFont(cs.fontFamily),
    size: Math.max(2, Math.round(fontPx * 0.75 * 2)),
    bold: weight >= 600,
    italics: cs.fontStyle === "italic" || cs.fontStyle === "oblique",
    color: color || "1A1A1A",
  };
  if (/underline/.test(decoration)) props.underline = {};
  if (/line-through/.test(decoration)) props.strike = true;
  if (letter) props.characterSpacing = Math.round(letter * 15);
  if (cs.verticalAlign === "super") props.superScript = true;
  if (cs.verticalAlign === "sub") props.subScript = true;
  if (cs.textTransform === "uppercase") props.allCaps = true;
  if (cs.textTransform === "lowercase") props.__lower = true;
  if (cs.textTransform === "capitalize") props.__cap = true;
  const bg = el ? parseColor(cs.backgroundColor) : null;
  if (bg && cs.display.startsWith("inline")) props.shading = { type: ShadingType.CLEAR, fill: bg, color: "auto" };
  return props;
}

// ── the converter ──────────────────────────────────────────────────────
class Converter {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.win = ctx.win;
    this.opts = opts;
    this.numbering = { bullets: "ut-bullet", numbers: "ut-number" };
    this.listInstance = 0;
  }

  isHidden(el) {
    const cs = this.win.getComputedStyle(el);
    return cs.display === "none" || cs.visibility === "hidden";
  }

  isInlineLevel(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "br" || tag === "img") return true;
    const d = this.win.getComputedStyle(el).display;
    if (d === "inline" || d === "inline-block") {
      // an inline-block containing block-level structure is handled as a block
      return true;
    }
    return false;
  }

  // ----- inline content -> runs ------------------------------------
  // Produces plain descriptors first so leading / trailing / doubled
  // whitespace can be normalised exactly as a browser would, then turns them
  // into docx runs.
  async describeRuns(nodes, state) {
    const items = [];
    for (const node of nodes) {
      if (node.nodeType === 3) {
        const parent = node.parentElement;
        const cs = this.win.getComputedStyle(parent);
        const preserve = /pre/.test(cs.whiteSpace);
        let text = node.nodeValue || "";
        if (!preserve) text = text.replace(/[ \t\r\n\f]+/g, " ");
        if (!text) continue;
        const style = runStyle(cs, parent);
        if (style.__lower) text = text.toLowerCase();
        if (style.__cap) text = text.replace(/\b\w/g, (c) => c.toUpperCase());
        delete style.__lower; delete style.__cap;
        if (preserve && /\n/.test(text)) {
          text.split(/\r?\n/).forEach((part, i) => {
            if (i > 0) items.push({ kind: "br" });
            if (part) items.push({ kind: "text", text: part, style, preserve: true });
          });
        } else items.push({ kind: "text", text, style, preserve });
        continue;
      }
      if (node.nodeType !== 1) continue;
      const el = node;
      if (this.isHidden(el)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === "br") { items.push({ kind: "br" }); continue; }
      if (tag === "img") {
        const run = await this.imageRun(el);
        if (run) items.push({ kind: "img", run });
        continue;
      }
      const cs = this.win.getComputedStyle(el);
      const b = boxOf(el, this.win);
      const rs = runStyle(cs, el);
      delete rs.__lower; delete rs.__cap;
      const pillPad = (b.bg && cs.display.startsWith("inline")) ? Math.min(4, Math.max(0, Math.round(b.L.pad / 4))) : 0;
      const lead = Math.min(6, Math.round(b.L.mar / 4));
      if (lead > 0) items.push({ kind: "text", text: " ".repeat(lead), style: { size: rs.size, font: rs.font }, preserve: true });
      if (pillPad > 0) items.push({ kind: "text", text: "\u00A0".repeat(pillPad), style: rs, preserve: true });
      items.push(...await this.describeRuns(Array.from(el.childNodes), state));
      if (pillPad > 0) items.push({ kind: "text", text: "\u00A0".repeat(pillPad), style: rs, preserve: true });
      const trail = Math.min(8, Math.round(b.R.mar / 4));
      if (trail > 0 && cs.display === "inline-block") items.push({ kind: "text", text: " ".repeat(trail), style: { size: rs.size, font: rs.font }, preserve: true });
    }
    return items;
  }

  finalizeRuns(items) {
    // collapse doubled spaces across run boundaries (non-preserved text only)
    let prevEndsSpace = true; // start of paragraph behaves like "after a space"
    for (const it of items) {
      if (it.kind === "br") { prevEndsSpace = true; continue; }
      if (it.kind === "img") { prevEndsSpace = false; continue; }
      if (!it.preserve) {
        if (prevEndsSpace) it.text = it.text.replace(/^ +/, "");
        prevEndsSpace = /\s$/.test(it.text) && !/\u00A0$/.test(it.text);
      } else prevEndsSpace = false;
    }
    // trim trailing collapsible space
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === "text" && !it.preserve) { it.text = it.text.replace(/ +$/, ""); if (it.text) break; }
      else break;
    }
    const runs = [];
    for (const it of items) {
      if (it.kind === "br") runs.push(new TextRun({ text: "", break: 1 }));
      else if (it.kind === "img") runs.push(it.run);
      else if (it.text) runs.push(new TextRun({ ...it.style, text: it.text }));
    }
    // a paragraph made only of line breaks is meaningless
    return runs;
  }

  async runsFrom(nodes, state) {
    return this.finalizeRuns(await this.describeRuns(nodes, state));
  }

  async imageRun(img) {
    const rect = img.getBoundingClientRect();
    if (rect.width < 1) return null;
    const data = await loadImageBytes(img, rect, this.win);
    if (!data) return null;
    return new ImageRun({
      type: data.type,
      data: data.bytes,
      transformation: { width: Math.max(1, Math.round(data.width)), height: Math.max(1, Math.round(data.height)) },
    });
  }

  trimRuns(runs) { return runs; }

  // ----- paragraph from a run of inline nodes -----------------------
  async paragraphFrom(nodes, container, st, gapPx = 0) {
    const runs = await this.runsFrom(nodes, st);
    if (!runs.length) return null;
    const cb = boxOf(container, this.win);
    const cs = cb.cs;
    const fontPx = num(cs.fontSize) || 13;
    const lineH = num(cs.lineHeight) || 0;
    const line = lineTwips(lineH, fontPx);
    return this.makeParagraph(runs, {
      align: this.alignOf(cs, container, st), gapPx, line,
      indentLeft: Math.max(0, cb.contentLeft - st.origin),
      indentRight: Math.max(0, (st.origin + st.width) - cb.contentRight),
    });
  }

  alignOf(cs, container, st) {
    const a = cs.textAlign;
    if (a === "center") return AlignmentType.CENTER;
    if (a === "right" || a === "end") return AlignmentType.RIGHT;
    if (a === "justify") return AlignmentType.JUSTIFIED;
    return AlignmentType.LEFT;
  }

  // ----- container children -> docx blocks -------------------------
  // st: { origin: content-left x, width, cursorY: previous bottom y }
  async convertChildren(parent, st) {
    const out = [];
    let buffer = [];
    const flush = async () => {
      if (!buffer.length) return;
      const nodes = buffer; buffer = [];
      const hasContent = nodes.some((n) => (n.nodeType === 3 ? /\S| /.test(n.nodeValue || "") : (n.nodeType === 1 && (n.tagName.toLowerCase() === "img" || n.tagName.toLowerCase() === "br" || (n.textContent || "").trim() !== "" || n.querySelector("img")))));
      if (!hasContent) return;
      // Top of the first line box. A text node's range rectangle is the font's
      // content area, which sits inside the line box when line-height is
      // larger than the glyph height, so add that half-leading back.
      const firstEl = nodes.find((n) => n.nodeType === 1);
      let rect;
      if (firstEl) rect = firstEl.getBoundingClientRect();
      else {
        const rng = this.ctx.doc.createRange(); rng.selectNodeContents(nodes[0]);
        rect = rng.getBoundingClientRect();
      }
      const pcs = this.win.getComputedStyle(parent);
      const lh = num(pcs.lineHeight);
      const leading = lh > rect.height ? (lh - rect.height) / 2 : 0;
      const top = rect.top - leading;
      const gap = Math.max(0, top - st.cursorY);
      const p = await this.paragraphFrom(nodes, parent, st, gap);
      if (p) { out.push(p); this.advance(st, nodes); }
    };
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 3) { buffer.push(child); continue; }
      if (child.nodeType !== 1) continue;
      const el = child;
      if (this.isHidden(el)) continue;
      if (this.isInlineLevel(el) && !this.isBlockishInline(el)) { buffer.push(el); continue; }
      await flush();
      await this.convertBlock(el, st, out);
    }
    await flush();
    return out;
  }

  // inline-block whose children are block-level boxes (e.g. a pill with a
  // flex row) is treated as a block.
  isBlockishInline(el) {
    const cs = this.win.getComputedStyle(el);
    if (cs.display !== "inline-block") return false;
    return Array.from(el.children).some((c) => {
      const d = this.win.getComputedStyle(c).display;
      return d === "block" || d === "flex" || d === "grid" || d === "table" || d === "list-item";
    });
  }

  // Moves the running "previous bottom" marker to the lowest point of what
  // was just emitted, so the next block's gap is measured from there.
  advance(st, nodesOrEl) {
    let bottom = st.cursorY;
    const list = Array.isArray(nodesOrEl) ? nodesOrEl : [nodesOrEl];
    for (const n of list) {
      let r = null;
      if (n.nodeType === 1) r = n.getBoundingClientRect();
      else if (n.nodeType === 3) { const rng = this.ctx.doc.createRange(); rng.selectNodeContents(n); r = rng.getBoundingClientRect(); }
      if (r && r.bottom > bottom) bottom = r.bottom;
    }
    st.cursorY = bottom;
  }

  makeParagraph(children, { align, gapPx, line, shading, borders, indentLeft, indentRight, keepNext, keepLines, numbering, fontPx, exactHeight }) {
    const spacing = { before: twip(gapPx || 0), after: 0 };
    if (exactHeight) { spacing.line = Math.max(20, twip(exactHeight)); spacing.lineRule = LineRuleType.EXACT; }
    else if (line) { spacing.line = line; spacing.lineRule = LineRuleType.AUTO; }
    return new Paragraph({
      children, alignment: align, spacing,
      shading, border: borders, keepNext, keepLines,
      indent: (indentLeft || indentRight) ? { left: Math.max(0, twip(indentLeft || 0)), right: Math.max(0, twip(indentRight || 0)) } : undefined,
      numbering,
    });
  }

  spacer(px) {
    return new Paragraph({ spacing: { before: 0, after: 0, line: Math.max(20, twip(px)), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: "", size: 2 })] });
  }

  async convertBlock(el, st, out) {
    const tag = el.tagName.toLowerCase();
    const b = boxOf(el, this.win);
    const cs = b.cs;
    const gap = Math.max(0, b.rect.top - st.cursorY);
    const keepNext = cs.breakAfter === "avoid" || cs.pageBreakAfter === "avoid" || el.hasAttribute("data-page-heading") || /^h[1-6]$/.test(tag);

    if (tag === "hr") {
      out.push(this.makeParagraph([], { gapPx: gap, borders: { bottom: wordBorder(b.B.w ? b.B : { w: 1, style: "solid", color: "DDDDDD" }, true) }, exactHeight: 2 }));
      st.cursorY = b.rect.bottom; return;
    }
    if (tag === "img") {
      const run = await this.imageRun(el);
      if (run) {
        const leftGap = b.rect.left - st.origin, rightGap = (st.origin + st.width) - b.rect.right;
        const centered = Math.abs(leftGap - rightGap) < 3 && leftGap > 3;
        const right = rightGap < 2 && leftGap > 3;
        out.push(this.makeParagraph([run], { gapPx: gap, align: centered ? AlignmentType.CENTER : right ? AlignmentType.RIGHT : AlignmentType.LEFT, indentLeft: (!centered && !right) ? Math.max(0, leftGap) : 0 }));
      }
      st.cursorY = b.rect.bottom; return;
    }
    if (tag === "table") { await this.convertHtmlTable(el, st, out, gap); return; }
    if (tag === "ul" || tag === "ol") { await this.convertList(el, st, out, gap); return; }

    const display = cs.display;
    const kids = Array.from(el.children).filter((c) => !this.isHidden(c));
    const isLayout = (display === "flex" || display === "inline-flex" || display === "grid" || display === "inline-grid" || display === "table")
      && kids.length > 0 && !this.rowsAreNative(el);
    if (isLayout) { await this.convertLayout(el, b, st, out, gap); return; }

    const hasBlockKids = kids.some((c) => !this.isInlineLevel(c) || this.isBlockishInline(c));
    const textual = (el.textContent || "").trim() !== "" || el.querySelector("img");

    // empty decorated boxes: spacers, rules, gradient bars
    if (!textual) { this.convertEmptyBox(el, b, st, out, gap); return; }

    const decorated = b.bg || b.hasBorder || b.bgImage;
    if (hasBlockKids && decorated) { await this.convertBoxAsCell(el, b, st, out, gap); return; }

    if (hasBlockKids) {
      // plain container: recurse. The gap from the previous block (margins +
      // this container's own padding) is naturally measured by its first
      // child against the carried-over cursor.
      const inner = { origin: st.origin, width: st.width, cursorY: st.cursorY };
      out.push(...await this.convertChildren(el, inner));
      st.cursorY = Math.max(st.cursorY, inner.cursorY);
      return;
    }

    // simple block of inline content -> one paragraph
    const nodes = Array.from(el.childNodes);
    const para = await this.paragraphFor(el, nodes, b, st, gap, keepNext);
    if (para) out.push(para);
    st.cursorY = Math.max(st.cursorY, b.rect.bottom);
  }

  rowsAreNative(el) { return false; }

  async paragraphFor(el, nodes, b, st, gap, keepNext) {
    const runs = this.trimRuns(await this.runsFrom(nodes, st));
    if (!runs.length) return null;
    const cs = b.cs;
    const fontPx = num(cs.fontSize) || 13;
    const lineH = num(cs.lineHeight) || 0;
    const line = lineTwips(lineH, fontPx);
    const borders = {};
    let anyBorder = false;
    for (const [k, key] of [["top", "T"], ["right", "R"], ["bottom", "B"], ["left", "L"]]) {
      if (b.vis[key]) { borders[k] = { ...wordBorder(b[key], true), space: Math.min(31, Math.round(b[key].pad * 0.75)) }; anyBorder = true; }
    }
    const shading = b.bg ? { type: ShadingType.CLEAR, fill: b.bg, color: "auto" } : undefined;
    const left = Math.max(0, b.contentLeft - st.origin);
    const right = Math.max(0, (st.origin + st.width) - b.contentRight);
    const align = this.alignOf(cs, el, st);
    // paragraph-level padding top is represented by the gap + border space
    const padTop = !anyBorder ? 0 : 0;
    return this.makeParagraph(runs, {
      align, gapPx: gap + padTop, line, shading, borders: anyBorder ? borders : undefined,
      indentLeft: left, indentRight: right, keepNext, keepLines: false,
    });
  }

  convertEmptyBox(el, b, st, out, gap) {
    const h = b.rect.height, w = b.rect.width;
    const cs = b.cs;
    if (b.bgImage && /gradient/.test(b.bgImage)) {
      const g = gradientPng(b.bgImage, w, Math.max(1, h), this.win);
      if (g) {
        const run = new ImageRun({ type: "png", data: g.bytes, transformation: { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) } });
        out.push(this.makeParagraph([run], { gapPx: gap, exactHeight: Math.max(2, h + 1), indentLeft: Math.max(0, b.rect.left - st.origin) }));
      } else {
        const c = (b.bgImage.match(/rgba?\([^)]*\)/) || [])[0];
        out.push(this.makeParagraph([], { gapPx: gap, exactHeight: Math.max(2, h), shading: { type: ShadingType.CLEAR, fill: parseColor(c) || "1A3A52", color: "auto" }, indentLeft: Math.max(0, b.rect.left - st.origin) }));
      }
      st.cursorY = b.rect.bottom; return;
    }
    if (b.bg && h >= 1) {
      out.push(this.makeParagraph([], { gapPx: gap, exactHeight: Math.max(2, h), shading: { type: ShadingType.CLEAR, fill: b.bg, color: "auto" }, indentLeft: Math.max(0, b.rect.left - st.origin), indentRight: Math.max(0, (st.origin + st.width) - b.rect.right) }));
      st.cursorY = b.rect.bottom; return;
    }
    if (b.hasBorder) { // signature line etc.
      const borders = {};
      for (const [k, key] of [["top", "T"], ["right", "R"], ["bottom", "B"], ["left", "L"]]) if (b.vis[key]) borders[k] = wordBorder(b[key], true);
      out.push(this.makeParagraph([], { gapPx: gap, exactHeight: Math.max(2, h), borders, indentLeft: Math.max(0, b.rect.left - st.origin), indentRight: Math.max(0, (st.origin + st.width) - b.rect.right) }));
      st.cursorY = b.rect.bottom; return;
    }
    if (h >= 2 || gap + h >= 2) {
      out.push(this.spacer(gap + h));
    }
    st.cursorY = Math.max(st.cursorY, b.rect.bottom);
  }

  // ----- tables ------------------------------------------------------
  cellProps(box, { first, last, widthPx, vAlign, forceBg }) {
    const bgc = box.bg || forceBg;
    return {
      width: { size: twip(widthPx), type: WidthType.DXA },
      shading: bgc ? { type: ShadingType.CLEAR, fill: bgc, color: "auto" } : undefined,
      margins: {
        top: twip(box.T.pad), bottom: twip(box.B.pad),
        left: twip(box.L.pad), right: twip(box.R.pad),
      },
      borders: {
        top: wordBorder(box.T, box.vis.T), bottom: wordBorder(box.B, box.vis.B),
        left: wordBorder(box.L, box.vis.L), right: wordBorder(box.R, box.vis.R),
      },
      verticalAlign: vAlign,
    };
  }

  vAlignOf(cs) {
    const v = cs.verticalAlign;
    if (v === "middle") return VerticalAlign.CENTER;
    if (v === "bottom") return VerticalAlign.BOTTOM;
    return VerticalAlign.TOP;
  }

  async cellContent(el, box, widthPx) {
    const inner = { origin: box.contentLeft, width: Math.max(1, box.contentRight - box.contentLeft), cursorY: box.contentTop };
    let blocks = await this.convertChildren(el, inner);
    // a cell must end with a paragraph
    if (!blocks.length || blocks[blocks.length - 1] instanceof Table) blocks.push(this.spacer(1));
    // Word cells already pad; drop a leading spacer made only of the cell's own top gap
    return blocks;
  }

  async convertHtmlTable(el, st, out, gap) {
    const tb = boxOf(el, this.win);
    const rows = Array.from(el.rows || []);
    if (!rows.length) { st.cursorY = Math.max(st.cursorY, tb.rect.bottom); return; }
    // grid from cell edges
    const xs = new Set([Math.round(tb.rect.left * 10) / 10, Math.round(tb.rect.right * 10) / 10]);
    rows.forEach((tr) => Array.from(tr.cells).forEach((c) => { const r = c.getBoundingClientRect(); xs.add(Math.round(r.left * 10) / 10); xs.add(Math.round(r.right * 10) / 10); }));
    const edges = Array.from(xs).sort((a, z) => a - z).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.6);
    const colW = edges.slice(1).map((x, i) => x - edges[i]);
    // Word sets text a touch wider than the browser measured it; give narrow
    // columns a little room (taken from the widest one) so a word like
    // "Lunch" or a nowrap label never breaks mid-word.
    if (colW.length > 0) {
      const SLACK = 6;
      const spare = (st.origin + st.width) - tb.rect.right;      // room to the right of the table
      if (spare > SLACK * colW.length + 2) {
        // table is narrower than its container (e.g. a label/value pair):
        // every column simply grows a little
        colW.forEach((w, i) => { colW[i] += SLACK; });
      } else if (colW.length > 1) {
        let widest = 0; colW.forEach((w, i) => { if (w > colW[widest]) widest = i; });
        colW.forEach((w, i) => { if (i !== widest && w < 220 && colW[widest] - SLACK > 40) { colW[i] += SLACK; colW[widest] -= SLACK; } });
      }
    }
    const idx = (x) => { let best = 0, bd = 1e9; edges.forEach((e, i) => { const d = Math.abs(e - x); if (d < bd) { bd = d; best = i; } }); return best; };

    const tableRows = [];
    for (const tr of rows) {
      const rb = boxOf(tr, this.win);
      const section = tr.parentElement.tagName.toLowerCase();
      const cells = [];
      const cellEls = Array.from(tr.cells);
      for (const c of cellEls) {
        const cb = boxOf(c, this.win);
        const li = idx(cb.rect.left), ri = idx(cb.rect.right);
        const span = Math.max(1, ri - li);
        const blocks = await this.cellContent(c, cb, cb.rect.width);
        const cellW = colW.slice(li, ri).reduce((a, w) => a + w, 0) || cb.rect.width;
        cells.push(new TableCell({
          ...this.cellProps({ ...cb, bg: cb.bg || rb.bg }, { widthPx: cellW, vAlign: this.vAlignOf(cb.cs) }),
          columnSpan: span > 1 ? span : undefined,
          children: blocks,
        }));
      }
      if (!cells.length) continue;
      tableRows.push(new TableRow({ children: cells, tableHeader: section === "thead", cantSplit: true }));
    }
    if (!tableRows.length) { st.cursorY = Math.max(st.cursorY, tb.rect.bottom); return; }
    if (gap > 0.5) out.push(this.spacer(gap));
    const total = colW.reduce((a, c) => a + c, 0);
    out.push(new Table({
      rows: tableRows,
      width: { size: twip(total), type: WidthType.DXA },
      columnWidths: colW.map(twip),
      layout: TableLayoutType.FIXED,
      indent: { size: twip(Math.max(0, tb.rect.left - st.origin)), type: WidthType.DXA },
      borders: this.noTableBorders(),
    }));
    st.cursorY = tb.rect.bottom;
    // table margin-bottom is already inside the next block's gap
  }

  noTableBorders() {
    return { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER, insideHorizontal: NONE_BORDER, insideVertical: NONE_BORDER };
  }

  // flex / grid / display:table rows -> one Word table per visual row
  async convertLayout(el, b, st, out, gap) {
    const kids = Array.from(el.children).filter((c) => !this.isHidden(c));
    // Flatten display:table-row wrappers
    let items = [];
    kids.forEach((k) => {
      const d = this.win.getComputedStyle(k).display;
      if (d === "table-row" || d === "table-row-group") items.push(...Array.from(k.children).filter((c) => !this.isHidden(c)));
      else items.push(k);
    });
    const infos = items.map((k) => ({ el: k, box: boxOf(k, this.win) })).filter((i) => i.box.rect.width > 0 || i.box.rect.height > 0);
    if (!infos.length) { st.cursorY = Math.max(st.cursorY, b.rect.bottom); return; }
    // group into visual rows
    infos.sort((a, z) => a.box.rect.top - z.box.rect.top || a.box.rect.left - z.box.rect.left);
    const rows = [];
    infos.forEach((i) => {
      const row = rows[rows.length - 1];
      if (row && i.box.rect.top < row.bottom - 1) { row.items.push(i); row.bottom = Math.max(row.bottom, i.box.rect.bottom); }
      else rows.push({ items: [i], top: i.box.rect.top, bottom: i.box.rect.bottom });
    });

    const decorated = b.bg || b.hasBorder;
    const left0 = decorated ? b.rect.left : b.contentLeft;
    const right0 = decorated ? b.rect.right : b.contentRight;
    const vAlign = b.cs.alignItems === "center" ? VerticalAlign.CENTER : (b.cs.alignItems === "flex-end" || b.cs.alignItems === "end") ? VerticalAlign.BOTTOM : VerticalAlign.TOP;

    let first = true;
    let prevTable = false;
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      row.items.sort((a, z) => a.box.rect.left - z.box.rect.left);
      // segments: gaps between/around items + the items themselves
      const segs = [];
      let cursor = left0;
      row.items.forEach((it) => {
        const r = it.box.rect;
        if (r.left - cursor > 1.5) segs.push({ gap: true, w: r.left - cursor });
        segs.push({ gap: false, w: r.width, it });
        cursor = r.right;
      });
      if (right0 - cursor > 1.5) segs.push({ gap: true, w: right0 - cursor });
      // A hairline decorative item (a 1pt vertical rule built from a narrow
      // shaded box) cannot be a Word cell -- Word renders a minimum-width
      // slab. Turn it into a left border on the next cell and fold its width
      // into the gap before it.
      for (let k = segs.length - 1; k >= 0; k--) {
        const sg = segs[k];
        if (sg.gap || sg.w > 4 || !sg.it.box.bg || (sg.it.el.textContent || "").trim()) continue;
        const prev = segs[k - 1];
        const rule = { color: sg.it.box.bg, w: Math.max(sg.w, 1) };
        if (prev && prev.gap) { prev.w += sg.w; prev.ruleRight = rule; segs.splice(k, 1); }
        else segs[k] = { gap: true, w: sg.w, ruleRight: rule };
      }
      // Word lays text out a hair wider than the browser measured it, so a
      // cell sized exactly to its text would wrap ("Sub / Total"). Borrow a
      // little room for each item from the empty gap beside it.
      segs.forEach((sg, k) => {
        if (sg.gap) return;
        const SLACK = 4;
        [segs[k - 1], segs[k + 1]].forEach((nb) => { if (nb && nb.gap && nb.w > SLACK + 1) { nb.w -= SLACK; sg.w += SLACK; } });
      });
      const cols = [], cells = [];
      for (let si = 0; si < segs.length; si++) {
        const sg = segs[si];
        if (sg.gap) {
          cols.push(sg.w);
          cells.push(new TableCell({
            width: { size: twip(sg.w), type: WidthType.DXA },
            shading: decorated && b.bg ? { type: ShadingType.CLEAR, fill: b.bg, color: "auto" } : undefined,
            margins: { top: twip(decorated ? b.T.pad : 0), bottom: twip(decorated ? b.B.pad : 0), left: 0, right: 0 },
            borders: sg.ruleRight ? { ...this.layoutBorders(b, decorated, si === 0, si === segs.length - 1, true), right: { style: BorderStyle.SINGLE, size: Math.max(4, Math.round(sg.ruleRight.w * 6)), color: sg.ruleRight.color } } : this.layoutBorders(b, decorated, si === 0, si === segs.length - 1, true),
            children: [this.spacer(1)],
          }));
          continue;
        }
        const it = sg.it, kb = it.box;
        cols.push(sg.w);
        const blocks = await this.cellContent(it.el, kb, sg.w);
        const cellBox = { ...kb, bg: kb.bg || (decorated ? b.bg : null) };
        const props = this.cellProps(cellBox, { widthPx: sg.w, vAlign: kb.cs.alignSelf === "center" ? VerticalAlign.CENTER : vAlign });
        if (decorated) {
          props.margins = { ...props.margins, top: Math.max(props.margins.top, twip(b.T.pad)), bottom: Math.max(props.margins.bottom, twip(b.B.pad)) };
          props.borders = this.mergeOuterBorders(props.borders, b, si === 0, si === segs.length - 1);
        }
        cells.push(new TableCell({ ...props, children: blocks }));
      }
      const rowGap = ri === 0 ? gap : Math.max(0, row.top - rows[ri - 1].bottom);
      if (rowGap > 0.5 || prevTable) out.push(this.spacer(Math.max(rowGap, prevTable ? 1 : 0)));
      const total = cols.reduce((a, c) => a + c, 0);
      out.push(new Table({
        rows: [new TableRow({ children: cells, cantSplit: true })],
        width: { size: twip(total), type: WidthType.DXA },
        columnWidths: cols.map(twip),
        layout: TableLayoutType.FIXED,
        indent: { size: twip(Math.max(0, left0 - st.origin)), type: WidthType.DXA },
        borders: this.noTableBorders(),
      }));
      prevTable = true;
      first = false;
    }
    st.cursorY = Math.max(st.cursorY, b.rect.bottom);
  }

  layoutBorders(b, decorated, isFirst, isLast, gapCell) {
    if (!decorated || !b.hasBorder) return { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER };
    return {
      top: wordBorder(b.T, b.vis.T), bottom: wordBorder(b.B, b.vis.B),
      left: isFirst ? wordBorder(b.L, b.vis.L) : NONE_BORDER,
      right: isLast ? wordBorder(b.R, b.vis.R) : NONE_BORDER,
    };
  }

  mergeOuterBorders(cellBorders, b, isFirst, isLast) {
    if (!b.hasBorder) return cellBorders;
    return {
      top: b.vis.T ? wordBorder(b.T, true) : cellBorders.top,
      bottom: b.vis.B ? wordBorder(b.B, true) : cellBorders.bottom,
      left: isFirst && b.vis.L ? wordBorder(b.L, true) : cellBorders.left,
      right: isLast && b.vis.R ? wordBorder(b.R, true) : cellBorders.right,
    };
  }

  // a decorated block that holds other blocks -> single-cell table
  async convertBoxAsCell(el, b, st, out, gap) {
    const inner = { origin: b.contentLeft, width: Math.max(1, b.contentRight - b.contentLeft), cursorY: b.contentTop };
    let blocks = await this.convertChildren(el, inner);
    if (!blocks.length || blocks[blocks.length - 1] instanceof Table) blocks.push(this.spacer(1));
    if (gap > 0.5) out.push(this.spacer(gap));
    const w = b.rect.width;
    out.push(new Table({
      rows: [new TableRow({ cantSplit: false, children: [new TableCell({ ...this.cellProps(b, { widthPx: w, vAlign: VerticalAlign.TOP }), children: blocks })] })],
      width: { size: twip(w), type: WidthType.DXA },
      columnWidths: [twip(w)],
      layout: TableLayoutType.FIXED,
      indent: { size: twip(Math.max(0, b.rect.left - st.origin)), type: WidthType.DXA },
      borders: this.noTableBorders(),
    }));
    st.cursorY = b.rect.bottom;
  }

  // ----- lists ------------------------------------------------------
  async convertList(el, st, out, gap) {
    const ordered = el.tagName.toLowerCase() === "ol";
    const instance = ++this.listInstance;
    const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "li" && !this.isHidden(c));
    const lb = boxOf(el, this.win);
    let first = true;
    for (const li of items) {
      const ib = boxOf(li, this.win);
      const nodes = Array.from(li.childNodes);
      const textNodes = nodes.filter((n) => !(n.nodeType === 1 && ["ul", "ol"].includes(n.tagName.toLowerCase())));
      const runs = this.trimRuns(await this.runsFrom(textNodes, st));
      const g = Math.max(0, ib.rect.top - st.cursorY);
      const fontPx = num(ib.cs.fontSize) || 13;
      const lineH = num(ib.cs.lineHeight) || 0;
      const hang = Math.min(24, Math.max(14, fontPx * 1.6));
      const leftIndent = Math.max(hang, ib.contentLeft - st.origin);
      const p = new Paragraph({
        children: runs.length ? runs : [new TextRun({ text: "" })],
        spacing: { before: twip(g), after: 0, line: lineTwips(lineH, fontPx), lineRule: LineRuleType.AUTO },
        numbering: { reference: ordered ? this.numbering.numbers : this.numbering.bullets, level: 0, instance },
        indent: { left: twip(leftIndent), hanging: twip(hang) },
      });
      out.push(p);
      st.cursorY = Math.max(st.cursorY, ib.rect.bottom);
      for (const n of nodes) {
        if (n.nodeType === 1 && ["ul", "ol"].includes(n.tagName.toLowerCase())) await this.convertList(n, st, out, 0);
      }
      first = false;
    }
    st.cursorY = Math.max(st.cursorY, lb.rect.bottom);
  }
}

// numbering definitions every styled document needs
export const STYLED_NUMBERING = {
  config: [
    { reference: "ut-bullet", levels: [{ level: 0, format: "bullet", text: "•", alignment: AlignmentType.LEFT }] },
    { reference: "ut-number", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT }] },
  ],
};

// Converts a list of letterhead blocks into docx children.
//   blocks     the same bodyBlocks array the PDF paginator receives
//   css        invoiceLetterheadCSS + the document's extraHeadCSS
//   widthPx    content width of the page in CSS px
export async function blocksToStyledDocx({ blocks, css, widthPx, trailing = false }) {
  const ctx = await createStyledContext({ css, widthPx });
  try {
    if (!ctx.hasLayout) return null; // no real layout engine (e.g. jsdom) -> caller falls back
    const wrapper = ctx.doc.createElement("div");
    wrapper.className = "print-page-content";
    wrapper.style.cssText = `width:${widthPx}px;display:block;overflow:visible;flex:none;`;
    const html = (blocks || []).filter(Boolean).map((blk) => {
      if (typeof blk === "string") return blk;
      if (blk && blk.type === "table") {
        const cls = blk.className ? ` ${blk.className}` : "";
        return `<table class="content-table${cls}" style="width:100%;border-collapse:collapse"><thead>${blk.headerHTML}</thead><tbody>${(blk.rowsHTML || []).join("")}</tbody></table>`;
      }
      return "";
    }).join("\n");
    wrapper.innerHTML = html;
    ctx.root.appendChild(wrapper);
    applyWordFonts(wrapper, ctx.win);
    await waitForImages(wrapper);
    const conv = new Converter(ctx);
    const rootRect = wrapper.getBoundingClientRect();
    const rootState = { origin: rootRect.left, width: rootRect.width, cursorY: rootRect.top };
    const children = await conv.convertChildren(wrapper, rootState);
    if (trailing) {
      const tail = wrapper.getBoundingClientRect().bottom - rootState.cursorY;
      if (tail > 1) children.push(conv.spacer(tail + 6));
    }
    if (!children.length || children[children.length - 1] instanceof Table) children.push(new Paragraph({ children: [] }));
    return children;
  } finally {
    ctx.cleanup();
  }
}

// Converts a self-contained HTML fragment (the letterhead header / footer)
// for use inside a docx Header / Footer.
export async function htmlToStyledDocx({ html, css, widthPx, trailing = false }) {
  const out = await blocksToStyledDocx({ blocks: [html], css, widthPx, trailing });
  return out;
}
