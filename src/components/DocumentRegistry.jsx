import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, loadDocRegistry, saveDocRegistry, logAudit, db } = Lib;

export function DocumentRegistry({ query, onClose }) {
  const [docs, setDocs] = useState([]);
  useEffect(() => { loadDocRegistry(db, query.id).then(setDocs); }, [query.id]);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat]       = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [form, setForm] = useState({
    name:"", category:"Booking Confirmation", from:"Foreign Agent",
    date:new Date().toISOString().split("T")[0], status:"Received", driveLink:"", notes:""
  });
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));
  const STATUS_STYLE = {
    Pending:{bg:"#FEF3C7",color:"#92400E"}, Received:{bg:"#DBEAFE",color:"#1E40AF"},
    Verified:{bg:"#DCFCE7",color:"#166534"}, "Shared with Client":{bg:"#F3E8FF",color:"#6B21A8"},
    Archived:{bg:"#F3F4F6",color:"#6B7280"},
  };
  const inp = {padding:"7px 9px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};

  const saveDocs = (updated) => { setDocs(updated); saveDocRegistry(db, query.id, updated); };
  const addDoc = () => {
    if(!form.name) return;
    saveDocs([{...form,id:Date.now(),addedAt:new Date().toISOString()},...docs]);
    setForm({name:"",category:"Booking Confirmation",from:"Foreign Agent",date:new Date().toISOString().split("T")[0],status:"Received",driveLink:"",notes:""});
    setAdding(false);
  };
  const updateStatus = (id,status) => saveDocs(docs.map(d=>d.id===id?{...d,status}:d));
  const deleteDoc = (id) => saveDocs(docs.filter(d=>d.id!==id));
  const filtered = docs.filter(d=>{
    const ms = !search||d.name.toLowerCase().includes(search.toLowerCase())||(d.notes||"").toLowerCase().includes(search.toLowerCase());
    return ms&&(filterCat==="All"||d.category===filterCat)&&(filterStatus==="All"||d.status===filterStatus);
  });

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:700,height:"100vh",display:"flex",flexDirection:"column",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)"}}>
        <div style={{background:G.navy,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>DOCUMENT REGISTRY</div>
            <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.id}{query.tourFileId?" · 📁 "+query.tourFileId:""} · {docs.length} document{docs.length!==1?"s":""} logged</div>
          </div>
          <button onClick={()=>setAdding(true)} className="btn btn-primary" style={{fontSize:11}}>+ Log Document</button>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        <div style={{background:"#FEF9E7",borderBottom:`1px solid #F9E79F`,padding:"8px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:14}}>📎</span>
          <div style={{fontSize:11,color:"#784212"}}><strong>Phase 5 — Google Drive:</strong> Actual file upload enabled in Phase 5. For now log document details and paste a Google Drive link if scanned.</div>
        </div>
        <div style={{padding:"10px 18px",borderBottom:`1px solid ${G.gray200}`,display:"flex",gap:8,flexShrink:0,flexWrap:"wrap"}}>
          <input style={{...inp,width:180,padding:"6px 9px"}} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <select style={{...inp,width:"auto",padding:"6px 9px"}} value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
            <option value="All">All Categories</option>
            {DOC_CATEGORIES.map(c=><option key={c}>{c}</option>)}
          </select>
          <select style={{...inp,width:"auto",padding:"6px 9px"}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="All">All Statuses</option>
            {DOC_STATUS.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        {adding&&(
          <div style={{padding:"14px 18px",background:"#EBF5FB",borderBottom:`1px solid #A9CCE3`,flexShrink:0}}>
            <div style={{fontSize:12,fontWeight:600,color:"#1A5276",marginBottom:10}}>Log New Document</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Document Name *</div>
                <input style={inp} value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="e.g. Hotel Booking Confirmation — Crown Himalaya"/>
              </div>
              <div>
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Category</div>
                <select style={inp} value={form.category} onChange={e=>setF("category",e.target.value)}>{DOC_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
              </div>
              <div>
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Received From</div>
                <select style={inp} value={form.from} onChange={e=>setF("from",e.target.value)}>{DOC_FROM.map(f=><option key={f}>{f}</option>)}</select>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:8,marginBottom:8}}>
              <div>
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Date Received</div>
                <input style={inp} type="date" value={form.date} onChange={e=>setF("date",e.target.value)}/>
              </div>
              <div>
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Status</div>
                <select style={inp} value={form.status} onChange={e=>setF("status",e.target.value)}>{DOC_STATUS.map(s=><option key={s}>{s}</option>)}</select>
              </div>
              <div>
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Google Drive Link</div>
                <input style={inp} value={form.driveLink} onChange={e=>setF("driveLink",e.target.value)} placeholder="https://drive.google.com/..."/>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setAdding(false)}>Cancel</button>
              <button className="btn btn-primary" style={{fontSize:11,opacity:form.name?1:0.5}} onClick={addDoc}>Log Document</button>
            </div>
          </div>
        )}
        <div style={{flex:1,overflowY:"auto",padding:"12px 18px"}}>
          {filtered.length===0?(
            <div style={{textAlign:"center",padding:48,color:G.gray400}}>
              <div style={{fontSize:32,marginBottom:8}}>📁</div>
              <div style={{fontSize:14,fontWeight:500}}>{docs.length===0?"No documents logged yet":"No documents match filters"}</div>
            </div>
          ):filtered.map(d=>{
            const ss=STATUS_STYLE[d.status]||STATUS_STYLE.Received;
            return (
              <div key={d.id} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                      <span style={{fontSize:13,fontWeight:600}}>{d.name}</span>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:ss.bg,color:ss.color,fontWeight:600}}>{d.status}</span>
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:4}}>
                      <span style={{fontSize:11,color:G.gray600}}>📂 {d.category}</span>
                      <span style={{fontSize:11,color:G.gray600}}>📨 {d.from}</span>
                      <span style={{fontSize:11,color:G.gray400}}>🗓 {d.date}</span>
                    </div>
                    {d.driveLink&&<a href={d.driveLink} target="_blank" rel="noopener noreferrer"
                      style={{fontSize:11,color:"#1A5276",textDecoration:"none",background:"#EBF5FB",padding:"2px 8px",borderRadius:5}}>🔗 Open in Drive</a>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}>
                    <select value={d.status} onChange={e=>updateStatus(d.id,e.target.value)}
                      style={{padding:"3px 6px",borderRadius:5,fontSize:10,fontFamily:"'Inter',sans-serif",border:`1px solid ${ss.color}`,background:ss.bg,color:ss.color,fontWeight:600,cursor:"pointer",outline:"none"}}>
                      {DOC_STATUS.map(s=><option key={s}>{s}</option>)}
                    </select>
                    <button onClick={()=>deleteDoc(d.id)}
                      style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px solid #FECACA",background:"#FFF5F5",color:"#C0392B",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{padding:"8px 18px",borderTop:`1px solid ${G.gray200}`,background:G.gray50,display:"flex",gap:10,flexShrink:0}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{flex:1}}/>
          {DOC_STATUS.map(s=>{const c=docs.filter(d=>d.status===s).length;const ss=STATUS_STYLE[s];return c>0?<span key={s} style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:ss.bg,color:ss.color,fontWeight:600}}>{s}: {c}</span>:null;})}
        </div>
      </div>
    </div>
  );
}


