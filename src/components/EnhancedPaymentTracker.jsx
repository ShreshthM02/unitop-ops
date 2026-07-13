import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, loadQuotationVersions, summarizeFinalPriceEntries, db } = Lib;

function IncomingEntryRow({ entry: e, TYPE_COLORS, TYPE_TEXT, TYPE_LABELS, query, pt, setPt, onUpdatePayments, LOGO_B64, COMPANY_INFO }) {
  const deleteEntry = () => {
    const updated = { ...pt, entries: pt.entries.filter(x => x.id !== e.id) };
    setPt(updated);
    onUpdatePayments(query.id, updated, `Payment entry deleted: ${e.inCurrency||""} ${e.amount} (receipt ${e.receipt||"n/a"})`);
  };

  const printReceipt = () => {
    const ci = COMPANY_INFO;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Receipt ${e.receipt||""}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@300;400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{font-family:'Inter',Arial,sans-serif;font-size:10pt;color:#1a1a1a;background:#fff}
  .page{width:148mm;min-height:210mm;margin:0 auto;padding:10mm 12mm}
  .lh-logo{height:70pt;width:auto;display:block;margin:0 auto 4pt}
  .lh-name{font-family:'Playfair Display',serif;font-size:13pt;font-weight:700;color:#1A3A52;text-align:center;letter-spacing:0.5pt}
  .lh-addr{font-size:7.5pt;color:#555;text-align:center;line-height:1.6;margin-top:2pt}
  .rule{height:2pt;border:none;background:linear-gradient(to right,#cb0f0f,#061bb0);margin:6pt 0;border-radius:1pt}
  .title{font-family:'Playfair Display',serif;font-size:15pt;font-weight:700;color:#1A3A52;text-align:center;margin:10pt 0 6pt;text-transform:uppercase;letter-spacing:1pt}
  .rcpt-no{text-align:center;font-size:9pt;color:#8B1A1A;font-weight:700;margin-bottom:10pt}
  .party{background:#f8f9fa;border:1pt solid #e5e7eb;border-radius:4pt;padding:8pt 10pt;margin-bottom:10pt}
  .party-lbl{font-size:7pt;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1pt;margin-bottom:3pt}
  .party-name{font-size:11pt;font-weight:700;color:#1A3A52;font-family:'Playfair Display',serif}
  .party-det{font-size:8.5pt;color:#555;margin-top:2pt}
  table{width:100%;border-collapse:collapse;margin-bottom:8pt}
  th{background:#1A3A52;color:#fff;font-size:8pt;font-weight:700;padding:5pt 7pt;text-align:left}
  td{padding:5pt 7pt;border-bottom:0.5pt solid #e5e7eb;font-size:9pt;vertical-align:top}
  tr:nth-child(even) td{background:#f9fafb}
  .amount-row{background:#1A3A52!important;color:#fff;font-weight:700;font-size:10pt}
  .amount-row td{color:#fff;border:none;padding:7pt}
  .footer-rule{height:0.75pt;border:none;background:linear-gradient(to right,#cb0f0f,#061bb0);margin-top:14pt}
  .footer{font-size:7.5pt;color:#888;text-align:center;margin-top:5pt}
  .stamp-area{margin-top:18pt;display:flex;justify-content:space-between;align-items:flex-end;font-size:8pt;color:#555}
  @media print{body{margin:0}.page{width:100%}@page{margin:0;size:A5}}
</style></head><body>
<div class="page">
  <img src="${LOGO_B64}" class="lh-logo" alt="Unitop Tours"/>
  <div class="lh-name">${ci.name}</div>
  <div class="lh-addr">${ci.address}<br/>
    Tel: ${ci.phone} &nbsp;|&nbsp; ${ci.email} &nbsp;|&nbsp; ${ci.web}<br/>
    GSTIN: ${ci.gstin} &nbsp;|&nbsp; PAN: ${ci.pan}
  </div>
  <div class="rule"></div>
  <div class="title">Payment Receipt</div>
  <div class="rcpt-no">${e.receipt||"RCP-"+e.id}</div>

  <div class="party">
    <div class="party-lbl">Received From</div>
    <div class="party-name">${query.groupName||query.clientName||"—"}</div>
    <div class="party-det">
      ${query.agentCompany?`Via: ${query.agentCompany}<br/>`:""}
      Tour File: ${query.tourFileId||query.id} &nbsp;|&nbsp; ${query.destination||query.sector||""}
      ${query.pax?` &nbsp;|&nbsp; ${query.pax} pax`:""}
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th style="text-align:right">Details</th></tr></thead>
    <tbody>
      <tr><td>Payment Type</td><td style="text-align:right;font-weight:600">${TYPE_LABELS[e.type]||e.type}</td></tr>
      <tr><td>Date Received</td><td style="text-align:right">${e.date||"—"}</td></tr>
      <tr><td>Mode of Payment</td><td style="text-align:right">${e.mode==="Other"?e.modeOther||"Other":e.mode}</td></tr>
      ${e.ref?`<tr><td>Reference / UTR</td><td style="text-align:right;font-family:monospace">${e.ref}</td></tr>`:""}
      <tr><td>Currency</td><td style="text-align:right">${e.inCurrency==="Other"?e.currOther||"Other":e.inCurrency}</td></tr>
      ${e.note?`<tr><td>Notes</td><td style="text-align:right;font-style:italic">${e.note}</td></tr>`:""}
    </tbody>
    <tfoot>
      <tr class="amount-row"><td>Amount Received (INR)</td><td style="text-align:right;font-size:12pt">₹ ${parseFloat(e.amount).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>
    </tfoot>
  </table>

  <div class="stamp-area">
    <div>
      <div style="border-top:0.5pt solid #ccc;padding-top:4pt;margin-top:32pt;width:120pt;text-align:center">Client Signature</div>
    </div>
    <div style="text-align:right">
      <div style="border-top:0.5pt solid #ccc;padding-top:4pt;margin-top:32pt;width:120pt;text-align:center">For ${ci.name}<br/><span style="font-size:7pt;color:#888">Authorised Signatory</span></div>
    </div>
  </div>

  <div class="footer-rule"></div>
  <div class="footer">This is a computer-generated receipt. &nbsp;|&nbsp; ${ci.name} &nbsp;|&nbsp; GSTIN: ${ci.gstin}</div>
</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
    const w = window.open("", "_blank", "width=700,height=900");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div style={{background:"#fff",border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,
              background:TYPE_COLORS[e.type]||"#F3F4F6",color:TYPE_TEXT[e.type]||"#374151"}}>
              {TYPE_LABELS[e.type]||e.type}
            </span>
            <span style={{fontSize:13,fontWeight:700,color:"#059669"}}>
              ₹ {parseFloat(e.amount||0).toLocaleString("en-IN")}
              {e.inCurrency && e.inCurrency!=="INR" && <span style={{fontSize:10,color:G.gray400,fontWeight:400}}> ({e.inCurrency==="Other"?e.currOther:e.inCurrency})</span>}
            </span>
            {e.receipt && <span style={{fontSize:10,color:G.gray400,fontFamily:"monospace"}}>{e.receipt}</span>}
          </div>
          <div style={{fontSize:11,color:G.gray600}}>
            {e.date} · {e.mode==="Other"?e.modeOther||"Other":e.mode}
            {e.ref && <span style={{fontFamily:"monospace",marginLeft:6,color:G.gray500}}>{e.ref}</span>}
          </div>
          {e.note && <div style={{fontSize:11,color:G.gray400,marginTop:2,fontStyle:"italic"}}>{e.note}</div>}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
          <button onClick={printReceipt}
            style={{background:"#EBF5FB",border:"1px solid #A9CCE3",color:"#1A5276",borderRadius:5,
              padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
            🖨 Receipt
          </button>
          <button onClick={deleteEntry}
            style={{background:"none",border:"none",cursor:"pointer",color:G.gray400,fontSize:18,padding:"0 4px"}}
            title="Delete entry">✕</button>
        </div>
      </div>
    </div>
  );
}

export default function EnhancedPaymentTracker({ query, payments, onUpdatePayments, onClose, readOnly }) {
  const existing = payments[query.id] || { queryId:query.id, tourValue:"", currency:"US $", roeUsed:90, tourValueINR:"", entries:[], outgoing:[] };
  const [pt, setPt] = useState(existing);
  const [tab, setTab]  = useState("incoming");
  const [plRoe, setPlRoe] = useState(pt.roeUsed||90);
  const [newIn, setNewIn] = useState({ type:"advance", inCurrency:"INR", amount:"", date:"", mode:"Remittance", ref:"", note:"", modeOther:"", currOther:"" });
  const [newOut, setNewOut] = useState({ vendor:"", amount:"", date:"", mode:"NEFT/RTGS", ref:"", note:"", receiptName:"" });
  const setF=(k,v)=>setPt(p=>({...p,[k]:v}));
  const setNI=(k,v)=>setNewIn(p=>({...p,[k]:v}));
  const setNO=(k,v)=>setNewOut(p=>({...p,[k]:v}));

  // Reference only -- deliberately NOT auto-syncing into pt.tourValue.
  // Tour Value here is independently editable (may be a different currency,
  // may include adjustments this tracker doesn't know about), so silently
  // overwriting it risked the exact "which number do I trust" confusion
  // this was meant to fix. Shown so staff can cross-check by eye instead.
  const [finalQuotation, setFinalQuotation] = useState(null);
  useEffect(() => {
    loadQuotationVersions(db, query.id).then(versions => {
      const final = versions.find(v => v.isFinal);
      setFinalQuotation(final || null);
    });
  }, [query.id]);

  const totalIn  = pt.entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const totalOut = (pt.outgoing||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const tourValueINR = (parseFloat(pt.tourValue)||0)*(parseFloat(pt.roeUsed)||1);
  const balance = tourValueINR - totalIn;
  const pct = tourValueINR>0 ? Math.round(totalIn/tourValueINR*100) : 0;

  const addIncoming = () => {
    if(!newIn.amount||!newIn.date) return;
    const receiptNo = `RCP-${new Date().getFullYear()}-${String(pt.entries.length+1).padStart(3,"0")}`;
    const updated = {...pt, tourValueINR, entries:[...pt.entries, {...newIn,id:Date.now(),receipt:receiptNo}]};
    setPt(updated); onUpdatePayments(query.id, updated, `Payment received: ${newIn.inCurrency} ${newIn.amount} (${TYPE_LABELS[newIn.type]||newIn.type}, receipt ${receiptNo})`);
    setNewIn({type:"advance",inCurrency:"INR",amount:"",date:"",mode:"Remittance",ref:"",note:"",modeOther:"",currOther:""});
  };

  const addOutgoing = () => {
    if(!newOut.vendor||!newOut.amount) return;
    const updated = {...pt, outgoing:[...(pt.outgoing||[]), {...newOut,id:Date.now()}]};
    setPt(updated); onUpdatePayments(query.id, updated, `Payment made to ${newOut.vendor}: ₹${newOut.amount}`);
    setNewOut({vendor:"",amount:"",date:"",mode:"NEFT/RTGS",ref:"",note:"",receiptName:""});
  };

  const inp={padding:"7px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const TYPE_LABELS={advance:"Advance",second:"2nd Instalment",third:"3rd Instalment",final:"Final Payment",credit:"Credit Note",refund:"Refund",other:"Other"};
  const TYPE_COLORS={advance:"#DBEAFE",second:"#DCFCE7",third:"#DCFCE7",final:"#ECFDF5",credit:"#FEF3C7",refund:"#FEE2E2"};
  const TYPE_TEXT={advance:"#1E40AF",second:"#166534",third:"#166534",final:"#065F46",credit:"#92400E",refund:"#991B1B"};

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:660,height:"100vh",overflowY:"auto",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"}}>
        <div style={{background:G.navy,padding:"14px 20px",flexShrink:0}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>PAYMENT TRACKER</div>
          <div style={{fontSize:17,fontWeight:700,color:G.white,fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.id} · {query.destination||query.sector}</div>
        </div>

        <fieldset disabled={readOnly} style={{flex:1,overflowY:"auto",padding:"16px 20px",border:"none",margin:0,minWidth:0}}>
          {readOnly && (
            <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#92400E",marginBottom:14}}>
              🔒 This tour file is cancelled — viewing only, nothing here is editable.
            </div>
          )}
          {finalQuotation && finalQuotation.tourValue && (
            <div style={{background:"#EBF5FB",border:"1px solid #A9CCE3",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#1A5276"}}>
              📋 Final quotation (v{finalQuotation.version}) agreed: <strong>{summarizeFinalPriceEntries(finalQuotation.finalPriceEntries, "")}</strong> · {finalQuotation.confirmedPax} pax total · Tour Value <strong>{finalQuotation.tourValue}</strong>. Cross-check against the Tour Value below — not auto-filled, since currency/adjustments here may differ.
            </div>
          )}
          {/* Tour value */}
          <div style={{background:G.gray50,borderRadius:8,border:`1px solid ${G.gray200}`,padding:12,marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Tour Value</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[["Tour Value (FX)",pt.tourValue,"tourValue","number"],["Currency",pt.currency,"currency","select"],["ROE (₹ per unit)",pt.roeUsed,"roeUsed","number"]].map(([l,v,k,t])=>(
                <div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>
                  {t==="select"?<><select style={inp} value={v} onChange={e=>setF(k,e.target.value)}>{["US $","EUR","GBP","AUD","SGD","NTD","THB","INR","Other"].map(c=><option key={c}>{c}</option>)}</select>{v==="Other"&&<input style={{...inp,marginTop:4}} value={pt.currOther||""} onChange={e=>setF("currOther",e.target.value)} placeholder="Specify currency..."/>}</> 
                  :<input style={{...inp,textAlign:"right"}} type="number" value={v} onChange={e=>setF(k,e.target.value)}/>}
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
            {[["Tour (INR)","₹ "+Math.round(tourValueINR).toLocaleString(),G.navy],["Received","₹ "+Math.round(totalIn).toLocaleString(),"#059669"],["Balance Due","₹ "+Math.round(balance).toLocaleString(),balance>0?G.accent:"#059669"],["Paid Out","₹ "+Math.round(totalOut).toLocaleString(),"#6B21A8"]].map(([l,v,c])=>(
              <div key={l} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10}}>
                <div style={{fontSize:9,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div>
                <div style={{fontSize:14,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:G.gray600,marginBottom:4}}>
              <span>Incoming Progress</span><span>{pct}%</span>
            </div>
            <div style={{height:6,background:G.gray200,borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>=100?"#059669":pct>=50?"#F59E0B":G.accent,borderRadius:3}}/>
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:2,borderBottom:`1px solid ${G.gray200}`,marginBottom:14}}>
            {[["incoming","💰 Incoming"],["outgoing","📤 Outgoing"],["pl","📊 P&L"]].map(([id,label])=>(
              <div key={id} onClick={()=>setTab(id)} style={{padding:"7px 14px",fontSize:12,fontWeight:500,cursor:"pointer",
                color:tab===id?G.accent:G.gray600,borderBottom:`2px solid ${tab===id?G.accent:"transparent"}`,transition:"all .15s"}}>
                {label}
              </div>
            ))}
          </div>

          {tab==="incoming" && (
            <>
              {pt.entries.map((e,i)=>(
                <IncomingEntryRow key={e.id} entry={e}
                  TYPE_COLORS={TYPE_COLORS} TYPE_TEXT={TYPE_TEXT} TYPE_LABELS={TYPE_LABELS}
                  query={query} pt={pt} setPt={setPt} onUpdatePayments={onUpdatePayments}
                  LOGO_B64={LOGO_B64} COMPANY_INFO={COMPANY_INFO}/>
              ))}
              <div style={{background:"#EAFAF1",border:"1px solid #A9DFBF",borderRadius:8,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#0E6655",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>+ Record Incoming Payment</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  {[["Type","select"],["Currency","currselect"],["Amount","number"],["Date","date"],["Mode","modeselect"],["Reference","text"],["Note","text"]].map(([l,t],i)=>{
                    const keys=["type","inCurrency","amount","date","mode","ref","note"];
                    const k=keys[i];
                    return (
                      <div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>
                        {t==="select"?<select style={inp} value={newIn[k]} onChange={e=>setNI(k,e.target.value)}>{Object.entries(TYPE_LABELS).map(([kk,vv])=><option key={kk} value={kk}>{vv}</option>)}</select>
                        :t==="modeselect"?<>
                          <select style={inp} value={newIn[k]} onChange={e=>setNI(k,e.target.value)}>{["Remittance","SWIFT","NEFT/RTGS","Cheque","Cash","Credit Card","Other"].map(m=><option key={m}>{m}</option>)}</select>
                          {newIn[k]==="Other"&&<input style={{...inp,marginTop:4}} value={newIn.modeOther||""} onChange={e=>setNI("modeOther",e.target.value)} placeholder="Specify mode..."/>}
                        </>
                        :t==="currselect"?<>
                          <select style={inp} value={newIn[k]} onChange={e=>setNI(k,e.target.value)}>{["INR","USD","EUR","GBP","AUD","SGD","THB","NTD","Other"].map(c=><option key={c}>{c}</option>)}</select>
                          {newIn[k]==="Other"&&<input style={{...inp,marginTop:4}} value={newIn.currOther||""} onChange={e=>setNI("currOther",e.target.value)} placeholder="Specify currency..."/>}
                        </>
                        :<input style={{...inp,textAlign:t==="number"?"right":"left"}} type={t} value={newIn[k]} onChange={e=>setNI(k,e.target.value)}/>}
                      </div>
                    );
                  })}
                </div>
                <button className="btn btn-success" onClick={addIncoming} style={{fontSize:12}}>✓ Record & Generate Receipt</button>
              </div>
            </>
          )}

          {tab==="outgoing" && (
            <>
              {(pt.outgoing||[]).map((e,i)=>(
                <div key={e.id} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600}}>{e.vendor}</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#6B21A8"}}>₹ {parseFloat(e.amount).toLocaleString()}</div>
                    <div style={{fontSize:11,color:G.gray600}}>{e.date} · {e.mode}{e.ref?" · "+e.ref:""}</div>
                    {e.note&&<div style={{fontSize:11,color:G.gray400}}>{e.note}</div>}
                    {e.receiptName&&<div style={{fontSize:10,background:"#EBF5FB",color:"#154360",padding:"2px 8px",borderRadius:10,display:"inline-block",marginTop:3}}>📎 {e.receiptName}</div>}
                  </div>
                  <button onClick={()=>{const u={...pt,outgoing:(pt.outgoing||[]).filter(x=>x.id!==e.id)};setPt(u);onUpdatePayments(query.id,u,`Payment out to ${e.vendor} deleted: ₹${e.amount}`);}}
                    style={{background:"none",border:"none",cursor:"pointer",color:G.gray400,fontSize:18,padding:"0 4px",flexShrink:0}} title="Delete">✕</button>
                </div>
              ))}
              <div style={{background:"#F5EEF8",border:"1px solid #D2B4DE",borderRadius:8,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6C3483",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>+ Record Outgoing / Vendor Payment</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <div>
                    <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Vendor / Payee</div>
                    <input style={inp} value={newOut.vendor} onChange={e=>setNO("vendor",e.target.value)} placeholder="e.g. Hotel Saura, IRCTC, IndiGo Airlines"/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Bank Name (paying from)</div>
                    <input style={inp} value={newOut.bankName||""} onChange={e=>setNO("bankName",e.target.value)} placeholder="e.g. Punjab National Bank"/>
                  </div>
                  {[["Amount (INR)","number","amount"],["Date","date","date"],["Mode","modeselect","mode"],["Reference / UTR","text","ref"],["Note","text","note"]].map(([l,t,k])=>(
                    <div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>
                      {t==="modeselect"?<select style={inp} value={newOut[k]} onChange={e=>setNO(k,e.target.value)}>{["NEFT/RTGS","IMPS","Cheque","Cash","UPI","Credit Card","Other"].map(m=><option key={m}>{m}</option>)}</select>
                      :<input style={{...inp,textAlign:t==="number"?"right":"left"}} type={t} value={newOut[k]} onChange={e=>setNO(k,e.target.value)}/>}
                    </div>
                  ))}
                  <div>
                    <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>Receipt / Doc (name)</div>
                    <input style={inp} value={newOut.receiptName} onChange={e=>setNO("receiptName",e.target.value)} placeholder="e.g. hotel_receipt_jun28.pdf"/>
                    <div style={{fontSize:9,color:G.gray400,marginTop:3}}>Document upload will be available once backend is connected (Phase 4)</div>
                  </div>
                </div>
                <button className="btn btn-primary" style={{background:"#6C3483",fontSize:12}} onClick={addOutgoing}>✓ Record Outgoing Payment</button>
              </div>
            </>
          )}

          {tab==="pl" && (
            <div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:600,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>P&L for this Tour File</div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <span style={{fontSize:12,color:G.gray600}}>ROE (₹ per unit):</span>
                  <input style={{padding:"5px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:80,textAlign:"right",outline:"none"}}
                    type="number" value={plRoe} onChange={e=>setPlRoe(Number(e.target.value))}/>
                  <span style={{fontSize:11,color:G.gray400}}>Adjust ROE to recalculate in INR</span>
                </div>
              </div>
              {/* Revenue */}
              {(()=>{
                const tourValINR = (parseFloat(pt.tourValue)||0) * plRoe;
                const totalIncome = pt.entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
                const totalCost   = (pt.outgoing||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
                const grossProfit = tourValINR - totalCost;
                const netProfit   = totalIncome - totalCost;
                const margin      = tourValINR > 0 ? Math.round(grossProfit/tourValINR*100) : 0;
                return (
                  <div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                      {[
                        ["Tour Value (INR)","₹ "+Math.round(tourValINR).toLocaleString(),G.navy],
                        ["Total Received","₹ "+Math.round(totalIncome).toLocaleString(),"#059669"],
                        ["Total Paid Out","₹ "+Math.round(totalCost).toLocaleString(),"#6B21A8"],
                        ["Gross Profit","₹ "+Math.round(grossProfit).toLocaleString(),grossProfit>=0?"#059669":G.accent],
                        ["Net (Received − Paid)","₹ "+Math.round(netProfit).toLocaleString(),netProfit>=0?"#059669":G.accent],
                        ["Margin (on Tour Value)",margin+"%",margin>=20?"#059669":margin>=10?"#F59E0B":G.accent],
                      ].map(([l,v,c])=>(
                        <div key={l} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:10}}>
                          <div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div>
                          <div style={{fontSize:15,fontWeight:700,color:c}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{height:8,background:G.gray100,borderRadius:4,overflow:"hidden",marginBottom:6}}>
                      <div style={{height:"100%",width:Math.min(Math.max(margin,0),100)+"%",background:margin>=20?"#059669":margin>=10?"#F59E0B":G.accent,borderRadius:4}}/>
                    </div>
                    <div style={{fontSize:11,color:G.gray400,textAlign:"right"}}>{margin}% margin on tour value</div>
                    <div style={{marginTop:14,background:G.gray50,borderRadius:8,padding:12}}>
                      <div style={{fontSize:10,color:G.gray600,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Breakdown</div>
                      {[
                        ["Revenue (tour value)",tourValINR,G.navy],
                        ...pt.entries.map(e=>[`Income: ${e.receipt||""} (${e.type})`,parseFloat(e.amount)||0,"#059669"]),
                        ...(pt.outgoing||[]).map(e=>[`Cost: ${e.vendor}`,-parseFloat(e.amount)||0,G.accent]),
                      ].map(([l,v,c],i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${G.gray100}`}}>
                          <span style={{fontSize:11,color:G.gray600}}>{l}</span>
                          <span style={{fontSize:11,fontWeight:600,color:c}}>₹ {Math.round(v).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </fieldset>
        <div style={{padding:"12px 20px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}


// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// ─── ALL_REPORTS ─────────────────────────────────────────────────────────────
