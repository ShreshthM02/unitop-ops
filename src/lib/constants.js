// Shared constants extracted from the original monolith: users, seed/demo data,
// document-registry option lists, style palette (G), global CSS string,
// pipeline/workflow definitions, company info, payment seed data, templates,
// and master-data option lists. Base64 brand images live in ./images.js to
// keep this file readable.


// ─── DOC REGISTRY CONSTANTS ───────────────────────────────────────────────────
export const DOC_CATEGORIES = [
  "Query / RFQ","Quotation Sent","Booking Confirmation","Visa Document",
  "Flight Ticket","Train Ticket","Hotel Voucher","Transport Voucher",
  "Proforma Invoice","Tax Invoice","Payment Receipt","Insurance",
  "Passport Copy","Guest List","Itinerary (Client)","Tour Briefing Sheet",
  "Agent Contract","Miscellaneous",
];
export const DOC_STATUS = ["Pending","Received","Verified","Shared with Client","Archived"];
export const DOC_FROM   = ["Foreign Agent","Client","Hotel","Airline","Transport Provider","Embassy/Visa","Internal","Other"];

// ─── DATA ────────────────────────────────────────────────────────────────────
export const USERS = [
  { id: 1, name: "Harsh", role: "admin",    avatar: "HA", color: "#1A5276" },
  { id: 2, name: "Priya", role: "sales",    avatar: "PR", color: "#6C3483" },
  { id: 3, name: "Ravi",  role: "ops",      avatar: "RA", color: "#0E6655" },
  { id: 4, name: "Meera", role: "accounts", avatar: "ME", color: "#784212" },
];

export const ROLE_LABELS = { admin:"Admin", sales:"Sales", ops:"Operations", accounts:"Accounts" };

export const INITIAL_QUERIES = [
  {
    id: "UTQ-2025-041", type:"query", status:"new_query",
    clientName:"Sharma Family", nationality:"Indian",
    destination:"Golden Triangle", nights:7, pax:6,
    source:"WhatsApp", date:"2025-06-18", travelDate:"2025-10-15",
    hotelCat:"4 Star", assignedTo:2,
    notes:"Interested in Taj Mahal sunrise visit. Vegetarian meals required.",
    audit:[{ by:"Priya", at:"2025-06-18 09:15", action:"Query received via WhatsApp" }]
  },
  {
    id: "UTQ-2025-042", type:"query", status:"new_query",
    clientName:"Chen Group", nationality:"Chinese",
    destination:"Rajasthan Circuit", nights:10, pax:12,
    source:"Email", date:"2025-06-17", travelDate:"2025-11-01",
    hotelCat:"5 Star", assignedTo:2,
    notes:"Group from Shanghai. Need Mandarin-speaking guide if possible.",
    audit:[{ by:"Priya", at:"2025-06-17 14:30", action:"Query received via Email" }]
  },
  {
    id: "UTQ-2025-038", type:"query", status:"costing",
    clientName:"Mueller Tour", nationality:"German",
    destination:"Buddhist Circuit", nights:14, pax:8,
    source:"Website", date:"2025-06-10", travelDate:"2025-10-20",
    hotelCat:"3 Star", assignedTo:1,
    notes:"Pilgrimage tour — Bodh Gaya, Sarnath, Kushinagar, Lumbini.",
    audit:[
      { by:"Harsh", at:"2025-06-10 11:00", action:"Query received via Website" },
      { by:"Harsh", at:"2025-06-12 10:30", action:"Moved to Costing & Quotation" },
    ]
  },
  {
    id: "UTQ-2025-036", type:"query", status:"operations",
    clientName:"Anderson Family", nationality:"British",
    destination:"Varanasi + Bodh Gaya", nights:6, pax:3,
    source:"Email", date:"2025-06-01", travelDate:"2026-07-10",
    hotelCat:"4 Star", assignedTo:3,
    notes:"All vouchers confirmed. Driver briefed.",
    audit:[
      { by:"Priya", at:"2025-06-01 09:00", action:"Query received via Email" },
      { by:"Priya", at:"2025-06-03 15:00", action:"Moved to Costing & Quotation" },
      { by:"Harsh", at:"2025-06-05 12:00", action:"Quotation sent" },
      { by:"Ravi",  at:"2025-06-08 10:00", action:"Confirmation received — converted to Tour File" },
      { by:"Ravi",  at:"2025-06-10 09:00", action:"Moved to Operations" },
    ]
  },
  {
    id: "UTQ-2025-031", type:"query", status:"finance",
    clientName:"Smith Group", nationality:"American",
    destination:"Himalayan Trek", nights:8, pax:16,
    source:"Referral", date:"2025-05-20", travelDate:"2025-07-01",
    hotelCat:"3 Star", assignedTo:4,
    notes:"Advance received. Final payment due 15 Jun.",
    audit:[
      { by:"Priya", at:"2025-05-20 10:00", action:"Query received via Referral" },
      { by:"Harsh", at:"2025-05-22 11:00", action:"Quotation sent" },
      { by:"Ravi",  at:"2025-05-25 14:00", action:"Confirmation received — converted to Tour File" },
      { by:"Ravi",  at:"2025-05-26 09:00", action:"Moved to Operations" },
      { by:"Meera", at:"2025-06-01 10:00", action:"Advance payment recorded ₹1,50,000" },
      { by:"Meera", at:"2025-06-05 11:00", action:"Moved to Finance" },
    ]
  },
  {
    id: "UTQ-2025-028", type:"query", status:"completed",
    clientName:"Tanaka Group", nationality:"Japanese",
    destination:"Rajasthan", nights:10, pax:9,
    source:"Agent", date:"2025-04-10", travelDate:"2026-07-22",
    hotelCat:"5 Star", assignedTo:1,
    notes:"Tour completed. P&L filed. Feedback: Excellent.",
    audit:[
      { by:"Priya", at:"2025-04-10 09:00", action:"Query received via Agent" },
      { by:"Harsh", at:"2025-04-12 10:00", action:"Quotation sent" },
      { by:"Ravi",  at:"2025-04-15 14:00", action:"Confirmation — converted to Tour File" },
      { by:"Meera", at:"2025-05-25 11:00", action:"P&L filed. Moved to Completed." },
    ]
  },
];

