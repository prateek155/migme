import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform,
  ActivityIndicator, Animated, TouchableWithoutFeedback, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth } from './src/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ClientLoginScreen from './src/screens/ClientLoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import DailyBusinessScreen from './src/screens/DailyBusinessScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import AddOrderScreen from './src/screens/AddOrderScreen';
import MenuScreen from './src/screens/MenuScreen';
import DeliveryExecutiveScreen from './src/screens/DeliveryExecutiveScreen';
import FilteredOrdersScreen from './src/screens/FilteredOrdersScreen';
import ClientSettingsScreen from './src/screens/ClientSettingsScreen';

// ─── Sidebar layout constants ─────────────────────────────────────────────────
const SIDEBAR_EXPANDED  = 240;
const SIDEBAR_COLLAPSED = 56;
const MOBILE_BP         = 768;
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser]                       = useState(null);
  const [role, setRole]                       = useState(null); // ✅ FIXED: added role state
  const [loading, setLoading]                 = useState(true);
  const [currentScreen, setCurrentScreen]     = useState('Dashboard');
  const [dailyBizVisible, setDailyBizVisible] = useState(false);

  // Sidebar collapsed state (desktop only)
  const [collapsed, setCollapsed]             = useState(false);
  // Mobile sidebar open state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { width: screenWidth } = useWindowDimensions();
  const isMobile = screenWidth < MOBILE_BP;

  // Animated sidebar width
  const sidebarAnim = useRef(new Animated.Value(SIDEBAR_EXPANDED)).current;
  // Animated overlay opacity for mobile
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // ── Animate sidebar width on collapse/expand (desktop) ──
  useEffect(() => {
    if (isMobile) return;
    Animated.timing(sidebarAnim, {
      toValue: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [collapsed, isMobile]);

  // ── Animate mobile sidebar + overlay ──
  useEffect(() => {
    if (!isMobile) {
      setMobileSidebarOpen(false);
      overlayAnim.setValue(0);
      sidebarAnim.setValue(collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED);
      return;
    }
    Animated.parallel([
      Animated.timing(sidebarAnim, {
        toValue: mobileSidebarOpen ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED,
        duration: 220,
        useNativeDriver: false,
      }),
      Animated.timing(overlayAnim, {
        toValue: mobileSidebarOpen ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [mobileSidebarOpen, isMobile]);

  // Label / logo text opacity
  const labelOpacity = sidebarAnim.interpolate({
    inputRange: [SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const handleToggle = () => {
    if (isMobile) {
      setMobileSidebarOpen(v => !v);
    } else {
      setCollapsed(v => !v);
    }
  };

  const closeMobile = () => setMobileSidebarOpen(false);

  // ─── Session restore ─────────────────────────────────────────────────────
  useEffect(() => {
    const loadSession = async () => {
      try {
        const userData = await AsyncStorage.getItem('migme_user');
        const roleData = await AsyncStorage.getItem('migme_role'); // ✅ FIXED: restore role
        if (userData && roleData) {
          setUser(JSON.parse(userData));
          setRole(roleData); // ✅ FIXED: set role from storage
        }
      } catch (e) { console.error('App.js loadSession error:', e); }
      setLoading(false);
    };
    loadSession();
  }, []);

  // ✅ FIXED: handleLogin now accepts and sets role
  const handleLogin = async (userData, userRole) => {
    setUser(userData);
    setRole(userRole); // ✅ FIXED: set role state
    await AsyncStorage.setItem('migme_user', JSON.stringify(userData));
    await AsyncStorage.setItem('migme_role', userRole || 'client');
  };

  const handleLogout = async () => {
    setUser(null);
    setRole(null); // ✅ FIXED: clear role on logout
    setCurrentScreen('Dashboard');
    setMobileSidebarOpen(false);
    try { await signOut(auth); } catch (_) {}
    await AsyncStorage.removeItem('migme_user');
    await AsyncStorage.removeItem('migme_role');
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  // ─── No user: client login ────────────────────────────────────────────────
  if (!user || !role) {
    return (
      <View style={{ flex: 1 }}>
        <ClientLoginScreen onLogin={handleLogin} />
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Shared sidebar shell ─────────────────────────────────────────────────
  const SidebarShell = ({ bgColor, borderColor, children }) => (
    <>
      {isMobile && mobileSidebarOpen && (
        <Animated.View
          pointerEvents="auto"
          style={[styles.mobileOverlay, { opacity: overlayAnim }]}
        >
          <TouchableWithoutFeedback onPress={closeMobile}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
        </Animated.View>
      )}

      <Animated.View
        style={[
          styles.sidebar,
          {
            width: sidebarAnim,
            backgroundColor: bgColor,
            borderRightColor: borderColor,
            ...(isMobile && mobileSidebarOpen ? {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              zIndex: 100,
              elevation: 20,
              shadowColor: '#000',
              shadowOffset: { width: 4, height: 0 },
              shadowOpacity: 0.18,
              shadowRadius: 12,
            } : {}),
          },
        ]}
      >
        {children}
      </Animated.View>
    </>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── CLIENT VIEW ──────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  const clientId = user?.uid || user?.id;

  const renderClientContent = () => {
    switch (currentScreen) {
      case 'Dashboard':     return <DashboardScreen clientId={clientId} />;
      case 'Add Order':     return <AddOrderScreen onNavigate={setCurrentScreen} clientId={clientId} />;
      case 'Menu':          return <MenuScreen clientId={clientId} />;
      case 'Reports':       return <ReportsScreen clientId={clientId} />;
      case 'Delivered':     return <FilteredOrdersScreen statusFilter="Completed" title="Delivered Orders" clientId={clientId} />;
      case 'Cancelled':     return <FilteredOrdersScreen statusFilter="Cancelled" title="Cancelled Orders" clientId={clientId} />;
      case 'Delivery Team': return <DeliveryExecutiveScreen clientId={clientId} />;
      case 'Settings':      return <ClientSettingsScreen clientId={clientId} clientEmail={user?.email || ''} onNavigate={setCurrentScreen} />;
      default:              return <DashboardScreen clientId={clientId} />;
    }
  };

  const ClientNavItem = ({ icon, label, screen }) => {
    const isActive = currentScreen === screen;
    return (
      <TouchableOpacity
        style={[styles.navItem, isActive && styles.navItemActiveWhite]}
        onPress={() => { setCurrentScreen(screen); closeMobile(); }}
        activeOpacity={0.75}
      >
        {isActive && <View style={[styles.activePill, { backgroundColor: '#4ade80' }]} />}
        <Ionicons name={icon} size={20} color={isActive ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
        <Animated.Text
          numberOfLines={1}
          style={[styles.navLabel, { color: '#ffffff', fontWeight: isActive ? '700' : '600', opacity: labelOpacity }]}
        >
          {label}
        </Animated.Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.layout}>
        <SidebarShell bgColor="#0f766e" borderColor="#e2e8f0">
          <View style={styles.sidebarHeader}>
            <TouchableOpacity style={styles.logoIconBox} onPress={handleToggle} activeOpacity={0.8}>
              <Ionicons name="restaurant" size={18} color="white" />
            </TouchableOpacity>
            <Animated.View style={{ opacity: labelOpacity, flex: 1, overflow: 'hidden' }}>
              <Text numberOfLines={1} style={styles.logoText}>MIGME</Text>
              <Text numberOfLines={1} style={styles.clientSubName}>{user?.businessName || ''}</Text>
            </Animated.View>
          </View>

          <View style={{ flex: 1, paddingTop: 8 }}>
            <Animated.Text style={[styles.sectionHeading, { opacity: labelOpacity }]}>MAIN MENU</Animated.Text>
            <ClientNavItem icon="cash-outline"             label="Dashboard"     screen="Dashboard" />
            <ClientNavItem icon="add-circle-outline"       label="Add Order"     screen="Add Order" />
            <ClientNavItem icon="restaurant-outline"       label="Menu"          screen="Menu" />
            <ClientNavItem icon="bar-chart-outline"        label="Reports"       screen="Reports" />
            <ClientNavItem icon="bicycle-outline"          label="Delivery Team" screen="Delivery Team" />
            <ClientNavItem icon="checkmark-circle-outline" label="Delivered"     screen="Delivered" />
            <ClientNavItem icon="close-circle-outline"     label="Cancelled"     screen="Cancelled" />
            <ClientNavItem icon="settings-outline"         label="Settings"      screen="Settings" />
          </View>

          <View style={styles.sidebarFooter}>
            {!isMobile && (
              <TouchableOpacity style={styles.collapseBtn} onPress={() => setCollapsed(v => !v)} activeOpacity={0.7}>
                <Ionicons
                  name={collapsed ? 'chevron-forward-outline' : 'chevron-back-outline'}
                  size={16}
                  color="#94a3b8"
                />
                <Animated.Text numberOfLines={1} style={[styles.collapseBtnText, { opacity: labelOpacity }]}>
                  Collapse
                </Animated.Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.navItem}
              onPress={() => setDailyBizVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="trending-up-outline" size={22} color="rgba(255,255,255,0.7)" />
              <Animated.Text numberOfLines={1} style={[styles.navLabel, { color: '#ffffff', fontWeight: '700', opacity: labelOpacity }]}>
                Daily Business
              </Animated.Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navItem}
              onPress={() => { handleLogout(); closeMobile(); }}
              activeOpacity={0.75}
            >
              <Ionicons name="log-out-outline" size={26} color="#ef4444" />
              <Animated.Text numberOfLines={1} style={[styles.navLabel, { color: '#ef4444', opacity: labelOpacity }]}>
                Log Out
              </Animated.Text>
            </TouchableOpacity>
          </View>
        </SidebarShell>

        <View style={styles.mainContent}>
          {renderClientContent()}
        </View>
      </View>

      <DailyBusinessScreen
        visible={dailyBizVisible}
        onClose={() => setDailyBizVisible(false)}
        clientId={clientId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    ...(Platform.OS === 'web' ? { height: '100vh' } : {}),
  },
  layout: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
    overflow: 'hidden',
  },
  sidebar: {
    flexDirection: 'column',
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  logoIconBox: {
    backgroundColor: '#0f172a',
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  clientSubName: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '600',
    marginTop: -1,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1.1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    marginHorizontal: 6,
    marginVertical: 1,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  navItemActiveWhite: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  activePill: {
    position: 'absolute',
    left: -6,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 3,
  },
  navLabel: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  sidebarFooter: {
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingTop: 8,
  },
  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  collapseBtnText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  hamburger: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 99,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleSelection: { flex: 1 },
  adminSwitchBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  adminSwitchText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
});