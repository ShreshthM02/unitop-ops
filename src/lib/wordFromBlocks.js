// Generic Word (.docx) export driven by the SAME bodyBlocks a document
// already builds for the PDF paginator.
//
// Every letterhead document composes its content as an array of blocks --
// HTML strings plus {type:'table', headerHTML, rowsHTML} objects -- and
// hands them to buildPaginatedLetterheadDocument. Rather than hand-write a
// separate Word body builder per document (five more places to update every
// time a section changes, and five more chances for Word output to drift
// silently away from what the PDF shows), this converts those existing
// blocks into docx elements.
//
// The practical consequence: a document's Word export stays correct when
// someone edits its PDF content, because there is only one content
// definition. Quotation keeps its own bespoke builder for now -- it is
// shipped, tested, and has layout choices (hanging-indent addressee, the
// signature block) that predate this; folding it in later is a separate,
// behaviour-preserving change rather than something to rush here.
//
// Scope is deliberately narrow: the block HTML these documents emit is a
// small, known vocabulary (headings, paragraphs, divs, bold/italic runs,
// line breaks, simple lists, and tables). Anything unrecognised degrades to
// its text content rather than throwing -- a Word export missing a border
// is recoverable, one that fails to open is not.

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, AlignmentType } from "docx";
import { buildDocxLetterheadSection } from "./wordLetterhead.js";

const NAVY = "1A3A52";

const parseHTML = (html) => {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  return doc.getElementById("root");
};

const textOf = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();

// Walks an element's children into docx TextRuns, preserving the inline
// formatting these documents actually use (bold, italic, underline) and
// treating <br> as a line break within the same paragraph.
function runsFrom(node, inherited = {}) {
  const runs = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      const text = (child.nodeValue || "").replace(/\s+/g, " ");
      if (text.trim() || runs.length) runs.push(new TextRun({ text, size: 19, ...inherited }));
      return;
    }
    if (child.nodeType !== 1) return;
    const tag = child.tagName.toLowerCase();
    if (tag === "br") { runs.push(new TextRun({ text: "", break: 1 })); return; }
    const style = { ...inherited };
    if (tag === "b" || tag === "strong") style.bold = true;
    if (tag === "i" || tag === "em") style.italics = true;
    if (tag === "u") style.underline = {};
    runs.push(...runsFrom(child, style));
  });
  return runs;
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 440, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" } },
    children: [new TextRun({ text, bold: true, size: 20, color: NAVY, allCaps: true })],
  });
}

function cell(text, header) {
  return new TableCell({
    shading: header ? { fill: NAVY } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: text || "", color: header ? "FFFFFF" : "1a1a1a", bold: !!header, size: header ? 17 : 19 })] })],
  });
}

// Table blocks arrive as raw <tr>/<th>/<td> HTML, the same strings the print
// path drops straight into a <table>. Cells are read as text: these tables
// carry data, not formatting.
function tableFromBlock(block) {
  const headerRow = parseHTML(`<table>${block.headerHTML}</table>`).querySelector("tr");
  const headers = headerRow ? Array.from(headerRow.children).map(textOf) : [];
  const rows = (block.rowsHTML || []).map((rowHTML) => {
    const tr = parseHTML(`<table>${rowHTML}</table>`).querySelector("tr");
    return tr ? Array.from(tr.children).map(textOf) : [];
  }).filter((r) => r.length);
  if (!rows.length) return null;
  const width = Math.max(headers.length, ...rows.map((r) => r.length));
  const pad = (arr) => { const out = arr.slice(); while (out.length < width) out.push(""); return out; };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      ...(headers.length ? [new TableRow({ children: pad(headers).map((h) => cell(h, true)) })] : []),
      ...rows.map((r) => new TableRow({ children: pad(r).map((c) => cell(c, false)) })),
    ],
  });
}