export const TOUR_DATA = [
  { id:"TUR-2025-018", queryId:"UTQ-2025-036", name:"Anderson Family — Varanasi + Bodh Gaya", dates:"Jun 28 – Jul 3", pax:3, status:"On Ground", color:"#1A5276", ganttStart:9, ganttLen:6 },
  { id:"TUR-2025-017", queryId:"UTQ-2025-031", name:"Smith Group — Himalayan Trek",           dates:"Jul 1 – Jul 8", pax:16, status:"Upcoming", color:"#6C3483", ganttStart:12, ganttLen:8 },
  { id:"TUR-2025-016", queryId:"UTQ-2025-028", name:"Tanaka Group — Rajasthan",               dates:"May 15 – May 25", pax:9, status:"Completed", color:"#0E6655", ganttStart:0, ganttLen:10 },
];

export const KANBAN_COLS = [
  { id:"new_query",   label:"New Query",        color:"#154360", bg:"#EBF5FB" },
  { id:"costing",     label:"Costing & Quote",  color:"#784212", bg:"#FEF9E7" },
  { id:"operations",  label:"Operations",        color:"#0E6655", bg:"#EAFAF1" },
  { id:"finance",     label:"Finance",           color:"#4A235A", bg:"#F5EEF8" },
  { id:"completed",   label:"Completed",         color:"#145A32", bg:"#E9F7EF" },
];

export const SOURCE_COLORS = { WhatsApp:"#25D366", Email:"#4A90D9", Website:"#E67E22", Referral:"#9B59B6", Agent:"#E74C3C" };

export const GANTT_DAYS = ["Jun 16","Jun 17","Jun 18","Jun 19","Jun 20","Jun 21","Jun 22","Jun 23","Jun 24","Jun 25","Jun 26","Jun 27","Jun 28","Jun 29","Jun 30","Jul 1","Jul 2","Jul 3","Jul 4","Jul 5","Jul 6","Jul 7","Jul 8","Jul 9","Jul 10"];
export const TODAY_IDX = 3;

export const APP_VERSION = "v1.9.1";
export const COMPANY_INFO = {
  name:    "Unitop Tours & Travel Pvt. Ltd.",
  address: "506, DDA 2F, District Centre, Janakpuri, New Delhi – 110058",
  phone:   "+91-11-XXXXXXXX",
  email:   "unitoptours@gmail.com",
  web:     "www.unitoptours.com",
  gstin:   "07AAACU4406H1ZK",
  pan:     "AAACU4406H",
  state:   "Delhi (07)",
  bank: {
    accountName: "Unitop Tours & Travel (P) Ltd.",
    bankName:    "Punjab National Bank",
    accountNo:   "1503002100024279",
    accountType: "Current Account",
    swift:       "PUNBINBBISB",
    branch:      "B-1, Community Centre Janakpuri, New Delhi – 110058 (India)",
    branchPhone: "+91-11-25591289 / 25555732",
  }
};

export const INITIAL_PAYMENTS = {
  "UTQ-2025-036": {
    queryId:"UTQ-2025-036", tourValue:2850, currency:"US $", roeUsed:90,
    tourValueINR:256500,
    entries:[
      { id:1, type:"advance",  amount:90000,  date:"2025-06-05", mode:"Remittance", ref:"SWIFT-2345", note:"30% advance", receipt:"RCP-2025-031" },
      { id:2, type:"second",   amount:99000,  date:"2025-06-15", mode:"Remittance", ref:"SWIFT-2346", note:"2nd instalment", receipt:"RCP-2025-038" },
    ]
  },
  "UTQ-2025-031": {
    queryId:"UTQ-2025-031", tourValue:12800, currency:"US $", roeUsed:90,
    tourValueINR:1152000,
    entries:[
      { id:1, type:"advance", amount:345600, date:"2025-05-28", mode:"Remittance", ref:"SWIFT-2301", note:"30% advance", receipt:"RCP-2025-028" },
    ]
  },
};

// NOTE: quotation defaults live in DEFAULT_QUOT_TEMPLATE further down this
// file (bundled into DEFAULT_DOC_TEMPLATES) — this used to be a separate,
// slightly different duplicate left over from the single-file split. It was
// never actually applied to real quotations (UnitopApp seeded state from
// this constant, but nothing ever wrote back to it), so it's removed here
// rather than kept as a second source of truth.

// ─── SOURCE OPTIONS ───────────────────────────────────────────────────────────
export const QUERY_SOURCES = ["Agency","E-Mail","Website","Phone","WhatsApp","Line","Referral","Others"];

// ─── USER MANAGEMENT PANEL (Admin only) ──────────────────────────────────────
export const ROLE_COLOR = { admin:"#C0392B", sales:"#6C3483", ops:"#0E6655", accounts:"#784212" };
export const ROLE_BG    = { admin:"#FDEDEC", sales:"#F5EEF8", ops:"#EAFAF1", accounts:"#FEF9E7" };

// ─── AGENT MASTER DATA ───────────────────────────────────────────────────────
export const INITIAL_AGENTS = [
  { id:"AGT-001", company:"NCH Holidays", country:"Thailand", city:"Bangkok", market:"Thai",
    contactName:"Pee Suchint", contactPhone:"+66-XX-XXXXXXX", contactEmail:"nch@nchholidays.com",
    gstin:"", notes:"Long-standing partner since 2010. Peak season Oct-Mar.", active:true },
  { id:"AGT-002", company:"Mueller Reisen GmbH", country:"Germany", city:"Munich", market:"German",
    contactName:"Hans Mueller", contactPhone:"+49-89-XXXXXXX", contactEmail:"hans@mueller-reisen.de",
    gstin:"", notes:"Specialist in Buddhist Circuit and pilgrimage tours.", active:true },
];

