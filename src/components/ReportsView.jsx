import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, isIsoDateString, formatDateDMY, db, entryINR, loadAllExchangeOrders, groupExchangeOrderVersions } = Lib;

const filterSelectStyle = { padding:"4px 8px", border:`1px solid ${G.gray200}`, borderRadius:5, fontSize:11,
  fontFamily:"'Inter',sans-serif", color:G.gray800, background:G.white, outline:"none" };

export default function ReportsView({ queries, payments, currentUser, vendors, tourExecutions, onOpenQuery }) {
  const can = useCan(currentUser);
  const [selectedReport, setSelectedReport] = useState(null);
  const [filterCat, setFilterCat] = useState("All");
  const [search, setSearch] = useState("");
  // Exchange Orders live in their own table, not part of the queries/
  // payments props this view already has -- loaded on demand only when
  // that specific report is opened, not app-wide.
  const [exchangeOrders, setExchangeOrders] = useState([]);
  const [eoLoading, setEoLoading] = useState(false);
  useEffect(() => {
    if (selectedReport?.id !== "exchange_order_register") return;
    setEoLoading(true);
    loadAllExchangeOrders(db).then(rows => { setExchangeOrders(rows); setEoLoading(false); });
  }, [selectedReport?.id]);

  // 1.1: filters on top, applied to the underlying queries BEFORE any
  // report's own data logic runs -- one filter set drives every report
  // uniformly (including aggregated ones like Sector Performance: "only
  // Agent X's queries" changes what gets aggregated, not just which
  // output rows show). Deliberately persists across switching between
  // reports rather than resetting each time, so "show me everything for
  // this agent" stays in effect while browsing.
  // 1.1, reworked per direct feedback: a single generic filter bar applied
  // uniformly to every report was actively wrong for several of them --
  // filtering Agent-wise Revenue BY agent collapses its own point to one
  // row, Sector Performance has the same problem with Sector, Exchange
  // Order Register showed Sector/Agent/Status controls that silently did
  // nothing (it has neither concept), and Tour Facilitator Report /
  // Nationality Mix had no way to filter by the one thing that's actually
  // their own subject. Each report now declares which filters apply to it
  // (report.filters in constants.js); the bar renders only those.
  const [rf, setRf] = useState({ sector:"", agent:"", status:"", dateFrom:"", dateTo:"", nationality:"", cancellationReason:"", facilitator:"", vendor:"" });
  const sectorOptions = [...new Set(queries.map(q=>q.destination||q.sector).filter(Boolean))].sort();
  const agentOptions = [...new Set(queries.map(q=>q.agentCompany).filter(Boolean))].sort();
  const statusOptions = [...new Set(queries.map(q=>q.cancelled?"CANCELLED":q.status).filter(Boolean))].sort();
  const nationalityOptions = [...new Set(queries.map(q=>q.nationality).filter(Boolean))].sort();
  const cancellationReasonOptions = [...new Set(queries.map(q=>q.cancellationReason).filter(Boolean))].sort();
  const facilitatorOptions = [...new Set((vendors||[]).filter(v=>v.type==="Tour Facilitator").map(v=>v.name).filter(Boolean))].sort();
  const vendorOptions = [...new Set((vendors||[]).map(v=>v.name).filter(Boolean))].sort();

  // Query-level filters -- reduce the underlying queries before any
  // report's own data logic runs, so an aggregated report (Sector
  // Performance, Seasonality) aggregates over the filtered set, not just
  // hides output rows after the fact. Scoped to the CURRENT report's own
  // declared filters -- e.g. if Sector was set while viewing Query Log,
  // then the user switches to Sector Performance (which doesn't show a
  // Sector control), that filter must NOT silently keep narrowing Sector
  // Performance's aggregation with no visible control explaining why.
  const filterQueriesForReport = (reportId) => {
    const applicable = ALL_REPORTS.find(r=>r.id===reportId)?.filters || [];
    return queries.filter(q => {
      if (applicable.includes("sector") && rf.sector && (q.destination||q.sector)!==rf.sector) return false;
      if (applicable.includes("agent") && rf.agent && q.agentCompany!==rf.agent) return false;
      if (applicable.includes("status") && rf.status && (q.cancelled?"CANCELLED":q.status)!==rf.status) return false;
      if (applicable.includes("dateRange") && rf.dateFrom && (!q.date || q.date < rf.dateFrom)) return false;
      if (applicable.includes("dateRange") && rf.dateTo && (!q.date || q.date > rf.dateTo)) return false;
      if (applicable.includes("nationality") && rf.nationality && q.nationality!==rf.nationality) return false;
      if (applicable.includes("cancellationReason") && rf.cancellationReason && q.cancellationReason!==rf.cancellationReason) return false;
      return true;
    });
  };
  // Row-level filters -- Facilitator and Vendor don't reduce cleanly to a
  // queries.filter(): a single query can have several facilitators (only
  // some of which should survive the filter), and Exchange Order Register
  // isn't query-shaped at the source at all. Applied to the report's own
  // OUTPUT rows instead, only for the reports that declare them.
  const applyRowLevelFilters = (reportId, rows) => {
    let out = rows;
    if (rf.facilitator && reportId==="tour_facilitator_report") out = out.filter(r=>r["Facilitator"]===rf.facilitator);
    if (rf.vendor && reportId==="exchange_order_register") out = out.filter(r=>r["Vendor"]===rf.vendor);
    return out;
  };
  const rfActiveForReport = (applicable) => applicable.some(k => {
    if (k==="dateRange") return !!(rf.dateFrom||rf.dateTo);
    return !!rf[k];
  });
  const clearFilters = () => setRf({ sector:"", agent:"", status:"", dateFrom:"", dateTo:"", nationality:"", cancellationReason:"", facilitator:"", vendor:"" });
  const allQueriesUnfiltered = queries; // exchange_order_register resolves its Tour File Number against every query, not just filtered ones -- EO Register has no Sector/Status of its own to filter by; captured here, outside getReportData, so the shadowed `queries` inside it doesn't hide this reference too

  if(!can("pl_report")) return (
    <div style={{textAlign:"center",padding:48,color:G.gray400}}>
      <div style={{fontSize:32,marginBottom:8}}>🔒</div>
      <div style={{fontSize:14}}>Reports access restricted. Contact your admin.</div>
    </div>
  );

  const categories = ["All",...[...new Set(ALL_REPORTS.map(r=>r.cat))]];
  const filtered = ALL_REPORTS.filter(r=>{
    const matchCat = filterCat==="All"||r.cat===filterCat;
    const matchSearch = !search||r.label.toLowerCase().includes(search.toLowerCase())||r.desc.toLowerCase().includes(search.toLowerCase());
    return matchCat&&matchSearch;
  });

  const getReportData = (id) => {
    const queries = filterQueriesForReport(id); // shadows the outer prop -- every case below becomes filter-aware automatically, scoped to only the filters THIS report actually declares
    const now = new Date();
    switch(id) {
      case "active_pipeline":
        return queries.filter(q=>!q.cancelled&&q.status!=="completed").map(q=>({
          "ID":q.tourFileId||q.id,"Group":q.groupName||q.clientName,"Agent":q.agentCompany||"—",
          "Sector":q.destination||q.sector||"—","Status":q.status,"Travel Date":q.travelDate||"TBC","Pax":q.paxDisplay||"—",
          __queryRef:q,
        }));
      case "query_log":
        return queries.map(q=>({
          "Query ID":q.id,"Date":q.date,"Group":q.groupName||q.clientName,
          "Agent":q.agentCompany||"—","Sector":q.destination||q.sector||"—",
          "Status":q.cancelled?"CANCELLED":q.status,"Tour File":q.tourFileId||"—",
          __queryRef:q,
        }));
      case "cancellations":
        return queries.filter(q=>q.cancelled).map(q=>({
          "Query ID":q.id,"Group":q.groupName||q.clientName,"Agent":q.agentCompany||"—",
          "Sector":q.destination||q.sector||"—","Stage":q.status,"Reason":q.cancellationReason||"—",
          __queryRef:q,
        }));
      case "pl_summary":
        return queries.filter(q=>!q.cancelled).map(q=>{
          const pt=payments[q.id];
          const tv=(parseFloat(pt?.tourValue)||0)*(parseFloat(pt?.roeUsed)||1);
          const rc=(pt?.entries||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
          const co=((pt?.outgoing||[]).filter(e=>["cash","voucher"].includes(e.paymentType||"cash")).reduce((s,e)=>s+(parseFloat(e.amount)||0),0));
          return {"Tour File":q.tourFileId||q.id,"Group":q.groupName||q.clientName,"Sector":q.destination||q.sector||"—",
            "Tour Value (₹)":Math.round(tv).toLocaleString(),"Received (₹)":Math.round(rc).toLocaleString(),
            "Costs (₹)":Math.round(co).toLocaleString(),"Profit (₹)":Math.round(tv-co).toLocaleString(),
            "Margin":tv>0?Math.round((tv-co)/tv*100)+"%":"—",__queryRef:q};
        });
      case "agent_revenue": {
        const aMap={};
        queries.filter(q=>!q.cancelled).forEach(q=>{
          const ag=q.agentCompany||"Direct";
          if(!aMap[ag]) aMap[ag]={agent:ag,queries:0,tourFiles:0,rev:0,rec:0};
          aMap[ag].queries++;
          if(q.tourFileId) aMap[ag].tourFiles++;
          const pt=payments[q.id];
          aMap[ag].rev+=(parseFloat(pt?.tourValue)||0)*(parseFloat(pt?.roeUsed)||1);
          aMap[ag].rec+=(pt?.entries||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
        });
        return Object.values(aMap).sort((a,b)=>b.rev-a.rev).map(a=>({
          "Agent":a.agent,"Queries":a.queries,"Tour Files":a.tourFiles,
          "Revenue (₹)":Math.round(a.rev).toLocaleString(),"Received (₹)":Math.round(a.rec).toLocaleString(),
          "Outstanding (₹)":Math.round(a.rev-a.rec).toLocaleString(),
          __chartLabel:a.agent, __chartValue:Math.round(a.rev),
        }));
      }
      case "tour_facilitator_report": {
        const rows = [];
        queries.filter(q=>!q.cancelled).forEach(q => {
          const facilitators = tourExecutions?.[q.id]?.facilitators || [];
          facilitators.forEach(f => {
            if (!f.vendorId) return; // skip rows where no facilitator was actually assigned yet
            const vendor = (vendors||[]).find(v=>v.id===f.vendorId);
            // {Arrival Date} - {Departure Date} in dd/mm/yyyy, and Days
            // computed from those same two dates -- not the separately
            // hand-entered `nights` field, which can drift out of sync
            // with the actual travel dates. formatDateDMY renders
            // dd-mm-yyyy with hyphens; slash-swap to match the dd/mm/yyyy
            // spec here, same as the Payment Receipt's date range.
            const fromRaw = q.travelDate, toRaw = q.travelDateTo;
            const fromIsDate = isIsoDateString(fromRaw), toIsDate = isIsoDateString(toRaw);
            const dmySlash = (iso) => formatDateDMY(iso).replace(/-/g, "/");
            let travelDateDisplay = "TBC", days = "—";
            if (fromIsDate && toIsDate) {
              travelDateDisplay = `${dmySlash(fromRaw)} - ${dmySlash(toRaw)}`;
              const msPerDay = 24*60*60*1000;
              const dayCount = Math.round((new Date(toRaw) - new Date(fromRaw)) / msPerDay) + 1;
              days = dayCount > 0 ? dayCount : "—";
            } else if (fromIsDate) {
              travelDateDisplay = dmySlash(fromRaw);
            } else if (q.travelMonth) {
              travelDateDisplay = q.travelMonth;
            }
            rows.push({
              "Facilitator": vendor?.name || "Unknown",
              "Tour File": q.tourFileId || q.id,
              "Group / Client": q.groupName || q.clientName || "—",
              "Sector": f.sector || q.destination || q.sector || "—",
              "Travel Date": travelDateDisplay,
              "Days": days,
              __queryRef:q,
            });
          });
        });
        return rows.sort((a,b)=>a["Facilitator"].localeCompare(b["Facilitator"]));
      }
      case "sector_analysis": {
        const sMap={};
        queries.filter(q=>!q.cancelled).forEach(q=>{
          const s=q.destination||q.sector||"Unknown";
          if(!sMap[s]) sMap[s]={sector:s,queries:0,tourFiles:0,rev:0};
          sMap[s].queries++; if(q.tourFileId) sMap[s].tourFiles++;
          const pt=payments[q.id]; sMap[s].rev+=(parseFloat(pt?.tourValue)||0)*(parseFloat(pt?.roeUsed)||1);
        });
        return Object.values(sMap).sort((a,b)=>b.queries-a.queries).map(s=>({
          "Sector":s.sector,"Queries":s.queries,"Tour Files":s.tourFiles,
          "Revenue (₹)":Math.round(s.rev).toLocaleString(),
          "Conversion":s.queries>0?Math.round(s.tourFiles/s.queries*100)+"%":"—",
          __chartLabel:s.sector, __chartValue:s.queries,
        }));
      }
      case "nationality_mix": {
        const nMap={};
        queries.filter(q=>!q.cancelled&&q.nationality).forEach(q=>{nMap[q.nationality]=(nMap[q.nationality]||0)+1;});
        return Object.entries(nMap).sort((a,b)=>b[1]-a[1]).map(([nat,cnt])=>({"Nationality/Market":nat,"Queries":cnt,__chartLabel:nat,__chartValue:cnt}));
      }
      case "seasonality": {
        const nowD=new Date();
        return Array.from({length:12},(_,i)=>{
          const d=new Date(nowD.getFullYear(),nowD.getMonth()-11+i,1);
          const label=d.toLocaleDateString("en-IN",{month:"short",year:"2-digit"});
          // Queries/Tour Files: by query CREATION month -- when the
          // demand came in.
          const monthQueries = queries.filter(q=>{const qd=new Date(q.date||"");return qd.getFullYear()===d.getFullYear()&&qd.getMonth()===d.getMonth()&&!q.cancelled;});
          const count = monthQueries.length;
          const tourFiles = monthQueries.filter(q=>q.tourFileId).length;
          // Operated: by TRAVEL date month and status===completed -- when
          // the tour actually ran, not when it was booked. A different
          // axis from the two counts above, and often a different month
          // entirely for a tour booked well ahead of its travel date.
          const operated = queries.filter(q=>{
            if(q.cancelled||q.status!=="completed"||!isIsoDateString(q.travelDate)) return false;
            const td=new Date(q.travelDate);
            return td.getFullYear()===d.getFullYear()&&td.getMonth()===d.getMonth();
          }).length;
          return {"Month":label,"Queries":count,"Tour Files":tourFiles,"Operated":operated};
        });
      }
      case "exchange_order_register": {
        const dmySlash = (iso) => isIsoDateString(iso) ? formatDateDMY(iso).replace(/-/g, "/") : (iso||"—");
        return groupExchangeOrderVersions(exchangeOrders).map(g => {
          const query = allQueriesUnfiltered.find(q=>q.id===g.latest.queryId);
          const vendor = (vendors||[]).find(v=>v.id===g.latest.vendorId);
          return {
            "Exchange Order No.": g.orderNo,
            "Issue Date": dmySlash(g.latest.order?.issueDate),
            "Tour File Number": query?.tourFileId || g.latest.order?.tourNo || query?.id || "—",
            "Vendor": vendor?.name || g.latest.order?.drawnOn || "—",
            __queryRef:query,
          };
        }).sort((a,b)=>a["Exchange Order No."].localeCompare(b["Exchange Order No."]));
      }
      case "nationality_master": {
        const dmySlash = (iso) => isIsoDateString(iso) ? formatDateDMY(iso).replace(/-/g, "/") : (iso||"—");
        return queries.filter(q=>q.nationality).map(q=>({
          "Nationality / Market": q.nationality,
          "Query ID": q.id,
          "Tour File": q.tourFileId || "—",
          "Group / Client": q.groupName || q.clientName || "—",
          "Date of Generation": dmySlash(q.date),
          "Status": q.cancelled ? "CANCELLED" : q.status,
          __queryRef:q,
        })).sort((a,b)=>a["Nationality / Market"].localeCompare(b["Nationality / Market"])||a["Date of Generation"].localeCompare(b["Date of Generation"]));
      }
      default:
        return [{Note:"Data will populate as you use the system and add queries, tour files and payments."}];
    }
  };

  const exportPDF = (report) => {
    const data=getReportData(report.id);
    if(!data.length) return;
    const cols=Object.keys(data[0]).filter(c=>!c.startsWith("__"));
    const today=new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"});
    const win=window.open("","_blank");
    win.document.write(`<!DOCTYPE html><html><head><title>${report.label}</title>
    <style>body{font-family:Arial,sans-serif;margin:20px 30px;font-size:10pt;}
    h2{color:#1A3A52;}table{width:100%;border-collapse:collapse;font-size:9pt;}
    th{background:#1A3A52;color:#fff;padding:6px 8px;text-align:left;}
    td{padding:5px 8px;border-bottom:1px solid #e5e7eb;}
    tr:nth-child(even) td{background:#f9fafb;}</style></head><body>
    <h2>${report.icon} ${report.label}</h2>
    <p style="color:#666;font-size:9pt">${today} · ${data.length} records</p>
    <table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${data.map(row=>`<tr>${cols.map(c=>`<td>${row[c]??""}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></body></html>`);
    win.document.close(); setTimeout(()=>win.print(),400);
  };

const CHART_COLORS = ["#1A5276","#C0392B","#0E6655","#7D6608","#4A235A","#1B4F72","#78281F","#145A32","#784212","#117A65"];

// 1.2: charts wherever applicable, tabular data beneath -- but only
// where a chart genuinely aids understanding. A report earns a chart by
// carrying __chartValue/__chartLabel on its rows (every aggregated-by-
// category report: Agent-wise Revenue, Sector Performance, Nationality
// Mix), or by being Seasonality specifically (a real time series with
// three metrics, handled as its own case below). Flat list/log/register
// reports have no natural single metric to chart and are deliberately
// left as tables only.
function ReportChart({ reportId, data }) {
  if (reportId === "seasonality" && data.length) {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={G.gray100}/>
          <XAxis dataKey="Month" fontSize={10}/>
          <YAxis fontSize={10} allowDecimals={false}/>
          <Tooltip/>
          <Legend wrapperStyle={{fontSize:11}}/>
          <Line type="monotone" dataKey="Queries" stroke={CHART_COLORS[0]} strokeWidth={2}/>
          <Line type="monotone" dataKey="Tour Files" stroke={CHART_COLORS[1]} strokeWidth={2}/>
          <Line type="monotone" dataKey="Operated" stroke={CHART_COLORS[2]} strokeWidth={2}/>
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (!data.length || data[0].__chartValue == null) return null;
  const chartData = data.map(d => ({ name: d.__chartLabel, value: d.__chartValue }));
  if (reportId === "nationality_mix") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={{fontSize:10}}>
            {chartData.map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}
          </Pie>
          <Tooltip/>
          <Legend wrapperStyle={{fontSize:11}}/>
        </PieChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={G.gray100}/>
        <XAxis dataKey="name" fontSize={10} interval={0} angle={-20} textAnchor="end" height={50}/>
        <YAxis fontSize={10}/>
        <Tooltip/>
        <Bar dataKey="value" fill={G.navy}/>
      </BarChart>
    </ResponsiveContainer>
  );
}

  const ReportPreview = ({report}) => {
    const data=applyRowLevelFilters(report.id, getReportData(report.id));
    const activeFilters = report.filters || [];
    const cols=data.length?Object.keys(data[0]).filter(c=>!c.startsWith("__")):[];
    // A cell is a clickable ID/Tour-File reference when the row carries a
    // resolved query and the cell's own value is that query's id or
    // tour file id -- covers every "ID"/"Query ID"/"Tour File" column
    // across every report generically, without hand-listing column names
    // per report.
    const isIdCell = (row,c) => row.__queryRef && (row[c]===row.__queryRef.id || row[c]===row.__queryRef.tourFileId);
    return (
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${G.gray200}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:18,marginBottom:2}}>{report.icon}</div>
            <div style={{fontSize:15,fontWeight:700,color:G.navy,fontFamily:"'Playfair Display',serif"}}>{report.label}</div>
            <div style={{fontSize:11,color:G.gray400,marginTop:2}}>{report.desc}</div>
          </div>
          <button className="btn btn-ghost" style={{fontSize:11}} onClick={async()=>{
            if(!data.length) return;
            const ExcelJS = (await import("exceljs")).default;
            const wb = new ExcelJS.Workbook();
            wb.creator = "Unitop Ops"; wb.created = new Date();
            const sheet = wb.addWorksheet(report.label.slice(0,31));
            sheet.columns = cols.map(c=>({header:c, key:c, width:Math.max(12,c.length+2)}));
            sheet.getRow(1).font = {bold:true,color:{argb:"FFFFFFFF"}};
            sheet.getRow(1).fill = {type:"pattern",pattern:"solid",fgColor:{argb:"FF0D1B2A"}};
            data.forEach(row=>sheet.addRow(cols.reduce((r,c)=>({...r,[c]:row[c]}),{})));
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `${report.id}.xlsx`; a.click();
            URL.revokeObjectURL(url);
          }}>📥 XLSX</button>
          <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>exportPDF(report)}>🖨 PDF</button>
        </div>
        {activeFilters.length>0 && (
          <div style={{padding:"10px 18px",borderBottom:`1px solid ${G.gray200}`,background:G.gray50,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",flexShrink:0}}>
            <span style={{fontSize:10,color:G.gray400,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px"}}>Filters</span>
            {activeFilters.includes("sector") && (
              <select value={rf.sector} onChange={e=>setRf(f=>({...f,sector:e.target.value}))} style={filterSelectStyle}>
                <option value="">Sector: All</option>
                {sectorOptions.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {activeFilters.includes("agent") && (
              <select value={rf.agent} onChange={e=>setRf(f=>({...f,agent:e.target.value}))} style={filterSelectStyle}>
                <option value="">Agent: All</option>
                {agentOptions.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            )}
            {activeFilters.includes("status") && (
              <select value={rf.status} onChange={e=>setRf(f=>({...f,status:e.target.value}))} style={filterSelectStyle}>
                <option value="">Status: All</option>
                {statusOptions.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {activeFilters.includes("nationality") && (
              <select value={rf.nationality} onChange={e=>setRf(f=>({...f,nationality:e.target.value}))} style={filterSelectStyle}>
                <option value="">Nationality: All</option>
                {nationalityOptions.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            )}
            {activeFilters.includes("cancellationReason") && (
              <select value={rf.cancellationReason} onChange={e=>setRf(f=>({...f,cancellationReason:e.target.value}))} style={filterSelectStyle}>
                <option value="">Reason: All</option>
                {cancellationReasonOptions.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            )}
            {activeFilters.includes("facilitator") && (
              <select value={rf.facilitator} onChange={e=>setRf(f=>({...f,facilitator:e.target.value}))} style={filterSelectStyle}>
                <option value="">Facilitator: All</option>
                {facilitatorOptions.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            )}
            {activeFilters.includes("vendor") && (
              <select value={rf.vendor} onChange={e=>setRf(f=>({...f,vendor:e.target.value}))} style={filterSelectStyle}>
                <option value="">Vendor: All</option>
                {vendorOptions.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            )}
            {activeFilters.includes("dateRange") && (<>
              <span style={{fontSize:10,color:G.gray400}}>Query date:</span>
              <input type="date" value={rf.dateFrom} onChange={e=>setRf(f=>({...f,dateFrom:e.target.value}))} style={filterSelectStyle}/>
              <span style={{fontSize:10,color:G.gray400}}>to</span>
              <input type="date" value={rf.dateTo} onChange={e=>setRf(f=>({...f,dateTo:e.target.value}))} style={filterSelectStyle}/>
            </>)}
            {rfActiveForReport(activeFilters) && <button onClick={clearFilters} className="btn btn-ghost" style={{fontSize:10,padding:"4px 9px"}}>✕ Clear filters</button>}
          </div>
        )}
        <div style={{flex:1,overflowY:"auto",padding:"12px 18px"}}>
          {report.id==="exchange_order_register" && eoLoading
            ? <div style={{textAlign:"center",padding:32,color:G.gray400}}>Loading…</div>
            : data.length===0?<div style={{textAlign:"center",padding:32,color:G.gray400}}>{rfActiveForReport(activeFilters)?"No records match the current filters":"No data yet"}</div>:(
            <div style={{overflowX:"auto"}}>
              <ReportChart reportId={report.id} data={data}/>
              <div style={{fontSize:11,color:G.gray400,marginBottom:8}}>{data.length} record{data.length!==1?"s":""}</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}>
                <thead><tr style={{background:G.navy}}>
                  {cols.map(c=><th key={c} style={{padding:"7px 8px",color:"#fff",textAlign:"left",fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>{c}</th>)}
                </tr></thead>
                <tbody>{data.slice(0,50).map((row,i)=>(
                  <tr key={i} style={{background:i%2===0?G.white:G.gray50}}>
                    {cols.map(c=><td key={c} style={{padding:"6px 8px",borderBottom:`1px solid ${G.gray100}`,fontSize:11}}>
                      {row[c]==null
                        ? <span style={{color:G.gray400}}>—</span>
                        : isIdCell(row,c) && onOpenQuery
                          ? <span onClick={()=>onOpenQuery(row.__queryRef)} style={{color:"#1A5276",fontWeight:600,cursor:"pointer",textDecoration:"underline"}}>{row[c]}</span>
                          : row[c]}
                    </td>)}
                  </tr>
                ))}</tbody>
              </table>
              {data.length>50&&<div style={{padding:8,textAlign:"center",color:G.gray400,fontSize:11}}>Showing first 50 — export to see all</div>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{display:"flex",height:"100%",minHeight:500,margin:"-16px -20px"}}>
      <div style={{width:260,borderRight:`1px solid ${G.gray200}`,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"12px 14px",background:G.gray50,borderBottom:`1px solid ${G.gray200}`}}>
          <input style={{padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:11,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white,marginBottom:6}} placeholder="Search reports..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {categories.map(c=>(
              <button key={c} onClick={()=>setFilterCat(c)} style={{padding:"2px 7px",borderRadius:10,border:`1px solid ${filterCat===c?G.accent:G.gray200}`,background:filterCat===c?G.accent:G.white,color:filterCat===c?"#fff":G.gray600,fontSize:10,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:filterCat===c?600:400}}>{c}</button>
            ))}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {categories.filter(c=>c!=="All").map(cat=>{
            const catReports=filtered.filter(r=>r.cat===cat);
            if(!catReports.length) return null;
            return <div key={cat}>
              <div style={{padding:"8px 14px 4px",fontSize:10,fontWeight:700,color:G.gray400,textTransform:"uppercase",letterSpacing:"1px",background:G.gray50,borderBottom:`1px solid ${G.gray100}`}}>{cat}</div>
              {catReports.map(r=>(
                <div key={r.id} onClick={()=>setSelectedReport(r)} style={{padding:"10px 14px",cursor:"pointer",background:selectedReport?.id===r.id?"#EBF5FB":G.white,borderBottom:`1px solid ${G.gray100}`,borderLeft:`3px solid ${selectedReport?.id===r.id?"#1A5276":"transparent"}`}}>
                  <div style={{fontSize:12,fontWeight:selectedReport?.id===r.id?600:400,color:selectedReport?.id===r.id?G.navy:G.gray800}}>{r.icon} {r.label}</div>
                  <div style={{fontSize:10,color:G.gray400,marginTop:2,lineHeight:1.3}}>{r.desc.slice(0,55)}…</div>
                </div>
              ))}
            </div>;
          })}
        </div>
        <div style={{padding:"8px 14px",background:G.gray50,borderTop:`1px solid ${G.gray200}`,fontSize:10,color:G.gray400}}>{ALL_REPORTS.length} reports available</div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {selectedReport ? <ReportPreview report={selectedReport}/> : (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,color:G.gray400,padding:32}}>
            <div style={{fontSize:48,marginBottom:12}}>📈</div>
            <div style={{fontSize:15,fontWeight:600,marginBottom:6,color:G.gray600}}>Reports Repository</div>
            <div style={{fontSize:12,textAlign:"center",maxWidth:300,lineHeight:1.6}}>{ALL_REPORTS.length} reports across 4 categories. Select any report to view data and export.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TOUR BRIEFING SHEET ──────────────────────────────────────────────────────
