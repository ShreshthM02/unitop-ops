// The app's first piece of JS-driven responsive logic. Everything else in
// the app that adapts to screen size does it through the one global
// stylesheet in constants.js (a single @media(max-width:768px) rule
// covering the sidebar, stat cards, and Kanban board) -- confirmed by real
// device testing to already work fine down to phone width.
//
// This hook exists for a different, narrower problem: several "pick
// something from a list, see its details" screens (Vendor/Agent/User
// Management, Reports, Templates) lay out a fixed-width list panel next
// to a flex:1 detail panel with no collapse behaviour at all. On a real
// phone that squeezes both panels into a sliver of their intended width --
// confirmed directly from a screenshot of Vendor Master, where the list
// and the detail profile were both rendered at roughly 150px wide.
//
// MOBILE_SPLIT_BREAKPOINT is deliberately its own, narrower constant
// (640px, not the shell's 768px) -- tablets were separately confirmed
// fine at the existing side-by-side width, so this only needs to kick in
// for genuine phone widths, not the tablet range the shell breakpoint
// already covers.
export const MOBILE_SPLIT_BREAKPOINT = 640;

import { useState, useEffect } from "react";

export function useIsNarrowViewport(breakpoint = MOBILE_SPLIT_BREAKPOINT) {
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsNarrow(window.innerWidth <= breakpoint);
    onResize(); // catches a breakpoint prop change and an already-narrow window on mount
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isNarrow;
}
