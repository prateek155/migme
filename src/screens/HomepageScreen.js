import { useState, useEffect } from "react";

// ─── THEME ───────────────────────────────────────────────────────────────────
const C = {
  primary: "#6C3BFF",
  primaryLight: "#8B5CFF",
  primaryDark: "#5020EE",
  accent: "#00D4AA",
  dark: "#0D0D1A",
  darkMid: "#1C1C35",
  navy: "#1E2A4A",
  text: "#0D0D1A",
  textMuted: "#6B7280",
  textLight: "#9CA3AF",
  bg: "#FFFFFF",
  bgLight: "#F4F3FF",
  bgLighter: "#FAFAFA",
  border: "#E5E7EB",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#3B82F6",
};

const NAV = ["Home", "Features", "Pricing", "Contact"];

const BENEFITS = [
  { icon: "⚡", title: "Unified Orders", desc: "Imperiial brings all online train food vendor orders into one clean dashboard. No more switching tabs — everything in one place, always in sync." },
  { icon: "📅", title: "Live Daily Dashboard", desc: "Get real-time visibility of today's orders split by Online and COD. Drill back into any past date with our smart date-range picker." },
  { icon: "🖨️", title: "Smart Printing", desc: "Generate delivery receipts with all key delivery parameters pre-filled. Your team and delivery executives always know exactly what to do." },
  { icon: "🔄", title: "Order Pipeline", desc: "Multiple status views (Active, Pending, Delivered, Cancelled, Undelivered) make it effortless to track every order from placement to door." },
];

const REVENUE_FEATURES = [
  { icon: "🗺️", title: "Order Tracking", desc: "Color-coded order statuses help you categorize, filter, and access any order instantly across all your vendors." },
  { icon: "👥", title: "Vendor Analytics", desc: "Deep-dive into vendor-wise performance. Optimize partner operations and streamline monthly settlements with ease." },
  { icon: "📊", title: "Business Intelligence", desc: "Rich reports show vendor order volumes, COD vs Online splits, and month-over-month trends to drive better decisions." },
];

const PLANS = [
  {
    name: "Starter",
    price: "₹16,000",
    tagline: "All features included. Perfect for growing restaurants.",
    features: ["Up to 30 Orders Daily", "Delivery Receipt Print", "Assign Delivery Executive", "Executive Wise COD Reports", "Add & Track Direct Orders", "Daily Business Lookup", "Monthly Reports", "Vendor Menu Upload"],
    highlight: false,
  },
  {
    name: "Growth",
    price: "₹20,000",
    tagline: "For established businesses scaling with technology.",
    features: ["30 to 50 Orders Daily", "Delivery Receipt Print", "Assign Delivery Executive", "Executive Wise COD Reports", "Add & Track Direct Orders", "Daily Business Lookup", "Monthly Reports", "Vendor Menu Upload"],
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "₹26,000",
    tagline: "Full-power solution for high-volume operations.",
    features: ["Unlimited Orders (50+)", "Delivery Receipt Print", "Assign Delivery Executive", "Executive Wise COD Reports", "Add & Track Direct Orders", "Daily Business Lookup", "Monthly Reports", "Vendor Menu Upload"],
    highlight: false,
  },
];

const STATS = [
  { icon: "📦", val: "10,000+", label: "Monthly Orders Processed" },
  { icon: "🛡️", val: "1000+", label: "Undelivered Orders Recovered" },
  { icon: "⏱️", val: "1000+", label: "Hours Saved Monthly" },
  { icon: "🎯", val: "90%", label: "Business Automation Rate" },
];

const FAQS = [
  { q: "What's included in the package?", a: "You get full access to all Imperiial features: unified order dashboard, vendor reporting, receipt printing, delivery executive management, and real-time business analytics." },
  { q: "How fast is your customer support?", a: "We aim to respond within minutes to hours depending on complexity. Most issues are resolved same-day by our dedicated support team." },
  { q: "Do I need technical knowledge to use Imperiial?", a: "Not at all. Imperiial is designed for restaurant owners and delivery managers — clean, intuitive UI that anyone can master in minutes." },
  { q: "Can I request new features?", a: "Absolutely! We love customer feedback. Share your ideas with us — many of our best features came directly from user suggestions." },
];

