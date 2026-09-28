import { useState, useEffect } from 'react';
import { db } from './lib/supabase.js';
import { LOGO_B64 } from './lib/images.js';
import { LoginScreen, UnitopApp, VendorLedgerPanel, AgentLedgerPanel } from './components/index.js';

export default function App() {
  const [loggedIn, setLoggedIn]           = useState(false);
  const [authLoading, setAuthLoading]     = useState(true);
  const [showVendorLedger, setShowVendorLedger] = useState(null);
  const [showAgentLedger,  setShowAgentLedger]  = useState(null);

  const [currentUserData, setCurrentUserData] = useState(null);

  // Check for existing session on mount
  useEffect(() => {
    db.auth.validateSession().then(user => {
      if (user) { setLoggedIn(true); setCurrentUserData(user); }
      setAuthLoading(false);
    });
  }, []);

  // Item 4 robustness fix -- root cause of the "all users/team vanished"
  // report: staff_login()/validate_session() issue a signed JWT good for
  // only 12 hours, and until now the ONLY time it was ever refreshed was
  // this component's very first mount. A tab left open past that window
  // (overnight, over a weekend) kept sending an already-expired JWT on
  // every request; PostgREST correctly 401'd every one of them, and the
  // rest of the app had no way to tell that apart from "there's
  // genuinely nothing here" -- so staff, queries, everything just looked
  // empty, with no error and no prompt to log back in. Two independent
  // guards against that recurring: a periodic re-validate well inside
  // the 12-hour window (so a JWT is never actually given the chance to
  // go stale while the app is in active use), and an immediate
  // re-validate the moment a backgrounded tab becomes visible again
  // (the case a fixed interval alone can miss -- a laptop asleep for
  // hours, then woken up and used within the same interval tick). Plus
  // a genuine hard-expiry safety net via db.auth.onSessionExpired,
  // wired below: if a request ever does come back 401 regardless (session
  // actually revoked, real clock skew), the app drops back to the login
  // screen instead of silently rendering empty lists.
  useEffect(() => {
    if (!loggedIn) return;
    const revalidate = () => {
      db.auth.validateSession().then(user => {
        if (!user) { setLoggedIn(false); setCurrentUserData(null); }
      });
    };
    const REVALIDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 min, well under the 12h token expiry
    const intervalId = setInterval(revalidate, REVALIDATE_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") revalidate(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loggedIn]);

  // Safety net: a request that comes back 401 with what looked like a
  // valid session drops the user back to the login screen, rather than
  // leaving every list in the app looking silently, permanently empty.
  useEffect(() => {
    db.auth.onSessionExpired?.(() => { setLoggedIn(false); setCurrentUserData(null); });
  }, []);

  if (authLoading) {
    return (
      <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0D1B2A,#1A3A52)",
        display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <img src={LOGO_B64} alt="Unitop" style={{ height:64, marginBottom:16, borderRadius:6 }}/>
          <div style={{ color:"rgba(255,255,255,0.5)", fontSize:13 }}>Loading…</div>
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <LoginScreen
        onSuccess={(user)=>{ setLoggedIn(true); setCurrentUserData(user); }}
      />
    );
  }

  // Render the main app, passing ledger panel openers
  return (
    <>
      <UnitopApp
        authUser={currentUserData}
        onUpdateAuthUser={(user)=>setCurrentUserData(user)}
        onOpenVendorLedger={(vendor, queries, payments) => setShowVendorLedger({vendor,queries,payments})}
        onOpenAgentLedger={(agent, queries, payments) => setShowAgentLedger({agent,queries,payments})}
      />
      {showVendorLedger && (
        <VendorLedgerPanel
          vendor={showVendorLedger.vendor}
          queries={showVendorLedger.queries}
          allPayments={showVendorLedger.payments}
          onClose={()=>setShowVendorLedger(null)}
        />
      )}
      {showAgentLedger && (
        <AgentLedgerPanel
          agent={showAgentLedger.agent}
          queries={showAgentLedger.queries}
          payments={showAgentLedger.payments}
          onClose={()=>setShowAgentLedger(null)}
        />
      )}
    </>
  );
}
