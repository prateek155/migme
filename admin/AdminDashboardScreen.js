import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  StatusBar,
  Platform,
  ScrollView,
  useWindowDimensions,
  RefreshControl,
} from "react-native";
import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  query,
  getDocs,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../src/firebaseConfig";

// ── colour tokens ─────────────────────────────────────────────────────────
const C = {
  bg: "#060d1a",
  bgCard: "#0c1526",
  surface: "rgba(255,255,255,0.05)",
  surfaceHigh: "rgba(255,255,255,0.09)",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
  accent: "#3b82f6",
  accentSoft: "rgba(59,130,246,0.14)",
  accentGlow: "rgba(59,130,246,0.25)",
  teal: "#0f766e",
  tealSoft: "rgba(15,118,110,0.18)",
  success: "#22c55e",
  successSoft: "rgba(34,197,94,0.12)",
  warn: "#f59e0b",
  warnSoft: "rgba(245,158,11,0.12)",
  danger: "#f87171",
  dangerSoft: "rgba(248,113,113,0.10)",
  purple: "#a78bfa",
  purpleSoft: "rgba(167,139,250,0.12)",
  textPrimary: "#f0f6ff",
  textSecond: "rgba(240,246,255,0.50)",
  textThird: "rgba(240,246,255,0.25)",
};

const MOBILE_BP = 600;

// ── Pulse dot ─────────────────────────────────────────────────────────────
function PulseDot({ color = C.success }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.5,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <View
      style={{
        width: 10,
        height: 10,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color,
          opacity: 0.3,
          transform: [{ scale: pulse }],
        }}
      />
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }}
      />
    </View>
  );
}

// ── Animated number counter ───────────────────────────────────────────────
function AnimatedNumber({ value, style, prefix = "", suffix = "" }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(anim, {
      toValue: value,
      duration: 900,
      useNativeDriver: false,
    }).start();
    return () => anim.removeAllListeners();
  }, [value]);
  return (
    <Text style={style}>
      {prefix}
      {display}
      {suffix}
    </Text>
  );
}

// ── Mini sparkline bar chart ──────────────────────────────────────────────
function SparkBars({ data = [], color = C.accent, height = 28 }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  return (
    <View
      style={{ flexDirection: "row", alignItems: "flex-end", height, gap: 2 }}
    >
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(2, (v / max) * height),
            backgroundColor: color,
            borderRadius: 2,
            opacity: 0.6 + (i / data.length) * 0.4,
          }}
        />
      ))}
    </View>
  );
}

