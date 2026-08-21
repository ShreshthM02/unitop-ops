import { useState, useEffect, useRef } from 'react';
import * as Lib from '../lib/index.js';
const {
  SERVICE_TYPES, VENDOR_TYPES, DEFAULT_EXCHANGE_TEMPLATE, OtherInput, VersionDropdown, ExportMenu, G,
  LOGO_B64, STAMP_B64, COMPANY_INFO, WATERMARK_TEXT, formatDateDMY,
  loadExchangeOrdersForTourFile, loadExchangeOrderVersionHistory, nextExchangeOrderNo, groupExchangeOrderVersions,
  saveExchangeOrderVersion, markExchangeOrderVersionFinal, updateExchangeOrderRowContent,
  DEFAULT_DOC_SETTINGS, logAudit, db,
} = Lib;

// Blue tiled watermark for the Shareable print flavor -- deliberately NOT
// the shared WatermarkSVG() (constants.js), which is a fixed red and used
// by many other documents; reusing it here would mean either an
// off-brand red watermark on this one document or silently recoloring it
// everywhere else. Same tiling approach, blue fill to match the real
// letterhead template exactly (2026-08-21 measurement: watermark text
// color is #061BB0).
// Inline (not CSS background-image) tiled watermark, sized to the exact
// page it's rendered into. Deliberately NOT a CSS background-image data
// URI -- that path silently failed to render at all under this app's PDF
// rendering pipeline (confirmed 2026-08-21: the markup was present and
// well-formed, but nothing painted, even at 4x contrast). An inline <svg>
// element is a standard DOM node rather than an asset the renderer has to
// fetch/decode, and is far more reliably supported.
const eoWatermarkInlineSVG = (pageWidthPt, pageHeightPt, color = "6,27,176") => {
  const cols = Math.ceil(pageWidthPt / 180) + 1;
  const rows = Math.ceil(pageHeightPt / 40) + 1;
  const texts = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * 180 - 20, y = row * 40;
      texts.push(`<text class="wm" x="${x}" y="${y}" transform="rotate(-25,${x + 20},${y})">${WATERMARK_TEXT}</text>`);
    }
  }
  return `<svg class="abs" style="left:0;top:0;z-index:0" width="${pageWidthPt}" height="${pageHeightPt}" xmlns="http://www.w3.org/2000/svg">
    <style>.wm{font-family:Arial;font-size:11px;fill:rgba(${color},0.10);font-weight:700;letter-spacing:1px;}</style>
    ${texts.join("")}
  </svg>`;
};

