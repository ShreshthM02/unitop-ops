import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function VendorLedgerPanel({ vendor, queries, allPayments, onClose }) {
  // Collect all outgoing payments to this vendor across all tour files
  const ledgerEntries = [];
  Object.entries(allPayments).forEach(([queryId, pt]) => {
    (pt.outgoing||[]).forEach(e => {
      if (e.vendor && (e.vendor.toLowerCase().includes(vendor.name.toLowerCase()) ||
          e.vendorId === vendor.id)) {
        const q = queries.find(q=>q.id===queryId);
        ledgerEntries.push({ ...e, queryId, tourFileId: q?.tourFileId, clientName: q?.clientName||q?.groupName });
      }
    });
  });

  const totalPayable  = ledgerEntries.filter(e=>e.paymentType==="voucher"&&!e.settled).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const totalPaid     = ledgerEntries.filter(e=>e.paymentType==="cash"||e.paymentType==="settle").reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const totalCommitted= ledgerEntries.filter(e=>["voucher","cash"].includes(e.paymentType)).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);

  const TYPE_MAP = {
    cash:    { label:"Cash Payment", bg:"#DCFCE7", color:"#166534" },
    voucher: { label:"Voucher (Credit)", bg:"#FEF3C7", color:"#92400E" },
    settle:  { label:"Settlement", bg:"#DBEAFE", color:"#1E40AF" },
  };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:G.white, width:640, height:"100vh", overflowY:"auto",
        boxShadow:"-4px 0 24px rgba(0,0,0,0.15)", display:"flex", flexDirection:"column" }}>
        <div style={{ background:G.navy, padding:"14px 20px", flexShrink:0 }}>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1 }}>VENDOR LEDGER</div>
          <div style={{ fontSize:17, fontWeight:700, color:"#fff", fontFamily:"'Playfair Display',serif" }}>{vendor.name}</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>{vendor.type} · {vendor.city}</div>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
          {/* Summary */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
            {[["Total Committed","₹ "+Math.round(totalCommitted).toLocaleString(),G.navy],
              ["Total Paid","₹ "+Math.round(totalPaid).toLocaleString(),"#059669"],
              ["Outstanding Payable","₹ "+Math.round(totalPayable).toLocaleString(),totalPayable>0?G.accent:"#059669"]
            ].map(([l,v,c])=>(
              <div key={l} style={{ background:G.white, border:`1px solid ${G.gray200}`, borderRadius:8, padding:12 }}>
                <div style={{ fontSize:10, color:G.gray600, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:4 }}>{l}</div>
                <div style={{ fontSize:16, fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display:"flex", gap:12, marginBottom:12, flexWrap:"wrap" }}>
            {Object.entries(TYPE_MAP).map(([k,v])=>(
              <span key={k} style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                background:v.bg, color:v.color, fontWeight:600 }}>{v.label}</span>
            ))}
            <span style={{ fontSize:11, color:G.gray400, alignSelf:"center" }}>
              · Voucher/Credit = committed cost (in tour P&L, payable in ledger)
            </span>
          </div>

          {/* Ledger entries */}
          {ledgerEntries.length===0 ? (
            <div style={{ textAlign:"center", padding:32, color:G.gray400, fontSize:12,
              border:`1px dashed ${G.gray200}`, borderRadius:8 }}>
              No transactions with this vendor yet
            </div>
          ) : ledgerEntries.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).map((e,i)=>{
            const t = TYPE_MAP[e.paymentType||"cash"] || TYPE_MAP.cash;
            return (
              <div key={i} style={{ background:G.white, border:`1px solid ${e.paymentType==="voucher"&&!e.settled?"#FDE68A":G.gray200}`,
                borderRadius:8, padding:"10px 14px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                    background:t.bg, color:t.color, fontWeight:600 }}>{t.label}</span>
                  {e.paymentType==="voucher"&&!e.settled&&(
                    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                      background:"#FEE2E2", color:"#991B1B", fontWeight:600 }}>⚠ Payable</span>
                  )}
                  {e.paymentType==="voucher"&&e.settled&&(
                    <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                      background:"#DCFCE7", color:"#166534", fontWeight:600 }}>✓ Settled</span>
                  )}
                  {e.tourFileId&&<span style={{ fontSize:10, color:G.navy, fontWeight:600,
                    background:"#EBF5FB", padding:"2px 7px", borderRadius:10 }}>📁 {e.tourFileId}</span>}
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:G.navy }}>₹ {parseFloat(e.amount||0).toLocaleString()}</div>
                <div style={{ fontSize:11, color:G.gray600, marginTop:2 }}>
                  {e.clientName&&<span>{e.clientName} · </span>}{e.date||"—"} · {e.mode||"—"}{e.ref?" · "+e.ref:""}
                </div>
                {e.note&&<div style={{ fontSize:11, color:G.gray400 }}>{e.note}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ padding:"12px 20px", borderTop:`1px solid ${G.gray200}`, flexShrink:0, background:G.gray50 }}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── AGENT LEDGER PANEL ───────────────────────────────────────────────────────
