import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;
import * as Comp from './index.js';
const { AgentLedgerPanel,AgentMaster,AllQueriesView,CancelModal,CostSheet,Dashboard,DestinationOverlapView,DocumentRegistry,DocRegistryInline,EnhancedPaymentTracker,ExchangeOrderGenerator,GanttView,InAppChat,ItineraryBuilder,KanbanView,LoginScreen,MealPlanDocument,NewQueryModal,OwnPasswordChange,PLReport,ProformaInvoice,QueryDrawerWithQuote,QuotationGenerator,ReportsView,ServicesList,SmartSearch,TaxInvoice,TemplatesHub,TourBriefingSheet,UnitopApp,UserManagementPanel,UserProfilePanel,VendorLedgerPanel,VendorMaster } = Comp;

export default function TeamView({ queries }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
      {USERS.map(user => {
        const myQueries = queries.filter(q => q.assignedTo === user.id);
        return (
          <div key={user.id} style={{ background: G.white, borderRadius: 10, border: `1px solid ${G.gray200}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${G.gray200}`,
              display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar user={user} size={36} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{user.name}</div>
                <div style={{ fontSize: 11, color: G.gray400 }}>{ROLE_LABELS[user.role]}</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: G.gray600 }}>
                {myQueries.length} queries
              </span>
            </div>
            {myQueries.map(q => (
              <div key={q.id} style={{ padding: "8px 16px", borderBottom: `1px solid ${G.gray100}`,
                display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: G.gray400, minWidth: 90 }}>{q.id}</span>
                <span style={{ fontSize: 12, flex: 1 }}>{q.clientName}</span>
                <StatusBadge status={q.status} />
              </div>
            ))}
            {myQueries.length === 0 && (
              <div style={{ padding: "16px", textAlign: "center", fontSize: 12, color: G.gray400 }}>
                No active queries
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── QUOTATION GENERATOR v2 — with exact Unitop letterhead ───────────────────
