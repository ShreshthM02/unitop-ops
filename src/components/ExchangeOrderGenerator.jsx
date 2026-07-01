import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import * as Lib from '../lib/index.js';
const { DOC_CATEGORIES, DOC_STATUS, DOC_FROM, USERS, ROLE_LABELS, INITIAL_QUERIES, TOUR_DATA, KANBAN_COLS, SOURCE_COLORS, GANTT_DAYS, TODAY_IDX, APP_VERSION, COMPANY_INFO, INITIAL_PAYMENTS, DEFAULT_TEMPLATE, QUERY_SOURCES, ROLE_COLOR, ROLE_BG, INITIAL_AGENTS, VENDOR_TYPES, INITIAL_VENDORS, VEHICLE_TYPES, DEFAULT_MONUMENTS, ROLE_DEFAULTS, PERM_LABELS, G, css, WF_STEPS, STATUS_WF_MAP, PIPELINE_STAGES, MONTH_NAMES, DEST_COLORS, ALL_REPORTS, VENDOR_TYPES_TBS, MEAL_ICONS, AVATAR_COLORS, DOC_TYPES, PATTERN_PLACEHOLDERS, DEFAULT_DOC_SETTINGS, TYPOGRAPHY_DEFAULTS, DEFAULT_QUOT_TEMPLATE, SERVICE_TYPES, WATERMARK_TEXT, WatermarkSVG, LOGO_B64, BADGE_MOT_B64, BADGE_INDIA_B64, BADGE_IATO_B64, STAMP_B64, BADGE_AWARD_B64, getPermissions, useCan, Avatar, StatusBadge, Toast, WorkflowProgress, OtherInput, nextInvoiceNo, numToWords, invoiceLetterheadCSS, invoiceLetterheadHTML, invoiceFooterHTML } = Lib;

