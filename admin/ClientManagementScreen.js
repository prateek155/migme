import { useState, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════
   FIREBASE — DIRECT FIRESTORE ACCESS (no backend API for this screen)
   ─────────────────────────────────────────────────────────────
   ⚠️ Why this changed from the backend-API version:
   The old version called Api.getClients() etc. → your Express backend
   on Railway → Firestore Admin SDK. That added a network hop through
   a custom domain (docket-backend.up.railway.app), which meant every
   read/write here was exposed to Railway DNS hiccups, CORS config,
   and backend uptime — none of which have anything to do with this
   screen's actual job (CRUD on two Firestore collections).

   This version talks to Firestore directly from the browser using the
   Firebase client SDK. Firestore's own infra handles resolution/CORS,
   so those failure classes disappear for this screen. Security moves
   from the backend's `x-admin-key` header check to Firestore Security
   Rules — see the REQUIRED RULES comment below. This is safe ONLY
   because this app already has Firebase Auth login; without auth,
   client-side Firestore access would need to be public, which you do
   NOT want for billing data.

   REQUIRED Firestore Security Rules (add/merge into firestore.rules):

     match /billing_clients/{clientId} {
       allow read, write: if request.auth != null;
     }
     match /billing_payments/{paymentId} {
       allow read, write: if request.auth != null;
     }

   (Tighten further with request.auth.token.admin == true + a custom
   claim if you want to restrict this to specific admin users only,
   rather than any authenticated user.)
═══════════════════════════════════════════════════════════════ */
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// getApps()/getApp() guard — other screens (e.g. AddClientScreen.jsx)
// already call initializeApp() with this same config. Calling it again
// with the default app name throws "Firebase App named '[DEFAULT]'
// already exists" — this pattern is safe regardless of import order.
const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const CLIENTS_COL = "billing_clients";
const PAYMENTS_COL = "billing_payments";

const Api = {
  getClients: async () => {
    const snap = await getDocs(collection(db, CLIENTS_COL));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  createClient: async (payload) => {
    const docRef = await addDoc(collection(db, CLIENTS_COL), {
      clientName: (payload.clientName || "").trim(),
      restaurantName: (payload.restaurantName || "").trim(),
      phone: (payload.phone || "").trim(),
      email: (payload.email || "").trim().toLowerCase(),
      state: payload.state,
      city: payload.city,
      startDate: payload.startDate,
      priceType: payload.priceType,
      amount: Number(payload.amount),
      notes: payload.notes || "",
      gst: payload.gst || "",
      active: true,
      createdAt: new Date().toISOString(),
    });
    const saved = await getDoc(docRef);
    return { id: docRef.id, ...saved.data() };
  },

  updateClient: async (id, payload) => {
    const ref = doc(db, CLIENTS_COL, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Client not found");
    await updateDoc(ref, {
      clientName: (payload.clientName || "").trim(),
      restaurantName: (payload.restaurantName || "").trim(),
      phone: (payload.phone || "").trim(),
      email: (payload.email || "").trim().toLowerCase(),
      state: payload.state,
      city: payload.city,
      startDate: payload.startDate,
      priceType: payload.priceType,
      amount: Number(payload.amount),
      notes: payload.notes || "",
      gst: payload.gst || "",
      updatedAt: new Date().toISOString(),
    });
    const updated = await getDoc(ref);
    return { id, ...updated.data() };
  },

  toggleClient: async (id) => {
    const ref = doc(db, CLIENTS_COL, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Client not found");
    const newActive = !snap.data().active;
    await updateDoc(ref, { active: newActive, updatedAt: new Date().toISOString() });
    return { id, active: newActive };
  },

  deleteClient: async (id) => {
    const ref = doc(db, CLIENTS_COL, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Client not found");
    await deleteDoc(ref);

    // cascade-delete this client's payments, same as the old backend did
    const paySnap = await getDocs(
      query(collection(db, PAYMENTS_COL), where("clientId", "==", id)),
    );
    let deletedPayments = 0;
    if (!paySnap.empty) {
      const batch = writeBatch(db);
      paySnap.forEach((d) => {
        batch.delete(d.ref);
        deletedPayments++;
      });
      await batch.commit();
    }
    return { deleted: id, deletedPayments };
  },

  getPayments: async () => {
    const snap = await getDocs(collection(db, PAYMENTS_COL));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  createPayment: async (payload) => {
    const { clientId, amount, date, note, mode } = payload;
    if (!clientId || !amount || Number(amount) <= 0 || !date) {
      throw new Error("Missing required fields: clientId, amount, date");
    }
    const clientRef = doc(db, CLIENTS_COL, clientId);
    const clientSnap = await getDoc(clientRef);
    if (!clientSnap.exists()) throw new Error("Client not found");

    const docRef = await addDoc(collection(db, PAYMENTS_COL), {
      clientId,
      amount: Number(amount),
      date,
      note: note || "",
      mode: mode || "cash",
      createdAt: new Date().toISOString(),
    });
    const saved = await getDoc(docRef);
    return { id: docRef.id, ...saved.data() };
  },
};

/* ─── TABLER ICONS (CDN) ────────────────────────────────────── */
const IconsLoader = () => (
  <link rel="stylesheet"
    href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/3.19.0/fonts/tabler-icons.min.css" />
);

/* ─── DATA ──────────────────────────────────────────────────── */
const STATES_CITIES = {
  "Rajasthan":     ["Jaipur","Jodhpur","Udaipur","Kota","Ajmer","Bikaner","Sikar","Alwar"],
  "Maharashtra":   ["Mumbai","Pune","Nagpur","Nashik","Aurangabad","Thane","Navi Mumbai"],
  "Delhi":         ["New Delhi","Dwarka","Rohini","Janakpuri","Saket","Lajpat Nagar"],
  "Gujarat":       ["Ahmedabad","Surat","Vadodara","Rajkot","Gandhinagar","Bhavnagar"],
  "Karnataka":     ["Bengaluru","Mysuru","Hubli","Mangaluru","Belagavi","Tumkur"],
  "Tamil Nadu":    ["Chennai","Coimbatore","Madurai","Salem","Trichy","Tirunelveli"],
  "Uttar Pradesh": ["Lucknow","Kanpur","Agra","Varanasi","Noida","Ghaziabad","Meerut"],
  "Haryana":       ["Gurugram","Faridabad","Hisar","Panipat","Ambala","Rohtak"],
  "Punjab":        ["Amritsar","Ludhiana","Jalandhar","Patiala","Mohali"],
  "Madhya Pradesh":["Bhopal","Indore","Gwalior","Jabalpur","Ujjain"],
};
const PRICING = {
  "Rajasthan":     { monthly:3000,  yearly:30000 },
  "Maharashtra":   { monthly:4000,  yearly:40000 },
  "Delhi":         { monthly:5000,  yearly:50000 },
  "Gujarat":       { monthly:3500,  yearly:35000 },
  "Karnataka":     { monthly:4500,  yearly:45000 },
  "Tamil Nadu":    { monthly:3800,  yearly:38000 },
  "Uttar Pradesh": { monthly:2800,  yearly:28000 },
  "Haryana":       { monthly:4200,  yearly:42000 },
  "Punjab":        { monthly:3600,  yearly:36000 },
  "Madhya Pradesh":{ monthly:3200,  yearly:32000 },
};
const fmt      = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const todayStr = () => new Date().toISOString().slice(0,10);
const MODEICON = { cash:"ti-cash", online:"ti-device-mobile", bank:"ti-building-bank", cheque:"ti-file-invoice" };

/* ─── DARK THEME TOKENS ─────────────────────────────────────── */
const T = {
  bg:          "#0d0f18",
  surface:     "#161a26",
  card:        "#1b1f2e",
  cardHov:     "#1f2438",
  border:      "#252b3f",
  borderHov:   "#384060",
  accent:      "#6c63ff",
  accentHov:   "#7d75ff",
  accentDim:   "rgba(108,99,255,0.13)",
  green:       "#22c55e",
  greenDim:    "rgba(34,197,94,0.11)",
  amber:       "#f59e0b",
  amberDim:    "rgba(245,158,11,0.11)",
  red:         "#ef4444",
  redDim:      "rgba(239,68,68,0.11)",
  blue:        "#3b82f6",
  blueDim:     "rgba(59,130,246,0.11)",
  t1:          "#f1f5f9",
  t2:          "#94a3b8",
  t3:          "#4a5568",
};

/* ═══════════════════════════════════════════════════════════════
   ⚠️ IMPORTANT: every component below lives at MODULE scope
   (outside App). That is the actual fix for the "cursor jumps to
   first field on every keystroke" bug — these were previously
   declared INSIDE the App() function body, so every re-render
   (which happens on every keystroke via setState) created a brand
   new function/component identity. React then treated <ClientForm/>,
   <Inp/>, etc. as a totally different component type on each render
   and unmounted + remounted the whole subtree — which kills focus
   on any <input> inside it. Keeping them here means their identity
   never changes across renders, so React just updates props in place.
═══════════════════════════════════════════════════════════════ */

const Sk = ({ w="100%", h=14, r=6 }) => (
  <div style={{ width:w, height:h, borderRadius:r, background:T.card,
    position:"relative", overflow:"hidden", flexShrink:0 }}>
    <div style={{ position:"absolute", inset:0,
      background:`linear-gradient(90deg,transparent,${T.cardHov},transparent)`,
      animation:"sk 1.6s ease infinite" }} />
  </div>
);

const Badge = ({ status }) => {
  const MAP = {
    paid:    [T.greenDim, T.green, "Paid"    ],
    partial: [T.amberDim, T.amber, "Partial" ],
    pending: [T.redDim,   T.red,   "Pending" ],
    overdue: [T.redDim,   T.red,   "Overdue" ],
    inactive:["rgba(70,70,90,0.2)", T.t3, "Inactive"],
  };
  const [bg,col,label] = MAP[status] || MAP.pending;
  return (
    <span style={{ background:bg, color:col, fontSize:11, fontWeight:700,
      padding:"3px 10px", borderRadius:20, letterSpacing:"0.4px", whiteSpace:"nowrap" }}>
      {label}
    </span>
  );
};

const Btn = ({ children, onClick, variant="ghost", full=false, small=false,
               danger=false, disabled=false, sx={} }) => {
  const [hov, setHov] = useState(false);
  const v = danger ? "danger" : variant;
  const VSTYLE = {
    primary:{ background:hov&&!disabled?T.accentHov:T.accent, color:"#fff" },
    ghost:  { background:hov&&!disabled?T.card:"transparent", color:T.t2, border:`1px solid ${T.border}` },
    danger: { background:hov&&!disabled?"#c81e1e":T.red, color:"#fff" },
    subtle: { background:hov&&!disabled?T.cardHov:T.card, color:T.t2, border:`1px solid ${T.border}` },
  };
  return (
    <button
      onClick={disabled?undefined:onClick}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{
        display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6,
        cursor:disabled?"not-allowed":"pointer", border:"none", borderRadius:9,
        fontFamily:"inherit", fontWeight:500, fontSize:small?13:14,
        padding:small?"7px 13px":"10px 18px",
        width:full?"100%":undefined, opacity:disabled?0.5:1,
        transition:"all 0.14s", outline:"none",
        ...(VSTYLE[v]||VSTYLE.ghost), ...sx,
      }}>
      {children}
    </button>
  );
};

const Field = ({ label, error, hint, children }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
    <label style={{ fontSize:11, fontWeight:700, color:T.t3,
      letterSpacing:"0.6px", textTransform:"uppercase" }}>
      {label}
    </label>
    {children}
    {hint && !error && <span style={{ fontSize:11, color:T.t3 }}>{hint}</span>}
    {error && (
      <span style={{ fontSize:11, color:T.red, display:"flex", alignItems:"center", gap:3 }}>
        <i className="ti ti-alert-circle" style={{ fontSize:12 }} />{error}
      </span>
    )}
  </div>
);

const iSx = (err=false) => ({
  background:"rgba(8,10,18,0.7)", border:`1.5px solid ${err?T.red:T.border}`,
  borderRadius:8, padding:"10px 12px", fontSize:14, color:T.t1, width:"100%",
  outline:"none", fontFamily:"inherit", transition:"border-color 0.14s",
  boxSizing:"border-box",
});

const Inp = ({ value, onChange, placeholder, type="text", err=false, autoFocus=false, rows }) => {
  const shared = {
    style: { ...iSx(err), ...(rows ? { resize:"vertical", lineHeight:1.7 } : {}) },
    onFocus: e=>{ e.target.style.borderColor = err?T.red:T.accent; },
    onBlur:  e=>{ e.target.style.borderColor = err?T.red:T.border; },
  };
  if (rows) return (
    <textarea value={value} onChange={e=>onChange(e.target.value)}
      placeholder={placeholder} rows={rows} {...shared} />
  );
  return (
    <input value={value} onChange={e=>onChange(e.target.value)}
      placeholder={placeholder} type={type} autoFocus={autoFocus} {...shared} />
  );
};

const Sel = ({ value, onChange, options, placeholder, err=false }) => (
  <select value={value} onChange={e=>onChange(e.target.value)}
    style={{ ...iSx(err), appearance:"none", cursor:"pointer", paddingRight:36,
      backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
      backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center",
    }}
    onFocus={e=>{ e.target.style.borderColor = err?T.red:T.accent; }}
    onBlur={e=>{  e.target.style.borderColor = err?T.red:T.border; }}>
    {placeholder && <option value="">{placeholder}</option>}
    {options.map(o => typeof o==="string"
      ? <option key={o} value={o}>{o}</option>
      : <option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
);

const Prog = ({ pct }) => {
  const col = pct===100?T.green:pct>60?T.blue:pct>0?T.amber:T.red;
  return (
    <div style={{ background:T.border, borderRadius:20, height:6, overflow:"hidden" }}>
      <div style={{ width:`${pct}%`, height:"100%", background:col,
        borderRadius:20, transition:"width 0.6s ease" }} />
    </div>
  );
};

const Stat = ({ icon, label, value, sub, col=T.accent }) => (
  <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:"16px" }}>
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
      <div style={{ width:34, height:34, borderRadius:9, background:`${col}20`,
        display:"flex", alignItems:"center", justifyContent:"center" }}>
        <i className={`ti ${icon}`} style={{ fontSize:17, color:col }} />
      </div>
      <span style={{ fontSize:12, color:T.t2, fontWeight:500 }}>{label}</span>
    </div>
    <div style={{ fontSize:21, fontWeight:800, color:T.t1, lineHeight:1 }}>{value}</div>
    {sub && <div style={{ fontSize:11, color:T.t3, marginTop:5 }}>{sub}</div>}
  </div>
);

/* ─── DRAWER ─────────────────────────────────────────────────── */
const Drawer = ({ open, onClose, title, subtitle, children, width=490 }) => {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex" }}>
      <div style={{ flex:1, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(3px)" }}
        onClick={onClose} />
      <div style={{ width:`min(${width}px,100vw)`, background:T.surface,
        borderLeft:`1px solid ${T.border}`, display:"flex", flexDirection:"column",
        height:"100%", animation:"slideIn 0.22s cubic-bezier(.22,.9,.36,1)" }}>
        <div style={{ padding:"18px 22px 14px", borderBottom:`1px solid ${T.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexShrink:0 }}>
          <div>
            {title    && <div style={{ fontSize:17, fontWeight:700, color:T.t1 }}>{title}</div>}
            {subtitle && <div style={{ fontSize:13, color:T.t2, marginTop:3 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer",
            color:T.t2, fontSize:22, lineHeight:1, padding:"0 2px", marginLeft:16,
            display:"flex", alignItems:"center" }}>
            <i className="ti ti-x" />
          </button>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"22px 22px 48px" }}>
          {children}
        </div>
      </div>
    </div>
  );
};

/* ─── CONFIRM ────────────────────────────────────────────────── */
const Confirm = ({ open, msg, onYes, onNo, busy=false }) => {
  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, zIndex:400,
      display:"flex", alignItems:"center", justifyContent:"center",
      background:"rgba(0,0,0,0.72)", backdropFilter:"blur(4px)", padding:16 }}>
      <div style={{ background:T.surface, border:`1px solid ${T.border}`,
        borderRadius:16, padding:"24px 26px", maxWidth:360, width:"100%" }}>
        <div style={{ fontSize:15, color:T.t1, lineHeight:1.65, marginBottom:22 }}>{msg}</div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <Btn onClick={onNo} disabled={busy}>Cancel</Btn>
          <Btn danger onClick={onYes} disabled={busy}><i className="ti ti-trash" />Delete</Btn>
        </div>
      </div>
    </div>
  );
};

/* ─── TOAST ──────────────────────────────────────────────────── */
const Toast = ({ msg, type="success", onHide }) => {
  useEffect(() => { const t = setTimeout(onHide, 2600); return ()=>clearTimeout(t); }, []);
  const COL = { success:T.green, error:T.red, info:T.blue };
  const ICO = { success:"ti-circle-check", error:"ti-circle-x", info:"ti-info-circle" };
  const col = COL[type]||T.green;
  return (
    <div style={{ position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)",
      background:T.surface, border:`1px solid ${col}40`, borderRadius:12,
      padding:"12px 20px", display:"flex", alignItems:"center", gap:10,
      zIndex:500, boxShadow:"0 8px 32px rgba(0,0,0,0.55)",
      animation:"fadeUp 0.25s ease", whiteSpace:"nowrap" }}>
      <i className={`ti ${ICO[type]||ICO.success}`} style={{ color:col, fontSize:18 }} />
      <span style={{ fontSize:14, color:T.t1 }}>{msg}</span>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   CLIENT FORM — hoisted out, takes everything via props
═══════════════════════════════════════════════════════════════ */
const ClientForm = ({ form, formErr, setF, stateOpts, cityOpts, editMode, saving, onCancel, onSubmit }) => (
  <div style={{display:"flex",flexDirection:"column",gap:18}}>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>
      <Field label="Client name" error={formErr.clientName}>
        <Inp value={form.clientName} onChange={v=>setF("clientName",v)}
          placeholder="Full name" err={!!formErr.clientName} autoFocus />
      </Field>
      <Field label="Restaurant / Business name" error={formErr.restaurantName}>
        <Inp value={form.restaurantName} onChange={v=>setF("restaurantName",v)}
          placeholder="Restaurant name" err={!!formErr.restaurantName} />
      </Field>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>
      <Field label="Phone number" error={formErr.phone}>
        <Inp value={form.phone} onChange={v=>setF("phone",v)}
          placeholder="10-digit mobile" type="tel" err={!!formErr.phone} />
      </Field>
      <Field label="Email (optional)" error={formErr.email}>
        <Inp value={form.email} onChange={v=>setF("email",v)}
          placeholder="email@example.com" type="email" err={!!formErr.email} />
      </Field>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>
      <Field label="State" error={formErr.state}>
        <Sel value={form.state} onChange={v=>setF("state",v)}
          options={stateOpts} placeholder="Select state" err={!!formErr.state} />
      </Field>
      <Field label="City" error={formErr.city}>
        <Sel value={form.city} onChange={v=>setF("city",v)}
          options={cityOpts}
          placeholder={form.state?"Select city":"Select state first"}
          err={!!formErr.city} />
      </Field>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}>
      <Field label="Start date" error={formErr.startDate}>
        <Inp value={form.startDate} onChange={v=>setF("startDate",v)} type="date" err={!!formErr.startDate} />
      </Field>
      <Field label="GST number (optional)">
        <Inp value={form.gst} onChange={v=>setF("gst",v)} placeholder="27AABCM1234Z1Z5" />
      </Field>
    </div>

    <Field label="Package type">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {["monthly","yearly"].map(t=>{
          const sel=form.priceType===t;
          const price=form.state&&PRICING[form.state]?fmt(PRICING[form.state][t]):"—";
          return (
            <button key={t} onClick={()=>setF("priceType",t)} style={{
              padding:"13px 10px",borderRadius:10,
              border:`2px solid ${sel?T.accent:T.border}`,
              background:sel?T.accentDim:T.card,
              cursor:"pointer",textAlign:"center",
              transition:"all 0.14s",fontFamily:"inherit",
            }}>
              <div style={{fontSize:14,fontWeight:700,textTransform:"capitalize",color:sel?T.accent:T.t1}}>{t}</div>
              <div style={{fontSize:11,marginTop:4,color:sel?T.accent:T.t3}}>Suggested: {price}</div>
            </button>
          );
        })}
      </div>
    </Field>

    <Field label="Amount (₹)" error={formErr.amount}
      hint={form.state&&PRICING[form.state]
        ?`Region default: ${fmt(PRICING[form.state][form.priceType])}`:undefined}>
      <Inp value={form.amount} onChange={v=>setF("amount",v)}
        placeholder="Custom amount" type="number" err={!!formErr.amount} />
    </Field>

    <Field label="Notes (optional)">
      <Inp value={form.notes} onChange={v=>setF("notes",v)}
        placeholder="Any special instructions…" rows={2} />
    </Field>

    <div style={{display:"flex",gap:10,paddingTop:6}}>
      <Btn sx={{flex:1}} onClick={onCancel} disabled={saving}>
        Cancel
      </Btn>
      <Btn variant="primary" sx={{flex:2}} onClick={onSubmit} disabled={saving}>
        <i className={`ti ${saving?"ti-loader-2":editMode?"ti-check":"ti-user-plus"}`} />
        {saving ? "Saving…" : editMode ? "Save changes" : "Add client"}
      </Btn>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   PAYMENT FORM
═══════════════════════════════════════════════════════════════ */
const PaymentForm = ({ payForm, setPayForm, clients, getBalance, saving, onCancel, onSubmit }) => {
  const cl  = clients.find(c=>c.id===payForm.clientId);
  const bal = cl ? getBalance(cl) : null;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>

      <Field label="Client">
        <Sel value={payForm.clientId}
          onChange={v=>setPayForm(f=>({...f,clientId:v}))}
          options={clients.filter(c=>c.active).map(c=>({
            v:c.id, l:`${c.restaurantName} — due ${fmt(getBalance(c).remaining)}`
          }))}
          placeholder="Select client" />
      </Field>

      {bal && (
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:11,padding:"14px 16px",display:"flex",flexDirection:"column",gap:0}}>
          {[["Total package",fmt(bal.due),T.t1],["Already paid",fmt(bal.paid),T.green],["Outstanding",fmt(bal.remaining),bal.remaining>0?T.red:T.green]].map(([l,v,col],i,arr)=>(
            <div key={l}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 0"}}>
                <span style={{color:T.t2}}>{l}</span>
                <span style={{color:col,fontWeight:700}}>{v}</span>
              </div>
              {i<arr.length-1&&<div style={{height:1,background:T.border}}/>}
            </div>
          ))}
          <div style={{marginTop:12}}>
            <Prog pct={Math.min(100,Math.round((bal.paid/bal.due)*100))} />
          </div>
          {bal.remaining>0&&(
            <Btn small sx={{marginTop:10,width:"100%"}}
              onClick={()=>setPayForm(f=>({...f,amount:bal.remaining}))}>
              <i className="ti ti-bolt" />Fill full outstanding amount
            </Btn>
          )}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14}}>
        <Field label="Amount (₹)">
          <Inp value={payForm.amount} onChange={v=>setPayForm(f=>({...f,amount:v}))}
            placeholder="Enter amount" type="number" />
        </Field>
        <Field label="Payment date">
          <Inp value={payForm.date} onChange={v=>setPayForm(f=>({...f,date:v}))} type="date" />
        </Field>
      </div>

      <Field label="Payment mode">
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {[["cash","ti-cash"],["online","ti-device-mobile"],["bank","ti-building-bank"],["cheque","ti-file-invoice"]].map(([m,ic])=>{
            const sel=payForm.mode===m;
            return (
              <button key={m} onClick={()=>setPayForm(f=>({...f,mode:m}))} style={{
                padding:"10px 6px",borderRadius:9,cursor:"pointer",
                border:`1.5px solid ${sel?T.accent:T.border}`,
                background:sel?T.accentDim:T.card,
                display:"flex",flexDirection:"column",alignItems:"center",gap:5,
                fontFamily:"inherit",transition:"all 0.14s",
              }}>
                <i className={`ti ${ic}`} style={{fontSize:18,color:sel?T.accent:T.t2}} />
                <span style={{fontSize:10,fontWeight:700,textTransform:"capitalize",color:sel?T.accent:T.t3}}>{m}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Note (optional)">
        <Inp value={payForm.note} onChange={v=>setPayForm(f=>({...f,note:v}))}
          placeholder="e.g. June 1st installment" />
      </Field>

      <div style={{display:"flex",gap:10}}>
        <Btn sx={{flex:1}} onClick={onCancel} disabled={saving}>Cancel</Btn>
        <Btn variant="primary" sx={{flex:2}} onClick={onSubmit} disabled={saving}>
          <i className="ti ti-circle-check" />{saving ? "Saving…" : "Save payment"}
        </Btn>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   CLIENT DETAIL PANEL
═══════════════════════════════════════════════════════════════ */
const DetailPanel = ({ c, getPays, getBalance, getStatus, onAddPayment, onEdit, onToggleActive, onDeleteRequest }) => {
  if (!c) return null;
  const pays    = getPays(c.id).sort((a,b)=>b.date.localeCompare(a.date));
  const {paid,due,remaining} = getBalance(c);
  const pct     = due > 0 ? Math.min(100,Math.round((paid/due)*100)) : 0;
  const status  = getStatus(c);
  const initials= (c.clientName||"").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:54,height:54,borderRadius:16,background:T.accentDim,
          border:`1.5px solid ${T.accent}40`,display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:20,fontWeight:800,color:T.accent,flexShrink:0}}>
          {initials}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:18,fontWeight:700,color:T.t1,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.restaurantName}</div>
          <div style={{fontSize:13,color:T.t2,marginTop:2}}>{c.clientName}</div>
        </div>
        <Badge status={status} />
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {[
          ["ti-map-pin",    `${c.city}, ${c.state}`],
          ["ti-phone",      c.phone],
          ["ti-calendar",   `Since ${c.startDate}`],
          ["ti-coin-rupee", `${fmt(c.amount)} / ${c.priceType==="monthly"?"mo":"yr"}`],
        ].map(([ic,txt])=>(
          <span key={txt} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,
            color:T.t2,background:T.card,border:`1px solid ${T.border}`,
            padding:"4px 10px",borderRadius:20}}>
            <i className={`ti ${ic}`} style={{fontSize:12}} />{txt}
          </span>
        ))}
        {c.email&&(
          <span style={{display:"flex",alignItems:"center",gap:5,fontSize:12,
            color:T.t2,background:T.card,border:`1px solid ${T.border}`,
            padding:"4px 10px",borderRadius:20}}>
            <i className="ti ti-mail" style={{fontSize:12}} />{c.email}
          </span>
        )}
        {c.gst&&(
          <span style={{display:"flex",alignItems:"center",gap:5,fontSize:12,
            color:T.t2,background:T.card,border:`1px solid ${T.border}`,
            padding:"4px 10px",borderRadius:20}}>
            <i className="ti ti-id" style={{fontSize:12}} />{c.gst}
          </span>
        )}
      </div>

      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:13,padding:"16px 18px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr auto 1fr",gap:0,marginBottom:14}}>
          {[["PACKAGE",fmt(due),T.t1,false],["DIV",null,null,true],["PAID",fmt(paid),T.green,false],["DIV2",null,null,true],["DUE",fmt(remaining),remaining>0?T.red:T.green,false]].map((x,i)=>(
            x[3]
              ? <div key={i} style={{background:T.border,width:1,margin:"0 8px"}} />
              : (
                <div key={i} style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:T.t3,fontWeight:700,letterSpacing:"0.5px",marginBottom:6}}>{x[0]}</div>
                  <div style={{fontSize:16,fontWeight:800,color:x[2]}}>{x[1]}</div>
                </div>
              )
          ))}
        </div>
        <Prog pct={pct} />
        <div style={{fontSize:11,color:T.t3,textAlign:"right",marginTop:6}}>{pct}% collected</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <Btn small onClick={()=>onAddPayment(c)}>
          <i className="ti ti-plus" />Payment
        </Btn>
        <Btn small onClick={()=>onEdit(c)}>
          <i className="ti ti-edit" />Edit
        </Btn>
        <Btn small onClick={()=>onToggleActive(c)}>
          <i className={`ti ${c.active?"ti-ban":"ti-check"}`} />
          {c.active?"Deactivate":"Activate"}
        </Btn>
      </div>

      {c.notes&&(
        <div style={{background:T.amberDim,border:`1px solid ${T.amber}30`,
          borderRadius:10,padding:"11px 14px",fontSize:13,color:T.amber,
          display:"flex",gap:8,alignItems:"flex-start"}}>
          <i className="ti ti-notes" style={{flexShrink:0,marginTop:1}} />{c.notes}
        </div>
      )}

      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:14,fontWeight:700,color:T.t1}}>Payment history</span>
          <span style={{fontSize:12,color:T.t3}}>{pays.length} transaction{pays.length!==1?"s":""}</span>
        </div>
        {pays.length===0?(
          <div style={{textAlign:"center",padding:"2rem",color:T.t3,
            background:T.card,border:`1px dashed ${T.border}`,borderRadius:10}}>
            <i className="ti ti-receipt-off" style={{fontSize:30,display:"block",marginBottom:10}} />
            No payments yet
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {pays.map(p=>(
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",padding:"12px 14px",
                background:T.card,border:`1px solid ${T.border}`,borderRadius:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:34,height:34,borderRadius:8,background:T.greenDim,
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <i className={`ti ${MODEICON[p.mode]||"ti-cash"}`} style={{fontSize:16,color:T.green}} />
                  </div>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:T.green}}>{fmt(p.amount)}</div>
                    <div style={{fontSize:11,color:T.t3,marginTop:1}}>{p.note||"—"} · {p.mode||"cash"}</div>
                  </div>
                </div>
                <div style={{fontSize:12,color:T.t2}}>{p.date}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:16}}>
        <Btn danger full onClick={()=>onDeleteRequest(c.id)}>
          <i className="ti ti-trash" />Delete client permanently
        </Btn>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════════ */
const Dashboard = ({
  loading, activeList, clients, payments,
  totalCollected, totalDue, monthlyMRR, yearlyARR,
  paidCnt, partialCnt, pendingCnt, stateBreakdown,
  onStatusFilter, onStateFilter, onViewAllPayments,
}) => (
  <div style={{display:"flex",flexDirection:"column",gap:20}}>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12}}>
      {loading?[1,2,3,4].map(i=>(
        <div key={i} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:16,display:"flex",flexDirection:"column",gap:10}}>
          <Sk w="50%" h={12}/><Sk w="70%" h={24}/><Sk w="40%" h={11}/>
        </div>
      )):<>
        <Stat icon="ti-users"            label="Active clients"  value={activeList.length}  sub={`${clients.filter(c=>!c.active).length} inactive`}                  col={T.accent} />
        <Stat icon="ti-coin-rupee"       label="Total collected" value={fmt(totalCollected)} sub="all time"                                                           col={T.green}  />
        <Stat icon="ti-clock-exclamation"label="Outstanding"     value={fmt(totalDue)}       sub="to collect"                                                         col={T.red}    />
        <Stat icon="ti-chart-bar"        label="Monthly MRR"     value={fmt(monthlyMRR)}     sub={`+${fmt(Math.round(yearlyARR/12))} from yearly`}                   col={T.blue}   />
      </>}
    </div>

    {!loading&&<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {[["Paid",paidCnt,T.green,"ti-circle-check"],["Partial",partialCnt,T.amber,"ti-circle-half-2"],["Pending",pendingCnt,T.red,"ti-circle-x"]].map(([l,v,col,ic])=>(
          <div key={l} onClick={()=>onStatusFilter(l.toLowerCase())}
            style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,
              padding:"14px 16px",cursor:"pointer",transition:"border-color 0.14s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=col}
            onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:T.t2}}>{l}</span>
              <i className={`ti ${ic}`} style={{color:col,fontSize:16}} />
            </div>
            <div style={{fontSize:28,fontWeight:800,color:col,marginTop:6}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:14,fontWeight:700,color:T.t1}}>State-wise breakdown</span>
          <i className="ti ti-map" style={{color:T.t3,fontSize:16}} />
        </div>
        {stateBreakdown.length===0?(
          <div style={{padding:"2rem",textAlign:"center",color:T.t3,fontSize:13}}>No data yet</div>
        ):stateBreakdown.map(([state,d])=>(
          <div key={state} onClick={()=>onStateFilter(state)}
            style={{padding:"13px 18px",borderBottom:`1px solid ${T.border}`,
              display:"flex",justifyContent:"space-between",alignItems:"center",
              flexWrap:"wrap",gap:8,cursor:"pointer",transition:"background 0.14s"}}
            onMouseEnter={e=>e.currentTarget.style.background=T.cardHov}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:T.t1}}>{state}</div>
              <div style={{fontSize:12,color:T.t3,marginTop:2}}>{d.count} client{d.count!==1?"s":""}</div>
            </div>
            <div style={{display:"flex",gap:14,fontSize:13,flexWrap:"wrap"}}>
              <span style={{color:T.green}}>Collected {fmt(d.collected)}</span>
              {d.due>0&&<span style={{color:T.red}}>Due {fmt(d.due)}</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:14,fontWeight:700,color:T.t1}}>Recent transactions</span>
          <button onClick={onViewAllPayments} style={{background:"none",border:"none",
            cursor:"pointer",fontSize:12,color:T.accent,fontFamily:"inherit"}}>View all →</button>
        </div>
        {[...payments].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(p=>{
          const cl=clients.find(c=>c.id===p.clientId);
          if(!cl)return null;
          return (
            <div key={p.id} style={{padding:"12px 18px",borderBottom:`1px solid ${T.border}`,
              display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:8,background:T.greenDim,
                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <i className={`ti ${MODEICON[p.mode]||"ti-cash"}`} style={{fontSize:15,color:T.green}} />
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:T.t1}}>{cl.restaurantName}</div>
                  <div style={{fontSize:11,color:T.t3}}>{p.note||"—"} · {p.date}</div>
                </div>
              </div>
              <div style={{fontSize:14,fontWeight:800,color:T.green,flexShrink:0}}>{fmt(p.amount)}</div>
            </div>
          );
        })}
      </div>
    </>}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   CLIENTS TAB
═══════════════════════════════════════════════════════════════ */
const ClientsTab = ({
  loading, filteredClients, searchQ, setSearch,
  fState, setFState, fCity, setFCity, fCityOpts,
  fStatus, setFStatus, fType, setFType, sortBy, setSortBy,
  stateOpts, getBalance, getStatus, onOpenDetail, isMobile, onClearFilters,
}) => (
  <div style={{display:"flex",flexDirection:"column",gap:14}}>

    <div style={{position:"relative"}}>
      <i className="ti ti-search" style={{position:"absolute",left:12,top:"50%",
        transform:"translateY(-50%)",fontSize:15,color:T.t3,pointerEvents:"none"}} />
      <input value={searchQ} onChange={e=>setSearch(e.target.value)}
        placeholder="Search name, restaurant, phone, city…"
        style={{...iSx(false),paddingLeft:40}} />
      {searchQ&&(
        <button onClick={()=>setSearch("")} style={{position:"absolute",right:12,top:"50%",
          transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",
          color:T.t3,fontSize:16,display:"flex",alignItems:"center"}}>
          <i className="ti ti-x" />
        </button>
      )}
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8}}>
      <Sel value={fState} onChange={v=>setFState(v)}
        options={[{v:"all",l:"All states"},...stateOpts.map(s=>({v:s,l:s}))]} />
      <Sel value={fCity} onChange={v=>setFCity(v)}
        options={[{v:"all",l:"All cities"},...fCityOpts.map(c=>({v:c,l:c}))]} />
      <Sel value={fStatus} onChange={v=>setFStatus(v)}
        options={[{v:"all",l:"All status"},{v:"paid",l:"✓ Paid"},{v:"partial",l:"◑ Partial"},{v:"pending",l:"✕ Pending"}]} />
      <Sel value={fType} onChange={v=>setFType(v)}
        options={[{v:"all",l:"All types"},{v:"monthly",l:"Monthly"},{v:"yearly",l:"Yearly"}]} />
      <Sel value={sortBy} onChange={v=>setSortBy(v)}
        options={[{v:"name",l:"↑ Name"},{v:"amount",l:"↓ Amount"},{v:"date",l:"↓ Newest"},{v:"due",l:"↓ Due"}]} />
    </div>

    <div style={{fontSize:12,color:T.t3}}>
      {filteredClients.length} client{filteredClients.length!==1?"s":""} shown
      {(fState!=="all"||fCity!=="all"||fStatus!=="all"||fType!=="all"||searchQ)&&(
        <button onClick={onClearFilters}
          style={{marginLeft:10,background:"none",border:"none",color:T.accent,
            cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>
          Clear filters
        </button>
      )}
    </div>

    {loading?[1,2,3,4,5].map(i=>(
      <div key={i} style={{background:T.card,border:`1px solid ${T.border}`,
        borderRadius:13,padding:"16px 18px",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <Sk w="42%" h={14}/><Sk w="16%" h={22} r={20}/>
        </div>
        <Sk w="58%" h={12}/><Sk w="100%" h={6} r={20}/><Sk w="46%" h={11}/>
      </div>
    )):filteredClients.length===0?(
      <div style={{textAlign:"center",padding:"4rem 2rem",color:T.t3,
        background:T.card,border:`1px dashed ${T.border}`,borderRadius:14}}>
        <i className="ti ti-mood-empty" style={{fontSize:42,display:"block",marginBottom:14,color:T.t3}} />
        <div style={{fontSize:15,fontWeight:600,color:T.t2}}>No clients match</div>
        <div style={{fontSize:13,marginTop:6}}>Adjust your filters or search query</div>
      </div>
    ):filteredClients.map(c=>{
      const {paid,due,remaining}=getBalance(c);
      const pct    =due>0?Math.min(100,Math.round((paid/due)*100)):0;
      const status =getStatus(c);
      const initials=(c.clientName||"").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
      return (
        <div key={c.id} onClick={()=>onOpenDetail(c)}
          style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:13,
            padding:"15px 18px",cursor:"pointer",
            transition:"border-color 0.14s, background 0.14s",
            opacity:c.active?1:0.55}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderHov;e.currentTarget.style.background=T.cardHov;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.card;}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
            <div style={{width:42,height:42,borderRadius:11,background:T.accentDim,
              border:`1.5px solid ${T.accent}30`,display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:14,fontWeight:800,color:T.accent,flexShrink:0}}>
              {initials}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",gap:8,marginBottom:4}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:T.t1,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {c.restaurantName}
                  </div>
                  <div style={{fontSize:12,color:T.t2,marginTop:2}}>
                    {c.clientName} · {c.phone}
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"center"}}>
                  {!isMobile&&(
                    <span style={{fontSize:10,color:T.t3,background:T.surface,
                      padding:"2px 8px",borderRadius:20,border:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>
                      {c.priceType==="monthly"?"Monthly":"Yearly"}
                    </span>
                  )}
                  <Badge status={status} />
                </div>
              </div>
              <div style={{display:"flex",gap:12,fontSize:12,color:T.t3,marginBottom:10,flexWrap:"wrap"}}>
                <span style={{display:"flex",alignItems:"center",gap:3}}>
                  <i className="ti ti-map-pin" style={{fontSize:11}} />{c.city}, {c.state}
                </span>
                <span style={{display:"flex",alignItems:"center",gap:3}}>
                  <i className="ti ti-coin-rupee" style={{fontSize:11}} />{fmt(c.amount)}/{c.priceType==="monthly"?"mo":"yr"}
                </span>
              </div>
              <Prog pct={pct} />
              <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:11}}>
                <span style={{color:T.green}}>Paid {fmt(paid)}</span>
                {remaining>0
                  ?<span style={{color:T.red}}>Due {fmt(remaining)}</span>
                  :<span style={{color:T.t3}}>Fully paid ✓</span>}
              </div>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   PAYMENTS TAB
═══════════════════════════════════════════════════════════════ */
const PaymentsTab = ({ loading, payments, clients, totalCollected, onRecordPayment }) => {
  const sorted=[...payments].sort((a,b)=>b.date.localeCompare(a.date));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:13,color:T.t2}}>
          {payments.length} transactions · Total {fmt(totalCollected)}
        </div>
        <Btn small variant="primary" onClick={onRecordPayment}>
          <i className="ti ti-plus" />Record payment
        </Btn>
      </div>

      {loading?[1,2,3,4,5,6].map(i=>(
        <div key={i} style={{background:T.card,border:`1px solid ${T.border}`,
          borderRadius:11,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
          <div style={{display:"flex",gap:10,alignItems:"center",flex:1}}>
            <Sk w={38} h={38} r={9}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:7}}>
              <Sk w="55%" h={13}/><Sk w="38%" h={11}/>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
            <Sk w={70} h={15}/><Sk w={55} h={11}/>
          </div>
        </div>
      )):sorted.length===0?(
        <div style={{textAlign:"center",padding:"4rem",color:T.t3,
          background:T.card,borderRadius:13,border:`1px dashed ${T.border}`}}>
          <i className="ti ti-receipt-off" style={{fontSize:38,display:"block",marginBottom:12}} />
          No payments recorded yet
        </div>
      ):sorted.map(p=>{
        const cl=clients.find(c=>c.id===p.clientId);
        if(!cl)return null;
        return (
          <div key={p.id} style={{background:T.card,border:`1px solid ${T.border}`,
            borderRadius:11,padding:"13px 16px",
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:38,height:38,borderRadius:9,background:T.greenDim,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <i className={`ti ${MODEICON[p.mode]||"ti-cash"}`} style={{fontSize:17,color:T.green}} />
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:T.t1}}>{cl.restaurantName}</div>
                <div style={{fontSize:11,color:T.t3,marginTop:2}}>{p.note||"—"} · {p.mode||"cash"} · {cl.city}</div>
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:800,color:T.green}}>{fmt(p.amount)}</div>
              <div style={{fontSize:11,color:T.t3,marginTop:2}}>{p.date}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TABS=[
  {id:"dashboard",icon:"ti-layout-dashboard",label:"Dashboard"},
  {id:"clients",  icon:"ti-users",            label:"Clients"  },
  {id:"payments", icon:"ti-receipt",           label:"Payments" },
];

const BLANK_CLIENT = {
  clientName:"", restaurantName:"", phone:"", email:"",
  state:"", city:"", startDate:todayStr(),
  priceType:"monthly", amount:"", notes:"", gst:"",
};

/* ═══════════════════════════════════════════════════════════════
   MAIN APP — now just orchestrates state + Firestore calls
═══════════════════════════════════════════════════════════════ */
export default function App() {

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [tab,        setTab]        = useState("dashboard");
  const [clients,    setClients]    = useState([]);
  const [payments,   setPayments]   = useState([]);
  const [drawer,     setDrawer]     = useState(null);
  const [activeC,    setActiveC]    = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting,   setDeleting]   = useState(false);
  const [toast,      setToast]      = useState(null);
  const [editMode,   setEditMode]   = useState(false);
  const [isMobile,   setIsMobile]   = useState(
    typeof window !== "undefined" ? window.innerWidth < 620 : false
  );

  const [fState,  setFState]  = useState("all");
  const [fCity,   setFCity]   = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fType,   setFType]   = useState("all");
  const [sortBy,  setSortBy]  = useState("name");
  const [searchQ, setSearch]  = useState("");

  const [form,    setForm]    = useState(BLANK_CLIENT);
  const [formErr, setFormErr] = useState({});
  const [payForm, setPayForm] = useState({ clientId:"", amount:"", date:todayStr(), note:"", mode:"cash" });

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 620);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const showToast = (msg, type="success") => setToast({ msg, type });

  /* ── load data directly from Firestore ───────────────────────── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [clientsData, paymentsData] = await Promise.all([
        Api.getClients(),
        Api.getPayments(),
      ]);
      setClients(clientsData || []);
      setPayments(paymentsData || []);
    } catch (e) {
      showToast(e.message || "Failed to load data", "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── helpers ──────────────────────────────────────────────────── */
  const getPays    = (cid) => payments.filter(p => p.clientId === cid);
  const getBalance = (c)   => {
    const paid = getPays(c.id).reduce((s,p) => s+p.amount, 0);
    return { paid, due:c.amount, remaining:Math.max(0, c.amount-paid) };
  };
  const getStatus  = (c)   => {
    if (!c.active) return "inactive";
    const { paid, remaining } = getBalance(c);
    if (remaining===0) return "paid";
    if (paid>0)        return "partial";
    return "pending";
  };

  const stateOpts = Object.keys(STATES_CITIES);
  const cityOpts  = form.state ? STATES_CITIES[form.state]||[] : [];
  const fCityOpts = fState!=="all" ? STATES_CITIES[fState]||[] : [];

  const setF = (k,v) => {
    setForm(f => {
      const nf = {...f,[k]:v};
      if (k==="state")     { nf.city=""; const p=PRICING[v];        if(p) nf.amount=p[nf.priceType]; }
      if (k==="priceType") {              const p=PRICING[nf.state]; if(p) nf.amount=p[v];            }
      return nf;
    });
    setFormErr(e => ({...e,[k]:""}));
  };

  const validateClient = () => {
    const e={};
    if (!form.clientName.trim())      e.clientName="Required";
    if (!form.restaurantName.trim())  e.restaurantName="Required";
    if (!form.phone.match(/^\d{10}$/)) e.phone="Enter valid 10-digit number";
    if (form.email && !form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email="Invalid email";
    if (!form.state)                  e.state="Select state";
    if (!form.city)                   e.city="Select city";
    if (!form.startDate)              e.startDate="Required";
    if (!form.amount||Number(form.amount)<=0) e.amount="Enter valid amount";
    return e;
  };

  const closeClientDrawer = () => {
    setDrawer(null); setFormErr({}); setEditMode(false); setForm(BLANK_CLIENT);
  };

  /* ── CREATE / UPDATE client — direct Firestore write ─────────── */
  const submitClient = async () => {
    const e = validateClient();
    if (Object.keys(e).length) { setFormErr(e); return; }
    const payload = { ...form, amount: Number(form.amount) };
    setSaving(true);
    try {
      if (editMode && activeC) {
        const updated = await Api.updateClient(activeC.id, payload);
        setClients(cs => cs.map(c => c.id===activeC.id ? updated : c));
        setActiveC(updated);
        showToast("Client updated successfully");
      } else {
        const created = await Api.createClient(payload);
        setClients(cs => [...cs, created]);
        showToast("Client added successfully");
      }
      closeClientDrawer();
    } catch (err) {
      showToast(err.message || "Save failed", "error");
    }
    setSaving(false);
  };

  /* ── CREATE payment — direct Firestore write ─────────────────── */
  const submitPayment = async () => {
    if (!payForm.clientId||!payForm.amount||Number(payForm.amount)<=0||!payForm.date) {
      showToast("Fill all required fields","error"); return;
    }
    setSaving(true);
    try {
      const created = await Api.createPayment({
        clientId: payForm.clientId,
        amount: Number(payForm.amount),
        date: payForm.date,
        note: payForm.note,
        mode: payForm.mode,
      });
      setPayments(ps=>[...ps, created]);
      setPayForm({clientId:"",amount:"",date:todayStr(),note:"",mode:"cash"});
      setDrawer(null);
      showToast("Payment recorded");
    } catch (err) {
      showToast(err.message || "Failed to record payment", "error");
    }
    setSaving(false);
  };

  /* ── DELETE client — direct Firestore delete (cascades payments) */
  const deleteClient = async (id) => {
    setDeleting(true);
    try {
      await Api.deleteClient(id);
      setClients(cs=>cs.filter(c=>c.id!==id));
      setPayments(ps=>ps.filter(p=>p.clientId!==id));
      setDrawer(null); setActiveC(null); setConfirmDel(null);
      showToast("Client deleted","error");
    } catch (err) {
      showToast(err.message || "Delete failed", "error");
    }
    setDeleting(false);
  };

  /* ── TOGGLE active — direct Firestore update ─────────────────── */
  const toggleActive = async (c) => {
    try {
      const { active } = await Api.toggleClient(c.id);
      setClients(cs=>cs.map(x=>x.id===c.id?{...x,active}:x));
      setActiveC(a => a && a.id===c.id ? {...a,active} : a);
      showToast(active?"Client activated":"Client deactivated","info");
    } catch (err) {
      showToast(err.message || "Update failed", "error");
    }
  };

  const openDetail = (c) => { setActiveC(c); setDrawer("detail"); };
  const openEdit   = (c) => {
    setActiveC(c);
    setForm({clientName:c.clientName,restaurantName:c.restaurantName,
      phone:c.phone,email:c.email||"",state:c.state,city:c.city,
      startDate:c.startDate,priceType:c.priceType,amount:c.amount,
      notes:c.notes||"",gst:c.gst||""});
    setEditMode(true); setDrawer("addClient");
  };
  const openAddPaymentFor = (c) => {
    setDrawer(null);
    setTimeout(()=>{ setPayForm(f=>({...f,clientId:c.id})); setDrawer("addPayment"); },60);
  };
  const openAddPayment = () => {
    setPayForm({clientId:"",amount:"",date:todayStr(),note:"",mode:"cash"});
    setDrawer("addPayment");
  };
  const openAddClient = () => { setForm(BLANK_CLIENT); setFormErr({}); setEditMode(false); setDrawer("addClient"); };

  const clearFilters = () => { setFState("all");setFCity("all");setFStatus("all");setFType("all");setSearch("");setSortBy("name"); };

  /* ── filtered / derived data ──────────────────────────────────── */
  const filteredClients = clients.filter(c => {
    if (fState!=="all"  && c.state!==fState)        return false;
    if (fCity!=="all"   && c.city!==fCity)           return false;
    if (fStatus!=="all" && getStatus(c)!==fStatus)  return false;
    if (fType!=="all"   && c.priceType!==fType)     return false;
    if (searchQ && !`${c.clientName} ${c.restaurantName} ${c.phone} ${c.city}`
      .toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  }).sort((a,b) => {
    if (sortBy==="name")   return a.restaurantName.localeCompare(b.restaurantName);
    if (sortBy==="amount") return b.amount-a.amount;
    if (sortBy==="date")   return b.startDate.localeCompare(a.startDate);
    if (sortBy==="due")    return getBalance(b).remaining-getBalance(a).remaining;
    return 0;
  });

  const totalCollected = payments.reduce((s,p)=>s+p.amount,0);
  const activeList     = clients.filter(c=>c.active);
  const totalDue       = activeList.reduce((s,c)=>s+getBalance(c).remaining,0);
  const paidCnt        = activeList.filter(c=>getStatus(c)==="paid").length;
  const partialCnt     = activeList.filter(c=>getStatus(c)==="partial").length;
  const pendingCnt     = activeList.filter(c=>getStatus(c)==="pending").length;
  const monthlyMRR     = activeList.filter(c=>c.priceType==="monthly").reduce((s,c)=>s+c.amount,0);
  const yearlyARR      = activeList.filter(c=>c.priceType==="yearly").reduce((s,c)=>s+c.amount,0);

  const stateBreakdown = Object.entries(
    activeList.reduce((acc,c) => {
      if (!acc[c.state]) acc[c.state]={count:0,collected:0,due:0};
      acc[c.state].count++;
      const {paid,remaining}=getBalance(c);
      acc[c.state].collected+=paid;
      acc[c.state].due+=remaining;
      return acc;
    },{})
  ).sort((a,b)=>b[1].count-a[1].count);

  return (
    <>
      <IconsLoader />
      <style>{`
        @keyframes sk      { from{transform:translateX(-100%)} to{transform:translateX(220%)} }
        @keyframes slideIn { from{transform:translateX(100%)}  to{transform:translateX(0)}    }
        @keyframes fadeUp  { from{opacity:0;transform:translate(-50%,12px)} to{opacity:1;transform:translate(-50%,0)} }
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        body { background:${T.bg}; }
        ::-webkit-scrollbar       { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${T.border}; border-radius:4px; }
        input[type=date]::-webkit-calendar-picker-indicator { filter:invert(0.4); cursor:pointer; }
        option { background:${T.surface}; color:${T.t1}; }
        input::placeholder, textarea::placeholder { color:${T.t3}; }
        textarea { resize:vertical; }
      `}</style>

      <div style={{background:T.bg,minHeight:"100vh",color:T.t1,
        fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
        display:"flex",flexDirection:"column"}}>

        <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,
          padding:`0 ${isMobile?12:20}px`,display:"flex",alignItems:"center",
          justifyContent:"space-between",height:56,position:"sticky",top:0,zIndex:50,flexShrink:0}}>

          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:30,height:30,borderRadius:8,background:T.accentDim,
              border:`1px solid ${T.accent}40`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <i className="ti ti-building-store" style={{color:T.accent,fontSize:16}} />
            </div>
            <span style={{fontSize:16,fontWeight:800,color:T.t1,letterSpacing:"-0.4px"}}>ClientPro</span>
          </div>

          <div style={{display:"flex",gap:8}}>
            <Btn small onClick={loadAll}>
              <i className="ti ti-refresh" />{!isMobile && "Refresh"}
            </Btn>
            {!isMobile&&(
              <Btn small onClick={openAddPayment}>
                <i className="ti ti-plus" />Payment
              </Btn>
            )}
            <Btn small variant="primary" onClick={openAddClient}>
              <i className="ti ti-user-plus" />{isMobile?"Add":"Add client"}
            </Btn>
          </div>
        </div>

        <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,
          display:"flex",padding:`0 ${isMobile?4:16}px`,overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              display:"flex",alignItems:"center",gap:6,
              padding:`12px ${isMobile?14:20}px`,
              border:"none",background:"none",cursor:"pointer",
              color:tab===t.id?T.accent:T.t2,
              fontFamily:"inherit",fontSize:13,
              fontWeight:tab===t.id?700:400,
              borderBottom:`2px solid ${tab===t.id?T.accent:"transparent"}`,
              marginBottom:-1,whiteSpace:"nowrap",transition:"color 0.14s",
            }}>
              <i className={`ti ${t.icon}`} style={{fontSize:15}} />
              {t.label}
            </button>
          ))}
        </div>

        <div style={{flex:1,padding:`20px ${isMobile?12:20}px ${isMobile?110:50}px`,
          maxWidth:920,width:"100%",margin:"0 auto"}}>
          {tab==="dashboard" && (
            <Dashboard
              loading={loading} activeList={activeList} clients={clients} payments={payments}
              totalCollected={totalCollected} totalDue={totalDue}
              monthlyMRR={monthlyMRR} yearlyARR={yearlyARR}
              paidCnt={paidCnt} partialCnt={partialCnt} pendingCnt={pendingCnt}
              stateBreakdown={stateBreakdown}
              onStatusFilter={(status)=>{setTab("clients");setFStatus(status);}}
              onStateFilter={(state)=>{setTab("clients");setFState(state);setFCity("all");}}
              onViewAllPayments={()=>setTab("payments")}
            />
          )}
          {tab==="clients" && (
            <ClientsTab
              loading={loading} filteredClients={filteredClients}
              searchQ={searchQ} setSearch={setSearch}
              fState={fState} setFState={(v)=>{setFState(v);setFCity("all");}}
              fCity={fCity} setFCity={setFCity} fCityOpts={fCityOpts}
              fStatus={fStatus} setFStatus={setFStatus}
              fType={fType} setFType={setFType}
              sortBy={sortBy} setSortBy={setSortBy}
              stateOpts={stateOpts} getBalance={getBalance} getStatus={getStatus}
              onOpenDetail={openDetail} isMobile={isMobile} onClearFilters={clearFilters}
            />
          )}
          {tab==="payments" && (
            <PaymentsTab
              loading={loading} payments={payments} clients={clients}
              totalCollected={totalCollected} onRecordPayment={openAddPayment}
            />
          )}
        </div>

        {isMobile&&(
          <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:90,
            background:T.surface,borderTop:`1px solid ${T.border}`,
            display:"flex",padding:"10px 14px 20px",gap:10}}>
            <Btn sx={{flex:1}} onClick={openAddPayment}>
              <i className="ti ti-plus" />Payment
            </Btn>
            <Btn variant="primary" sx={{flex:1}} onClick={openAddClient}>
              <i className="ti ti-user-plus" />Add client
            </Btn>
          </div>
        )}
      </div>

      <Drawer open={drawer==="addClient"}
        onClose={closeClientDrawer}
        title={editMode?"Edit client":"Add new client"}
        subtitle={editMode?`Editing: ${activeC?.restaurantName}`:"Fill in the client details below"}
        width={530}>
        <ClientForm
          form={form} formErr={formErr} setF={setF}
          stateOpts={stateOpts} cityOpts={cityOpts}
          editMode={editMode} saving={saving}
          onCancel={closeClientDrawer} onSubmit={submitClient}
        />
      </Drawer>

      <Drawer open={drawer==="addPayment"}
        onClose={()=>setDrawer(null)}
        title="Record payment"
        subtitle="Log a payment transaction"
        width={460}>
        <PaymentForm
          payForm={payForm} setPayForm={setPayForm} clients={clients}
          getBalance={getBalance} saving={saving}
          onCancel={()=>setDrawer(null)} onSubmit={submitPayment}
        />
      </Drawer>

      <Drawer open={drawer==="detail"}
        onClose={()=>setDrawer(null)}
        title="" subtitle=""
        width={500}>
        <DetailPanel
          c={activeC} getPays={getPays} getBalance={getBalance} getStatus={getStatus}
          onAddPayment={openAddPaymentFor} onEdit={openEdit}
          onToggleActive={toggleActive} onDeleteRequest={setConfirmDel}
        />
      </Drawer>

      <Confirm
        open={!!confirmDel}
        busy={deleting}
        msg="Delete this client and all their payment history? This cannot be undone."
        onYes={()=>deleteClient(confirmDel)}
        onNo={()=>setConfirmDel(null)} />

      {toast&&<Toast msg={toast.msg} type={toast.type} onHide={()=>setToast(null)} />}
    </>
  );
}
