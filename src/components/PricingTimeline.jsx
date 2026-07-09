import { useState, useEffect } from 'react';
import * as Lib from '../lib/index.js';
const { G, loadPricingTimeline, summarizeFinalPriceEntries, db } = Lib;

export default function PricingTimeline({ query, staff }) {
  const [timeline, setTimeline] = useState(null); // null = loading, [] = loaded but empty

  useEffect(() => {
    loadPricingTimeline(db, query.id, staff).then(setTimeline);
  }, [query.id]);

  const TYPE_META = {
    costsheet: { icon: "📊", label: "Cost Sheet", color: "#1A5276", bg: "#EBF5FB" },
    quotation: { icon: "📋", label: "Quotation",  color: "#6C3483", bg: "#F3E8FF" },
  };

  if (timeline === null) {
    return <div style={{textAlign:"center",padding:"32px 0",color:G.gray400,fontSize:12}}>Loading pricing history…</div>;
  }

  if (timeline.length === 0) {
    return (
      <div style={{textAlign:"center",padding:"32px 20px",color:G.gray400}}>
        <div style={{fontSize:28,marginBottom:8}}>💹</div>
        <div style={{fontSize:13,fontWeight:600,color:G.gray600}}>No pricing history yet</div>
        <div style={{fontSize:11,marginTop:6}}>Cost Sheet and Quotation versions will appear here, in order, once saved.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{background:"#EBF5FB",border:"1px solid #A9CCE3",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#1A5276",marginBottom:14}}>
        Every saved Cost Sheet and Quotation version for this tour file, in order — what was done, by whom, and why.
      </div>
      <div style={{position:"relative",paddingLeft:20}}>
        <div style={{position:"absolute",left:5,top:6,bottom:6,width:2,background:G.gray200}}/>
        {timeline.map((entry, i) => {
          const meta = TYPE_META[entry.type];
          return (
            <div key={i} style={{position:"relative",marginBottom:14}}>
              <div style={{position:"absolute",left:-20,top:2,width:12,height:12,borderRadius:"50%",background:entry.isFinal?"#059669":meta.color,border:"2px solid #fff",boxShadow:"0 0 0 1px "+G.gray200}}/>
              <div style={{background:G.white,border:`1px solid ${G.gray200}`,borderRadius:8,padding:"10px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:meta.bg,color:meta.color,fontWeight:700}}>{meta.icon} {meta.label} v{entry.version}</span>
                  {entry.isFinal && <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#DCFCE7",color:"#166534",fontWeight:700}}>★ Final</span>}
                  {entry.type==="quotation" && entry.costSheetId && <span style={{fontSize:10,color:G.gray400}}>linked to a Cost Sheet version</span>}
                  <span style={{fontSize:10,color:G.gray400,marginLeft:"auto"}}>{entry.createdAt ? new Date(entry.createdAt).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : ""}</span>
                </div>
                <div style={{fontSize:12,color:G.gray600}}>by <strong>{entry.by}</strong></div>
                {entry.type==="quotation" && entry.isFinal && entry.tourValue && (
                  <div style={{marginTop:6,fontSize:12,color:"#166534",background:"#DCFCE7",borderRadius:6,padding:"6px 10px",fontWeight:600}}>
                    ✓ Agreed: {summarizeFinalPriceEntries(entry.finalPriceEntries, "")} · {entry.confirmedPax} pax total · Tour Value {entry.tourValue}
                  </div>
                )}
                {entry.note && <div style={{marginTop:6,fontSize:12,color:G.gray800,background:G.gray50,borderRadius:6,padding:"6px 10px",borderLeft:`3px solid ${meta.color}`}}>{entry.note}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