export default function ExchangeOrderGenerator({ query, onClose, currentUser }) {
  const [orderType, setOrderType] = useState("restaurant");
  const [orders, setOrders] = useState([]);
  const [editing, setEditing] = useState(null); // null = new order form
  const [showForm, setShowForm] = useState(true);

  // Auto-increment order number (in real app this comes from DB)
  const nextOrderNo = () => 41283 + orders.length + 1;

  const emptyOrder = () => ({
    id: Date.now(),
    orderNo: nextOrderNo(),
    serviceType: orderType,
    date: new Date().toLocaleDateString("en-IN",{day:"numeric",month:"numeric",year:"numeric"}),
    drawnOn: "",        // vendor / service provider
    tourNo: query.tourFileId || query.id,
    serviceDate: "",
    // Service-specific fields
    serviceDetail: "",  // free text instruction line
    time: "",
    pax: query.pax || "",
    nationality: query.nationality || "",
    escort: "",
    escortPhone: "",
    mealType: "",       // restaurant
    menuType: "",       // restaurant
    hotelName: "",      // hotel
    roomType: "",       // hotel
    checkIn: "",        // hotel
    checkOut: "",       // hotel
    vehicleType: "",    // transport
    route: "",          // transport / guide
    // Arrival
    arrivalDate: "",
    arrivalFrom: "",
    arrivalBy: "FLIGHT",
    arrivalTime: "",
    // Departure
    departureDate: "",
    departureTo: "",
    departureBy: "FLIGHT",
    departureTime: "",
    notes: "",
    confirmed: false,
  });

  const [form, setForm] = useState(emptyOrder());
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  const saveOrder = () => {
    if (!form.drawnOn) return;
    if (editing !== null) {
      setOrders(prev => prev.map(o => o.id === form.id ? form : o));
      setEditing(null);
    } else {
      setOrders(prev => [...prev, { ...form, id: Date.now(), orderNo: nextOrderNo() }]);
    }
    setForm(emptyOrder());
    setShowForm(false);
  };

  const editOrder = (order) => {
    setForm(order);
    setEditing(order.id);
    setShowForm(true);
  };

  const deleteOrder = (id) => setOrders(prev => prev.filter(o => o.id !== id));

  const toggleConfirm = (id) => setOrders(prev => prev.map(o => o.id === id ? {...o, confirmed: !o.confirmed} : o));

  // Build the printable HTML for one order
  const buildPrintHTML = (order) => {
    const svc = SERVICE_TYPES.find(s=>s.id===order.serviceType);
    const wmDataUrl = `data:image/svg+xml,${encodeURIComponent(WatermarkSVG())}`;

    // Service detail lines based on type
    let serviceLines = "";
    if (order.serviceType === "restaurant") {
      serviceLines = `
        <p style="margin:0 0 10px">Unitop Tour No. ${order.tourNo}: ${order.serviceDate}: ${order.mealType||"Dinner"} for ${order.pax} Pax${order.menuType?": "+order.menuType:""}.</p>
        <p style="margin:0 0 6px">Kindly book and confirm ${order.mealType||"Meal"} as under:</p>
        <table style="width:100%;font-size:12px;margin-bottom:6px"><tbody>
          <tr><td style="padding:2px 0;width:120px"><strong>Date:</strong></td><td>${order.serviceDate}</td></tr>
          <tr><td style="padding:2px 0"><strong>Time:</strong></td><td>${order.time}${order.mealType?", "+order.mealType:""}${order.menuType?", "+order.menuType:""}</td></tr>
          <tr><td style="padding:2px 0"><strong>No. Of Pax:</strong></td><td>${order.pax}</td></tr>
          <tr><td style="padding:2px 0"><strong>Nationality:</strong></td><td>${order.nationality}</td></tr>
          <tr><td style="padding:2px 0"><strong>Tour Escort:</strong></td><td>${order.escort||"—"}${order.escortPhone?" "+order.escortPhone:""}</td></tr>
        </tbody></table>`;
    } else if (order.serviceType === "hotel") {
      serviceLines = `
        <p style="margin:0 0 10px">Unitop Tour No. ${order.tourNo}: Kindly arrange accommodation as under:</p>
        <table style="width:100%;font-size:12px;margin-bottom:6px"><tbody>
          <tr><td style="padding:2px 0;width:120px"><strong>Check-in:</strong></td><td>${order.checkIn}</td></tr>
          <tr><td style="padding:2px 0"><strong>Check-out:</strong></td><td>${order.checkOut}</td></tr>
          <tr><td style="padding:2px 0"><strong>Room Type:</strong></td><td>${order.roomType}</td></tr>
          <tr><td style="padding:2px 0"><strong>No. Of Pax:</strong></td><td>${order.pax}</td></tr>
          <tr><td style="padding:2px 0"><strong>Nationality:</strong></td><td>${order.nationality}</td></tr>
          <tr><td style="padding:2px 0"><strong>Meal Plan:</strong></td><td>${order.menuType||"—"}</td></tr>
          <tr><td style="padding:2px 0"><strong>Tour Escort:</strong></td><td>${order.escort||"—"}${order.escortPhone?" "+order.escortPhone:""}</td></tr>
        </tbody></table>`;
    } else if (order.serviceType === "transport") {
      serviceLines = `
        <p style="margin:0 0 10px">Unitop Tour No. ${order.tourNo}: Kindly provide transport as under:</p>
        <table style="width:100%;font-size:12px;margin-bottom:6px"><tbody>
          <tr><td style="padding:2px 0;width:120px"><strong>Date:</strong></td><td>${order.serviceDate}</td></tr>
          <tr><td style="padding:2px 0"><strong>Vehicle:</strong></td><td>${order.vehicleType}</td></tr>
          <tr><td style="padding:2px 0"><strong>Route:</strong></td><td>${order.route}</td></tr>
          <tr><td style="padding:2px 0"><strong>Time:</strong></td><td>${order.time}</td></tr>
          <tr><td style="padding:2px 0"><strong>No. Of Pax:</strong></td><td>${order.pax}</td></tr>
          <tr><td style="padding:2px 0"><strong>Nationality:</strong></td><td>${order.nationality}</td></tr>
          <tr><td style="padding:2px 0"><strong>Tour Escort:</strong></td><td>${order.escort||"—"}${order.escortPhone?" "+order.escortPhone:""}</td></tr>
        </tbody></table>`;
    } else {
      serviceLines = `
        <p style="margin:0 0 10px">Unitop Tour No. ${order.tourNo}: Kindly provide ${svc?.label||"service"} as under:</p>
        <table style="width:100%;font-size:12px;margin-bottom:6px"><tbody>
          <tr><td style="padding:2px 0;width:120px"><strong>Date:</strong></td><td>${order.serviceDate}</td></tr>
          <tr><td style="padding:2px 0"><strong>Details:</strong></td><td>${order.serviceDetail}</td></tr>
          <tr><td style="padding:2px 0"><strong>No. Of Pax:</strong></td><td>${order.pax}</td></tr>
          <tr><td style="padding:2px 0"><strong>Nationality:</strong></td><td>${order.nationality}</td></tr>
          <tr><td style="padding:2px 0"><strong>Tour Escort:</strong></td><td>${order.escort||"—"}${order.escortPhone?" "+order.escortPhone:""}</td></tr>
        </tbody></table>`;
    }

    const hasArrDep = order.arrivalDate || order.departureDate;

    return `<!DOCTYPE html><html><head><title>Exchange Order ${order.orderNo}</title>
    <style>
      @page { size: A5 landscape; margin: 8mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; padding: 0;
        background: white; width: 200mm; min-height: 138mm; position: relative; overflow: hidden; }
      .watermark { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;
        background-image: url("${wmDataUrl}"); background-repeat: repeat; opacity: 1; pointer-events: none; }
      .content { position: relative; z-index: 1; padding: 8px 12px; }
      .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #C0392B; padding-bottom: 6px; margin-bottom: 8px; }
      .logo-area { display: flex; align-items: center; gap: 8px; }
      .logo-text { }
      .logo-title { font-size: 13px; font-weight: 900; color: #C0392B; letter-spacing: 0.5px; }
      .logo-sub { font-size: 9px; color: #666; }
      .co-info { text-align: right; }
      .co-name { font-size: 13px; font-weight: 900; color: #0D1B2A; }
      .co-addr { font-size: 9px; color: #555; line-height: 1.4; }
      .eo-title { font-size: 14px; font-weight: 900; color: #C0392B; text-align: center; letter-spacing: 1px; margin-bottom: 2px; }
      .svc-type { font-size: 11px; font-weight: 700; text-align: center; color: #0D1B2A; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
      .meta-row { display: flex; gap: 16px; font-size: 11px; margin-bottom: 6px; flex-wrap: wrap; }
      .meta-row span { color: #1a1a1a; }
      .meta-row strong { color: #C0392B; }
      .divider { border: none; border-top: 1px solid #ddd; margin: 6px 0; }
      .body-area { font-size: 12px; }
      .arr-dep { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 8px; }
      .arr-dep-box h4 { font-size: 11px; font-weight: 900; text-decoration: underline; margin: 0 0 4px; color: #0D1B2A; }
      .arr-dep-box table td { padding: 1px 4px; font-size: 11px; }
      .footer-area { margin-top: 8px; border-top: 2px solid #C0392B; padding-top: 6px; display: flex; justify-content: space-between; align-items: flex-end; }
      .footer-text { font-size: 9px; color: #555; }
      .footer-text .bold { font-weight: 700; color: #C0392B; font-size: 10px; text-decoration: underline; }
      .stamp { width: 64px; height: 64px; border-radius: 50%; border: 2.5px solid #C0392B; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; position: relative; }
      .stamp-inner { font-size: 6px; font-weight: 700; color: #C0392B; line-height: 1.3; letter-spacing: 0.3px; }
      .stamp-label { font-size: 6.5px; font-weight: 700; color: #C0392B; margin-bottom: 1px; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <div class="watermark"></div>
    <div class="content">
      <div class="header">
        <div class="logo-area">
          <div class="logo-text">
            <img src="${LOGO_B64}" alt="Unitop" style="height:40px;width:auto;display:block;margin-bottom:2px;mix-blend-mode:multiply"/>
            <div style="font-size:8px;color:#C0392B;font-weight:700;letter-spacing:1px">EXCHANGE ORDER</div>
          </div>
        </div>
        <div class="co-info">
          <div class="co-name">UNITOP TOURS &amp; TRAVEL PVT. LTD</div>
          <div class="co-addr">506, DDA-2, District Centre, Janakpuri, New Delhi-110058<br/>
          Ph: +91-11-25550991, 25550992, 41589897, 45503106<br/>
          Email: unitoptours@gmail.com, Web: www.unitoptours.com</div>
        </div>
      </div>
      <div class="eo-title">EXCHANGE ORDER</div>
      <div class="svc-type">${(svc?.label||"Service").toUpperCase()}</div>
      <div class="meta-row">
        <span><strong>Exchange Order No.:</strong> ${order.orderNo}</span>
        <span><strong>Dated:</strong> ${order.date}</span>
      </div>
      <div class="meta-row">
        <span><strong>Drawn on:</strong> ${order.drawnOn}</span>
      </div>
      <div class="meta-row">
        <span><strong>In favour of Tour No.:</strong> ${order.tourNo}</span>
      </div>
      <div class="meta-row" style="margin-bottom:4px">
        <span>Please provide the following services against this order &amp; bill us in duplicate.</span>
      </div>
      <hr class="divider"/>
      <div class="body-area">
        ${serviceLines}
        ${order.notes?`<p style="margin:4px 0;font-size:11px;color:#555"><em>${order.notes}</em></p>`:""}
      </div>
      ${hasArrDep ? `<div class="arr-dep">
        <div class="arr-dep-box">
          <h4>ARRIVAL</h4>
          <table><tbody>
            <tr><td><strong>Date:</strong></td><td>${order.arrivalDate}</td></tr>
            <tr><td><strong>From:</strong></td><td>${order.arrivalFrom}</td></tr>
            <tr><td><strong>By:</strong></td><td>${order.arrivalBy}</td></tr>
            <tr><td><strong>Time:</strong></td><td>${order.arrivalTime}</td></tr>
          </tbody></table>
        </div>
        <div class="arr-dep-box">
          <h4>DEPARTURE</h4>
          <table><tbody>
            <tr><td><strong>Date:</strong></td><td>${order.departureDate}</td></tr>
            <tr><td><strong>To:</strong></td><td>${order.departureTo}</td></tr>
            <tr><td><strong>By:</strong></td><td>${order.departureBy}</td></tr>
            <tr><td><strong>Time:</strong></td><td>${order.departureTime}</td></tr>
          </tbody></table>
        </div>
      </div>` : ""}
      <div class="footer-area">
        <div class="footer-text">
          <div class="bold">PLEASE COLLECT ALL EXTRA CHARGES DIRECTLY</div>
          <div>Foreign Tourist(s) Payment in Foreign Exchange Received/Receivable</div>
          <div>Valid only when Signed &amp; Stamped. Subject to Delhi Jurisdiction.</div>
          <div style="margin-top:6px;font-weight:700">Authorised Signatory</div>
        </div>
        <div class="stamp">
          <div class="stamp-label">UNITOP</div>
          <div class="stamp-inner">TOURS &amp; TRAVEL<br/>PVT. LTD.</div>
          <div style="font-size:5px;color:#C0392B;margin-top:1px;font-weight:700">✦ DIGITALLY ✦</div>
          <div style="font-size:5px;color:#C0392B;font-weight:700">SIGNED &amp; VERIFIED</div>
          <div style="font-size:5px;color:#C0392B;margin-top:1px">NEW DELHI</div>
        </div>
      </div>
    </div>
    </body></html>`;
  };

  const printOrder = (order) => {
    const win = window.open("","_blank");
    win.document.write(buildPrintHTML(order));
    win.document.close();
    win.print();
  };

  const printAll = () => {
    const win = window.open("","_blank");
    const pages = orders.map(o => `<div style="page-break-after:always">${buildPrintHTML(o).replace(/<!DOCTYPE html>[\s\S]*?<body>/,"").replace(/<\/body>[\s\S]*?<\/html>/,"")}</div>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><style>@page{size:A5 landscape;margin:8mm;}body{margin:0;padding:0;font-family:Arial,sans-serif;}</style></head><body>${pages}</body></html>`);
    win.document.close();
    win.print();
  };

  const inp = { padding:"6px 8px", border:`1px solid ${G.gray200}`, borderRadius:5, fontSize:12, fontFamily:"'Inter',sans-serif", width:"100%", outline:"none", color:G.gray800, background:G.white };
  const label = (t) => <div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{t}</div>;
  const secHead = (t) => <div style={{background:G.navy,color:"#fff",padding:"5px 10px",borderRadius:5,fontSize:11,fontWeight:700,letterSpacing:"0.5px",margin:"14px 0 8px"}}>{t}</div>;

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:720,height:"100vh",overflowY:"auto",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{background:G.navy,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>EXCHANGE ORDERS / SERVICE VOUCHERS</div>
            <div style={{fontSize:17,fontWeight:700,color:G.white,fontFamily:"'Playfair Display',serif"}}>{query.groupName||query.clientName}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{query.tourFileId||query.id} · {query.destination}</div>
          </div>
          {orders.length > 0 && <button onClick={printAll} className="btn btn-success" style={{fontSize:11}}>🖨 Print All ({orders.length})</button>}
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>

          {/* Saved orders list */}
          {orders.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:G.navy,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>
                Exchange Orders — {query.tourFileId||query.id}
              </div>
              {orders.map(order => {
                const svc = SERVICE_TYPES.find(s=>s.id===order.serviceType);
                return (
                  <div key={order.id} style={{background:G.white,border:`1px solid ${order.confirmed?"#A9DFBF":G.gray200}`,borderRadius:8,padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                    <div style={{fontSize:20}}>{svc?.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                        <span style={{fontSize:12,fontWeight:700,color:G.navy}}>#{order.orderNo}</span>
                        <span style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:order.confirmed?"#EAFAF1":"#FEF9E7",color:order.confirmed?"#0E6655":"#784212",fontWeight:600}}>
                          {order.confirmed?"✓ Confirmed":"Pending"}
                        </span>
                        <span style={{fontSize:11,padding:"1px 7px",borderRadius:10,background:"#EBF5FB",color:"#154360",fontWeight:500}}>{svc?.label}</span>
                      </div>
                      <div style={{fontSize:12,color:G.gray800,fontWeight:500}}>{order.drawnOn}</div>
                      <div style={{fontSize:11,color:G.gray600}}>{order.serviceDate}{order.time?" · "+order.time:""} · {order.pax} pax</div>
                    </div>
                    <button className="btn btn-ghost" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>toggleConfirm(order.id)}>
                      {order.confirmed?"✗ Unconfirm":"✓ Confirm"}
                    </button>
                    <button className="btn btn-ghost" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>editOrder(order)}>✏ Edit</button>
                    <button className="btn btn-success" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>printOrder(order)}>🖨 Print</button>
                    <span style={{cursor:"pointer",color:G.gray400,fontSize:13}} onClick={()=>deleteOrder(order.id)}>✕</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Toggle form */}
          {!showForm ? (
            <button className="btn btn-primary" onClick={()=>{ setForm(emptyOrder()); setEditing(null); setShowForm(true); }}>
              + New Exchange Order
            </button>
          ) : (
            <div style={{background:G.gray50,border:`1px solid ${G.gray200}`,borderRadius:10,padding:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,color:G.navy}}>{editing?"Edit Exchange Order":"New Exchange Order"}</div>
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setShowForm(false)}>Cancel</button>
              </div>

              {/* Service type selector */}
              <div style={{marginBottom:14}}>
                {label("Service Type")}
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {SERVICE_TYPES.map(s=>(
                    <button key={s.id} onClick={()=>{ setOrderType(s.id); setF("serviceType",s.id); }}
                      style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${form.serviceType===s.id?G.accent:G.gray200}`,background:form.serviceType===s.id?"#FDEDEC":G.white,color:form.serviceType===s.id?G.accent:G.gray600,fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:form.serviceType===s.id?600:400}}>
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Order meta */}
              {secHead("📋 Order Details")}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div>{label("Exchange Order No.")}
                  <input style={inp} value={form.orderNo} onChange={e=>setF("orderNo",e.target.value)}/></div>
                <div>{label("Date")}
                  <input style={inp} value={form.date} onChange={e=>setF("date",e.target.value)}/></div>
                <div>{label("Tour No.")}
                  <input style={inp} value={form.tourNo} onChange={e=>setF("tourNo",e.target.value)}/></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>{label("Drawn on (Vendor / Service Provider)")}
                  <input style={inp} value={form.drawnOn} onChange={e=>setF("drawnOn",e.target.value)} placeholder="e.g. Nanking Restaurant"/></div>
                <div>{label("Service Date")}
                  <input style={inp} value={form.serviceDate} onChange={e=>setF("serviceDate",e.target.value)} placeholder="e.g. 21st June 2026"/></div>
              </div>

              {/* Service-specific fields */}
              {secHead(`${SERVICE_TYPES.find(s=>s.id===form.serviceType)?.icon} ${SERVICE_TYPES.find(s=>s.id===form.serviceType)?.label} Details`)}

              {form.serviceType==="restaurant" && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>{label("Meal Type")}
                    <select style={inp} value={form.mealType} onChange={e=>setF("mealType",e.target.value)}>
                      {["Breakfast","Lunch","Dinner","High Tea"].map(m=><option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>{label("Menu Type")}
                    <input style={inp} value={form.menuType} onChange={e=>setF("menuType",e.target.value)} placeholder="e.g. Chinese Fix Menu, Indian Buffet"/></div>
                  <div>{label("Time")}
                    <input style={inp} value={form.time} onChange={e=>setF("time",e.target.value)} placeholder="e.g. 18:00 PM"/></div>
                  <div>{label("No. of Pax")}
                    <input style={inp} value={form.pax} onChange={e=>setF("pax",e.target.value)} placeholder="e.g. 16 + 01"/></div>
                </div>
              )}

              {form.serviceType==="hotel" && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>{label("Hotel Name")}
                    <input style={inp} value={form.hotelName} onChange={e=>setF("hotelName",e.target.value)} placeholder="e.g. Saura Hotel"/></div>
                  <div>{label("Room Type")}
                    <input style={inp} value={form.roomType} onChange={e=>setF("roomType",e.target.value)} placeholder="e.g. 8 Twin + 1 Single"/></div>
                  <div>{label("Check-in Date")}
                    <input style={inp} value={form.checkIn} onChange={e=>setF("checkIn",e.target.value)}/></div>
                  <div>{label("Check-out Date")}
                    <input style={inp} value={form.checkOut} onChange={e=>setF("checkOut",e.target.value)}/></div>
                  <div>{label("Meal Plan")}
                    <select style={inp} value={form.menuType} onChange={e=>setF("menuType",e.target.value)}>
                      {["EP","CP","MAP","AP"].map(m=><option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>{label("No. of Pax")}
                    <input style={inp} value={form.pax} onChange={e=>setF("pax",e.target.value)}/></div>
                </div>
              )}

              {form.serviceType==="transport" && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>{label("Vehicle Type")}
                    <input style={inp} value={form.vehicleType} onChange={e=>setF("vehicleType",e.target.value)} placeholder="e.g. A/C Large Coach"/></div>
                  <div>{label("Route")}
                    <input style={inp} value={form.route} onChange={e=>setF("route",e.target.value)} placeholder="e.g. Delhi – Agra – Jaipur"/></div>
                  <div>{label("Pickup Time")}
                    <input style={inp} value={form.time} onChange={e=>setF("time",e.target.value)} placeholder="e.g. 08:00 AM"/></div>
                  <div>{label("No. of Pax")}
                    <input style={inp} value={form.pax} onChange={e=>setF("pax",e.target.value)}/></div>
                </div>
              )}

              {["guide","handler","activity"].includes(form.serviceType) && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div style={{gridColumn:"1/-1"}}>{label("Service Details")}
                    <input style={inp} value={form.serviceDetail} onChange={e=>setF("serviceDetail",e.target.value)} placeholder="Describe the service required..."/></div>
                  <div>{label("Time")}
                    <input style={inp} value={form.time} onChange={e=>setF("time",e.target.value)}/></div>
                  <div>{label("No. of Pax")}
                    <input style={inp} value={form.pax} onChange={e=>setF("pax",e.target.value)}/></div>
                </div>
              )}

              {/* Common fields */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>{label("Nationality")}
                  <input style={inp} value={form.nationality} onChange={e=>setF("nationality",e.target.value)}/></div>
                <div>{label("Tour Escort Name")}
                  <input style={inp} value={form.escort} onChange={e=>setF("escort",e.target.value)} placeholder="e.g. Mr. Peeyush"/></div>
                <div>{label("Escort Phone")}
                  <input style={inp} value={form.escortPhone} onChange={e=>setF("escortPhone",e.target.value)} placeholder="e.g. 9555962990"/></div>
              </div>

              {/* Arrival / Departure */}
              {secHead("✈ Arrival / Departure (if applicable)")}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:10}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:G.gray600,marginBottom:8}}>ARRIVAL</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>{label("Date")}<input style={inp} value={form.arrivalDate} onChange={e=>setF("arrivalDate",e.target.value)}/></div>
                    <div>{label("Time")}<input style={inp} value={form.arrivalTime} onChange={e=>setF("arrivalTime",e.target.value)} placeholder="e.g. 13:00"/></div>
                    <div>{label("From")}<input style={inp} value={form.arrivalFrom} onChange={e=>setF("arrivalFrom",e.target.value)} placeholder="e.g. LEH"/></div>
                    <div>{label("By")}<select style={inp} value={form.arrivalBy} onChange={e=>setF("arrivalBy",e.target.value)}>
                      {["FLIGHT","TRAIN","ROAD","SHIP"].map(m=><option key={m}>{m}</option>)}</select></div>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:G.gray600,marginBottom:8}}>DEPARTURE</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div>{label("Date")}<input style={inp} value={form.departureDate} onChange={e=>setF("departureDate",e.target.value)}/></div>
                    <div>{label("Time")}<input style={inp} value={form.departureTime} onChange={e=>setF("departureTime",e.target.value)} placeholder="e.g. 21:00"/></div>
                    <div>{label("To")}<input style={inp} value={form.departureTo} onChange={e=>setF("departureTo",e.target.value)} placeholder="e.g. HONGKONG"/></div>
                    <div>{label("By")}<select style={inp} value={form.departureBy} onChange={e=>setF("departureBy",e.target.value)}>
                      {["FLIGHT","TRAIN","ROAD","SHIP"].map(m=><option key={m}>{m}</option>)}</select></div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div style={{marginBottom:14}}>
                {label("Additional Notes (internal)")}
                <textarea style={{...inp,minHeight:44,resize:"vertical"}} value={form.notes} onChange={e=>setF("notes",e.target.value)} placeholder="Any special instructions..."/>
              </div>

              <div style={{display:"flex",gap:10}}>
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={()=>setShowForm(false)}>Cancel</button>
                <div style={{flex:1}}/>
                <button className="btn btn-primary" style={{opacity:form.drawnOn?1:0.5}} onClick={saveOrder}>
                  {editing?"✓ Update Order":"✓ Save Exchange Order"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{padding:"12px 20px",borderTop:`1px solid ${G.gray200}`,display:"flex",gap:10,flexShrink:0,background:G.gray50}}>
          <button onClick={onClose} className="btn btn-ghost">Close</button>
          <div style={{flex:1}}/>
          {orders.length > 0 && <button onClick={printAll} className="btn btn-success">🖨 Print All Orders</button>}
        </div>
      </div>
    </div>
  );
}


// ─── USER MANAGEMENT PANEL (Admin only) ──────────────────────────────────────

// ─── AGENT MASTER ─────────────────────────────────────────────────────────────

// ─── ITINERARY BUILDER ────────────────────────────────────────────────────────