const ORDERS = [
  { status: "Confirmed",   id: "995616124", vendor: "IRCTC",        date: "26-06-2023", time: "20:00", pay: "COD", contact: "9867", train: "12142 · PPTA LTT · B4/18" },
  { status: "Confirmed",   id: "56958933",  vendor: "Yatri Bhojan", date: "26-06-2023", time: "12:30", pay: "COD", contact: "9589", train: "11071 · KAMAYANI · B3/12" },
  { status: "Pending",     id: "100609910", vendor: "IRCTC",        date: "22-06-2023", time: "19:50", pay: "COD", contact: "8303", train: "15018 · GKP LTT · H1/F17" },
  { status: "Undelivered", id: "559808",    vendor: "Rail Recipe",  date: "20-06-2023", time: "21:18", pay: "COD", contact: "9752", train: "15159 · B2/58" },
  { status: "Cancelled",   id: "2658917",   vendor: "Rail Restro",  date: "16-06-2023", time: "12:25", pay: "COD", contact: "9376", train: "11037 · PUNE GKP · B2/27" },
  { status: "Delivered",   id: "56958848",  vendor: "Yatri Bhojan", date: "26-06-2023", time: "11:30", pay: "COD", contact: "9334", train: "11428 · JSME PUNE · B1/51" },
];

