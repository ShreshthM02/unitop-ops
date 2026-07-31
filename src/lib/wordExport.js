// Word (.docx) export -- new feature (1.1 of the Quotation feedback batch,
// 2026-07-30): the app previously had no Word export path at all, only
// "Print / Export PDF" via the browser print dialog. Built with the `docx`
// npm package, client-side, producing a real .docx Blob for download.
//
// Full parity with the PDF's 4 letterhead toggles -- see wordLetterhead.js
// for how each toggle maps onto Word's own header/footer/margin mechanics
// (genuinely different from print CSS, so the mapping isn't 1:1 visually,
// but the same 4 toggles drive the same underlying decisions).

import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, HeadingLevel } from "docx";
import { buildDocxLetterheadSection } from "./wordLetterhead.js";
import { STAMP_B64 } from "./images.js";

const stripB64 = (dataUrl) => dataUrl.replace(/^data:image\/\w+;base64,/, "");

const NAVY = "1A3A52";
const GRAY = "888888";

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 440, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" } },
    children: [new TextRun({ text, bold: true, size: 20, color: NAVY, allCaps: true })],
  });
}

function cell(text, { header = false, width } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header ? { fill: NAVY } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: text || "", color: header ? "FFFFFF" : "1a1a1a", bold: header, size: header ? 17 : 19 })] })],
  });
}

function dataTable(headerCells, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headerCells.map((h) => cell(h, { header: true })) }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
    ],
  });
}

