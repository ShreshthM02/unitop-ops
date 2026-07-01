import React from 'react';
import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function InAppChat({ currentUser, queries, onClose }) {
  const [channels,setChannels]=useState([{id:'general',name:'general',type:'channel'},{id:'ops',name:'operations',type:'channel'},{id:'sales',name:'sales',type:'channel'}]);
  const [messages,setMessages]=useState({});
  const [activeChannel,setActiveChannel]=useState('general');
  const [input,setInput]=useState('');
  const bottomRef=React.useRef(null);
  const channelMsgs=messages[activeChannel]||[];
  const sendMessage=()=>{
    if(!input.trim()) return;
    const msg={id:Date.now(),text:input.trim(),sender:currentUser?.name||"You",senderId:currentUser?.id||0,senderColor:currentUser?.color||"#1A5276",senderAvatar:(currentUser?.name||"YO").slice(0,2).toUpperCase(),ts:new Date().toISOString()};
    setMessages(p=>({...p,[activeChannel]:[...(p[activeChannel]||[]),msg]}));
    setInput('');
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:'smooth'}),50);
  };
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:880,height:"100vh",display:"flex",flexDirection:"column",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)"}}>
        <div style={{background:G.navy,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>TEAM CHAT</div><div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>Unitop Workspace</div><div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>Messages sync live in Phase 5 (Supabase Realtime)</div></div>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          <div style={{width:200,background:"#1A2F44",display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"14px 14px 8px",fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"1px"}}>Channels</div>
            {channels.map(ch=><div key={ch.id} onClick={()=>setActiveChannel(ch.id)} style={{padding:"7px 14px",cursor:"pointer",borderRadius:5,margin:"1px 6px",background:activeChannel===ch.id?"rgba(255,255,255,0.12)":"transparent",color:activeChannel===ch.id?"#fff":"rgba(255,255,255,0.55)",fontSize:13,display:"flex",alignItems:"center",gap:6}}><span style={{opacity:0.5}}>#</span>{ch.name}</div>)}
            <div style={{padding:"14px 14px 8px",borderTop:"1px solid rgba(255,255,255,0.08)",marginTop:"auto",fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"1px"}}>You</div>
            <div style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:"50%",background:currentUser?.color||"#1A5276",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff"}}>{(currentUser?.name||"YO").slice(0,2).toUpperCase()}</div><div><div style={{fontSize:12,fontWeight:600,color:"#fff"}}>{currentUser?.name||"You"}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>● Online</div></div></div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"12px 18px",borderBottom:`1px solid ${G.gray200}`,flexShrink:0}}><div style={{fontSize:14,fontWeight:700}}>#{channels.find(c=>c.id===activeChannel)?.name}</div></div>
            <div style={{flex:1,overflowY:"auto",padding:"12px 18px"}}>
              {channelMsgs.length===0?<div style={{textAlign:"center",padding:"48px 0",color:G.gray400}}><div style={{fontSize:24,marginBottom:8}}>#</div><div style={{fontSize:13}}>Start the conversation</div></div>
              :channelMsgs.map((msg,i)=>{
                const showAvatar=i===0||channelMsgs[i-1]?.senderId!==msg.senderId;
                return <div key={msg.id} style={{display:"flex",gap:10,marginBottom:showAvatar?12:4,alignItems:"flex-start"}}>
                  <div style={{width:32,flexShrink:0}}>{showAvatar&&<div style={{width:32,height:32,borderRadius:"50%",background:msg.senderColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>{msg.senderAvatar}</div>}</div>
                  <div style={{flex:1}}>{showAvatar&&<div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:2}}><span style={{fontSize:13,fontWeight:600}}>{msg.sender}</span><span style={{fontSize:10,color:G.gray400}}>{new Date(msg.ts).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span></div>}<div style={{fontSize:13,color:G.gray800,lineHeight:1.5}}>{msg.text}</div></div>
                </div>;
              })}
              <div ref={bottomRef}/>
            </div>
            <div style={{padding:"10px 18px",borderTop:`1px solid ${G.gray200}`,flexShrink:0}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
                <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}} placeholder={`Message #${channels.find(c=>c.id===activeChannel)?.name||""} · Shift+Enter for new line`} rows={2} style={{flex:1,padding:"8px 12px",border:`1px solid ${G.gray200}`,borderRadius:8,fontSize:13,fontFamily:"'Inter',sans-serif",outline:"none",resize:"none"}}/>
                <button onClick={sendMessage} className="btn btn-primary" style={{fontSize:12,padding:"8px 16px"}} disabled={!input.trim()}>Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OWN PASSWORD CHANGE ──────────────────────────────────────────────────────
