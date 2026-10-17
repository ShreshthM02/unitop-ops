import { useState, useEffect, useRef } from 'react';
import * as Lib from '../lib/index.js';
const { G, formatDateSlash } = Lib;

// Top-bar bell: one place for everything that needs this person's attention.
export default function NotificationBell({ chats = [], discussions = [], fleet = [], vehicleNames = {}, onOpenChat, onOpenQuery, onOpenFleet }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const total = chats.length + discussions.length + fleet.length;
  const mentions = discussions.filter(d => d.mentioned).length;
  const sec = (t) => <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: G.gray400, padding: "8px 12px 4px" }}>{t}</div>;
  const row = (key, onClick, left, right, strong) => (
    <div key={key} role="button" tabIndex={0} onClick={() => { setOpen(false); onClick(); }} onKeyDown={e => { if (e.key === "Enter") { setOpen(false); onClick(); } }}
      style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 12px", cursor: "pointer", borderTop: `1px solid ${G.gray100}`, fontSize: 12, fontWeight: strong ? 700 : 500 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{left}</span>
      <span style={{ fontSize: 10.5, color: G.gray400, flexShrink: 0 }}>{right}</span>
    </div>);
  return (
    <div ref={box} style={{ position: "relative" }}>
      <button className="btn btn-ghost" aria-label={`Notifications${total ? `, ${total} need attention` : ""}`} onClick={() => setOpen(o => !o)} style={{ position: "relative", fontSize: 14 }}>
        🔔
        {total > 0 && <span data-testid="bell-count" style={{ position: "absolute", top: -4, right: -4, background: mentions ? "#DC2626" : G.accent, color: "#fff", fontSize: 9.5, fontWeight: 700, borderRadius: 10, padding: "1px 5px", minWidth: 14, textAlign: "center" }}>{total > 99 ? "99+" : total}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 340, maxHeight: "70vh", overflowY: "auto", background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.16)", zIndex: 400 }}>
          {total === 0 && <div style={{ padding: 18, textAlign: "center", color: G.gray400, fontSize: 12 }}>You're all caught up.</div>}
          {fleet.length > 0 && <>{sec(`Due soon · Fleet documents (${fleet.length})`)}
            {fleet.map(d => row(d.id, () => onOpenFleet && onOpenFleet(d.vehicle_id), `🚌 ${vehicleNames[d.vehicle_id] || "Vehicle"} — ${d.file_name}`, formatDateSlash(String(d.reminder_date).slice(0, 10)), true))}</>}
          {discussions.length > 0 && <>{sec(`Discussions (${discussions.length})`)}
            {discussions.map(d => row(d.query.id, () => onOpenQuery && onOpenQuery(d.query), `${d.mentioned ? "@ " : ""}${d.query.tourFileId || d.query.id} · ${d.query.groupName || d.query.clientName || ""}`, `${d.count} new`, d.mentioned))}</>}
          {chats.length > 0 && <>{sec(`Chats (${chats.length})`)}
            {chats.map(c => row(c.id, () => onOpenChat && onOpenChat(c.id), `${c.label || "Chat"}: ${(c.lastMessage && c.lastMessage.text || "").slice(0, 40)}`, "unread", true))}</>}
        </div>
      )}
    </div>
  );
}