// ── Progress ring (SVG-less, CSS trick) ──────────────────────────────────
function ProgressRing({
  pct = 0,
  size = 56,
  color = C.accent,
  label,
  sublabel,
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [pct]);
  const rotate = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0deg", "360deg"],
  });
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${color}18`,
          borderWidth: 3,
          borderColor: `${color}30`,
          justifyContent: "center",
          alignItems: "center",
          overflow: "visible",
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 3,
            borderColor: "transparent",
            borderTopColor: color,
            transform: [{ rotate }],
          }}
        />
        <Text style={{ fontSize: 11, fontWeight: "800", color }}>{pct}%</Text>
      </View>
      {label && (
        <Text
          style={{
            fontSize: 10,
            color: C.textSecond,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {label}
        </Text>
      )}
      {sublabel && (
        <Text style={{ fontSize: 9, color: C.textThird }}>{sublabel}</Text>
      )}
    </View>
  );
}

// ── Metric tile ───────────────────────────────────────────────────────────
function MetricTile({
  icon,
  label,
  value,
  sub,
  color,
  spark,
  pct,
  wide = false,
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.metricTile,
        wide && styles.metricTileWide,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          borderColor: `${color}25`,
        },
      ]}
    >
      <View style={styles.metricTileTop}>
        <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon} size={15} color={color} />
        </View>
        {pct !== undefined && (
          <ProgressRing pct={pct} size={42} color={color} />
        )}
      </View>
      <AnimatedNumber
        value={typeof value === "number" ? value : 0}
        style={[styles.metricValue, { color }]}
        prefix={typeof value === "string" ? value : ""}
      />
      {typeof value === "string" && (
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
      )}
      <Text style={styles.metricLabel}>{label}</Text>
      {sub && <Text style={styles.metricSub}>{sub}</Text>}
      {spark && (
        <View style={{ marginTop: 8 }}>
          <SparkBars data={spark} color={color} />
        </View>
      )}
    </Animated.View>
  );
}

// ── Section header ────────────────────────────────────────────────────────
function SectionHeader({ icon, title, sub, color = C.accent }) {
  return (
    <View style={styles.sectionHeader}>
      <View
        style={[
          styles.sectionIconBox,
          { backgroundColor: `${color}18`, borderColor: `${color}30` },
        ]}
      >
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {sub && <Text style={styles.sectionSub}>{sub}</Text>}
      </View>
    </View>
  );
}

// ── Client row ────────────────────────────────────────────────────────────
function ClientRow({ item, index, onPress, onDelete }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const isActive = item.active !== false;
  const initials = (item.businessName || "??")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const statusColor = isActive ? C.success : C.danger;

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
      }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPressIn={() =>
          Animated.spring(scaleAnim, {
            toValue: 0.985,
            useNativeDriver: true,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
          }).start()
        }
        onPress={() => onPress(item)}
        style={styles.clientRow}
      >
        <View
          style={[styles.clientRowAccent, { backgroundColor: statusColor }]}
        />
        <View
          style={[
            styles.clientAvatar,
            {
              backgroundColor: `${statusColor}15`,
              borderColor: `${statusColor}40`,
            },
          ]}
        >
          <Text style={[styles.clientAvatarText, { color: statusColor }]}>
            {initials}
          </Text>
        </View>
        <View style={styles.clientRowMain}>
          <View style={styles.clientRowTop}>
            <Text style={styles.clientName} numberOfLines={1}>
              {item.businessName}
            </Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: `${statusColor}15`,
                  borderColor: `${statusColor}35`,
                },
              ]}
            >
              <PulseDot color={statusColor} />
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {isActive ? "ACTIVE" : "INACTIVE"}
              </Text>
            </View>
          </View>
          <Text style={styles.clientEmail} numberOfLines={1}>
            {item.email}
          </Text>
          <Text style={styles.clientDate}>
            {item.createdAt
              ? `Joined ${new Date(item.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
              : "No date"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(item)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="trash-outline" size={14} color={C.danger} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── System health bar ─────────────────────────────────────────────────────
function HealthBar({ label, pct, color }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 1000,
      delay: 200,
      useNativeDriver: false,
    }).start();
  }, [pct]);
  const width = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });
  return (
    <View style={styles.healthBarRow}>
      <Text style={styles.healthBarLabel}>{label}</Text>
      <View style={styles.healthBarTrack}>
        <Animated.View
          style={[styles.healthBarFill, { width, backgroundColor: color }]}
        />
      </View>
      <Text style={[styles.healthBarPct, { color }]}>{pct}%</Text>
    </View>
  );
}

