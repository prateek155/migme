import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, ScrollView, useWindowDimensions,
  Modal, Share, Animated,
} from 'react-native';
import {
  collection, onSnapshot, query, where, getDocs, writeBatch,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../src/firebaseConfig';

/* ─── Design tokens ─────────────────────────────────────────────── */
const C = {
  bg:     '#060d1a',
  bg2:    '#0c1526',
  surf:   'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.10)',
  acc:    '#3b82f6',
  teal:   '#0f766e',
  tealLt: '#5eead4',
  suc:    '#22c55e',
  dan:    '#f87171',
  warn:   '#f59e0b',
  dim:    '#94a3b8',
  txt:    '#f1f5f9',
  purple: '#a78bfa',
  orange: '#fb923c',
};

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const TABS = ['Overview', 'Storage', 'Delete', 'Tools'];

/* ─── Per-client Firestore collections ─────────────────────────── */
const CLIENT_COLS = [
  { key: 'orders',      col: 'orders',           label: 'Orders',              color: C.teal   },
  { key: 'emails',      col: 'processed_emails', label: 'Processed emails',    color: C.warn   },
  { key: 'menu',        col: 'menuItems',         label: 'Menu items',          color: C.purple },
  { key: 'categories',  col: 'categories',        label: 'Categories',          color: C.orange },
  { key: 'execs',       col: 'executives',        label: 'Delivery executives', color: C.dim    },
];

/* ─── Firebase free-tier daily hard limits (quota ceiling, never changes) ── */
const FB_QUOTA = {
  reads:   50000,
  writes:  20000,
  deletes: 20000,
};

/* ─── Helpers ───────────────────────────────────────────────────── */
const fmtCount  = (n) => (n || 0).toLocaleString();
const pct       = (u, t) => Math.min(Math.round((u / t) * 100), 100);
const barColor  = (p) => p > 89 ? C.dan : p > 69 ? C.warn : C.suc;
// Rough doc-count → MB estimate  (orders ~2 KB, emails ~5 KB, menu ~1 KB, etc.)
const docEstimateMb = (counts) => {
  if (!counts) return 0;
  const mb =
    (counts.orders || 0)     * 0.002 +
    (counts.emails || 0)     * 0.005 +
    (counts.menu   || 0)     * 0.001 +
    (counts.categories || 0) * 0.0005 +
    (counts.execs  || 0)     * 0.0005;
  return Math.max(mb, 0.01);
};
const fmtMb = (mb) => mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;

/* ─── Animated storage bar ─────────────────────────────────────── */
function StorageBar({ pctVal, color, height = 8 }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: pctVal / 100,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [pctVal]);
  return (
    <View style={[styles.barTrack, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: color || barColor(pctVal),
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */
function Card({ children, style, dangerBorder }) {
  return (
    <View style={[styles.card, dangerBorder && { borderColor: 'rgba(248,113,113,0.3)' }, style]}>
      {children}
    </View>
  );
}
function CardHeader({ icon, title, color }) {
  return (
    <View style={styles.cardHdr}>
      <Ionicons name={icon} size={17} color={color || C.acc} />
      <Text style={[styles.cardTitle, color && { color }]}>{title}</Text>
    </View>
  );
}
function Btn({ label, icon, color, onPress, disabled, style }) {
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: color || C.acc }, disabled && { opacity: 0.45 }, style]}
      onPress={onPress} disabled={disabled} activeOpacity={0.8}
    >
      {icon && <Ionicons name={icon} size={15} color="#fff" />}
      <Text style={styles.btnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}
function OutlineBtn({ label, icon, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.outlineBtn, disabled && { opacity: 0.45 }]}
      onPress={onPress} disabled={disabled} activeOpacity={0.8}
    >
      {icon && <Ionicons name={icon} size={14} color={C.dim} />}
      <Text style={styles.outlineBtnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}
function MetricCard({ value, label, color, loading }) {
  return (
    <View style={styles.metricCard}>
      {loading
        ? <ActivityIndicator size="small" color={C.dim} />
        : <Text style={[styles.metricVal, { color }]}>{value}</Text>}
      <Text style={styles.metricLbl}>{label}</Text>
    </View>
  );
}
function Chip({ label, variant = 'blue' }) {
  const map = {
    blue:  { bg: 'rgba(59,130,246,0.15)',  text: C.acc  },
    suc:   { bg: 'rgba(34,197,94,0.15)',   text: C.suc  },
    warn:  { bg: 'rgba(245,158,11,0.15)',  text: C.warn },
    dan:   { bg: 'rgba(248,113,113,0.15)', text: C.dan  },
    dim:   { bg: 'rgba(148,163,184,0.12)', text: C.dim  },
    teal:  { bg: 'rgba(15,118,110,0.18)',  text: C.tealLt },
  };
  const s = map[variant] || map.blue;
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: s.text }}>{label}</Text>
    </View>
  );
}
function StatRow({ label, value, color, last }) {
  return (
    <View style={[styles.statRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
    </View>
  );
}
function ProjRow({ label, value, valueColor, last }) {
  return (
    <View style={[styles.projRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor || C.txt }]}>{value}</Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Screen
══════════════════════════════════════════════════════════════════ */
export default function DataManagementScreen({ onBack }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  /* ── State ── */
  const [clients,       setClients]       = useState([]);
  const [clientCounts,  setClientCounts]  = useState({});
  const [countsLoading, setCountsLoading] = useState(true);
  const [loading,       setLoading]       = useState(false);
  const [toolLoading,   setToolLoading]   = useState('');

  const [tab,           setTab]           = useState(0);
  const [selClient,     setSelClient]     = useState(null);
  const [clientSearch,  setClientSearch]  = useState('');
  const [startDate,     setStartDate]     = useState('');
  const [endDate,       setEndDate]       = useState('');
  const [orderNo,       setOrderNo]       = useState('');
  const [result,        setResult]        = useState(null);
  const [modalVisible,  setModalVisible]  = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const [auditResult,    setAuditResult]   = useState(null);
  const [archiveResult,  setArchiveResult] = useState(null);
  const [archiveMonths,  setArchiveMonths] = useState('6');

  // Firebase daily operation counts — fetched from backend (Cloud Monitoring)
  const [fbUsage,        setFbUsage]       = useState(null);   // { reads, writes, deletes } or null
  const [fbUsageLoading, setFbUsageLoading] = useState(true);

  /* ── Load clients ── */
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'clients')), snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  /* ── Load real doc counts per client ── */
  useEffect(() => {
    if (clients.length === 0) { setCountsLoading(false); return; }
    let cancelled = false;
    (async () => {
      setCountsLoading(true);
      const counts = {};
      for (const c of clients) {
        if (cancelled) return;
        try {
          const snaps = await Promise.all(
            CLIENT_COLS.map(({ col }) =>
              getDocs(query(collection(db, col), where('clientId', '==', c.id)))
            )
          );
          const entry = {};
          CLIENT_COLS.forEach(({ key }, i) => { entry[key] = snaps[i].size; });
          counts[c.id] = entry;
        } catch {
          const entry = {};
          CLIENT_COLS.forEach(({ key }) => { entry[key] = 0; });
          counts[c.id] = entry;
        }
      }
      if (!cancelled) { setClientCounts(counts); setCountsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [clients]);

  /* ── Fetch real Firebase daily operation counts from backend ──
     Your backend should call Google Cloud Monitoring API:
     GET /api/admin/firebase-usage
     and return: { reads: number, writes: number, deletes: number }
     See: https://cloud.google.com/monitoring/api/metrics_gcp#firestore
  ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFbUsageLoading(true);
      try {
        const res  = await fetch(`${BACKEND_URL}/api/admin/firebase-usage`, {
          headers: { 'x-admin-key': process.env.EXPO_PUBLIC_ADMIN_API_KEY || '' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // Expected shape: { reads: number, writes: number, deletes: number }
        if (!cancelled) setFbUsage(data);
      } catch {
        // Endpoint not yet implemented — show bars as unavailable, not fake numbers
        if (!cancelled) setFbUsage(null);
      }
      if (!cancelled) setFbUsageLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const getAdminKey = () => process.env.EXPO_PUBLIC_ADMIN_API_KEY || '';
  const cnt = (id) => clientCounts[id] || {};

  /* ── Derived totals ── */
  const totals = CLIENT_COLS.reduce((acc, { key }) => {
    acc[key] = clients.reduce((s, c) => s + (cnt(c.id)[key] || 0), 0);
    return acc;
  }, {});
  const totalDocs   = Object.values(totals).reduce((s, v) => s + v, 0) + clients.length;
  const totalEstMb  = clients.reduce((s, c) => s + docEstimateMb(cnt(c.id)), 0) + 305; // +305 MB admin overhead
  const QUOTA_MB    = 1024; // Firestore free tier ~1 GB practical limit
  const usedPct     = pct(totalEstMb, QUOTA_MB);
  const DAILY_MB    = Math.max(totalEstMb / 90, 1); // rough growth: fill in 90 days
  const daysLeft    = Math.round((QUOTA_MB - totalEstMb) / DAILY_MB);

  /* ── Delete via backend ── */
  async function executeDelete() {
    setLoading(true); setResult(null);
    try {
      let res, data;
      if (pendingAction === 'range') {
        res  = await fetch(`${BACKEND_URL}/api/data/client/${selClient.id}/range`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': getAdminKey() },
          body: JSON.stringify({ startDate, endDate }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setResult({ type: 'range', data });
      } else if (pendingAction === 'order') {
        res  = await fetch(`${BACKEND_URL}/api/data/client/${selClient.id}/order/${orderNo.trim()}`, {
          method: 'DELETE',
          headers: { 'x-admin-key': getAdminKey() },
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setResult({ type: 'order', data });
        setOrderNo('');
      } else if (pendingAction === 'all') {
        res  = await fetch(`${BACKEND_URL}/api/data/client/${selClient.id}/all`, {
          method: 'DELETE',
          headers: { 'x-admin-key': getAdminKey() },
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setResult({ type: 'all', data });
      }
    } catch (e) { Alert.alert('Delete failed', e.message); }
    setLoading(false);
  }

  function triggerDelete(type) {
    if (!selClient) { Alert.alert('Select a client first'); return; }
    if (type === 'range' && (!startDate || !endDate)) { Alert.alert('Missing dates'); return; }
    if (type === 'order' && !orderNo.trim()) { Alert.alert('Enter an order number'); return; }
    setPendingAction(type); setModalVisible(true);
  }

  /* ── Export via Share sheet ── */
  async function exportData(format) {
    if (!selClient) { Alert.alert('Select a client first'); return; }
    setToolLoading('export');
    try {
      const snap = await getDocs(
        query(collection(db, 'orders'), where('clientId', '==', selClient.id))
      );
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (rows.length === 0) { Alert.alert('No orders', 'This client has no orders.'); setToolLoading(''); return; }
      let content;
      if (format === 'json') {
        content = JSON.stringify(rows, null, 2);
      } else {
        const keys   = Object.keys(rows[0]);
        const header = keys.join(',');
        const lines  = rows.map(r =>
          keys.map(k => {
            const v = r[k];
            const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
            return `"${s.replace(/"/g, '""')}"`;
          }).join(',')
        );
        content = [header, ...lines].join('\n');
      }
      await Share.share({ message: content, title: `${selClient.businessName}_orders.${format}` });
    } catch (e) { Alert.alert('Export failed', e.message); }
    setToolLoading('');
  }

  /* ── Audit orphaned docs ── */
  async function runAudit() {
    setToolLoading('audit'); setAuditResult(null);
    try {
      const clientIds = new Set(clients.map(c => c.id));
      const issues = [];
      for (const { col, label } of CLIENT_COLS) {
        const snap = await getDocs(collection(db, col));
        let orphans = 0;
        snap.docs.forEach(d => { if (d.data().clientId && !clientIds.has(d.data().clientId)) orphans++; });
        if (orphans > 0) issues.push({ col, label, orphans });
      }
      setAuditResult({ ran: true, issues, clean: issues.length === 0, ts: new Date().toLocaleTimeString() });
    } catch (e) { Alert.alert('Audit failed', e.message); }
    setToolLoading('');
  }

  /* ── Fix orphans ── */
  async function fixOrphans() {
    if (!auditResult?.issues?.length) return;
    Alert.alert('Fix orphaned documents?', 'Permanently delete all orphaned documents found. Cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete orphans', style: 'destructive', onPress: async () => {
        setToolLoading('fix');
        try {
          const clientIds = new Set(clients.map(c => c.id));
          let deleted = 0;
          for (const { col } of CLIENT_COLS) {
            const snap = await getDocs(collection(db, col));
            const batch = writeBatch(db);
            let bc = 0;
            for (const d of snap.docs) {
              if (d.data().clientId && !clientIds.has(d.data().clientId)) {
                batch.delete(d.ref); deleted++; bc++;
                if (bc === 499) { await batch.commit(); bc = 0; }
              }
            }
            if (bc > 0) await batch.commit();
          }
          setAuditResult(prev => ({ ...prev, fixed: deleted, issues: [], clean: true }));
          Alert.alert('Done', `Deleted ${deleted} orphaned documents.`);
        } catch (e) { Alert.alert('Fix failed', e.message); }
        setToolLoading('');
      }},
    ]);
  }

  /* ── Archive old orders ── */
  async function archiveOldOrders() {
    if (!selClient) { Alert.alert('Select a client first'); return; }
    const months = parseInt(archiveMonths, 10);
    if (!months || months < 1) { Alert.alert('Invalid', 'Enter a valid number of months'); return; }
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    Alert.alert(
      'Archive old orders?',
      `Delete all orders for ${selClient.businessName} before ${cutoffStr}?\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: async () => {
          setToolLoading('archive'); setArchiveResult(null);
          try {
            const res  = await fetch(`${BACKEND_URL}/api/data/client/${selClient.id}/range`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', 'x-admin-key': getAdminKey() },
              body: JSON.stringify({ startDate: '2000-01-01', endDate: cutoffStr }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setArchiveResult({ deletedOrders: data.deletedOrders, deletedIndex: data.deletedIndexEntries || 0, cutoff: cutoffStr, client: selClient.businessName });
            setClientCounts(prev => {
              const u = { ...prev };
              if (u[selClient.id]) u[selClient.id] = { ...u[selClient.id], orders: Math.max(0, (u[selClient.id].orders || 0) - (data.deletedOrders || 0)) };
              return u;
            });
          } catch (e) { Alert.alert('Archive failed', e.message); }
          setToolLoading('');
        }},
      ]
    );
  }

  /* ── Filtered client list ── */
  const filtered = clients.filter(c =>
    c.businessName?.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.email?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  /* ── Client selector shared component ── */
  const ClientSelector = () => (
    <Card>
      <Text style={styles.selectorHdr}>Select client</Text>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={15} color={C.dim} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients..."
          placeholderTextColor={C.dim}
          value={clientSearch}
          onChangeText={setClientSearch}
        />
      </View>
      {filtered.map(c => {
        const isSel = selClient?.id === c.id;
        const cc = cnt(c.id);
        const estMb = docEstimateMb(cc);
        return (
          <TouchableOpacity
            key={c.id}
            style={[styles.clientItem, isSel && styles.clientItemSel, { marginBottom: 6 }]}
            onPress={() => { setSelClient(c); setResult(null); setAuditResult(null); setArchiveResult(null); }}
            activeOpacity={0.8}
          >
            <View style={styles.clientItemRow}>
              <Text style={[styles.clientName, isSel && { color: C.tealLt }]}>{c.businessName}</Text>
              {!countsLoading && (
                <Chip label={fmtMb(estMb)} variant={estMb > 200 ? 'warn' : 'teal'} />
              )}
            </View>
            <Text style={styles.clientMeta}>
              {c.email}
              {!countsLoading && cc.orders != null ? `  ·  ${fmtCount(cc.orders)} orders` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
      {filtered.length === 0 && <Text style={styles.empty}>No clients match</Text>}
    </Card>
  );

  /* ── Result banner ── */
  const ResultBanner = () => {
    if (!result) return null;
    const color = result.type === 'all' ? C.dan : C.suc;
    const msg =
      result.type === 'range' ? `Deleted ${fmtCount(result.data.deletedOrders)} orders + ${fmtCount(result.data.deletedIndexEntries)} index entries`
      : result.type === 'order' ? `Deleted order ${result.data.deleted}`
      : `Deleted ${fmtCount(result.data.deletedDocs)} documents total`;
    return (
      <View style={[styles.resultBanner, { borderColor: color }]}>
        <Ionicons name="checkmark-circle" size={18} color={color} />
        <Text style={[styles.resultTxt, { color }]}>{msg}</Text>
      </View>
    );
  };

  /* ════════════════════════════════════════════════════════════════
     TAB 1 — OVERVIEW
  ════════════════════════════════════════════════════════════════ */
  const OverviewTab = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

      {/* Metric tiles */}
      <View style={[styles.metricGrid, isDesktop && styles.metricGridDesktop]}>
        <MetricCard value={clients.length.toString()}  label="Active clients"   color={C.acc}  loading={false} />
        <MetricCard value={fmtCount(totals.orders)}    label="Total orders"     color={C.teal} loading={countsLoading} />
        <MetricCard value={fmtMb(totalEstMb)}          label="Est. storage used" color={barColor(usedPct)} loading={countsLoading} />
        <MetricCard value={countsLoading ? '—' : `~${daysLeft}d`} label="Until quota full" color={C.dim} loading={false} />
      </View>

      {/* Warning banner */}
      {!countsLoading && usedPct > 55 && (
        <View style={[
          styles.warnBox,
          usedPct > 80 && { borderColor: 'rgba(248,113,113,0.4)', backgroundColor: 'rgba(248,113,113,0.07)' },
        ]}>
          <Ionicons name="warning-outline" size={16} color={usedPct > 80 ? C.dan : C.warn} />
          <Text style={[styles.warnTxt, usedPct > 80 && { color: C.dan }]}>
            Estimated storage at {usedPct}% — at current growth rate you may hit quota in ~{daysLeft} days.
            Consider archiving old orders.
          </Text>
        </View>
      )}

      {/* Firebase quota bars */}
      <Card>
        <CardHeader icon="server-outline" title="Firebase quota" color={C.acc} />
        {countsLoading
          ? <ActivityIndicator size="small" color={C.teal} style={{ marginVertical: 10 }} />
          : <>
              <View style={styles.scaleRow}>
                <Text style={styles.scaleLabel}>Estimated Firestore storage</Text>
                <Text style={[styles.scaleVal, { color: barColor(usedPct) }]}>{fmtMb(totalEstMb)} / 1 GB</Text>
              </View>
              <StorageBar pctVal={usedPct} />
              {[
                { label: 'Reads / day',   key: 'reads'   },
                { label: 'Writes / day',  key: 'writes'  },
                { label: 'Deletes / day', key: 'deletes' },
              ].map(({ label, key }) => {
                const max  = FB_QUOTA[key];
                const used = fbUsage?.[key];
                const p    = used != null ? pct(used, max) : null;
                return (
                  <View key={key} style={{ marginTop: 10 }}>
                    <View style={styles.scaleRow}>
                      <Text style={styles.scaleLabel}>{label}</Text>
                      {fbUsageLoading
                        ? <ActivityIndicator size="small" color={C.dim} />
                        : used != null
                          ? <Text style={[styles.scaleVal, { color: barColor(p) }]}>{used.toLocaleString()} / {max.toLocaleString()}</Text>
                          : <Text style={[styles.scaleVal, { color: C.dim }]}>Unavailable — add backend endpoint</Text>
                      }
                    </View>
                    {p != null && !fbUsageLoading && <StorageBar pctVal={p} />}
                    {p == null && !fbUsageLoading && (
                      <View style={[styles.barTrack, { height: 8, borderRadius: 4 }]}>
                        <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' }} />
                      </View>
                    )}
                  </View>
                );
              })}
            </>
        }
        <View style={styles.legendRow}>
          {[['Safe', C.suc], ['Warning >70%', C.warn], ['Critical >90%', C.dan]].map(([l, col]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: col }} />
              <Text style={{ fontSize: 10, color: C.dim }}>{l}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Collection breakdown */}
      <Card>
        <CardHeader icon="layers-outline" title="All collections" color={C.acc} />
        {countsLoading
          ? <ActivityIndicator size="small" color={C.teal} style={{ marginVertical: 10 }} />
          : <>
              {CLIENT_COLS.map(({ key, label, color }, i) => (
                <StatRow key={key} label={label} value={fmtCount(totals[key])} color={color} last={false} />
              ))}
              <View style={styles.divider} />
              <StatRow label="Client config docs" value={fmtCount(clients.length)} color={C.acc} last />
              <View style={styles.divider} />
              <StatRow label="Grand total" value={fmtCount(totalDocs)} color={C.txt} last />
            </>
        }
      </Card>

      {/* Storage projection */}
      {!countsLoading && (
        <Card>
          <CardHeader icon="trending-up-outline" title="Storage projection" color={C.teal} />
          <ProjRow label="Today"    value={`${fmtMb(totalEstMb)} (${usedPct}%)`} valueColor={C.suc} />
          <ProjRow label="+2 weeks" value={`${fmtMb(totalEstMb + 14 * DAILY_MB)} (${pct(totalEstMb + 14 * DAILY_MB, QUOTA_MB)}%)`} valueColor={C.warn} />
          <ProjRow label="+4 weeks" value={`${fmtMb(totalEstMb + 28 * DAILY_MB)} (${pct(totalEstMb + 28 * DAILY_MB, QUOTA_MB)}%)`} valueColor={C.dan} />
          <ProjRow label="+6 weeks" value={`${fmtMb(totalEstMb + 42 * DAILY_MB)} — near limit`} valueColor={C.dan} last />
        </Card>
      )}
    </ScrollView>
  );

  /* ════════════════════════════════════════════════════════════════
     TAB 2 — STORAGE (per-client breakdown)
  ════════════════════════════════════════════════════════════════ */
  const StorageTab = () => {
    const colColors = [C.acc, C.teal, C.warn, C.purple, C.orange, C.dan];
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

        {/* Per-client storage cards */}
        <Card>
          <CardHeader icon="pie-chart-outline" title="Storage by client" color={C.acc} />
          {countsLoading
            ? <ActivityIndicator size="small" color={C.teal} style={{ marginVertical: 12 }} />
            : clients.length === 0
              ? <Text style={styles.empty}>No clients found</Text>
              : clients.map((c, i) => {
                  const cc    = cnt(c.id);
                  const estMb = docEstimateMb(cc);
                  const p     = pct(estMb, QUOTA_MB);
                  const col   = colColors[i % colColors.length];
                  return (
                    <View key={c.id} style={{ marginBottom: 18 }}>
                      <View style={styles.clientStorageHdr}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: col }} />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: C.txt }}>{c.businessName}</Text>
                        </View>
                        <Chip label={`${fmtMb(estMb)} · ${p}%`} variant={p > 30 ? 'warn' : 'teal'} />
                      </View>
                      <StorageBar pctVal={Math.min(p * 3, 100)} color={col} height={6} />
                      {/* Sub-breakdowns */}
                      <View style={[styles.metricGrid, { marginTop: 10, gap: 6 }]}>
                        {CLIENT_COLS.slice(0, 3).map(({ key, label, color: lc }) => {
                          const subPct = cc[key] ? pct(cc[key], (totals[key] || 1)) : 0;
                          return (
                            <View key={key} style={{ flex: 1 }}>
                              <Text style={{ fontSize: 10, color: C.dim }}>{label.split(' ')[0]}</Text>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: C.txt }}>{fmtCount(cc[key])}</Text>
                              <StorageBar pctVal={subPct} color={lc} height={4} />
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
          }
        </Card>

        {/* Admin overhead */}
        <Card>
          <CardHeader icon="shield-outline" title="Admin overhead" color={C.warn} />
          {[
            { label: 'Config docs',   mb: 6,   col: C.acc  },
            { label: 'Email logs',    mb: 164, col: C.warn },
            { label: 'Index entries', mb: 105, col: C.teal },
            { label: 'Audit logs',    mb: 30,  col: C.dim  },
          ].map(r => (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ width: 100, fontSize: 11, color: C.dim }}>{r.label}</Text>
              <View style={{ flex: 1 }}><StorageBar pctVal={pct(r.mb, 305)} color={r.col} height={6} /></View>
              <Text style={{ width: 50, fontSize: 11, fontWeight: '600', color: C.txt, textAlign: 'right' }}>{r.mb} MB</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <StatRow label="Admin total" value="305 MB" color={C.txt} last />
        </Card>

        {/* Quick wins */}
        <Card>
          <CardHeader icon="flash-outline" title="Quick wins — free up space" color={C.suc} />
          <Text style={styles.desc}>
            Estimated reclaimable space based on your current data.
          </Text>
          {countsLoading
            ? <ActivityIndicator size="small" color={C.teal} />
            : (() => {
                // Real estimate: orders > 6 months old ≈ 40% of orders
                const oldOrdersMb  = (totals.orders * 0.4 * 0.002).toFixed(1);
                const oldEmailsMb  = (totals.emails * 0.3 * 0.005).toFixed(1);
                return (
                  <>
                    <View style={[styles.projRow]}>
                      <Text style={{ fontSize: 12, color: C.dim, flex: 1 }}>Orders older than 6 months (~40%)</Text>
                      <Chip label={`~${oldOrdersMb} MB`} variant="warn" />
                    </View>
                    <View style={[styles.projRow]}>
                      <Text style={{ fontSize: 12, color: C.dim, flex: 1 }}>Processed email logs (90 days)</Text>
                      <Chip label={`~${oldEmailsMb} MB`} variant="warn" />
                    </View>
                    <View style={[styles.projRow, { borderBottomWidth: 0 }]}>
                      <Text style={{ fontSize: 12, color: C.dim, flex: 1 }}>Orphaned documents (run audit)</Text>
                      <Chip label="Run audit" variant="blue" />
                    </View>
                  </>
                );
              })()
          }
          <View style={[styles.row2, { marginTop: 12 }]}>
            <OutlineBtn label="Run audit" icon="scan-outline" onPress={() => { setTab(3); }} />
            <Btn label="Archive old" icon="archive-outline" color={C.teal} onPress={() => setTab(3)} />
          </View>
        </Card>

      </ScrollView>
    );
  };

  /* ════════════════════════════════════════════════════════════════
     TAB 3 — DELETE
  ════════════════════════════════════════════════════════════════ */
  const DeleteTab = () => {
    const cc      = selClient ? cnt(selClient.id) : null;
    const ccReady = !!cc && !countsLoading;
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {result && <ResultBanner />}

        <ClientSelector />

        {!selClient && (
          <View style={styles.noClientMsg}>
            <Ionicons name="person-outline" size={32} color={C.dim} />
            <Text style={{ color: C.dim, fontSize: 13, marginTop: 10, textAlign: 'center' }}>
              Select a client above to see delete options
            </Text>
          </View>
        )}

        {selClient && (
          <>
            {/* Client data summary */}
            <Card>
              <CardHeader icon="analytics-outline" title={`${selClient.businessName} — current data`} color={C.acc} />
              {countsLoading
                ? <ActivityIndicator size="small" color={C.teal} style={{ marginVertical: 10 }} />
                : cc
                  ? CLIENT_COLS.map(({ key, label, color }, i) => (
                      <StatRow key={key} label={label} value={fmtCount(cc[key])} color={color} last={i === CLIENT_COLS.length - 1} />
                    ))
                  : <Text style={styles.empty}>Counts unavailable</Text>
              }
            </Card>

            {/* Delete by date range */}
            <Card>
              <CardHeader icon="calendar-outline" title="Delete by date range" color={C.acc} />
              <Text style={styles.desc}>Permanently remove all orders for {selClient.businessName} between two dates.</Text>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Start date</Text>
                  <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={C.dim} value={startDate} onChangeText={setStartDate} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>End date</Text>
                  <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={C.dim} value={endDate} onChangeText={setEndDate} />
                </View>
              </View>
              <Btn label="Delete orders in range" icon="trash-outline" color={C.acc} onPress={() => triggerDelete('range')} disabled={loading} style={{ marginTop: 10 }} />
            </Card>

            {/* Delete specific order */}
            <Card>
              <CardHeader icon="receipt-outline" title="Delete specific order" color={C.warn} />
              <Text style={styles.desc}>Enter an order number to permanently remove it from {selClient.businessName}.</Text>
              <Text style={styles.label}>Order number</Text>
              <TextInput style={[styles.input, { marginBottom: 12 }]} placeholder="e.g. 254156" placeholderTextColor={C.dim} value={orderNo} onChangeText={setOrderNo} keyboardType="numeric" />
              <Btn label="Delete order" icon="trash-outline" color="#d97706" onPress={() => triggerDelete('order')} disabled={loading} />
            </Card>

            {/* Danger zone */}
            <Card dangerBorder>
              <CardHeader icon="warning-outline" title="Danger zone" color={C.dan} />
              {ccReady && (
                <Text style={styles.desc}>
                  Permanently delete ALL data for {selClient.businessName}:{'\n'}
                  {CLIENT_COLS.map(({ key, label }) => `• ${fmtCount(cc[key])} ${label.toLowerCase()}\n`).join('')}
                  {'\n'}This cannot be undone.
                </Text>
              )}
              <Btn label="Delete everything" icon="trash-outline" color={C.dan} onPress={() => triggerDelete('all')} disabled={loading || !ccReady} />
            </Card>
          </>
        )}

        {loading && <ActivityIndicator size="large" color={C.teal} style={{ marginVertical: 20 }} />}
      </ScrollView>
    );
  };

  /* ════════════════════════════════════════════════════════════════
     TAB 4 — TOOLS
  ════════════════════════════════════════════════════════════════ */
  const ToolsTab = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

      <ClientSelector />

      {/* Export */}
      <Card>
        <CardHeader icon="download-outline" title="Export orders" color={C.suc} />
        <Text style={styles.desc}>
          {selClient
            ? `Export all orders for ${selClient.businessName} and share via your device.`
            : 'Select a client above, then export their orders.'}
        </Text>
        <View style={styles.row2}>
          <OutlineBtn label="Export JSON" icon="code-slash-outline" onPress={() => exportData('json')} disabled={!selClient || toolLoading === 'export'} />
          <OutlineBtn label="Export CSV"  icon="document-text-outline" onPress={() => exportData('csv')}  disabled={!selClient || toolLoading === 'export'} />
        </View>
        {toolLoading === 'export' && <ActivityIndicator size="small" color={C.suc} style={{ marginTop: 10 }} />}
      </Card>

      {/* Archive */}
      <Card>
        <CardHeader icon="archive-outline" title="Archive old orders" color={C.teal} />
        <Text style={styles.desc}>
          Delete orders older than N months for the selected client. Calls your backend range-delete API so index entries are cleaned too.
        </Text>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Months to keep</Text>
            <TextInput style={styles.input} placeholder="e.g. 6" placeholderTextColor={C.dim} value={archiveMonths} onChangeText={setArchiveMonths} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Btn
              label={toolLoading === 'archive' ? 'Running…' : 'Run archive'}
              icon="archive-outline"
              color={C.teal}
              onPress={archiveOldOrders}
              disabled={!selClient || toolLoading === 'archive'}
            />
          </View>
        </View>
        {archiveResult && (
          <View style={[styles.resultBanner, { borderColor: C.tealLt, marginTop: 12, marginBottom: 0 }]}>
            <Ionicons name="checkmark-circle" size={16} color={C.tealLt} />
            <Text style={[styles.resultTxt, { color: C.tealLt }]}>
              Archived {fmtCount(archiveResult.deletedOrders)} orders
              {archiveResult.deletedIndex > 0 ? ` + ${fmtCount(archiveResult.deletedIndex)} index entries` : ''}
              {' '}for {archiveResult.client} (before {archiveResult.cutoff})
            </Text>
          </View>
        )}
      </Card>

      {/* Audit */}
      <Card>
        <CardHeader icon="scan-outline" title="Orphan audit" color={C.warn} />
        <Text style={styles.desc}>
          Scans every collection for documents whose clientId no longer matches any existing client. Useful after deleting a client without cleaning up their data.
        </Text>
        <Btn label={toolLoading === 'audit' ? 'Scanning…' : 'Run audit'} icon="search-outline" color={C.warn} onPress={runAudit} disabled={toolLoading === 'audit'} />
        {toolLoading === 'audit' && <ActivityIndicator size="small" color={C.warn} style={{ marginTop: 10 }} />}

        {auditResult && (
          <View style={{ marginTop: 14 }}>
            <View style={styles.divider} />
            {auditResult.fixed != null && (
              <View style={[styles.resultBanner, { borderColor: C.suc, marginBottom: 10 }]}>
                <Ionicons name="checkmark-circle" size={16} color={C.suc} />
                <Text style={[styles.resultTxt, { color: C.suc }]}>Fixed — deleted {fmtCount(auditResult.fixed)} orphaned documents</Text>
              </View>
            )}
            {auditResult.clean
              ? (
                <View style={[styles.resultBanner, { borderColor: C.suc, marginBottom: 0 }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={C.suc} />
                  <Text style={[styles.resultTxt, { color: C.suc }]}>All clean — no orphaned documents found (at {auditResult.ts})</Text>
                </View>
              )
              : (
                <>
                  <Text style={[styles.label, { marginBottom: 8, color: C.dan }]}>Issues found at {auditResult.ts}:</Text>
                  {auditResult.issues.map(({ label, orphans }) => (
                    <View key={label} style={styles.statRow}>
                      <Text style={styles.statLabel}>{label}</Text>
                      <Chip label={`${orphans} orphaned`} variant="dan" />
                    </View>
                  ))}
                  <Btn label={toolLoading === 'fix' ? 'Fixing…' : 'Fix all orphans'} icon="trash-outline" color={C.dan} onPress={fixOrphans} disabled={toolLoading === 'fix'} style={{ marginTop: 12 }} />
                </>
              )
            }
          </View>
        )}
      </Card>

    </ScrollView>
  );

  /* ════════════════════════════════════════════════════════════════
     CONFIRM MODAL
  ════════════════════════════════════════════════════════════════ */
  const ConfirmModal = () => {
    if (!pendingAction || !selClient) return null;
    const cc = cnt(selClient.id);
    const titles = {
      range: 'Delete orders by date range',
      order: 'Delete specific order',
      all:   '⚠ Delete all client data',
    };
    const bodies = {
      range: `Delete ALL orders for ${selClient.businessName} from ${startDate || '?'} to ${endDate || '?'}?\n\nThis cannot be undone.`,
      order: `Delete order #${orderNo.trim()} for ${selClient.businessName}?\n\nThis cannot be undone.`,
      all:   `Permanently delete EVERYTHING for ${selClient.businessName}:\n\n${CLIENT_COLS.map(({ key, label }) => `• ${fmtCount(cc[key])} ${label.toLowerCase()}`).join('\n')}\n\nThis CANNOT be undone.`,
    };
    return (
      <Modal transparent visible={modalVisible} animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{titles[pendingAction]}</Text>
            <Text style={styles.modalBody}>{bodies[pendingAction]}</Text>
            <View style={styles.row2}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={{ color: C.dim, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: C.dan, flex: 1 }]}
                onPress={() => { setModalVisible(false); executeDelete(); }}
              >
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.btnTxt}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  /* ════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════ */
  const tabComponents = [OverviewTab, StorageTab, DeleteTab, ToolsTab];
  const ActiveTab     = tabComponents[tab];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.topBar, isDesktop && styles.topBarDesktop]}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={17} color={C.txt} />
        </TouchableOpacity>
        <Text style={styles.heading}>Data Management</Text>
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeTxt}>Admin</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, isDesktop && styles.tabBarDesktop]}>
        {TABS.map((t, i) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === i && styles.tabBtnActive]}
            onPress={() => setTab(i)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabTxt, tab === i && styles.tabTxtActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Body */}
      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        <ActiveTab />
      </View>

      <ConfirmModal />
    </View>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: C.bg },

  topBar:            { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  topBarDesktop:     { paddingHorizontal: 32 },
  backBtn:           { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surf, justifyContent: 'center', alignItems: 'center' },
  heading:           { fontSize: 17, fontWeight: '700', color: C.txt, flex: 1 },
  adminBadge:        { backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  adminBadgeTxt:     { fontSize: 10, fontWeight: '700', color: C.dim },

  tabBar:            { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.bg },
  tabBarDesktop:     { paddingHorizontal: 32 },
  tabBtn:            { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: C.surf, alignItems: 'center' },
  tabBtnActive:      { backgroundColor: '#1e3a5f' },
  tabTxt:            { fontSize: 12, fontWeight: '500', color: C.dim },
  tabTxtActive:      { color: C.acc, fontWeight: '700' },

  body:              { flex: 1, paddingHorizontal: 16, paddingTop: 6 },
  bodyDesktop:       { paddingHorizontal: 32 },

  card:              { backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, marginBottom: 12 },
  cardHdr:           { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle:         { fontSize: 13, fontWeight: '700', color: C.txt },

  barTrack:          { backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginVertical: 4 },

  metricGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  metricGridDesktop: { flexWrap: 'nowrap' },
  metricCard:        { flex: 1, minWidth: '45%', backgroundColor: C.surf, borderRadius: 8, padding: 12, alignItems: 'center', minHeight: 68, justifyContent: 'center' },
  metricVal:         { fontSize: 22, fontWeight: '800' },
  metricLbl:         { fontSize: 10, color: C.dim, marginTop: 3, textAlign: 'center' },

  scaleRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  scaleLabel:        { fontSize: 11, color: C.dim },
  scaleVal:          { fontSize: 11, fontWeight: '600' },
  legendRow:         { flexDirection: 'row', gap: 14, flexWrap: 'wrap', marginTop: 12 },

  warnBox:           { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.07)', marginBottom: 12 },
  warnTxt:           { flex: 1, fontSize: 12, color: C.warn, lineHeight: 18 },

  statRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  statLabel:         { fontSize: 12, color: C.dim },
  statValue:         { fontSize: 12, fontWeight: '600', color: C.txt },

  projRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },

  clientStatRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  clientStatName:    { fontSize: 13, fontWeight: '600', color: C.txt },
  clientStorageHdr:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },

  divider:           { borderTopWidth: 1, borderTopColor: C.border, marginVertical: 8 },

  resultBanner:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, borderWidth: 1, backgroundColor: C.bg2, marginBottom: 12 },
  resultTxt:         { fontSize: 12, fontWeight: '600', flex: 1 },

  selectorHdr:       { fontSize: 10, fontWeight: '700', color: C.dim, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  searchWrap:        { position: 'relative', marginBottom: 10 },
  searchIcon:        { position: 'absolute', left: 10, top: 11, zIndex: 1 },
  searchInput:       { backgroundColor: C.surf, borderWidth: 1, borderColor: C.border, borderRadius: 7, paddingVertical: 10, paddingLeft: 32, paddingRight: 12, fontSize: 13, color: C.txt },
  clientItem:        { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.surf, borderWidth: 1, borderColor: 'transparent' },
  clientItemSel:     { borderColor: C.teal, backgroundColor: 'rgba(15,118,110,0.12)' },
  clientItemRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientName:        { fontSize: 13, fontWeight: '700', color: C.txt },
  clientMeta:        { fontSize: 11, color: C.dim, marginTop: 2 },

  desc:              { fontSize: 12, color: C.dim, lineHeight: 18, marginBottom: 12 },
  label:             { fontSize: 11, fontWeight: '600', color: C.dim, marginBottom: 5 },
  input:             { backgroundColor: C.surf, borderWidth: 1, borderColor: C.border, borderRadius: 7, paddingVertical: 10, paddingHorizontal: 12, fontSize: 13, color: C.txt },
  row2:              { flexDirection: 'row', gap: 10 },

  btn:               { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: 7 },
  btnTxt:            { color: '#fff', fontWeight: '700', fontSize: 13 },
  outlineBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 7, borderWidth: 1, borderColor: C.border, backgroundColor: C.surf },
  outlineBtnTxt:     { color: C.dim, fontWeight: '600', fontSize: 12 },

  noClientMsg:       { alignItems: 'center', paddingVertical: 40 },
  empty:             { textAlign: 'center', color: C.dim, fontSize: 13, padding: 20 },

  modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox:          { backgroundColor: C.bg2, borderWidth: 1, borderColor: 'rgba(248,113,113,0.4)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 380 },
  modalTitle:        { fontSize: 15, fontWeight: '700', color: C.txt, marginBottom: 10 },
  modalBody:         { fontSize: 12, color: C.dim, lineHeight: 20, marginBottom: 18 },
  modalCancelBtn:    { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 11, borderRadius: 7, borderWidth: 1, borderColor: C.border },
});