// ─── VENDOR MASTER DATA ──────────────────────────────────────────────────────
export const VENDOR_TYPES = ["Hotel","Restaurant","Transport","Tour Facilitator","Local Handler","Activity","Other"];
export const INITIAL_VENDORS = [
  { id:"VND-001", name:"Saura / Golden Tulip", type:"Hotel", city:"Agra", contactName:"Sales Manager",
    contactPhone:"+91-562-XXXXXXX", contactEmail:"sales@sauraagra.com", gstin:"", notes:"Contracted rates on file.", active:true },
  { id:"VND-002", name:"Nanking Restaurant", type:"Restaurant", city:"New Delhi", contactName:"Manager",
    contactPhone:"+91-11-XXXXXXX", contactEmail:"", gstin:"", notes:"Chinese cuisine specialist.", active:true },
  // Tour Facilitators are vendors too (type: "Tour Facilitator") -- individuals,
  // not businesses, so `languages`/`areas` matter more than gstin/city for
  // this type. Tour Briefing Sheet selects from these by id instead of
  // free-typing a name, so "days worked"/"payments" reports can reliably
  // total per person -- free text let the same person appear as "Prithvi",
  // "Prithvee", and "PRITHVI" across different tours.
  { id:"VND-003", name:"Prithvi", type:"Tour Facilitator", city:"", contactName:"", contactPhone:"+91-98XXXXXXXX", contactEmail:"", gstin:"", notes:"", languages:"English, Hindi", areas:"Bodhgaya, Rajgir, Nalanda", active:true },
  { id:"VND-004", name:"Ashutosh", type:"Tour Facilitator", city:"", contactName:"", contactPhone:"+91-98XXXXXXXX", contactEmail:"", gstin:"", notes:"", languages:"English, Thai", areas:"Bodhgaya, Varanasi", active:true },
  { id:"VND-005", name:"Manoj", type:"Tour Facilitator", city:"", contactName:"", contactPhone:"+91-98XXXXXXXX", contactEmail:"", gstin:"", notes:"", languages:"English, Hindi", areas:"Delhi, Agra", active:true },
];

// ─── VEHICLE TYPES (for cost sheet and exchange order) ───────────────────────
export const VEHICLE_TYPES = ["Large Coach","Mini Bus","Tempo Traveller","Innova","Volvo","Sedan","Others"];

// ─── MONUMENT FEES (shared between cost sheet and quotation) ─────────────────
export const DEFAULT_MONUMENTS = [
  { name:"Taj Mahal", fee:1300 },
  { name:"Agra Fort", fee:650 },
  { name:"Amber Fort", fee:1002 },
  { name:"City Palace, Jaipur", fee:1200 },
  { name:"Observatory (Jantar Mantar)", fee:602 },
  { name:"Jeep at Amber Fort (1 jeep / 4 persons)", fee:650 },
  { name:"Qutub Minar", fee:650 },
  { name:"Red Fort", fee:600 },
];

// ─── PERMISSIONS SYSTEM ──────────────────────────────────────────────────────

// Default permissions per role (all staff get full access except admin-only features)
export const ROLE_DEFAULTS = {
  admin: {
    queries_create:true, queries_delete:true, cost_sheet:true, quotation:true,
    itinerary:true, exchange_orders:true, payments_incoming:true,
    payments_outgoing:true, invoices:true, pl_report:true,
    agents_edit:true, vendors_edit:true, cancel_query:true,
    templates:true, user_management:true,
  },
  sales: {
    queries_create:true, queries_delete:false, cost_sheet:true, quotation:true,
    itinerary:true, exchange_orders:true, payments_incoming:true,
    payments_outgoing:true, invoices:true, pl_report:true,
    agents_edit:true, vendors_edit:true, cancel_query:true,
    templates:false, user_management:false,
  },
  ops: {
    queries_create:false, queries_delete:false, cost_sheet:true, quotation:true,
    itinerary:true, exchange_orders:true, payments_incoming:true,
    payments_outgoing:true, invoices:true, pl_report:true,
    agents_edit:true, vendors_edit:true, cancel_query:false,
    templates:false, user_management:false,
  },
  accounts: {
    queries_create:false, queries_delete:false, cost_sheet:true, quotation:true,
    itinerary:true, exchange_orders:true, payments_incoming:true,
    payments_outgoing:true, invoices:true, pl_report:true,
    agents_edit:true, vendors_edit:true, cancel_query:false,
    templates:false, user_management:false,
  },
};

export const PERM_LABELS = {
  queries_create:   "Create Queries",
  queries_delete:   "Delete Queries",
  cost_sheet:       "Cost Sheet",
  quotation:        "Quotation",
  itinerary:        "Itinerary",
  exchange_orders:  "Exchange Orders / Vouchers",
  payments_incoming:"Record Incoming Payments",
  payments_outgoing:"Record Outgoing Payments",
  invoices:         "Invoices (Proforma & Tax)",
  pl_report:        "P&L Report",
  agents_edit:      "Edit Agents & Clients",
  vendors_edit:     "Edit Vendors",
  cancel_query:     "Cancel Queries / Tour Files",
  templates:        "Edit Quote Templates (Admin)",
  user_management:  "User Management (Admin)",
};

// ─── STYLES ──────────────────────────────────────────────────────────────────
export const G = {
  navy:    "#0D1B2A",
  navyMid: "#1A3A52",
  accent:  "#C0392B",
  accentL: "#E74C3C",
  gold:    "#D4AC0D",
  sand:    "#F8F4EE",
  white:   "#FFFFFF",
  gray50:  "#F9FAFB",
  gray100: "#F3F4F6",
  gray200: "#E5E7EB",
  gray400: "#9CA3AF",
  gray600: "#6B7280",
  gray800: "#1F2937",
  green:   "#10B981",
  amber:   "#F59E0B",
  red:     "#EF4444",
  purple:  "#8B5CF6",
};

