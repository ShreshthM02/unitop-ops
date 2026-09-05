import { useEffect, useRef } from "react";
import { realtimeClient } from "./supabase.js";

// Subscribes to Postgres changes (INSERT/UPDATE/DELETE) on a table via
// Supabase Realtime, and calls onChange(eventType, newRow, oldRow) for each
// one. The caller owns how the event gets merged into state — this hook is
// just the subscription plumbing, kept separate from any particular table's
// merge logic so it can be reused for queries, agents, vendors, payments,
// etc. as each gets wired up.
//
// Requires the target table to have Realtime enabled in Supabase (Database
// > Replication, or `alter publication supabase_realtime add table <name>;`)
// — this hook can't turn that on itself, it's a project-level setting.
let _instanceCounter = 0;
export function useRealtimeTable(table, onChange, enabled = true) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange; // always call the latest closure, avoid stale state in the callback

  // Real bug found and fixed: a channel name of just `realtime:${table}:${instanceIdRef.current}`
  // collides whenever two different components subscribe to the same
  // table at once (e.g. UnitopApp's always-mounted global chat badge
  // and InAppChat's own subscription while the panel is open) --
  // Supabase's channel(name) returns the SAME underlying channel for a
  // repeated name, and calling .on() to add a new callback on a channel
  // that's already .subscribe()'d throws outright ("cannot add
  // postgres_changes callbacks... after subscribe()"), crashing
  // whichever component mounted second. Each hook instance now gets its
  // own genuinely unique channel name, so any number of components can
  // independently subscribe to the same table without colliding.
  const instanceIdRef = useRef(null);
  if (instanceIdRef.current === null) instanceIdRef.current = ++_instanceCounter;

  useEffect(() => {
    if (!enabled || !table || !realtimeClient) return;
    const channel = realtimeClient
      .channel(`realtime:${table}:${instanceIdRef.current}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        onChangeRef.current(payload.eventType, payload.new, payload.old);
      })
      .subscribe();

    return () => { realtimeClient.removeChannel(channel); };
  }, [table, enabled]);
}
