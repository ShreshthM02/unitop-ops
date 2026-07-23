import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, FileTypeBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function Dashboard({ queries, onOpenQuery, currentUser, onStatClick }) {
  // Season = Apr 1 current year → Mar 31 next year
  // If current month is Jan–Mar, season started Apr of PREVIOUS year
  const now = new Date();
  const seasonStartYear = now.getMonth() < 3 ? now.getFullYear()-1 : now.getFullYear();
  const seasonStart = new Date(seasonStartYear, 3, 1);   // Apr 1
  const seasonEnd   = new Date(seasonStartYear+1, 2, 31, 23, 59, 59); // Mar 31

  const inSeason = (q) => {
    const d = new Date(q.date||q.travelDate||"");
    return d >= seasonStart && d <= seasonEnd;
  };

  const active     = queries.filter(q=>!q.cancelled&&q.status!=="completed");
  const newThisWeek = queries.filter(q=>{
    const d = new Date(q.date||"");
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
    return d >= weekAgo && !q.cancelled;
  });
  const inOps      = queries.filter(q=>q.status==="operations"&&!q.cancelled);
  const onGround   = inOps; // "On Ground" === actively in Operations -- was previously derived from a frozen snapshot that never updated
  const seasonDone = queries.filter(q=>q.status==="completed"&&inSeason(q));

  // Built fresh from live queries every render -- was previously a
  // one-time snapshot captured at Tour File conversion that never
  // reflected later edits (name/dates/pax changes, status progression).
  const activeTours = queries
    .filter(q=>q.tourFileId&&!q.cancelled)
    .sort((a,b)=>new Date(a.travelDate||0)-new Date(b.travelDate||0))
    .map((q,idx)=>({
      id: q.id, query: q,
      name: `${q.groupName||q.clientName||""} — ${q.destination||q.sector||""}`,
      dates: q.travelDate||"TBC", pax: q.paxDisplay||"",
      color: DEST_COLORS[idx%DEST_COLORS.length],
      statusLabel: q.status==="completed"?"Completed":q.status==="operations"?"On Ground":"Upcoming",
    }));

  const counts = {
    new_query:   queries.filter(q=>q.status==="new_query"&&!q.cancelled).length,
    costing:     queries.filter(q=>q.status==="costing"&&!q.cancelled).length,
    operations:  inOps.length,
    finance:     queries.filter(q=>q.status==="finance"&&!q.cancelled).length,
    completed:   queries.filter(q=>q.status==="completed").length,
  };

  const StatCard = ({label, value, sub, color, filterKey, style={}}) => (
    <div className="stat-card" onClick={()=>onStatClick&&onStatClick(filterKey)}
      style={{cursor:onStatClick?"pointer":"default",...style}}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{color:color||G.gray800}}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );

  return (
    <div>
      <div className="stats-row">
        <StatCard label="Active Queries" value={active.length} sub="across all stages" filterKey="active"/>
        <StatCard label="New This Week"  value={newThisWeek.length} color="#1D6FA4" sub="awaiting acknowledgement" filterKey="new_query"/>
        <StatCard label="In Operations"  value={inOps.length} color="#0E6655" sub="confirmed + being serviced" filterKey="operations"/>
        <StatCard label="Tours On Ground" value={onGround.length} color={G.accent} sub="currently running" filterKey="onground"/>
        <StatCard label="Completed" value={seasonDone.length} color="#145A32" sub={`this season (Apr ${seasonStartYear}–Mar ${seasonStartYear+1})`} filterKey="completed"/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: G.white, borderRadius: 10, border: `1px solid ${G.gray200}`, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${G.gray200}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Recent Queries</span>
            <span style={{ fontSize: 11, color: G.gray400 }}>last 7 days</span>
          </div>
          {queries.filter(q=>!q.cancelled).slice(0, 5).map(q => (
            <div key={q.id} onClick={() => onOpenQuery(q)}
              style={{ padding: "10px 16px", borderBottom: `1px solid ${G.gray100}`, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 10, transition: "background .15s" }}
              onMouseEnter={e => e.currentTarget.style.background = G.gray50}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{q.groupName||q.clientName}<FileTypeBadge fileType={q.fileType}/></div>
                <div style={{ fontSize: 11, color: G.gray400 }}>{q.tourFileId||q.id} · {q.destination||q.sector}</div>
              </div>
              <StatusBadge status={q.status} />
            </div>
          ))}
          {queries.filter(q=>!q.cancelled).length===0&&<div style={{padding:24,textAlign:"center",color:G.gray400,fontSize:12}}>No queries yet</div>}
        </div>

        <div style={{ background: G.white, borderRadius: 10, border: `1px solid ${G.gray200}`, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${G.gray200}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Tour Calendar</span>
            <span style={{ fontSize: 11, color: G.gray400 }}>active tours</span>
          </div>
          {activeTours.map(t => (
            <div key={t.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${G.gray100}`,
              display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{t.name}<FileTypeBadge fileType={t.query.fileType}/></div>
                <div style={{ fontSize: 11, color: G.gray400 }}>{t.dates} · {t.pax} pax</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                background: t.statusLabel === "On Ground" ? "#EAFAF1" : t.statusLabel === "Completed" ? G.gray100 : "#DBEAFE",
                color: t.statusLabel === "On Ground" ? "#0E6655" : t.statusLabel === "Completed" ? G.gray400 : "#1E40AF" }}>
                {t.statusLabel}
              </span>
            </div>
          ))}
          {activeTours.length===0&&<div style={{padding:24,textAlign:"center",color:G.gray400,fontSize:12}}>No active tours</div>}
        </div>
      </div>
    </div>
  );
}


// ─── KANBAN VIEW ──────────────────────────────────────────────────────────────
// ─── KANBAN BOARD — Visual pipeline with drag-to-move ────────────────────────
