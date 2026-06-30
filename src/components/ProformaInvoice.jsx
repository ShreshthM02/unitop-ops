import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,AllQueriesView,CancelModal,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,LoginScreen,MealPlanDocument,NewQueryModal,OwnPasswordChange,PLReport,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,SmartSearch,TaxInvoice,TeamView,TemplatesHub,TourBriefingSheet,UnitopApp,UserManagementPanel,UserProfilePanel,VendorLedgerPanel,VendorMaster } = Comp;

export default function ProformaInvoice({ query, onClose }) {
  const settings = (() => { try { return JSON.parse(localStorage.getItem('unitop_doc_settings')||'{}'); } catch(e) { return {}; } })();
  const nextSerial = settings.proforma?.serial || 1;
  const prefix     = settings.proforma?.prefix  || 'PI';
  const today = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});

  const [activeTab,   setActiveTab]   = React.useState('content');
  const [headerAllPages, setHeaderAllPages] = React.useState(false);
  const [footerAllPages, setFooterAllPages] = React.useState(false);
  const [showPageNums,   setShowPageNums]   = React.useState(false);
  const [digitalSign,    setDigitalSign]    = React.useState(false);

  const [inv, setInv] = React.useState({
    invoiceNo:   `${prefix}-${new Date().getFullYear()}-${String(nextSerial).padStart(3,'0')}`,
    date:        today,
    validUntil:  '',
    attnName:    query.agentName || query.correspondent || '',
    attnCompany: query.agentCompany || '',
    attnCity:    query.agentCountry || '',
    subject:     `GROUP FROM ${query.travelDate||''} x ${query.pax||'??'} PAX PAYING`,
    toName:      query.agentName || query.correspondent || '',
    toCompany:   query.agentCompany || '',
    toAddress:   query.agentCountry || '',
    toGSTIN:     '',
    tourRef:     query.tourFileId || query.id,
    groupName:   query.groupName || query.clientName || '',
    sector:      query.destination || query.sector || '',
    travelDate:  query.travelDate || '',
    pax:         query.pax || '',
    items: [
      { desc:`Land Package — ${query.destination||query.sector||''} (${query.pax||'?'} Pax)`, qty:query.pax||1, unit:'Per Pax', rate:'', amount:'' },
      { desc:'Airport Transfers', qty:1, unit:'Lump Sum', rate:'', amount:'' },
    ],
    currency: 'USD',
    roeNote:  '',
    notes:    'This is a Proforma Invoice. Final Tax Invoice will be issued upon confirmation.\n\nKindly arrange the advance payment at the earliest to enable us to proceed with reservations.',
  });

  const setF = (k,v) => setInv(p=>({...p,[k]:v}));
  const updItem = (i,f,v) => setInv(p=>{
    const items = p.items.map((it,xi)=>{
      if(xi!==i) return it;
      const u={...it,[f]:v};
      if((f==='rate'||f==='qty')&&u.rate&&u.qty) u.amount=(parseFloat(u.rate||0)*parseFloat(u.qty||0)).toFixed(2);
      return u;
    });
    return {...p,items};
  });

  const subTotal   = inv.items.reduce((s,it)=>s+(parseFloat(it.amount)||0),0);
  const grandTotal = subTotal;

  const buildPrintHTML = () => {
    const words     = numToWords(grandTotal);
    const stampHTML = digitalSign ? `<img src="${STAMP_B64}" style="height:70pt;width:auto;display:block;margin-bottom:4pt" alt="Digital Stamp"/>` : '';
    const pageNum   = (n) => showPageNums ? `<div class="page-num">Page ${n}</div>` : '';
    const rows = inv.items.map(it=>`
      <tr><td>${it.desc}</td><td style="text-align:center">${it.qty}</td>
      <td style="text-align:center">${it.unit}</td>
      <td class="amount">${inv.currency} ${parseFloat(it.rate||0).toLocaleString()}</td>
      <td class="amount">${inv.currency} ${parseFloat(it.amount||0).toLocaleString()}</td></tr>`).join('');

    return `<!DOCTYPE html><html><head>
      <title>Proforma Invoice ${inv.invoiceNo}</title>
      <style>${invoiceLetterheadCSS}</style>
      ${showPageNums ? '<style>@page{@bottom-right{content:"Page "counter(page);font-size:7.5pt;color:#999;font-family:Inter,Arial,sans-serif;}}</style>' : ''}
    </head><body><div class="page${footerAllPages ? ' reserve-footer' : ''}">
      ${invoiceLetterheadHTML(1, headerAllPages)}
      <div class="doc-body">
        <!-- Addressee -->
        <div style="display:table;width:100%;margin-bottom:10pt">
          <div style="display:table-cell;vertical-align:top">
            <div style="font-size:10.5pt;font-weight:bold">KIND ATTN: &nbsp;&nbsp;${inv.attnName}</div>
            ${inv.attnCompany?`<div style="font-size:10.5pt;padding-left:88pt">${inv.attnCompany}</div>`:''}
            ${inv.attnCity?`<div style="font-size:10.5pt;padding-left:88pt">${inv.attnCity}</div>`:''}
          </div>
          <div style="display:table-cell;vertical-align:top;text-align:right;white-space:nowrap">
            <div style="font-size:10.5pt">DATE: <strong>${inv.date}</strong></div>
          </div>
        </div>
        <div style="font-size:10.5pt;font-weight:bold;margin-bottom:4pt">AS DESIRED PLEASE FIND INVOICE AS UNDER:</div>
        <div style="font-size:10.5pt;font-weight:bold;text-decoration:underline;margin-bottom:12pt">RE: ${inv.subject}</div>
        <!-- Invoice meta -->
        <div style="display:flex;justify-content:space-between;margin-bottom:7pt;font-size:9pt">
          <div>
            <div><strong>Invoice No:</strong> <span style="color:#8B1A1A;font-weight:700">${inv.invoiceNo}</span></div>
            <div><strong>Tour Ref:</strong> ${inv.tourRef}</div>
            ${inv.validUntil?`<div><strong>Valid Until:</strong> ${inv.validUntil}</div>`:''}
          </div>
          <div style="text-align:right">
            <div><strong>Travel Date:</strong> ${inv.travelDate||'TBC'}</div>
            <div><strong>Sector:</strong> ${inv.sector}</div>
            <div><strong>No. of Pax:</strong> ${inv.pax||'TBC'}</div>
          </div>
        </div>
        <!-- Parties -->
        <div class="parties">
          <div class="party-block">
            <div class="party-label">Billed To</div>
            <div class="party-name">${inv.toCompany||inv.toName}</div>
            ${inv.toName&&inv.toCompany?`<div class="party-detail">Attn: ${inv.toName}</div>`:''}
            ${inv.toAddress?`<div class="party-detail">${inv.toAddress}</div>`:''}
            ${inv.toGSTIN?`<div class="party-detail">GSTIN: ${inv.toGSTIN}</div>`:''}
          </div>
          <div class="party-block">
            <div class="party-label">Billed By</div>
            <div class="party-name">Unitop Tours &amp; Travel Pvt. Ltd.</div>
            <div class="party-detail">506, DDA-2F, District Centre, Janakpuri<br/>New Delhi – 110058, India</div>
            <div class="party-detail">GSTIN: 07AAACU4406H1ZK &nbsp;|&nbsp; PAN: AAACU4406H</div>
          </div>
        </div>
        <!-- Items -->
        <table>
          <thead><tr>
            <th style="width:45%">Description</th><th style="width:8%;text-align:center">Qty</th>
            <th style="width:12%;text-align:center">Unit</th><th style="width:15%;text-align:right">Rate</th>
            <th style="width:20%;text-align:right">Amount</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <!-- Totals -->
        <div class="totals-block">
          <div class="total-row"><span class="lbl">Sub Total</span><span>${inv.currency} ${subTotal.toLocaleString(undefined,{minimumFractionDigits:2})}</span></div>
          ${inv.roeNote?`<div class="total-row" style="font-size:8.5pt;color:#888"><span>ROE Note</span><span>${inv.roeNote}</span></div>`:''}
          <div class="total-row grand"><span class="lbl">Total Due</span><span>${inv.currency} ${grandTotal.toLocaleString(undefined,{minimumFractionDigits:2})}</span></div>
        </div>
        <!-- Amount in words -->
        <div style="font-size:10pt;font-style:italic;font-weight:600;margin-bottom:12pt">
          IN WORDS: ${inv.currency} ${words.toUpperCase()}
        </div>
        <!-- Bank details -->
        <div class="bank-box">
          <div class="bank-title">Bank Details as Under:</div>
          <div class="bank-row"><span class="bank-key">Account Name</span><span class="bank-val">Unitop Tours & Travel (P) Ltd.</span></div>
          <div class="bank-row"><span class="bank-key">Bank Name</span><span class="bank-val">Punjab National Bank</span></div>
          <div class="bank-row"><span class="bank-key">Current A/C No.</span><span class="bank-val">1503002100024279</span></div>
          <div class="bank-row"><span class="bank-key">Swift Code</span><span class="bank-val">PUNBINBBISB</span></div>
          <div class="bank-row"><span class="bank-key">Address</span><span class="bank-val">B-1, Community Centre, Janakpuri, New Delhi – 110058 (India)</span></div>
        </div>
        ${inv.notes?`<div class="notes-box">${inv.notes.replace(/\n/g,'<br/>')}</div>`:''}
        <div style="margin-top:14pt;">
          ${stampHTML}
          ${digitalSign ? '' : '<div style="height:44pt;"></div>'}
          <div style="width:130pt;border-top:1pt solid #1A3A52;margin-bottom:3pt;"></div>
          <div style="font-size:10pt;font-weight:700;color:#1A3A52;">For Unitop Tours &amp; Travel (P) Ltd.</div>
          <div style="font-size:9pt;color:#888;">(Authorised Signatory)</div>
        </div>
      </div>
      <div class="print-footer${footerAllPages ? ' on-all-pages' : ''}">
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
    </div></body></html>`;
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) { alert('Please allow pop-ups for this site to print/export PDF.'); return; }
    win.document.write(buildPrintHTML());
    win.document.close();
    setTimeout(()=>win.print(), 500);
  };

  const inp = {padding:'6px 8px',border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:'100%',outline:'none',color:G.gray800,background:G.white};
  const lbl = {fontSize:10,color:G.gray600,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:3,display:'block'};
  const Section = ({title}) => <div style={{fontSize:11,fontWeight:700,color:'#fff',background:G.navy,padding:'5px 10px',borderRadius:5,margin:'14px 0 8px'}}>{title}</div>;
  const Toggle = ({label,val,onToggle}) => (
    <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:11,color:G.gray600}}>
      <div onClick={onToggle} style={{width:30,height:16,borderRadius:8,background:val?G.navy:G.gray200,position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
        <div style={{position:'absolute',top:2,left:val?14:2,width:12,height:12,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
      </div>{label}
    </label>
  );

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:720,height:'100vh',display:'flex',flexDirection:'column',boxShadow:'-4px 0 24px rgba(0,0,0,0.15)'}}>
        {/* Header */}
        <div style={{background:G.navy,padding:'12px 18px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',letterSpacing:1}}>DOCUMENT</div>
            <div style={{fontSize:16,fontWeight:700,color:'#fff',fontFamily:"'Playfair Display',serif"}}>Proforma Invoice</div>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.5)'}}>{query.id} · {query.destination||query.sector}</div>
          </div>
          <button onClick={handlePrint} className="btn btn-primary" style={{fontSize:11}}>🖨 Print / PDF</button>
          <button onClick={onClose} className="btn btn-ghost" style={{background:'rgba(255,255,255,0.1)',color:'#fff',border:'none'}}>✕</button>
        </div>
        {/* Toggles */}
        <div style={{padding:'7px 18px',background:G.gray50,borderBottom:`1px solid ${G.gray200}`,display:'flex',gap:16,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
          <Toggle label="Header on all pages" val={headerAllPages} onToggle={()=>setHeaderAllPages(p=>!p)}/>
          <Toggle label="Footer on all pages" val={footerAllPages} onToggle={()=>setFooterAllPages(p=>!p)}/>
          <Toggle label="Page numbers"        val={showPageNums}   onToggle={()=>setShowPageNums(p=>!p)}/>
          <Toggle label="Digital stamp"       val={digitalSign}    onToggle={()=>setDigitalSign(p=>!p)}/>
        </div>
        {/* Tabs */}
        <div style={{display:'flex',borderBottom:`1px solid ${G.gray200}`,flexShrink:0}}>
          {[['content','✏ Content'],['preview','👁 Preview']].map(([id,label])=>(
            <button key={id} onClick={()=>setActiveTab(id)}
              style={{padding:'9px 16px',border:'none',cursor:'pointer',fontSize:12,fontFamily:"'Inter',sans-serif",
                background:'none',color:activeTab===id?G.accent:G.gray600,fontWeight:activeTab===id?700:400,
                borderBottom:`2px solid ${activeTab===id?G.accent:'transparent'}`}}>
              {label}
            </button>
          ))}
        </div>

        {/* CONTENT TAB */}
        {activeTab==='content' && <div style={{flex:1,overflowY:'auto',padding:'14px 20px'}}>
          <Section title="📬 Addressee"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:8}}>
            <div><label style={lbl}>Kind Attn (Name)</label><input style={inp} value={inv.attnName} onChange={e=>setF('attnName',e.target.value)}/></div>
            <div><label style={lbl}>Company</label><input style={inp} value={inv.attnCompany} onChange={e=>setF('attnCompany',e.target.value)}/></div>
            <div><label style={lbl}>Country / City</label><input style={inp} value={inv.attnCity} onChange={e=>setF('attnCity',e.target.value)}/></div>
            <div><label style={lbl}>RE / Subject Line</label><input style={inp} value={inv.subject} onChange={e=>setF('subject',e.target.value)}/></div>
          </div>
          <Section title="📋 Invoice Details"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:8}}>
            <div><label style={lbl}>Invoice Number</label><input style={inp} value={inv.invoiceNo} onChange={e=>setF('invoiceNo',e.target.value)}/></div>
            <div><label style={lbl}>Date</label><input style={inp} value={inv.date} onChange={e=>setF('date',e.target.value)}/></div>
            <div><label style={lbl}>Valid Until</label><input style={inp} value={inv.validUntil} onChange={e=>setF('validUntil',e.target.value)} placeholder="e.g. 15 August 2026"/></div>
            <div><label style={lbl}>Tour Reference</label><input style={inp} value={inv.tourRef} onChange={e=>setF('tourRef',e.target.value)}/></div>
          </div>
          <Section title="📬 Billed To"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:8}}>
            <div><label style={lbl}>Contact Name</label><input style={inp} value={inv.toName} onChange={e=>setF('toName',e.target.value)}/></div>
            <div><label style={lbl}>Company / Agency</label><input style={inp} value={inv.toCompany} onChange={e=>setF('toCompany',e.target.value)}/></div>
            <div><label style={lbl}>Country / Address</label><input style={inp} value={inv.toAddress} onChange={e=>setF('toAddress',e.target.value)}/></div>
            <div><label style={lbl}>GSTIN (if applicable)</label><input style={inp} value={inv.toGSTIN} onChange={e=>setF('toGSTIN',e.target.value)} placeholder="For Indian agents"/></div>
          </div>
          <Section title="✈ Tour Details"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:8}}>
            <div><label style={lbl}>Group Name</label><input style={inp} value={inv.groupName} onChange={e=>setF('groupName',e.target.value)}/></div>
            <div><label style={lbl}>Travel Date</label><input style={inp} value={inv.travelDate} onChange={e=>setF('travelDate',e.target.value)}/></div>
            <div><label style={lbl}>No. of Pax</label><input style={inp} value={inv.pax} onChange={e=>setF('pax',e.target.value)}/></div>
          </div>
          <Section title="💰 Line Items"/>
          <div style={{marginBottom:8}}>
            <div style={{marginBottom:6}}><label style={lbl}>Currency</label>
              <select style={{...inp,width:120}} value={inv.currency} onChange={e=>setF('currency',e.target.value)}>
                {['USD','EUR','GBP','AUD','SGD','THB','INR','Other'].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead><tr style={{background:G.gray100}}>
                {['Description','Qty','Unit','Rate','Amount',''].map(h=><th key={h} style={{padding:'5px 6px',textAlign:'left',fontSize:10,fontWeight:600,color:G.gray600,borderBottom:`1px solid ${G.gray200}`}}>{h}</th>)}
              </tr></thead>
              <tbody>{inv.items.map((it,i)=>(
                <tr key={i}>
                  <td style={{padding:'3px 4px'}}><input style={{...inp,padding:'3px 5px',fontSize:11}} value={it.desc} onChange={e=>updItem(i,'desc',e.target.value)}/></td>
                  <td style={{padding:'3px 4px',width:48}}><input style={{...inp,padding:'3px 5px',fontSize:11,textAlign:'center'}} value={it.qty} onChange={e=>updItem(i,'qty',e.target.value)}/></td>
                  <td style={{padding:'3px 4px',width:80}}><input style={{...inp,padding:'3px 5px',fontSize:11}} value={it.unit} onChange={e=>updItem(i,'unit',e.target.value)}/></td>
                  <td style={{padding:'3px 4px',width:90}}><input style={{...inp,padding:'3px 5px',fontSize:11,textAlign:'right'}} value={it.rate} onChange={e=>updItem(i,'rate',e.target.value)}/></td>
                  <td style={{padding:'3px 4px',width:100}}><input style={{...inp,padding:'3px 5px',fontSize:11,textAlign:'right',fontWeight:600,color:G.navy}} value={it.amount} onChange={e=>updItem(i,'amount',e.target.value)}/></td>
                  <td style={{width:24,textAlign:'center'}}><span style={{cursor:'pointer',color:G.gray400,fontSize:14}} onClick={()=>setInv(p=>({...p,items:p.items.filter((_,xi)=>xi!==i)}))}>✕</span></td>
                </tr>
              ))}</tbody>
            </table>
            <button className="btn btn-ghost" style={{fontSize:11,marginTop:6}} onClick={()=>setInv(p=>({...p,items:[...p.items,{desc:'',qty:1,unit:'Per Pax',rate:'',amount:''}]}))}>+ Add Line Item</button>
          </div>
          {/* Totals preview */}
          <div style={{background:G.gray50,borderRadius:8,padding:'10px 14px',marginBottom:8}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
              <span style={{color:G.gray600}}>Sub Total</span>
              <span style={{fontWeight:600}}>{inv.currency} {subTotal.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:700,color:G.navy,background:G.white,borderRadius:6,padding:'6px 10px',border:`1px solid ${G.gray200}`}}>
              <span>Total Due</span><span>{inv.currency} {grandTotal.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
            </div>
            <div style={{fontSize:11,fontStyle:'italic',color:G.gray600,marginTop:6}}>
              In Words: {inv.currency} {numToWords(grandTotal).toUpperCase()}
            </div>
          </div>
          <div style={{marginBottom:8}}><label style={lbl}>ROE Note (optional)</label>
            <input style={inp} value={inv.roeNote} onChange={e=>setF('roeNote',e.target.value)} placeholder="e.g. Rate of exchange: 1 USD = ₹ 85.00"/></div>
          <Section title="📝 Notes"/>
          <textarea style={{...inp,minHeight:72,resize:'vertical'}} value={inv.notes} onChange={e=>setF('notes',e.target.value)}/>
        </div>}

        {/* PREVIEW TAB */}
        {activeTab==='preview' && (
          <div style={{flex:1,overflowY:'auto',background:'#525659',display:'flex',justifyContent:'center',padding:'20px 0'}}>
            <iframe
              title="Print Preview"
              srcDoc={(()=>{try{return buildPrintHTML();}catch(e){return '<html><body style="font-family:monospace;padding:20px;color:#c00">Preview error: '+e.message+'</body></html>';}})()}
              style={{width:'210mm',minHeight:'297mm',border:'none',boxShadow:'0 4px 24px rgba(0,0,0,0.35)',background:'#fff'}}
            />
          </div>
        )}
        {/* Footer */}
        <div style={{padding:'10px 18px',borderTop:`1px solid ${G.gray200}`,display:'flex',gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{flex:1}}/>
          <button onClick={handlePrint} className="btn btn-primary">🖨 Print / PDF</button>
        </div>
      </div>
    </div>
  );
}

