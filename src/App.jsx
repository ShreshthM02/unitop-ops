import { useState, useEffect } from 'react';
import { db } from './lib/supabase.js';
import { LOGO_B64 } from './lib/images.js';
import { LoginScreen, UnitopApp, VendorLedgerPanel, AgentLedgerPanel } from './components/index.js';

export default function App() {
  const [loggedIn, setLoggedIn]           = useState(false);
  const [demoMode, setDemoMode]           = useState(false);
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

  if (authLoading) {
    return (
      <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0D1B2A,#1A3A52)",
        display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <img src={LOGO_B64} alt="Unitop" style={{ height:64, marginBottom:16, filter:"brightness(0) invert(1)" }}/>
          <div style={{ color:"rgba(255,255,255,0.5)", fontSize:13 }}>Loading…</div>
        </div>
      </div>
    );
  }

  if (!loggedIn && !demoMode) {
    return (
      <LoginScreen
        onDemoMode={()=>setDemoMode(true)}
        onSuccess={(user)=>{ setLoggedIn(true); setCurrentUserData(user); }}
      />
    );
  }

  // Render the main app, passing ledger panel openers
  return (
    <>
      {demoMode && (
        <div style={{ position:"fixed", top:0, left:0, right:0, zIndex:1000,
          background:"#F59E0B", padding:"6px 16px", fontSize:11, fontWeight:600,
          color:"#1F2937", textAlign:"center", letterSpacing:"0.5px" }}>
          DEMO MODE — Data resets on refresh.{" "}
          <a href="#" style={{color:"#1F2937",textDecoration:"underline"}}
            onClick={e=>{e.preventDefault();setDemoMode(false);setLoggedIn(false);}}>
            Sign in with Supabase →
          </a>
        </div>
      )}
      <div style={demoMode?{paddingTop:30}:{}}>
        <UnitopApp
          authUser={currentUserData}
          onOpenVendorLedger={(vendor, queries, payments) => setShowVendorLedger({vendor,queries,payments})}
          onOpenAgentLedger={(agent, queries, payments) => setShowAgentLedger({agent,queries,payments})}
        />
      </div>
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
