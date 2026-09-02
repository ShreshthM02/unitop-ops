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
