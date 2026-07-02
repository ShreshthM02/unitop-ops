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
export function useRealtimeTable(table, onChange, enabled = true) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange; // always call the latest closure, avoid stale state in the callback

  useEffect(() => {
    if (!enabled || !table || !realtimeClient) return;
    const channel = realtimeClient
      .channel(`realtime:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        onChangeRef.current(payload.eventType, payload.new, payload.old);
      })
      .subscribe();

    return () => { realtimeClient.removeChannel(channel); };
  }, [table, enabled]);
}
