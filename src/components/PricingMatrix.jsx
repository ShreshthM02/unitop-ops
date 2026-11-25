import { Fragment, useState } from 'react';
import { G, VEHICLE_TYPES } from '../lib/constants.js';
import { useDragReorder } from '../lib/useDragReorder.jsx';
import { lineCostFor, withCells, NOT_APPLIED, fxRate, hasFx, ssBuild, TL_PARTS, surchargeOf } from '../lib/costSheetCalc.js';
import DateInput from '../lib/DateInput.jsx';

// The pricing matrix: Transport, Local Handler, Extra Services and the T/L
// surcharge on ONE grid. Every slab is a column that
// keeps its three fields -- the label shown in the quotation, the paying pax
// the costs are divided by, and the vehicle. Every cost is a row with one
// "same for all slabs" figure plus an optional different figure for any slab
// ("x" = does not apply to that slab). Prices are worked out by
// costSheetCalc.js, exactly as before; this file only edits the data.

const n = (v) => parseFloat(v) || 0;
const inr = (v) => (v ? `₹ ${Math.round(v).toLocaleString()}` : "—");
const LBL = { fontSize: 9, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 };
const SS_BG = "#F4F1FB";
const TL_KEYS = TL_PARTS;

// What a typed figure means: "" resets to the line's own cost, a dash or "x"
// leaves the slab out, anything else is a number.
const parseCell = (t) => {
  const s = String(t).trim();
  if (s === "") return undefined;
  if (/^[-–xX]$/.test(s)) return NOT_APPLIED;
  const d = s.replace(/[^0-9.]/g, "");
  return d === "" ? NOT_APPLIED : d;
};

