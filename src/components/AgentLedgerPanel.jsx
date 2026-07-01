import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function AgentLedgerPanel({ agent, queries, payments, onClose }) {
  const agentQueries = queries.filter(q=>q.agentId===agent.id||q.agentCompany===agent.company);
  const [lumpsum, setLumpsum] = useState({ amount:"", date:"", mode:"Wire Transfer", ref:"", note:"" });
  const [lumpsums, setLumpsums] = useState([]);
  const [allocating, setAllocating] = useState(null); // lumpsum being allocated
  const [alloc, setAlloc] = useState({}); // { queryId: amount }

  const totalRevenue  = agentQueries.reduce((s,q)=>{
    const pt=payments[q.id];
    return s+(pt?(parseFloat(pt.tourValue)||0)*(parseFloat(pt.roeUsed)||1):0);
  },0);
  const totalReceived = agentQueries.reduce((s,q)=>{
    const pt=payments[q.id];
    return s+(pt?(pt.entries||[]).reduce((ss,e)=>ss+(parseFloat(e.amount)||0),0):0);
  },0);
  const totalBalance  = totalRevenue - totalReceived;

  const addLumpsum = () => {
    if(!lumpsum.amount||!lumpsum.date) return;
    setLumpsums(prev=>[...prev, {...lumpsum, id:Date.now(), unallocated:parseFloat(lumpsum.amount), allocations:{}}]);
    setLumpsum({amount:"",date:"",mode:"Wire Transfer",ref:"",note:""});
  };

  const allocateLumpsum = (lId) => {
    setLumpsums(prev=>prev.map(l=>{
      if(l.id!==lId) return l;
      const newAllocs = {...l.allocations,...alloc};
      const totalAlloc = Object.values(newAllocs).reduce((s,v)=>s+(parseFloat(v)||0),0);
      return {...l, allocations:newAllocs, unallocated:parseFloat(l.amount)-totalAlloc};
    }));
    setAllocating(null); setAlloc({});
  };

  const inp={padding:"7px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,
    fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:700,height:"100vh",overflowY:"auto",
        boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"}}>
        <div style={{background:G.navy,padding:"14px 20px",flexShrink:0}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>AGENT LEDGER</div>
          <div style={{fontSize:17,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>{agent.company}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{agent.country} · {agent.contactName}</div>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          {/* Summary */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
            {[["Total Tour Value","₹ "+Math.round(totalRevenue).toLocaleString(),G.navy],
              ["Total Received","₹ "+Math.round(totalReceived).toLocaleString(),"#059669"],
              ["Total Balance Due","₹ "+Math.round(totalBalance).toLocaleString(),totalBalance>0?G.accent:"#059669"]
            ].map(([l,v,c])=>(
              <div key={l} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:12}}>
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>{l}</div>
                <div style={{fontSize:16,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Per tour file */}
          <div style={{fontSize:11,fontWeight:700,color:G.navy,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>
            Tour File Positions
          </div>
          {agentQueries.length===0?(
            <div style={{textAlign:"center",padding:24,color:G.gray400,fontSize:12,border:`1px dashed ${G.gray200}`,borderRadius:8,marginBottom:16}}>
              No queries from this agent yet
            </div>
          ):agentQueries.map(q=>{
            const pt=payments[q.id];
            const tourVal=(parseFloat(pt?.tourValue)||0)*(parseFloat(pt?.roeUsed)||1);
            const received=(pt?.entries||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
            const balance=tourVal-received;
            // Also show lumpsum allocations
            const lsAlloc = lumpsums.reduce((s,l)=>s+(parseFloat(l.allocations[q.id])||0),0);
            return (
              <div key={q.id} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,
                padding:"10px 14px",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:600}}>{q.groupName||q.clientName}</div>
                    <div style={{fontSize:11,color:G.gray400}}>{q.id}{q.tourFileId?" · 📁 "+q.tourFileId:""} · {q.sector||q.destination||""}</div>
                  </div>
                  <StatusBadge status={q.status}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {[["Tour Value",tourVal,G.navy],["Received",received,"#059669"],
                    ["Balance Due",balance,balance>0?G.accent:"#059669"],
                    ["Lumpsum Allocated",lsAlloc,"#6B21A8"]].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:"center",padding:"6px 0",background:G.gray50,borderRadius:6}}>
                      <div style={{fontSize:9,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div>
                      <div style={{fontSize:12,fontWeight:700,color:c}}>₹ {Math.round(v).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Lumpsum payments */}
          <div style={{fontSize:11,fontWeight:700,color:G.navy,textTransform:"uppercase",letterSpacing:"0.5px",margin:"20px 0 10px"}}>
            Lumpsum Payments (allocate across tour files)
          </div>
          {lumpsums.map(l=>(
            <div key={l.id} style={{background:G.white,border:`1px solid ${l.unallocated>0?"#FDE68A":G.gray200}`,
              borderRadius:8,padding:"10px 14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700}}>₹ {parseFloat(l.amount).toLocaleString()}</div>
                  <div style={{fontSize:11,color:G.gray600}}>{l.date} · {l.mode}{l.ref?" · "+l.ref:""}</div>
                </div>
                <span style={{fontSize:11,fontWeight:600,color:l.unallocated>0?"#92400E":"#059669",
                  background:l.unallocated>0?"#FEF3C7":"#DCFCE7",padding:"3px 10px",borderRadius:10}}>
                  ₹ {Math.round(l.unallocated).toLocaleString()} unallocated
                </span>
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setAllocating(l.id)}>
                  Allocate →
                </button>
              </div>
              {Object.entries(l.allocations).map(([qid,amt])=>{
                const q=agentQueries.find(q=>q.id===qid);
                return q?(
                  <div key={qid} style={{fontSize:11,color:G.gray600,padding:"2px 0"}}>
                    → {q.groupName||q.clientName} ({qid}): ₹ {parseFloat(amt).toLocaleString()}
                  </div>
                ):null;
              })}
            </div>
          ))}

          {/* Allocation modal */}
          {allocating && (
            <div style={{background:"#EBF5FB",border:"1px solid #A9CCE3",borderRadius:8,padding:14,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#1A5276",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>
                Allocate to Tour Files
              </div>
              {agentQueries.map(q=>(
                <div key={q.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{flex:1,fontSize:12}}>{q.groupName||q.clientName} <span style={{color:G.gray400,fontSize:11}}>({q.id})</span></div>
                  <input style={{...inp,width:100,textAlign:"right"}} type="number"
                    value={alloc[q.id]||""} onChange={e=>setAlloc(p=>({...p,[q.id]:e.target.value}))}
                    placeholder="₹ 0"/>
                </div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>{setAllocating(null);setAlloc({});}}>Cancel</button>
                <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>allocateLumpsum(allocating)}>Save Allocation</button>
              </div>
            </div>
          )}

          {/* Add lumpsum */}
          <div style={{background:"#F5EEF8",border:"1px solid #D2B4DE",borderRadius:8,padding:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#6C3483",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>
              + Record Lumpsum Payment from Agent
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              {[["Amount (INR)","number","amount"],["Date","date","date"],["Mode","text","mode"],["Reference","text","ref"],["Note","text","note"]].map(([l,t,k])=>(
                <div key={k}>
                  <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div>
                  <input style={{...inp,textAlign:t==="number"?"right":"left"}} type={t}
                    value={lumpsum[k]} onChange={e=>setLumpsum(p=>({...p,[k]:e.target.value}))}/>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{background:"#6C3483",fontSize:12}} onClick={addLumpsum}>
              + Record Lumpsum
            </button>
          </div>
        </div>

        <div style={{padding:"12px 20px",borderTop:`1px solid ${G.gray200}`,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}


// ─── ROOT APP (Login gate + Phase 4 state) ────────────────────────────────────


// ─── ROOT APP (Login gate + Phase 4 state) ────────────────────────────────────
// ─── PHASE 4: SUPABASE CLIENT ─────────────────────────────────────────────────
