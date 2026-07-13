import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, FileTypeBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function PLReport({ queries, payments, onClose }) {
  const [view, setView] = useState("tour");
  const [selectedQuery, setSelectedQuery] = useState(null);

  // Per-tour P&L
  const tourPL = queries.filter(q=>q.status==="completed"||q.status==="finance").map(q => {
    const pt = payments[q.id];
    const revenue = pt ? (parseFloat(pt.tourValue)||0)*(parseFloat(pt.roeUsed)||1) : 0;
    const received = pt ? pt.entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0) : 0;
    const costEst  = revenue * 0.72; // placeholder until real cost sheet is linked
    const profit   = revenue - costEst;
    const margin   = revenue > 0 ? Math.round(profit/revenue*100) : 0;
    return { query:q, revenue:Math.round(revenue), received:Math.round(received), costEst:Math.round(costEst), profit:Math.round(profit), margin };
  });

  const totalRevenue  = tourPL.reduce((s,t)=>s+t.revenue,0);
  const totalProfit   = tourPL.reduce((s,t)=>s+t.profit,0);
  const totalReceived = tourPL.reduce((s,t)=>s+t.received,0);
  const avgMargin     = tourPL.length > 0 ? Math.round(totalProfit/totalRevenue*100) : 0;

  // Monthly summary (mock for now)
  const monthly = [
    { month:"Apr 2025", tours:2, revenue:380000, profit:76000, margin:20 },
    { month:"May 2025", tours:3, revenue:520000, profit:109200, margin:21 },
    { month:"Jun 2025", tours:2, revenue:290000, profit:63800, margin:22 },
  ];

  const printPL = () => {
    const win=window.open("","_blank");
    const rows = tourPL.map(t=>`<tr>
      <td>${t.query.id}</td><td>${t.query.clientName}</td><td>${t.query.destination}</td>
      <td style="text-align:right">₹ ${t.revenue.toLocaleString()}</td>
      <td style="text-align:right">₹ ${t.costEst.toLocaleString()}</td>
      <td style="text-align:right;font-weight:700;color:${t.profit>=0?"#059669":"#C0392B"}">₹ ${t.profit.toLocaleString()}</td>
      <td style="text-align:center">${t.margin}%</td>
    </tr>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>P&L Report</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;max-width:960px;margin:30px auto;padding:0 24px;}
    h1{font-size:18px;font-weight:bold;color:#0D1B2A;}h2{font-size:13px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ccc;padding-bottom:3px;margin:16px 0 8px;}
    table{width:100%;border-collapse:collapse;margin:8px 0;}th{background:#0D1B2A;color:#fff;padding:6px 8px;font-size:11px;text-align:left;}
    td{padding:6px 8px;font-size:12px;border-bottom:1px solid #eee;}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0;}
    .sum-box{background:#f9f9f9;border:1px solid #e5e7eb;border-radius:6px;padding:10px;}
    .sum-label{font-size:10px;text-transform:uppercase;color:#888;letter-spacing:0.5px;margin-bottom:4px;}
    .sum-value{font-size:18px;font-weight:700;color:#0D1B2A;}
    @media print{body{margin:0;}}</style></head><body>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <img src="${LOGO_B64}" alt="Unitop" style="height:40px;width:auto;mix-blend-mode:multiply"/>
      <h1 style="margin:0">Profit & Loss Report — ${COMPANY_INFO.name}</h1>
    </div>
    <p style="color:#888">Generated: ${new Date().toLocaleDateString("en-IN")}</p>
    <div class="summary">
      <div class="sum-box"><div class="sum-label">Total Revenue</div><div class="sum-value">₹ ${totalRevenue.toLocaleString()}</div></div>
      <div class="sum-box"><div class="sum-label">Total Cost (est)</div><div class="sum-value">₹ ${(totalRevenue-totalProfit).toLocaleString()}</div></div>
      <div class="sum-box"><div class="sum-label">Net Profit</div><div class="sum-value" style="color:#059669">₹ ${totalProfit.toLocaleString()}</div></div>
      <div class="sum-box"><div class="sum-label">Avg Margin</div><div class="sum-value">${avgMargin}%</div></div>
    </div>
    <h2>Tour-wise P&L</h2>
    <table><thead><tr><th>Query ID</th><th>Client</th><th>Destination</th><th style="text-align:right">Revenue</th><th style="text-align:right">Cost (est)</th><th style="text-align:right">Profit</th><th style="text-align:center">Margin</th></tr></thead>
    <tbody>${rows}</tbody></table>
    </body></html>`);
    win.document.close();win.print();
  };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:720,height:"100vh",overflowY:"auto",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"}}>
        <div style={{background:G.navy,padding:"14px 20px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>PROFIT & LOSS</div>
              <div style={{fontSize:17,fontWeight:700,color:G.white,fontFamily:"'Playfair Display',serif"}}>P&L Report</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>All tours · {new Date().getFullYear()}</div>
            </div>
            <button onClick={printPL} className="btn btn-success" style={{fontSize:11}}>🖨 Print / PDF</button>
            <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
          </div>
          <div style={{display:"flex",gap:4}}>
            {[["tour","📋 Per Tour"],["monthly","📅 Monthly Summary"]].map(([id,label])=>(
              <button key={id} onClick={()=>setView(id)} style={{padding:"5px 14px",borderRadius:5,border:"none",cursor:"pointer",background:view===id?"rgba(255,255,255,0.15)":"transparent",color:view===id?"#fff":"rgba(255,255,255,0.5)",fontSize:12,fontWeight:view===id?600:400,fontFamily:"'Inter',sans-serif"}}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          {/* Summary cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
            {[
              ["Total Revenue","₹ "+totalRevenue.toLocaleString(),G.navy],
              ["Received","₹ "+totalReceived.toLocaleString(),"#059669"],
              ["Net Profit (est)","₹ "+totalProfit.toLocaleString(),totalProfit>=0?"#059669":G.accent],
              ["Avg Margin",avgMargin+"%",avgMargin>=20?"#059669":avgMargin>=10?"#F59E0B":G.accent],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:12}}>
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>{l}</div>
                <div style={{fontSize:18,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>

          {view==="tour" && (
            <div>
              <div style={{fontSize:11,fontWeight:700,color:G.navy,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Tour-wise Breakdown</div>
              {tourPL.length===0 ? (
                <div style={{textAlign:"center",padding:"32px 0",color:G.gray400,fontSize:12,border:`1px dashed ${G.gray200}`,borderRadius:8}}>
                  No completed tours yet. P&L populates as tours are completed and payments recorded.
                </div>
              ) : tourPL.map(t=>(
                <div key={t.query.id} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:10,padding:"14px 16px",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600}}>{t.query.clientName}<FileTypeBadge fileType={t.query.fileType}/></div>
                      <div style={{fontSize:11,color:G.gray400}}>{t.query.id} · {t.query.destination}</div>
                    </div>
                    <StatusBadge status={t.query.status}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                    {[["Revenue","₹ "+t.revenue.toLocaleString(),G.navy],["Cost (est)","₹ "+t.costEst.toLocaleString(),G.gray600],["Profit","₹ "+t.profit.toLocaleString(),t.profit>=0?"#059669":G.accent],["Margin",t.margin+"%",t.margin>=20?"#059669":"#F59E0B"]].map(([l,v,c])=>(
                      <div key={l} style={{textAlign:"center",padding:"8px 0",background:G.gray50,borderRadius:6}}>
                        <div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div>
                        <div style={{fontSize:14,fontWeight:700,color:c}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:10,height:6,background:G.gray100,borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:Math.min(t.margin*5,100)+"%",background:t.margin>=20?"#059669":t.margin>=10?"#F59E0B":G.accent,borderRadius:3}}/>
                  </div>
                  <div style={{fontSize:10,color:G.gray400,marginTop:3,textAlign:"right"}}>{t.margin}% margin</div>
                </div>
              ))}
            </div>
          )}

          {view==="monthly" && (
            <div>
              <div style={{fontSize:11,fontWeight:700,color:G.navy,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Monthly Summary</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:G.navy}}>
                    {["Month","Tours","Revenue","Profit","Margin"].map(h=>(
                      <th key={h} style={{padding:"8px 12px",color:"#fff",fontSize:11,textAlign:h==="Month"||h==="Tours"?"left":"right"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m,i)=>(
                    <tr key={m.month} style={{background:i%2===0?G.white:G.gray50}}>
                      <td style={{padding:"10px 12px",fontWeight:500}}>{m.month}</td>
                      <td style={{padding:"10px 12px"}}>{m.tours}</td>
                      <td style={{padding:"10px 12px",textAlign:"right"}}>₹ {m.revenue.toLocaleString()}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:"#059669",fontWeight:600}}>₹ {m.profit.toLocaleString()}</td>
                      <td style={{padding:"10px 12px",textAlign:"right"}}>
                        <span style={{padding:"2px 8px",borderRadius:10,background:m.margin>=20?"#DCFCE7":"#FEF3C7",color:m.margin>=20?"#166534":"#92400E",fontWeight:600,fontSize:11}}>{m.margin}%</span>
                      </td>
                    </tr>
                  ))}
                  <tr style={{background:"#FEF3C7",fontWeight:700}}>
                    <td style={{padding:"10px 12px"}}>TOTAL</td>
                    <td style={{padding:"10px 12px"}}>{monthly.reduce((s,m)=>s+m.tours,0)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right"}}>₹ {monthly.reduce((s,m)=>s+m.revenue,0).toLocaleString()}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",color:"#059669"}}>₹ {monthly.reduce((s,m)=>s+m.profit,0).toLocaleString()}</td>
                    <td style={{padding:"10px 12px",textAlign:"right"}}>{Math.round(monthly.reduce((s,m)=>s+m.profit,0)/monthly.reduce((s,m)=>s+m.revenue,0)*100)}%</td>
                  </tr>
                </tbody>
              </table>
              <div style={{marginTop:12,padding:"10px 14px",background:G.gray50,borderRadius:8,fontSize:11,color:G.gray600}}>
                💡 Monthly figures will auto-populate from real payment data once the backend is connected in Phase 4.
              </div>
            </div>
          )}
        </div>

        <div style={{padding:"12px 20px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{flex:1}}/>
          <button onClick={printPL} className="btn btn-ghost">🖨 Print Report</button>
        </div>
      </div>
    </div>
  );
}



// ─── EXCHANGE ORDER / VOUCHER GENERATOR ──────────────────────────────────────