function elementToDocx(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === "h1" || tag === "h2" || tag === "h3") return [sectionHeading(textOf(el))];
  if (tag === "ul" || tag === "ol") {
    const ordered = tag === "ol";
    return Array.from(el.querySelectorAll("li")).map((li, i) =>
      new Paragraph({
        spacing: { after: 40 },
        ...(ordered ? {} : { bullet: { level: 0 } }),
        children: ordered ? [new TextRun({ text: `${i + 1}. ${textOf(li)}`, size: 18 })] : runsFrom(li),
      }));
  }
  if (tag === "table") {
    // A table embedded directly in a block's HTML rather than passed as a
    // {type:'table'} object.
    const headerRow = el.querySelector("thead tr") || el.querySelector("tr");
    const bodyRows = Array.from(el.querySelectorAll("tbody tr")).length
      ? Array.from(el.querySelectorAll("tbody tr"))
      : Array.from(el.querySelectorAll("tr")).slice(1);
    return [tableFromBlock({
      headerHTML: headerRow ? headerRow.outerHTML : "",
      rowsHTML: bodyRows.map((r) => r.outerHTML),
    })].filter(Boolean);
  }
  if (tag === "hr") return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" } }, children: [] })];

  // Containers: recurse so a wrapper <div> doesn't collapse its children
  // into one run-on paragraph.
  const hasBlockChildren = Array.from(el.children).some((c) =>
    ["div", "p", "h1", "h2", "h3", "table", "ul", "ol", "hr"].includes(c.tagName.toLowerCase()));
  if (hasBlockChildren) {
    const out = [];
    el.childNodes.forEach((child) => {
      if (child.nodeType === 1) out.push(...elementToDocx(child));
      else if (child.nodeType === 3 && (child.nodeValue || "").trim()) {
        out.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: child.nodeValue.trim(), size: 19 })] }));
      }
    });
    return out;
  }

  const runs = runsFrom(el);
  if (!runs.length) return [];
  const align = /text-align:\s*center/i.test(el.getAttribute("style") || "") ? AlignmentType.CENTER
    : /text-align:\s*right/i.test(el.getAttribute("style") || "") ? AlignmentType.RIGHT
      : undefined;
  return [new Paragraph({ spacing: { after: 80 }, alignment: align, children: runs })];
}

export function bodyBlocksToDocxChildren(bodyBlocks) {
  const children = [];
  (bodyBlocks || []).filter(Boolean).forEach((block) => {
    if (typeof block === "object" && block.type === "table") {
      const t = tableFromBlock(block);
      if (t) children.push(t);
      return;
    }
    if (typeof block !== "string") return;
    const root = parseHTML(block);
    root.childNodes.forEach((child) => {
      if (child.nodeType === 1) children.push(...elementToDocx(child));
      else if (child.nodeType === 3 && (child.nodeValue || "").trim()) {
        children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: child.nodeValue.trim(), size: 19 })] }));
      }
    });
  });
  // Word rejects a section with no children at all.
  if (!children.length) children.push(new Paragraph({ children: [] }));
  return children;
}

// Builds a .docx Blob for any letterhead document from the bodyBlocks it
// already produces for its PDF, applying the same 4 letterhead toggles.
export async function buildDocxBlobFromBodyBlocks({ bodyBlocks, toggles = {}, orientation = "portrait" }) {
  const { headerFooterAllPages, showPageNum, printOnLetterhead } = toggles;
  const lh = buildDocxLetterheadSection({ headerFooterAllPages, printOnLetterhead, showPageNum });
  const size = orientation === "landscape"
    ? { width: 16838, height: 11906, orientation: "landscape" }
    : { width: 11906, height: 16838 };
  const doc = new Document({
    sections: [{
      properties: { page: { margin: lh.margin, size }, titlePage: lh.differentFirstPage },
      headers: lh.headers,
      footers: lh.footers,
      children: bodyBlocksToDocxChildren(bodyBlocks),
    }],
  });
  return Packer.toBlob(doc);
}

// Shared download helper -- every document does the same thing with the Blob.
export async function downloadDocx(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
