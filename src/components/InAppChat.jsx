import React from 'react';
import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, MessageWithMentions, MentionInput, extractMentions, useRealtimeTable, loadConversationsForStaff, findOrCreateDM, createGroupConversation, addConversationMember, removeConversationMember, renameConversation, loadChatMessages, sendChatMessage, markConversationRead, db } = Lib;

export default function InAppChat({ currentUser, queries, staff, agents, vendors, series, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composerText, setComposerText] = useState("");
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [newDMPicker, setNewDMPicker] = useState(false);
  const [newGroupDraft, setNewGroupDraft] = useState(null); // {name, memberIds} while composing, else null
  const [manageMembers, setManageMembers] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const bottomRef = useRef(null);

  const reloadConversations = useCallback(() => {
    if (!currentUser?.id) return;
    loadConversationsForStaff(db, currentUser.id).then(setConversations);
  }, [currentUser?.id]);
  useEffect(() => { reloadConversations(); }, [reloadConversations]);

  useEffect(() => {
    if (!activeConvId) { setMessages([]); return; }
    loadChatMessages(db, activeConvId).then(setMessages);
    markConversationRead(db, activeConvId, currentUser?.id);
  }, [activeConvId, currentUser?.id]);

  useEffect(() => { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50); }, [messages]);

  // Live updates for messages in the open conversation -- skips echoing
  // the current user's own sends, same reasoning as the record-anchored
  // discussion thread: those are already reflected via the optimistic
  // local append below, and the optimistic entry has no real id yet to
  // reconcile against.
  useRealtimeTable("chat_messages", (eventType, newRow) => {
    if (eventType !== "INSERT" || !newRow) return;
    if (newRow.sender_id && newRow.sender_id === currentUser?.id) return;
    if (newRow.conversation_id === activeConvId) {
      setMessages(prev => [...prev, { id: newRow.id, senderId: newRow.sender_id, senderName: newRow.sender_name, text: newRow.text, mentions: newRow.mentions || [], createdAt: newRow.created_at }]);
    }
    reloadConversations(); // keeps the sidebar's last-message preview live too
  });

  // Live updates for being added to (or removed from) a conversation --
  // without this, a brand-new DM/group someone starts with you would
  // only appear after a manual reload.
  useRealtimeTable("chat_conversation_members", (eventType, newRow, oldRow) => {
    const relevant = (newRow && newRow.staff_id === currentUser?.id) || (oldRow && oldRow.staff_id === currentUser?.id);
    if (relevant) reloadConversations();
  });

  const activeConv = conversations.find(c => c.id === activeConvId);
  const otherMember = (conv) => (staff || []).find(s => conv?.members.some(m => m.staffId === s.id) && s.id !== currentUser?.id);
  const convDisplayName = (conv) => conv.type === "group" ? conv.name : (otherMember(conv)?.name || "Unknown");
  const isUnread = (conv) => conv.lastMessage && (!conv.lastReadAt || new Date(conv.lastMessage.createdAt) > new Date(conv.lastReadAt));

  const sendMessage = async () => {
    const text = composerText.trim();
    if (!text || !activeConvId) return;
    const mentions = extractMentions(text);
    const optimistic = { id: null, senderId: currentUser?.id, senderName: currentUser?.name || "You", text, mentions, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    setComposerText("");
    const { error } = await sendChatMessage(db, activeConvId, currentUser?.id, currentUser?.name || "You", text, mentions);
    if (error) setErrMsg("Error: " + error);
    reloadConversations();
  };

  const startDM = async (otherStaffId) => {
    setNewDMPicker(false); setShowNewMenu(false);
    const { id, error } = await findOrCreateDM(db, currentUser.id, otherStaffId);
    if (error) { setErrMsg("Error: " + error); return; }
    reloadConversations();
    setActiveConvId(id);
  };

  const createGroup = async () => {
    if (!newGroupDraft?.name?.trim() || !newGroupDraft.memberIds.length) return;
    const { id, error } = await createGroupConversation(db, newGroupDraft.name.trim(), currentUser.id, newGroupDraft.memberIds);
    if (error) { setErrMsg("Error: " + error); return; }
    setNewGroupDraft(null); setShowNewMenu(false);
    reloadConversations();
    setActiveConvId(id);
  };

  const leaveGroup = async () => {
    if (!activeConvId || !window.confirm("Leave this group?")) return;
    await removeConversationMember(db, activeConvId, currentUser.id);
    setActiveConvId(null);
    reloadConversations();
  };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:"min(880px, 100vw)",height:"100vh",display:"flex",flexDirection:"column",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)"}}>
        <div style={{background:G.navy,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>TEAM CHAT</div><div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>Unitop Workspace</div></div>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        {errMsg && <div style={{background:"#FEE2E2",color:"#991B1B",fontSize:12,padding:"6px 18px",flexShrink:0}}>{errMsg} <span style={{cursor:"pointer",fontWeight:600}} onClick={()=>setErrMsg("")}>✕</span></div>}
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          <div style={{width:220,background:"#1A2F44",display:"flex",flexDirection:"column",flexShrink:0,position:"relative"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
              <button onClick={()=>setShowNewMenu(o=>!o)} className="btn btn-primary" style={{width:"100%",fontSize:12}}>+ New</button>
              {showNewMenu && (
                <div style={{position:"absolute",top:44,left:14,zIndex:20,background:G.white,borderRadius:6,boxShadow:"0 4px 14px rgba(0,0,0,0.2)",minWidth:180,overflow:"hidden"}}>
                  <div onClick={()=>{setNewDMPicker(true);setShowNewMenu(false);}} style={{padding:"10px 14px",fontSize:12,color:G.gray800,cursor:"pointer"}}>💬 New Direct Message</div>
                  <div onClick={()=>{setNewGroupDraft({name:"",memberIds:[]});setShowNewMenu(false);}} style={{padding:"10px 14px",fontSize:12,color:G.gray800,cursor:"pointer",borderTop:`1px solid ${G.gray100}`}}>👥 New Group</div>
                </div>
              )}
            </div>
            <div style={{flex:1,overflowY:"auto"}}>
              {conversations.length===0 && <div style={{padding:"16px 14px",fontSize:11,color:"rgba(255,255,255,0.4)"}}>No conversations yet. Start one above.</div>}
              {conversations.map(conv=>(
                <div key={conv.id} onClick={()=>setActiveConvId(conv.id)} style={{padding:"8px 14px",cursor:"pointer",background:activeConvId===conv.id?"rgba(255,255,255,0.12)":"transparent"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:13,color:"#fff",fontWeight:isUnread(conv)?700:400,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{conv.type==="group"?"# ":""}{convDisplayName(conv)}</span>
                    {isUnread(conv) && <span style={{width:7,height:7,borderRadius:"50%",background:G.accent,flexShrink:0}}/>}
                  </div>
                  {conv.lastMessage && <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{conv.lastMessage.senderName}: {conv.lastMessage.text}</div>}
                </div>
              ))}
            </div>
          </div>

          {newDMPicker && (
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:30}} onClick={e=>e.target===e.currentTarget&&setNewDMPicker(false)}>
              <div style={{background:G.white,borderRadius:10,padding:16,width:320,maxHeight:400,overflowY:"auto"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Start a Direct Message</div>
                {(staff||[]).filter(s=>s.id!==currentUser?.id).map(s=>(
                  <div key={s.id} onClick={()=>startDM(s.id)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 8px",borderRadius:6,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=G.gray50} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <Avatar user={s} size={26}/><span style={{fontSize:13}}>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {newGroupDraft && (
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:30}} onClick={e=>e.target===e.currentTarget&&setNewGroupDraft(null)}>
              <div style={{background:G.white,borderRadius:10,padding:16,width:340,maxHeight:460,overflowY:"auto"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>New Group</div>
                <input value={newGroupDraft.name} onChange={e=>setNewGroupDraft(d=>({...d,name:e.target.value}))} placeholder="Group name" style={{width:"100%",padding:"7px 9px",border:`1px solid ${G.gray200}`,borderRadius:6,fontSize:13,marginBottom:10,outline:"none"}}/>
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Add members</div>
                {(staff||[]).filter(s=>s.id!==currentUser?.id).map(s=>{
                  const checked = newGroupDraft.memberIds.includes(s.id);
                  return (
                    <label key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 4px",cursor:"pointer"}}>
                      <input type="checkbox" checked={checked} onChange={e=>setNewGroupDraft(d=>({...d,memberIds:e.target.checked?[...d.memberIds,s.id]:d.memberIds.filter(id=>id!==s.id)}))}/>
                      <Avatar user={s} size={24}/><span style={{fontSize:13}}>{s.name}</span>
                    </label>
                  );
                })}
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>setNewGroupDraft(null)}>Cancel</button>
                  <button className="btn btn-primary" style={{fontSize:12}} disabled={!newGroupDraft.name.trim()||!newGroupDraft.memberIds.length} onClick={createGroup}>Create Group</button>
                </div>
              </div>
            </div>
          )}

          {manageMembers && activeConv && (
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:30}} onClick={e=>e.target===e.currentTarget&&setManageMembers(false)}>
              <div style={{background:G.white,borderRadius:10,padding:16,width:320,maxHeight:460,overflowY:"auto"}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Manage Members — {activeConv.name}</div>
                {activeConv.members.map(m=>{
                  const s = (staff||[]).find(st=>st.id===m.staffId);
                  return (
                    <div key={m.staffId} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 4px"}}>
                      <Avatar user={s||{name:"?"}} size={24}/><span style={{fontSize:13,flex:1}}>{s?.name||"Unknown"}</span>
                      {m.staffId!==currentUser?.id && <span style={{cursor:"pointer",color:"#B91C1C",fontSize:12}} onClick={async()=>{await removeConversationMember(db,activeConv.id,m.staffId);reloadConversations();}}>Remove</span>}
                    </div>
                  );
                })}
                <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",margin:"12px 0 6px"}}>Add member</div>
                {(staff||[]).filter(s=>!activeConv.members.some(m=>m.staffId===s.id)).map(s=>(
                  <div key={s.id} onClick={async()=>{await addConversationMember(db,activeConv.id,s.id);reloadConversations();}} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 4px",cursor:"pointer"}}>
                    <Avatar user={s} size={24}/><span style={{fontSize:13}}>{s.name}</span>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{fontSize:12,marginTop:10}} onClick={()=>setManageMembers(false)}>Close</button>
              </div>
            </div>
          )}

          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {!activeConv ? (
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:G.gray400,fontSize:13}}>Select a conversation, or start a new one.</div>
            ) : (
              <>
                <div style={{padding:"12px 18px",borderBottom:`1px solid ${G.gray200}`,flexShrink:0,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700}}>{activeConv.type==="group"?"# ":""}{convDisplayName(activeConv)}</div>
                    {activeConv.type==="group" && <div style={{fontSize:11,color:G.gray400}}>{activeConv.members.length} members</div>}
                  </div>
                  {activeConv.type==="group" && <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setManageMembers(true)}>👥 Members</button>}
                  {activeConv.type==="group" && <button className="btn btn-ghost" style={{fontSize:11,color:"#B91C1C"}} onClick={leaveGroup}>Leave</button>}
                </div>
                <div style={{flex:1,overflowY:"auto",padding:"12px 18px"}}>
                  {messages.length===0 ? <div style={{textAlign:"center",padding:"48px 0",color:G.gray400,fontSize:13}}>No messages yet. Say hello.</div> : messages.map((msg,i)=>{
                    const showHeader = i===0 || messages[i-1]?.senderId!==msg.senderId;
                    const sender = (staff||[]).find(s=>s.id===msg.senderId);
                    return (
                      <div key={msg.id||`optimistic-${i}`} style={{display:"flex",gap:10,marginBottom:showHeader?12:4,alignItems:"flex-start"}}>
                        <div style={{width:32,flexShrink:0}}>{showHeader&&<Avatar user={sender||{name:msg.senderName}} size={32}/>}</div>
                        <div style={{flex:1}}>
                          {showHeader&&<div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:2}}><span style={{fontSize:13,fontWeight:600}}>{msg.senderName}</span><span style={{fontSize:10,color:G.gray400}}>{new Date(msg.createdAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span></div>}
                          <div style={{fontSize:13,color:G.gray800,lineHeight:1.5,whiteSpace:"pre-wrap"}}><MessageWithMentions text={msg.text} queries={queries}/></div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef}/>
                </div>
                <div style={{padding:"10px 18px",borderTop:`1px solid ${G.gray200}`,flexShrink:0}}>
                  <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
                    <div style={{flex:1}}>
                      <MentionInput value={composerText} onChange={setComposerText} onSubmit={sendMessage}
                        placeholder={`Message ${convDisplayName(activeConv)}... use @ to mention`}
                        staff={staff} queries={queries} agents={agents} vendors={vendors} series={series}/>
                    </div>
                    <button onClick={sendMessage} className="btn btn-primary" style={{fontSize:12,padding:"8px 16px"}} disabled={!composerText.trim()}>Send</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