export function PricingMatrix({
  slabs, setSlabs, transports, setTransports, localHandlers, setLocalHandlers, extras, setExtras,
  calcSlab, currency, roe, gst, markup, totHotel, totMeal, handlerSS, daySS,
  onAddSlab, onAddTransport, onAddLocalHandler, onAddExtra, onFetchTl,
}) {
  // Every section starts closed; the person opens what they want to work on.
  const [shut, setShut] = useState({ fixed: true, tpt: true, lh: true, ex: true, tls: true });
  const openThen = (key, fn) => () => { setShut((x) => ({ ...x, [key]: false })); fn(); };
  const ss = ssBuild(handlerSS + daySS, gst, markup, roe);
  const [open, setOpen] = useState({});
  const [fxOpen, setFxOpen] = useState({});
  const tptDr = useDragReorder(setTransports), lhDr = useDragReorder(setLocalHandlers), exDr = useDragReorder(setExtras);
  const slabDr = useDragReorder(setSlabs);

  const slabIds = slabs.map((s) => s.id);
  const cols = slabs.map((s, i) => ({ id: s.id, i, label: s.label, pax: s.foc, vehicle: s.vehicle, vehicleOther: s.vehicleOther, calc: calcSlab(s), obj: s, sur: surchargeOf(s) }));
  const anySur = cols.some((c) => c.sur.total > 0);
  const span = cols.length + 3;

  const setSlabField = (col, f, v) => setSlabs((p) => p.map((s) => (s.id === col.id ? { ...s, [f]: v } : s)));
  const removeCol = (col) => setSlabs((p) => p.filter((s) => s.id !== col.id));
  const canRemove = () => slabs.length > 1;

  const patchLine = (setter, kind, id, patch) => setter((p) => p.map((l) => (l.id === id ? { ...withCells(l, slabIds, kind), ...patch } : l)));
  const setCell = (setter, kind, id, slabId, value) => setter((p) => p.map((l) => {
    if (l.id !== id) return l;
    const b = withCells(l, slabIds, kind);
    const cells = { ...b.cells };
    if (value === undefined) delete cells[slabId]; else cells[slabId] = value;
    return { ...b, cells };
  }));
  const pasteRow = (e, setter, kind, id) => {
    const parts = e.clipboardData.getData("text").split(/[\t\n;]+/).map((x) => x.trim()).filter((x) => x !== "");
    if (parts.length < 2) return;
    e.preventDefault();
    setter((p) => p.map((l) => {
      if (l.id !== id) return l;
      const b = withCells(l, slabIds, kind);
      const cells = { ...b.cells };
      cols.forEach((c, i) => { if (parts[i] !== undefined) { const v = parseCell(parts[i].replace(/,/g, "")); if (v === undefined) delete cells[c.id]; else cells[c.id] = v; } });
      return { ...b, cells };
    }));
  };

  // A slab's tour leader surcharge: its own cost parts, spread over that slab's
  // paying pax. Typing x leaves a part out; nothing typed adds nothing.
  const setTlCost = (slab, key, raw) => {
    const s = String(raw).trim();
    const skip = /^[-–xX]$/.test(s);
    const val = skip ? (slab.tlCosts || {})[key] ?? "" : s.replace(/[^0-9.]/g, "");
    setSlabs((p) => p.map((t) => {
      if (t.id !== slab.id) return t;
      const inc = { ...(t.tlIncludes || Object.fromEntries(TL_KEYS.map(([k]) => [k, true]))) };
      inc[key] = !skip;
      return { ...t, tlCosts: { ...(t.tlCosts || {}), [key]: val }, tlIncludes: inc };
    }));
  };

  const cellInp = { padding: "3px 4px", border: "1px solid transparent", borderRadius: 4, fontSize: 11, fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: "transparent", textAlign: "right", minWidth: 62 };
  const inp = { padding: "4px 6px", border: `1px solid ${G.gray200}`, borderRadius: 4, fontSize: 11, fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: G.white };
  const stickyCol = { position: "sticky", left: 0, zIndex: 2, background: G.white, width: 270 };
  const cellBorder = { borderBottom: `1px solid ${G.gray100}`, padding: "2px 4px" };

  const unitChip = (on, label, onClick, title) => (
    <button type="button" onClick={onClick} title={title} style={{ border: `1px solid ${on ? G.accent : G.gray200}`, background: on ? "#FDEDEC" : G.white, color: on ? G.accent : G.gray600, borderRadius: 10, fontSize: 10, padding: "1px 7px", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
  );

  const groupRow = (key, title, perPaxOf, count, extraNote, ssText) => (
    <tr onClick={() => setShut((s) => ({ ...s, [key]: !s[key] }))} style={{ cursor: "pointer", background: G.gray100 }}>
      <td style={{ ...stickyCol, background: G.gray100, fontSize: 11, fontWeight: 700, color: G.gray600, textTransform: "uppercase", letterSpacing: "0.4px", padding: "6px 8px" }}>
        {shut[key] ? "▸" : "▾"} {title} · {count}{extraNote ? <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 8, color: G.gray400 }}>{extraNote}</span> : null}
      </td>
      <td />
      {cols.map((c) => (<td key={c.id} style={{ textAlign: "right", fontSize: 11, fontWeight: 600, color: G.gray600, padding: "4px 8px", }}>{perPaxOf(c)}</td>))}
      <td style={{ textAlign: "right", fontSize: 11, fontWeight: 600, color: G.gray600, padding: "4px 8px", background: SS_BG }}>{ssText || ""}</td>
    </tr>
  );

  // One cost line (transport, local handler or extra)
  const lineRow = (l, i, kind, setter, dr, ph, nameKey) => {
    const view = withCells(l, slabIds, kind);
    const isOpen = !!open[l.id];
    const fxOn = hasFx(l), fxShown = !!fxOpen[l.id];
    const setFx = (patch) => patchLine(setter, kind, l.id, { fx: patch });
    const hasUnit = kind !== "transport";
    const isPP = kind === "local" ? l.mode === "pp" : l.mode === "PP";
    const toggleUnit = () => patchLine(setter, kind, l.id, { mode: kind === "local" ? (isPP ? "lumpsum" : "pp") : (isPP ? "Lumpsum" : "PP") });
    const hasDetail = kind === "transport" ? !!l.notes : kind === "local" ? !!(l.dateFrom || l.dateTo || l.remarks) : false;
    return (
      <Fragment key={l.id}>
        <tr {...dr.row(i, {})}>
          <td style={{ ...stickyCol, ...cellBorder }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span {...dr.grip(i)}>⠿</span>
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [l.id]: !o[l.id] }))} aria-label="Details" title="More details"
                style={{ border: 0, background: "none", cursor: "pointer", color: hasDetail ? G.accent : G.gray400, fontSize: 11, padding: 0 }}>{isOpen ? "▾" : "▸"}</button>
              <input style={{ ...inp, flex: 1, minWidth: 90 }} value={l[nameKey] || ""} onChange={(e) => patchLine(setter, kind, l.id, { [nameKey]: e.target.value })} placeholder={ph} />
              {hasUnit && unitChip(isPP, isPP ? "per pax" : "group", toggleUnit, "Per pax, or one total for the group (divided by each slab's paying pax)")}
              <button type="button" aria-label="Foreign currency" onClick={() => setFxOpen((o) => ({ ...o, [l.id]: !o[l.id] }))}
                title={fxOn ? `Quoted in ${l.fx.cur} at ROE ₹${l.fx.roe}. Click to change.` : "Quoted in a foreign currency? Click to set it."}
                style={{ border: fxOn ? "1px solid #93C5FD" : "1px solid transparent", background: fxOn ? "#EFF6FF" : "none", color: fxOn ? "#1D4ED8" : G.gray400, opacity: fxOn || fxShown ? 1 : 0.55, borderRadius: 10, fontSize: 9, fontWeight: 600, padding: "1px 6px", cursor: "pointer", whiteSpace: "nowrap" }}>
                {fxOn ? `${l.fx.cur} @ ${l.fx.roe || "?"}` : "FX"}</button>
              <span style={{ cursor: "pointer", color: G.gray400, fontSize: 14 }} onClick={() => setter((p) => p.filter((x) => x.id !== l.id))} aria-label="Remove">✕</span>
            </div>
          </td>
          <td style={cellBorder}>
            <input style={{ ...cellInp, border: `1px solid ${G.gray200}`, background: G.white }} inputMode="decimal" value={l.cost ?? ""} placeholder="0" aria-label="Cost, same for every slab"
              onChange={(e) => patchLine(setter, kind, l.id, { cost: e.target.value.replace(/[^0-9.]/g, "") })}
              onPaste={(e) => pasteRow(e, setter, kind, l.id)} />
          </td>
          {cols.map((c) => {
            const own = (view.cells || {})[c.id];
            const skip = own === NOT_APPLIED;
            const custom = !skip && own !== undefined && String(own).trim() !== "";
            return (
              <td key={c.id} style={{ ...cellBorder, background: undefined }}>
                <input style={{ ...cellInp, color: custom ? "#B45309" : skip ? G.gray400 : G.gray800, background: custom ? "#FEF3C7" : "transparent", fontWeight: custom ? 600 : 400 }}
                  inputMode="decimal" value={skip ? "–" : (own ?? "")} placeholder={l.cost ? String(l.cost) : "0"}
                  aria-label={`${c.label || "Slab"} cost`}
                  title={skip ? "Not applied to this slab. Type a figure to apply it." : "Leave empty to use the same-for-all figure. Type x to leave this slab out."}
                  onChange={(e) => setCell(setter, kind, l.id, c.id, parseCell(e.target.value))} />
              </td>
            );
          })}
          <td style={{ ...cellBorder, background: SS_BG }}>
            {kind === "local" ? (
              <input style={{ ...cellInp, border: `1px solid ${G.gray200}`, background: G.white }} inputMode="decimal" value={l.singleSupp ?? ""} placeholder="0" aria-label="Single supplement, this handler"
                title={`Single room supplement charged by this handler${fxOn ? ` (in ${l.fx.cur})` : ""}`}
                onChange={(e) => patchLine(setter, kind, l.id, { singleSupp: e.target.value.replace(/[^0-9.]/g, "") })} />
            ) : null}
          </td>
        </tr>
        {fxShown && (
          <tr>
            <td colSpan={span} style={{ background: "#EFF6FF", padding: "6px 10px", borderBottom: `1px solid ${G.gray200}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: G.gray600 }}>
                <span style={{ fontWeight: 600, color: "#1D4ED8" }}>Quoted in</span>
                <select style={{ ...inp, width: 96 }} aria-label="Quoted currency" value={fxOn ? l.fx.cur : ""}
                  onChange={(e) => { const cur = e.target.value; if (!cur) setFx(undefined); else setFx({ cur, roe: cur === currency && roe ? String(roe) : (l.fx && l.fx.roe) || "" }); }}>
                  <option value="">₹ Rupees</option>
                  {[...new Set([currency, "US $", "EUR", "GBP", "AED", "AUD", "SGD", "THB", "JPY", "CHF"])].filter((c) => c && c !== "INR" && c !== "Other").map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {fxOn && (<>
                  <span>ROE ₹</span>
                  <input style={{ ...inp, width: 70, textAlign: "right" }} inputMode="decimal" aria-label="ROE for this line" value={l.fx.roe || ""} placeholder="per 1"
                    onChange={(e) => setFx({ cur: l.fx.cur, roe: e.target.value.replace(/[^0-9.]/g, "") })} />
                  <span>per 1 {l.fx.cur}. Figures on this row are in {l.fx.cur}; they are added to the total as rupees.</span>
                  {n(l.cost) > 0 && n(l.fx.roe) > 0 && <b style={{ color: "#1D4ED8" }}>{l.fx.cur} {n(l.cost).toLocaleString()} = {inr(n(l.cost) * fxRate(l))}</b>}
                </>)}
                {!fxOn && <span>Pick a currency if this cost was quoted in it. Leave as ₹ for everything else.</span>}
              </div>
            </td>
          </tr>
        )}
        {isOpen && (
          <tr>
            <td colSpan={span} style={{ background: G.gray50, padding: "8px 10px", borderBottom: `1px solid ${G.gray200}` }}>
              {kind === "transport" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                  <div><div style={LBL}>Vehicle Type</div>
                    <select style={inp} value={l.vehicleType} onChange={(e) => patchLine(setter, kind, l.id, { vehicleType: e.target.value })}>{VEHICLE_TYPES.map((v) => <option key={v}>{v}</option>)}</select>
                    {l.vehicleType === "Others" && <input style={{ ...inp, marginTop: 4 }} value={l.vehicleOther || ""} onChange={(e) => patchLine(setter, kind, l.id, { vehicleOther: e.target.value })} placeholder="Specify vehicle type..." />}</div>
                  <div><div style={LBL}>Notes</div><input style={inp} value={l.notes || ""} onChange={(e) => patchLine(setter, kind, l.id, { notes: e.target.value })} placeholder="Any notes on this transport segment" /></div>
                </div>)}
              {kind === "local" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 8 }}>
                  <div><div style={LBL}>From</div><DateInput style={inp} value={l.dateFrom} max={l.dateTo || undefined} onChange={(e) => patchLine(setter, kind, l.id, { dateFrom: e.target.value })} /></div>
                  <div><div style={LBL}>To</div><DateInput style={inp} value={l.dateTo} min={l.dateFrom || undefined} onChange={(e) => patchLine(setter, kind, l.id, { dateTo: e.target.value })} /></div>
                  <div><div style={LBL}>Remarks</div><input style={inp} value={l.remarks || ""} onChange={(e) => patchLine(setter, kind, l.id, { remarks: e.target.value })} placeholder="Any notes on this handler/sector" /></div>
                </div>)}
              {kind === "extra" && (
                <div style={{ maxWidth: 260 }}><div style={LBL}>Mode</div>
                  <select style={inp} value={l.mode} onChange={(e) => patchLine(setter, kind, l.id, { mode: e.target.value })}>{["PP", "Lumpsum", "Per Vehicle", "Per Group"].map((m) => <option key={m}>{m}</option>)}</select></div>)}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const lockedRow = (label, note, valueOf, ssText) => (
    <tr>
      <td style={{ ...stickyCol, ...cellBorder, color: G.gray600, fontSize: 11, background: G.gray50 }}>{label} <span style={{ fontSize: 9, color: G.gray400 }}>{note}</span></td>
      <td style={{ ...cellBorder, background: G.gray50 }} />
      {cols.map((c) => (<td key={c.id} style={{ ...cellBorder, textAlign: "right", fontSize: 11, color: G.gray600, padding: "2px 8px", background: G.gray50 }}>{valueOf(c)}</td>))}
      <td style={{ ...cellBorder, textAlign: "right", fontSize: 11, color: G.gray600, padding: "2px 8px", background: SS_BG }}>{ssText || ""}</td>
    </tr>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onAddSlab}>+ Add Slab</button>
        <span style={{ fontSize: 10, color: G.gray400 }}>Each column is a slab. Type one figure in "Same for all", or a different figure under a single slab (turns amber). Type x to leave a slab out. You can paste a row of rates from Excel into "Same for all".</span>
      </div>
      <div style={{ overflow: "auto", maxHeight: "72vh", border: `1px solid ${G.gray200}`, borderRadius: 8 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: 270 + 104 + cols.length * 156 + 112, tableLayout: "fixed", fontSize: 11 }}>
          <colgroup><col style={{ width: 270 }} /><col style={{ width: 104 }} />{cols.map((c) => <col key={c.id} style={{ width: 156 }} />)}<col style={{ width: 112 }} /></colgroup>
          <thead>
            <tr>
              <th style={{ ...stickyCol, position: "sticky", top: 0, zIndex: 4, background: G.gray100, textAlign: "left", fontSize: 10, color: G.gray600, padding: "6px 8px", verticalAlign: "bottom" }}>Cost per paying pax</th>
              <th style={{ position: "sticky", top: 0, zIndex: 3, background: G.gray100, fontSize: 10, color: G.gray600, padding: "6px 8px", verticalAlign: "bottom", whiteSpace: "nowrap" }}>Same for all</th>
              {cols.map((c) => {
                const dr = slabDr;
                return (
                  <th key={c.id} {...dr.row(c.i, { position: "sticky", top: 0, zIndex: 3, background: G.gray100, padding: "4px 6px", minWidth: 132, textAlign: "left", verticalAlign: "top" })}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span {...dr.grip(c.i)}>⠿</span>
                      <span style={{ fontSize: 9, color: G.gray400, fontWeight: 600 }}>{`SLAB ${c.i + 1}`}</span>
                      {canRemove() ? <span style={{ cursor: "pointer", color: G.gray400, fontSize: 12 }} onClick={() => removeCol(c)} aria-label="Remove slab" title="Remove this slab">✕</span> : <span />}
                    </div>
                    <input style={{ ...inp, fontWeight: 600, marginTop: 2 }} value={c.label || ""} onChange={(e) => setSlabField(c, "label", e.target.value)} placeholder="Label (shown in quotation)" aria-label="Slab label" />
                    <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 3, marginTop: 3 }}>
                      <input style={{ ...inp, textAlign: "right" }} type="number" value={c.pax ?? ""} placeholder="Pax"
                        aria-label="FOC (N paying)" title="Paying pax: costs are divided by this number"
                        onChange={(e) => setSlabField(c, "foc", Number(e.target.value))} />
                      <select style={inp} value={c.vehicle || ""} aria-label="Vehicle (label only)" onChange={(e) => setSlabField(c, "vehicle", e.target.value)}>
                        {VEHICLE_TYPES.map((v) => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    {c.vehicle === "Others" && <input style={{ ...inp, marginTop: 3 }} value={c.vehicleOther || ""} onChange={(e) => setSlabField(c, "vehicleOther", e.target.value)} placeholder="Specify..." />}
                    <div style={{ fontSize: 9, color: G.gray400, marginTop: 2 }}>paying pax · vehicle</div>
                  </th>
                );
              })}
              <th style={{ position: "sticky", top: 0, zIndex: 3, background: SS_BG, padding: "4px 8px", textAlign: "right", verticalAlign: "bottom", fontSize: 10, color: G.gray600 }}>
                <div style={{ fontWeight: 700, color: G.gray800, fontSize: 11 }}>Single supp.</div>
                <div style={{ fontSize: 9, color: G.gray400, fontWeight: 400 }}>per single room, ₹ · not divided by pax</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {groupRow("fixed", "From days & settings", (c) => inr(totHotel + totMeal + c.calc.monPP + c.calc.tlPP + c.calc.miscPP), 5, "", daySS > 0 ? inr(daySS) : "")}
            {!shut.fixed && (<>
              {lockedRow("Accommodation", "from days", () => inr(totHotel), daySS > 0 ? inr(daySS) : "")}
              {lockedRow("Extra meals", "from days", () => inr(totMeal))}
              {lockedRow("Monuments", "from monuments", (c) => inr(c.calc.monPP))}
              {lockedRow("Tour facilitator", "from settings", (c) => inr(c.calc.tlPP))}
              {lockedRow("Miscellaneous", "from settings", (c) => inr(c.calc.miscPP))}
            </>)}

            {groupRow("tpt", "Transport", (c) => inr(c.calc.tptPP), transports.length)}
            {!shut.tpt && transports.map((t, i) => lineRow(t, i, "transport", setTransports, tptDr, "e.g. Delhi–Agra–Jaipur circuit", "sector"))}
            {!shut.tpt && (<tr><td style={stickyCol}><button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={openThen("tpt", onAddTransport)}>+ Add Transport</button></td><td colSpan={cols.length + 2} /></tr>)}

            {groupRow("lh", "Local Handler", (c) => inr(c.calc.localPP), localHandlers.length, "", handlerSS > 0 ? inr(handlerSS) : "")}
            {!shut.lh && localHandlers.map((h, i) => lineRow(h, i, "local", setLocalHandlers, lhDr, "e.g. Bodhgaya / Rajgir", "sector"))}
            {!shut.lh && (<tr><td style={stickyCol}><button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={openThen("lh", onAddLocalHandler)}>+ Add Local Handler</button></td><td colSpan={cols.length + 2} /></tr>)}

            {groupRow("ex", "Extra Services", (c) => inr(c.calc.extrasPP), extras.length)}
            {!shut.ex && extras.map((e, i) => lineRow(e, i, "extra", setExtras, exDr, "e.g. Boat ride at Varanasi, Cultural show, Camel ride...", "description"))}
            {!shut.ex && (<tr><td style={stickyCol}><button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={openThen("ex", onAddExtra)}>+ Add Extra Service</button></td><td colSpan={cols.length + 2} /></tr>)}

            {groupRow("tls", "Tour leader surcharge", (c) => (c.sur.total > 0 ? (n(c.pax) <= 0 ? "Set paying pax" : inr(c.calc.surchargePP)) : ""), cols.filter((c) => c.sur.total > 0).length || "none used", "")}
            {!shut.tls && (<>
              {TL_KEYS.map(([key, label]) => (
                <tr key={key}>
                  <td style={{ ...stickyCol, ...cellBorder, fontSize: 11, color: G.gray600 }}>{label} <span style={{ fontSize: 9, color: G.gray400 }}>tour leader's own cost, total</span></td>
                  <td style={cellBorder} />
                  {cols.map((c) => {
                    const inc = c.obj.tlIncludes ? !!c.obj.tlIncludes[key] : true;
                    const val = (c.obj.tlCosts || {})[key] ?? "";
                    return (
                      <td key={c.id} style={cellBorder}>
                        <input style={{ ...cellInp, color: inc ? G.gray800 : G.gray400 }} inputMode="decimal" value={inc ? val : "–"} placeholder="0" aria-label={`${label} (tour leader)`}
                          title="Type x to leave this out of the surcharge" onChange={(e) => setTlCost(c.obj, key, e.target.value)} />
                      </td>
                    );
                  })}
                <td style={{ background: SS_BG }} /></tr>
              ))}
              <tr>
                <td style={{ ...stickyCol, ...cellBorder, fontSize: 10, color: G.gray600 }}>Total tour leader cost</td><td style={cellBorder} />
                {cols.map((c) => (<td key={c.id} style={{ ...cellBorder, textAlign: "right", fontSize: 11, padding: "2px 8px", background: G.gray50 }}>{c.sur.total > 0 ? inr(c.sur.total) : ""}</td>))}
              <td style={{ background: SS_BG }} /></tr>
              <tr>
                <td style={stickyCol} /><td />
                {cols.map((c) => (<td key={c.id} style={{ padding: "4px", textAlign: "center" }}>
                  <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => onFetchTl(c.id)}>↻ Fetch latest costs</button>
                </td>))}
              <td style={{ background: SS_BG }} /></tr>
            </>)}
          </tbody>
          <tfoot>
            {[
              ["Sub-total per paying pax", "sub", true],
              [`GST ${gst}%`, "tax"],
              ["After tax", "afterTax"],
              [`Markup ${markup}%`, "markupAmt"],
              ["Selling price (₹)", "sellingINR", true],
            ].map(([label, key, bold]) => (
              <tr key={key}>
                <td style={{ ...stickyCol, ...cellBorder, background: G.gray50, fontSize: 11, fontWeight: bold ? 700 : 400, color: G.gray800 }}>{label}</td>
                <td style={{ ...cellBorder, background: G.gray50 }} />
                {cols.map((c) => (<td key={c.id} style={{ ...cellBorder, background: G.gray50, textAlign: "right", fontSize: 11, fontWeight: bold ? 700 : 400, padding: "2px 8px" }}>{inr(c.calc[key])}</td>))}
                <td style={{ ...cellBorder, background: SS_BG, textAlign: "right", fontSize: 11, fontWeight: bold ? 700 : 400, padding: "2px 8px" }}>{inr(ss[key])}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...stickyCol, position: "sticky", bottom: 0, zIndex: 4, background: G.navy, color: "#fff", fontSize: 11, fontWeight: 700, padding: "0 8px", height: 34 }}>Final price per pax ({currency})</td>
              <td style={{ position: "sticky", bottom: 0, zIndex: 3, background: G.navy, height: 34 }} />
              {cols.map((c) => (<td key={c.id} style={{ position: "sticky", bottom: 0, zIndex: 3, background: G.navy, color: "#fff", textAlign: "right", fontSize: 12, fontWeight: 700, padding: "0 8px", height: 34 }}>{c.calc.finalFX > 0 ? `${currency} ${c.calc.finalFX}` : "—"}</td>))}
              <td style={{ position: "sticky", bottom: 0, zIndex: 3, background: G.navy, color: "#fff", textAlign: "right", fontSize: 12, fontWeight: 700, padding: "0 8px", height: 34 }} title="Single supplement, per single room">{ss.finalFX > 0 ? `${currency} ${ss.finalFX}` : "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