export const css = `
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',sans-serif;background:${G.gray100};color:${G.gray800};}
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:${G.gray200};border-radius:2px;}

  .app{display:flex;height:100vh;overflow:hidden;}

  /* SIDEBAR */
  .sidebar{width:220px;min-width:220px;background:${G.navy};display:flex;flex-direction:column;overflow:hidden;transition:transform .25s;}
  .sidebar-logo{padding:8px 10px 6px;border-bottom:1px solid rgba(0,0,0,0.06);background:#ffffff;}
  .logo-sub{font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:2px;text-transform:uppercase;margin-top:2px;padding:4px 0 0 2px;}
  /* RESPONSIVE */
  @media(max-width:768px){
    .sidebar{position:fixed;z-index:50;height:100vh;transform:translateX(-220px);}
    .sidebar.open{transform:translateX(0);}
    .main{width:100%;}
    .stats-row{grid-template-columns:1fr 1fr!important;}
    .kanban{grid-template-columns:repeat(2,minmax(200px,1fr))!important;overflow-x:auto;}
    .topbar{padding:0 12px!important;}
    .content{padding:12px!important;}
    .hamburger{display:flex!important;}
    .gantt-wrap{overflow-x:auto;}
  }
  .hamburger{display:none;align-items:center;justify-content:center;width:36px;height:36px;cursor:pointer;border-radius:6px;background:${G.gray100};border:none;font-size:18px;margin-right:8px;}
  .sidebar-nav{flex:1;padding:12px 0;overflow-y:auto;}
  .nav-section{font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:2px;text-transform:uppercase;padding:12px 20px 6px;}
  .nav-item{display:flex;align-items:center;gap:10px;padding:9px 20px;cursor:pointer;transition:all .15s;color:rgba(255,255,255,0.6);font-size:13px;font-weight:400;border-left:3px solid transparent;}
  .nav-item:hover{background:rgba(255,255,255,0.06);color:${G.white};}
  .nav-item.active{background:rgba(192,57,43,0.15);color:${G.white};border-left-color:${G.accent};font-weight:500;}
  .nav-icon{font-size:15px;width:18px;text-align:center;}
  .sidebar-user{padding:14px 16px;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px;}
  .user-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:${G.white};flex-shrink:0;}
  .user-info{flex:1;min-width:0;}
  .user-name{font-size:12px;font-weight:500;color:${G.white};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .user-role{font-size:10px;color:rgba(255,255,255,0.4);}

  /* MAIN */
  .main{flex:1;display:flex;flex-direction:column;overflow:hidden;}
  .topbar{background:${G.white};border-bottom:1px solid ${G.gray200};padding:0 24px;height:56px;display:flex;align-items:center;gap:16px;flex-shrink:0;}
  .topbar-title{font-size:16px;font-weight:600;color:${G.gray800};flex:1;}
  .topbar-badge{font-size:11px;background:${G.accent};color:${G.white};padding:2px 8px;border-radius:10px;font-weight:500;}
  .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:none;transition:all .15s;font-family:'Inter',sans-serif;}
  .btn-primary{background:${G.accent};color:${G.white};}
  .btn-primary:hover{background:${G.accentL};}
  .btn-ghost{background:transparent;color:${G.gray600};border:1px solid ${G.gray200};}
  .btn-ghost:hover{background:${G.gray50};color:${G.gray800};}
  .btn-success{background:#059669;color:${G.white};}
  .btn-success:hover{background:#047857;}
  .content{flex:1;overflow-y:auto;padding:24px;}

  /* STAT CARDS */
  .stats-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px;}
  .stat-card{background:${G.white};border-radius:10px;padding:16px;border:1px solid ${G.gray200};cursor:pointer;transition:all .15s;}
  .stat-card:hover{border-color:${G.accent};box-shadow:0 2px 8px rgba(0,0,0,0.06);}
  .stat-label{font-size:11px;color:${G.gray600};font-weight:500;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;}
  .stat-value{font-size:26px;font-weight:700;color:${G.gray800};line-height:1;}
  .stat-sub{font-size:11px;color:${G.gray400};margin-top:4px;}
  .stat-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px;}

  /* KANBAN */
  .kanban{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;height:calc(100vh - 220px);overflow-x:auto;}
  .kanban-col{background:${G.gray50};border-radius:10px;border:1px solid ${G.gray200};display:flex;flex-direction:column;overflow:hidden;}
  .kanban-col-head{padding:12px 14px;border-bottom:1px solid ${G.gray200};display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
  .kanban-col-title{font-size:12px;font-weight:600;}
  .kanban-col-count{font-size:10px;background:rgba(0,0,0,0.06);padding:1px 7px;border-radius:10px;color:${G.gray600};}
  .kanban-cards{flex:1;overflow-y:auto;padding:10px;}
  .kcard{background:${G.white};border-radius:8px;border:1px solid ${G.gray200};padding:12px;margin-bottom:8px;cursor:pointer;transition:all .15s;}
  .kcard:hover{border-color:${G.accent};box-shadow:0 2px 6px rgba(0,0,0,0.07);}
  .kcard-id{font-size:10px;color:${G.gray400};margin-bottom:4px;font-family:'Inter',sans-serif;}
  .kcard-name{font-size:13px;font-weight:600;color:${G.gray800};margin-bottom:2px;}
  .kcard-dest{font-size:11px;color:${G.gray600};margin-bottom:6px;}
  .kcard-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
  .kcard-pill{font-size:10px;padding:2px 7px;border-radius:10px;font-weight:500;}
  .kcard-source{font-size:10px;padding:2px 7px;border-radius:10px;color:${G.white};font-weight:500;}
  .kcard-flag{font-size:10px;color:${G.gray400};}
  .convert-btn{width:100%;margin-top:8px;padding:6px;background:#EAFAF1;color:#0E6655;border:1px dashed #0E6655;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;transition:all .15s;font-family:'Inter',sans-serif;}
  .convert-btn:hover{background:#0E6655;color:${G.white};}

  /* GANTT */
  .gantt-wrap{overflow-x:auto;border-radius:10px;background:${G.white};border:1px solid ${G.gray200};}
  .gantt-table{border-collapse:collapse;width:100%;min-width:800px;}
  .gantt-th{font-size:10px;color:${G.gray600};padding:8px 4px;text-align:center;border-bottom:1px solid ${G.gray200};white-space:nowrap;font-weight:500;}
  .gantt-th.today{color:${G.accent};font-weight:700;}
  .gantt-label-th{font-size:11px;color:${G.gray600};padding:8px 12px;text-align:left;border-bottom:1px solid ${G.gray200};font-weight:500;min-width:200px;}
  .gantt-td{border-bottom:1px solid ${G.gray100};padding:0;height:36px;position:relative;}
  .gantt-label-td{padding:0 12px;border-bottom:1px solid ${G.gray100};vertical-align:middle;}
  .gantt-bar{height:20px;border-radius:4px;position:relative;top:50%;transform:translateY(-50%);margin:0 1px;display:flex;align-items:center;padding:0 8px;overflow:hidden;}
  .gantt-bar-text{font-size:10px;color:${G.white};font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .today-col{border-left:2px solid ${G.accent};}

  /* QUERY DETAIL / TOUR FILE */
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:100;display:flex;align-items:flex-start;justify-content:flex-end;}
  .drawer{background:${G.white};width:520px;height:100vh;overflow-y:auto;box-shadow:-4px 0 24px rgba(0,0,0,0.12);display:flex;flex-direction:column;}
  .drawer-head{padding:20px 24px;border-bottom:1px solid ${G.gray200};display:flex;align-items:flex-start;gap:12px;flex-shrink:0;background:${G.navy};}
  .drawer-id{font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:2px;}
  .drawer-name{font-size:18px;font-weight:700;color:${G.white};font-family:'Playfair Display',serif;}
  .drawer-dest{font-size:13px;color:rgba(255,255,255,0.6);margin-top:2px;}
  .drawer-body{flex:1;padding:20px 24px;overflow-y:auto;}
  .drawer-section{margin-bottom:20px;}
  .drawer-section-title{font-size:11px;font-weight:600;color:${G.gray400};text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid ${G.gray100};}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .info-item label{font-size:10px;color:${G.gray400};font-weight:500;text-transform:uppercase;display:block;margin-bottom:2px;}
  .info-item span{font-size:13px;color:${G.gray800};font-weight:500;}
  .audit-item{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid ${G.gray100};}
  .audit-dot{width:6px;height:6px;border-radius:50%;background:${G.accent};margin-top:5px;flex-shrink:0;}
  .audit-text{font-size:12px;color:${G.gray800};}
  .audit-meta{font-size:10px;color:${G.gray400};margin-top:1px;}
  .casefile-banner{background:linear-gradient(135deg,#0D1B2A,#1A3A52);border-radius:10px;padding:16px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.1);}
  .casefile-id{font-size:10px;color:rgba(255,255,255,0.5);letter-spacing:1px;text-transform:uppercase;}
  .casefile-title{font-size:15px;font-weight:700;color:${G.white};font-family:'Playfair Display',serif;margin:4px 0;}
  .casefile-meta{font-size:11px;color:rgba(255,255,255,0.5);}
  .workflow-steps{display:flex;flex-direction:column;gap:6px;}
  .wf-step{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;background:${G.gray50};border:1px solid ${G.gray100};}
  .wf-step.done{background:#EAFAF1;border-color:#A9DFBF;}
  .wf-step.active{background:#EBF5FB;border-color:#A9CCE3;font-weight:500;}
  .wf-num{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0;}
  .wf-num.done{background:#0E6655;color:${G.white};}
  .wf-num.active{background:#1A5276;color:${G.white};}
  .wf-num.pending{background:${G.gray200};color:${G.gray600};}
  .wf-label{font-size:12px;color:${G.gray800};}
  .status-badge{padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;}
  .convert-case-btn{width:100%;padding:12px;background:${G.accent};color:${G.white};border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;}
  .convert-case-btn:hover{background:${G.accentL};}

  /* NEW QUERY MODAL */
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;justify-content:center;}
  .modal{background:${G.white};border-radius:12px;width:540px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2);}
  .modal-head{padding:20px 24px;border-bottom:1px solid ${G.gray200};background:${G.navy};}
  .modal-title{font-size:16px;font-weight:700;color:${G.white};font-family:'Playfair Display',serif;}
  .modal-sub{font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;}
  .modal-body{padding:20px 24px;}
  .form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;}
  .form-row.single{grid-template-columns:1fr;}
  .form-group{display:flex;flex-direction:column;gap:4px;}
  .form-group label{font-size:11px;font-weight:600;color:${G.gray600};text-transform:uppercase;letter-spacing:0.5px;}
  .form-group input,.form-group select,.form-group textarea{padding:8px 10px;border:1px solid ${G.gray200};border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;outline:none;transition:border-color .15s;color:${G.gray800};background:${G.white};}
  .form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:${G.accent};}
  .form-group textarea{resize:vertical;min-height:64px;}
  .modal-foot{padding:14px 24px;border-top:1px solid ${G.gray200};display:flex;gap:10px;justify-content:flex-end;}
  .query-num-preview{background:#EBF5FB;border:1px solid #A9CCE3;border-radius:6px;padding:8px 12px;font-size:13px;font-weight:600;color:#1A5276;}

  /* TOAST */
  .toast{position:fixed;bottom:24px;right:24px;background:${G.navy};color:${G.white};padding:12px 18px;border-radius:8px;font-size:13px;font-weight:500;z-index:300;box-shadow:0 4px 16px rgba(0,0,0,0.2);display:flex;align-items:center;gap:8px;animation:slideUp .3s ease;}
  @keyframes slideUp{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}

  /* TOUR FILE VIEW */
  .cf-tab-row{display:flex;gap:2px;border-bottom:1px solid ${G.gray200};margin-bottom:16px;}
  .cf-tab{padding:8px 14px;font-size:12px;font-weight:500;cursor:pointer;color:${G.gray600};border-bottom:2px solid transparent;transition:all .15s;}
  .cf-tab.active{color:${G.accent};border-bottom-color:${G.accent};}
  .service-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;border:1px solid ${G.gray100};margin-bottom:6px;background:${G.white};}
  .service-status{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;}
  .ss-confirmed{background:#EAFAF1;color:#0E6655;}
  .ss-pending{background:#FEF9E7;color:#784212;}
  .ss-requested{background:#EBF5FB;color:#154360;}
  .service-name{font-size:12px;font-weight:500;flex:1;}
  .service-date{font-size:11px;color:${G.gray400};}

  /* ALERTS */
  .alert{padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:10px;display:flex;align-items:flex-start;gap:8px;}
  .alert-warn{background:#FEF3C7;border:1px solid #FDE68A;color:#92400E;}
  .alert-info{background:#DBEAFE;border:1px solid #BFDBFE;color:#1E40AF;}
`;

