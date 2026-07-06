import { useState } from 'react';
import * as Lib from '../lib/index.js';
const { G } = Lib;

export default function FacilitatorMaster({ facilitators, setFacilitators, onSaveFacilitator, onClose }) {
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const filtered = facilitators.filter(f =>
    (showInactive || f.active !== false) &&
    (!search || f.name?.toLowerCase().includes(search.toLowerCase()) || f.areas?.toLowerCase().includes(search.toLowerCase()))
  );

  const saveEdit = () => {
    if (form.id) {
      setFacilitators(p => p.map(f => f.id === form.id ? form : f));
      setSelected(form);
      onSaveFacilitator?.(form);
    } else {
      const nf = { ...form, id: "FAC-" + String(facilitators.length + 1).padStart(3, "0"), active: true };
      setFacilitators(p => [...p, nf]);
      setSelected(nf);
      onSaveFacilitator?.(nf);
    }
    setEditing(false);
  };

  const inp = { padding:"7px 9px", border:`1px solid ${G.gray200}`, borderRadius:5, fontSize:12, fontFamily:"'Inter',sans-serif", width:"100%", outline:"none", color:G.gray800, background:G.white };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:G.white,width:820,height:"100vh",display:"flex",flexDirection:"column",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)"}}>
        <div style={{background:G.navy,padding:"14px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1}}>MASTER DATA</div>
            <div style={{fontSize:17,fontWeight:700,color:"#fff",fontFamily:"'Playfair Display',serif"}}>Tour Facilitators</div>
          </div>
          <button className="btn btn-primary" style={{fontSize:11}} onClick={()=>{setForm({name:"",phone:"",email:"",languages:"",areas:"",notes:""});setEditing(true);setSelected(null);}}>+ New Facilitator</button>
          <button onClick={onClose} className="btn btn-ghost" style={{background:"rgba(255,255,255,0.1)",color:"#fff",border:"none"}}>✕</button>
        </div>
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          <div style={{width:240,borderRight:`1px solid ${G.gray200}`,overflowY:"auto",flexShrink:0}}>
            <div style={{padding:"8px 12px",borderBottom:`1px solid ${G.gray200}`}}>
              <input style={{...inp,padding:"6px 9px",marginBottom:6}} placeholder="Search facilitators..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:G.gray600,cursor:"pointer"}}>
                <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)} style={{accentColor:G.accent}}/>
                Show inactive
              </label>
            </div>
            {filtered.map(f=>(
              <div key={f.id} onClick={()=>{setSelected(f);setEditing(false);}} style={{padding:"10px 12px",cursor:"pointer",background:selected?.id===f.id?"#EBF5FB":"transparent",borderLeft:`3px solid ${selected?.id===f.id?G.navy:"transparent"}`,opacity:f.active===false?0.5:1}}>
                <div style={{fontSize:13,fontWeight:selected?.id===f.id?600:400,color:selected?.id===f.id?G.navy:G.gray800}}>{f.name}{f.active===false?" (inactive)":""}</div>
                <div style={{fontSize:10,color:G.gray400,marginTop:1}}>{f.areas||"—"}</div>
              </div>
            ))}
            {filtered.length===0 && <div style={{padding:20,textAlign:"center",color:G.gray400,fontSize:12}}>No facilitators found.</div>}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column"}}>
            {editing ? (
              <div style={{flex:1,overflowY:"auto",padding:16}}>
                <div style={{fontSize:14,fontWeight:700,color:G.navy,marginBottom:14}}>{form.id?"Edit Facilitator":"New Facilitator"}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Name</div><input style={inp} value={form.name||""} onChange={e=>setF("name",e.target.value)}/></div>
                  {[["Phone","phone"],["Email","email"]].map(([l,k])=><div key={k}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>{l}</div><input style={inp} value={form[k]||""} onChange={e=>setF(k,e.target.value)}/></div>)}
                  <div><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Languages</div><input style={inp} value={form.languages||""} onChange={e=>setF("languages",e.target.value)} placeholder="e.g. English, Thai"/></div>
                  <div><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Areas / Cities Covered</div><input style={inp} value={form.areas||""} onChange={e=>setF("areas",e.target.value)} placeholder="e.g. Bodhgaya, Rajgir"/></div>
                  <div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.gray600,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:3}}>Notes</div><textarea style={{...inp,minHeight:52,resize:"vertical"}} value={form.notes||""} onChange={e=>setF("notes",e.target.value)}/></div>
                  {form.id && <div style={{gridColumn:"1/-1"}}>
                    <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:G.gray600,cursor:"pointer"}}>
                      <input type="checkbox" checked={form.active!==false} onChange={e=>setF("active",e.target.checked)} style={{accentColor:G.accent}}/>
                      Active (available to select in Tour Briefing Sheet)
                    </label>
                  </div>}
                </div>
                <div style={{display:"flex",gap:10}}><button className="btn btn-ghost" onClick={()=>setEditing(false)}>Cancel</button><button className="btn btn-primary" onClick={saveEdit}>Save Facilitator</button></div>
              </div>
            ) : selected ? (
              <div style={{flex:1,overflowY:"auto",padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                  <div style={{background:G.gray50,borderRadius:10,padding:"14px 16px",flex:1}}>
                    <div style={{fontSize:18,fontWeight:700,fontFamily:"'Playfair Display',serif",color:G.navy}}>{selected.name}</div>
                    <div style={{fontSize:12,color:G.accent,fontWeight:500,marginTop:2}}>{selected.areas||"No areas set"}</div>
                  </div>
                  <button className="btn btn-ghost" style={{fontSize:11,marginLeft:12}} onClick={()=>{setForm({...selected});setEditing(true);}}>✏ Edit</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[["Phone",selected.phone],["Email",selected.email],["Languages",selected.languages],["Status",selected.active===false?"Inactive":"Active"]].map(([l,v])=>(
                    <div key={l}><div style={{fontSize:10,color:G.gray400,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{l}</div><div style={{fontSize:12,fontWeight:500}}>{v||"—"}</div></div>
                  ))}
                </div>
                {selected.notes && <div style={{marginTop:12,background:G.gray50,borderRadius:6,padding:"8px 10px",fontSize:12,color:G.gray600,borderLeft:`3px solid ${G.accent}`}}>{selected.notes}</div>}
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,color:G.gray400}}>
                <div style={{fontSize:24,marginBottom:8}}>🧭</div>
                <div style={{fontSize:13}}>Select a facilitator</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
