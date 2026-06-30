import React from 'react';
import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,CancelModal,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,LoginScreen,MealPlanDocument,NewQueryModal,OwnPasswordChange,PLReport,ProformaInvoice,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,SmartSearch,TaxInvoice,TeamView,TemplatesHub,TourBriefingSheet,UnitopApp,UserManagementPanel,UserProfilePanel,VendorLedgerPanel,VendorMaster } = Comp;

export default function AllQueriesView({queries,agents,onOpenQuery,onConvert,currentUser}){
  const [search,setSearch]=React.useState('');
  const [filterStage,setFilterStage]=React.useState('All');
  const [filterAgent,setFilterAgent]=React.useState('All');
  const [filterSrc,setFilterSrc]=React.useState('All');
  const [sortCol,setSortCol]=React.useState('date');
  const [sortDir,setSortDir]=React.useState('desc');
  const [page,setPage]=React.useState(1);
  const PER_PAGE=20;
  const stages=['All',...PIPELINE_STAGES.map(s=>s.label)];
  const stageIds=['All',...PIPELINE_STAGES.map(s=>s.id)];
  const agentList=['All',...[...new Set(queries.map(q=>q.agentCompany||'').filter(Boolean))].sort()];
  const sources=['All',...[...new Set(queries.map(q=>q.source||'').filter(Boolean))].sort()];
  const stageLabel=id=>PIPELINE_STAGES.find(s=>s.id===id)?.label||id;
  const stageColor=id=>PIPELINE_STAGES.find(s=>s.id===id)?.color||'#888';
  const filtered=queries.filter(q=>{
    const s=search.toLowerCase();
    const ms=!s||(q.id||'').toLowerCase().includes(s)||(q.groupName||q.clientName||'').toLowerCase().includes(s)||(q.destination||q.sector||'').toLowerCase().includes(s)||(q.agentCompany||'').toLowerCase().includes(s)||(q.tourFileId||'').toLowerCase().includes(s);
    const mst=filterStage==='All'||q.status===stageIds[stages.indexOf(filterStage)];
    const mag=filterAgent==='All'||q.agentCompany===filterAgent;
    const msr=filterSrc==='All'||q.source===filterSrc;
    return ms&&mst&&mag&&msr;
  });
  const sorted=[...filtered].sort((a,b)=>{
    let av,bv;
    if(sortCol==='date'){av=a.date||'';bv=b.date||'';}
    else if(sortCol==='client'){av=(a.groupName||a.clientName||'').toLowerCase();bv=(b.groupName||b.clientName||'').toLowerCase();}
    else if(sortCol==='dest'){av=(a.destination||a.sector||'').toLowerCase();bv=(b.destination||b.sector||'').toLowerCase();}
    else if(sortCol==='stage'){av=stageIds.indexOf(a.status);bv=stageIds.indexOf(b.status);}
    else if(sortCol==='agent'){av=(a.agentCompany||'').toLowerCase();bv=(b.agentCompany||'').toLowerCase();}
    else if(sortCol==='travel'){av=a.travelDate||'';bv=b.travelDate||'';}
    else{av=a.id||'';bv=b.id||'';}
    if(av<bv)return sortDir==='asc'?-1:1;
    if(av>bv)return sortDir==='asc'?1:-1;
    return 0;
  });
  const totalPages=Math.max(1,Math.ceil(sorted.length/PER_PAGE));
  const pageData=sorted.slice((page-1)*PER_PAGE,page*PER_PAGE);
  const onSort=col=>{if(sortCol===col)setSortDir(d=>d==='asc'?'desc':'asc');else{setSortCol(col);setSortDir('asc');}setPage(1);};
  const SortIcon=({col})=>sortCol===col?<span style={{marginLeft:3,fontSize:10}}>{sortDir==='asc'?'▲':'▼'}</span>:<span style={{marginLeft:3,fontSize:10,opacity:0.3}}>⇅</span>;
  const exportCSV=()=>{const cols=['ID','Group/Client','Destination','Agent','Stage','Travel Date','Pax','Source','Tour File'];const rows=sorted.map(q=>[q.id,q.groupName||q.clientName,q.destination||q.sector,q.agentCompany,stageLabel(q.status),q.travelDate,q.pax,q.source,q.tourFileId||'']);const csv=[cols,...rows].map(r=>r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='queries.csv';a.click();URL.revokeObjectURL(url);};
  const inp={padding:"6px 10px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none",color:G.gray800,background:G.white};
  const th={padding:"9px 10px",textAlign:"left",fontSize:11,fontWeight:700,color:G.white,background:G.navy,cursor:"pointer",userSelect:"none",whiteSpace:"nowrap",borderRight:"1px solid rgba(255,255,255,0.1)"};
  const td={padding:"8px 10px",fontSize:11,borderBottom:`1px solid ${G.gray100}`,verticalAlign:"middle"};
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",margin:"-16px -20px"}}>
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${G.gray200}`,background:G.gray50,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",flexShrink:0}}>
        <div style={{position:"relative",flex:1,minWidth:200}}>
          <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:14,color:G.gray400,pointerEvents:"none"}}>🔍</span>
          <input style={{...inp,paddingLeft:30,width:"100%"}} placeholder="Search ID, client, destination, agent..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
        </div>
        <select style={{...inp,minWidth:130}} value={filterStage} onChange={e=>{setFilterStage(e.target.value);setPage(1);}}>{stages.map(s=><option key={s}>{s}</option>)}</select>
        <select style={{...inp,minWidth:140}} value={filterAgent} onChange={e=>{setFilterAgent(e.target.value);setPage(1);}}>{agentList.map(a=><option key={a}>{a}</option>)}</select>
        <select style={{...inp,minWidth:100}} value={filterSrc} onChange={e=>{setFilterSrc(e.target.value);setPage(1);}}>{sources.map(s=><option key={s}>{s}</option>)}</select>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:11,color:G.gray400}}>{filtered.length} queries</span>
          <button className="btn btn-ghost" style={{fontSize:11}} onClick={exportCSV}>📥 CSV</button>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
          <colgroup>
            <col style={{width:90}}/><col style={{width:68}}/><col style={{width:"18%"}}/>
            <col style={{width:"13%"}}/><col style={{width:"13%"}}/><col style={{width:100}}/>
            <col style={{width:80}}/><col style={{width:40}}/><col style={{width:40}}/>
          </colgroup>
          <thead style={{position:"sticky",top:0,zIndex:2}}>
            <tr>
              {[['id','Query ID'],['date','Date'],['client','Client / Group'],['dest','Destination'],['agent','Agent'],['stage','Stage'],['travel','Travel Date'],['pax','Pax']].map(([col,label])=>(
                <th key={col} style={th} onClick={()=>onSort(col)}>{label}<SortIcon col={col}/></th>
              ))}
              <th style={{...th,cursor:"default",width:40}}></th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((q,i)=>{
              const user=USERS.find(u=>u.id===q.assignedTo);
              const sc=stageColor(q.status);
              return(
                <tr key={q.id} onClick={()=>onOpenQuery(q)} style={{background:i%2===0?G.white:G.gray50,cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#EBF5FB"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?G.white:G.gray50}>
                  <td style={{...td,fontFamily:"monospace",fontSize:10,fontWeight:700,color:sc}}>{q.id}</td>
                  <td style={{...td,color:G.gray400,fontSize:10,maxWidth:72,whiteSpace:'nowrap'}}>{q.date||'—'}</td>
                  <td style={{...td,fontWeight:600,width:'18%',overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.groupName||q.clientName}</td>
                  <td style={{...td,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.destination||q.sector||'—'}</td>
                  <td style={{...td,fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.agentCompany||'—'}</td>
                  <td style={td}><span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:sc+'22',color:sc,fontWeight:600,whiteSpace:"nowrap"}}>{stageLabel(q.status)}</span></td>
                  <td style={{...td,fontSize:10,whiteSpace:"nowrap"}}>{q.travelDate||'—'}</td>
                  <td style={{...td,textAlign:"center"}}>{q.pax||'—'}</td>
                  <td style={{...td,textAlign:"center"}} onClick={e=>e.stopPropagation()}>{user&&<Avatar user={user} size={20}/>}</td>
                </tr>
              );
            })}
            {pageData.length===0&&<tr><td colSpan={9} style={{textAlign:"center",padding:48,color:G.gray400,fontSize:13}}>No queries match your filters</td></tr>}
          </tbody>
        </table>
      </div>
      {totalPages>1&&<div style={{padding:"8px 16px",borderTop:`1px solid ${G.gray200}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:G.gray50}}>
        <span style={{fontSize:11,color:G.gray400}}>Showing {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE,filtered.length)} of {filtered.length}</span>
        <div style={{display:"flex",gap:4}}>
          <button className="btn btn-ghost" style={{fontSize:11,padding:"4px 10px"}} disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
          {Array.from({length:Math.min(5,totalPages)},(_,i)=>{const p=page<=3?i+1:page+i-2;if(p<1||p>totalPages)return null;return <button key={p} onClick={()=>setPage(p)} style={{fontSize:11,padding:"4px 10px",borderRadius:5,border:`1px solid ${G.gray200}`,background:page===p?G.navy:G.white,color:page===p?"#fff":G.gray800,cursor:"pointer"}}>{p}</button>;})}
          <button className="btn btn-ghost" style={{fontSize:11,padding:"4px 10px"}} disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}>Next →</button>
        </div>
      </div>}
    </div>
  );
}