// ─── WORKFLOW STEPS ──────────────────────────────────────────────────────────
export const WF_STEPS = [
  { id: 1, label: "Query acknowledged" },
  { id: 2, label: "Query number assigned" },
  { id: 3, label: "Service requisition sent" },
  { id: 4, label: "Cost sheet prepared" },
  { id: 5, label: "Quotation sent to client" },
  { id: 6, label: "Itinerary drafted" },
  { id: 7, label: "Services status tracked" },
  { id: 8, label: "Flight / train status" },
  { id: 9, label: "Meal plan generated" },
  { id: 10, label: "Vouchers issued" },
  { id: 11, label: "Guest name list confirmed" },
  { id: 12, label: "Tour facilitator assigned" },
  { id: 13, label: "Proforma invoice sent" },
  { id: 14, label: "Payment status tracked" },
  { id: 15, label: "Receipts recorded" },
  { id: 16, label: "Tax invoice issued" },
  { id: 17, label: "P&L report filed" },
];

export const STATUS_WF_MAP = {
  new_query:  [1, 2],
  costing:    [1, 2, 3, 4, 5, 6],
  operations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  finance:    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  completed:  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
};

// ─── KANBAN BOARD — Visual pipeline ───────────────────────────────────────────
export const PIPELINE_STAGES = [
  { id:"new_query",  label:"New Query",       color:"#1A5276", bg:"#EBF5FB", hint:"Incoming queries awaiting qualification" },
  { id:"costing",    label:"Costing & Quote", color:"#784212", bg:"#FEF9E7", hint:"Cost sheet being prepared or quote sent" },
  { id:"operations", label:"Operations",      color:"#0E6655", bg:"#EAFAF1", hint:"Confirmed — tour file being serviced" },
  { id:"finance",    label:"Finance",         color:"#4A235A", bg:"#F0E6F6", hint:"Services done — pending payment closure" },
  { id:"completed",  label:"Completed",       color:"#145A32", bg:"#E9F7EF", hint:"Tour done, payment received" },
];

