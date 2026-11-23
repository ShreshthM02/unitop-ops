import { useEffect, useRef } from "react";
import { realtimeClient } from "./supabase.js";

// Subscribes to Postgres changes (INSERT/UPDATE/DELETE) on a table via
// Supabase Realtime, and calls onChange(eventType, newRow, oldRow) for each
// one. The caller owns how the event gets merged into state; this hook is
// just the subscription plumbing.
//
// Realtime only delivers what happens while the socket is up. A laptop that
// slept, a background tab the browser throttled, or a network blip all leave
// a gap that no event ever fills -- which is exactly when people had to
// refresh the page. So onResync (optional) is also called whenever the
// channel (re)connects after a drop, and when the tab becomes visible, the
// window regains focus, or the network comes back: the caller catches up on
// whatever it missed.
//
// Requires the target table to have Realtime enabled in Supabase (Database
// > Replication, or `alter publication supabase_realtime add table <name>;`).
let _instanceCounter = 0;
export function useRealtimeTable(table, onChange, enabled = true, onResync) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange; // always call the latest closure, avoid stale state in the callback
  const onResyncRef = useRef(onResync);
  onResyncRef.current = onResync;

  // Each hook instance gets its own channel name: Supabase returns the SAME
  // channel for a repeated name, and adding a callback to a channel that is
  // already subscribed throws.
  const instanceIdRef = useRef(null);
  if (instanceIdRef.current === null) instanceIdRef.current = ++_instanceCounter;

  useEffect(() => {
    if (!enabled || !table || !realtimeClient) return;
    let wasDown = false;
    const channel = realtimeClient
      .channel(`realtime:${table}:${instanceIdRef.current}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        onChangeRef.current(payload.eventType, payload.new, payload.old);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (wasDown && onResyncRef.current) onResyncRef.current();
          wasDown = false;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          wasDown = true; // supabase-js rejoins by itself; we catch up when it does
        }
      });

    const catchUp = () => { if (onResyncRef.current && (typeof document === "undefined" || document.visibilityState !== "hidden")) onResyncRef.current(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", catchUp);
    if (typeof window !== "undefined") { window.addEventListener("focus", catchUp); window.addEventListener("online", catchUp); }
    return () => {
      realtimeClient.removeChannel(channel);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", catchUp);
      if (typeof window !== "undefined") { window.removeEventListener("focus", catchUp); window.removeEventListener("online", catchUp); }
    };
  }, [table, enabled]);
}
