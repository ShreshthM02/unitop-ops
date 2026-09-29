import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, DEFAULT_DOC_TEMPLATES, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, FileTypeBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML, mapDbQueryRow, applyQueryRealtimeEvent, useRealtimeTable, mergePaymentsRows, savePaymentsToDB, saveVendorToDB, saveAgentToDB, buildQuerySavePayload, mergeQueryForSave, queueSequential, mergeTourExecutionRows, saveTourExecutionToDB, blankTourExecution, loadCostSheetVersions, mapCostSheetDaysToTourExecutionDays, loadFinalCostSheetVersion, loadAppSetting, saveAppSetting, mergeDocTemplates, formatDateDMY, getAutoDetectedSteps, toggleWFStep, logAudit, db, formatDateSlash, loadSeries, nextDocNumber, nextDocNumberAtomic, loadSignatures, migrateContacts, isUuid, loadConversationsForStaff, isConversationUnread, findOrCreateDM, nightsDaysLabel, isTourOnGround, entryINR, formatSidebarClock } = Lib;
import AgentMaster from './AgentMaster.jsx';
import SeriesManagement from './SeriesManagement.jsx';
import AllQueriesView from './AllQueriesView.jsx';
import CancelModal from './CancelModal.jsx';
import Dashboard from './Dashboard.jsx';
import EnhancedPaymentTracker from './EnhancedPaymentTracker.jsx';
import ExchangeOrderGenerator from './ExchangeOrderGenerator.jsx';
import GanttView from './GanttView.jsx';
import InAppChat from './InAppChat.jsx';
import Itinerary from './Itinerary.jsx';
import KanbanView from './KanbanView.jsx';
import NewQueryModal from './NewQueryModal.jsx';
import InvoiceGenerator from './InvoiceGenerator.jsx';
import QueryDrawerWithQuote from './QueryDrawerWithQuote.jsx';
import QuotationGenerator from './QuotationGenerator.jsx';
import ReportsView from './ReportsView.jsx';
import SmartSearch from './SmartSearch.jsx';
import TeamView from './TeamView.jsx';
import TemplatesHub from './TemplatesHub.jsx';
import AdminPlaceLibrary from './AdminPlaceLibrary.jsx';
import MaintenancePanel from './MaintenancePanel.jsx';
import TourBriefingSheet from './TourBriefingSheet.jsx';
import DocumentEditor from './DocumentEditor.jsx';
import UserProfilePanel from './UserProfilePanel.jsx';
import VendorMaster from './VendorMaster.jsx';
import { CostSheet } from './CostSheet.jsx';
import { UserManagementPanel } from './UserManagementPanel.jsx';

