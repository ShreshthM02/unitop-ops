import React from 'react';
import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,AllQueriesView,CancelModal,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,LoginScreen,MealPlanDocument,NewQueryModal,OwnPasswordChange,PLReport,ProformaInvoice,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,SmartSearch,TaxInvoice,TeamView,TourBriefingSheet,UnitopApp,UserManagementPanel,UserProfilePanel,VendorLedgerPanel,VendorMaster } = Comp;

export default function TemplatesHub({template,onSaveTemplate,docSettings,setDocSettings}){
  const [selectedDoc,setSelectedDoc]=React.useState("quotation");
  const [activePane,setActivePane]=React.useState("settings");
  const [settings,setSettings]=React.useState(()=>{try{return{...DEFAULT_DOC_SETTINGS,...JSON.parse(localStorage.getItem("unitop_doc_settings")||"{}")}}catch(e){return DEFAULT_DOC_SETTINGS;}});
  const [typo,setTypo]=React.useState(()=>{try{return{...TYPOGRAPHY_DEFAULTS,...JSON.parse(localStorage.getItem("unitop_typography")||"{}")}}catch(e){return TYPOGRAPHY_DEFAULTS;}});
  const [quotTmpl,setQuotTmpl]=React.useState(()=>{try{return{...DEFAULT_QUOT_TEMPLATE,...JSON.parse(localStorage.getItem("unitop_quot_template")||"{}")}}catch(e){return DEFAULT_QUOT_TEMPLATE;}});
  const [saved,setSaved]=React.useState("");
  const setS=(d,f,v)=>setSettings(p=>({...p,[d]:{...p[d],[f]:v}}));
  const setT=(k,v)=>setTypo(p=>({...p,[k]:v}));
  const setQT=(k,v)=>setQuotTmpl(p=>({...p,[k]:v}));
  const updQTL=(k,i,v)=>setQuotTmpl(p=>({...p,[k]:p[k].map((x,xi)=>xi===i?v:x)}));
  const addQTL=(k)=>setQuotTmpl(p=>({...p,[k]:[...p[k],""]}));
  const rmQTL=(k,i)=>setQuotTmpl(p=>({...p,[k]:p[k].filter((_,xi)=>xi!==i)}));
  const saveAll=()=>{localStorage.setItem("unitop_doc_settings",JSON.stringify(settings));localStorage.setItem("unitop_typography",JSON.stringify(typo));localStorage.setItem("unitop_quot_template",JSON.stringify(quotTmpl));if(setDocSettings)setDocSettings(settings);setSaved("✓ Saved");setTimeout(()=>setSaved(""),2500);};
  const prevFn=(d)=>{const s=settings[d];if(!s)return "";return(s.pattern||"{prefix}-{seq}").replace("{prefix}",s.prefix||"DOC").replace("{seq}",String(s.serial||1).padStart(3,"0")).replace("{group}","NCH_Holidays").replace("{date}",new Date().toISOString().split("T")[0]).replace("{year}",new Date().getFullYear()).replace("{sector}","Golden_Triangle").replace("{tourfile}","TUR-2025-019");};
  const inp={padding:"7px 9px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",width:"100%",outline:"none",color:G.gray800,background:G.white};
  const lbl={fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4,display:"block"};
  const sm=DOC_TYPES.find(d=>d.id===selectedDoc);
  const cs=settings[selectedDoc]||{};
  const isSys=selectedDoc==="query"||selectedDoc==="tourfile";
  const isTypo=selectedDoc==="_typography";
  const sideItems=[...DOC_TYPES,{id:"query",icon:"🔢",label:"Query ID"},{id:"tourfile",icon:"📁",label:"Tour File ID"},{id:"_typography",icon:"🎨",label:"Typography & Colours"}];
  return(
    <div style={{display:"flex",height:"100%",minHeight:500,margin:"-16px -20px"}}>
      <div style={{width:220,borderRight:`1px solid ${G.gray200}`,display:"flex",flexDirection:"column",flexShrink:0,background:"#FAFAFA"}}>
        <div style={{padding:"12px 14px 8px",fontSize:10,fontWeight:700,color:G.gray400,textTransform:"uppercase",letterSpacing:"1px",borderBottom:`1px solid ${G.gray100}`}}>Documents</div>
        <div style={{flex:1,overflowY:"auto"}}>
          {sideItems.map((d,idx)=>(
            <React.Fragment key={d.id}>
              {idx===DOC_TYPES.length&&<div style={{borderTop:`1px solid ${G.gray200}`,margin:"6px 0"}}/>}
              <div onClick={()=>{setSelectedDoc(d.id);setActivePane(d.id==="_typography"?"typography":"settings");}} style={{padding:"10px 14px",cursor:"pointer",background:selectedDoc===d.id?"#EBF5FB":"transparent",borderLeft:`3px solid ${selectedDoc===d.id?"#1A5276":"transparent"}`}}>
                <div style={{fontSize:13,fontWeight:selectedDoc===d.id?600:400,color:selectedDoc===d.id?G.navy:G.gray800}}>{d.icon} {d.label}</div>
                {d.formats&&<div style={{fontSize:10,color:G.gray400,marginTop:1}}>{d.formats.join(" · ")}</div>}
              </div>
            </React.Fragment>
          ))}
        </div>
        <div style={{padding:"10px 14px",borderTop:`1px solid ${G.gray200}`}}>
          <button className="btn btn-primary" style={{width:"100%",fontSize:12}} onClick={saveAll}>💾 Save All Settings</button>
          {saved&&<div style={{fontSize:11,color:"#059669",fontWeight:600,marginTop:6,textAlign:"center"}}>{saved}</div>}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 22px"}}>
        {isTypo&&(
          <div>
            <div style={{fontSize:16,fontWeight:700,color:G.navy,fontFamily:"'Playfair Display',serif",marginBottom:14}}>🎨 Typography & Brand Colours</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[["Display Font","titleFont",["Playfair Display","Georgia","Times New Roman"]],["Body Font","bodyFont",["Inter","Arial","Helvetica","Calibri"]]].map(([l,k,opts])=><div key={k}><label style={lbl}>{l}</label><select style={inp} value={typo[k]||"Inter"} onChange={e=>setT(k,e.target.value)}>{opts.map(f=><option key={f}>{f}</option>)}</select></div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[["Title","titleSize",18],["Section","sectionSize",12],["Body","bodySize",10.5],["Table Hdr","tableHdrSize",9],["Table Data","tableDataSize",10],["Amounts","amountSize",10],["Fine Print","fineSize",8.5]].map(([l,k,def])=><div key={k}><label style={lbl}>{l} (pt)</label><input style={{...inp,textAlign:"right"}} type="number" min="6" max="24" step="0.5" value={typo[k]||def} onChange={e=>setT(k,parseFloat(e.target.value))}/></div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["Primary Navy","colorPrimary","#1A3A52"],["Accent Crimson","colorAccent","#8B1A1A"],["Body Text","colorBody","#1a1a1a"],["Muted","colorMuted","#555555"]].map(([l,k,def])=><div key={k}><label style={lbl}>{l}</label><div style={{display:"flex",gap:8,alignItems:"center"}}><input type="color" value={typo[k]||def} onChange={e=>setT(k,e.target.value)} style={{width:36,height:32,border:"none",cursor:"pointer",borderRadius:4}}/><input style={{...inp,flex:1,fontFamily:"monospace",fontSize:12}} value={typo[k]||def} onChange={e=>setT(k,e.target.value)}/><div style={{width:24,height:24,borderRadius:4,background:typo[k]||def,border:`1px solid ${G.gray200}`}}/></div></div>)}
            </div>
            <div style={{marginTop:14,border:`2px solid ${G.gray200}`,borderRadius:8,padding:14,background:"#fff"}}>
              <div style={{fontFamily:typo.titleFont||"Playfair Display",fontSize:typo.titleSize||18,fontWeight:700,color:typo.colorPrimary||"#1A3A52",marginBottom:4}}>Quotation — Delhi / Agra / Jaipur</div>
              <div style={{height:2,background:`linear-gradient(to right,${typo.colorPrimary||"#1A3A52"},${typo.colorAccent||"#8B1A1A"})`,marginBottom:6}}/>
              <div style={{fontFamily:typo.bodyFont||"Inter",fontSize:typo.bodySize||10.5,color:typo.colorBody||"#1a1a1a"}}>As Desired, Please Find Itinerary & Quotation As Under.</div>
            </div>
          </div>
        )}
        {!isTypo&&sm&&(
          <div>
            <div style={{fontSize:16,fontWeight:700,color:G.navy,fontFamily:"'Playfair Display',serif",marginBottom:4}}>{sm.icon} {sm.label}</div>
            {sm.formats&&<div style={{fontSize:11,color:G.gray400,marginBottom:14}}>{sm.formats.join(" · ")}</div>}
            <div style={{display:"flex",gap:0,borderBottom:`1px solid ${G.gray200}`,marginBottom:14}}>
              {[["settings","⚙ Settings"],["templateContent","✏ Template Content"],["preview","👁 Preview"]].filter(([id])=>!(isSys&&id==="templateContent")).map(([id,label])=><button key={id} onClick={()=>setActivePane(id)} style={{padding:"8px 14px",border:"none",cursor:"pointer",fontSize:12,fontFamily:"'Inter',sans-serif",background:"none",color:activePane===id?G.accent:G.gray600,fontWeight:activePane===id?700:400,borderBottom:`2px solid ${activePane===id?G.accent:"transparent"}`}}>{label}</button>)}
            </div>
            {activePane==="settings"&&<div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div><label style={lbl}>Prefix</label><input style={inp} value={cs.prefix||""} onChange={e=>setS(selectedDoc,"prefix",e.target.value.toUpperCase())}/></div>
                <div><label style={lbl}>Current Serial No.</label><input style={{...inp,textAlign:"right"}} type="number" min="1" value={cs.serial||1} onChange={e=>setS(selectedDoc,"serial",parseInt(e.target.value)||1)}/></div>
                <div style={{gridColumn:"1/-1"}}><label style={lbl}>Filename Pattern</label><input style={inp} value={cs.pattern||""} onChange={e=>setS(selectedDoc,"pattern",e.target.value)}/><div style={{marginTop:6,background:G.navy,borderRadius:6,padding:"8px 12px"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:3}}>Preview:</div><div style={{fontSize:12,color:"#FDE68A",fontFamily:"monospace"}}>{prevFn(selectedDoc)}.pdf</div></div></div>
              </div>
              <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:8,padding:12}}>
                <div style={{fontSize:10,fontWeight:700,color:G.gray600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Available Placeholders</div>
                <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:"4px 16px"}}>
                  {PATTERN_PLACEHOLDERS.map(p=><React.Fragment key={p.key}><code style={{fontSize:11,color:G.accent,fontWeight:600}}>{p.key}</code><span style={{fontSize:11,color:G.gray600}}>{p.desc}</span></React.Fragment>)}
                </div>
              </div>
            </div>}
            {activePane==="templateContent"&&selectedDoc==="quotation"&&<div>
              <div style={{background:"#EBF5FB",border:"1px solid #A9CCE3",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:11,color:"#1A5276"}}>These defaults pre-fill when you open a new quotation.</div>
              {[["Greeting","greeting",false],["Opening Line","openingLine",false],["Closing Paragraph","closingLine",true],["Sign-off","signoff",true],["Monument Heading","monumentNote",false]].map(([label,key,multi])=><div key={key} style={{marginBottom:10}}><label style={lbl}>{label}</label>{multi?<textarea style={{...inp,minHeight:52,resize:"vertical"}} value={quotTmpl[key]||""} onChange={e=>setQT(key,e.target.value)}/>:<input style={inp} value={quotTmpl[key]||""} onChange={e=>setQT(key,e.target.value)}/>}</div>)}
              <div style={{fontSize:12,fontWeight:700,color:G.navy,margin:"14px 0 8px"}}>Default Cost Includes</div>
              {(quotTmpl.includes||[]).map((item,i)=><div key={i} style={{display:"flex",gap:6,marginBottom:5}}><span style={{color:G.gray400,paddingTop:7,minWidth:18}}>{i+1}.</span><input style={{...inp,flex:1}} value={item} onChange={e=>updQTL("includes",i,e.target.value)}/><span style={{cursor:"pointer",color:G.gray400,fontSize:16,paddingTop:5}} onClick={()=>rmQTL("includes",i)}>✕</span></div>)}
              <button className="btn btn-ghost" style={{fontSize:11,marginBottom:14}} onClick={()=>addQTL("includes")}>+ Add Item</button>
              <div style={{fontSize:12,fontWeight:700,color:G.navy,margin:"14px 0 8px"}}>Default Cost Does Not Include</div>
              {(quotTmpl.excludes||[]).map((item,i)=><div key={i} style={{display:"flex",gap:6,marginBottom:5}}><span style={{color:G.gray400,paddingTop:7,minWidth:18}}>{i+1}.</span><input style={{...inp,flex:1}} value={item} onChange={e=>updQTL("excludes",i,e.target.value)}/><span style={{cursor:"pointer",color:G.gray400,fontSize:16,paddingTop:5}} onClick={()=>rmQTL("excludes",i)}>✕</span></div>)}
              <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>addQTL("excludes")}>+ Add Item</button>
            </div>}
            {activePane==="templateContent"&&selectedDoc!=="quotation"&&<div style={{textAlign:"center",padding:"32px 20px",color:G.gray400}}><div style={{fontSize:32,marginBottom:8}}>{sm.icon}</div><div style={{fontSize:13,fontWeight:600,color:G.gray600}}>{sm.label} Template</div><div style={{fontSize:11,marginTop:6}}>Content for this document will be designed in a dedicated session.</div></div>}
            {activePane==="preview"&&<div style={{background:G.gray50,borderRadius:8,padding:14}}>
              <div style={{maxWidth:520,margin:"0 auto",background:"#fff",borderRadius:4,boxShadow:"0 4px 20px rgba(0,0,0,0.1)",overflow:"hidden"}}>
                <div style={{textAlign:"center",padding:"12px 20px 6px"}}><img src={LOGO_B64} style={{height:66,width:"auto",display:"block",margin:"0 auto 3px"}} alt="Unitop"/><div style={{fontSize:6.5,color:"#2a2a2a",lineHeight:1.65,letterSpacing:"0.3pt"}}>Registered Office: 506, DDA-2F, District Centre, Janakpuri, New Delhi, India - 110058</div><div style={{fontSize:6.5,color:"#2a2a2a",lineHeight:1.65,letterSpacing:"0.3pt"}}>Corporate Office: 452, JMD Megapolis, Sec-48, Sohna Rd., Gurugram, Haryana, India - 122018</div><div style={{fontSize:6.5,color:"#2a2a2a",lineHeight:1.65,letterSpacing:"0.3pt",marginBottom:4}}>www.unitoptours.com | unitoptours@gmail.com | +91-124-4476571</div><div style={{height:2,background:"linear-gradient(to right,#cb0f0f,#061bb0)",borderRadius:1,marginBottom:6}}/></div>
                <div style={{padding:"6px 18px 10px",fontFamily:"'Inter',sans-serif"}}><div style={{fontFamily:"'Playfair Display',serif",fontSize:10,fontWeight:700,color:"#1A3A52",textAlign:"center",marginBottom:6,textTransform:"uppercase"}}>{sm.label}</div><div style={{fontSize:7.5,color:"#555",textAlign:"center"}}>Document content will appear here</div></div>
                <div style={{padding:"4px 14px 8px",borderTop:"1px solid #e5e7eb"}}><div style={{height:1.5,background:"linear-gradient(to right,#cb0f0f,#061bb0)",borderRadius:1,marginBottom:5}}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><img src={BADGE_MOT_B64} style={{height:24,marginLeft:8}} alt="MOT"/><div style={{display:"flex",gap:8}}><img src={BADGE_INDIA_B64} style={{height:24}} alt="India"/><img src={BADGE_IATO_B64} style={{height:24}} alt="IATO"/></div><div style={{textAlign:"right",marginRight:8}}><img src={BADGE_AWARD_B64} style={{height:22,display:"block",marginLeft:"auto"}} alt="Award"/><div style={{fontSize:4,fontWeight:700,color:"#1A3A52",marginTop:1}}>NATIONAL TOURISM AWARD WINNER</div><div style={{fontSize:4,color:"#666"}}>2013-14 | 2016-17 | 2018-19</div></div></div></div>
              </div>
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ALL QUERIES VIEW ─────────────────────────────────────────────────────────