export function DocRegistryInline({ queryId, tourFileId, currentUser, readOnly }) {
  const [docs, setDocs] = useState([]);
  useEffect(() => { loadDocRegistry(db, queryId).then(setDocs); }, [queryId]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({name:"",category:"Booking Confirmation",from:"Foreign Agent",date:new Date().toISOString().split("T")[0],status:"Received",driveLink:""});
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));
  const STATUS_STYLE = {Pending:{bg:"#FEF3C7",color:"#92400E"},Received:{bg:"#DBEAFE",color:"#1E40AF"},Verified:{bg:"#DCFCE7",color:"#166534"},"Shared with Client":{bg:"#F3E8FF",color:"#6B21A8"},Archived:{bg:"#F3F4F6",color:"#6B7280"}};
  const inp = {padding:"6px 8px",border:`1px solid ${G.gray200}`,borderRadius:5,fontSize:11,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const saveDocs = (u) => { setDocs(u); saveDocRegistry(db, queryId, u, tourFileId); };
  const addDoc = () => {
    if(!form.name) return;
    saveDocs([{...form,id:Date.now(),addedAt:new Date().toISOString()},...docs]);
    logAudit(db, queryId, currentUser?.name, `Document logged: "${form.name}" (${form.category}, status ${form.status})`);
    setForm({name:"",category:"Booking Confirmation",from:"Foreign Agent",date:new Date().toISOString().split("T")[0],status:"Received",driveLink:""});
    setAdding(false);
  };
  return (
    <fieldset disabled={readOnly} style={{border:"none",margin:0,padding:0,minWidth:0}}>
      {readOnly && (
        <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#92400E",marginBottom:10}}>
          🔒 This tour file is cancelled — viewing only, nothing here is editable.
        </div>
      )}
      {!adding?<button className="btn btn-ghost" style={{fontSize:11,marginBottom:10}} onClick={()=>setAdding(true)}>+ Log Document</button>:(
        <div style={{background:"#EBF5FB",border:"1px solid #A9CCE3",borderRadius:8,padding:12,marginBottom:12}}>
          <input style={{...inp,marginBottom:8}} value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="Document name..."/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <select style={inp} value={form.category} onChange={e=>setF("category",e.target.value)}>{DOC_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
            <select style={inp} value={form.from} onChange={e=>setF("from",e.target.value)}>{DOC_FROM.map(f=><option key={f}>{f}</option>)}</select>
            <input style={inp} type="date" value={form.date} onChange={e=>setF("date",e.target.value)}/>
            <select style={inp} value={form.status} onChange={e=>setF("status",e.target.value)}>{DOC_STATUS.map(s=><option key={s}>{s}</option>)}</select>
          </div>
          <input style={{...inp,marginBottom:8}} value={form.driveLink} onChange={e=>setF("driveLink",e.target.value)} placeholder="Google Drive link (optional)..."/>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setAdding(false)}>Cancel</button>
            <button className="btn btn-primary" style={{fontSize:11}} onClick={addDoc}>Log</button>
          </div>
        </div>
      )}
      {docs.length===0?<div style={{textAlign:"center",padding:"20px 0",color:G.gray400,fontSize:12}}>No documents logged yet</div>:docs.map(d=>{
        const ss=STATUS_STYLE[d.status]||STATUS_STYLE.Received;
        return (
          <div key={d.id} style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:7,padding:"9px 12px",marginBottom:7}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
              <span style={{fontSize:12,fontWeight:500,flex:1}}>{d.name}</span>
              <span style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:ss.bg,color:ss.color,fontWeight:600}}>{d.status}</span>
            </div>
            <div style={{display:"flex",gap:10,fontSize:11,color:G.gray400,flexWrap:"wrap"}}>
              <span>📂 {d.category}</span><span>📨 {d.from}</span><span>🗓 {d.date}</span>
            </div>
            {d.driveLink&&<a href={d.driveLink} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#1A5276",background:"#EBF5FB",padding:"2px 7px",borderRadius:5,textDecoration:"none",display:"inline-block",marginTop:4}}>🔗 Open in Drive</a>}
          </div>
        );
      })}
    </fieldset>
  );
}
