import { Fragment, useState } from 'react';
import { G, VEHICLE_TYPES } from '../lib/constants.js';
import { useDragReorder } from '../lib/useDragReorder.jsx';
import { lineCostFor, withCells, NOT_APPLIED } from '../lib/costSheetCalc.js';
import DateInput from '../lib/DateInput.jsx';

// The pricing matrix: Transport, Local Handler, Extra Services and the T/L
// surcharge on ONE grid. Every slab (group or tour leader) is a column that
// keeps its three fields -- the label shown in the quotation, the paying pax
// the costs are divided by, and the vehicle. Every cost is a row with one
// "same for all slabs" figure plus an optional different figure for any slab
// ("x" = does not apply to that slab). Prices are worked out by
// costSheetCalc.js, exactly as before; this file only edits the data.

const n = (v) => parseFloat(v) || 0;
const inr = (v) => (v ? `₹ ${Math.round(v).toLocaleString()}` : "—");
const LBL = { fontSize: 9, color: G.gray600, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 };
const TL_BG = "#FFF9E6", TL_LINE = "#F5D97A", TL_INK = "#7D6608";
const TL_KEYS = [["hotel", "Hotel"], ["singleSupp", "Single supplement"], ["meals", "Extra meals"], ["transport", "Transport"], ["monument", "Monument"], ["localHandler", "Local handler"], ["extras", "Extras"]];

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
  slabs, setSlabs, tlSlabs, setTlSlabs, transports, setTransports, localHandlers, setLocalHandlers, extras, setExtras,
  calcSlab, calcTlSlab, currency, totHotel, totMeal, handlerSS, daySS,
  onAddSlab, onAddTlSlab, onAddTransport, onAddLocalHandler, onAddExtra, onFetchTl,
}) {
  const [shut, setShut] = useState({});
  const [open, setOpen] = useState({});
  const tptDr = useDragReorder(setTransports), lhDr = useDragReorder(setLocalHandlers), exDr = useDragReorder(setExtras);
  const slabDr = useDragReorder(setSlabs), tlDr = useDragReorder(setTlSlabs);

  const slabIds = [...slabs.map((s) => s.id), ...tlSlabs.map((t) => t.id)];
  const cols = [
    ...slabs.map((s, i) => ({ id: s.id, tl: false, i, label: s.label, pax: s.foc, vehicle: s.vehicle, vehicleOther: s.vehicleOther, calc: calcSlab(s) })),
    ...tlSlabs.map((t, i) => ({ id: t.id, tl: true, i, label: t.label, pax: t.pax, vehicle: t.vehicle, vehicleOther: t.vehicleOther, calc: calcTlSlab(t), obj: t })),
  ];
  const hasTl = tlSlabs.length > 0;
  const span = cols.length + 2;

  const setSlabField = (col, f, v) => (col.tl ? setTlSlabs : setSlabs)((p) => p.map((s) => (s.id === col.id ? { ...s, [f]: v } : s)));
  const removeCol = (col) => (col.tl ? setTlSlabs : setSlabs)((p) => p.filter((s) => s.id !== col.id));
  const canRemove = (col) => col.tl || slabs.length > 1 || tlSlabs.length > 0;

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

  const setTlCost = (tl, key, raw) => {
    const s = String(raw).trim();
    const skip = /^[-–xX]$/.test(s);
    const val = skip ? (tl.costs || {})[key] ?? "" : s.replace(/[^0-9.]/g, "");
    setTlSlabs((p) => p.map((t) => (t.id === tl.id ? { ...t, costs: { ...t.costs, [key]: val }, includes: { ...t.includes, [key]: !skip } } : t)));
  };

  const cellInp = { padding: "3px 4px", border: "1px solid transparent", borderRadius: 4, fontSize: 11, fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: "transparent", textAlign: "right", minWidth: 62 };
  const inp = { padding: "4px 6px", border: `1px solid ${G.gray200}`, borderRadius: 4, fontSize: 11, fontFamily: "'Inter',sans-serif", width: "100%", outline: "none", color: G.gray800, background: G.white };
  const stickyCol = { position: "sticky", left: 0, zIndex: 2, background: G.white, width: 270 };
  const cellBorder = { borderBottom: `1px solid ${G.gray100}`, padding: "2px 4px" };

  const unitChip = (on, label, onClick, title) => (
    <button type="button" onClick={onClick} title={title} style={{ border: `1px solid ${on ? G.accent : G.gray200}`, background: on ? "#FDEDEC" : G.white, color: on ? G.accent : G.gray600, borderRadius: 10, fontSize: 10, padding: "1px 7px", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
  );

  const groupRow = (key, title, perPaxOf, count, extraNote) => (
    <tr onClick={() => setShut((s) => ({ ...s, [key]: !s[key] }))} style={{ cursor: "pointer", background: G.gray100 }}>
      <td style={{ ...stickyCol, background: G.gray100, fontSize: 11, fontWeight: 700, color: G.gray600, textTransform: "uppercase", letterSpacing: "0.4px", padding: "6px 8px" }}>
        {shut[key] ? "▸" : "▾"} {title} · {count}{extraNote ? <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 8, color: G.gray400 }}>{extraNote}</span> : null}
      </td>
      <td />
      {cols.map((c) => (<td key={c.id} style={{ textAlign: "right", fontSize: 11, fontWeight: 600, color: G.gray600, padding: "4px 8px", background: c.tl ? TL_BG : undefined }}>{perPaxOf(c)}</td>))}
    </tr>
  );

  // One cost line (transport, local handler or extra)
  const lineRow = (l, i, kind, setter, dr, ph, nameKey) => {
    const view = withCells(l, slabIds, kind);
    const isOpen = !!open[l.id];
    const hasUnit = kind !== "transport";
    const isPP = kind === "local" ? l.mode === "pp" : l.mode === "PP";
    const toggleUnit = () => patchLine(setter, kind, l.id, { mode: kind === "local" ? (isPP ? "lumpsum" : "pp") : (isPP ? "Lumpsum" : "PP") });
    const hasDetail = kind === "transport" ? !!l.notes : kind === "local" ? !!(l.dateFrom || l.dateTo || l.singleSupp || l.remarks) : false;
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
              <td key={c.id} style={{ ...cellBorder, background: c.tl ? TL_BG : undefined }}>
                <input style={{ ...cellInp, color: custom ? "#B45309" : skip ? G.gray400 : G.gray800, background: custom ? "#FEF3C7" : "transparent", fontWeight: custom ? 600 : 400 }}
                  inputMode="decimal" value={skip ? "–" : (own ?? "")} placeholder={l.cost ? String(l.cost) : "0"}
                  aria-label={`${c.label || "Slab"} cost`}
                  title={skip ? "Not applied to this slab. Type a figure to apply it." : "Leave empty to use the same-for-all figure. Type x to leave this slab out."}
                  onChange={(e) => setCell(setter, kind, l.id, c.id, parseCell(e.target.value))} />
              </td>
            );
          })}
        </tr>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 8 }}>
                  <div><div style={LBL}>From</div><DateInput style={inp} value={l.dateFrom} max={l.dateTo || undefined} onChange={(e) => patchLine(setter, kind, l.id, { dateFrom: e.target.value })} /></div>
                  <div><div style={LBL}>To</div><DateInput style={inp} value={l.dateTo} min={l.dateFrom || undefined} onChange={(e) => patchLine(setter, kind, l.id, { dateTo: e.target.value })} /></div>
                  <div><div style={LBL}>Single Supp. (₹)</div><input style={{ ...inp, textAlign: "right" }} type="number" value={l.singleSupp} onChange={(e) => patchLine(setter, kind, l.id, { singleSupp: e.target.value })} placeholder="0" /></div>
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

  const lockedRow = (label, note, valueOf) => (
    <tr>
      <td style={{ ...stickyCol, ...cellBorder, color: G.gray600, fontSize: 11, background: G.gray50 }}>{label} <span style={{ fontSize: 9, color: G.gray400 }}>{note}</span></td>
      <td style={{ ...cellBorder, background: G.gray50 }} />
      {cols.map((c) => (<td key={c.id} style={{ ...cellBorder, textAlign: "right", fontSize: 11, color: G.gray600, padding: "2px 8px", background: c.tl ? TL_BG : G.gray50 }}>{valueOf(c)}</td>))}
    </tr>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onAddSlab}>+ Add Slab</button>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onAddTlSlab}>+ Add T/L Slab</button>
        {!hasTl && <span style={{ fontSize: 10, color: G.gray400 }}>For when no FOC policy applies (small groups): T/L slabs work out how much extra the paying guests need to cover for the Tour Leader's own costs. None added doesn't affect the group slabs.</span>}
        <span style={{ fontSize: 10, color: G.gray400 }}>Each column is a slab. Type one figure in "Same for all", or a different figure under a single slab (turns amber). Type x to leave a slab out. You can paste a row of rates from Excel into "Same for all".</span>
      </div>
      <div style={{ overflow: "auto", maxHeight: "72vh", border: `1px solid ${G.gray200}`, borderRadius: 8 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: 270 + 104 + cols.length * 156, tableLayout: "fixed", fontSize: 11 }}>
          <colgroup><col style={{ width: 270 }} /><col style={{ width: 104 }} />{cols.map((c) => <col key={c.id} style={{ width: 156 }} />)}</colgroup>
          <thead>
            <tr>
              <th style={{ ...stickyCol, position: "sticky", top: 0, zIndex: 4, background: G.gray100, textAlign: "left", fontSize: 10, color: G.gray600, padding: "6px 8px", verticalAlign: "bottom" }}>Cost per paying pax</th>
              <th style={{ position: "sticky", top: 0, zIndex: 3, background: G.gray100, fontSize: 10, color: G.gray600, padding: "6px 8px", verticalAlign: "bottom", whiteSpace: "nowrap" }}>Same for all</th>
              {cols.map((c) => {
                const dr = c.tl ? tlDr : slabDr;
                return (
                  <th key={c.id} {...dr.row(c.i, { position: "sticky", top: 0, zIndex: 3, background: c.tl ? TL_BG : G.gray100, padding: "4px 6px", minWidth: 132, textAlign: "left", verticalAlign: "top", borderLeft: c.tl ? `1px dashed ${TL_LINE}` : undefined })}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span {...dr.grip(c.i)}>⠿</span>
                      <span style={{ fontSize: 9, color: c.tl ? TL_INK : G.gray400, fontWeight: 600 }}>{c.tl ? "🧑‍✈️ T/L SLAB" : `SLAB ${c.i + 1}`}</span>
                      {canRemove(c) ? <span style={{ cursor: "pointer", color: G.gray400, fontSize: 12 }} onClick={() => removeCol(c)} aria-label="Remove slab" title="Remove this slab">✕</span> : <span />}
                    </div>
                    <input style={{ ...inp, fontWeight: 600, marginTop: 2 }} value={c.label || ""} onChange={(e) => setSlabField(c, "label", e.target.value)} placeholder="Label (shown in quotation)" aria-label="Slab label" />
                    <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 3, marginTop: 3 }}>
                      <input style={{ ...inp, textAlign: "right" }} type="number" value={c.pax ?? ""} placeholder="Pax"
                        aria-label={c.tl ? "Paying pax" : "FOC (N paying)"} title="Paying pax: costs are divided by this number"
                        onChange={(e) => setSlabField(c, c.tl ? "pax" : "foc", c.tl ? e.target.value : Number(e.target.value))} />
                      <select style={inp} value={c.vehicle || ""} aria-label="Vehicle (label only)" onChange={(e) => setSlabField(c, "vehicle", e.target.value)}>
                        {c.tl && <option value="">—</option>}
                        {VEHICLE_TYPES.map((v) => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    {c.vehicle === "Others" && <input style={{ ...inp, marginTop: 3 }} value={c.vehicleOther || ""} onChange={(e) => setSlabField(c, "vehicleOther", e.target.value)} placeholder="Specify..." />}
                    <div style={{ fontSize: 9, color: G.gray400, marginTop: 2 }}>paying pax · vehicle</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groupRow("fixed", "From days & settings", () => "", 5)}
            {!shut.fixed && (<>
              {lockedRow("Accommodation", "from days", () => inr(totHotel))}
              {lockedRow("Extra meals", "from days", () => inr(totMeal))}
              {lockedRow("Monuments", "from monuments", (c) => inr(c.calc.monPP))}
              {lockedRow("Tour facilitator", "from settings", (c) => inr(c.calc.tlPP))}
              {lockedRow("Miscellaneous", "from settings", (c) => inr(c.calc.miscPP))}
            </>)}

            {groupRow("tpt", "Transport", (c) => inr(c.calc.tptPP), transports.length)}
            {!shut.tpt && transports.map((t, i) => lineRow(t, i, "transport", setTransports, tptDr, "e.g. Delhi–Agra–Jaipur circuit", "sector"))}
            {!shut.tpt && (<tr><td style={stickyCol}><button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onAddTransport}>+ Add Transport</button></td><td colSpan={cols.length + 1} /></tr>)}

            {groupRow("lh", "Local Handler", (c) => inr(c.calc.localPP), localHandlers.length, handlerSS > 0 ? `single supplement ₹${handlerSS.toLocaleString()}` : "")}
            {!shut.lh && localHandlers.map((h, i) => lineRow(h, i, "local", setLocalHandlers, lhDr, "e.g. Bodhgaya / Rajgir", "sector"))}
            {!shut.lh && (<tr><td style={stickyCol}><button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onAddLocalHandler}>+ Add Local Handler</button></td><td colSpan={cols.length + 1} /></tr>)}

            {groupRow("ex", "Extra Services", (c) => inr(c.calc.extrasPP), extras.length)}
            {!shut.ex && extras.map((e, i) => lineRow(e, i, "extra", setExtras, exDr, "e.g. Boat ride at Varanasi, Cultural show, Camel ride...", "description"))}
            {!shut.ex && (<tr><td style={stickyCol}><button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onAddExtra}>+ Add Extra Service</button></td><td colSpan={cols.length + 1} /></tr>)}

            {hasTl && (<>
              {groupRow("tls", "Tour Leader surcharge", (c) => (c.tl ? (n(c.pax) <= 0 && c.calc.surchargeTotal > 0 ? "Set paying pax" : inr(c.calc.surchargePP)) : ""), tlSlabs.length, "the T/L doesn't pay: their costs are spread over that slab's paying pax")}
              {!shut.tls && (<>
                {TL_KEYS.map(([key, label]) => (
                  <tr key={key}>
                    <td style={{ ...stickyCol, ...cellBorder, fontSize: 11, color: G.gray600 }}>{label} <span style={{ fontSize: 9, color: G.gray400 }}>tour leader's own cost, total</span></td>
                    <td style={cellBorder} />
                    {cols.map((c) => {
                      if (!c.tl) return <td key={c.id} style={{ ...cellBorder, background: G.gray50 }} />;
                      const inc = !!(c.obj.includes || {})[key];
                      const val = (c.obj.costs || {})[key] ?? "";
                      return (
                        <td key={c.id} style={{ ...cellBorder, background: TL_BG }}>
                          <input style={{ ...cellInp, color: inc ? G.gray800 : G.gray400 }} inputMode="decimal" value={inc ? val : "–"} placeholder="0" aria-label={`${label} (T/L)`}
                            title="Type x to leave this out of the surcharge" onChange={(e) => setTlCost(c.obj, key, e.target.value)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ ...stickyCol, ...cellBorder, fontSize: 10, color: G.gray600 }}>Total tour leader cost</td><td style={cellBorder} />
                  {cols.map((c) => (<td key={c.id} style={{ ...cellBorder, textAlign: "right", fontSize: 11, padding: "2px 8px", background: c.tl ? TL_BG : G.gray50 }}>{c.tl ? inr(c.calc.surchargeTotal) : ""}</td>))}
                </tr>
                <tr>
                  <td style={stickyCol} /><td />
                  {cols.map((c) => (<td key={c.id} style={{ padding: "4px", textAlign: "center", background: c.tl ? TL_BG : undefined }}>
                    {c.tl && <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => onFetchTl(c.i)}>↻ Fetch Latest Costs from Cost Sheet</button>}
                  </td>))}
                </tr>
              </>)}
            </>)}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...stickyCol, position: "sticky", bottom: 34, zIndex: 4, background: G.gray100, fontSize: 11, fontWeight: 600, padding: "0 8px", height: 34 }}>Sub-total per paying pax</td>
              <td style={{ position: "sticky", bottom: 34, zIndex: 3, background: G.gray100, height: 34 }} />
              {cols.map((c) => (<td key={c.id} style={{ position: "sticky", bottom: 34, zIndex: 3, background: c.tl ? TL_BG : G.gray100, textAlign: "right", fontSize: 11, fontWeight: 600, padding: "0 8px", height: 34 }}>{inr(c.calc.sub)}</td>))}
            </tr>
            <tr>
              <td style={{ ...stickyCol, position: "sticky", bottom: 0, zIndex: 4, background: G.navy, color: "#fff", fontSize: 11, fontWeight: 700, padding: "0 8px", height: 34 }}>Final price per pax ({currency})</td>
              <td style={{ position: "sticky", bottom: 0, zIndex: 3, background: G.navy, height: 34 }} />
              {cols.map((c) => (<td key={c.id} style={{ position: "sticky", bottom: 0, zIndex: 3, background: G.navy, color: "#fff", textAlign: "right", fontSize: 12, fontWeight: 700, padding: "0 8px", height: 34 }}>{c.calc.finalFX > 0 ? `${currency} ${c.calc.finalFX}` : "—"}</td>))}
            </tr>
          </tfoot>
        </table>
      </div>
      {handlerSS > 0 && (
        <div style={{ background: "#FEF9E7", border: "1px solid #F9E79F", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#784212", margin: "8px 0" }}>
          Local Handler Single Supplement adds up to ₹{handlerSS.toLocaleString()} — this is combined with the Day-wise Single Supplement total (₹{daySS.toLocaleString()}) in the Final Price Summary below, not shown separately there.
        </div>
      )}
    </div>
  );
}