function numberedList(items) {
  return items.map((item, i) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${i + 1}. ${item}`, size: 18 })] }));
}

function bulletList(items) {
  return items.map((item) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: item, size: 18 })] }));
}

// Builds the full Quotation body content (everything between the letterhead
// header and footer), in the same section order as the PDF path's
// buildPrintHTML: addressee -> itinerary (+ optional flights/trains) ->
// accommodation -> monuments (relocated here per 1.4) -> remarks (1.5) ->
// price -> includes/excludes -> closing.
function buildQuotationBody(q, showStamp) {
  const body = [];

  body.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `Date: ${q.date}`, bold: true, size: 19 })] }));
  if (q.attnName || q.attnCompany || q.attnCity) {
    // Mirrors buildAddresseeBlock's hanging indent: label + name on the
    // first line, company/city stacked underneath aligned to the name. Word
    // has no table-cell trick available inline here, so the continuation
    // lines use a hanging indent on the paragraph instead -- same visual
    // result, expressed the way Word expresses it.
    const HANGING = 1420; // twips ~= width of "Kind Attention: " at 9.5pt
    body.push(new Paragraph({
      spacing: { before: 120, after: 0 },
      indent: { left: HANGING, hanging: HANGING },
      children: [
        new TextRun({ text: "Kind Attention: ", bold: true, size: 19 }),
        new TextRun({ text: q.attnName || "", size: 19 }),
      ],
    }));
    for (const line of [q.attnCompany, q.attnCity].filter(Boolean)) {
      body.push(new Paragraph({
        spacing: { after: 0 },
        indent: { left: HANGING },
        children: [new TextRun({ text: line, size: 19 })],
      }));
    }
  }
  if (q.refLine) {
    body.push(new Paragraph({
      spacing: { before: 120, after: 200 },
      children: [new TextRun({ text: "RE: ", bold: true, size: 19 }), new TextRun({ text: q.refLine, size: 19 })],
    }));
  }
  body.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: q.greeting, bold: true, italics: true, size: 20 })] }));
  body.push(new Paragraph({ spacing: { after: 180 }, children: [new TextRun({ text: q.openingLine, size: 19 })] }));

  // Day-wise itinerary (1.2: optional Date column, Breakfast spelled out)
  body.push(sectionHeading("Day-wise Itinerary"));
  const itinHeaders = q.showItinDate ? ["Day", "Date", "Itinerary", "Breakfast", "Lunch", "Dinner"] : ["Day", "Itinerary", "Breakfast", "Lunch", "Dinner"];
  const itinRows = q.itinerary.map((r) => {
    const row = [r.day];
    if (q.showItinDate) row.push(r.date || "\u2014");
    row.push(r.movement, r.bf || "\u2014", r.lunch || "\u2014", r.dinner || "\u2014");
    return row;
  });
  body.push(dataTable(itinHeaders, itinRows));

  // Domestic Flights / Trains (1.3, 2.3: each entry carries its own day/date)
  if (q.showFlights && q.flights.length) {
    body.push(sectionHeading(q.flightsHeading || "Domestic Flights"));
    body.push(dataTable(["Day", "Flight Details"], q.flights.map((f) => [(f && f.day) || "\u2014", (f && f.detail) || ""])));
  }
  if (q.showTrains && q.trains.length) {
    body.push(sectionHeading(q.trainsHeading || "Domestic Trains"));
    body.push(dataTable(["Day", "Train Details"], q.trains.map((t) => [(t && t.day) || "\u2014", (t && t.detail) || ""])));
  }

  // Accommodation
  body.push(sectionHeading("Accommodation"));
  body.push(dataTable(["Place", "Nights", "Hotel / Property"], q.hotels.map((h) => [h.place, h.nights, h.hotel])));

  // Monument Fees (1.4: relocated here, below Accommodation)
  if (q.showMonuments) {
    body.push(sectionHeading(q.monumentNote || "Monument Fees"));
    body.push(dataTable(["Monument", "Fee"], q.monuments.map((m) => [m.name, m.fee])));
  }

  // Remarks (1.5: new section, below the relocated Monument Fees)
  if (q.showRemarks && q.remarks) {
    body.push(sectionHeading(q.remarksHeading || "Remarks"));
    q.remarks.split("\n").forEach((line) => body.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: line, size: 19 })] })));
  }

  // Cost Per Person
  body.push(sectionHeading(`Cost Per Person (${q.currency})`));
  body.push(dataTable(["Group Size", "Rate"], q.slabs.map((s) => [s.label, `${q.currency} ${s.price} Per Pax`])));

  // Includes / Excludes
  body.push(sectionHeading("Cost Includes"));
  body.push(...numberedList(q.includes));
  body.push(sectionHeading("Cost Does Not Include"));
  body.push(...numberedList(q.excludes));

  // Closing + signoff + stamp
  body.push(new Paragraph({ spacing: { before: 200, after: 160 }, children: [new TextRun({ text: q.closingLine, size: 19 })] }));
  q.signoff.split("\n").forEach((line) => body.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: line, size: 20 })] })));
  if (showStamp) {
    body.push(new Paragraph({ spacing: { before: 160 }, children: [new ImageRun({ type: "png", data: stripB64(STAMP_B64), transformation: { width: 90, height: 90 } })] }));
  } else {
    body.push(new Paragraph({ spacing: { before: 160 }, children: [] }));
  }
  body.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: NAVY } },
    spacing: { before: showStamp ? 40 : 480, after: 20 },
    children: [new TextRun({ text: "\u00A0".repeat(30) })],
  }));
  body.push(new Paragraph({ children: [new TextRun({ text: "For Unitop Tours & Travel (P) Ltd.", bold: true, size: 20, color: NAVY })] }));
  body.push(new Paragraph({ children: [new TextRun({ text: "(Authorised Signatory)", size: 18, color: GRAY })] }));

  return body;
}

// Assembles and packs the full .docx Document for a Quotation, applying the
// same 4 letterhead toggles the PDF preview uses (headerFooterAllPages,
// showPageNum, showStamp, printOnLetterhead), and returns a Blob ready for
// download.
export async function buildQuotationDocxBlob(q, toggles) {
  const { headerFooterAllPages, showPageNum, showStamp, printOnLetterhead } = toggles;
  const lh = buildDocxLetterheadSection({ headerFooterAllPages, printOnLetterhead, showPageNum });

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: lh.margin, size: { width: 11906, height: 16838 } },
        titlePage: lh.differentFirstPage,
      },
      headers: lh.headers,
      footers: lh.footers,
      children: buildQuotationBody(q, showStamp),
    }],
  });

  return Packer.toBlob(doc);
}