// ── Activity log item ─────────────────────────────────────────────────────
function ActivityItem({ icon, color, title, time, dot }) {
  return (
    <View style={styles.activityItem}>
      <View
        style={[
          styles.activityDot,
          { backgroundColor: `${color}20`, borderColor: `${color}40` },
        ]}
      >
        <Ionicons name={icon} size={12} color={color} />
      </View>
      <View style={styles.activityLine} />
      <View style={{ flex: 1 }}>
        <Text style={styles.activityTitle}>{title}</Text>
        <Text style={styles.activityTime}>{time}</Text>
      </View>
      {dot && <PulseDot color={color} />}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── MAIN SCREEN ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminDashboardScreen({ onNavigate, onLogout }) {
  const [clients, setClients] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [systemUptime] = useState(() => Math.floor(Math.random() * 30) + 70); // simulated
  const [avgResponseMs] = useState(() => Math.floor(Math.random() * 120) + 80);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  // New system monitoring states
  const [systemHealth, setSystemHealth] = useState(null);
  const [systemLoad, setSystemLoad] = useState(0);
  const [vendorMetrics, setVendorMetrics] = useState([]);
  const [securityEvents, setSecurityEvents] = useState(0);

  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BP;

  const headerFade = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, {
        toValue: 1,
        duration: 550,
        useNativeDriver: true,
      }),
      Animated.timing(contentSlide, {
        toValue: 0,
        duration: 550,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Subscribe clients
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "clients")),
      (snap) => {
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setLastSyncTime(new Date());
      },
      (err) => {
        Alert.alert("Firestore Error", err.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  // Subscribe orders (all) for analytics
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "orders")), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Fetch system health from backend
  const fetchSystemHealth = useCallback(async () => {
    try {
      const BACKEND_URL =
        process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3000";
      const ADMIN_KEY =
        process.env.EXPO_PUBLIC_ADMIN_KEY ||
        "a3f8c2e1d94b7056f2a1c8e3b5d7f9a2c4e6b8d0f1a3c5e7b9d2f4a6c8e0b2d4";

      // Fetch health
      const healthRes = await fetch(`${BACKEND_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setSystemHealth(healthData);
        setSystemLoad(Math.min(100, (healthData.memoryUsageMB || 0) / 5)); // Convert to 0-100 scale
      }

      // Fetch vendor metrics
      const vendorRes = await fetch(`${BACKEND_URL}/api/metrics/vendors`, {
        headers: { "x-admin-key": ADMIN_KEY },
        signal: AbortSignal.timeout(5000),
      });
      if (vendorRes.ok) {
        const vendorData = await vendorRes.json();
        const vendorList = Object.entries(vendorData)
          .slice(0, 5)
          .map(([name, data]) => ({
            name,
            total: data.total || 0,
            success: data.success || 0,
            successRate:
              data.total > 0
                ? Math.round((data.success / data.total) * 100)
                : 100,
          }));
        setVendorMetrics(vendorList);
      }

      // Fetch security events count
      const securityRes = await fetch(`${BACKEND_URL}/api/security/audit`, {
        headers: { "x-admin-key": ADMIN_KEY },
        signal: AbortSignal.timeout(5000),
      });
      if (securityRes.ok) {
        const securityData = await securityRes.json();
        setSecurityEvents((securityData.events || []).length);
      }
    } catch (error) {
      // Silently fail - backend may not be available
      console.log("System health fetch failed:", error.message);
    }
  }, []);

  useEffect(() => {
    fetchSystemHealth();
    const interval = setInterval(fetchSystemHealth, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [fetchSystemHealth]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSystemHealth();
    setTimeout(() => {
      setRefreshing(false);
      setLastSyncTime(new Date());
    }, 1200);
  }, [fetchSystemHealth]);

  // ── Derived analytics ────────────────────────────────────────────────────
  const activeClients = clients.filter((c) => c.active !== false).length;
  const inactiveClients = clients.length - activeClients;

  const totalOrders = orders.length;
  const activeOrders = orders.filter((o) => o.status === "Active").length;
  const completedOrders = orders.filter((o) => o.status === "Completed").length;
  const cancelledOrders = orders.filter((o) => o.status === "Cancelled").length;

  const completionRate =
    totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;
  const cancellationRate =
    totalOrders > 0 ? Math.round((cancelledOrders / totalOrders) * 100) : 0;
  const systemEfficiency = Math.max(0, 100 - cancellationRate);

  // Revenue estimate
  const totalRevenue = orders.reduce(
    (sum, o) => sum + (parseFloat(o.totalAmount) || 0),
    0,
  );
  const avgOrderValue =
    totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Orders per client (load balance)
  const ordersPerClient =
    clients.length > 0 ? (totalOrders / clients.length).toFixed(1) : 0;

  // Spark data: last 7 days order counts (simulated from real data)
  const today = new Date();
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const dateStr = d.toISOString().split("T")[0];
    return orders.filter(
      (o) => o.deliveryDate && o.deliveryDate.startsWith(dateStr),
    ).length;
  });

  // COD vs Online split
  const codTypes = ["COD", "CASH", "CASH_ON_DELIVERY"];
  const codOrders = orders.filter((o) =>
    codTypes.includes((o.paymentType || "").toUpperCase().replace(/\s+/g, "_")),
  ).length;
  const onlineOrders = totalOrders - codOrders;
  const codPct =
    totalOrders > 0 ? Math.round((codOrders / totalOrders) * 100) : 0;

  // ── Delete handler ────────────────────────────────────────────────────────
  const handleDeleteClient = (client) => {
    const doDelete = async () => {
      try {
        // Cleanup associated data via backend (best-effort)
        try {
          const adminKey = process.env.EXPO_PUBLIC_ADMIN_API_KEY || "";
          await fetch(
            `${process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3000"}/api/data/client/${client.id}/all`,
            {
              method: "DELETE",
              headers: { "x-admin-key": adminKey },
            },
          );
        } catch (_) {
          /* backend may be unreachable — still delete the client doc */
        }
        await deleteDoc(doc(db, "clients", client.id));
      } catch (e) {
        Alert.alert("Error", e.message);
      }
    };
    if (Platform.OS === "web") {
      if (
        window.confirm(
          `Delete "${client.businessName}" and their data permanently?`,
        )
      )
        doDelete();
    } else {
      Alert.alert(
        "Delete Client",
        `Remove "${client.businessName}" and their data?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete Everything",
            style: "destructive",
            onPress: doDelete,
          },
        ],
      );
    }
  };

  const syncTimeStr = lastSyncTime.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* decorative blobs */}
      <View
        style={[
          styles.blob,
          {
            top: -100,
            left: -80,
            width: 280,
            height: 280,
            backgroundColor: "rgba(59,130,246,0.08)",
          },
        ]}
      />
      <View
        style={[
          styles.blob,
          {
            top: 60,
            right: -90,
            width: 220,
            height: 220,
            backgroundColor: "rgba(15,118,110,0.07)",
          },
        ]}
      />
      <View
        style={[
          styles.blob,
          {
            bottom: 80,
            left: "25%",
            width: 180,
            height: 180,
            backgroundColor: "rgba(59,130,246,0.05)",
          },
        ]}
      />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          isMobile && styles.scrollContentMobile,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
      >
        {/* ── HEADER ── */}
        <Animated.View
          style={[
            styles.header,
            isMobile && styles.headerMobile,
            { opacity: headerFade },
          ]}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.headerTopRow}>
              <Text style={styles.headerLabel}>MIGME ADMIN</Text>
              <View style={styles.liveChip}>
                <PulseDot color={C.success} />
                <Text style={styles.liveChipText}>LIVE</Text>
              </View>
            </View>
            <Text
              style={[styles.headerTitle, isMobile && styles.headerTitleMobile]}
            >
              Client Management
            </Text>
            <Text style={styles.syncText}>Last sync: {syncTimeStr}</Text>
          </View>
          <View
            style={[
              styles.headerActions,
              isMobile && styles.headerActionsMobile,
            ]}
          >
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => onNavigate("AddClient")}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Add Client</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── CLIENT STAT CARDS ── */}
        <Animated.View
          style={{
            opacity: headerFade,
            transform: [{ translateY: contentSlide }],
          }}
        >
          <View style={[styles.statRow, isMobile && styles.statRowMobile]}>
            {[
              {
                icon: "people",
                label: "Total Clients",
                value: clients.length,
                color: C.accent,
              },
              {
                icon: "checkmark-circle",
                label: "Active",
                value: activeClients,
                color: C.success,
              },
              {
                icon: "pause-circle",
                label: "Inactive",
                value: inactiveClients,
                color: C.danger,
              },
            ].map((s, i) => (
              <View
                key={i}
                style={[
                  styles.statCard,
                  isMobile && styles.statCardMobile,
                  { borderColor: `${s.color}25` },
                ]}
              >
                <View
                  style={[
                    styles.statIconBox,
                    { backgroundColor: `${s.color}15` },
                  ]}
                >
                  <Ionicons name={s.icon} size={17} color={s.color} />
                </View>
                <AnimatedNumber
                  value={s.value}
                  style={[styles.statValue, { color: s.color }]}
                />
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── SYSTEM HEALTH & LOAD ── */}
        <View style={styles.divider} />
        <SectionHeader
          icon="speedometer-outline"
          title="System Health & Load"
          sub="Real-time backend monitoring"
          color={C.purple}
        />

        {systemHealth && (
          <View
            style={[styles.metricsGrid, isMobile && styles.metricsGridMobile]}
          >
            <MetricTile
              icon="hardware-chip-outline"
              label="Memory Usage"
              value={`${systemHealth.memoryUsageMB || 0}MB`}
              color={systemHealth.memoryUsageMB > 400 ? C.danger : C.success}
              sub={`${Math.round((systemHealth.memoryUsageMB / 500) * 100)}% of limit`}
            />
            <MetricTile
              icon="speedometer-outline"
              label="System Load"
              value={`${Math.round(systemLoad)}%`}
              color={
                systemLoad > 80
                  ? C.danger
                  : systemLoad > 60
                    ? C.warn
                    : C.success
              }
              pct={Math.round(systemLoad)}
            />
            <MetricTile
              icon="time-outline"
              label="Uptime"
              value={systemHealth.uptimeFormatted || "N/A"}
              color={C.teal}
              sub="Since last restart"
            />
            <MetricTile
              icon="server-outline"
              label="Active Pollers"
              value={systemHealth.activePollers || 0}
              color={C.accent}
              sub="IMAP connections"
            />
            <MetricTile
              icon="shield-checkmark-outline"
              label="Security Events"
              value={securityEvents}
              color={securityEvents > 10 ? C.danger : C.success}
              sub="Last 24 hours"
            />
          </View>
        )}

        {/* ── VENDOR PERFORMANCE ── */}
        {vendorMetrics.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <SectionHeader
              icon="cube-outline"
              title="Top Vendor Performance"
              sub="Order processing metrics"
              color={C.accent}
            />
            <View
              style={[styles.metricsGrid, isMobile && styles.metricsGridMobile]}
            >
              {vendorMetrics.map((vendor, idx) => (
                <MetricTile
                  key={idx}
                  icon="receipt-outline"
                  label={vendor.name}
                  value={vendor.total}
                  color={
                    vendor.successRate > 90
                      ? C.success
                      : vendor.successRate > 70
                        ? C.warn
                        : C.danger
                  }
                  pct={vendor.successRate}
                  sub={`${vendor.success}/${vendor.total} successful`}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── SYSTEM ANALYTICS HEADER ── */}
        <View style={styles.divider} />
        <SectionHeader
          icon="pulse-outline"
          title="Order Analytics"
          sub="Real-time platform intelligence"
          color={C.teal}
        />

        {/* ── ORDER METRICS GRID ── */}
        <View
          style={[styles.metricsGrid, isMobile && styles.metricsGridMobile]}
        >
          <MetricTile
            icon="receipt-outline"
            label="Total Orders"
            value={totalOrders}
            color={C.accent}
            spark={last7}
            wide={isMobile}
          />
          <MetricTile
            icon="flash-outline"
            label="Active Now"
            value={activeOrders}
            color={C.warn}
            pct={
              totalOrders > 0
                ? Math.round((activeOrders / totalOrders) * 100)
                : 0
            }
          />
          <MetricTile
            icon="checkmark-done-outline"
            label="Completed"
            value={completedOrders}
            color={C.success}
            pct={completionRate}
          />
          <MetricTile
            icon="close-circle-outline"
            label="Cancelled"
            value={cancelledOrders}
            color={C.danger}
            pct={cancellationRate}
          />
          <MetricTile
            icon="trending-up-outline"
            label="Total Revenue"
            value={`₹${Math.round(totalRevenue).toLocaleString()}`}
            color={C.teal}
          />
          <MetricTile
            icon="calculator-outline"
            label="Avg Order Value"
            value={`₹${avgOrderValue}`}
            color={C.purple}
          />
          <MetricTile
            icon="layers-outline"
            label="Orders / Client"
            value={ordersPerClient}
            color={C.accent}
            sub="load balance"
          />
          <MetricTile
            icon="time-outline"
            label="Avg Response"
            value={`${avgResponseMs}ms`}
            color={C.warn}
            sub="system latency"
          />
        </View>

        {/* ── SYSTEM EFFICIENCY ── */}
        <View style={styles.divider} />
        <SectionHeader
          icon="speedometer-outline"
          title="System Efficiency"
          sub="Performance indicators"
          color={C.accent}
        />

        <View
          style={[
            styles.efficiencyBlock,
            isMobile && styles.efficiencyBlockMobile,
          ]}
        >
          {/* Health bars */}
          <View
            style={[
              styles.efficiencyCard,
              isMobile && styles.efficiencyCardFull,
            ]}
          >
            <Text style={styles.cardInnerTitle}>Performance Scale</Text>
            <HealthBar
              label="Order Fulfillment"
              pct={completionRate}
              color={C.success}
            />
            <HealthBar
              label="System Efficiency"
              pct={systemEfficiency}
              color={C.teal}
            />
            <HealthBar
              label="Client Activation"
              pct={
                clients.length > 0
                  ? Math.round((activeClients / clients.length) * 100)
                  : 0
              }
              color={C.accent}
            />
            <HealthBar
              label="COD Collection Rate"
              pct={codPct}
              color={C.warn}
            />
          </View>

          {/* Payment split */}
          <View
            style={[
              styles.efficiencyCard,
              isMobile && styles.efficiencyCardFull,
            ]}
          >
            <Text style={styles.cardInnerTitle}>Payment Distribution</Text>
            <View style={styles.paymentSplitRow}>
              <ProgressRing
                pct={codPct}
                size={64}
                color={C.warn}
                label="COD"
                sublabel={`${codOrders} orders`}
              />
              <ProgressRing
                pct={100 - codPct}
                size={64}
                color={C.accent}
                label="Online"
                sublabel={`${onlineOrders} orders`}
              />
              <ProgressRing
                pct={completionRate}
                size={64}
                color={C.success}
                label="Fill Rate"
                sublabel="completion"
              />
            </View>
            <View style={styles.uptimeRow}>
              <Ionicons name="server-outline" size={13} color={C.teal} />
              <Text style={styles.uptimeText}>
                System uptime:{" "}
                <Text style={{ color: C.teal, fontWeight: "700" }}>
                  {systemUptime}%
                </Text>
              </Text>
            </View>
          </View>
        </View>

        {/* ── ORDER TREND ── */}
        <View style={styles.divider} />
        <SectionHeader
          icon="bar-chart-outline"
          title="7-Day Order Trend"
          sub="Daily order volume"
          color={C.purple}
        />
        <View style={styles.trendCard}>
          <View style={styles.trendBarsRow}>
            {(() => {
              const max = Math.max(...last7, 1);
              const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
              const todayIdx = (new Date().getDay() + 6) % 7;
              return last7.map((v, i) => (
                <View key={i} style={styles.trendBarCol}>
                  <Text style={styles.trendBarValue}>{v || ""}</Text>
                  <View style={styles.trendBarTrack}>
                    <View
                      style={[
                        styles.trendBarFill,
                        {
                          height: `${Math.max(4, (v / max) * 100)}%`,
                          backgroundColor: i === todayIdx ? C.teal : C.accent,
                          opacity: i === todayIdx ? 1 : 0.55,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.trendBarDay,
                      i === todayIdx && { color: C.teal, fontWeight: "700" },
                    ]}
                  >
                    {days[i]}
                  </Text>
                </View>
              ));
            })()}
          </View>
        </View>

        {/* ── RECENT ACTIVITY ── */}
        <View style={styles.divider} />
        <SectionHeader
          icon="time-outline"
          title="Recent Activity"
          sub="System event log"
          color={C.warn}
        />
        <View style={styles.activityCard}>
          {clients.slice(0, 4).map((c, i) => (
            <ActivityItem
              key={c.id}
              icon={i === 0 ? "person-add-outline" : "checkmark-circle-outline"}
              color={i === 0 ? C.success : C.accent}
              title={`${c.businessName} ${i === 0 ? "joined" : "active"}`}
              time={
                c.createdAt
                  ? new Date(c.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })
                  : "Recently"
              }
              dot={i === 0}
            />
          ))}
          {clients.length === 0 && (
            <Text style={{ color: C.textThird, fontSize: 12, padding: 8 }}>
              No activity yet
            </Text>
          )}
        </View>

        {/* ── CLIENT LIST ── */}
        <View style={styles.divider} />
        <SectionHeader
          icon="people-outline"
          title="All Clients"
          sub={`${clients.length} registered`}
          color={C.success}
        />

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : clients.length === 0 ? (
          <View style={styles.centered}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={28} color={C.textThird} />
            </View>
            <Text style={styles.emptyTitle}>No clients yet</Text>
            <Text style={styles.emptyText}>
              Add your first client to get started
            </Text>
          </View>
        ) : (
          <View style={styles.clientList}>
            {clients.map((item, index) => (
              <View key={item.id} style={{ marginBottom: 8 }}>
                <ClientRow
                  item={item}
                  index={index}
                  onPress={(c) => onNavigate("ClientDetail", { client: c })}
                  onDelete={handleDeleteClient}
                />
              </View>
            ))}
          </View>
        )}

        {/* bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  blob: { position: "absolute", borderRadius: 999 },

  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
  scrollContentMobile: { paddingHorizontal: 14, paddingTop: 16 },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 12,
  },
  headerMobile: { flexDirection: "column", gap: 14 },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    color: C.teal,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: C.textPrimary,
    letterSpacing: -0.5,
  },
  headerTitleMobile: { fontSize: 22 },
  syncText: { fontSize: 10, color: C.textThird, marginTop: 4 },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.successSoft,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
  },
  liveChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: C.success,
    letterSpacing: 1.5,
  },
  headerActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  headerActionsMobile: { flexDirection: "row", justifyContent: "flex-start" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.teal,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // ── Stat cards ───────────────────────────────────────────────────────────
  statRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  statRowMobile: { gap: 8 },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
  },
  statCardMobile: { paddingVertical: 12 },
  statIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  statValue: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: {
    fontSize: 10,
    color: C.textSecond,
    fontWeight: "600",
    letterSpacing: 0.8,
    textAlign: "center",
  },

  // ── Divider ──────────────────────────────────────────────────────────────
  divider: { height: 1, backgroundColor: C.border, marginVertical: 20 },

  // ── Section header ────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  sectionIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  sectionSub: { fontSize: 11, color: C.textThird, marginTop: 1 },

  // ── Metric tiles ──────────────────────────────────────────────────────────
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  metricsGridMobile: { gap: 8 },
  metricTile: {
    width: "22%",
    minWidth: 110,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  metricTileWide: { width: "100%" },
  metricTileTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  metricValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  metricLabel: {
    fontSize: 10,
    color: C.textSecond,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  metricSub: { fontSize: 9, color: C.textThird },

  // ── Efficiency block ──────────────────────────────────────────────────────
  efficiencyBlock: { flexDirection: "row", gap: 10 },
  efficiencyBlockMobile: { flexDirection: "column" },
  efficiencyCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  efficiencyCardFull: { flex: undefined, width: "100%" },
  cardInnerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.textSecond,
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  // ── Health bars ───────────────────────────────────────────────────────────
  healthBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  healthBarLabel: {
    fontSize: 11,
    color: C.textSecond,
    width: 120,
    fontWeight: "600",
  },
  healthBarTrack: {
    flex: 1,
    height: 5,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  healthBarFill: { height: "100%", borderRadius: 3 },
  healthBarPct: {
    fontSize: 11,
    fontWeight: "700",
    width: 34,
    textAlign: "right",
  },

  // ── Payment split ──────────────────────────────────────────────────────────
  paymentSplitRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-start",
  },
  uptimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  uptimeText: { fontSize: 11, color: C.textSecond },

  // ── Trend chart ────────────────────────────────────────────────────────────
  trendCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  trendBarsRow: {
    flexDirection: "row",
    height: 80,
    alignItems: "flex-end",
    gap: 6,
  },
  trendBarCol: { flex: 1, alignItems: "center", gap: 4 },
  trendBarValue: { fontSize: 9, color: C.textThird, height: 12 },
  trendBarTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  trendBarFill: { width: "100%", borderRadius: 3 },
  trendBarDay: { fontSize: 9, color: C.textThird, fontWeight: "600" },

  // ── Activity log ──────────────────────────────────────────────────────────
  activityCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 2,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  activityDot: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  activityLine: { width: 0 },
  activityTitle: { fontSize: 12, fontWeight: "600", color: C.textPrimary },
  activityTime: { fontSize: 10, color: C.textThird, marginTop: 1 },

  // ── Client list ────────────────────────────────────────────────────────────
  clientList: {},
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingRight: 12,
    overflow: "hidden",
  },
  clientRowAccent: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 12,
    flexShrink: 0,
  },
  clientAvatarText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  clientRowMain: { flex: 1, paddingVertical: 13 },
  clientRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 3,
  },
  clientName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  clientEmail: { fontSize: 11, color: C.textSecond, marginBottom: 2 },
  clientDate: { fontSize: 10, color: C.textThird },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.dangerSoft,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },

  // ── States ─────────────────────────────────────────────────────────────────
  centered: { paddingVertical: 40, alignItems: "center", gap: 10 },
  loadingText: { fontSize: 12, color: C.textSecond },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.textPrimary },
  emptyText: { fontSize: 12, color: C.textSecond },
});