// ─── Lightweight rich-text editor for the unified Service Details field.
// contentEditable-based rather than a library: matches this app's
// dependency-light style, and the b/i/u/list markup it produces is exactly
// what wordFromBlocks.js already knows how to convert for Word export
// (Phase B), so PDF and Word will render this consistently for free. ──────
function RichTextEditor({ value, onChange, readOnly }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || "";
  }, [value]);
  const exec = (cmd) => {
    document.execCommand(cmd);
    ref.current?.focus();
    onChange(ref.current.innerHTML);
  };
  const btn = (lbl, cmd, title) => (
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec(cmd)} title={title}
      style={{ padding: "3px 9px", fontSize: 11, fontWeight: 700, border: `1px solid ${G.gray200}`, borderRadius: 4, background: G.white, cursor: "pointer", marginRight: 4 }}>
      {lbl}
    </button>
  );
  return (
    <div>
      {!readOnly && (
        <div style={{ marginBottom: 4 }}>
          {btn("B", "bold", "Bold")}
          {btn("I", "italic", "Italic")}
          {btn("U", "underline", "Underline")}
          {btn("• List", "insertUnorderedList", "Bullet list")}
        </div>
      )}
      <div ref={ref} contentEditable={!readOnly} suppressContentEditableWarning
        onInput={() => onChange(ref.current.innerHTML)}
        style={{ minHeight: 110, padding: "8px 10px", border: `1px solid ${G.gray200}`, borderRadius: 6, fontSize: 12, lineHeight: 1.5, fontFamily: "'Inter',sans-serif", background: readOnly ? G.gray50 : G.white, outline: "none" }} />
    </div>
  );
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ExchangeOrderGenerator({ query, template, vendors, onClose, currentUser, readOnly, initialOpenOrderNo }) {
  const tmpl = { ...DEFAULT_EXCHANGE_TEMPLATE, ...(template || {}) };
  const eoPrefix = (DEFAULT_DOC_SETTINGS.exchange && DEFAULT_DOC_SETTINGS.exchange.prefix) || "EO";
  const vendorList = vendors || [];

  const [tab, setTab] = useState(initialOpenOrderNo ? "repository" : "new"); // "new" | "repository"

  // Repository tab: every EO for this tour file, grouped by its stable
  // order_no into one card each (showing the latest version).
  const [eoGroups, setEoGroups] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  // The EO currently open for viewing/editing inside the Repository tab.
  const [openOrderNo, setOpenOrderNo] = useState(null);
  const [openVersions, setOpenVersions] = useState([]);
  const [openViewingVersion, setOpenViewingVersion] = useState(null);
  const [openFinalVersion, setOpenFinalVersion] = useState(null);

  const emptyOrder = () => ({
    serviceType: "restaurant",
    otherServiceType: "",
    issueDate: todayISO(),
    drawnOnVendorId: "",
    drawnOn: "",
    tourNo: query.tourFileId || query.id,
    pax: query.paxDisplay || "",
    nationality: query.nationality || "",
    tourFacilitatorDetails: "",
    serviceDetailsHtml: "",
    arrivalDate: "", arrivalFrom: "", arrivalBy: "", arrivalTime: "",
    departureDate: "", departureTo: "", departureBy: "", departureTime: "",
    notes: "",
    confirmed: false,
    // Whether the vendor's bill for this service has been paid -- a
    // status flag only, deliberately carries no amount (see 2026-08-20
    // discussion: the EO is a service voucher, not a financial
    // transaction; actual payment is entered separately in Payments,
    // with no structural link back to the EO).
    settled: false,
  });

  const [form, setForm] = useState(emptyOrder());
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setVendor = (vendorId) => {
    const v = vendorList.find(x => x.id === vendorId);
    setForm(p => ({ ...p, drawnOnVendorId: vendorId, drawnOn: v ? v.name : "" }));
  };
  // "Drawn on" is filtered to vendors of the matching type -- Vendor
  // Master's VENDOR_TYPES and SERVICE_TYPES' labels are kept as the same
  // data by direct instruction (2026-08-21), so this is a plain string
  // match. Changing the service type clears the vendor selection, since a
  // vendor valid under the old type may not be under the new one.
  const setServiceType = (id) => setForm(p => ({ ...p, serviceType: id, otherServiceType: "", drawnOnVendorId: "", drawnOn: "" }));
  const svcNow = SERVICE_TYPES.find(s => s.id === form.serviceType);
  const vendorOptions = (svcNow && svcNow.label !== "Other")
    ? vendorList.filter(v => v.type === svcNow.label)
    : vendorList; // "Other" service type -- any vendor is fair game, per direct instruction

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const refreshList = () => {
    setLoadingList(true);
    return loadExchangeOrdersForTourFile(db, query.id).then(rows => {
      const groups = groupExchangeOrderVersions(rows);
      setEoGroups(groups);
      setLoadingList(false);
      return groups;
    });
  };

  useEffect(() => {
    refreshList().then(groups => {
      if (initialOpenOrderNo) {
        const match = groups.find(g => g.orderNo === initialOpenOrderNo);
        if (match) openOrder(match);
      }
    });
  }, [query.id]);

  // ─── Save a brand-new EO: version 1, order_no assigned now from the
  // global sequence (per 1.7 -- universally auto-incremental across every
  // tour file, not just this one). Lands the user directly on the saved
  // order afterward (2026-08-21 fix) -- previously dropped them on the
  // flat Repository list, which is why the version history looked "not
  // visible": there was nothing wrong with it, it just was not being shown. ──
  const saveNewOrder = async () => {
    if (!form.drawnOnVendorId) return;
    setSaving(true);
    const orderNo = await nextExchangeOrderNo(db, eoPrefix);
    const { error } = await saveExchangeOrderVersion(db, orderNo, query.id, form.drawnOnVendorId, { version: 1, order: form }, currentUser?.id);
    if (error) {
      setToast(`Failed to save: ${error}`);
      setSaving(false);
    } else {
      logAudit(db, query.id, currentUser?.name, `Exchange Order ${orderNo} created`);
      setToast(`Exchange Order ${orderNo} saved.`);
      setTab("repository");
      const groups = await refreshList();
      const match = groups.find(g => g.orderNo === orderNo);
      if (match) await openOrder(match);
      setSaving(false);
    }
  };

  // ─── Open an existing EO for viewing/editing -- loads its own version
  // history and shows the latest (or final, if marked) version in the form.
  const openOrder = async (group) => {
    setOpenOrderNo(group.orderNo);
    const versions = await loadExchangeOrderVersionHistory(db, group.orderNo);
    setOpenVersions(versions);
    const finalV = versions.find(v => v.isFinal);
    setOpenFinalVersion(finalV ? finalV.version : null);
    const shown = finalV || versions[versions.length - 1];
    setOpenViewingVersion(shown.version);
    setForm({ ...emptyOrder(), ...shown.order });
  };

  const closeOpenOrder = () => {
    setOpenOrderNo(null);
    setOpenVersions([]);
    setForm(emptyOrder());
    refreshList();
  };

  const selectOpenVersion = (v) => { setOpenViewingVersion(v.version); setForm({ ...emptyOrder(), ...v.order }); };

  const saveNewVersionOfOpenOrder = async () => {
    if (!openOrderNo) return;
    setSaving(true);
    const nextV = Math.max(...openVersions.map(v => v.version)) + 1;
    const { error } = await saveExchangeOrderVersion(db, openOrderNo, query.id, form.drawnOnVendorId, { version: nextV, order: form }, currentUser?.id);
    if (error) {
      setToast(`Failed to save: ${error}`);
    } else {
      logAudit(db, query.id, currentUser?.name, `Exchange Order ${openOrderNo} v${nextV} saved`);
      setToast(`Exchange Order ${openOrderNo} v${nextV} saved.`);
      const versions = await loadExchangeOrderVersionHistory(db, openOrderNo);
      setOpenVersions(versions);
      setOpenViewingVersion(nextV);
    }
    setSaving(false);
  };

  const onMarkOpenFinal = async (v) => {
    if (readOnly) return;
    await markExchangeOrderVersionFinal(db, openOrderNo, v.version);
    logAudit(db, query.id, currentUser?.name, `Exchange Order ${openOrderNo} v${v.version} marked final`);
    setOpenFinalVersion(v.version);
  };

  // Confirmed/Pending and Settled/Unsettled are quick status flags, not
  // content edits -- updated in place on the row currently shown rather
  // than spawning a new version. Both now log to the audit trail
  // (2026-08-21 -- previously silent).
  const toggleGroupConfirmed = async (group) => {
    if (readOnly) return;
    const row = group.latest;
    const next = !row.order.confirmed;
    await updateExchangeOrderRowContent(db, row.id, { ...row.order, confirmed: next });
    logAudit(db, query.id, currentUser?.name, `Exchange Order ${group.orderNo} marked ${next ? "Confirmed" : "Pending"}`);
    refreshList();
  };

  const toggleGroupSettled = async (group) => {
    if (readOnly) return;
    const row = group.latest;
    const next = !row.order.settled;
    await updateExchangeOrderRowContent(db, row.id, { ...row.order, settled: next });
    logAudit(db, query.id, currentUser?.name, `Exchange Order ${group.orderNo} marked ${next ? "Settled" : "Unsettled"}`);
    refreshList();
  };

  // ─── Print. Two flavors, rebuilt 2026-08-21 to match the real reference
  // templates exactly rather than an approximation:
  // - Printable: real A4 portrait (595.28pt x 841.89pt / 210x297mm),
  //   not the earlier 8x5in guess -- every coordinate below is taken
  //   directly from the original Word-generated PDF (measured via
  //   PyMuPDF: text span bboxes, fonts, rule positions), so it lines up
  //   with the actual pre-printed stationery. Colors: plain black, no
  //   logo/watermark/stamp (already on the paper).
  // - Shareable: real 10in x 5.625in landscape (720pt x 405pt -- also
  //   measured from the reference PDF, not the 8x5in this was built to
  //   before), blue (#061BB0) for every branded/header/footer element,
  //   black for the order content, red only on the stamp (the same
  //   STAMP_B64 asset used on the real letterhead), and a blue tiled
  //   watermark matching the reference exactly.
  // Both add three fields the original templates don't have (No. of Pax,
  // Nationality, Tour Facilitator Details -- added in Phase A per direct
  // spec) using the same font/style as the surrounding content, absorbing
  // the extra height by tightening row spacing slightly rather than
  // pushing the footer off the page (Shareable's card is only 405pt tall
  // top to bottom, so there is no free space to spend). ───────────────────
  const buildPrintableHTML = (order, orderNo) => {
    const svc = SERVICE_TYPES.find(s => s.id === order.serviceType);
    const svcLabel = order.serviceType === "others" && order.otherServiceType ? order.otherServiceType : (svc?.label || "Service");
    const hasArrDep = order.arrivalDate || order.departureDate;
    const fD = (iso) => formatDateDMY(iso) || iso || "";

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Exchange Order ${orderNo}</title>
    <style>
      @page { size: 595.28pt 841.89pt; margin: 0; }
      * { box-sizing: border-box; }
      body { font-family: 'Times New Roman', Times, serif; color: #000; margin: 0; padding: 0;
        width: 595.28pt; height: 841.89pt; position: relative; background: #fff; }
      .abs { position: absolute; }
      .nowrap { white-space: nowrap; }
      .lbl { font-weight: 400; }
      .rule { position: absolute; border-top: 0.75pt solid #000; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
      <div class="abs" style="left:36pt;top:123pt;width:523.5pt;text-align:center;font-weight:700;font-size:10pt;">${svcLabel.toUpperCase()}</div>

      <div class="abs" style="left:36pt;top:137pt;font-size:10pt;">Exchange Order No.: ${orderNo}</div>
      <div class="abs nowrap" style="left:400pt;top:137pt;width:159.28pt;text-align:right;font-size:10pt;">Dated: ${fD(order.issueDate)}</div>
      <div class="abs" style="left:36pt;top:151pt;font-size:10pt;">Drawn on: ${order.drawnOn}</div>
      <div class="abs" style="left:36pt;top:165pt;font-size:10pt;">In favour of Tour No.: ${order.tourNo}</div>
      <div class="abs" style="left:36pt;top:179pt;font-size:10pt;">No. of Pax: ${order.pax}&nbsp;&nbsp;&nbsp;&nbsp;Nationality: ${order.nationality}</div>
      <div class="abs" style="left:36pt;top:193pt;font-size:10pt;">Tour Facilitator Details: ${order.tourFacilitatorDetails || "—"}</div>
      <div class="abs" style="left:36pt;top:207pt;font-size:10pt;">Please provide the following services against this order &amp; <b>bill us in duplicate</b></div>
      <div class="rule" style="left:36pt;top:217pt;width:523.5pt;"></div>

      <div class="abs" style="left:41.2pt;top:229pt;font-size:10pt;font-weight:700;">Details of services</div>
      <div class="abs" style="left:355.5pt;top:229pt;font-size:10pt;font-weight:700;text-decoration:underline;">ARRIVAL</div>
      <div class="abs" style="left:483.9pt;top:229pt;font-size:10pt;font-weight:700;text-decoration:underline;">DEPARTURE</div>

      <div class="abs" style="left:41.2pt;top:246pt;width:300pt;font-size:10pt;line-height:1.5;">${order.serviceDetailsHtml || ""}</div>

      ${hasArrDep ? `
      <div class="abs" style="left:355.5pt;top:251pt;font-size:10pt;">Date:&nbsp;&nbsp; ${fD(order.arrivalDate)}</div>
      <div class="abs" style="left:462.8pt;top:251pt;font-size:10pt;">Date:&nbsp;&nbsp; ${fD(order.departureDate)}</div>
      <div class="abs" style="left:355.5pt;top:273pt;font-size:10pt;">From:&nbsp; ${order.arrivalFrom}</div>
      <div class="abs" style="left:462.8pt;top:273pt;font-size:10pt;">To:&nbsp;&nbsp;&nbsp;&nbsp; ${order.departureTo}</div>
      <div class="abs" style="left:355.5pt;top:295pt;font-size:10pt;">By:&nbsp;&nbsp;&nbsp;&nbsp; ${order.arrivalBy}</div>
      <div class="abs" style="left:462.8pt;top:295pt;font-size:10pt;">By:&nbsp;&nbsp;&nbsp;&nbsp; ${order.departureBy}</div>
      <div class="abs" style="left:355.5pt;top:317pt;font-size:10pt;">Time:&nbsp; ${order.arrivalTime}</div>
      <div class="abs" style="left:462.8pt;top:317pt;font-size:10pt;">Time:&nbsp; ${order.departureTime}</div>
      ` : ""}
    </body></html>`;
  };

  const buildShareableHTML = (order, orderNo) => {
    const svc = SERVICE_TYPES.find(s => s.id === order.serviceType);
    const svcLabel = order.serviceType === "others" && order.otherServiceType ? order.otherServiceType : (svc?.label || "Service");
    const hasArrDep = order.arrivalDate || order.departureDate;
    const BLUE = "#061BB0";
    const fD = (iso) => formatDateDMY(iso) || iso || "";

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Exchange Order ${orderNo}</title>
    <style>
      @page { size: 720pt 405pt; margin: 0; }
      * { box-sizing: border-box; }
      body { font-family: 'Times New Roman', Times, serif; color: #000; margin: 0; padding: 0;
        width: 720pt; height: 405pt; position: relative; overflow: hidden; background: #fff; }
      .abs { position: absolute; z-index: 1; }
      .arial { font-family: Arial, sans-serif; }
      .nowrap { white-space: nowrap; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
      ${eoWatermarkInlineSVG(720, 405, "6,27,176")}

      <img src="${LOGO_B64}" class="abs" style="left:35pt;top:2pt;width:118pt;height:auto;mix-blend-mode:multiply"/>
      <div class="abs arial" style="left:25pt;top:69pt;font-size:14pt;font-weight:700;color:${BLUE};">EXCHANGE ORDER</div>

      <div class="abs arial nowrap" style="left:298pt;top:10pt;width:400pt;text-align:right;font-size:17pt;font-weight:700;color:${BLUE};">UNITOP TOURS &amp; TRAVEL PVT. LTD</div>
      <div class="abs arial nowrap" style="left:298pt;top:31pt;width:400pt;text-align:right;font-size:8pt;font-weight:700;color:${BLUE};">${COMPANY_INFO.address}</div>
      <div class="abs arial nowrap" style="left:298pt;top:42pt;width:400pt;text-align:right;font-size:8pt;font-weight:700;color:${BLUE};">Corporate Office: 452, JMD Megapolis, Sec-48, Sohna Rd., Gurugram, Haryana - 122018</div>
      <div class="abs arial nowrap" style="left:298pt;top:53pt;width:400pt;text-align:right;font-size:8pt;font-weight:700;color:${BLUE};">Web: ${COMPANY_INFO.web} &nbsp;|&nbsp; Email: ${COMPANY_INFO.email}</div>

      <div class="abs" style="left:325pt;top:83pt;width:400pt;text-align:center;font-size:13pt;font-weight:700;color:#000;">${svcLabel.toUpperCase()}</div>

      <div class="abs nowrap" style="left:28pt;top:103pt;font-size:10.5pt;">Exchange Order No.: ${orderNo}</div>
      <div class="abs nowrap" style="left:400pt;top:103pt;width:292pt;text-align:right;font-size:10.5pt;">Dated: ${fD(order.issueDate)}</div>
      <div class="abs" style="left:28pt;top:117pt;font-size:10.5pt;">Drawn on: ${order.drawnOn}</div>
      <div class="abs" style="left:28pt;top:131pt;font-size:10.5pt;">In favour of Tour No.: ${order.tourNo}</div>
      <div class="abs" style="left:28pt;top:145pt;font-size:10.5pt;">No. of Pax: ${order.pax}&nbsp;&nbsp;&nbsp;&nbsp;Nationality: ${order.nationality}</div>
      <div class="abs" style="left:28pt;top:159pt;font-size:10.5pt;">Tour Facilitator Details: ${order.tourFacilitatorDetails || "—"}</div>
      <div class="abs" style="left:28pt;top:173pt;font-size:10.5pt;">${tmpl.instructionLine}</div>
      <div class="abs" style="left:27.5pt;top:187pt;width:668pt;border-top:1.5pt solid #595959;"></div>

      <div class="abs" style="left:28pt;top:196pt;width:410pt;font-size:10pt;line-height:1.45;">${order.serviceDetailsHtml || ""}</div>

      ${hasArrDep ? `
      <div class="abs" style="left:451pt;top:196pt;font-size:11pt;font-weight:700;text-decoration:underline;">ARRIVAL</div>
      <div class="abs" style="left:581pt;top:196pt;font-size:11pt;font-weight:700;text-decoration:underline;">DEPARTURE</div>
      <div class="abs" style="left:451pt;top:214pt;font-size:10pt;">Date:&nbsp;&nbsp; ${fD(order.arrivalDate)}</div>
      <div class="abs" style="left:581pt;top:214pt;font-size:10pt;">Date:&nbsp;&nbsp; ${fD(order.departureDate)}</div>
      <div class="abs" style="left:451pt;top:231pt;font-size:10pt;">From:&nbsp; ${order.arrivalFrom}</div>
      <div class="abs" style="left:581pt;top:231pt;font-size:10pt;">To:&nbsp;&nbsp;&nbsp;&nbsp; ${order.departureTo}</div>
      <div class="abs" style="left:451pt;top:248pt;font-size:10pt;">By:&nbsp;&nbsp;&nbsp;&nbsp; ${order.arrivalBy}</div>
      <div class="abs" style="left:581pt;top:248pt;font-size:10pt;">By:&nbsp;&nbsp;&nbsp;&nbsp; ${order.departureBy}</div>
      <div class="abs" style="left:451pt;top:265pt;font-size:10pt;">Time:&nbsp; ${order.arrivalTime}</div>
      <div class="abs" style="left:581pt;top:265pt;font-size:10pt;">Time:&nbsp; ${order.departureTime}</div>
      ` : ""}

      <img src="${STAMP_B64}" class="abs" style="left:546pt;top:264pt;width:110pt;height:110pt;"/>

      <div class="abs arial" style="left:25pt;top:344pt;font-size:11.5pt;font-weight:700;color:${BLUE};text-decoration:underline;">${tmpl.footerBold}</div>
      <div class="abs arial" style="left:25pt;top:359pt;font-size:10pt;color:${BLUE};">${tmpl.footerLine1}</div>
      <div class="abs arial" style="left:25pt;top:372pt;font-size:10pt;color:${BLUE};">${tmpl.footerLine2}</div>
      <div class="abs" style="left:545pt;top:367pt;width:150pt;border-top:1.5pt solid ${BLUE};"></div>
      <div class="abs arial" style="left:545pt;top:371pt;font-size:11.5pt;font-weight:700;color:${BLUE};">Authorised Signatory</div>
    </body></html>`;
  };

  const printOrder = (order, orderNo, flavor = "shareable") => {
    const win = window.open("", "_blank");
    win.document.write(flavor === "printable" ? buildPrintableHTML(order, orderNo) : buildShareableHTML(order, orderNo));
    win.document.close();
    win.print();
  };

  const printActions = (order, orderNo) => [
    { id: "shareable", label: "Shareable", icon: "📤", hint: "Branded PDF, for sending as a soft copy", onSelect: () => printOrder(order, orderNo, "shareable") },
    { id: "printable", label: "Printable", icon: "🖨", hint: "Plain, A4, for printing on pre-printed stationery", onSelect: () => printOrder(order, orderNo, "printable") },
  ];

  const inp = { padding: "6px 8px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: G.white };
  const label = (t) => <div style={{ fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{t}</div>;
  const secHead = (t) => <div style={{ background: G.navy, color: "#fff", padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", margin: "14px 0 8px" }}>{t}</div>;

  // ─── Shared form (used for both a brand-new order and editing an
  // already-generated one) ────────────────────────────────────────────────
  const orderForm = (onSave, saveLabel) => (
    <div style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 10, padding: 16 }}>
      {secHead("📋 Order Details")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>{label("Issue Date")}<input type="date" style={inp} value={form.issueDate} onChange={e => setF("issueDate", e.target.value)} /></div>
        <div>
          {label("Type of Service")}
          <select style={inp} value={form.serviceType} onChange={e => setServiceType(e.target.value)} disabled={readOnly}>
            {SERVICE_TYPES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
          </select>
          {form.serviceType === "others" && <OtherInput value={form.otherServiceType} onChange={v => setF("otherServiceType", v)} placeholder="Specify service type..." />}
        </div>
        <div>{label(`Drawn on (Vendor${svcNow && svcNow.label !== "Other" ? ` — ${svcNow.label}` : ""})`)}
          <select style={inp} value={form.drawnOnVendorId} onChange={e => setVendor(e.target.value)} disabled={readOnly}>
            <option value="">Select vendor...</option>
            {vendorOptions.filter(v => v.active !== false).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {vendorOptions.length === 0 && <div style={{ fontSize: 10, color: G.gray400, marginTop: 3 }}>No vendors of this type in Vendor Master yet.</div>}
        </div>
        <div>{label("Tour No.")}<input style={inp} value={form.tourNo} onChange={e => setF("tourNo", e.target.value)} /></div>
        <div>{label("No. of Pax")}<input style={inp} value={form.pax} onChange={e => setF("pax", e.target.value)} /></div>
        <div>{label("Nationality")}<input style={inp} value={form.nationality} onChange={e => setF("nationality", e.target.value)} /></div>
        <div style={{ gridColumn: "1/-1" }}>{label("Tour Facilitator Details")}<input style={inp} value={form.tourFacilitatorDetails} onChange={e => setF("tourFacilitatorDetails", e.target.value)} placeholder="e.g. Mr. Peeyush, 9555962990" /></div>
      </div>

      {secHead("📝 Service Details")}
      <div style={{ marginBottom: 14 }}>
        <RichTextEditor value={form.serviceDetailsHtml} onChange={v => setF("serviceDetailsHtml", v)} readOnly={readOnly} />
      </div>

      {secHead("✈ Arrival / Departure (if applicable)")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.gray600, marginBottom: 8 }}>ARRIVAL</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>{label("Date")}<input type="date" style={inp} value={form.arrivalDate} onChange={e => setF("arrivalDate", e.target.value)} /></div>
            <div>{label("Time")}<input type="time" style={inp} value={form.arrivalTime} onChange={e => setF("arrivalTime", e.target.value)} /></div>
            <div>{label("From")}<input style={inp} value={form.arrivalFrom} onChange={e => setF("arrivalFrom", e.target.value)} placeholder="e.g. LEH" /></div>
            <div>{label("By")}<input style={inp} value={form.arrivalBy} onChange={e => setF("arrivalBy", e.target.value)} placeholder="e.g. Flight" /></div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.gray600, marginBottom: 8 }}>DEPARTURE</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>{label("Date")}<input type="date" style={inp} value={form.departureDate} onChange={e => setF("departureDate", e.target.value)} /></div>
            <div>{label("Time")}<input type="time" style={inp} value={form.departureTime} onChange={e => setF("departureTime", e.target.value)} /></div>
            <div>{label("To")}<input style={inp} value={form.departureTo} onChange={e => setF("departureTo", e.target.value)} placeholder="e.g. HONGKONG" /></div>
            <div>{label("By")}<input style={inp} value={form.departureBy} onChange={e => setF("departureBy", e.target.value)} placeholder="e.g. Flight" /></div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        {label("Additional Notes (internal)")}
        <textarea style={{ ...inp, minHeight: 44, resize: "vertical" }} value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Any special instructions..." />
      </div>

      {!readOnly && (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" style={{ opacity: form.drawnOnVendorId ? 1 : 0.5 }} disabled={saving || !form.drawnOnVendorId} onClick={onSave}>
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: G.white, width: 760, height: "100vh", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column" }}>

        <div style={{ background: G.navy, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>EXCHANGE ORDERS / SERVICE VOUCHERS</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: G.white, fontFamily: "'Playfair Display',serif" }}>{query.groupName || query.clientName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{query.tourFileId || query.id} · {query.destination}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none" }}>✕</button>
        </div>

        {/* Order-context bar: only when a specific EO is open, so the
            version dropdown (styled for a dark background) actually sits
            on one -- it was rendering correctly before, just invisible
            (white text on the white content pane). 2026-08-21 fix. */}
        {openOrderNo && (
          <div style={{ background: G.navyMid || "#1B3A5C", padding: "8px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button className="btn btn-ghost" style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", fontSize: 11 }} onClick={closeOpenOrder}>← Back to Repository</button>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{openOrderNo}</div>
            <div style={{ flex: 1 }} />
            <VersionDropdown versions={openVersions} viewingVersion={openViewingVersion}
              displayVersion={openViewingVersion} finalVersion={openFinalVersion}
              onSelectVersion={selectOpenVersion} onMarkFinal={onMarkOpenFinal} readOnly={readOnly} G={G} />
            <button className="btn btn-success" style={{ fontSize: 11 }} onClick={() => printOrder(form, openOrderNo, "shareable")}>📤 Shareable</button>
            <button className="btn btn-success" style={{ fontSize: 11 }} onClick={() => printOrder(form, openOrderNo, "printable")}>🖨 Printable</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${G.gray200}`, flexShrink: 0, background: G.gray50 }}>
          {[["new", "＋ Generate New"], ["repository", `📁 Repository (${eoGroups.length})`]].map(([id, lbl]) => (
            <div key={id} onClick={() => { setTab(id); if (id === "new") { setOpenOrderNo(null); setForm(emptyOrder()); } }}
              style={{ padding: "10px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: tab === id ? G.navy : G.gray600, borderBottom: tab === id ? `2px solid ${G.accent}` : "2px solid transparent" }}>
              {lbl}
            </div>
          ))}
        </div>

        {toast && (
          <div style={{ background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", padding: "6px 18px", fontSize: 11, color: "#1E40AF", flexShrink: 0, display: "flex", justifyContent: "space-between" }}>
            <span>{toast}</span><span style={{ cursor: "pointer" }} onClick={() => setToast("")}>✕</span>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {tab === "new" && orderForm(saveNewOrder, "✓ Save Exchange Order")}

          {tab === "repository" && !openOrderNo && (
            <>
              {loadingList ? (
                <div style={{ fontSize: 12, color: G.gray600 }}>Loading…</div>
              ) : eoGroups.length === 0 ? (
                <div style={{ fontSize: 12, color: G.gray600 }}>No Exchange Orders generated yet for this tour file.</div>
              ) : eoGroups.map(group => {
                const order = group.latest.order;
                const svc = SERVICE_TYPES.find(s => s.id === order.serviceType);
                return (
                  <div key={group.orderNo} style={{ background: G.white, border: `1px solid ${order.confirmed ? "#A9DFBF" : G.gray200}`, borderRadius: 8, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 20 }}>{svc?.icon}</div>
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => openOrder(group)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: G.navy }}>{group.orderNo}</span>
                        <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 10, background: order.confirmed ? "#EAFAF1" : "#FEF9E7", color: order.confirmed ? "#0E6655" : "#784212", fontWeight: 600 }}>
                          {order.confirmed ? "✓ Confirmed" : "Pending"}
                        </span>
                        <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 10, background: order.settled ? "#EAFAF1" : "#FDEDEC", color: order.settled ? "#0E6655" : "#943126", fontWeight: 600 }}>
                          {order.settled ? "✓ Settled" : "Unsettled"}
                        </span>
                        <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, background: "#EBF5FB", color: "#154360", fontWeight: 500 }}>{svc?.label}</span>
                        <span style={{ fontSize: 10, color: G.gray400 }}>v{group.latest.version}{group.finalVersion && " ★"}</span>
                      </div>
                      <div style={{ fontSize: 12, color: G.gray800, fontWeight: 500 }}>{order.drawnOn}</div>
                      <div style={{ fontSize: 11, color: G.gray600 }}>{formatDateDMY(order.issueDate) || order.issueDate} · {order.pax} pax</div>
                    </div>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => toggleGroupConfirmed(group)}>
                      {order.confirmed ? "✗ Unconfirm" : "✓ Confirm"}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => toggleGroupSettled(group)}>
                      {order.settled ? "✗ Unsettle" : "✓ Settle"}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => openOrder(group)}>✏ Open</button>
                    <ExportMenu G={G} label="Print" openDirection="down" actions={printActions(order, group.orderNo)} />
                  </div>
                );
              })}
            </>
          )}

          {tab === "repository" && openOrderNo && orderForm(saveNewVersionOfOpenOrder, "✓ Save New Version")}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${G.gray200}`, display: "flex", gap: 10, flexShrink: 0, background: G.gray50 }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}
