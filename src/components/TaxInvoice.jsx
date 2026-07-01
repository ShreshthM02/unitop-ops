import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function TaxInvoice({ query, payments, onClose }) {
  const pt = payments[query.id];
  const today = new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"});
  const tourValueINR = pt ? (parseFloat(pt.tourValue)||0)*(parseFloat(pt.roeUsed)||1) : 0;
  const gstBase = Math.round(tourValueINR / 1.05);
  const gstAmt  = tourValueINR - gstBase;

  const [inv, setInv] = useState({
    invoiceNo: `TAX-2025-${String(Math.floor(Math.random()*900)+100)}`,
    date: today,
    placeOfSupply: "Delhi (07)",
    items:[{ desc:`Tour Package — ${query.destination||""} (${query.nights||"??"} Days)`, hsn:"998552", qty:query.pax||1, rate:Math.round(gstBase), amount:Math.round(gstBase) }],
    igst: true,
    gstRate: 5,
    notes:"",
  });
  const setF=(k,v)=>setInv(p=>({...p,[k]:v}));
  const updateItem=(i,f,v)=>setInv(p=>({...p,items:p.items.map((x,idx)=>idx===i?{...x,[f]:v}:x)}));

  const subtotal = inv.items.reduce((s,it)=>s+(parseFloat(it.amount)||0),0);
  const gstCalc  = Math.round(subtotal * inv.gstRate / 100);
  const grandTotal = subtotal + gstCalc;

  const inp={padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};

  const numToWords = (n) => {
    const a=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
    const b=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
    if(n===0)return"Zero";
    const inWords=(num)=>{
      if(num<20)return a[num];
      if(num<100)return b[Math.floor(num/10)]+(num%10?" "+a[num%10]:"");
      if(num<1000)return a[Math.floor(num/100)]+" Hundred"+(num%100?" "+inWords(num%100):"");
      if(num<100000)return inWords(Math.floor(num/1000))+" Thousand"+(num%1000?" "+inWords(num%1000):"");
      if(num<10000000)return inWords(Math.floor(num/100000))+" Lakh"+(num%100000?" "+inWords(num%100000):"");
      return inWords(Math.floor(num/10000000))+" Crore"+(num%10000000?" "+inWords(num%10000000):"");
    };
    return inWords(Math.round(n))+" Rupees Only";
  };

  const printTaxInvoice = () => {
    const win=window.open("","_blank");
    const itemRows=inv.items.map(it=>`<tr><td>${it.desc}</td><td style="text-align:center">${it.hsn}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">₹ ${parseFloat(it.rate).toLocaleString()}</td><td style="text-align:right">₹ ${parseFloat(it.amount).toLocaleString()}</td></tr>`).join("");
    const gstRow = inv.igst
      ? `<tr><td colspan="4" style="text-align:right">IGST @ ${inv.gstRate}%</td><td style="text-align:right">₹ ${gstCalc.toLocaleString()}</td></tr>`
      : `<tr><td colspan="4" style="text-align:right">CGST @ ${inv.gstRate/2}%</td><td style="text-align:right">₹ ${Math.round(gstCalc/2).toLocaleString()}</td></tr>
         <tr><td colspan="4" style="text-align:right">SGST @ ${inv.gstRate/2}%</td><td style="text-align:right">₹ ${Math.round(gstCalc/2).toLocaleString()}</td></tr>`;
    win.document.write(`<!DOCTYPE html><html><head><title>Tax Invoice ${inv.invoiceNo}</title>
    <style>*{box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;margin:0;padding:28px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:3px solid #C0392B;}
    .co-name{font-size:18px;font-weight:900;color:#0D1B2A;}.co-sub{font-size:11px;color:#666;margin-top:1px;}
    .badge{display:inline-block;background:#C0392B;color:#fff;padding:2px 10px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:4px;}
    .inv-no{font-size:20px;font-weight:900;color:#C0392B;}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0;}
    .box{border:1px solid #e5e7eb;border-radius:6px;padding:10px;}
    .box-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:6px;}
    table{width:100%;border-collapse:collapse;margin:10px 0;}
    th{background:#0D1B2A;color:#fff;padding:7px 8px;font-size:11px;text-align:left;}
    td{padding:6px 8px;font-size:12px;border-bottom:1px solid #f0f0f0;vertical-align:top;}
    .total-row td{font-weight:700;font-size:13px;background:#FEF3C7;}
    .grand-row td{font-weight:900;font-size:15px;background:#0D1B2A;color:#fff;}
    .words{background:#f9f9f9;border:1px solid #e5e7eb;border-radius:4px;padding:8px;font-size:11px;margin:8px 0;}
    .gstin-box{background:#EBF5FB;border:1px solid #BEE3F8;border-radius:4px;padding:8px;font-size:11px;margin:8px 0;}
    .footer{margin-top:20px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#999;text-align:center;}
    .stamp{display:flex;justify-content:space-between;margin-top:32px;}
    .stamp-box{text-align:center;font-size:11px;color:#555;}
    .stamp-line{width:150px;border-top:1px solid #999;margin:0 auto 4px;}
    @media print{body{padding:16px;}}</style></head><body>
    <div class="header">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <img src="${LOGO_B64}" alt="Unitop" style="height:48px;width:auto;mix-blend-mode:multiply"/>
        <div>
          <div class="co-name">${COMPANY_INFO.name}</div>
          <div class="co-sub">${COMPANY_INFO.address}</div>
          <div class="co-sub">Ph: ${COMPANY_INFO.phone}</div>
          <div class="co-sub">E: ${COMPANY_INFO.email} | W: ${COMPANY_INFO.web}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div class="badge">TAX INVOICE</div>
        <div class="inv-no">${inv.invoiceNo}</div>
        <div class="co-sub">Date: <strong>${inv.date}</strong></div>
        <div class="co-sub">Place of Supply: ${inv.placeOfSupply}</div>
      </div>
    </div>
    <div class="gstin-box">
      <strong>Supplier GSTIN:</strong> ${COMPANY_INFO.gstin} &nbsp;|&nbsp;
      <strong>PAN:</strong> ${COMPANY_INFO.pan} &nbsp;|&nbsp;
      <strong>State:</strong> ${COMPANY_INFO.state}
    </div>
    <div class="two-col">
      <div class="box"><div class="box-title">Bill To (Recipient)</div>
        <strong>${query.agentName||query.clientName}</strong>${query.agentCompany?`<br/>${query.agentCompany}`:""}<br/>${query.agentCountry||""}
        <div style="margin-top:6px;font-size:11px;color:#888">GSTIN: N/A (Foreign Agent)</div>
      </div>
      <div class="box"><div class="box-title">Tour Details</div>
        <strong>${query.destination||""}</strong><br/>
        Travel: ${query.dateDisplay||query.travelDate||""}<br/>
        Pax: ${query.paxDisplay||query.pax||""}<br/>
        Ref: ${query.id}
      </div>
    </div>
    <table><thead><tr><th>Description of Service</th><th style="text-align:center">HSN/SAC</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate (₹)</th><th style="text-align:right">Amount (₹)</th></tr></thead>
    <tbody>${itemRows}
    <tr><td colspan="4" style="text-align:right;color:#555">Taxable Value</td><td style="text-align:right">₹ ${subtotal.toLocaleString()}</td></tr>
    ${gstRow}
    <tr class="grand-row"><td colspan="4" style="text-align:right">GRAND TOTAL</td><td style="text-align:right">₹ ${grandTotal.toLocaleString()}</td></tr>
    </tbody></table>
    <div class="words">Amount in Words: <strong>${numToWords(grandTotal)}</strong></div>
    ${inv.notes?`<div style="font-size:11px;color:#555;margin-top:8px">Notes: ${inv.notes}</div>`:""}
    <div class="footer">This is a computer generated invoice. Subject to Delhi jurisdiction.<br/>
    ${COMPANY_INFO.name} | ${COMPANY_INFO.gstin}</div>
    <div class="stamp">
      <div class="stamp-box"><div class="stamp-line"></div>Prepared by</div>
      <div class="stamp-box"><div class="stamp-line"></div>Authorised Signatory</div>
    </div>
    </body></html>`);
    win.document.close();win.print();
  };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:660,height:"100vh",overflowY:"auto",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"}}>
        <div style={{background:G.navy,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>GST TAX INVOICE</div>
            <div style={{fontSize:17,fontWeight:700,color:G.white,fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.id} · GSTIN: {COMPANY_INFO.gstin}</div>
          </div>
          <button onClick={printTaxInvoice} className="btn btn-success" style={{fontSize:11}}>🖨 Print / PDF</button>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          <div style={{background:"#EBF5FB",border:"1px solid #BEE3F8",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#1A5276",marginBottom:14}}>
            GSTIN: <strong>{COMPANY_INFO.gstin}</strong> · PAN: <strong>{COMPANY_INFO.pan}</strong> · State: {COMPANY_INFO.state}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
            {[["Invoice No",inv.invoiceNo,"invoiceNo"],["Date",inv.date,"date"],["Place of Supply",inv.placeOfSupply,"placeOfSupply"]].map(([l,v,k])=>(
              <div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div>
              <input style={inp} value={v} onChange={e=>setF(k,e.target.value)}/></div>
            ))}
          </div>

          {/* GST type toggle */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,padding:"10px 12px",background:G.gray50,borderRadius:8,border:`1px solid ${G.gray200}`}}>
            <span style={{fontSize:12,fontWeight:600,color:G.gray600}}>GST Type:</span>
            {[["IGST (Interstate / Foreign)",true],["CGST + SGST (Local)",false]].map(([label,val])=>(
              <label key={label} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12,color:G.gray800}}>
                <input type="radio" checked={inv.igst===val} onChange={()=>setF("igst",val)} style={{accentColor:G.accent}}/>
                {label}
              </label>
            ))}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,color:G.gray600}}>GST Rate:</span>
              <select style={{...inp,width:80}} value={inv.gstRate} onChange={e=>setF("gstRate",Number(e.target.value))}>
                {[5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>

          {/* Line items */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:G.navy,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Line Items</div>
            {inv.items.map((it,i)=>(
              <div key={i} style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:12,marginBottom:8}}>
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Description</div>
                  <input style={inp} value={it.desc} onChange={e=>updateItem(i,"desc",e.target.value)}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
                  {[["HSN/SAC",it.hsn,"hsn"],["Qty",it.qty,"qty"],["Rate (₹)",it.rate,"rate"],["Amount (₹)",it.amount,"amount"]].map(([l,v,k])=>(
                    <div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div>
                    <input style={{...inp,textAlign:["Rate (₹)","Amount (₹)"].includes(l)?"right":"center"}} type={k==="hsn"?"text":"number"} value={v} onChange={e=>updateItem(i,k,e.target.value)}/></div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tax summary */}
          <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:14,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:G.navy,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Tax Summary</div>
            {[["Taxable Value","₹ "+subtotal.toLocaleString()],
              ...(inv.igst?[[`IGST @ ${inv.gstRate}%`,"₹ "+gstCalc.toLocaleString()]]:[[`CGST @ ${inv.gstRate/2}%`,"₹ "+Math.round(gstCalc/2).toLocaleString()],[`SGST @ ${inv.gstRate/2}%`,"₹ "+Math.round(gstCalc/2).toLocaleString()]]),
              ["Grand Total","₹ "+grandTotal.toLocaleString()]
            ].map(([l,v],i,arr)=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<arr.length-1?`1px solid ${G.gray200}`:"none"}}>
                <span style={{fontSize:i===arr.length-1?13:12,fontWeight:i===arr.length-1?700:400,color:i===arr.length-1?G.navy:G.gray800}}>{l}</span>
                <span style={{fontSize:i===arr.length-1?14:12,fontWeight:700,color:i===arr.length-1?G.navy:G.gray800}}>{v}</span>
              </div>
            ))}
            <div style={{marginTop:10,padding:"8px 10px",background:"#EBF5FB",borderRadius:6,fontSize:11,color:"#1A5276"}}>
              Amount in words: <strong>{numToWords(grandTotal)}</strong>
            </div>
          </div>

          <div><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Notes</div>
            <textarea style={{...inp,minHeight:52,resize:"vertical"}} value={inv.notes} onChange={e=>setF("notes",e.target.value)} placeholder="Any additional notes..."/>
          </div>
        </div>
        <div style={{padding:"12px 20px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{flex:1}}/>
          <button onClick={printTaxInvoice} className="btn btn-success">🖨 Print / PDF</button>
          <button className="btn btn-primary">💾 Save Tax Invoice</button>
        </div>
      </div>
    </div>
  );
}

// ─── P&L REPORT ──────────────────────────────────────────────────────────────


