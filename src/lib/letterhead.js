// Shared invoice/quotation letterhead building blocks: number-to-words helper,
// the print CSS used by Quotation/Proforma/Tax Invoice print views, the letterhead
// header markup, and the footer markup with the MOT/Incredible India/IATO/Award badges.
// Note: each document's buildPrintHTML() (Quotation, Proforma, Exchange Order) stays
// local to its own component, since it closes over component-specific state.

import { LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, BADGE_AWARD_B64 } from "./constants.js";

export const invoiceLetterheadCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Inter:wght@300;400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 10pt; color: #1a1a1a; background: #fff; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 10mm 14mm 10mm; display: flex; flex-direction: column; position: relative; }
    .doc-body { flex: 1; }
    .lh-header { text-align: center; margin-bottom: 4pt; }
    .lh-logo { height: 92pt; width: auto; display: block; margin: 0 auto 3pt; }
    .lh-addr-block { color: #2a2a2a; font-family: 'Inter', Arial, sans-serif; font-size: 9pt; letter-spacing: 0.3pt; line-height: 1.6; margin-bottom: 0; text-align: center; white-space: nowrap; }
    .lh-rule { height: 2pt; border: none; background: linear-gradient(to right, #cb0f0f, #061bb0); margin: 7pt 0 10pt; border-radius: 1pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .lh-rule-footer { height: 0.75pt; border: none; background: linear-gradient(to right, #cb0f0f, #061bb0); margin-bottom: 6pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .lh-footer { margin-top: auto; padding-top: 8pt; }
    .lh-footer-inner { display: flex; align-items: center; justify-content: space-between; }
    .inv-title { font-family: 'Playfair Display', Georgia, serif; font-size: 18pt; font-weight: 700; color: #1A3A52; text-align: center; margin-bottom: 10pt; letter-spacing: 1pt; text-transform: uppercase; }
    .inv-number { font-size: 11pt; font-weight: 700; color: #8B1A1A; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 10pt; gap: 14pt; }
    .party-block { flex: 1; background: #f8f9fa; border: 1pt solid #e5e7eb; border-radius: 4pt; padding: 8pt 10pt; }
    .party-label { font-size: 7.5pt; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1pt; margin-bottom: 4pt; }
    .party-name { font-size: 10.5pt; font-weight: 700; color: #1A3A52; font-family: 'Playfair Display', serif; margin-bottom: 2pt; }
    .party-detail { font-size: 8.5pt; color: #555; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6pt; }
    thead tr th { background: #1A3A52; color: #fff; font-size: 8.5pt; font-weight: 700; padding: 5pt 7pt; text-align: left; }
    tbody tr td { padding: 4pt 7pt; border-bottom: 0.5pt solid #e5e7eb; font-size: 9.5pt; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #f9fafb; }
    td.amount { text-align: right; font-weight: 600; color: #1A3A52; }
    .totals-block { width: 240pt; margin-left: auto; margin-bottom: 6pt; }
    .total-row { display: flex; justify-content: space-between; padding: 3pt 7pt; font-size: 9.5pt; border-bottom: 0.5pt solid #e5e7eb; }
    .total-row.grand { background: #1A3A52; color: #fff; font-weight: 700; font-size: 10.5pt; border-radius: 3pt; padding: 6pt 9pt; }
    .bank-box { background: #f0f4f8; border: 1pt solid #d1d9e0; border-radius: 4pt; padding: 8pt 10pt; margin-bottom: 7pt; }
    .bank-title { font-size: 8.5pt; font-weight: 700; color: #1A3A52; text-transform: uppercase; letter-spacing: 0.5pt; margin-bottom: 4pt; text-decoration: underline; }
    .bank-row { display: flex; gap: 8pt; font-size: 9pt; margin-bottom: 2pt; }
    .bank-key { font-weight: 600; color: #333; min-width: 110pt; }
    .bank-val { color: #555; }
    .notes-box { font-size: 8.5pt; color: #666; line-height: 1.5; border-left: 2pt solid #cb0f0f; padding-left: 7pt; margin-bottom: 7pt; }
    .page-num { position: absolute; bottom: 6mm; right: 14mm; font-size: 8pt; color: #aaa; }
    .print-footer { margin-top: 16pt; }
    .print-footer.on-all-pages { position: fixed; bottom: 10mm; left: 14mm; right: 14mm; }
    .page.reserve-footer { padding-bottom: 34mm; }
    @media print { body { margin: 0; } .page { width: 100%; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } @page { margin: 0; size: A4; } }
  `;

export const invoiceLetterheadHTML = (pageNum=1, headerAllPages=true) => {
  if (pageNum > 1 && !headerAllPages) return '<div style="height:20pt"></div>';
  return `
  <div class="lh-header">
    <img src="${LOGO_B64}" class="lh-logo" alt="Unitop Tours"/>
    <div class="lh-addr-block">Registered Office: 506, DDA-2F, District Centre, Janakpuri, New Delhi, India - 110058</div>
    <div class="lh-addr-block">Corporate Office: 452, JMD Megapolis, Sec-48, Sohna Rd., Gurugram, Haryana, India - 122018</div>
    <div class="lh-addr-block">Website:&nbsp;www.unitoptours.com &nbsp;|&nbsp; E-Mail: unitoptours@gmail.com &nbsp;|&nbsp; Telephone:&nbsp;+91&#8209;124&#8209;4476571</div>
    <div class="lh-rule"></div>
  </div>
`;};

export const invoiceFooterHTML = () => `
<div class="lh-footer">
  <div style="height:1.5px;background:linear-gradient(to right,#cb0f0f,#061bb0);margin-bottom:6pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <tr>
      <td style="width:25%;text-align:center;padding:0 6pt;vertical-align:middle;"><img src="${BADGE_MOT_B64}" alt="MOT" style="max-height:32pt;max-width:90%;width:auto;height:auto;"/></td>
      <td style="width:25%;text-align:center;padding:0 6pt;vertical-align:middle;"><img src="${BADGE_INDIA_B64}" alt="Incredible India" style="max-height:32pt;max-width:90%;width:auto;height:auto;"/></td>
      <td style="width:25%;text-align:center;padding:0 6pt;vertical-align:middle;"><img src="${BADGE_IATO_B64}" alt="IATO" style="max-height:32pt;max-width:90%;width:auto;height:auto;"/></td>
      <td style="width:25%;text-align:center;padding:0 6pt;vertical-align:middle;">
        <img src="${BADGE_AWARD_B64}" alt="Award" style="height:28pt;width:auto;max-width:100%;display:block;margin:0 auto 1.5pt;"/>
        <div style="font-size:5pt;font-weight:700;color:#1A3A52;text-transform:uppercase;letter-spacing:0.3pt;">National Tourism Award</div>
        <div style="font-size:4.5pt;color:#888;">2013&#8209;14 &nbsp;|&nbsp; 2016&#8209;17 &nbsp;|&nbsp; 2018&#8209;19</div>
        <div style="font-size:4pt;color:#666;">Ministry of Tourism, Govt. of India</div>
      </td>
    </tr>
  </table>
</div>
`;
