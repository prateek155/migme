import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform,
  ActivityIndicator, Animated, TouchableWithoutFeedback, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth } from './src/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Screens ──────────────────────────────────────────────────────────────────
import HomepageScreen from './src/screens/HomepageScreen';   // ← your homepage
import ClientLoginScreen from './src/screens/ClientLoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import DailyBusinessScreen from './src/screens/DailyBusinessScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import AddOrderScreen from './src/screens/AddOrderScreen';
import MenuScreen from './src/screens/MenuScreen';
import DeliveryExecutiveScreen from './src/screens/DeliveryExecutiveScreen';
import FilteredOrdersScreen from './src/screens/FilteredOrdersScreen';
import ClientSettingsScreen from './src/screens/ClientSettingsScreen';

// ─── Sidebar constants ────────────────────────────────────────────────────────
const SIDEBAR_EXPANDED  = 240;
const SIDEBAR_COLLAPSED = 56;
const MOBILE_BP         = 768;

// ─── Top-level navigation states ─────────────────────────────────────────────
// 'home'  → HomepageScreen  (first screen when no session)
// 'login' → ClientLoginScreen
// 'app'   → Authenticated dashboard shell
const SCREEN = { HOME: 'home', LOGIN: 'login', APP: 'app' };

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser]                           = useState(null);
  const [loading, setLoading]                     = useState(true);
  const [appScreen, setAppScreen]                 = useState(SCREEN.HOME); // top-level screen
  const [currentScreen, setCurrentScreen]         = useState('Dashboard'); // inner dashboard tab
  const [dailyBizVisible, setDailyBizVisible]     = useState(false);
  const [collapsed, setCollapsed]                 = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { width: screenWidth } = useWindowDimensions();
  const isMobile = screenWidth < MOBILE_BP;

  const sidebarAnim = useRef(new Animated.Value(SIDEBAR_EXPANDED)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // ── Animate sidebar width (desktop collapse/expand) ──────────────────────
  useEffect(() => {
    if (isMobile) return;
    Animated.timing(sidebarAnim, {
      toValue: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [collapsed, isMobile]);

  // ── Animate mobile sidebar + overlay ─────────────────────────────────────
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

  const labelOpacity = sidebarAnim.interpolate({
    inputRange: [SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const handleToggle = () => {
    if (isMobile) setMobileSidebarOpen(v => !v);
    else setCollapsed(v => !v);
  };

  const closeMobile = () => setMobileSidebarOpen(false);

  // ─── Session restore on app launch ───────────────────────────────────────
  useEffect(() => {
    const loadSession = async () => {
      try {
        const userData = await AsyncStorage.getItem('migme_user');
        const roleData = await AsyncStorage.getItem('migme_role');
        if (userData && roleData) {
          // Active session → go straight to dashboard
          setUser(JSON.parse(userData));
          setAppScreen(SCREEN.APP);
        } else {
          // No session → show homepage
          setAppScreen(SCREEN.HOME);
        }
      } catch (e) {
        console.error('App.js loadSession error:', e);
        setAppScreen(SCREEN.HOME);
      }
      setLoading(false);
    };
    loadSession();
  }, []);

  // ─── Login: save session → go to dashboard ───────────────────────────────
  const handleLogin = async (userData, userRole) => {
    try {
      await AsyncStorage.setItem('migme_user', JSON.stringify(userData));
      await AsyncStorage.setItem('migme_role', userRole || 'client');
    } catch (e) {
      console.error('AsyncStorage save error:', e);
    }
    setUser(userData);
    setAppScreen(SCREEN.APP);
  };

  // ─── Logout: clear session → redirect to homepage ────────────────────────
  const handleLogout = async () => {
    setUser(null);
    setCurrentScreen('Dashboard');
    setMobileSidebarOpen(false);
    try { await signOut(auth); } catch (_) {}
    await AsyncStorage.removeItem('migme_user');
    await AsyncStorage.removeItem('migme_role');
    setAppScreen(SCREEN.HOME); // ← back to homepage
  };

  // ─── Loading spinner ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  // ─── SCREEN: Homepage ─────────────────────────────────────────────────────
  if (appScreen === SCREEN.HOME) {
    return (
      <HomepageScreen
        onLogin={() => setAppScreen(SCREEN.LOGIN)}     // Login button
        onSignup={() => setAppScreen(SCREEN.LOGIN)}    // Signup / Get Started button
      />
    );
  }

  // ─── SCREEN: Login ────────────────────────────────────────────────────────
  if (appScreen === SCREEN.LOGIN) {
    return (
      <View style={{ flex: 1 }}>
        {/* Back to homepage bar */}
        <TouchableOpacity
          style={styles.backBar}
          onPress={() => setAppScreen(SCREEN.HOME)}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back-outline" size={18} color="#0f766e" />
          <Text style={styles.backBarText}>Back to Home</Text>
        </TouchableOpacity>

        <ClientLoginScreen onLogin={handleLogin} />
      </View>
    );
  }

  // ─── SCREEN: Authenticated App ────────────────────────────────────────────

  const SidebarShell = ({ bgColor, borderColor, children }) => (
    <>
      {isMobile && mobileSidebarOpen && (
        <Animated.View pointerEvents="auto" style={[styles.mobileOverlay, { opacity: overlayAnim }]}>
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
              position: 'absolute', left: 0, top: 0, bottom: 0,
              zIndex: 100, elevation: 20,
              shadowColor: '#000', shadowOffset: { width: 4, height: 0 },
              shadowOpacity: 0.18, shadowRadius: 12,
            } : {}),
          },
        ]}
      >
        {children}
      </Animated.View>
    </>
  );

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
        style={[styles.navItem, isActive && styles.navItemActive]}
        onPress={() => { setCurrentScreen(screen); closeMobile(); }}
        activeOpacity={0.75}
      >
        {isActive && <View style={styles.activePill} />}
        <Ionicons name={icon} size={20} color={isActive ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
        <Animated.Text numberOfLines={1} style={[styles.navLabel, { color: '#ffffff', fontWeight: isActive ? '700' : '600', opacity: labelOpacity }]}>
          {label}
        </Animated.Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.layout}>

        <SidebarShell bgColor="#0f766e" borderColor="#e2e8f0">
          {/* Header */}
          <View style={styles.sidebarHeader}>
            <TouchableOpacity style={styles.logoIconBox} onPress={handleToggle} activeOpacity={0.8}>
              <Ionicons name="restaurant" size={18} color="white" />
            </TouchableOpacity>
            <Animated.View style={{ opacity: labelOpacity, flex: 1, overflow: 'hidden' }}>
              <Text numberOfLines={1} style={styles.logoText}>MIGME</Text>
              <Text numberOfLines={1} style={styles.clientSubName}>{user?.businessName || ''}</Text>
            </Animated.View>
          </View>

          {/* Nav items */}
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

          {/* Footer */}
          <View style={styles.sidebarFooter}>
            {!isMobile && (
              <TouchableOpacity style={styles.collapseBtn} onPress={() => setCollapsed(v => !v)} activeOpacity={0.7}>
                <Ionicons name={collapsed ? 'chevron-forward-outline' : 'chevron-back-outline'} size={16} color="#94a3b8" />
                <Animated.Text numberOfLines={1} style={[styles.collapseBtnText, { opacity: labelOpacity }]}>Collapse</Animated.Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.navItem} onPress={() => setDailyBizVisible(true)} activeOpacity={0.75}>
              <Ionicons name="trending-up-outline" size={22} color="rgba(255,255,255,0.7)" />
              <Animated.Text numberOfLines={1} style={[styles.navLabel, { color: '#ffffff', fontWeight: '700', opacity: labelOpacity }]}>Daily Business</Animated.Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => { handleLogout(); closeMobile(); }} activeOpacity={0.75}>
              <Ionicons name="log-out-outline" size={26} color="#ef4444" />
              <Animated.Text numberOfLines={1} style={[styles.navLabel, { color: '#ef4444', opacity: labelOpacity }]}>Log Out</Animated.Text>
            </TouchableOpacity>
          </View>
        </SidebarShell>

        {/* Main content */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    ...(Platform.OS === 'web' ? { height: '100vh' } : {}),
  },
  layout: {
    flex: 1, flexDirection: 'row',
    position: 'relative', overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1, backgroundColor: '#f8fafc',
    justifyContent: 'center', alignItems: 'center',
  },

  // Back-to-home bar (shown above login screen)
  backBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBarText: {
    fontSize: 14, fontWeight: '600', color: '#0f766e',
  },

  // Sidebar
  sidebar: {
    flexDirection: 'column',
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  sidebarHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 16, gap: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  logoIconBox: {
    backgroundColor: '#0f172a',
    width: 34, height: 34, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  logoText: {
    color: '#ffffff', fontSize: 26, fontWeight: '800', letterSpacing: -0.4,
  },
  clientSubName: {
    fontSize: 15, color: '#ffffff', fontWeight: '600', marginTop: -1,
  },
  sectionHeading: {
    fontSize: 12, fontWeight: '700', color: '#ffffff',
    letterSpacing: 1.1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },

  // Nav items
  navItem: {
    flexDirection: 'row', alignItems: 'center',
    height: 42, marginHorizontal: 6, marginVertical: 1,
    paddingHorizontal: 10, borderRadius: 8, gap: 12,
    position: 'relative', overflow: 'hidden',
  },
  navItemActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  activePill: {
    position: 'absolute', left: -6, top: 10, bottom: 10,
    width: 3, borderRadius: 3, backgroundColor: '#4ade80',
  },
  navLabel: {
    fontSize: 16, fontWeight: '600', flex: 1,
  },

  // Sidebar footer
  sidebarFooter: {
    paddingBottom: 12, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
  },
  collapseBtn: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingHorizontal: 16, paddingVertical: 10,
  },
  collapseBtnText: {
    fontSize: 12, color: '#94a3b8', fontWeight: '500',
  },

  // Main content
  mainContent: {
    flex: 1, backgroundColor: '#f8fafc',
    overflow: 'hidden', flexDirection: 'column',
  },

  // Mobile overlay
  mobileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 99,
  },
});