export default function UnitopApp({ authUser, onOpenVendorLedger, onOpenAgentLedger, onUpdateAuthUser }) {
  const [view, setView]           = useState(() => localStorage.getItem("unitop_last_view") || "dashboard");
  useEffect(() => { localStorage.setItem("unitop_last_view", view); }, [view]);
  // Gates the very first render: without this, the app shows hardcoded
  // demo data (INITIAL_QUERIES etc.) instantly, then swaps to real data a
  // moment later once Supabase responds -- a visible flash of fake queries
  // ("Sharma Family", "Chen Group") that's genuinely confusing for a real
  // user. Showing a brief loading state instead avoids that entirely.
  const [dataLoading, setDataLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Real-time sidebar clock (direct request, 2026-09-29): day, dd/mm/yyyy
  // date, 24H time, ticking every second. Lives entirely in this one
  // piece of state -- a single setInterval re-renders just the sidebar
  // clock line, not the rest of the app.
  const [sidebarClock, setSidebarClock] = useState(new Date());
  useEffect(() => {
    const tick = setInterval(() => setSidebarClock(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);
  // Real, serious bug found and fixed here: these five used to start as
  // hardcoded demo constants (INITIAL_QUERIES etc, "Anderson Family" and
  // similar sample records) on the theory that the real fetch below
  // would always replace them -- but a genuinely empty real table (a
  // fresh install, or right after a clean-slate wipe) left that fetch's
  // own result correctly empty, and a separate bug in that fetch (see
  // below) then failed to ever apply it. Starting from real emptiness
  // here removes the fallback entirely, rather than just fixing the one
  // bug that exposed it -- nothing for a future, different bug to fall
  // back to ever again.
  const [queries, setQueries]     = useState([]);
  const [agents, setAgents]       = useState([]);
  const [series, setSeries]       = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [vendors, setVendors]     = useState([]);
  const [staff, setStaff]         = useState([]);
  const [payments, setPayments]   = useState({});
  const [tourExecutions, setTourExecutions] = useState({});
  const [costSheetExists, setCostSheetExists] = useState(new Set());
  const [quotationExists, setQuotationExists] = useState(new Set());
  const [docSettings, setDocSettings] = useState(DEFAULT_DOC_SETTINGS);
  const [docTemplates, setDocTemplates] = useState(DEFAULT_DOC_TEMPLATES);
  const saveDocTemplates = (t) => {
    setDocTemplates(t);
    saveAppSetting(db, "doc_templates", t);
    showToast("Templates saved");
  };
  const saveDocSettings = (s) => {
    setDocSettings(s);
    saveAppSetting(db, "doc_numbering", s);
  };
  const [activeQuery, setActiveQuery]   = useState(null);
  const isFirstActiveQueryEffect = useRef(true);
  // Serializes saveQueryToDB calls PER QUERY ID (see saveQueryToDB below).
  // Same class of bug, same fix shape, as the real data-loss incident on
  // tour file UT-3495's Service Status list (ServicesList.jsx): every
  // caller of handleUpdateQuery/saveQueryToDB fires its own unawaited,
  // fire-and-forget upsert. Two edits to the SAME query fired close
  // together -- e.g. changing Reviewer then Series in QueryDrawerWithQuote,
  // or a Quotation pax-sync landing moments after a Tour Details save --
  // each merge onto whatever `queries` looked like when THEY fired, then
  // race to the DB independently. Whichever save's network round-trip
  // happens to resolve LAST wins, even if it was fired first and is
  // therefore working from a now-stale base -- so it can silently
  // overwrite a newer edit with old values for every field it didn't
  // itself touch. This is a very plausible remaining cause of "editing a
  // query makes it look blank/reverted" reports after the original
  // mergeQueryForSave fix (which only ever addressed a bare partial
  // object being force-defaulted, not this ordering race).
  const querySaveChainsRef = useRef({});

  // Root-cause fix (2026-09-29, follow-up to the v1.58.0 atomic-serial
  // change): handleNewQuery and handleConvertToCaseFile now both `await`
  // a real DB round-trip (nextDocNumberAtomic) BEFORE the optimistic
  // local-state update and modal close that used to happen synchronously,
  // right at click time. Neither NewQueryModal's "Create" button nor the
  // "Convert to Tour File" button (KanbanView / QueryDrawerWithQuote) ever
  // disabled themselves while a save was in flight -- previously a
  // harmless gap, since the old nextDocNumber() was fully synchronous and
  // the window for an accidental double-click/double-submit before the
  // modal closed was only a few milliseconds. The new real network
  // round-trip (bump_doc_serial) widens that window to a few hundred
  // milliseconds, which is exactly what a user double-clicking (or
  // double-tapping on a slow connection) can land in -- and unlike the
  // OLD numbering, the atomic RPC guarantees each concurrent call gets a
  // genuinely DIFFERENT serial, so a double-submit here doesn't collide,
  // it silently creates a second, real, fully-valid duplicate query --
  // which is exactly what shows up as an unexpected/duplicate entry
  // disturbing the Recent Queries widget right after creating one query.
  // Guarded here, at the handler level (not just a button's `disabled`),
  // so it holds regardless of which UI element triggers it.
  const newQueryInFlightRef = useRef(false);
  const convertInFlightRef = useRef(new Set());
  useEffect(() => {
    // Skip the very first run (component mount): activeQuery's initial
    // value is always null, and without this guard, that fires this
    // effect's "else" branch immediately and wipes unitop_last_query_id
    // before the data-load effect below ever gets a chance to read it --
    // restoration was destroying its own saved value before using it.
    if (isFirstActiveQueryEffect.current) { isFirstActiveQueryEffect.current = false; return; }
    if (activeQuery) localStorage.setItem("unitop_last_query_id", activeQuery.id);
    else localStorage.removeItem("unitop_last_query_id");
  }, [activeQuery]);
  const [showNewQuery, setShowNewQuery] = useState(false);
  const [showSearch, setShowSearch]     = useState(false);
  const [showCostSheet,  setShowCostSheet]  = useState(null);
  const [pendingCostSheetId, setPendingCostSheetId] = useState(null);
  // Single Itinerary document now, replacing what were two separate
  // panels (Brief and Detailed). One shared open/close state; the
  // Brief/Detailed distinction lives INSIDE the component as a flavor
  // toggle, not as two different things to open.
  const [showItinerary, setShowItinerary] = useState(null);
  const [showQuotation,  setShowQuotation]  = useState(null);
  const [showInvoices,   setShowInvoices]   = useState(null); // { query, flavor: 'proforma'|'tax' } | null
  const [showPayments,   setShowPayments]   = useState(null);
  const [showTourBrief,  setShowTourBrief]  = useState(null);
  const [showVoucher,    setShowVoucher]    = useState(null);
  const [showEditor,     setShowEditor]     = useState(null);
  const [showAgents,     setShowAgents]     = useState(false);
  const [showSeries,     setShowSeries]     = useState(false);
  const [showVendors,    setShowVendors]    = useState(false);
  // Record-anchored discussion threads: @mentioning an agent/vendor/
  // series opens that panel already focused on the mentioned entity,
  // same idea as unitop-activate-query's existing bridge for queries --
  // these three panels manage their own `selected` state internally, so
  // this seeds it via an initialSelectedId prop rather than controlling
  // selection from here.
  //
  // Also persisted to localStorage, same pattern as `view` above -- real,
  // confirmed bug fixed here (part of "refreshing drops the user back to
  // the top-level list instead of where they actually were", reported
  // together with the vanishing Add Rate button): `view` alone survives a
  // refresh (restores "Vendor Repository", say), but WHICH vendor was
  // drilled into did not -- these three ids were plain in-memory state,
  // reset to null on every fresh mount, so a refresh always dropped back
  // to the bare list even when `view` correctly remembered the tab.
  // Restoring these the same way `view` already is closes that gap for
  // the specific "list -> record" drill-down these three panels share
  // (Vendors/Agents/Series); a still-deeper level (which tab *within*
  // that record, e.g. Contracted Rates vs Profile) is not covered here
  // and would need its own, per-panel follow-up if it turns out to matter
  // as much in practice.
  const [focusAgentId,   setFocusAgentId]   = useState(() => localStorage.getItem("unitop_focus_agent") || null);
  const [focusVendorId,  setFocusVendorId]  = useState(() => localStorage.getItem("unitop_focus_vendor") || null);
  const [focusSeriesId,  setFocusSeriesId]  = useState(() => localStorage.getItem("unitop_focus_series") || null);
  useEffect(() => {
    if (focusAgentId) localStorage.setItem("unitop_focus_agent", focusAgentId);
    else localStorage.removeItem("unitop_focus_agent");
  }, [focusAgentId]);
  useEffect(() => {
    if (focusVendorId) localStorage.setItem("unitop_focus_vendor", focusVendorId);
    else localStorage.removeItem("unitop_focus_vendor");
  }, [focusVendorId]);
  useEffect(() => {
    if (focusSeriesId) localStorage.setItem("unitop_focus_series", focusSeriesId);
    else localStorage.removeItem("unitop_focus_series");
  }, [focusSeriesId]);
  const [focusConvId,    setFocusConvId]    = useState(null);
  const [showUserMgmt,   setShowUserMgmt]   = useState(false);
  const [cancelTarget,   setCancelTarget]   = useState(null);
  const [showChat,       setShowChat]       = useState(false);
  // Global, always-loaded (not just while the chat panel is open) so
  // the sidebar unread badge and mention toasts work even when chat is
  // closed -- InAppChat.jsx keeps its own separate copy for the open
  // panel's own UI, this one exists purely for the badge/notification.
  const [chatConversations, setChatConversations] = useState([]);
  const [showProfile,    setShowProfile]    = useState(false);
  const [statFilter,     setStatFilter]     = useState(null); // {key, label, items}
  const [toast, setToast] = useState(null);
  const [toastType, setToastType] = useState("success");
  // Build currentUser from authUser (Supabase) or fall back to demo
  const currentUser = authUser ? {
    id:     authUser.id,
    name:   authUser.name,
    role:   authUser.role,
    // Real bug found and fixed here: this used to recompute "avatar"
    // fresh on every login using the old, buggy name.slice(0,2) logic
    // -- since Avatar's own render checks user?.avatar first (a real,
    // deliberate manual-override mechanism, staff.avatar in the
    // database), this silently masked the real initials fix in
    // helpers.jsx for every single logged-in user. Passes through the
    // real stored value (or none at all) instead, letting Avatar's own
    // getInitials() fallback compute real initials correctly when no
    // manual override actually exists.
    avatar: authUser.avatar || null,
    avatarUrl: authUser.avatar_url || authUser.avatarUrl || null,
    color:  authUser.color || "#1A5276",
    permissions: authUser.permissions || {},
  } : USERS[0];

  // Keyboard shortcut for search
  useEffect(()=>{
    const keyHandler = (e) => { if((e.metaKey||e.ctrlKey)&&e.key==="k"){ e.preventDefault(); setShowSearch(true); } };
    window.addEventListener("keydown", keyHandler);
    return ()=>window.removeEventListener("keydown", keyHandler);
  },[]);

  // Handle drawer panel events (allows drawer buttons to open panels)
  useEffect(()=>{
    const handler = (e) => {
      const {panel, query} = e.detail;
      if(panel==="costsheet") setShowCostSheet(query);
      else if(panel==="itinerary" || panel==="detailedItinerary") setShowItinerary(query);
      else if(panel==="quotation") setShowQuotation(query);
      else if(panel==="proforma")  setShowInvoices({query, flavor:"proforma"});
      else if(panel==="payments")  setShowPayments(query);
      else if(panel==="taxinv")    setShowInvoices({query, flavor:"tax"});
      else if(panel==="voucher")      setShowVoucher(query);
      else if(panel==="mealplan")     setShowTourBrief(query); // Meal Plan folded into Tour Briefing Sheet (2026-08-22)
      else if(panel==="tourbriefing") setShowTourBrief(query);
      else if(panel==="editor") setShowEditor(query);
    };
    document.addEventListener("unitop-open", handler);
    return ()=>document.removeEventListener("unitop-open", handler);
  },[]);

  // A Query ID / Tour File ID clicked from OUTSIDE this component's own
  // tree (Agent Ledger and Vendor Ledger panels are rendered as App.jsx's
  // siblings of UnitopApp, not its children, so they can't call
  // setActiveQuery directly) opens that query's drawer here, the same
  // custom-event bridge the panel-open buttons above already use.
  useEffect(()=>{
    const handler = (e) => setActiveQuery(e.detail.query);
    document.addEventListener("unitop-activate-query", handler);
    return ()=>document.removeEventListener("unitop-activate-query", handler);
  },[]);

  // Same bridge, for the three other mentionable entity types in
  // discussion threads -- opens the panel already focused on the
  // mentioned agent/vendor/series.
  useEffect(()=>{
    // Real bug fixed here: these used to unconditionally open a
    // second, independent overlay (its own separate form/selected/
    // editing state) even when the corresponding Master tab was
    // already the active view -- two uncoordinated editors on the
    // same underlying data at once. A save from either one could
    // leave the other holding stale state, and if that stale editor
    // was later saved too (e.g. a forgotten "+ New" form left open
    // behind the overlay), it could silently create a genuine
    // duplicate record. Now: if that tab is already open, just
    // update the shared focus id instead -- the tab instance now
    // has its own real sync effect (see AgentMaster/VendorMaster/
    // SeriesManagement) and will pick up the new focus without a
    // second, competing instance ever being mounted.
    const onAgent=(e)=>{setFocusAgentId(e.detail.id); if (view!=="agents") setShowAgents(true);};
    const onVendor=(e)=>{setFocusVendorId(e.detail.id); if (view!=="vendors") setShowVendors(true);};
    const onSeries=(e)=>{setFocusSeriesId(e.detail.id); if (view!=="series") setShowSeries(true);};
    document.addEventListener("unitop-activate-agent", onAgent);
    document.addEventListener("unitop-activate-vendor", onVendor);
    document.addEventListener("unitop-activate-series", onSeries);
    return ()=>{
      document.removeEventListener("unitop-activate-agent", onAgent);
      document.removeEventListener("unitop-activate-vendor", onVendor);
      document.removeEventListener("unitop-activate-series", onSeries);
    };
  },[view]);

  const can = useCan(currentUser);

  // ── Load data from Supabase on mount ──────────────────────────────────────
  useEffect(() => {
    // Demo Mode used to reach this exact point with no login at all --
    // removed entirely (2026-09) rather than fixed, since it was unused
    // and its removal was simpler and safer than making it genuinely
    // isolated. authUser is now guaranteed once UnitopApp renders at
    // all (App.jsx only renders it after a real login), but this guard
    // stays as cheap insurance against ever mounting this component
    // without one.
    if (!authUser) { setDataLoading(false); return; }
    const loadData = async () => {
      try {
        // All 12 of these are independent of each other -- none needs
        // another's RESULT to make its own request, they only get combined
        // in JS afterward. Running them sequentially (as this used to)
        // meant the total wait was the SUM of every round-trip; in
        // parallel it's roughly the time of the single slowest one.
        const [
          { data: qData }, { data: auditData }, { data: remarkData },
          { data: agData }, { data: vData }, { data: staffData },
          docSettingsValue, docTemplatesValue,
          { data: payData }, { data: inData }, { data: outData },
          { data: teData },
          { data: csIdData }, { data: quoteIdData },
          seriesData, signaturesData,
        ] = await Promise.all([
          db.from("queries").select("*").order("created_at", {ascending:false}),
          db.from("query_audit").select("*").order("created_at", {ascending:true}),
          db.from("query_remarks").select("*").order("created_at", {ascending:true}),
          db.from("agents").select("*").is("deleted_at", null).order("company", {ascending:true}),
          db.from("vendors").select("*").is("deleted_at", null).order("name", {ascending:true}),
          // Staff: only safe display columns, never password_hash/
          // session_token/permissions -- the client has no legitimate
          // reason to hold those in memory. avatar_url added alongside
          // this signatures work -- found missing here while touching
          // this same query: without it, colleagues' real uploaded
          // photos never showed anywhere in the app except User
          // Management's own separate getStaffList() call, which
          // already had it.
          db.from("staff_public").select("id,name,role,color,avatar,avatar_url,active").is("deleted_at", "null").order("name", {ascending:true}),
          loadAppSetting(db, "doc_numbering", DEFAULT_DOC_SETTINGS),
          loadAppSetting(db, "doc_templates", DEFAULT_DOC_TEMPLATES),
          db.from("payments").select("*"),
          db.from("payment_incoming").select("*").order("created_at", {ascending:true}),
          db.from("payment_outgoing").select("*").order("created_at", {ascending:true}),
          db.from("tour_execution").select("*"),
          // Lightweight existence checks for the 17-step workflow tracker's
          // real auto-detection (steps 4 and 5) -- just the ids, not the
          // full cost sheet/quotation content.
          db.from("cost_sheets").select("query_id"),
          db.from("quotations").select("query_id"),
          loadSeries(db),
          loadSignatures(db),
        ]);
        setCostSheetExists(new Set((csIdData||[]).map(r=>r.query_id)));
        setQuotationExists(new Set((quoteIdData||[]).map(r=>r.query_id)));
        setSeries(seriesData);
        setSignatures(signaturesData);

        // Real, serious bug found and fixed: this used to require
        // qData.length > 0 before trusting it, meaning a genuinely
        // empty queries table (e.g. right after a clean-slate wipe,
        // or simply a brand-new install) left `queries` state stuck
        // at its hardcoded initial demo value (INITIAL_QUERIES,
        // "Anderson Family" etc) forever -- displayed as if real, and
        // any interaction with it could write that fake data straight
        // into the live database. A real fetch result -- even an
        // empty array -- must always be trusted over a hardcoded
        // placeholder.
        if (qData) {
          const mapped = qData.map(q => ({ ...mapDbQueryRow(q), audit: [], remarks: [] }));
          const auditMap = {};
          (auditData||[]).forEach(a => {
            if (!auditMap[a.query_id]) auditMap[a.query_id] = [];
            auditMap[a.query_id].push({ by: a.by_name, at: new Date(a.created_at).toLocaleString("en-IN"), action: a.action });
          });
          const remarkMap = {};
          (remarkData||[]).forEach(r => {
            if (!remarkMap[r.query_id]) remarkMap[r.query_id] = [];
            remarkMap[r.query_id].push({ id: r.id, by: r.by_name, byStaffId: r.by_staff_id, at: new Date(r.created_at).toLocaleString("en-IN"), createdAt: r.created_at, text: r.text, mentions: r.mentions || [] });
          });
          mapped.forEach(q => {
            q.audit   = auditMap[q.id]   || [];
            q.remarks = remarkMap[q.id]  || [];
          });
          setQueries(mapped);
          // Restore whichever query's drawer was open before a refresh --
          // legitimately personal/device-specific navigation state, not
          // data that needs to sync across the team.
          const lastQueryId = localStorage.getItem("unitop_last_query_id");
          if (lastQueryId) {
            const restored = mapped.find(q => q.id === lastQueryId);
            if (restored) setActiveQuery(restored);
          }
        }
        // Same real bug, same fix: an empty result is a genuine, valid
        // state to trust, not a signal to keep showing hardcoded demo
        // agents/vendors/staff/payments instead.
        if (agData) {
          setAgents(agData.map(a => {
            // Real bug found and fixed here: website was added to the
            // database and to the save payload, but never to this
            // read-side mapping -- a completely separate code path.
            // Every fetch silently discarded it regardless of whether
            // it was correctly saved, which is why it never appeared
            // even for rows updated directly in the database.
            const mapped = { id: a.id, company: a.company, country: a.country, city: a.city, address: a.address,
              market: a.market, contactName: a.contact_name, contactPhone: a.contact_phone,
              contactEmail: a.contact_email, gstin: a.gstin, website: a.website, notes: a.notes, active: a.active,
              contacts: a.contacts || [] };
            return { ...mapped, contacts: migrateContacts(mapped) };
          }));
        }
        if (vData) {
          setVendors(vData.map(v => {
            const mapped = { id: v.id, name: v.name, type: v.type, city: v.city, address: v.address,
              contactName: v.contact_name, contactPhone: v.contact_phone,
              contactEmail: v.contact_email, gstin: v.gstin, website: v.website, notes: v.notes,
              languages: v.languages, areas: v.areas, active: v.active,
              rates: v.rates || [], contacts: v.contacts || [] };
            return { ...mapped, contacts: migrateContacts(mapped) };
          }));
        }
        if (staffData) {
          setStaff(staffData.filter(s => s.active !== false));
        }
        setDocSettings(docSettingsValue);
        // Field-level merge, not a plain assignment: a doc_templates row
        // saved before a template field existed in the code would otherwise
        // hand documents an object with that field missing, which rendered
        // as a literal "undefined" in the Quotation PDF headings.
        setDocTemplates(mergeDocTemplates(DEFAULT_DOC_TEMPLATES, docTemplatesValue));
        const paymentsMap = mergePaymentsRows(payData, inData, outData);
        setPayments(paymentsMap);
        const teMap = mergeTourExecutionRows(teData);
        setTourExecutions(teMap);
      } catch(e) {
        console.warn("Could not load from Supabase, using demo data:", e);
      } finally {
        setDataLoading(false);
      }
    };
    loadData();
  }, [authUser]);

  // ── Realtime: reflect other users' query changes live, no refresh needed ──
  // Requires Realtime to be enabled for the `queries` table in Supabase
  // (Database > Replication, or `alter publication supabase_realtime add
  // table queries;`) — this is a project-level setting, not something the
  // app can turn on itself.
  useRealtimeTable("queries", (eventType, newRow, oldRow) => {
    setQueries(qs => applyQueryRealtimeEvent(qs, eventType, newRow, oldRow));
  });

  // Record-anchored discussion threads: live updates for messages other
  // people send while you're viewing the same query/tour file. Skips
  // events for the current user's OWN messages -- those are already
  // reflected via handleAddRemark's own optimistic local update, and
  // the optimistic entry has no real id yet to reconcile against
  // (matching by content/timestamp would be fragile); the one accepted
  // tradeoff is the same account open in two tabs won't see its own
  // just-sent message in the second tab until a reload, a low-stakes
  // edge case.
  useRealtimeTable("query_remarks", (eventType, newRow) => {
    if (eventType !== "INSERT" || !newRow) return;
    if (newRow.by_staff_id && newRow.by_staff_id === currentUser?.id) return;
    const msg = { id: newRow.id, by: newRow.by_name, byStaffId: newRow.by_staff_id, at: new Date(newRow.created_at).toLocaleString("en-IN"), createdAt: newRow.created_at, text: newRow.text, mentions: newRow.mentions || [] };
    setQueries(qs => qs.map(q => q.id === newRow.query_id ? { ...q, remarks: [...(q.remarks || []), msg] } : q));
    setActiveQuery(q => q && q.id === newRow.query_id ? { ...q, remarks: [...(q.remarks || []), msg] } : q);
    // Mention notification, part of "is he notified" -- applies to
    // discussion threads the same as DM/Group chat below.
    if (authUser && currentUser?.id && (newRow.mentions || []).some(m => m.type === "staff" && m.id === currentUser.id)) {
      showToast(`💬 ${newRow.by_name} mentioned you in a discussion`);
    }
  });

  // Global chat conversations, kept loaded even when the chat panel is
  // closed -- purely to drive the sidebar unread badge and mention
  // toasts, both of "is he notified" / "does chat have unread badges".
  // Same debounce fix as InAppChat's own reload -- this global version
  // has the SAME redundancy problem (every realtime event here also
  // triggers InAppChat's own reload when the panel is open), so both
  // need it independently.
  // Same max-wait fix as InAppChat's own reloadConversations -- this
  // global copy has the identical unbounded-reset problem, since it
  // ALSO subscribes to the same tables.
  const chatReloadTimeoutRef = useRef(null);
  const chatReloadMaxWaitRef = useRef(null);
  const reloadChatConversations = useCallback(() => {
    if (!authUser || !currentUser?.id) return;
    if (chatReloadTimeoutRef.current) clearTimeout(chatReloadTimeoutRef.current);
    const fire = () => {
      clearTimeout(chatReloadTimeoutRef.current); clearTimeout(chatReloadMaxWaitRef.current);
      chatReloadTimeoutRef.current = null; chatReloadMaxWaitRef.current = null;
      loadConversationsForStaff(db, currentUser.id).then(setChatConversations);
    };
    chatReloadTimeoutRef.current = setTimeout(fire, 150);
    if (!chatReloadMaxWaitRef.current) chatReloadMaxWaitRef.current = setTimeout(fire, 400);
  }, [authUser, currentUser?.id]);
  useEffect(() => { reloadChatConversations(); }, [reloadChatConversations]);

  useRealtimeTable("chat_messages", (eventType, newRow) => {
    if (eventType !== "INSERT" || !newRow || !authUser) return;
    if (newRow.sender_id !== currentUser?.id) {
      if (currentUser?.id && (newRow.mentions || []).some(m => m.type === "staff" && m.id === currentUser.id)) {
        showToast(`💬 ${newRow.sender_name} mentioned you in chat`);
      }
    }
    reloadChatConversations();
  });
  useRealtimeTable("chat_conversation_members", (eventType, newRow, oldRow) => {
    if (!authUser) return;
    const relevant = (newRow && newRow.staff_id === currentUser?.id) || (oldRow && oldRow.staff_id === currentUser?.id);
    if (relevant) reloadChatConversations();
  });

  // ── Persist query to Supabase ──────────────────────────────────────────────
  // Every caller's actual DB work happens here, but always queued behind
  // querySaveChainsRef, keyed per query id -- see that ref's own comment
  // above for why. Chaining through .then() (rather than calling doSave
  // directly) guarantees a save for query X never starts until any
  // earlier-fired save for that SAME query X has fully finished, so saves
  // land in the DB in the same order the user actually made the edits,
  // regardless of which network round-trip happens to come back first.
  // Saves for two DIFFERENT queries are unrelated and still run fully in
  // parallel, keyed separately.
  const saveQueryToDB = (q, auditAction) => {
    const doSave = async () => {
      try {
        // upsert() never throws on a failed save -- it resolves normally
        // with { data: null, error: {...} } even on a 4xx/5xx response,
        // since the underlying fetch() only rejects on network-level
        // failures, not HTTP error statuses. This try/catch alone was
        // never actually capable of catching a real save failure; the
        // error field was silently ignored, so a query could appear
        // created (optimistic UI update) while never actually persisting,
        // with nothing in the console or UI hinting why. Checking it
        // explicitly is what makes both the catch block and the toast
        // below actually work.
        const { error } = await db.from("queries").upsert(buildQuerySavePayload(q));
        if (error) throw new Error(error.message || "Query save failed");
        if (auditAction) {
          await db.from("query_audit").insert({
            query_id: q.id,
            by_name:  currentUser.name,
            action:   auditAction,
          });
        }
        return true;
      } catch(e) {
        console.warn("Save to DB failed:", e);
        showToast(`⚠ Failed to save "${q.groupName||q.id}" — changes may be lost on refresh. ${e.message||""}`, "error");
        return false;
      }
    };
    return queueSequential(querySaveChainsRef.current, q.id, doSave);
  };

  // Preview-only: used for the "Query Number (auto-assigned)" text shown
  // in NewQueryModal before the user has saved anything. Deliberately
  // never persists the bumped serial from nextDocNumber() -- only the
  // real save (handleNewQuery, below) commits that increment. Both read
  // the same current serial, so the preview and the actually-assigned
  // id always agree as long as nothing else creates a query in between.
  const nextQueryId = () => nextDocNumber(docSettings, "query", {}).number;
  const showToast = (msg, type = "success") => { setToast(msg); setToastType(type); };
  const updatePayments = (queryId, data, auditAction, deletedIds) => {
    setPayments(p => ({ ...p, [queryId]: data })); // optimistic local update, same as before
    savePaymentsToDB(db, queryId, data, deletedIds); // fire-and-forget persistence, mirrors saveQueryToDB's pattern
    if (auditAction) logAudit(db, queryId, currentUser.name, auditAction);
  };

  const updateTourExecution = (queryId, data, auditAction) => {
    setTourExecutions(p => ({ ...p, [queryId]: data }));
    saveTourExecutionToDB(db, data);
    if (auditAction) db.from("query_audit").insert({ query_id: queryId, by_name: currentUser.name, action: auditAction });
  };

  // Was referenced by QueryDrawerWithQuote's "Save Changes" button but never
  // actually passed in -- editing query details silently did nothing.
  //
  // Real, confirmed bug fixed here (root cause of the "editing a query
  // makes a blank phantom entry appear" report): some callers pass a
  // FULL edited copy of the query (QueryDrawerWithQuote's Save Changes,
  // editForm = {...query}), but others intentionally pass a single-field
  // partial -- the Reviewer/Series dropdowns ({reviewerId:...} /
  // {seriesId:...}) and QuotationGenerator's confirmed-pax sync
  // ({paxDisplay:...}). buildQuerySavePayload() always emits every
  // column, by design (covered by its own tests) -- any field missing
  // from its input is force-defaulted (nights/pax_exact/pax_min/pax_max
  // -> null, cancelled -> false, manual_wf -> [], file_type/assigned_to/
  // travel_date_to -> null, etc.), not left alone. Handing it a bare
  // partial object therefore didn't just update the one changed field --
  // it silently WIPED every other one of those columns in the database,
  // on every single-field edit. The Realtime echo of that corrupted row
  // then overwrote the correct local copy, which is exactly what showed
  // up as a "blank" entry (missing dates/pax/etc) app-wide until a
  // refresh reloaded whatever was actually still intact. Fix: always
  // save the full current-record-plus-updates object, never the bare
  // diff, so buildQuerySavePayload only ever sees real, complete data.
  const handleUpdateQuery = (queryId, updates) => {
    setQueries(qs => qs.map(q => q.id === queryId ? { ...q, ...updates } : q));
    setActiveQuery(q => q && q.id === queryId ? { ...q, ...updates } : q);
    const existing = queries.find(q => q.id === queryId);
    const fullRecord = mergeQueryForSave(existing, { ...updates, id: queryId });
    saveQueryToDB(fullRecord, "Updated query details");
  };

  const handleNewQuery = async (form) => {
    // Double-submit guard -- see newQueryInFlightRef's own comment above.
    if (newQueryInFlightRef.current) return;
    newQueryInFlightRef.current = true;
    try {
    // Real-DB atomic serial (see nextDocNumberAtomic's own comment) --
    // this id becomes the new query's primary key, so it must never be
    // computable identically by two concurrent callers the way the old
    // client-cached-serial version could be.
    const id = await nextDocNumberAtomic(db, docSettings, "query", { group: form.groupName, sector: form.sector });
    // Optimistic, LOCAL-ONLY bump of the on-screen preview for the *next*
    // new query -- deliberately never saved back to the DB (see
    // nextDocNumberAtomic's comment on why re-saving the whole blob here
    // would silently undo the atomic bump this just performed, or anyone
    // else's concurrent one).
    setDocSettings(s => ({ ...s, query: { ...(s.query||{}), serial: (s.query?.serial||1) + 1 } }));
    const now = new Date().toLocaleString("en-IN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    const paxDisplay = form.paxKnown?`${form.paxExact} pax`:`${form.paxMin||"?"}–${form.paxMax||"?"} pax (TBC)`;
    const dateDisplay = form.dateKnown?`${formatDateSlash(form.travelDateFrom)}${form.travelDateTo?" → "+formatDateSlash(form.travelDateTo):""}`:`${form.travelMonth||""}${form.travelSeason?" · "+form.travelSeason:""} (TBC)`;
    const newQ = {...form,id,type:"query",status:"new_query",
      clientName:form.groupName||form.agentCompany,
      destination:form.sector,nationality:form.nationality,
      pax:form.paxKnown?form.paxExact:`${form.paxMin||"?"}–${form.paxMax||"?"}`,
      paxDisplay,dateDisplay,
      travelDate:form.dateKnown?form.travelDateFrom:(form.travelMonth||form.travelSeason||"TBC"),
      date:new Date().toISOString().split("T")[0],
      manualWF:[],cancelled:false,
      audit:[{by:currentUser.name,at:now,action:`Query received via ${form.source}${form.sourceOther?" ("+form.sourceOther+")":""} from ${form.agentCompany}${form.correspondent?" ("+form.correspondent+")":""} — acknowledged`}]
    };
    setQueries(q=>[newQ,...q]);
    setShowNewQuery(false);
    // Bug fix: this used to fire a "created" success toast immediately,
    // synchronously, right after calling saveQueryToDB() without
    // awaiting it -- so even once saveQueryToDB was fixed to surface a
    // real error toast on failure, that error toast was racing against
    // (and getting silently overwritten by) the success toast that had
    // already fired, since both share the same single toast state slot.
    // Awaiting first means only one toast ever actually shows, and it's
    // the correct one.
    const saved = await saveQueryToDB(newQ, newQ.audit[0].action);
    if (saved !== false) showToast(`Query ${id} created and acknowledged`);
    } finally {
      newQueryInFlightRef.current = false;
    }
  };

  const handleConvertToCaseFile = async (query) => {
    // Double-submit guard, keyed per query id -- see convertInFlightRef's
    // own comment above. Only blocks a second click converting the SAME
    // query while its own conversion is still in flight; a different
    // query converting at the same time is unaffected.
    if (convertInFlightRef.current.has(query.id)) return;
    convertInFlightRef.current.add(query.id);
    try {
    // Same atomic-serial fix as handleNewQuery above -- a tour file
    // number isn't a primary key, but it's still a real, meaningful
    // business identifier staff rely on being unique; two concurrent
    // conversions must never be able to compute the same one.
    const tourNum = await nextDocNumberAtomic(db, docSettings, "tourfile", { group: query.groupName || query.clientName, sector: query.destination || query.sector, id: query.id });
    setDocSettings(s => ({ ...s, tourfile: { ...(s.tourfile||{}), serial: (s.tourfile?.serial||1) + 1 } }));
    const now = new Date().toLocaleString("en-IN");
    const auditMsg = `Converted to Tour File — Tour No. ${tourNum} assigned`;
    const updQ = {...query,tourFileId:tourNum,audit:[...(query.audit||[]),{by:currentUser.name,at:now,action:auditMsg}]};
    setQueries(qs=>qs.map(q=>q.id===query.id?updQ:q));
    setActiveQuery(q=>q?{...q,tourFileId:tourNum}:null);
    saveQueryToDB(updQ, auditMsg);
    showToast(`Tour File opened — ${tourNum}`);

    // Renames (never recreates) the query's Drive folder to the real
    // tour file name the moment it exists -- every document uploaded
    // before conversion stays exactly where it was, just under its new
    // name. Async and non-blocking, same reasoning as the Document
    // Chain pre-fill just below: skips silently (a no-op on Drive's
    // side) if no folder exists yet, i.e. nothing was ever uploaded
    // before this conversion.
    db.drive.renameFolder(query.id, `${tourNum} - ${query.groupName || query.clientName || "Untitled"}`);

    // Document Chain plan (docs/DATA_OWNERSHIP.md): one-time reverse
    // pre-fill at conversion. Tour Info's Day-wise tabs have never been
    // editable before this moment (gated behind tourFileId), so
    // tour_execution almost always has no days yet -- while Cost Sheet,
    // typically opened earlier during "costing", usually already has
    // real, priced day-wise data. Safe by construction: only fires when
    // tour_execution genuinely has no days of its own yet, so it can
    // never overwrite anything ops may have already entered. Async and
    // non-blocking -- doesn't hold up the conversion itself.
    const existingTE = tourExecutions[query.id];
    if (!existingTE || !existingTE.days || existingTE.days.length === 0) {
      (async () => {
        const finalVersion = await loadFinalCostSheetVersion(db, query.id);
        let source = finalVersion;
        if (!source) {
          const allVersions = await loadCostSheetVersions(db, query.id);
          source = allVersions.length ? allVersions[allVersions.length - 1] : null;
        }
        if (!source) return;
        const teDays = mapCostSheetDaysToTourExecutionDays(source.days);
        if (teDays.length === 0) return;
        const teData = {
          queryId: query.id, days: teDays,
          facilitators: existingTE?.facilitators||[], localHandlers: existingTE?.localHandlers||[],
          transporters: existingTE?.transporters||[], flights: existingTE?.flights||[],
          arrFlightDetails: existingTE?.arrFlightDetails||"", depFlightDetails: existingTE?.depFlightDetails||"",
          syncedFromCostSheetVersion: source.version,
        };
        setTourExecutions(p => ({ ...p, [query.id]: teData }));
        saveTourExecutionToDB(db, teData);
        logAudit(db, query.id, currentUser.name, `Tour Info Day-wise Itinerary/Hotels pre-filled from Cost Sheet v${source.version} at conversion`);
      })();
    }
    } finally {
      convertInFlightRef.current.delete(query.id);
    }
  };

  const handleAdvance = (query, newStatus) => {
    const now = new Date().toLocaleString("en-IN");
    const label = KANBAN_COLS.find(c=>c.id===newStatus)?.label;
    if(newStatus==="costing") setShowCostSheet(query);
    setQueries(qs=>qs.map(q=>q.id===query.id?{...q,status:newStatus,audit:[...q.audit,{by:currentUser.name,at:now,action:`Moved to ${label}`}]}:q));
    setActiveQuery(q=>q?{...q,status:newStatus}:null);
    saveQueryToDB({...query,status:newStatus}, `Moved to ${label}`);
    showToast(`Query moved to ${label}`);
  };

  // Recovering a cancelled query/tour file back into active work. Distinct
  // from a normal stage advance (handleAdvance) since it also clears the
  // cancelled flag and requires a stated reason -- reversing a cancellation
  // is a meaningfully different event from routine progress and deserves
  // its own clear audit trail entry, not to be confused with either the
  // original cancellation or a plain stage move.
  const handleRecoverQuery = (queryId, reason, targetStatus) => {
    const q = queries.find(qq=>qq.id===queryId);
    if (!q) return;
    const now = new Date().toLocaleString("en-IN");
    const label = KANBAN_COLS.find(c=>c.id===targetStatus)?.label || targetStatus;
    const auditAction = `RECOVERED from cancelled — moved to ${label} — Reason: ${reason}`;
    const updatedQ = {...q, cancelled:false, status:targetStatus, audit:[...q.audit,{by:currentUser.name,at:now,action:auditAction}]};
    setQueries(qs=>qs.map(qq=>qq.id===queryId?updatedQ:qq));
    setActiveQuery(aq=>aq&&aq.id===queryId?updatedQ:aq);
    saveQueryToDB({...q, cancelled:false, status:targetStatus}, auditAction);
    showToast(`Recovered — moved to ${label}`);
  };

  // Admin-only correction for a tour file that got moved to the wrong
  // stage by mistake (e.g. accidentally advanced straight to Finance or
  // Completed). Distinct from both a normal forward "Moved to X" progress
  // step and cancelled-query recovery -- this is explicitly an override,
  // always requires a stated reason, and is gated by the force_move_stage
  // permission (admin role only by default) checked here as well as in
  // the UI, not just trusted from the button being clicked.
  const handleForceMoveStage = (queryId, targetStatus, reason) => {
    if (!getPermissions(currentUser).force_move_stage) return;
    const q = queries.find(qq=>qq.id===queryId);
    if (!q) return;
    const now = new Date().toLocaleString("en-IN");
    const fromLabel = KANBAN_COLS.find(c=>c.id===q.status)?.label || q.status;
    const toLabel = KANBAN_COLS.find(c=>c.id===targetStatus)?.label || targetStatus;
    const auditAction = `ADMIN OVERRIDE — moved from ${fromLabel} to ${toLabel} — Reason: ${reason}`;
    const updatedQ = {...q, status:targetStatus, audit:[...q.audit,{by:currentUser.name,at:now,action:auditAction}]};
    setQueries(qs=>qs.map(qq=>qq.id===queryId?updatedQ:qq));
    setActiveQuery(aq=>aq&&aq.id===queryId?updatedQ:aq);
    saveQueryToDB({...q, status:targetStatus}, auditAction);
    showToast(`Moved to ${toLabel} (admin override)`);
  };

  const handleToggleWF = (queryId, stepId) => {
    const q = queries.find(q=>q.id===queryId);
    if (!q) return;
    const autoDetected = getAutoDetectedSteps({
      hasCostSheet: costSheetExists.has(queryId),
      hasQuotation: quotationExists.has(queryId),
      hasFacilitators: (tourExecutions[queryId]?.facilitators || []).length > 0,
      hasPayments: (payments[queryId]?.entries || []).length > 0 || (payments[queryId]?.outgoing || []).length > 0,
    });
    const stepLabel = WF_STEPS.find(s=>s.id===stepId)?.label || `Step ${stepId}`;
    const { manualWF, auditAction } = toggleWFStep(q.manualWF, stepId, autoDetected, stepLabel);
    setQueries(qs=>qs.map(qq=>qq.id===queryId?{...qq,manualWF}:qq));
    setActiveQuery(aq=>aq && aq.id===queryId?{...aq,manualWF}:aq);
    saveQueryToDB({...q, manualWF}, auditAction);
  };

  const handleAddRemark = async (queryId, remark) => {
    setQueries(qs=>qs.map(q=>{
      if(q.id!==queryId) return q;
      return {...q, remarks:[...(q.remarks||[]), remark]};
    }));
    setActiveQuery(q=>q&&q.id===queryId?{...q,remarks:[...(q.remarks||[]),remark]}:q);
    // Save to DB -- by_staff_id and mentions added for the record-
    // anchored discussion thread work: mentions is the real, structured
    // source for rendering clickable chips and (eventually) notifying
    // whoever was mentioned, not just decorative text.
    try {
      await db.from("query_remarks").insert({
        query_id: queryId, by_name: currentUser.name, by_staff_id: isUuid(currentUser?.id) ? currentUser.id : null,
        text: remark.text, mentions: remark.mentions || [],
      });
    } catch(e) { console.warn("Remark save failed:", e); }
    showToast("Remark logged");
  };

  // 5. Cancel handler
  const handleStatClick = (filterKey) => {
    const now = new Date();
    const seasonStartYear = now.getMonth() < 3 ? now.getFullYear()-1 : now.getFullYear();
    const seasonStart = new Date(seasonStartYear, 3, 1);
    const seasonEnd   = new Date(seasonStartYear+1, 2, 31, 23, 59, 59);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);

    const filterMap = {
      active:    { label:"Active Queries",    items: queries.filter(q=>!q.cancelled&&q.status!=="completed") },
      new_query: { label:"New This Week",     items: queries.filter(q=>{ const d=new Date(q.date||""); return d>=weekAgo&&!q.cancelled; }) },
      operations:{ label:"In Operations",     items: queries.filter(q=>q.status==="operations"&&!q.cancelled) },
      onground:  { label:"Tours On Ground",   items: queries.filter(q=>isTourOnGround(q)) },
      completed: { label:`Completed This Season (Apr ${seasonStartYear}–Mar ${seasonStartYear+1})`,
                   items: queries.filter(q=>{ const d=new Date(q.date||q.travelDate||""); return q.status==="completed"&&d>=seasonStart&&d<=seasonEnd; }) },
    };
    const f = filterMap[filterKey];
    if(f) setStatFilter({ key:filterKey, label:f.label, items:f.items });
  };

  const handleCancel = (query, reason) => {
    const now = new Date().toLocaleString("en-IN");
    const updatedQ = {...query,status:"cancelled",cancelled:true,cancellationReason:reason,
      audit:[...(query.audit||[]),{by:currentUser.name,at:now,action:`CANCELLED — Reason: ${reason}`}]};
    setQueries(qs=>qs.map(q=>q.id===query.id?updatedQ:q));
    saveQueryToDB(updatedQ, `CANCELLED — Reason: ${reason}`);
    setCancelTarget(null);
    setActiveQuery(null);
    showToast(`Query/Tour File cancelled`);
  };

  const NAV = [
    {section:"Main",items:[
      {id:"dashboard",    icon:"⊞", label:"Dashboard"},
      {id:"kanban",       icon:"▤", label:"Kanban Board"},
      {id:"gantt",        icon:"▦", label:"Tour Calendar"},
    ]},
    {section:"Work",items:[
      {id:"queries",      icon:"✉", label:"All Queries"},
      {id:"tourfiles",    icon:"📁",label:"Tour Files"},
      {id:"series",       icon:"🔁",label:"Series"},
      {id:"cancelled",    icon:"✕", label:"Cancelled"},
      {id:"completed",    icon:"✅",label:"Completed"},
      {id:"team",         icon:"◎", label:"Team"},
      {id:"chat",         icon:"💬",label:"Chat"},
    ]},
    {section:"Master Data",items:[
      {id:"agents",       icon:"🌐",label:"Agents / Clients"},
      {id:"vendors",      icon:"🏢",label:"Vendors"},
    ]},
    {section:"Finance",items:[
      {id:"invoices",     icon:"🧾",label:"Invoices"},
      {id:"payments",     icon:"₹", label:"Payments"},
      {id:"reports",      icon:"📈",label:"Reports"},
    ]},
    ...((can("templates")||can("user_management")||can("maintenance"))?[{section:"Admin",items:[
      ...(can("templates")?[{id:"templates_hub",icon:"🗂",label:"Templates"}]:[]),
      ...(can("user_management")?[{id:"usermgmt",icon:"👥",label:"User Management"}]:[]),
      ...(can("place_library")?[{id:"place_library",icon:"📍",label:"Photo & Place Library"}]:[]),
      ...(can("maintenance")?[{id:"maintenance",icon:"🛠",label:"Maintenance"}]:[]),
    ]}]:[]),
  ];

  const VIEW_TITLES={dashboard:"Dashboard",kanban:"Kanban Board",gantt:"Tour Calendar",queries:"All Queries",tourfiles:"Tour Files",cancelled:"Cancelled",completed:"Completed Tour Files",team:"Team",chat:"Team Chat",agents:"Agents & Clients",vendors:"Vendors",invoices:"Invoices",payments:"Payments",reports:"Reports",templates_hub:"Templates",usermgmt:"User Management",place_library:"Photo & Place Library",maintenance:"Maintenance"};
  const anyPanel = showCostSheet||showItinerary||showQuotation||showInvoices||showPayments||showVoucher||showAgents||showSeries||showVendors||showTourBrief||showEditor;

  const DocButtons = ({q,stopProp=false}) => (
    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
      {[["📊","Cost Sheet",()=>setShowCostSheet(q)],["📖","Itinerary",()=>setShowItinerary(q)],["📋","Quotation",()=>setShowQuotation(q)],["🧾","Invoices",()=>setShowInvoices({query:q, flavor:"proforma"})],["₹","Payments",()=>setShowPayments(q)],["🎫","Vouchers",()=>setShowVoucher(q)],["✕","Cancel",()=>setCancelTarget(q)]].map(([icon,label,fn])=>(
      <button key={label} className="btn btn-ghost" style={{fontSize:10,padding:"4px 7px",color:label==="Cancel"?G.accent:undefined}}
        onClick={e=>{ if(stopProp)e.stopPropagation(); fn(); }}>{icon} {label}</button>
    ))}
    </div>
  );

  if (dataLoading) {
    return (
      <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0D1B2A,#1A3A52)",
        display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <img src={LOGO_B64} alt="Unitop" style={{ height:64, marginBottom:16, borderRadius:6 }}/>
          <div style={{fontSize:16,fontWeight:700,fontFamily:"'Playfair Display',serif",color:"#fff",marginBottom:6}}>Unitop Ops</div>
          <div style={{ color:"rgba(255,255,255,0.5)", fontSize:13 }}>Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {sidebarOpen && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:49}} onClick={()=>setSidebarOpen(false)}/>}

        <div className={`sidebar ${sidebarOpen?"open":""}`}>
          <div className="sidebar-logo">
            <img src={LOGO_B64} alt="Unitop Tours" style={{width:"100%",maxWidth:168,display:"block",padding:"6px 10px"}}/>
          </div>
          <div style={{padding:"3px 12px 6px",background:G.navy,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
            <div className="logo-sub">Operations System</div>
          </div>
          <div className="sidebar-nav">
            {NAV.map(sec=>(
              <div key={sec.section}>
                <div className="nav-section">{sec.section}</div>
                {sec.items.map(item=>(
                  <div key={item.id} className={`nav-item ${view===item.id?"active":""}`}
                    onClick={()=>{
                      setView(item.id);setSidebarOpen(false);
                    }}>
                    <span className="nav-icon">{item.icon}</span>{item.label}
                    {item.id==="chat" && chatConversations.filter(isConversationUnread).length>0 && (
                      <span style={{marginLeft:"auto",background:G.accent,color:"#fff",fontSize:10,fontWeight:700,borderRadius:10,padding:"1px 7px",minWidth:16,textAlign:"center"}}>
                        {chatConversations.filter(isConversationUnread).length}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="sidebar-user">
            <Avatar user={currentUser} size={30} onClick={()=>setShowProfile(true)} style={{cursor:"pointer"}}/>
            <div className="user-info">
              <div className="user-name">{currentUser.name}</div>
              <div className="user-role">{ROLE_LABELS[currentUser.role]}</div>
            </div>
            <span title="Sign out" style={{cursor:"pointer",color:"rgba(255,255,255,0.3)",fontSize:14,flexShrink:0}}
              onClick={async()=>{ await db.auth.logout(); window.location.reload(); }}>
              ⏻
            </span>
          </div>
          <div style={{textAlign:"center",padding:"4px 0 8px",fontSize:9,color:"rgba(255,255,255,0.18)",letterSpacing:"0.5px"}}>
            {APP_VERSION}
          </div>
          <div style={{textAlign:"center",padding:"0 0 10px",fontSize:9,color:"rgba(255,255,255,0.18)",letterSpacing:"0.5px"}}>
            {formatSidebarClock(sidebarClock)}
          </div>
        </div>

        <div className="main">
          <div className="topbar">
            <button className="hamburger" onClick={()=>setSidebarOpen(o=>!o)}>☰</button>
            <div className="topbar-title">{VIEW_TITLES[view]}</div>
            {view==="kanban"&&<span className="topbar-badge">{queries.filter(q=>q.status!=="completed"&&!q.cancelled).length} active</span>}
            {/* Smart Search button */}
            <button className="btn btn-ghost" style={{fontSize:11,gap:6}} onClick={()=>setShowSearch(true)}>
              🔍 Search
            </button>
            <button className="btn btn-ghost" onClick={()=>setView("gantt")}>📅 Calendar</button>
            {can("queries_create") && <button className="btn btn-primary" onClick={()=>setShowNewQuery(true)}>+ New Query</button>}
          </div>

          <div className="content">
            {view==="dashboard"  && <Dashboard queries={queries.filter(q=>!q.cancelled)} onOpenQuery={setActiveQuery} currentUser={currentUser} onStatClick={handleStatClick}/>}
            {view==="kanban"     && <KanbanView queries={queries.filter(q=>!q.cancelled)} onOpenQuery={setActiveQuery} onConvert={handleConvertToCaseFile} staff={staff}/>}
            {view==="gantt"      && <GanttView queries={queries.filter(q=>!q.cancelled)} onOpenQuery={setActiveQuery} staff={staff} vendors={vendors} tourExecutions={tourExecutions}/>}

            {view==="team"       && <TeamView queries={queries.filter(q=>!q.cancelled)} staff={staff}/>}
            {view==="queries"    && <AllQueriesView queries={queries} agents={agents} onOpenQuery={setActiveQuery} currentUser={currentUser} staff={staff}/>}
            {view==="templates_hub" && <TemplatesHub docTemplates={docTemplates} onSaveDocTemplates={saveDocTemplates} docSettings={docSettings} setDocSettings={saveDocSettings} onSignaturesChanged={()=>loadSignatures(db).then(setSignatures)}/>}
            {view==="place_library" && <AdminPlaceLibrary/>}
            {view==="maintenance" && <MaintenancePanel currentUser={currentUser}/>}
            {/* Sidebar navigation for these 5 now opens a real, full
                tab like every other nav item, instead of a split-pane
                overlay -- the components already fully supported
                asTab (no backdrop, full width/height, no close
                button), it just was never wired up from here. The
                overlay-based rendering below (showChat/showAgents/etc)
                stays as-is for its OTHER real use -- a mention click
                elsewhere in the app opening a quick, contextual look
                at a specific agent/vendor/series without navigating
                away from what the user was doing. */}
            {view==="chat" && <InAppChat asTab currentUser={currentUser} queries={queries} staff={staff} agents={agents} vendors={vendors} series={series} onClose={()=>{}}/>}
            {view==="usermgmt" && <UserManagementPanel asTab currentUser={currentUser} onClose={()=>{}}/>}
            {view==="series" && <SeriesManagement asTab series={series} setSeries={setSeries} queries={queries} currentUser={currentUser} onClose={()=>{}} initialSelectedId={focusSeriesId} onUpdateQuery={handleUpdateQuery}/>}
            {view==="agents" && <AgentMaster asTab agents={agents} setAgents={setAgents} queries={queries} payments={payments} currentUser={currentUser} onSaveAgent={(a)=>saveAgentToDB(db,a)} onClose={()=>{}} initialSelectedId={focusAgentId}/>}
            {view==="vendors" && <VendorMaster asTab vendors={vendors} setVendors={setVendors} queries={queries} payments={payments} tourExecutions={tourExecutions} docTemplates={docTemplates} currentUser={currentUser} onSaveVendor={(v)=>saveVendorToDB(db,v)} onClose={()=>{}} initialSelectedId={focusVendorId}/>}

            {view==="cancelled" && (
              <div>
                <div style={{marginBottom:12,fontSize:13,color:G.gray600}}>All cancelled queries and tour files. History is fully preserved.</div>
                {queries.filter(q=>q.cancelled).length===0?(
                  <div style={{textAlign:"center",padding:48,color:G.gray400}}><div style={{fontSize:32,marginBottom:8}}>✓</div><div style={{fontSize:14}}>No cancelled queries</div></div>
                ):queries.filter(q=>q.cancelled).map(q=>(
                  <div key={q.id} onClick={()=>setActiveQuery(q)} style={{background:G.white,borderRadius:10,border:`1px solid #FECACA`,padding:"12px 16px",marginBottom:8,opacity:0.85,cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#FEE2E2",color:"#991B1B",fontWeight:600}}>CANCELLED</span>
                      <div style={{flex:1}}><span style={{fontSize:13,fontWeight:600}}>{q.groupName||q.clientName}</span><FileTypeBadge fileType={q.fileType}/><span style={{fontSize:11,color:G.gray400,marginLeft:8}}>{q.tourFileId||q.id} · {q.destination||q.sector}</span></div>
                    </div>
                    {q.cancellationReason&&<div style={{fontSize:12,color:"#991B1B",background:"#FFF5F5",borderRadius:6,padding:"6px 10px",marginBottom:6}}>Reason: {q.cancellationReason}</div>}
                    <div style={{fontSize:11,color:G.gray400}}>{q.audit[q.audit.length-1]?.at} · by {q.audit[q.audit.length-1]?.by}</div>
                  </div>
                ))}
              </div>
            )}



            {view==="completed" && (
              <div>
                <div style={{marginBottom:12,fontSize:13,color:G.gray600}}>All completed tour files — full history preserved.</div>
                {queries.filter(q=>q.status==="completed"&&!q.cancelled).length===0 ? (
                  <div style={{textAlign:"center",padding:48,color:G.gray400}}>
                    <div style={{fontSize:32,marginBottom:8}}>✅</div>
                    <div style={{fontSize:14,fontWeight:500}}>No completed tour files yet</div>
                  </div>
                ) : queries.filter(q=>q.status==="completed"&&!q.cancelled).map(q=>(
                  <div key={q.id} style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,padding:"14px 16px",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={()=>setActiveQuery(q)}>
                      <div style={{fontSize:22}}>✅</div>
                      <div style={{flex:1}}>
                        {q.tourFileId&&<div style={{fontSize:11,fontWeight:700,color:G.navy,marginBottom:1}}>{q.tourFileId}</div>}
                        <div style={{fontSize:13,fontWeight:600}}>{q.groupName||q.clientName}<FileTypeBadge fileType={q.fileType}/></div>
                        <div style={{fontSize:11,color:G.gray400}}>{q.tourFileId||q.id} · {q.destination||q.sector} · {formatDateSlash(q.travelDate)||q.travelMonth||""}</div>
                      </div>
                      <StatusBadge status={q.status}/>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {view==="tourfiles" && (
              <div>
                {queries.filter(q=>q.tourFileId&&!q.cancelled).length===0?(
                  <div style={{textAlign:"center",padding:48,color:G.gray400}}><div style={{fontSize:32,marginBottom:8}}>📁</div><div style={{fontSize:14,fontWeight:500}}>No tour files yet</div></div>
                ):queries.filter(q=>q.tourFileId&&!q.cancelled).map(q=>(
                  <div key={q.id} style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,padding:"14px 16px",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,cursor:"pointer"}} onClick={()=>setActiveQuery(q)}>
                      <div style={{fontSize:22}}>📁</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:700,fontFamily:"'Playfair Display',serif"}}>{q.tourFileId}</div>
                        <div style={{fontSize:13,color:G.gray600}}>{q.groupName||q.clientName}<FileTypeBadge fileType={q.fileType}/> — {q.destination||q.sector}</div>
                        <div style={{fontSize:11,color:G.gray400}}>Travel: {formatDateSlash(q.travelDate)||q.travelMonth||"TBC"} · {q.paxDisplay} · {nightsDaysLabel(q.nights)}</div>
                      </div>
                      <StatusBadge status={q.status}/>
                    </div>
                    <DocButtons q={q} stopProp={true}/>
                  </div>
                ))}
              </div>
            )}

            {view==="invoices" && (
              <div>
                {queries.filter(q=>["operations","finance","completed"].includes(q.status)&&!q.cancelled).map(q=>(
                  <div key={q.id} style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                    <div style={{flex:1,cursor:"pointer"}} onClick={()=>setActiveQuery(q)}><div style={{fontSize:13,fontWeight:600}}>{q.groupName||q.clientName}<FileTypeBadge fileType={q.fileType}/></div><div style={{fontSize:11,color:G.gray400}}>{q.tourFileId||q.id} · {q.destination||q.sector}</div></div>
                    <StatusBadge status={q.status}/>
                    <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setShowInvoices({query:q, flavor:"proforma"})}>🧾 Invoices</button>
                  </div>
                ))}
              </div>
            )}

            {view==="payments" && (
              <div>
                {queries.filter(q=>["operations","finance","completed"].includes(q.status)&&!q.cancelled).map(q=>{
                  const pt=payments[q.id];
                  const tourValueINR=pt?(parseFloat(pt.tourValue)||0)*(parseFloat(pt.roeUsed)||1):0;
                  const received=pt?pt.entries.reduce((s,e)=>s+entryINR(e),0):0;
                  const pct=tourValueINR>0?Math.round(received/tourValueINR*100):0;
                  return (
                    <div key={q.id} style={{background:G.white,borderRadius:10,border:`1px solid ${G.gray200}`,padding:"12px 16px",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                        <div style={{flex:1,cursor:"pointer"}} onClick={()=>setActiveQuery(q)}><div style={{fontSize:13,fontWeight:600}}>{q.groupName||q.clientName}<FileTypeBadge fileType={q.fileType}/></div><div style={{fontSize:11,color:G.gray400}}>{q.tourFileId||q.id}</div></div>
                        <StatusBadge status={q.status}/>
                        <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setShowPayments(q)}>₹ Open Tracker</button>
                      </div>
                      {pt&&<>
                        <div style={{display:"flex",gap:16,marginBottom:5}}>
                          <span style={{fontSize:11,color:G.gray600}}>Tour: ₹ {Math.round(tourValueINR).toLocaleString()}</span>
                          <span style={{fontSize:11,color:"#059669",fontWeight:600}}>In: ₹ {Math.round(received).toLocaleString()}</span>
                          <span style={{fontSize:11,color:"#6B21A8",fontWeight:600}}>Out: ₹ {Math.round((pt.outgoing||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0)).toLocaleString()}</span>
                        </div>
                        <div style={{height:5,background:G.gray100,borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",width:Math.min(pct,100)+"%",background:pct>=100?"#059669":pct>=50?"#F59E0B":G.accent,borderRadius:3}}/>
                        </div>
                      </>}
                    </div>
                  );
                })}
              </div>
            )}

            {view==="reports" && (
              <ReportsView queries={queries} payments={payments} currentUser={currentUser} vendors={vendors} tourExecutions={tourExecutions} staff={staff} onOpenQuery={setActiveQuery}/>
            )}

          </div>{/* end content */}
        </div>{/* end main */}

        {showChat    && <InAppChat currentUser={currentUser} queries={queries} staff={staff} agents={agents} vendors={vendors} series={series} onClose={()=>{setShowChat(false);setFocusConvId(null);}} initialConvId={focusConvId}/>}
        {showProfile && <UserProfilePanel currentUser={currentUser} onClose={()=>setShowProfile(false)} onSave={onUpdateAuthUser}/>}

        {activeQuery&&!anyPanel&&!cancelTarget&&(
          <QueryDrawerWithQuote
            query={activeQuery}
            onClose={()=>setActiveQuery(null)}
            onConvert={handleConvertToCaseFile}
            onAdvance={handleAdvance}
            onGenerateQuote={()=>setShowQuotation(activeQuery)}
            onToggleWF={(stepId)=>handleToggleWF(activeQuery.id,stepId)}
            onCancel={()=>setCancelTarget(activeQuery)}
            onUpdateRemarks={handleAddRemark}
            onUpdateQuery={handleUpdateQuery}
            onRecoverQuery={handleRecoverQuery}
            onForceMoveStage={handleForceMoveStage}
            tourExecution={tourExecutions[activeQuery.id] || blankTourExecution(activeQuery.id)}
            onUpdateTourExecution={updateTourExecution}
            vendors={vendors}
            staff={staff}
            series={series}
            agents={agents}
            queries={queries}
            costSheetExists={costSheetExists.has(activeQuery.id)}
            quotationExists={quotationExists.has(activeQuery.id)}
            hasPayments={(payments[activeQuery.id]?.entries || []).length > 0 || (payments[activeQuery.id]?.outgoing || []).length > 0}
            payments={payments[activeQuery.id]}
            currentUser={currentUser}
          />
        )}

        {/* PANELS */}
        {showCostSheet  && <CostSheet query={showCostSheet} onClose={()=>setShowCostSheet(null)} onProceedToQuotation={(costSheetId)=>{setPendingCostSheetId(costSheetId);setShowQuotation(showCostSheet);setShowCostSheet(null);}} currentUser={currentUser} readOnly={showCostSheet.cancelled} staff={staff} docSettings={docSettings} vendors={vendors}/>}
        {showItinerary && <Itinerary query={showItinerary} briefTemplate={docTemplates.brief_itin} detailTemplate={docTemplates.detail_itin} onClose={()=>setShowItinerary(null)} currentUser={currentUser} readOnly={showItinerary.cancelled} docSettings={docSettings}/>}
        {showQuotation  && <QuotationGenerator query={showQuotation} template={docTemplates.quotation} costSheetId={pendingCostSheetId} onClose={()=>{setShowQuotation(null);setPendingCostSheetId(null);}} onSaved={()=>showToast("Quotation saved")} currentUser={currentUser} readOnly={showQuotation.cancelled} onUpdateQuery={handleUpdateQuery} signatures={signatures} docSettings={docSettings}/>}
        {showInvoices   && <InvoiceGenerator query={showInvoices.query} payments={payments} proformaTemplate={docTemplates.proforma} taxinvoiceTemplate={docTemplates.taxinvoice} docSettings={docSettings} onSaveDocSettings={saveDocSettings} agents={agents} initialFlavor={showInvoices.flavor} onClose={()=>setShowInvoices(null)} currentUser={currentUser} readOnly={showInvoices.query.cancelled} signatures={signatures}/>}
        {showPayments   && <EnhancedPaymentTracker query={showPayments} payments={payments} onUpdatePayments={updatePayments} onClose={()=>setShowPayments(null)} readOnly={showPayments.cancelled} currentUser={currentUser}/>}
        {showVoucher    && <ExchangeOrderGenerator query={showVoucher} template={docTemplates.exchange} vendors={vendors} docSettings={docSettings} onSaveDocSettings={saveDocSettings} onClose={()=>setShowVoucher(null)} currentUser={currentUser} readOnly={showVoucher.cancelled}/>}
        {showTourBrief  && <TourBriefingSheet query={showTourBrief} template={docTemplates.tourbriefing} facilitators={vendors.filter(v=>v.type==="Tour Facilitator")} vendors={vendors} onClose={()=>setShowTourBrief(null)} currentUser={currentUser} readOnly={showTourBrief.cancelled} signatures={signatures} docSettings={docSettings}/>}
        {showEditor     && <DocumentEditor query={showEditor} onClose={()=>setShowEditor(null)} currentUser={currentUser} readOnly={showEditor.cancelled}/>}
        {showUserMgmt  && can("user_management") && (
          <UserManagementPanel currentUser={currentUser} onClose={()=>setShowUserMgmt(false)}/>
        )}
        {showAgents     && <AgentMaster agents={agents} setAgents={setAgents} queries={queries} payments={payments} currentUser={currentUser} onSaveAgent={(a)=>saveAgentToDB(db,a)} onClose={()=>{setShowAgents(false);setFocusAgentId(null);}} initialSelectedId={focusAgentId}/>}
        {showSeries     && <SeriesManagement series={series} setSeries={setSeries} queries={queries} currentUser={currentUser} onClose={()=>{setShowSeries(false);setFocusSeriesId(null);}} initialSelectedId={focusSeriesId} onUpdateQuery={handleUpdateQuery}/>}
        {showVendors    && <VendorMaster vendors={vendors} setVendors={setVendors} queries={queries} payments={payments} tourExecutions={tourExecutions} docTemplates={docTemplates} currentUser={currentUser} onSaveVendor={(v)=>saveVendorToDB(db,v)} onClose={()=>{setShowVendors(false);setFocusVendorId(null);}} initialSelectedId={focusVendorId}/>}

        {/* Cancel modal */}
        {cancelTarget && <CancelModal query={cancelTarget} onClose={()=>setCancelTarget(null)} onConfirm={(reason)=>handleCancel(cancelTarget,reason)}/>}

        {/* Smart Search */}
        {showSearch && <SmartSearch queries={queries} agents={agents} vendors={vendors} series={series} staff={staff} chatConversations={chatConversations} currentUser={currentUser}
          onSelectQuery={q=>{setActiveQuery(q);}}
          onSelectStaff={async(s)=>{
            // Search finding a colleague jumps straight into a DM with
            // them, reusing the same findOrCreateDM used everywhere
            // else in chat -- never creates a duplicate if one already
            // exists.
            const {id} = await findOrCreateDM(db, currentUser.id, s.id);
            if(id){ setFocusConvId(id); setShowChat(true); }
          }}
          onSelectChat={(c)=>{ setFocusConvId(c.id); setShowChat(true); }}
          onClose={()=>setShowSearch(false)}/>}

        {/* Stat filter list modal */}
        {statFilter && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}
            onClick={e=>e.target===e.currentTarget&&setStatFilter(null)}>
            <div style={{background:G.white,borderRadius:12,width:560,maxHeight:"75vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
              <div style={{background:G.navy,padding:"14px 20px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1,fontSize:15,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>{statFilter.label}</div>
                <span style={{fontSize:13,color:"rgba(255,255,255,0.6)"}}>{statFilter.items.length} {statFilter.items.length===1?"result":"results"}</span>
                <button onClick={()=>setStatFilter(null)} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:13}}>✕</button>
              </div>
              <div style={{overflowY:"auto",flex:1}}>
                {statFilter.items.length===0&&(
                  <div style={{padding:32,textAlign:"center",color:G.gray400,fontSize:13}}>No results in this category</div>
                )}
                {statFilter.items.map(q=>(
                  <div key={q.id} onClick={()=>{setActiveQuery(q);setStatFilter(null);}}
                    style={{padding:"12px 18px",borderBottom:`1px solid ${G.gray100}`,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"background .1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=G.gray50}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600}}>{q.groupName||q.clientName}</div>
                      <div style={{fontSize:11,color:G.gray400}}>{q.tourFileId||q.id} · {q.destination||q.sector||""} · {formatDateSlash(q.travelDate)||q.travelMonth||""}</div>
                      {q.tourFileId&&<div style={{fontSize:10,color:G.navy,fontWeight:600,marginTop:2}}>📁 {q.tourFileId}</div>}
                    </div>
                    <StatusBadge status={q.status}/>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showNewQuery && <NewQueryModal onClose={()=>setShowNewQuery(false)} onSave={handleNewQuery} nextId={nextQueryId()} agents={agents} staff={staff} series={series} queries={queries}/>}
        {toast && <Toast msg={toast} type={toastType} onDone={()=>setToast(null)}/>}
      </div>
    </>
  );
}