export const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const DEST_COLORS = ["#1A5276","#0E6655","#784212","#6C3483","#C0392B","#117A65","#1F618D","#7D6608","#5F6A6A","#1A5276","#2E86C1"];

// ─── REPORTS ──────────────────────────────────────────────────────────────────
export const ALL_REPORTS = [
  {id:"active_pipeline",     cat:"Operations",            icon:"📊",label:"Active Pipeline",             desc:"All active queries by stage, assigned staff, travel dates"},
  {id:"query_log",           cat:"Operations",            icon:"📋",label:"Query Log",                   desc:"Complete log of all queries — date, agent, sector, status"},
  {id:"tour_file_status",    cat:"Operations",            icon:"📁",label:"Tour File Status Report",     desc:"All open tour files with service status, departure dates, pax"},
  {id:"cancellations",       cat:"Operations",            icon:"✕", label:"Cancellation Report",         desc:"All cancelled queries/tour files with reason and stage"},
  {id:"conversion_rate",     cat:"Operations",            icon:"📈",label:"Query-to-Booking Conversion", desc:"How many queries convert to tour files, by month and agent"},
  {id:"workload",            cat:"Operations",            icon:"👥",label:"Staff Workload Report",       desc:"Queries and tour files assigned per staff member"},
  {id:"pl_summary",          cat:"Financial",             icon:"₹", label:"P&L Summary",                desc:"Revenue, costs, gross profit and margin per tour file"},
  {id:"pl_detailed",         cat:"Financial",             icon:"₹", label:"P&L Detailed (Per Tour File)",desc:"Full income and cost breakdown per tour file"},
  {id:"revenue_monthly",     cat:"Financial",             icon:"📅",label:"Monthly Revenue Report",      desc:"Incoming payments received each month"},
  {id:"outstanding_payments",cat:"Financial",             icon:"⚠", label:"Outstanding Payments",       desc:"Tour files with balance due from agents"},
  {id:"vendor_payables",     cat:"Financial",             icon:"🏢",label:"Vendor Payables Ledger",     desc:"All outstanding voucher payments to vendors"},
  {id:"season_pl",           cat:"Financial",             icon:"📆",label:"Season P&L (Apr–Mar)",       desc:"Revenue, costs and profit for the current financial season"},
  {id:"agent_revenue",       cat:"Financial",             icon:"🌐",label:"Agent-wise Revenue",         desc:"Total business and revenue per foreign agent for the season"},
  {id:"sector_analysis",     cat:"Business Intelligence", icon:"🗺",label:"Sector Performance",         desc:"Which destinations are most booked, highest revenue"},
  {id:"seasonality",         cat:"Business Intelligence", icon:"📊",label:"Seasonality Report",         desc:"Query and booking volume by month over the past 12 months"},
  {id:"agent_performance",   cat:"Business Intelligence", icon:"🌐",label:"Agent Performance",          desc:"Queries, conversions, revenue and outstanding by agent"},
  {id:"nationality_mix",     cat:"Business Intelligence", icon:"🌍",label:"Nationality Mix",            desc:"Breakdown of groups by nationality/market"},
  {id:"pax_analysis",        cat:"Business Intelligence", icon:"👥",label:"Group Size Analysis",        desc:"Average pax, FOC patterns, large vs small groups"},
  {id:"gst_summary",         cat:"Compliance",            icon:"🧾",label:"GST Summary",                desc:"GST collected (IGST/CGST+SGST) per month — for filing"},
  {id:"invoice_register",    cat:"Compliance",            icon:"📄",label:"Invoice Register",           desc:"All proforma and tax invoices issued"},
  {id:"receipt_register",    cat:"Compliance",            icon:"₹", label:"Receipt Register",           desc:"All payment receipts issued"},
];

// ─── TOUR BRIEFING SHEET ──────────────────────────────────────────────────────
export const VENDOR_TYPES_TBS = ["Hotel","Restaurant","Transport","Tour Facilitator","Activity","Flight","Train","Visa Agent","Hospital","Other"];

// ─── ITINERARY BUILDER ────────────────────────────────────────────────────────
export const MEAL_ICONS = { B:"☀", L:"🌤", D:"🌙" };

