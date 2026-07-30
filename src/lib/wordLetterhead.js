// Shared Word (.docx) letterhead building blocks.
//
// Mirrors the same 4-toggle model as letterhead.js (Header+Footer on all
// pages, Page Number, Digital Stamp, Print on Letterhead), reinterpreted for
// Word's own header/footer mechanics rather than print CSS:
//   - Word headers/footers repeat on every page natively -- no manual
//     pagination/measurement needed the way the PDF path requires.
//   - "Header/Footer on all pages" OFF (and not Print on Letterhead): Word
//     has no equivalent of "appears once inline in the flow" for a running
//     header/footer, so this uses Word's own "different first page" feature
//     -- real header/footer content on page 1 only, blank on subsequent
//     pages. Closest native equivalent to "appears exactly once".
//   - "Print on Letterhead": header/footer content is blank on every page,
//     and the physical page margin is widened to 6cm top / 4cm bottom
//     (matching the CSS blank-space reservation), so the physical
//     pre-printed letterhead paper's artwork has room on every sheet.
//   - Page Number is independent of the other three, same as the PDF path.
//   - Digital Stamp is body content (in the signature block), not part of
//     the header/footer -- callers place it directly in the document body.

import { Header, Footer, Paragraph, TextRun, ImageRun, AlignmentType, BorderStyle, PageNumber } from "docx";
import { LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, BADGE_AWARD_B64 } from "./images.js";

// Physical print margins, mirroring letterhead.js's PRINT_MARGIN (8mm/14mm)
// -- kept as a separate constant here since docx measures in twips (1mm =
// 56.6929 twips), not the mm strings letterhead.js's CSS uses.
const mmToTwip = (mm) => Math.round(mm * 56.6929);
export const DOCX_MARGIN = { top: mmToTwip(8), bottom: mmToTwip(8), left: mmToTwip(14), right: mmToTwip(14) };
// 6cm top / 4cm bottom from the physical page edge, same total reservation
// as letterhead.js's .lh-header--blank / .lh-footer--blank (which measure
// from PRINT_MARGIN's own 8mm, not from the physical edge -- here the twip
// margin itself IS measured from the physical edge, so no further
// subtraction is needed).
export const DOCX_MARGIN_LETTERHEAD = { top: mmToTwip(60), bottom: mmToTwip(40), left: mmToTwip(14), right: mmToTwip(14) };

const stripB64 = (dataUrl) => dataUrl.replace(/^data:image\/\w+;base64,/, "");

const emptyParagraph = () => new Paragraph({ children: [] });

function realHeaderChildren() {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ type: "png", data: stripB64(LOGO_B64), transformation: { width: 130, height: 76 } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [new TextRun({ text: "Registered Office: 506, DDA-2F, District Centre, Janakpuri, New Delhi, India - 110058", size: 14, color: "2a2a2a" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
      children: [new TextRun({ text: "Corporate Office: 452, JMD Megapolis, Sec-48, Sohna Rd., Gurugram, Haryana, India - 122018", size: 14, color: "2a2a2a" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "1A3A52" } },
      children: [new TextRun({ text: "www.unitoptours.com | unitoptours@gmail.com | +91-124-4476571", size: 14, color: "2a2a2a" })],
    }),
  ];
}

function realFooterChildren(showPageNum) {
  const children = [
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 8, color: "1A3A52" } },
      spacing: { before: 100 },
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({ type: "png", data: stripB64(BADGE_MOT_B64), transformation: { width: 34, height: 34 } }),
        new TextRun({ text: "     " }),
        new ImageRun({ type: "png", data: stripB64(BADGE_INDIA_B64), transformation: { width: 34, height: 34 } }),
        new TextRun({ text: "  " }),
        new ImageRun({ type: "png", data: stripB64(BADGE_IATO_B64), transformation: { width: 34, height: 34 } }),
        new TextRun({ text: "     " }),
        new ImageRun({ type: "png", data: stripB64(BADGE_AWARD_B64), transformation: { width: 32, height: 32 } }),
      ],
    }),
  ];
  if (showPageNum) children.push(pageNumParagraph());
  return children;
}

function pageNumParagraph() {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 40 },
    children: [
      new TextRun({ text: "Page " }),
      new TextRun({ children: [PageNumber.CURRENT] }),
      new TextRun({ text: " of " }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
    ],
  });
}

// Builds the {headers, footers, differentFirstPage, margin} slice of a docx
// section's properties for the 4-toggle letterhead state. Pass the result's
// `properties` fields straight into a docx Document section:
//   const lh = buildDocxLetterheadSection(toggles);
//   sections: [{ properties: { page: { margin: lh.margin }, titlePage: lh.differentFirstPage }, headers: lh.headers, footers: lh.footers, children: [...] }]
export function buildDocxLetterheadSection({ headerFooterAllPages = false, printOnLetterhead = false, showPageNum = false } = {}) {
  if (printOnLetterhead) {
    // Blank header/footer on every page (the physical pre-printed paper
    // already has the artwork) -- page number, if on, still needs to be
    // real content since it can't be pre-printed.
    const blankFooterChildren = showPageNum ? [pageNumParagraph()] : [emptyParagraph()];
    return {
      margin: DOCX_MARGIN_LETTERHEAD,
      differentFirstPage: false,
      headers: { default: new Header({ children: [emptyParagraph()] }) },
      footers: { default: new Footer({ children: blankFooterChildren }) },
    };
  }
  if (headerFooterAllPages) {
    // Real header/footer, repeating on every page -- Word does this
    // natively for a section's default header/footer.
    return {
      margin: DOCX_MARGIN,
      differentFirstPage: false,
      headers: { default: new Header({ children: realHeaderChildren() }) },
      footers: { default: new Footer({ children: realFooterChildren(showPageNum) }) },
    };
  }
  // Neither toggle on: closest native Word equivalent to the PDF path's
  // "appears exactly once" is real header/footer on page 1 only, via
  // Word's own differentFirstPage feature -- blank default for every page
  // after that.
  const blankFooterChildren = showPageNum ? [pageNumParagraph()] : [emptyParagraph()];
  return {
    margin: DOCX_MARGIN,
    differentFirstPage: true,
    headers: {
      default: new Header({ children: [emptyParagraph()] }),
      first: new Header({ children: realHeaderChildren() }),
    },
    footers: {
      default: new Footer({ children: blankFooterChildren }),
      first: new Footer({ children: realFooterChildren(showPageNum) }),
    },
  };
}
