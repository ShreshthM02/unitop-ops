import React from 'react';
import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function KanbanView({ queries, onOpenQuery, onConvert, onStatusChange }) {
  const [dragId,    setDragId]    = React.useState(null);
  const [dragOver,  setDragOver]  = React.useState(null);
  const [highlight, setHighlight] = React.useState(null);

  const handleDragStart = (e, queryId) => {
    setDragId(queryId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(stageId);
  };
  const handleDrop = (e, stageId) => {
    e.preventDefault();
    if (dragId && onStatusChange) {
      onStatusChange(dragId, stageId);
      setHighlight(dragId);
      setTimeout(() => setHighlight(null), 1000);
    }
    setDragId(null);
    setDragOver(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOver(null); };

  const activeQueries = queries.filter(q => !q.cancelled);

  return (
    <div style={{display:"flex",gap:10,overflowX:"auto",height:"100%",padding:"0 4px 4px"}}>
      {PIPELINE_STAGES.map(stage => {
        const cards = activeQueries.filter(q => q.status === stage.id);
        const isDragTarget = dragOver === stage.id;
        return (
          <div key={stage.id}
            onDragOver={e => handleDragOver(e, stage.id)}
            onDrop={e => handleDrop(e, stage.id)}
            onDragLeave={() => setDragOver(null)}
            style={{
              minWidth:220, width:220, flexShrink:0,
              display:"flex", flexDirection:"column",
              background: isDragTarget ? stage.bg : "#F8F9FA",
              border:`2px solid ${isDragTarget ? stage.color : "#E5E7EB"}`,
              borderRadius:10, overflow:"hidden",
              transition:"border-color .15s, background .15s",
            }}>
            {/* Column header */}
            <div style={{padding:"10px 12px 8px",background:stage.bg,borderBottom:`1px solid ${stage.color}22`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
                <span style={{fontSize:12,fontWeight:700,color:stage.color,letterSpacing:"0.3px"}}>{stage.label}</span>
                <span style={{background:stage.color,color:"#fff",fontSize:10,fontWeight:700,
                  padding:"1px 7px",borderRadius:10,minWidth:20,textAlign:"center"}}>{cards.length}</span>
              </div>
              <div style={{fontSize:9.5,color:"#888",lineHeight:1.3}}>{stage.hint}</div>
            </div>
            {/* Cards */}
            <div style={{flex:1,overflowY:"auto",padding:8,display:"flex",flexDirection:"column",gap:7}}>
              {cards.map(q => {
                const user = USERS.find(u => u.id === q.assignedTo);
                const isBeingDragged = dragId === q.id;
                const isHighlighted  = highlight === q.id;
                return (
                  <div key={q.id}
                    draggable
                    onDragStart={e => handleDragStart(e, q.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onOpenQuery(q)}
                    style={{
                      background: isHighlighted ? "#FFFBEB" : "#fff",
                      border:`1px solid ${isHighlighted ? "#F59E0B" : "#E5E7EB"}`,
                      borderRadius:8, padding:"9px 11px", cursor:"grab",
                      opacity: isBeingDragged ? 0.4 : 1,
                      boxShadow: isBeingDragged ? "none" : "0 1px 4px rgba(0,0,0,0.07)",
                      transition:"opacity .15s, box-shadow .15s, border-color .3s, background .3s",
                    }}>
                    {/* Query ID + source */}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:10,fontWeight:700,color:stage.color,fontFamily:"monospace"}}>{q.id}</span>
                      {q.source && <span style={{fontSize:9,padding:"1px 6px",borderRadius:8,
                        background:SOURCE_COLORS[q.source]||"#888",color:"#fff",fontWeight:600}}>
                        {q.source}
                      </span>}
                    </div>
                    {/* Client/Group name */}
                    <div style={{fontSize:12,fontWeight:600,color:"#1a1a1a",marginBottom:2,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {q.groupName||q.clientName}
                    </div>
                    {/* Destination */}
                    <div style={{fontSize:11,color:"#555",marginBottom:6,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {q.destination||q.sector||"—"}
                    </div>
                    {/* Meta row */}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:4}}>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        {q.pax && <span style={{fontSize:9,padding:"1px 5px",borderRadius:6,
                          background:"#F3F4F6",color:"#555",fontWeight:500}}>{q.pax} pax</span>}
                        {q.nights && <span style={{fontSize:9,padding:"1px 5px",borderRadius:6,
                          background:"#F3F4F6",color:"#555",fontWeight:500}}>{q.nights}N</span>}
                        {q.tourFileId && <span style={{fontSize:9,padding:"1px 5px",borderRadius:6,
                          background:"#EBF5FB",color:"#1A5276",fontWeight:600}}>📁</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        {q.travelDate && <span style={{fontSize:9,color:"#888"}}>{q.travelDate}</span>}
                        {user && <Avatar user={user} size={18}/>}
                      </div>
                    </div>
                    {/* Convert button */}
                    {q.status==="operations" && !q.tourFileId && (
                      <button onClick={e=>{e.stopPropagation();onConvert(q);}}
                        style={{width:"100%",marginTop:7,padding:"4px 0",borderRadius:5,border:"none",
                          background:"#EBF5FB",color:"#1A5276",fontSize:10,fontWeight:600,cursor:"pointer"}}>
                        📁 Convert to Tour File
                      </button>
                    )}
                  </div>
                );
              })}
              {cards.length===0 && (
                <div style={{textAlign:"center",padding:"24px 8px",color:"#aaa",fontSize:11,
                  border:`2px dashed ${isDragTarget?stage.color:"#ddd"}`,borderRadius:8,
                  background:isDragTarget?stage.bg:"transparent",transition:"all .15s"}}>
                  {isDragTarget ? `Drop here → ${stage.label}` : "No queries"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


