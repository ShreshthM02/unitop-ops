import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function ReportsView({ queries, payments, currentUser }) {
  const can = useCan(currentUser);
  const [selectedReport, setSelectedReport] = useState(null);
  const [filterCat, setFilterCat] = useState("All");
  const [search, setSearch] = useState("");

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
    const now = new Date();
    switch(id) {
      case "active_pipeline":
        return queries.filter(q=>!q.cancelled&&q.status!=="completed").map(q=>({
          "Query ID":q.id,"Group":q.groupName||q.clientName,"Agent":q.agentCompany||"—",
          "Sector":q.destination||q.sector||"—","Status":q.status,"Travel Date":q.travelDate||"TBC","Pax":q.pax||"—",
        }));
      case "query_log":
        return queries.map(q=>({
          "Query ID":q.id,"Date":q.date,"Group":q.groupName||q.clientName,
          "Agent":q.agentCompany||"—","Sector":q.destination||q.sector||"—",
          "Status":q.cancelled?"CANCELLED":q.status,"Tour File":q.tourFileId||"—",
        }));
      case "cancellations":
        return queries.filter(q=>q.cancelled).map(q=>({
          "Query ID":q.id,"Group":q.groupName||q.clientName,"Agent":q.agentCompany||"—",
          "Sector":q.destination||q.sector||"—","Stage":q.status,"Reason":q.cancellationReason||"—",
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
            "Margin":tv>0?Math.round((tv-co)/tv*100)+"%":"—"};
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
        }));
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
        }));
      }
      case "nationality_mix": {
        const nMap={};
        queries.filter(q=>!q.cancelled&&q.nationality).forEach(q=>{nMap[q.nationality]=(nMap[q.nationality]||0)+1;});
        return Object.entries(nMap).sort((a,b)=>b[1]-a[1]).map(([nat,cnt])=>({"Nationality/Market":nat,"Queries":cnt}));
      }
      case "seasonality": {
        const nowD=new Date();
        return Array.from({length:12},(_,i)=>{
          const d=new Date(nowD.getFullYear(),nowD.getMonth()-11+i,1);
          const label=d.toLocaleDateString("en-IN",{month:"short",year:"2-digit"});
          const count=queries.filter(q=>{const qd=new Date(q.date||"");return qd.getFullYear()===d.getFullYear()&&qd.getMonth()===d.getMonth()&&!q.cancelled;}).length;
          return {"Month":label,"Queries":count};
        });
      }
      default:
        return [{Note:"Data will populate as you use the system and add queries, tour files and payments."}];
    }
  };

  const exportPDF = (report) => {
    const data=getReportData(report.id);
    if(!data.length) return;
    const cols=Object.keys(data[0]);
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

  const ReportPreview = ({report}) => {
    const data=getReportData(report.id);
    const cols=data.length?Object.keys(data[0]):[];
    return (
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${G.gray200}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:18,marginBottom:2}}>{report.icon}</div>
            <div style={{fontSize:15,fontWeight:700,color:G.navy,fontFamily:"'Playfair Display',serif"}}>{report.label}</div>
            <div style={{fontSize:11,color:G.gray400,marginTop:2}}>{report.desc}</div>
          </div>
          <button className="btn btn-ghost" style={{fontSize:11}} onClick={async()=>{
            const XLSX=await loadXLSX();
            const ws=XLSX.utils.json_to_sheet(data);
            const wb=XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb,ws,report.label.slice(0,31));
            const blob=new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
            saveBlob(blob,`${report.id}.xlsx`);
          }}>📥 XLSX</button>
          <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>exportPDF(report)}>🖨 PDF</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"12px 18px"}}>
          {data.length===0?<div style={{textAlign:"center",padding:32,color:G.gray400}}>No data yet</div>:(
            <div style={{overflowX:"auto"}}>
              <div style={{fontSize:11,color:G.gray400,marginBottom:8}}>{data.length} record{data.length!==1?"s":""}</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:500}}>
                <thead><tr style={{background:G.navy}}>
                  {cols.map(c=><th key={c} style={{padding:"7px 8px",color:"#fff",textAlign:"left",fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>{c}</th>)}
                </tr></thead>
                <tbody>{data.slice(0,50).map((row,i)=>(
                  <tr key={i} style={{background:i%2===0?G.white:G.gray50}}>
                    {cols.map(c=><td key={c} style={{padding:"6px 8px",borderBottom:`1px solid ${G.gray100}`,fontSize:11}}>{row[c]??<span style={{color:G.gray400}}>—</span>}</td>)}
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