// ─── USER PROFILE PANEL ───────────────────────────────────────────────────────
export const AVATAR_COLORS = ["#1A5276","#6C3483","#0E6655","#784212","#C0392B","#117A65","#1F618D","#7D6608","#4A235A","#1B4F72","#78281F","#145A32"];

// ─── TEMPLATES HUB ────────────────────────────────────────────────────────────
export const DOC_TYPES = [
  {id:"quotation",    icon:"📋",label:"Quotation",               formats:["PDF","DOCX"]},
  {id:"costsheet",    icon:"📊",label:"Cost Sheet",              formats:["PDF","XLSX"]},
  {id:"brief_itin",   icon:"🗺", label:"Brief Itinerary",         formats:["PDF","DOCX"]},
  {id:"detail_itin",  icon:"📅",label:"Detailed Itinerary",      formats:["PDF","DOCX"]},
  {id:"monument",     icon:"🏛", label:"Monument / Activity List",formats:["PDF","DOCX"]},
  {id:"mealplan",     icon:"🍽", label:"Meal Plan",               formats:["PDF","DOCX"]},
  {id:"tourbriefing", icon:"📄",label:"Tour Briefing Sheet",     formats:["PDF","DOCX"]},
  {id:"exchange",     icon:"🎫",label:"Exchange Order",           formats:["PDF"]},
  {id:"proforma",     icon:"🧾",label:"Proforma Invoice",        formats:["PDF","DOCX"]},
  {id:"taxinvoice",   icon:"🧾",label:"Tax Invoice",             formats:["PDF","DOCX"]},
  {id:"receipt",      icon:"₹", label:"Payment Receipt",         formats:["PDF","DOCX"]},
];

export const PATTERN_PLACEHOLDERS = [
  {key:"{prefix}",   desc:"Document prefix (e.g. QT, PI, TI)"},
  {key:"{seq}",      desc:"Serial number — auto-increments"},
  {key:"{group}",    desc:"Group / client name"},
  {key:"{date}",     desc:"Today's date (YYYY-MM-DD)"},
  {key:"{sector}",   desc:"Tour sector / destination"},
  {key:"{id}",       desc:"Query ID"},
  {key:"{tourfile}", desc:"Tour File number"},
  {key:"{year}",     desc:"Current year (4-digit)"},
];

export const DEFAULT_DOC_SETTINGS = {
  costsheet:    { serial:1, prefix:"CS",  pattern:"{prefix}-{seq}-{group}-{date}", label:"Cost Sheet",          formats:["PDF","XLSX"] },
  quotation:    { serial:1, prefix:"QT",  pattern:"{prefix}-{seq}-{group}-{sector}", label:"Quotation",         formats:["PDF","DOCX"] },
  brief_itin:   { serial:1, prefix:"BI",  pattern:"{prefix}-{seq}-{group}",        label:"Brief Itinerary",     formats:["PDF","DOCX"] },
  detail_itin:  { serial:1, prefix:"DI",  pattern:"{prefix}-{seq}-{group}",        label:"Detailed Itinerary",  formats:["PDF","DOCX"] },
  monument:     { serial:1, prefix:"ML",  pattern:"{prefix}-{seq}-{group}",        label:"Monument List",       formats:["PDF","DOCX"] },
  mealplan:     { serial:1, prefix:"MP",  pattern:"{prefix}-{seq}-{group}-{date}", label:"Meal Plan",           formats:["PDF","DOCX"] },
  tourbriefing: { serial:1, prefix:"TB",  pattern:"{prefix}-{seq}-{tourfile}",     label:"Tour Briefing Sheet", formats:["PDF","DOCX"] },
  exchange:     { serial:1, prefix:"EO",  pattern:"{prefix}-{seq}-{tourfile}-{date}", label:"Exchange Order",   formats:["PDF (Shareable)","PDF (Plain)"] },
  proforma:     { serial:1, prefix:"PI",  pattern:"{prefix}-{year}-{seq}-{group}", label:"Proforma Invoice",    formats:["PDF","DOCX"] },
  taxinvoice:   { serial:1, prefix:"TI",  pattern:"{prefix}-{year}-{seq}-{group}", label:"Tax Invoice",         formats:["PDF","DOCX"] },
  receipt:      { serial:1, prefix:"RCP", pattern:"{prefix}-{seq}-{group}-{date}", label:"Payment Receipt",     formats:["PDF","DOCX"] },
  query:        { serial:1, prefix:"UTQ", pattern:"{prefix}-{year}-{seq}",         label:"Query ID",            formats:["—"] },
  tourfile:     { serial:1, prefix:"TUR", pattern:"{prefix}-{year}-{seq}",         label:"Tour File ID",        formats:["—"] },
};

export const TYPOGRAPHY_DEFAULTS = {
  titleFont:"Playfair Display", bodyFont:"Inter",
  titleSize:18, sectionSize:12, bodySize:10.5,
  tableHdrSize:9, tableDataSize:10, amountSize:10, fineSize:8.5,
  colorPrimary:"#1A3A52", colorAccent:"#8B1A1A", colorBody:"#1a1a1a", colorMuted:"#555555",
};

export const DEFAULT_QUOT_TEMPLATE = {
  greeting:"Greetings from Unitop Tours & Travel Pvt. Ltd.!",
  openingLine:"As Desired, Please Find Itinerary & Quotation As Under.",
  closingLine:"Kindly check & advise your acceptance, with exact date of journey & no. of Pax enabling us to go ahead for the necessary arrangement well in advance.\n\nHope you will find the above in order.",
  signoff:"Thanks & Regards\n\nTour Deptt.\nUnitop Tours & Travel Pvt. Ltd.",
  monumentNote:"Monument Fees (Payable Directly at Site):",
  includes:["Hotel accommodation as per programme.","All meals as per itinerary.","A/C transport throughout as per programme.","English speaking escort/guide throughout.","Bottled drinking water during the journey.","All present Govt. taxes included."],
  excludes:["Any expense of personal nature.","Any airfare (domestic or international).","Any visa fees.","Any airport tax.","Monument entrance fees (payable directly).","Any other item not mentioned above."],
  monuments:[], showMonuments:true,
};