const STATUS_STYLE = {
  Confirmed:   { bg: "#D1FAE5", color: "#065F46" },
  Pending:     { bg: "#FEF3C7", color: "#92400E" },
  Undelivered: { bg: "#F3F4F6", color: "#374151" },
  Cancelled:   { bg: "#FEE2E2", color: "#991B1B" },
  Delivered:   { bg: "#D1FAE5", color: "#065F46" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Tag({ children, color = C.primary }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>
      {children}
    </span>
  );
}

function Pill({ children, style = {} }) {
  return (
    <span style={{ display: "inline-block", background: C.bgLight, border: `1px solid ${C.primary}33`, borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 600, color: C.primary, ...style }}>
      {children}
    </span>
  );
}

function DashboardMockup({ compact = false }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.12)", overflow: "hidden", border: "1px solid #E5E7EB" }}>
      <div style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB", padding: "10px 14px", display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FF5F57", display: "inline-block" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FEBC2E", display: "inline-block" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28C840", display: "inline-block" }} />
        <div style={{ flex: 1, background: "#E5E7EB", borderRadius: 5, padding: "3px 10px", fontSize: 10, color: "#9CA3AF", marginLeft: 6 }}>app.imperiial.in</div>
      </div>
      <div style={{ display: "flex" }}>
        {!compact && (
          <div style={{ width: 140, borderRight: "1px solid #E5E7EB", padding: "16px 0", background: "#FAFAFA", flexShrink: 0 }}>
            <div style={{ padding: "0 12px 14px", fontWeight: 800, fontSize: 14, color: C.primary, letterSpacing: 1 }}>IMPERIIAL</div>
            {["Daily Business","Add Order","Menu","Reports","Delivery Exec","Orders"].map((m, i) => (
              <div key={m} style={{ padding: "8px 12px", fontSize: 11, color: i === 5 ? C.primary : "#6B7280", fontWeight: i === 5 ? 700 : 400, background: i === 5 ? C.bgLight : "transparent", borderLeft: i === 5 ? `3px solid ${C.primary}` : "3px solid transparent" }}>{m}</div>
            ))}
            <div style={{ padding: "4px 20px" }}>
              {["All","Active","Cancelled","Delivered","Pending","Undelivered"].map((s, i) => (
                <div key={s} style={{ fontSize: 10, color: i === 0 ? C.primary : "#9CA3AF", padding: "3px 0", display: "flex", alignItems: "center", gap: 5 }}>
                  {i > 0 && <span style={{ width: 6, height: 6, borderRadius: "50%", background: i===2?"#EF4444":i===3?"#10B981":i===4?"#F59E0B":"#D1D5DB", display: "inline-block" }} />}
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>All</span>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              {["Today Only","On Print","Auto Confirm"].map(t => (
                <span key={t} style={{ fontSize: 9, background: C.primary, color: "#fff", borderRadius: 10, padding: "2px 7px", display: "flex", alignItems: "center", gap: 3 }}>✓ {t}</span>
              ))}
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: C.dark }}>
                {["Status","Order ID","Vendor","Date","Time","Payment","Contact","Train Info"].map(h => (
                  <th key={h} style={{ padding: "7px 8px", color: "#fff", fontWeight: 600, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ORDERS.map((o, i) => {
                const s = STATUS_STYLE[o.status] || {};
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <td style={{ padding: "6px 8px" }}><span style={{ background: s.bg, color: s.color, borderRadius: 5, padding: "2px 7px", fontSize: 9, fontWeight: 700 }}>{o.status}</span></td>
                    <td style={{ padding: "6px 8px", color: "#374151", fontWeight: 600 }}>{o.id}</td>
                    <td style={{ padding: "6px 8px", color: "#6B7280" }}>{o.vendor}</td>
                    <td style={{ padding: "6px 8px", color: "#6B7280" }}>{o.date}</td>
                    <td style={{ padding: "6px 8px", color: "#6B7280" }}>{o.time}</td>
                    <td style={{ padding: "6px 8px" }}><span style={{ background: C.dark, color: "#fff", borderRadius: 4, padding: "2px 7px", fontSize: 9 }}>{o.pay}</span></td>
                    <td style={{ padding: "6px 8px", color: "#6B7280" }}>{o.contact}</td>
                    <td style={{ padding: "6px 8px", color: "#374151", fontSize: 9 }}>{o.train}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export default function HomepageScreen({ onLogin, onSignup }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq]   = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const go = (id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.text, background: C.bg, overflowX: "hidden" }}>

      {/* ═══ NAVBAR ═══════════════════════════════════════════════════════════ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
        background: scrolled ? "rgba(255,255,255,0.97)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        boxShadow: scrolled ? "0 1px 20px rgba(0,0,0,0.08)" : "none",
        transition: "all 0.3s",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px", height: 70, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryLight})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontWeight: 900, fontSize: 18, letterSpacing: -1 }}>II</span>
            </div>
            <span style={{ fontWeight: 900, fontSize: 22, color: C.dark, letterSpacing: "-0.5px" }}>Imperiial</span>
          </div>

          <div className="nav-links" style={{ display: "flex", gap: 36, alignItems: "center" }}>
            {NAV.map(l => (
              <button key={l} onClick={() => go(l.toLowerCase())}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 500, color: "#374151" }}
                onMouseOver={e => e.target.style.color = C.primary}
                onMouseOut={e => e.target.style.color = "#374151"}
              >{l}</button>
            ))}
          </div>

          <div className="nav-cta" style={{ display: "flex", gap: 10 }}>
            <button onClick={onLogin} style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 40, padding: "8px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>→ Login</button>
            <button onClick={onSignup} style={{ background: `linear-gradient(135deg,${C.primary},${C.primaryLight})`, border: "none", borderRadius: 40, padding: "9px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>+ Signup</button>
          </div>

          <button onClick={() => setMenuOpen(!menuOpen)} className="hamburger"
            style={{ display: "none", background: "none", border: "none", cursor: "pointer", padding: 6, flexDirection: "column", gap: 5 }}>
            {[0,1,2].map(i => <span key={i} style={{ display: "block", width: 24, height: 2, background: C.dark, borderRadius: 2 }} />)}
          </button>
        </div>

        {menuOpen && (
          <div style={{ background: "#fff", borderTop: `1px solid ${C.border}`, padding: "20px 28px" }}>
            {NAV.map(l => (
              <button key={l} onClick={() => go(l.toLowerCase())}
                style={{ display: "block", width: "100%", background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 500, color: C.text, padding: "10px 0", textAlign: "left", borderBottom: `1px solid ${C.border}` }}
              >{l}</button>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={onLogin}  style={{ flex: 1, background: "none", border: `1.5px solid ${C.border}`, borderRadius: 40, padding: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Login</button>
              <button onClick={onSignup} style={{ flex: 1, background: `linear-gradient(135deg,${C.primary},${C.primaryLight})`, border: "none", borderRadius: 40, padding: 10, fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer" }}>Signup</button>
            </div>
          </div>
        )}
      </nav>

      {/* ═══ HERO ═════════════════════════════════════════════════════════════ */}
      <section id="home" style={{ paddingTop: 100, minHeight: "100vh", background: `linear-gradient(160deg, ${C.bgLight} 0%, #fff 55%, #F0FDF9 100%)`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -80, right: -80, width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${C.primary}18, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 60, left: -60, width: 280, height: 280, borderRadius: "50%", background: `radial-gradient(circle, ${C.accent}14, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "60px 28px 80px", display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 56, alignItems: "center" }}>
          <div>
            <Pill style={{ marginBottom: 20 }}>🚂 Train Food Delivery Management</Pill>
            <h1 style={{ fontSize: "clamp(36px,5vw,62px)", fontWeight: 900, lineHeight: 1.1, margin: "0 0 10px", color: C.dark, letterSpacing: "-1.5px" }}>Imperiial</h1>
            <h2 style={{ fontSize: "clamp(18px,2.5vw,26px)", fontWeight: 700, color: C.primary, margin: "0 0 20px", lineHeight: 1.3 }}>Automate Your Train Food Delivery Business With Imperiial</h2>
            <p style={{ fontSize: 17, color: C.textMuted, lineHeight: 1.75, marginBottom: 36, maxWidth: 480 }}>Automatic Billing And Monthly Settlement System For Your Train Food Delivery Business. One platform — all vendors, all orders, all insights.</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
              <button onClick={onSignup} style={{ background: `linear-gradient(135deg,${C.primary},${C.primaryLight})`, border: "none", borderRadius: 50, padding: "15px 36px", fontSize: 16, fontWeight: 700, color: "#fff", cursor: "pointer", boxShadow: `0 6px 24px ${C.primary}44` }}>Get Started Free →</button>
              <button onClick={() => go("features")} style={{ background: "#fff", border: `1.5px solid ${C.border}`, borderRadius: 50, padding: "15px 30px", fontSize: 16, fontWeight: 600, color: C.text, cursor: "pointer" }}>See Features</button>
            </div>
            <p style={{ fontSize: 13, color: C.textLight }}>✅ No credit card needed &nbsp;·&nbsp; 10 days free full access</p>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: -20, right: -20, width: 200, height: 200, borderRadius: "50%", background: `${C.accent}22`, zIndex: 0 }} />
            <div style={{ position: "relative", zIndex: 1 }}><DashboardMockup /></div>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px 60px" }}>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 40 }}>
            <p style={{ textAlign: "center", fontSize: 12, color: C.textLight, marginBottom: 24, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5 }}>Integrated With All Major Train Food Vendors</p>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 40, flexWrap: "wrap" }}>
              {["GoFoodie Online", "RailYatri", "Zoop", "RailRestro", "YatraBhojan"].map(b => (
                <div key={b} style={{ fontSize: 14, fontWeight: 700, color: C.textMuted, letterSpacing: 0.5, padding: "6px 0" }}>{b}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ BENEFITS ═════════════════════════════════════════════════════════ */}
      <section id="features" style={{ padding: "96px 28px", background: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "flex-start" }}>
            <div>
              <div style={{ background: `radial-gradient(circle at center, ${C.bgLight} 0%, transparent 70%)`, borderRadius: 24, padding: 20 }}><DashboardMockup compact /></div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><span style={{ fontSize: 28 }}>✅</span></div>
              <h2 style={{ fontSize: "clamp(30px,4vw,48px)", fontWeight: 900, color: C.dark, margin: "0 0 10px", letterSpacing: "-1px" }}>Benefits of Imperiial</h2>
              <p style={{ fontSize: 18, color: C.textMuted, marginBottom: 40 }}>Imperiial will maximize your time and money</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
                {BENEFITS.map(b => (
                  <div key={b.title}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>{b.icon}</div>
                    <h4 style={{ fontWeight: 800, fontSize: 16, color: C.dark, margin: "0 0 8px" }}>{b.title}</h4>
                    <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.65, margin: 0 }}>{b.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ INCREASE REVENUE ═════════════════════════════════════════════════ */}
      <section style={{ padding: "96px 28px", background: C.bgLighter }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div>
            <Tag color={C.warning}>🏆 It's Important to</Tag>
            <h2 style={{ fontSize: "clamp(30px,4vw,52px)", fontWeight: 900, color: C.dark, margin: "8px 0 36px", letterSpacing: "-1px" }}>Increase Revenue</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {REVENUE_FEATURES.map(f => (
                <div key={f.title} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "#F0FDF4", border: "1px solid #BBF7D0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{f.icon}</div>
                  <div>
                    <h4 style={{ fontWeight: 800, fontSize: 16, color: C.dark, margin: "0 0 6px" }}>{f.title}</h4>
                    <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 12px 48px rgba(0,0,0,0.08)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ background: "#F9FAFB", borderBottom: `1px solid ${C.border}`, padding: "10px 14px", display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57", display: "inline-block" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E", display: "inline-block" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840", display: "inline-block" }} />
              <div style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700, color: C.textMuted }}>Imperiial Foods · Mayo Foods</div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: `conic-gradient(${C.warning} 0% 35%, ${C.primary} 35% 60%, ${C.accent} 60% 78%, ${C.info} 78% 100%)`, flexShrink: 0 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#065F46" }}>Total Amount: ₹8,613.85</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>Total Orders: 33</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>COD: ₹7,386.05 (27)</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>Online: ₹1,227.80 (6)</div>
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: C.dark }}>
                    {["No","Vendor","Delivered","Cancelled","Pending","Total","COD","Online"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", color: "#fff", fontWeight: 600, textAlign: "left", fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[["1","Rail Yatri","9","0","0","₹1930",{ bg:"#D1FAE5",v:"₹1721(8)" },{ bg:"#FEF3C7",v:"₹209(1)" }],
                    ["2","Rail Recipe","9","0","0","₹3181",{ bg:"#D1FAE5",v:"₹2881(8)" },{ bg:"#FEF3C7",v:"₹300(1)" }],
                    ["3","Go Food","8","0","0","₹2197",{ bg:"#D1FAE5",v:"₹1968(7)" },{ bg:"#FEF3C7",v:"₹229(1)" }],
                    ["4","Rail Restro","3","0","0","₹675",{ bg:"#D1FAE5",v:"₹532(2)" },{ bg:"#FEF3C7",v:"₹143(1)" }],
                  ].map(([no,vendor,del,can,pen,tot,cod,online]) => (
                    <tr key={no} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "6px 8px", color: C.textMuted }}>{no}</td>
                      <td style={{ padding: "6px 8px" }}><span style={{ background: C.dark, color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 10 }}>{vendor}</span></td>
                      <td style={{ padding: "6px 8px", color: C.textMuted }}>{del}</td>
                      <td style={{ padding: "6px 8px", color: C.textMuted }}>{can}</td>
                      <td style={{ padding: "6px 8px", color: C.textMuted }}>{pen}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: C.dark }}>{tot}</td>
                      <td style={{ padding: "4px 8px" }}><span style={{ background: cod.bg, color: "#065F46", borderRadius: 4, padding: "2px 6px", fontSize: 10 }}>{cod.v}</span></td>
                      <td style={{ padding: "4px 8px" }}><span style={{ background: online.bg, color: "#92400E", borderRadius: 4, padding: "2px 6px", fontSize: 10 }}>{online.v}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ ALL IN ONE ═══════════════════════════════════════════════════════ */}
      <section style={{ padding: "96px 28px", background: "#fff", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: 200, height: 200, background: `${C.primary}0D`, clipPath: "polygon(0 0,100% 0,0 100%)" }} />
        <div style={{ position: "absolute", top: 20, right: -40, width: 180, height: 180, borderRadius: "50%", background: `${C.accent}18` }} />
        <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative" }}>
          <h2 style={{ fontSize: "clamp(32px,5vw,60px)", fontWeight: 900, color: C.dark, margin: "0 0 16px", letterSpacing: "-1.5px" }}>All-in-one Solution</h2>
          <p style={{ fontSize: 18, color: C.primary, fontWeight: 600, marginBottom: 8 }}>Everything you need in one solution,</p>
          <p style={{ fontSize: 17, color: C.textMuted, marginBottom: 48, maxWidth: 700, margin: "0 auto 48px" }}>introducing Order Management Tool — a powerful product for growing your business.</p>
          <div style={{ margin: "0 auto 48px", maxWidth: 900 }}><DashboardMockup /></div>
          <div style={{ background: "#fff", borderRadius: 20, border: `1px solid ${C.border}`, padding: "32px 40px", maxWidth: 480, margin: "0 auto", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 17, color: C.textMuted, lineHeight: 1.7, marginBottom: 24 }}>Communicate better, put all your customer information in one single place, get insights and stats in a nutshell</p>
            <p style={{ fontFamily: "Georgia, serif", fontSize: 20, color: C.textMuted, marginBottom: 20, fontStyle: "italic" }}>No credit card needed</p>
            <button onClick={onSignup} style={{ background: C.dark, border: "none", borderRadius: 50, padding: "14px 40px", fontSize: 16, fontWeight: 700, color: "#fff", cursor: "pointer" }}>Start Now →</button>
            <p style={{ marginTop: 20, fontSize: 13, color: C.textLight }}>By registering you will get 10 days of free access to the full featured solution</p>
          </div>
        </div>
      </section>

      {/* ═══ STATS ════════════════════════════════════════════════════════════ */}
      <section style={{ padding: "80px 28px", background: `linear-gradient(135deg, ${C.dark} 0%, ${C.navy} 100%)` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontSize: "clamp(28px,4vw,48px)", fontWeight: 900, color: "#fff", margin: "0 0 12px", letterSpacing: "-1px" }}>Most of the business rely on Imperiial</h2>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 16 }}>Many happy customers around the world trust our service to boost their business</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 32, marginBottom: 64 }}>
            {STATS.map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: "clamp(32px,4vw,48px)", fontWeight: 900, color: "#fff", marginBottom: 8 }}>{s.val}</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", borderRadius: 24, padding: "48px 40px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 40 }}>
              {[
                { icon: "🎯", title: "Operations Made Easy", sub: "Our outstanding features makes your operations easy to handle." },
                { icon: "⚡", title: "Powerful Reports", sub: "Our reports give you visibility of your operations & finance." },
                { icon: "⭐", title: "Easy to Use", sub: "Flawless design makes it easy to understand for all type of users." },
              ].map(f => (
                <div key={f.title} style={{ textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: C.dark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>{f.icon}</div>
                  <h4 style={{ fontWeight: 800, fontSize: 17, color: C.dark, marginBottom: 8 }}>{f.title}</h4>
                  <div style={{ height: 3, width: 40, background: C.primary, borderRadius: 2, margin: "0 auto 12px" }} />
                  <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.65, margin: 0 }}>{f.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SEE WHY ══════════════════════════════════════════════════════════ */}
      <section style={{ padding: "96px 28px", background: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: -30, left: "50%", transform: "translateX(-50%)", width: 100, height: 50, background: C.warning, borderRadius: "50px 50px 0 0" }} />
            <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, boxShadow: "0 8px 32px rgba(0,0,0,0.08)", position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: C.dark }}>Daily Business</span>
                <span style={{ fontSize: 12, color: C.textMuted, background: C.bgLight, padding: "4px 10px", borderRadius: 20 }}>Jun 26, 2023</span>
              </div>
              {[["Total number of orders","34"],["Total amount from orders","₹ 8782.85"],["Online Orders (7)","₹ 1396.8"],["COD Orders (27)","₹ 7386.05"]].map(([k,v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
                  <span style={{ color: C.textMuted }}>{k}</span>
                  <span style={{ fontWeight: 600, color: C.dark }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, textAlign: "center" }}><span style={{ fontSize: 48 }}>📊</span></div>
          </div>
          <div>
            <Tag color={C.warning}>Track It · Print It · Deliver It</Tag>
            <h2 style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 900, color: C.dark, margin: "10px 0 16px", letterSpacing: "-1px" }}>See why people love Imperiial</h2>
            <div style={{ height: 4, width: 48, background: C.primary, borderRadius: 2, marginBottom: 32 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[["🗺️","Total Daily Orders","#F0FDF4","#D1FAE5"],["📍","Customers Tracking","#F0FDF4","#D1FAE5"],["📊","Advanced Reporting","#F0FDF4","#D1FAE5"]].map(([ic,t,bg,border]) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: bg, border: `1px solid ${border}`, borderRadius: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fff", border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{ic}</div>
                  <span style={{ fontWeight: 700, fontSize: 15, color: C.dark }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ DIGITAL RECEIPT ══════════════════════════════════════════════════ */}
      <section style={{ padding: "96px 28px", background: C.bgLighter }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "clamp(28px,4vw,48px)", fontWeight: 900, color: C.dark, margin: "0 0 6px", letterSpacing: "-1px" }}>Digital<br /><span style={{ fontWeight: 900 }}>Receipt</span></h2>
            <div style={{ height: 4, width: 48, background: C.primary, borderRadius: 2, margin: "16px 0 24px" }} />
            <p style={{ fontSize: 16, color: C.textMuted, marginBottom: 12, lineHeight: 1.7 }}>All order details in one place.</p>
            <p style={{ fontSize: 15, color: C.textMuted, lineHeight: 1.7, marginBottom: 32 }}>Items, taxes, total amount, and payment status — easy to view, easy to share.</p>
            <button style={{ background: "#fff", border: `1.5px solid ${C.dark}`, borderRadius: 50, padding: "12px 28px", fontSize: 15, fontWeight: 700, color: C.dark, cursor: "pointer" }}>Learn More →</button>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.1)", padding: 28, width: 280, border: `1px solid ${C.border}` }}>
              <div style={{ textAlign: "center", borderBottom: "1px dashed #E5E7EB", paddingBottom: 14, marginBottom: 14 }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: C.dark, letterSpacing: 2 }}>IMPERIIAL</div>
                <div style={{ fontSize: 11, color: C.textLight }}>Train Food Delivery Receipt</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, borderBottom: `1px solid ${C.border}`, paddingBottom: 6, marginBottom: 6 }}>
                  <span>Item</span><span>Qty</span>
                </div>
                {[["CHEESE CAPSICUM PIZZA","1"],["SWEET LASSI","1"]].map(([i,q]) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.text, marginBottom: 4 }}>
                    <span>{i}</span><span>{q}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 12 }}>
                {[["Advance","₹0"],["GST","₹15"],["Tax","₹0"],["Discount","₹0"],["Total","₹300"],["Amount to collect","₹315"]].map(([k,v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: k==="Total"||k==="Amount to collect" ? C.dark : C.textMuted, fontWeight: k==="Total"||k==="Amount to collect"?700:400 }}>{k}</span>
                    <span style={{ fontWeight: k==="Total"||k==="Amount to collect"?700:400, color: C.dark }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14, textAlign: "center", border: `2px solid ${C.dark}`, borderRadius: 8, padding: "8px 0" }}>
                  <div style={{ fontWeight: 900, fontSize: 20, color: C.dark, letterSpacing: 2 }}>COD</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PRICING ══════════════════════════════════════════════════════════ */}
      <section id="pricing" style={{ background: C.dark, position: "relative", overflow: "hidden" }}>
        <div style={{ padding: "80px 28px 0", maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(32px,5vw,56px)", fontWeight: 900, color: "#fff", margin: "0 0 12px", letterSpacing: "-1px" }}>Pricing plans</h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", maxWidth: 380, lineHeight: 1.65, marginBottom: 0 }}>Simple and affordable pricing plans. Try Imperiial with no obligation.</p>
        </div>
        <div style={{ background: "#fff", margin: "60px 0 0", borderRadius: "40px 40px 0 0", padding: "60px 28px 80px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24 }}>
              {PLANS.map(p => (
                <div key={p.name} style={{ background: p.highlight ? C.dark : "#F4F3FF", borderRadius: 20, overflow: "hidden", boxShadow: p.highlight ? `0 12px 40px rgba(0,0,0,0.2)` : "none" }}>
                  <div style={{ padding: "28px 28px 0", textAlign: "center" }}>
                    <h3 style={{ fontWeight: 800, fontSize: 22, color: p.highlight ? "#fff" : C.dark, marginBottom: 8 }}>{p.name}</h3>
                    <div style={{ fontSize: 13, color: p.highlight ? "rgba(255,255,255,0.5)" : C.textMuted, lineHeight: 1.5, marginBottom: 16, minHeight: 48 }}>{p.tagline}</div>
                    <div style={{ fontSize: "clamp(28px,4vw,40px)", fontWeight: 900, color: p.highlight ? "#fff" : C.primary, marginBottom: 4 }}>{p.price}</div>
                  </div>
                  <div style={{ padding: "16px 0" }}>
                    {p.features.map(f => (
                      <div key={f} style={{ padding: "10px 28px", fontSize: 14, color: p.highlight ? "rgba(255,255,255,0.7)" : C.textMuted, borderTop: `1px solid ${p.highlight ? "rgba(255,255,255,0.08)" : "#E5E7EB"}`, textAlign: "center" }}>{f}</div>
                    ))}
                  </div>
                  <div style={{ padding: "20px 28px 28px", textAlign: "center" }}>
                    <button onClick={onSignup} style={{ background: p.highlight ? "#fff" : "transparent", border: p.highlight ? "none" : `2px solid ${C.primary}`, borderRadius: 50, padding: "12px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", color: p.highlight ? C.dark : C.primary, display: "inline-flex", alignItems: "center", gap: 8 }}>Buy now →</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ══════════════════════════════════════════════════════════════ */}
      <section id="contact" style={{ padding: "96px 28px", background: "#F1F0F7" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 64, alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: "clamp(26px,3.5vw,42px)", fontWeight: 900, color: C.dark, margin: "0 0 16px", letterSpacing: "-0.5px", lineHeight: 1.2 }}>Do you have <strong>questions?</strong></h2>
            <p style={{ fontSize: 15, color: C.textMuted, lineHeight: 1.7, marginBottom: 12 }}>Not sure how Imperiial can help you? Wonder why you need our platform?</p>
            <p style={{ fontSize: 14, color: C.textLight, lineHeight: 1.7 }}>Here are the answers to some of the most common questions we hear from our appreciated customers</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FAQS.map((f, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ width: "100%", padding: "18px 22px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, fontWeight: 600, color: C.dark, textAlign: "left" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: openFaq === i ? C.primary : C.textLight, fontWeight: 700 }}>{openFaq === i ? "∨" : "›"}</span>
                    {f.q}
                  </span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: "0 22px 18px 42px", fontSize: 14, color: C.textMuted, lineHeight: 1.75 }}>{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══════════════════════════════════════════════════════════ */}
      <footer style={{ background: "#fff", padding: "48px 28px 28px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 32, marginBottom: 32, flexWrap: "wrap" }}>
            {NAV.map(l => (
              <button key={l} onClick={() => go(l.toLowerCase())}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, color: C.textMuted }}
                onMouseOver={e => e.target.style.color = C.primary}
                onMouseOut={e => e.target.style.color = C.textMuted}
              >{l}</button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: C.dark, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontWeight: 900, fontSize: 18, letterSpacing: -1 }}>II</span>
              </div>
              <span style={{ fontWeight: 900, fontSize: 22, color: C.dark, letterSpacing: "-0.5px" }}>Imperiial</span>
            </div>
          </div>
          <div style={{ textAlign: "center", borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
            <span style={{ fontSize: 13, color: C.textLight }}>© 2026 Imperiial · All rights reserved</span>
          </div>
        </div>
      </footer>

      <style>{`
        @media (max-width: 768px) {
          .nav-links, .nav-cta { display: none !important; }
          .hamburger { display: flex !important; }
        }
        @media (max-width: 700px) {
          div[style*="grid-template-columns: 1fr 1fr"],
          div[style*="grid-template-columns: 1fr 1.2fr"],
          div[style*="grid-template-columns: 1fr 1.6fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
