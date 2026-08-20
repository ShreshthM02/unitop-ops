import { useState, useEffect, useRef } from 'react';
import * as Lib from '../lib/index.js';
const {
  SERVICE_TYPES, DEFAULT_EXCHANGE_TEMPLATE, OtherInput, VersionDropdown, G, WatermarkSVG, LOGO_B64,
  loadExchangeOrdersForTourFile, loadExchangeOrderVersionHistory, nextExchangeOrderNo,
  saveExchangeOrderVersion, markExchangeOrderVersionFinal, updateExchangeOrderRowContent,
  loadFinalCostSheetVersion, extractExchangeOrderDraftsFromCostSheet,
  DEFAULT_DOC_SETTINGS, logAudit, db,
} = Lib;

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

export default function ExchangeOrderGenerator({ query, template, onClose, currentUser, readOnly }) {
  const tmpl = { ...DEFAULT_EXCHANGE_TEMPLATE, ...(template || {}) };
  const eoPrefix = (DEFAULT_DOC_SETTINGS.exchange && DEFAULT_DOC_SETTINGS.exchange.prefix) || "EO";

  const [tab, setTab] = useState("new"); // "new" | "repository"

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
    issueDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "numeric", year: "numeric" }),
    drawnOn: "",
    tourNo: query.tourFileId || query.id,
    pax: query.paxDisplay || "",
    nationality: query.nationality || "",
    tourFacilitatorDetails: "",
    serviceDetailsHtml: "",
    arrivalDate: "", arrivalFrom: "", arrivalBy: "FLIGHT", arrivalTime: "",
    departureDate: "", departureTo: "", departureBy: "FLIGHT", departureTime: "",
    notes: "",
    confirmed: false,
  });

  const [form, setForm] = useState(emptyOrder());
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // Drafts staged from "Pull from Cost Sheet" -- not yet saved as real EOs
  // (order_no is only assigned at actual save). Reviewed/completed one at a
  // time via the same form, same as any other new order.
  const [draftQueue, setDraftQueue] = useState([]);
  const [finalCostSheetVersion, setFinalCostSheetVersion] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [pullMessage, setPullMessage] = useState("");

  const refreshList = () => {
    setLoadingList(true);
    loadExchangeOrdersForTourFile(db, query.id).then(rows => {
      const byOrderNo = new Map();
      rows.forEach(r => {
        if (!byOrderNo.has(r.orderNo)) byOrderNo.set(r.orderNo, []);
        byOrderNo.get(r.orderNo).push(r);
      });
      const groups = [...byOrderNo.entries()].map(([orderNo, versions]) => {
        const finalRow = versions.find(v => v.isFinal);
        const latest = finalRow || versions[versions.length - 1];
        return { orderNo, versions, latest, finalVersion: finalRow ? finalRow.version : null };
      }).sort((a, b) => (a.latest.createdAt || "").localeCompare(b.latest.createdAt || ""));
      setEoGroups(groups);
      setLoadingList(false);
    });
  };

  useEffect(() => {
    refreshList();
    loadFinalCostSheetVersion(db, query.id).then(setFinalCostSheetVersion);
  }, [query.id]);

  const pullFromCostSheet = async () => {
    setPulling(true);
    setPullMessage("");
    try {
      if (!finalCostSheetVersion) { setPullMessage("No final Cost Sheet found for this tour yet."); setPulling(false); return; }
      const drafts = extractExchangeOrderDraftsFromCostSheet(finalCostSheetVersion.transports, finalCostSheetVersion.localHandlers);
      if (drafts.length > 0) {
        setDraftQueue(p => [...p, ...drafts.map(d => ({ ...emptyOrder(), ...d }))]);
      }
      setPullMessage(`Pulled ${drafts.length} draft order${drafts.length === 1 ? "" : "s"} from Cost Sheet v${finalCostSheetVersion.version}. Review each below before saving.`);
    } catch (e) {
      setPullMessage("Failed to pull from Cost Sheet.");
    }
    setPulling(false);
  };

  const loadDraftIntoForm = (idx) => {
    setForm(draftQueue[idx]);
    setDraftQueue(p => p.filter((_, i) => i !== idx));
  };

  // ─── Save a brand-new EO: version 1, order_no assigned now from the
  // global sequence (per 1.7 -- universally auto-incremental across every
  // tour file, not just this one). ──────────────────────────────────────
  const saveNewOrder = async () => {
    if (!form.drawnOn) return;
    setSaving(true);
    const orderNo = await nextExchangeOrderNo(db, eoPrefix);
    const { error } = await saveExchangeOrderVersion(db, orderNo, query.id, { version: 1, order: form }, currentUser?.id);
    if (error) {
      setToast(`Failed to save: ${error}`);
    } else {
      logAudit(db, query.id, currentUser?.name, `Exchange Order ${orderNo} created`);
      setToast(`Exchange Order ${orderNo} saved.`);
      setForm(emptyOrder());
      refreshList();
      setTab("repository");
    }
    setSaving(false);
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
    setForm(shown.order);
  };

  const closeOpenOrder = () => {
    setOpenOrderNo(null);
    setOpenVersions([]);
    setForm(emptyOrder());
    refreshList();
  };

  const selectOpenVersion = (v) => { setOpenViewingVersion(v.version); setForm(v.order); };

  const saveNewVersionOfOpenOrder = async () => {
    if (!openOrderNo) return;
    setSaving(true);
    const nextV = Math.max(...openVersions.map(v => v.version)) + 1;
    const { error } = await saveExchangeOrderVersion(db, openOrderNo, query.id, { version: nextV, order: form }, currentUser?.id);
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

  // Confirmed/Pending is a quick status flag, not a content edit -- updated
  // in place on the row currently shown rather than spawning a new version.
  const toggleGroupConfirmed = async (group) => {
    if (readOnly) return;
    const row = group.latest;
    const nextOrder = { ...row.order, confirmed: !row.order.confirmed };
    await updateExchangeOrderRowContent(db, row.id, nextOrder);
    refreshList();
  };

  // ─── Print (Phase A: field structure only -- the 8"x5" Shareable /
  // Printable letterhead redesign per your two templates is Phase B). ────
  const buildPrintHTML = (order, orderNo) => {
    const svc = SERVICE_TYPES.find(s => s.id === order.serviceType);
    const svcLabel = order.serviceType === "others" && order.otherServiceType ? order.otherServiceType : (svc?.label || "Service");
    const wmDataUrl = `data:image/svg+xml,${encodeURIComponent(WatermarkSVG())}`;
    const hasArrDep = order.arrivalDate || order.departureDate;

    return `<!DOCTYPE html><html><head><title>Exchange Order ${orderNo}</title>
    <style>
      @page { size: A5 landscape; margin: 8mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; padding: 0;
        background: white; width: 200mm; min-height: 138mm; position: relative; overflow: hidden; }
      .watermark { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;
        background-image: url("${wmDataUrl}"); background-repeat: repeat; opacity: 1; pointer-events: none; }
      .content { position: relative; z-index: 1; padding: 8px 12px; }
      .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #C0392B; padding-bottom: 6px; margin-bottom: 8px; }
      .co-info { text-align: right; }
      .co-name { font-size: 13px; font-weight: 900; color: #0D1B2A; }
      .co-addr { font-size: 9px; color: #555; line-height: 1.4; }
      .eo-title { font-size: 14px; font-weight: 900; color: #C0392B; text-align: center; letter-spacing: 1px; margin-bottom: 2px; }
      .svc-type { font-size: 11px; font-weight: 700; text-align: center; color: #0D1B2A; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
      .order-details { width: 100%; font-size: 12px; margin-bottom: 8px; }
      .order-details td { padding: 2px 4px; }
      .order-details td.k { width: 160px; font-weight: 700; color: #C0392B; }
      .divider { border: none; border-top: 1px solid #ddd; margin: 6px 0; }
      .body-area { font-size: 12px; }
      .body-area p { margin: 0 0 6px; }
      .body-area ul { margin: 0 0 6px 18px; padding: 0; }
      .arr-dep { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 8px; }
      .arr-dep-box h4 { font-size: 11px; font-weight: 900; text-decoration: underline; margin: 0 0 4px; color: #0D1B2A; }
      .arr-dep-box table td { padding: 1px 4px; font-size: 11px; }
      .footer-area { margin-top: 8px; border-top: 2px solid #C0392B; padding-top: 6px; display: flex; justify-content: space-between; align-items: flex-end; }
      .footer-text { font-size: 9px; color: #555; }
      .footer-text .bold { font-weight: 700; color: #C0392B; font-size: 10px; text-decoration: underline; }
      .stamp { width: 64px; height: 64px; border-radius: 50%; border: 2.5px solid #C0392B; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
      .stamp-inner { font-size: 6px; font-weight: 700; color: #C0392B; line-height: 1.3; letter-spacing: 0.3px; }
      .stamp-label { font-size: 6.5px; font-weight: 700; color: #C0392B; margin-bottom: 1px; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <div class="watermark"></div>
    <div class="content">
      <div class="header">
        <div>
          <img src="${LOGO_B64}" alt="Unitop" style="height:40px;width:auto;display:block;margin-bottom:2px;mix-blend-mode:multiply"/>
          <div style="font-size:8px;color:#C0392B;font-weight:700;letter-spacing:1px">EXCHANGE ORDER</div>
        </div>
        <div class="co-info">
          <div class="co-name">UNITOP TOURS &amp; TRAVEL PVT. LTD</div>
          <div class="co-addr">506, DDA-2, District Centre, Janakpuri, New Delhi-110058<br/>
          Ph: +91-11-25550991, 25550992, 41589897, 45503106<br/>
          Email: unitoptours@gmail.com, Web: www.unitoptours.com</div>
        </div>
      </div>
      <div class="eo-title">EXCHANGE ORDER</div>
      <div class="svc-type">${svcLabel.toUpperCase()}</div>
      <table class="order-details"><tbody>
        <tr><td class="k">Exchange Order No.:</td><td>${orderNo}</td><td class="k">Issue Date:</td><td>${order.issueDate}</td></tr>
        <tr><td class="k">Drawn on:</td><td>${order.drawnOn}</td><td class="k">Tour No.:</td><td>${order.tourNo}</td></tr>
        <tr><td class="k">No. of Pax:</td><td>${order.pax}</td><td class="k">Nationality:</td><td>${order.nationality}</td></tr>
        <tr><td class="k">Tour Facilitator Details:</td><td colspan="3">${order.tourFacilitatorDetails || "—"}</td></tr>
      </tbody></table>
      <div style="font-size:11px;margin-bottom:4px">${tmpl.instructionLine}</div>
      <hr class="divider"/>
      <div class="body-area">${order.serviceDetailsHtml || ""}</div>
      ${hasArrDep ? `<div class="arr-dep">
        <div class="arr-dep-box">
          <h4>ARRIVAL</h4>
          <table><tbody>
            <tr><td><strong>Date:</strong></td><td>${order.arrivalDate}</td></tr>
            <tr><td><strong>From:</strong></td><td>${order.arrivalFrom}</td></tr>
            <tr><td><strong>By:</strong></td><td>${order.arrivalBy}</td></tr>
            <tr><td><strong>Time:</strong></td><td>${order.arrivalTime}</td></tr>
          </tbody></table>
        </div>
        <div class="arr-dep-box">
          <h4>DEPARTURE</h4>
          <table><tbody>
            <tr><td><strong>Date:</strong></td><td>${order.departureDate}</td></tr>
            <tr><td><strong>To:</strong></td><td>${order.departureTo}</td></tr>
            <tr><td><strong>By:</strong></td><td>${order.departureBy}</td></tr>
            <tr><td><strong>Time:</strong></td><td>${order.departureTime}</td></tr>
          </tbody></table>
        </div>
      </div>` : ""}
      <div class="footer-area">
        <div class="footer-text">
          <div class="bold">${tmpl.footerBold}</div>
          <div>${tmpl.footerLine1}</div>
          <div>${tmpl.footerLine2}</div>
          <div style="margin-top:6px;font-weight:700">Authorised Signatory</div>
        </div>
        <div class="stamp">
          <div class="stamp-label">UNITOP</div>
          <div class="stamp-inner">TOURS &amp; TRAVEL<br/>PVT. LTD.</div>
          <div style="font-size:5px;color:#C0392B;margin-top:1px;font-weight:700">✦ DIGITALLY ✦</div>
          <div style="font-size:5px;color:#C0392B;font-weight:700">SIGNED &amp; VERIFIED</div>
          <div style="font-size:5px;color:#C0392B;margin-top:1px">NEW DELHI</div>
        </div>
      </div>
    </div>
    </body></html>`;
  };

  const printOrder = (order, orderNo) => {
    const win = window.open("", "_blank");
    win.document.write(buildPrintHTML(order, orderNo));
    win.document.close();
    win.print();
  };

  const inp = { padding: "6px 8px", border: `1px solid ${G.gray200}`, borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: G.white };
  const label = (t) => <div style={{ fontSize: 10, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>{t}</div>;
  const secHead = (t) => <div style={{ background: G.navy, color: "#fff", padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", margin: "14px 0 8px" }}>{t}</div>;

  // ─── Shared form (used for both a brand-new order and editing an
  // already-generated one) ────────────────────────────────────────────────
  const orderForm = (onSave, saveLabel) => (
    <div style={{ background: G.gray50, border: `1px solid ${G.gray200}`, borderRadius: 10, padding: 16 }}>
      {secHead("📋 Order Details")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>{label("Issue Date")}<input style={inp} value={form.issueDate} onChange={e => setF("issueDate", e.target.value)} /></div>
        <div>
          {label("Type of Service")}
          <select style={inp} value={form.serviceType} onChange={e => setF("serviceType", e.target.value)} disabled={readOnly}>
            {SERVICE_TYPES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
          </select>
          {form.serviceType === "others" && <OtherInput value={form.otherServiceType} onChange={v => setF("otherServiceType", v)} placeholder="Specify service type..." />}
        </div>
        <div>{label("Drawn on (Vendor / Service Provider)")}<input style={inp} value={form.drawnOn} onChange={e => setF("drawnOn", e.target.value)} placeholder="e.g. Nanking Restaurant" /></div>
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
            <div>{label("Date")}<input style={inp} value={form.arrivalDate} onChange={e => setF("arrivalDate", e.target.value)} /></div>
            <div>{label("Time")}<input style={inp} value={form.arrivalTime} onChange={e => setF("arrivalTime", e.target.value)} placeholder="e.g. 13:00" /></div>
            <div>{label("From")}<input style={inp} value={form.arrivalFrom} onChange={e => setF("arrivalFrom", e.target.value)} placeholder="e.g. LEH" /></div>
            <div>{label("By")}<select style={inp} value={form.arrivalBy} onChange={e => setF("arrivalBy", e.target.value)}>
              {["FLIGHT", "TRAIN", "ROAD", "SHIP"].map(m => <option key={m}>{m}</option>)}</select></div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: G.gray600, marginBottom: 8 }}>DEPARTURE</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>{label("Date")}<input style={inp} value={form.departureDate} onChange={e => setF("departureDate", e.target.value)} /></div>
            <div>{label("Time")}<input style={inp} value={form.departureTime} onChange={e => setF("departureTime", e.target.value)} placeholder="e.g. 21:00" /></div>
            <div>{label("To")}<input style={inp} value={form.departureTo} onChange={e => setF("departureTo", e.target.value)} placeholder="e.g. HONGKONG" /></div>
            <div>{label("By")}<select style={inp} value={form.departureBy} onChange={e => setF("departureBy", e.target.value)}>
              {["FLIGHT", "TRAIN", "ROAD", "SHIP"].map(m => <option key={m}>{m}</option>)}</select></div>
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
          <button className="btn btn-primary" style={{ opacity: form.drawnOn ? 1 : 0.5 }} disabled={saving || !form.drawnOn} onClick={onSave}>
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

          {tab === "new" && (
            <>
              {finalCostSheetVersion && (
                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#1E40AF", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1 }}>{pullMessage || `Cost Sheet v${finalCostSheetVersion.version} (final) has transport/handler data that can seed draft orders.`}</span>
                  <button onClick={pullFromCostSheet} disabled={pulling} className="btn btn-primary" style={{ fontSize: 10.5, padding: "3px 8px", flexShrink: 0 }}>
                    {pulling ? "Pulling…" : "↻ Pull from Cost Sheet"}
                  </button>
                </div>
              )}
              {draftQueue.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: G.navy, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    Pending Drafts — click to complete
                  </div>
                  {draftQueue.map((d, i) => {
                    const svc = SERVICE_TYPES.find(s => s.id === d.serviceType);
                    return (
                      <div key={i} onClick={() => loadDraftIntoForm(i)} style={{ background: G.white, border: `1px dashed ${G.gray200}`, borderRadius: 8, padding: "8px 14px", marginBottom: 6, cursor: "pointer", fontSize: 12 }}>
                        {svc?.icon} {svc?.label} — {d.serviceDetailsHtml.replace(/<[^>]+>/g, "") || "(no details yet)"}
                      </div>
                    );
                  })}
                </div>
              )}
              {orderForm(saveNewOrder, "✓ Save Exchange Order")}
            </>
          )}

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
                        <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, background: "#EBF5FB", color: "#154360", fontWeight: 500 }}>{svc?.label}</span>
                        <span style={{ fontSize: 10, color: G.gray400 }}>v{group.latest.version}{group.finalVersion && " ★"}</span>
                      </div>
                      <div style={{ fontSize: 12, color: G.gray800, fontWeight: 500 }}>{order.drawnOn}</div>
                      <div style={{ fontSize: 11, color: G.gray600 }}>{order.issueDate} · {order.pax} pax</div>
                    </div>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => toggleGroupConfirmed(group)}>
                      {order.confirmed ? "✗ Unconfirm" : "✓ Confirm"}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => openOrder(group)}>✏ Open</button>
                    <button className="btn btn-success" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => printOrder(order, group.orderNo)}>🖨 Print</button>
                  </div>
                );
              })}
            </>
          )}

          {tab === "repository" && openOrderNo && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={closeOpenOrder}>← Back to Repository</button>
                <div style={{ flex: 1 }} />
                <VersionDropdown versions={openVersions} viewingVersion={openViewingVersion}
                  displayVersion={openViewingVersion} finalVersion={openFinalVersion}
                  onSelectVersion={selectOpenVersion} onMarkFinal={onMarkOpenFinal} readOnly={readOnly} G={G} />
                <button className="btn btn-success" style={{ fontSize: 11 }} onClick={() => printOrder(form, openOrderNo)}>🖨 Print</button>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: G.navy, marginBottom: 10 }}>{openOrderNo}</div>
              {orderForm(saveNewVersionOfOpenOrder, "✓ Save New Version")}
            </>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${G.gray200}`, display: "flex", gap: 10, flexShrink: 0, background: G.gray50 }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}