export const DEFAULT_PROFORMA_TEMPLATE = {
  asDesiredLine: "AS DESIRED PLEASE FIND INVOICE AS UNDER:",
  bankAccountName: "Unitop Tours & Travel (P) Ltd.",
  bankName: "Punjab National Bank",
  bankAccountNo: "1503002100024279",
  bankSwift: "PUNBINBBISB",
  bankAddress: "B-1, Community Centre, Janakpuri, New Delhi – 110058 (India)",
};

export const DEFAULT_TAXINVOICE_TEMPLATE = {
  footerNote: "This is a computer generated invoice. Subject to Delhi jurisdiction.",
  placeOfSupply: "Delhi (07)",
};

export const DEFAULT_MEALPLAN_TEMPLATE = {
  defaultHeading: "Meal Plan",
};

export const DEFAULT_TOURBRIEFING_TEMPLATE = {
  openingLine: "As desired, please find service details as under: -",
  footerText: "Unitop Tours & Travel (P) Ltd.\nDDA-2F/506, Commercial Flat, District Centre, Janakpuri, New Delhi – 110058\nTel: 011-25550991/25550992 | E-mail: unitoptours@gmail.com",
};

export const DEFAULT_ITINERARY_TEMPLATE = {
  closingTagline: "TOUR ENDS AS YOU LEAVE FOOTPRINTS AND TAKE MEMORIES",
};

// ─── EXCHANGE ORDER / VOUCHER GENERATOR ──────────────────────────────────────
export const SERVICE_TYPES = [
  { id:"restaurant", label:"Restaurant",   icon:"🍽" },
  { id:"hotel",      label:"Hotel",        icon:"🏨" },
  { id:"transport",  label:"Transport",    icon:"🚌" },
  { id:"guide",      label:"Local Guide",  icon:"🧭" },
  { id:"handler",    label:"Local Handler",icon:"🤝" },
  { id:"activity",   label:"Activity",     icon:"🎯" },
];

// Watermark SVG pattern
export const WATERMARK_TEXT = "UNITOP TOURS & TRAVEL PVT. LTD.";
export const WatermarkSVG = () => (
  `<svg xmlns='http://www.w3.org/2000/svg' width='500' height='300'>
    <style>.wm{font-family:Arial;font-size:11px;fill:rgba(192,57,43,0.07);font-weight:700;letter-spacing:1px;}</style>
    ${Array.from({length:8},(_,row)=>
      Array.from({length:3},(_,col)=>
        `<text class='wm' x='${col*180-20}' y='${row*40}' transform='rotate(-25,${col*180},${row*40})'>${WATERMARK_TEXT}</text>`
      ).join("")
    ).join("")}
  </svg>`
);

export const DEFAULT_EXCHANGE_TEMPLATE = {
  instructionLine: "Please provide the following services against this order & bill us in duplicate.",
  footerBold: "PLEASE COLLECT ALL EXTRA CHARGES DIRECTLY",
  footerLine1: "Foreign Tourist(s) Payment in Foreign Exchange Received/Receivable",
  footerLine2: "Valid only when Signed & Stamped. Subject to Delhi Jurisdiction.",
};

// ─── TEMPLATE CONTENT (Templates section, "Template Content" tab) ────────────
// Consolidated lookup of every document type's default boilerplate text, keyed
// by the same id used in DOC_TYPES. TemplatesHub edits this; each document
// component receives its slice as a `template` prop and seeds its own local
// state from it (falling back to these hardcoded defaults if nothing has been
// customized yet). Doc types not listed here (costsheet, monument, receipt)
// don't have a populated standalone document generator yet, so there's
// nothing to templatize — the Template Content tab shows the "designed in a
// dedicated session" placeholder for those until that changes.
export const DEFAULT_DOC_TEMPLATES = {
  quotation: DEFAULT_QUOT_TEMPLATE,
  proforma: DEFAULT_PROFORMA_TEMPLATE,
  taxinvoice: DEFAULT_TAXINVOICE_TEMPLATE,
  mealplan: DEFAULT_MEALPLAN_TEMPLATE,
  tourbriefing: DEFAULT_TOURBRIEFING_TEMPLATE,
  brief_itin: DEFAULT_ITINERARY_TEMPLATE,
  detail_itin: DEFAULT_ITINERARY_TEMPLATE,
  exchange: DEFAULT_EXCHANGE_TEMPLATE,
};

// Field schema for the GENERIC Template Content form (used by every doc type
// except quotation, which keeps its bespoke editor — greeting/opening/closing/
// signoff plus the includes/excludes list editor — since that predates this
// generic renderer and has list fields the generic form doesn't support).
export const TEMPLATE_FIELD_SCHEMAS = {
  proforma: [
    { key: "asDesiredLine", label: "Opening Statement Line", type: "text" },
    { key: "bankAccountName", label: "Bank Account Name", type: "text" },
    { key: "bankName", label: "Bank Name", type: "text" },
    { key: "bankAccountNo", label: "Bank Account No.", type: "text" },
    { key: "bankSwift", label: "Swift Code", type: "text" },
    { key: "bankAddress", label: "Bank Address", type: "text" },
  ],
  taxinvoice: [
    { key: "footerNote", label: "Footer Note", type: "text" },
    { key: "placeOfSupply", label: "Default Place of Supply", type: "text" },
  ],
  mealplan: [
    { key: "defaultHeading", label: "Default Document Heading", type: "text" },
  ],
  tourbriefing: [
    { key: "openingLine", label: "Opening Line", type: "text" },
    { key: "footerText", label: "Footer Signature Block", type: "textarea" },
  ],
  brief_itin: [
    { key: "closingTagline", label: "Closing Tagline", type: "text" },
  ],
  detail_itin: [
    { key: "closingTagline", label: "Closing Tagline", type: "text" },
  ],
  exchange: [
    { key: "instructionLine", label: "Instruction Line", type: "text" },
    { key: "footerBold", label: "Footer Bold Line", type: "text" },
    { key: "footerLine1", label: "Footer Line 1", type: "text" },
    { key: "footerLine2", label: "Footer Line 2", type: "text" },
  ],
};
