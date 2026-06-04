import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Dimensions, ActivityIndicator, TextInput, Animated,
} from 'react-native';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Line, Text as SvgText, G } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';

const PIE_COLORS = [
  '#2563eb', '#22c55e', '#f59e0b', '#ef4444',
  '#06b6d4', '#8b5cf6', '#f97316', '#64748b',
  '#ec4899', '#14b8a6', '#eab308', '#a855f7',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) =>
  `₹ ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const clearTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const fmtDate = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const fmtDateStr = (str) => {
  if (!str) return '';
  const d = parseDate(str);
  if (isNaN(d.getTime())) return str;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const fmtDateFile = (d) => {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

const COD_TYPES = ['COD', 'CASH', 'CASH_ON_DELIVERY'];
const normPayment = (p) =>
  COD_TYPES.includes((p || '').toUpperCase().replace(/\s+/g, '_')) ? 'COD' : 'ONLINE';

const parseDate = (str) => {
  if (!str) return new Date(0);
  const p = str.split('-');
  if (p.length === 3 && p[0].length === 4)
    return new Date(+p[0], +p[1] - 1, +p[2]);
  if (p.length === 3 && p[2].length === 4)
    return new Date(+p[2], +p[1] - 1, +p[0]);
  return new Date(str);
};

const toISOLocal = (d) => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ─── Vendor Name Normalizer ───────────────────────────────────────────────────
const VENDOR_ALIASES = {
  'zoop':          'ZOOP',
  'zoop india':    'ZOOP',
  'railyatri':     'RailYatri',
  'rail yatri':    'RailYatri',
  'railrecipe':    'RailRecipe',
  'rail recipe':   'RailRecipe',
  'rajbhog khana': 'RajBhog Khana',
  'rajbhog':       'RajBhog Khana',
  'rel food':      'REL FOOD',
  'rail food':     'REL FOOD',
};

const normalizeVendor = (name) => {
  if (!name) return 'Unknown';
  const key = name.trim().toLowerCase();
  return VENDOR_ALIASES[key] || name.trim();
};

// ─── Extract Order ID from a row (robust, handles any column name) ────────────
const extractOrderId = (row) => {
  // Try exact known keys first
  const knownKeys = [
    'Order ID', 'ORDER ID', 'OrderId', 'order_id',
    'Order No', 'ORDER NO', 'OrderNo', 'order_no',
    'Order Number', 'ORDER NUMBER', 'order_number',
    'PNR', 'pnr', 'ID', 'id',
  ];
  for (const key of knownKeys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  // Fallback: fuzzy match — find any key whose lowercase contains 'order' or 'id' or 'no'
  const keys = Object.keys(row);
  for (const key of keys) {
    const lk = key.toLowerCase().replace(/[\s_\-\.]/g, '');
    if (
      lk.includes('orderid') || lk.includes('orderno') ||
      lk.includes('ordernumber') || lk.includes('ordernum') ||
      lk === 'id' || lk === 'no' || lk === 'number'
    ) {
      const val = String(row[key]).trim();
      if (val && val !== 'undefined') return val;
    }
  }
  // Last resort: return first non-empty cell value
  for (const key of keys) {
    const val = String(row[key]).trim();
    if (val && val !== 'undefined' && val !== '') return val;
  }
  return '';
};

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
const SkeletonReportRow = ({ alt }) => {
  const shimmer = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  const Box = ({ flex, width }) => (
    <Animated.View style={{
      height: 12, borderRadius: 4, backgroundColor: '#e2e8f0',
      opacity, ...(flex ? { flex } : { width: width || 60 }),
    }} />
  );

  return (
    <View style={[{
      flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 10,
      borderBottomWidth: 1, borderColor: '#f1f5f9', alignItems: 'center', gap: 10,
    }, alt && { backgroundColor: '#f8fafc' }]}>
      <Box flex={0.4} />
      <Box flex={1.8} />
      <Box flex={0.8} />
      <Box flex={0.8} />
      <Box flex={1.4} />
      <Box flex={1.4} />
      <Box flex={1.4} />
      <Box flex={0.9} />
    </View>
  );
};

const SkeletonSummaryCard = () => {
  const shimmer = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  return (
    <Animated.View style={{
      flex: 1, height: 60, borderRadius: 8,
      backgroundColor: '#cbd5e1', opacity,
    }} />
  );
};

const SkeletonLoader = () => (
  <>
    {/* Summary cards skeleton */}
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
      <SkeletonSummaryCard />
      <SkeletonSummaryCard />
      <SkeletonSummaryCard />
    </View>

    {/* Table skeleton */}
    <View style={[styles.tableCard, { overflow: 'hidden' }]}>
      <View style={{ backgroundColor: '#0f172a', height: 44 }} />
      {Array.from({ length: 7 }).map((_, i) => (
        <SkeletonReportRow key={i} alt={i % 2 !== 0} />
      ))}
    </View>
  </>
);

// ─── In-App Toast Notification ────────────────────────────────────────────────
const Toast = ({ message, type = 'info', onDismiss }) => {
  if (!message) return null;

  const config = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', icon: 'checkmark-circle',   iconColor: '#16a34a', textColor: '#14532d' },
    error:   { bg: '#fef2f2', border: '#fecaca', icon: 'close-circle',        iconColor: '#dc2626', textColor: '#7f1d1d' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', icon: 'information-circle',  iconColor: '#2563eb', textColor: '#1e3a8a' },
    warning: { bg: '#fffbeb', border: '#fde68a', icon: 'alert-circle',        iconColor: '#d97706', textColor: '#78350f' },
  }[type] || {};

  return (
    <View style={[toastStyles.container, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Ionicons name={config.icon} size={18} color={config.iconColor} />
      <Text style={[toastStyles.text, { color: config.textColor }]}>{message}</Text>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color={config.iconColor} />
      </TouchableOpacity>
    </View>
  );
};

const toastStyles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    marginBottom: 12,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});

// ─── Compare Result Panel (Side-by-Side) ─────────────────────────────────────
const CompareResultPanel = ({ result, onClose }) => {
  if (!result) return null;

  const { missingInVendor, extraInVendor, uploadedCount, systemCount } = result;
  const allMatch = missingInVendor.length === 0 && extraInVendor.length === 0;

  return (
    <View style={cStyles.panel}>
      {/* Header */}
      <View style={cStyles.panelHeader}>
        <View style={cStyles.panelTitleRow}>
          <Ionicons name="git-compare-outline" size={18} color="#0f172a" />
          <Text style={cStyles.panelTitle}>Comparison Result</Text>
          {allMatch && (
            <View style={cStyles.matchBadge}>
              <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
              <Text style={cStyles.matchBadgeTxt}>All Matched</Text>
            </View>
          )}
        </View>

        <View style={cStyles.statRow}>
          <View style={cStyles.statChip}>
            <Text style={cStyles.statChipLabel}>Our System</Text>
            <Text style={cStyles.statChipValue}>{systemCount} orders</Text>
          </View>
          <Ionicons name="swap-horizontal-outline" size={14} color="#94a3b8" />
          <View style={cStyles.statChip}>
            <Text style={cStyles.statChipLabel}>Vendor File</Text>
            <Text style={cStyles.statChipValue}>{uploadedCount} orders</Text>
          </View>
        </View>

        <TouchableOpacity style={cStyles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={16} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* Side-by-side columns */}
      <View style={cStyles.columns}>

        {/* LEFT: Missing in Vendor File */}
        <View style={[cStyles.column, { borderColor: missingInVendor.length > 0 ? '#fca5a5' : '#bbf7d0' }]}>
          <View style={[cStyles.colHeader, { backgroundColor: missingInVendor.length > 0 ? '#fef2f2' : '#f0fdf4' }]}>
            <Ionicons
              name={missingInVendor.length > 0 ? 'alert-circle' : 'checkmark-circle'}
              size={15}
              color={missingInVendor.length > 0 ? '#dc2626' : '#16a34a'}
            />
            <Text style={[cStyles.colTitle, { color: missingInVendor.length > 0 ? '#991b1b' : '#14532d' }]}>
              Missing in Vendor File
            </Text>
            <View style={[cStyles.countBadge, { backgroundColor: missingInVendor.length > 0 ? '#dc2626' : '#16a34a' }]}>
              <Text style={cStyles.countBadgeTxt}>{missingInVendor.length}</Text>
            </View>
          </View>
          <ScrollView
            style={cStyles.colScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            {missingInVendor.length === 0 ? (
              <View style={cStyles.emptyCol}>
                <Ionicons name="checkmark-done-circle-outline" size={26} color="#86efac" />
                <Text style={cStyles.emptyColTxt}>All our orders are present in vendor file</Text>
              </View>
            ) : (
              missingInVendor.map((id, idx) => (
                <View key={id} style={[cStyles.idRow, idx % 2 === 0 && cStyles.idRowAlt]}>
                  <View style={cStyles.idDot} />
                  <Text style={[cStyles.idText, { color: '#7f1d1d' }]}>{id}</Text>
                </View>
              ))
            )}
          </ScrollView>
          {missingInVendor.length > 0 && (
            <View style={cStyles.colFooter}>
              <Text style={cStyles.colFooterTxt}>
                These orders exist in our system but vendor has not reported them
              </Text>
            </View>
          )}
        </View>

        {/* RIGHT: Extra in Vendor File */}
        <View style={[cStyles.column, { borderColor: extraInVendor.length > 0 ? '#93c5fd' : '#bbf7d0' }]}>
          <View style={[cStyles.colHeader, { backgroundColor: extraInVendor.length > 0 ? '#eff6ff' : '#f0fdf4' }]}>
            <Ionicons
              name={extraInVendor.length > 0 ? 'information-circle' : 'checkmark-circle'}
              size={15}
              color={extraInVendor.length > 0 ? '#2563eb' : '#16a34a'}
            />
            <Text style={[cStyles.colTitle, { color: extraInVendor.length > 0 ? '#1e3a8a' : '#14532d' }]}>
              Extra in Vendor File
            </Text>
            <View style={[cStyles.countBadge, { backgroundColor: extraInVendor.length > 0 ? '#2563eb' : '#16a34a' }]}>
              <Text style={cStyles.countBadgeTxt}>{extraInVendor.length}</Text>
            </View>
          </View>
          <ScrollView
            style={cStyles.colScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            {extraInVendor.length === 0 ? (
              <View style={cStyles.emptyCol}>
                <Ionicons name="checkmark-done-circle-outline" size={26} color="#86efac" />
                <Text style={cStyles.emptyColTxt}>No extra orders found in vendor file</Text>
              </View>
            ) : (
              extraInVendor.map((id, idx) => (
                <View key={id} style={[cStyles.idRow, idx % 2 === 0 && cStyles.idRowAlt]}>
                  <View style={[cStyles.idDot, { backgroundColor: '#2563eb' }]} />
                  <Text style={[cStyles.idText, { color: '#1e3a8a' }]}>{id}</Text>
                </View>
              ))
            )}
          </ScrollView>
          {extraInVendor.length > 0 && (
            <View style={[cStyles.colFooter, { backgroundColor: '#eff6ff', borderTopColor: '#bfdbfe' }]}>
              <Text style={[cStyles.colFooterTxt, { color: '#1e3a8a' }]}>
                These orders are in vendor file but not found in our system
              </Text>
            </View>
          )}
        </View>

      </View>
    </View>
  );
};

const cStyles = StyleSheet.create({
  panel: {
    backgroundColor: 'white', borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
    marginBottom: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: 12, padding: 14,
    backgroundColor: '#f8fafc', borderBottomWidth: 1, borderColor: '#e2e8f0',
  },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  panelTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  matchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#dcfce7', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  matchBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statChip: {
    backgroundColor: 'white', borderRadius: 6,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 5, paddingHorizontal: 10, alignItems: 'center',
  },
  statChipLabel: { fontSize: 9, color: '#94a3b8', fontWeight: '600', letterSpacing: 0.5 },
  statChipValue: { fontSize: 13, color: '#0f172a', fontWeight: '800' },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  columns: { flexDirection: 'row', minHeight: 200, maxHeight: 320 },
  column: { flex: 1, borderWidth: 0, borderTopWidth: 3 },
  colHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 10, paddingHorizontal: 14,
    borderBottomWidth: 1, borderColor: '#e2e8f0',
  },
  colTitle: { flex: 1, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  countBadge: {
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2,
    minWidth: 24, alignItems: 'center',
  },
  countBadgeTxt: { fontSize: 11, fontWeight: '800', color: 'white' },
  colScroll: { flex: 1, paddingVertical: 4 },
  idRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  idRowAlt: { backgroundColor: '#f8fafc' },
  idDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#dc2626', flexShrink: 0,
  },
  idText: { fontSize: 13, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  emptyCol: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  emptyColTxt: { fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 17 },
  colFooter: {
    paddingVertical: 8, paddingHorizontal: 14,
    backgroundColor: '#fef2f2', borderTopWidth: 1, borderColor: '#fecaca',
  },
  colFooterTxt: { fontSize: 11, color: '#7f1d1d', lineHeight: 15 },
});

// ─── Expandable Order Row ─────────────────────────────────────────────────────

const ExpandableOrderRow = ({ item }) => {
  const [expanded, setExpanded] = useState(false);

  const isCancelled = item.status === 'Cancelled';
  const isCompleted = item.status === 'Completed' || item.status === 'Delivered';
  const badgeBg     = isCancelled ? '#fef2f2' : (isCompleted ? '#f0fdf4' : '#fffbeb');
  const badgeTxt    = isCancelled ? '#dc2626' : (isCompleted ? '#16a34a' : '#b45309');
  const badgeBorder = isCancelled ? '#fecaca' : (isCompleted ? '#bbf7d0' : '#fde68a');

  const isCOD           = normPayment(item.paymentType) === 'COD';
  const paymentColor    = isCOD ? '#b45309' : '#0f766e';
  const paymentLabel    = isCOD ? 'COD' : 'ONLINE';
  const amountToCollect = isCOD ? (item.totalAmount || 0) : 0;

  return (
    <View style={dStyles.cardContainer}>
      <TouchableOpacity
        style={[dStyles.tableRow, expanded && dStyles.tableRowExpanded]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.85}
      >
        <View style={{ width: 34, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#94a3b8" />
        </View>

        <View style={{ flex: 0.8 }}>
          <View style={[dStyles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: badgeTxt, letterSpacing: 0.5 }}>
              {item.status || 'ACTIVE'}
            </Text>
          </View>
        </View>

        <Text style={[dStyles.cell, { flex: 1.1, fontWeight: '700', color: '#0f172a' }]}>
          {item.orderNo}
        </Text>

        <Text style={[dStyles.cell, { flex: 1.0, fontSize: 12 }]}>
          {item.deliveryDate ? new Date(item.deliveryDate).toLocaleDateString('en-GB') : '—'}
        </Text>

        <Text style={[dStyles.cell, { flex: 0.8, fontSize: 12, fontWeight: '500' }]}>
          {item.deliveryTime || '—'}
        </Text>

        <Text style={[dStyles.cell, { flex: 1.4 }]} numberOfLines={2}>
          {item.trainInfo || 'N/A'}{' '}
          <Text style={{ color: '#dc2626', fontWeight: '700' }}>
            ({item.coach || 'No Coach'}{item.seat ? ` / ${item.seat}` : ''})
          </Text>
        </Text>

        <Text style={[dStyles.cell, { flex: 1.0, fontSize: 12 }]} numberOfLines={1}>
          {item.contactNo || '—'}
        </Text>

        <View style={{ flex: 0.8 }}>
          <Text style={[dStyles.paymentTag, { color: paymentColor, borderColor: paymentColor }]}>
            {paymentLabel}
          </Text>
        </View>

        <Text style={[dStyles.cell, { flex: 0.9, fontWeight: '700', color: '#0f172a' }]}>
          ₹ {item.totalAmount || 0}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={dStyles.expandedContent}>
          <View style={dStyles.expandedLayout}>

            <View style={dStyles.expandSectionLeft}>
              <View style={dStyles.miniTableHeader}>
                <Text style={[dStyles.miniHeadText, { flex: 1 }]}>ITEM NAME</Text>
                <Text style={[dStyles.miniHeadText, { width: 56, textAlign: 'center' }]}>QTY</Text>
              </View>
              {item.items && item.items.map((prod, idx) => (
                <View key={idx} style={dStyles.miniTableRow}>
                  <Text style={[dStyles.miniCellText, { flex: 1 }]}>{prod.name}</Text>
                  <Text style={[dStyles.miniCellText, { width: 56, textAlign: 'center', fontWeight: '700', color: '#0f172a' }]}>
                    {prod.quantity}
                  </Text>
                </View>
              ))}
            </View>

            <View style={dStyles.expandSectionMid}>
              <Text style={dStyles.sectionLabel}>CUSTOMER DETAILS</Text>
              <Text style={dStyles.remarkText}>{item.customerName}</Text>
              <Text style={[dStyles.remarkText, { color: '#475569', fontWeight: '700' }]}>Mo: {item.contactNo}</Text>

              {item.remark && item.remark.trim() !== '' && (
                <View style={dStyles.remarkBox}>
                  <Text style={dStyles.remarkAlertText}>⚠ SPECIAL INSTRUCTIONS</Text>
                  <Text style={dStyles.remarkContentText}>{item.remark}</Text>
                </View>
              )}

              {item.assignedExecutiveName && (
                <View style={dStyles.assignedBadgeBox}>
                  <Text style={dStyles.assignedBadgeLabel}>ASSIGNED TO:</Text>
                  <Text style={dStyles.assignedBadgeName}>{item.assignedExecutiveName}</Text>
                </View>
              )}
            </View>

            <View style={dStyles.expandSectionRight}>
              <Text style={dStyles.sectionLabel}>BILLING SUMMARY</Text>
              <View style={dStyles.financeRow}><Text style={dStyles.financeLabel}>Sub Total</Text><Text style={dStyles.financeValue}>₹ {item.subTotal || 0}</Text></View>
              <View style={dStyles.financeRow}><Text style={dStyles.financeLabel}>Tax / GST</Text><Text style={dStyles.financeValue}>₹ {item.tax || 0}</Text></View>
              <View style={dStyles.financeRow}><Text style={dStyles.financeLabel}>Delivery</Text><Text style={dStyles.financeValue}>₹ {item.deliveryCharge || 0}</Text></View>
              <View style={dStyles.financeDivider} />
              <View style={dStyles.financeRow}>
                <Text style={[dStyles.financeLabel, { fontWeight: '700', color: '#0f172a' }]}>TOTAL BILL</Text>
                <Text style={[dStyles.financeValue, { fontSize: 15, fontWeight: '800', color: '#0f172a' }]}>₹ {item.totalAmount || 0}</Text>
              </View>
              {isCOD && (
                <View style={dStyles.amountToCollectBar}>
                  <Text style={dStyles.atcLabel}>COLLECT CASH</Text>
                  <Text style={dStyles.atcValue}>₹ {amountToCollect}</Text>
                </View>
              )}
            </View>

          </View>
        </View>
      )}
    </View>
  );
};

// ─── Vendor Detail View ───────────────────────────────────────────────────────

const VendorDetailView = ({ vendor, orders, onBack, onExport, statusFilter }) => {
  const [search, setSearch]               = useState('');
  const [compareResult, setCompareResult] = useState(null);
  const [uploadedOrders, setUploadedOrders] = useState([]);
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [toast, setToast]                 = useState(null);
  const [detectedColumn, setDetectedColumn] = useState('');

  const showToast    = (message, type = 'info') => setToast({ message, type });
  const dismissToast = () => setToast(null);

  const PAYMENT_FILTERS = [
    { label: 'All',    value: 'All',    activeColor: '#0f172a' },
    { label: 'COD',    value: 'COD',    activeColor: '#b45309' },
    { label: 'Online', value: 'ONLINE', activeColor: '#0f766e' },
  ];

  const pickVendorFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled) return;

      const file = res.assets[0];
      let workbook;

      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        const arrayBuffer = await response.arrayBuffer();
        workbook = XLSX.read(arrayBuffer, { type: 'array' });
      } else {
        const fileData = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        workbook = XLSX.read(fileData, { type: 'base64' });
      }

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // ── Read with header:1 to see raw rows and debug column names ──
      const rawJson = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawJson.length === 0) {
        showToast('The file appears to be empty. Please check the file and try again.', 'error');
        return;
      }

      // ── Log all column names for debugging ──
      const allKeys = Object.keys(rawJson[0]);
      console.log('📋 Excel columns found:', allKeys);
      console.log('📋 First row sample:', rawJson[0]);

      // ── Extract order IDs using robust extractor ──
      const ids = rawJson
        .map(row => extractOrderId(row))
        .filter(id => id && id.trim() !== '' && id !== 'undefined');

      if (ids.length === 0) {
        // Show actual column names to help user
        const colList = allKeys.slice(0, 6).join('", "');
        showToast(
          `Could not find Order ID column. Your file has columns: "${colList}". Please rename one of them to "Order ID" or "Order No".`,
          'error'
        );
        return;
      }

      // ── Find which column was actually used ──
      const firstRow = rawJson[0];
      let usedColumn = allKeys[0];
      for (const key of allKeys) {
        const val = String(firstRow[key]).trim();
        if (val === ids[0]) { usedColumn = key; break; }
      }
      setDetectedColumn(usedColumn);

      setUploadedOrders(ids);
      setCompareResult(null);
      showToast(
        `✓ ${ids.length} orders loaded from "${file.name}" (column: "${usedColumn}") — tap COMPARE to check differences.`,
        'success'
      );
    } catch (err) {
      console.log('File read error:', err);
      showToast('Failed to read file. Please try again with a valid .xlsx or .csv file.', 'error');
    }
  };

  const compareOrders = () => {
    if (uploadedOrders.length === 0) {
      showToast('Please upload the vendor file first before comparing.', 'warning');
      return;
    }

    const systemOrders         = [...new Set(orders.map(o => String(o.orderNo || '').trim()))];
    const uploadedOrdersUnique = [...new Set(uploadedOrders)];
    const uploadedSet          = new Set(uploadedOrdersUnique);
    const systemSet            = new Set(systemOrders);
    const missingInVendor      = systemOrders.filter(id => !uploadedSet.has(id));
    const extraInVendor        = uploadedOrdersUnique.filter(id => !systemSet.has(id));

    setCompareResult({
      missingInVendor,
      extraInVendor,
      uploadedCount: uploadedOrdersUnique.length,
      systemCount: systemOrders.length,
    });

    if (missingInVendor.length === 0 && extraInVendor.length === 0) {
      showToast('Perfect match! All orders align between our system and the vendor file.', 'success');
    } else {
      const parts = [];
      if (missingInVendor.length > 0) parts.push(`${missingInVendor.length} missing in vendor file`);
      if (extraInVendor.length > 0)   parts.push(`${extraInVendor.length} extra in vendor file`);
      showToast(`Discrepancies found: ${parts.join(' · ')}. See details below.`, 'warning');
    }
  };

  const allCompleted  = orders.filter(o => o.status === 'Completed' || o.status === 'Delivered');
  const totalRevenue  = allCompleted.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const codRevenue    = allCompleted.filter(o => normPayment(o.paymentType) === 'COD').reduce((s, o) => s + (o.totalAmount || 0), 0);
  const onlineRevenue = allCompleted.filter(o => normPayment(o.paymentType) === 'ONLINE').reduce((s, o) => s + (o.totalAmount || 0), 0);
  const codCount      = allCompleted.filter(o => normPayment(o.paymentType) === 'COD').length;
  const onlineCount   = allCompleted.filter(o => normPayment(o.paymentType) === 'ONLINE').length;

  const displayOrders = orders.filter(o => {
    const q            = search.toLowerCase();
    const matchPayment = paymentFilter === 'All' || normPayment(o.paymentType) === paymentFilter;
    let matchStatus    = false;
    if (statusFilter === 'All')       matchStatus = o.status === 'Completed' || o.status === 'Cancelled';
    if (statusFilter === 'Completed') matchStatus = o.status === 'Completed';
    if (statusFilter === 'Cancelled') matchStatus = o.status === 'Cancelled';
    if (statusFilter === 'Delivered') matchStatus = o.status === 'Delivered' || o.status === 'Completed';
    const matchSearch = !q ||
      (o.orderNo      || '').toLowerCase().includes(q) ||
      (o.customerName || '').toLowerCase().includes(q) ||
      (o.trainInfo    || '').toLowerCase().includes(q);
    return matchPayment && matchStatus && matchSearch;
  });

  return (
    <View style={{ flex: 1 }}>
      {/* ── Top action bar ── */}
      <View style={vStyles.headerBar}>
        <TouchableOpacity style={vStyles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={18} color="#0f172a" />
          <Text style={vStyles.backTxt}>Back</Text>
        </TouchableOpacity>

        <Text style={vStyles.vendorTitle}>Vendor: {vendor}</Text>

        <View style={vStyles.pillRow}>
          {PAYMENT_FILTERS.map(({ label, value, activeColor }) => {
            const isActive = paymentFilter === value;
            return (
              <TouchableOpacity
                key={value}
                style={[vStyles.pill, isActive && { backgroundColor: activeColor, borderColor: activeColor }]}
                onPress={() => setPaymentFilter(value)}
                activeOpacity={0.8}
              >
                <Text style={[vStyles.pillTxt, isActive && { color: 'white' }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={vStyles.searchBox}>
          <Ionicons name="search-outline" size={15} color="#94a3b8" />
          <TextInput
            style={vStyles.searchInput}
            placeholder="Search order / customer…"
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={15} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={vStyles.exportBtn} onPress={onExport} activeOpacity={0.85}>
          <Ionicons name="download-outline" size={15} color="white" />
          <Text style={vStyles.exportTxt}>EXPORT</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[vStyles.exportBtn, uploadedOrders.length > 0 && vStyles.exportBtnLoaded]}
          onPress={pickVendorFile}
          activeOpacity={0.85}
        >
          <Ionicons
            name={uploadedOrders.length > 0 ? 'document-attach-outline' : 'cloud-upload-outline'}
            size={15}
            color="white"
          />
          <Text style={vStyles.exportTxt}>
            {uploadedOrders.length > 0 ? `FILE (${uploadedOrders.length})` : 'UPLOAD FILE'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[vStyles.exportBtn, uploadedOrders.length > 0 && vStyles.exportBtnCompare]}
          onPress={compareOrders}
          activeOpacity={0.85}
        >
          <Ionicons name="git-compare-outline" size={15} color="white" />
          <Text style={vStyles.exportTxt}>COMPARE</Text>
        </TouchableOpacity>
      </View>

      {/* ── Summary cards ── */}
      <View style={vStyles.summaryRow}>
        <View style={[vStyles.summaryCard, { backgroundColor: '#16a34a' }]}>
          <Text style={vStyles.summaryTitle}>Total : {fmt(totalRevenue)}</Text>
          <Text style={vStyles.summarySubtitle}>Orders : {allCompleted.length}</Text>
        </View>
        <View style={[vStyles.summaryCard, { backgroundColor: '#0891b2' }]}>
          <Text style={vStyles.summaryTitle}>COD : {fmt(codRevenue)}</Text>
          <Text style={vStyles.summarySubtitle}>Orders : {codCount}</Text>
        </View>
        <View style={[vStyles.summaryCard, { backgroundColor: '#7c3aed' }]}>
          <Text style={vStyles.summaryTitle}>Online : {fmt(onlineRevenue)}</Text>
          <Text style={vStyles.summarySubtitle}>Orders : {onlineCount}</Text>
        </View>
      </View>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={dismissToast} />}

      {compareResult && (
        <CompareResultPanel result={compareResult} onClose={() => setCompareResult(null)} />
      )}

      {/* ── Order table ── */}
      <View style={vStyles.tableContainer}>
        <View style={vStyles.tableHeader}>
          <View style={{ width: 38 }} />
          <Text style={[vStyles.col, { flex: 0.9 }]}>STATUS</Text>
          <Text style={[vStyles.col, { flex: 1.1 }]}>ORDER NO.</Text>
          <Text style={[vStyles.col, { flex: 1.0 }]}>DEL. DATE</Text>
          <Text style={[vStyles.col, { flex: 0.8 }]}>DEL. TIME</Text>
          <Text style={[vStyles.col, { flex: 1.4 }]}>TRAIN</Text>
          <Text style={[vStyles.col, { flex: 1.0 }]}>CONTACT</Text>
          <Text style={[vStyles.col, { flex: 0.8 }]}>PAYMENT</Text>
          <Text style={[vStyles.col, { flex: 0.9 }]}>AMOUNT</Text>
        </View>

        {/* ── Rows with hidden scrollbar ── */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          {displayOrders.length === 0 ? (
            <View style={{ paddingVertical: 48, alignItems: 'center', gap: 10 }}>
              <Ionicons name="receipt-outline" size={36} color="#cbd5e1" />
              <Text style={{ fontSize: 14, color: '#94a3b8' }}>No orders found</Text>
            </View>
          ) : (
            displayOrders.map(item => (
              <ExpandableOrderRow key={item.id} item={item} />
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
};

// ─── Smart Pie Chart ──────────────────────────────────────────────────────────

function CustomPieChart({ data, size, title }) {
  if (!data || data.length === 0) return null;

  const total = data.reduce((s, d) => s + d.population, 0);
  const maxLabelChars = Math.max(...data.map(d => d.name.length));
  const labelPadding  = Math.max(maxLabelChars * 6.5, 60);
  const svgWidth  = size + (labelPadding * 2) + 40;
  const svgHeight = size + 40;
  const cx = svgWidth / 2;
  const cy = svgHeight / 2;
  const r  = size * 0.26;

  if (data.length === 1) {
    return (
      <View style={{ alignItems: 'center' }}>
        {title && <Text style={styles.pieTitle}>{title}</Text>}
        <Svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
          <Circle cx={cx} cy={cy} r={r} fill={data[0].color} />
          <Line x1={cx} y1={cy + r} x2={cx} y2={cy + r + 25} stroke={data[0].color} strokeWidth="1.5" />
          <Circle cx={cx} cy={cy + r} r="2.5" fill={data[0].color} />
          <SvgText x={cx} y={cy + r + 40} fontSize="14" fontWeight="700" fill="#1e293b" textAnchor="middle">
            {data[0].name} ({data[0].population})
          </SvgText>
        </Svg>
      </View>
    );
  }

  const rawSlices = [];
  let startAngle = -Math.PI / 2;

  data.forEach((item) => {
    const angle    = (item.population / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const midAngle = startAngle + angle / 2;
    const ax = cx + (r + 4)  * Math.cos(midAngle);
    const ay = cy + (r + 4)  * Math.sin(midAngle);
    const bx = cx + (r + 22) * Math.cos(midAngle);
    const by = cy + (r + 22) * Math.sin(midAngle);

    rawSlices.push({
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: item.color,
      midAngle, ax, ay, bx, by,
      name: item.name,
      count: item.population,
      percent: ((item.population / total) * 100).toFixed(1),
      isRight: Math.cos(midAngle) >= 0,
    });
    startAngle = endAngle;
  });

  const LABEL_HEIGHT = 32;
  const distributeLabels = (slices, side) => {
    const out = [];
    slices.forEach((s, i) => {
      let ly = s.by;
      if (i > 0) { const prevY = out[i - 1].ly; if (ly - prevY < LABEL_HEIGHT) ly = prevY + LABEL_HEIGHT; }
      const lx = side === 'right' ? cx + r + 35 : cx - r - 35;
      out.push({ ...s, lx, ly, side });
    });
    return out;
  };

  const finalRight = distributeLabels(rawSlices.filter(s =>  s.isRight).sort((a, b) => a.by - b.by), 'right');
  const finalLeft  = distributeLabels(rawSlices.filter(s => !s.isRight).sort((a, b) => a.by - b.by), 'left');
  const allLabeled = [...finalRight, ...finalLeft];

  return (
    <View style={{ alignItems: 'center' }}>
      {title && <Text style={styles.pieTitle}>{title}</Text>}
      <Svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
        {rawSlices.map((s, i) => (
          <Path key={`slice-${i}`} d={s.path} fill={s.color} stroke="white" strokeWidth="1" />
        ))}
        {allLabeled.map((s, i) => {
          const textAnchor = s.side === 'right' ? 'start' : 'end';
          const textX      = s.side === 'right' ? s.lx + 4 : s.lx - 4;
          return (
            <G key={`lbl-${i}`}>
              <Line x1={s.ax} y1={s.ay} x2={s.bx} y2={s.by} stroke={s.color} strokeWidth="1.3" />
              <Line x1={s.bx} y1={s.by} x2={s.lx} y2={s.ly} stroke={s.color} strokeWidth="1.3" />
              <Circle cx={s.ax} cy={s.ay} r="2" fill={s.color} />
              <Circle cx={s.lx} cy={s.ly} r="2" fill={s.color} />
              <SvgText x={textX} y={s.ly - 2}  fontSize="13" fontWeight="700" fill="#1e293b" textAnchor={textAnchor}>{s.name}</SvgText>
              <SvgText x={textX} y={s.ly + 13} fontSize="11" fontWeight="500" fill="#64748b" textAnchor={textAnchor}>{s.count} ({s.percent}%)</SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

const SummaryCard = ({ title, subtitle, color = '#16a34a' }) => (
  <View style={[styles.summaryCard, { backgroundColor: color, shadowColor: color }]}>
    <Text style={styles.summaryTitle}>{title}</Text>
    <Text style={styles.summarySubtitle}>{subtitle}</Text>
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReportsScreen({ clientId }) {
  const [orders, setOrders]           = useState([]);
  const [filteredOrders, setFiltered] = useState([]);
  const [filterType, setFilterType]   = useState('Today');
  const [loading, setLoading]         = useState(true);

  const [selectedVendor, setSelectedVendor] = useState(null);

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate]     = useState(new Date());
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd]     = useState(false);

  const [showPeriodDrop, setShowPeriodDrop] = useState(false);
  const [showStatusDrop, setShowStatusDrop] = useState(false);
  const [paymentMode]                       = useState('All');
  const [statusFilter, setStatusFilter]     = useState('All');
  const [search, setSearch]                 = useState('');

  const PERIOD_OPTIONS = ['Today', 'Week', 'Month', 'Custom'];
  const STATUS_OPTIONS = ['All', 'Completed', 'Cancelled'];

  useEffect(() => {
    if (!clientId) return;
    const q = query(collection(db, 'orders'), where('clientId', '==', clientId));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => parseDate(b.deliveryDate) - parseDate(a.deliveryDate));
      setOrders(data);
      applyFilter(data, 'Today', new Date(), new Date());
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (filterType === 'Custom' && orders.length > 0) {
      applyFilter(orders, 'Custom', startDate, endDate);
    }
  }, [startDate, endDate]);

  const applyFilter = (data, type, sd, ed) => {
    const today = clearTime(new Date());
    let result  = [];
    if (type === 'Today') {
      result = data.filter(o =>
        clearTime(parseDate(o.deliveryDate)).getTime() === today.getTime()
      );
    } else if (type === 'Week') {
      const from = new Date(today); from.setDate(today.getDate() - 7);
      result = data.filter(o => parseDate(o.deliveryDate) >= from);
    } else if (type === 'Month') {
      const from = new Date(today); from.setDate(today.getDate() - 30);
      result = data.filter(o => parseDate(o.deliveryDate) >= from);
    } else if (type === 'Custom') {
      const from = clearTime(sd);
      const to   = new Date(clearTime(ed)); to.setDate(to.getDate() + 1);
      result = data.filter(o => {
        const d = parseDate(o.deliveryDate);
        return d >= from && d < to;
      });
    }
    setFiltered(result);
    setFilterType(type);
    setSelectedVendor(null);
  };

  const handlePeriodSelect = (type) => {
    setShowPeriodDrop(false);
    if (type !== 'Custom') applyFilter(orders, type, startDate, endDate);
    else setFilterType('Custom');
  };

  const displayOrders = filteredOrders.filter(o => {
    const q = search.toLowerCase();
    const matchMode = paymentMode === 'All' || normPayment(o.paymentType) === paymentMode;
    let matchStatus = false;
    if (statusFilter === 'All')       matchStatus = o.status === 'Completed' || o.status === 'Cancelled';
    if (statusFilter === 'Completed') matchStatus = o.status === 'Completed';
    if (statusFilter === 'Cancelled') matchStatus = o.status === 'Cancelled';
    const matchSearch = !q ||
      (o.vendorName || '').toLowerCase().includes(q) ||
      (o.orderNo    || '').toLowerCase().includes(q);
    return matchMode && matchStatus && matchSearch;
  });

  const vendorSummary = (() => {
    const map = {};
    displayOrders.forEach(o => {
      const v = normalizeVendor(o.vendorName);
      if (!map[v]) map[v] = {
        vendorName: v,
        delivered: 0, cancelled: 0,
        total: 0, cod: 0, codCount: 0,
        online: 0, onlineCount: 0, totalCount: 0,
      };
      if (o.status === 'Cancelled') { map[v].cancelled++; return; }
      map[v].delivered++;
      const pm  = normPayment(o.paymentType);
      const amt = o.totalAmount || 0;
      map[v].total      += amt;
      map[v].totalCount++;
      if (pm === 'COD')    { map[v].cod    += amt; map[v].codCount++;    }
      if (pm === 'ONLINE') { map[v].online += amt; map[v].onlineCount++; }
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  })();

  const completedOrders = displayOrders.filter(o => o.status === 'Completed');
  const totalRevenue  = completedOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const codRevenue    = completedOrders.filter(o => normPayment(o.paymentType) === 'COD').reduce((s, o) => s + (o.totalAmount || 0), 0);
  const onlineRevenue = completedOrders.filter(o => normPayment(o.paymentType) === 'ONLINE').reduce((s, o) => s + (o.totalAmount || 0), 0);
  const codCount      = completedOrders.filter(o => normPayment(o.paymentType) === 'COD').length;
  const onlineCount   = completedOrders.filter(o => normPayment(o.paymentType) === 'ONLINE').length;

  const statusPieData = (() => {
    const delivered = displayOrders.filter(o => o.status === 'Completed').length;
    const cancelled = displayOrders.filter(o => o.status === 'Cancelled').length;
    const out = [];
    if (delivered > 0) out.push({ name: 'Delivered', population: delivered, color: '#22c55e' });
    if (cancelled > 0) out.push({ name: 'Cancelled', population: cancelled, color: '#ef4444' });
    return out;
  })();

  const vendorPieData = (() => {
    const counts = {};
    completedOrders.forEach(o => {
      const v = normalizeVendor(o.vendorName);
      counts[v] = (counts[v] || 0) + 1;
    });
    return Object.keys(counts)
      .map((key, i) => ({ name: key, population: counts[key], color: PIE_COLORS[i % PIE_COLORS.length] }))
      .sort((a, b) => b.population - a.population);
  })();

  const exportExcel = async (vendorFilter = null) => {
    try {
      const rows = vendorFilter
        ? displayOrders.filter(o => normalizeVendor(o.vendorName) === vendorFilter)
        : displayOrders;

      const excelData = rows.map(o => ({
        'Order No': o.orderNo || '',
        'Delivery Date': fmtDateStr(o.deliveryDate),
        'Delivery Time': o.deliveryTime || '',
        'Vendor': o.vendorName || '',
        'Customer': o.customerName || '',
        'Contact': o.contactNo || '',
        'Train': o.trainInfo || '',
        'Coach': o.coach || '',
        'Seat': o.seat || '',
        'Subtotal': o.subTotal || 0,
        'Tax': o.tax || 0,
        'Delivery Charge': o.deliveryCharge || 0,
        'Total Amount': o.totalAmount || 0,
        'Payment Type': normPayment(o.paymentType),
        'Status': o.status || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook  = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

      const today = new Date();
      let dateRangePart = '';
      if (filterType === 'Today') {
        dateRangePart = fmtDateFile(today);
      } else if (filterType === 'Week') {
        const from = new Date(today); from.setDate(today.getDate() - 7);
        dateRangePart = `${fmtDateFile(from)}_to_${fmtDateFile(today)}`;
      } else if (filterType === 'Month') {
        const from = new Date(today); from.setDate(today.getDate() - 30);
        dateRangePart = `${fmtDateFile(from)}_to_${fmtDateFile(today)}`;
      } else if (filterType === 'Custom') {
        dateRangePart = `${fmtDateFile(startDate)}_to_${fmtDateFile(endDate)}`;
      } else {
        dateRangePart = fmtDateFile(today);
      }

      const vendorPart = vendorFilter
        ? `_${vendorFilter.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_`
        : '_';
      const filename = `Report${vendorPart}${dateRangePart}.xlsx`;

      if (Platform.OS === 'web') {
        XLSX.writeFile(workbook, filename);
      } else {
        const wbout = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
        const uri   = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(uri);
      }
    } catch (error) {
      console.log('Excel Export Error:', error);
    }
  };

  const sw     = Dimensions.get('window').width;
  const PIE_SZ = Math.min(Math.floor((sw - 100) / 3.5), 240);

  if (selectedVendor) {
    const vendorOrders = filteredOrders.filter(o => normalizeVendor(o.vendorName) === selectedVendor);
    return (
      <View style={{ flex: 1, backgroundColor: '#eef2f7', padding: 14 }}>
        <VendorDetailView
          vendor={selectedVendor}
          orders={vendorOrders}
          onBack={() => setSelectedVendor(null)}
          onExport={() => exportExcel(selectedVendor)}
          statusFilter={statusFilter}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#eef2f7' }}>

      <View style={styles.controlsBar}>
        <View style={styles.topRow}>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={14} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search vendor / order…"
              placeholderTextColor="#94a3b8"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={14} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.dropWrap}>
            <TouchableOpacity
              style={styles.dropBtn}
              onPress={() => { setShowPeriodDrop(p => !p); setShowStatusDrop(false); }}
              activeOpacity={0.8}
            >
              <Text style={styles.dropBtnText}>{filterType}</Text>
              <Ionicons name="chevron-down" size={12} color="#334155" />
            </TouchableOpacity>
            {showPeriodDrop && (
              <View style={styles.dropMenu}>
                {PERIOD_OPTIONS.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.dropMenuItem, filterType === p && styles.dropMenuItemActive]}
                    onPress={() => handlePeriodSelect(p)}
                  >
                    <Text style={[styles.dropMenuText, filterType === p && styles.dropMenuTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.dropWrap}>
            <TouchableOpacity
              style={styles.dropBtn}
              onPress={() => { setShowStatusDrop(s => !s); setShowPeriodDrop(false); }}
              activeOpacity={0.8}
            >
              <Text style={styles.dropBtnText}>{statusFilter}</Text>
              <Ionicons name="chevron-down" size={12} color="#334155" />
            </TouchableOpacity>
            {showStatusDrop && (
              <View style={styles.dropMenu}>
                {STATUS_OPTIONS.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.dropMenuItem, statusFilter === s && styles.dropMenuItemActive]}
                    onPress={() => { setStatusFilter(s); setShowStatusDrop(false); }}
                  >
                    <Text style={[styles.dropMenuText, statusFilter === s && styles.dropMenuTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={{ flex: 1 }} />

          <View style={styles.dateBtn}>
            <Ionicons name="calendar-outline" size={13} color="#2563eb" />
            <Text style={styles.dateBtnText}>From: </Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={toISOLocal(startDate)}
                onChange={e => {
                  if (e.target.value) {
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    const nd = new Date(y, m - 1, d);
                    setStartDate(nd);
                    setFilterType('Custom');
                    applyFilter(orders, 'Custom', nd, endDate);
                  }
                }}
                style={{ border: 'none', outline: 'none', fontSize: 12, color: '#1d4ed8', fontWeight: '600', backgroundColor: 'transparent', cursor: 'pointer' }}
              />
            ) : (
              <>
                <TouchableOpacity onPress={() => { setShowStart(true); setShowEnd(false); }}>
                  <Text style={styles.dateBtnText}>{fmtDate(startDate)}</Text>
                </TouchableOpacity>
                {showStart && (
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    onChange={(_, d) => {
                      if (d) { setStartDate(d); setFilterType('Custom'); applyFilter(orders, 'Custom', d, endDate); }
                      setShowStart(false);
                    }}
                  />
                )}
              </>
            )}
          </View>

          <Text style={styles.dateArrow}>→</Text>

          <View style={styles.dateBtn}>
            <Ionicons name="calendar-outline" size={13} color="#2563eb" />
            <Text style={styles.dateBtnText}>To: </Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={toISOLocal(endDate)}
                onChange={e => {
                  if (e.target.value) {
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    const nd = new Date(y, m - 1, d);
                    setEndDate(nd);
                    setFilterType('Custom');
                    applyFilter(orders, 'Custom', startDate, nd);
                  }
                }}
                style={{ border: 'none', outline: 'none', fontSize: 12, color: '#1d4ed8', fontWeight: '600', backgroundColor: 'transparent', cursor: 'pointer' }}
              />
            ) : (
              <>
                <TouchableOpacity onPress={() => { setShowEnd(true); setShowStart(false); }}>
                  <Text style={styles.dateBtnText}>{fmtDate(endDate)}</Text>
                </TouchableOpacity>
                {showEnd && (
                  <DateTimePicker
                    value={endDate}
                    mode="date"
                    onChange={(_, d) => {
                      if (d) { setEndDate(d); setFilterType('Custom'); applyFilter(orders, 'Custom', startDate, d); }
                      setShowEnd(false);
                    }}
                  />
                )}
              </>
            )}
          </View>

          <TouchableOpacity style={styles.exportBtn} onPress={() => exportExcel()} activeOpacity={0.85}>
            <Text style={styles.exportBtnText}>EXPORT</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Main scroll (hidden scrollbar) ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {loading ? (
          <SkeletonLoader />
        ) : (
          <>
            <View style={styles.chartCard}>
              <View style={styles.chartRow}>
                <View style={styles.piesSection}>
                  <View style={styles.pieBlock}>
                    {statusPieData.length > 0 ? (
                      <CustomPieChart data={statusPieData} size={PIE_SZ} title="Order Status" />
                    ) : (
                      <View style={[styles.emptyPie, { width: PIE_SZ, height: PIE_SZ }]}>
                        <Ionicons name="pie-chart-outline" size={40} color="#cbd5e1" />
                        <Text style={styles.emptyTxt}>No data</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.pieBlock}>
                    {vendorPieData.length > 0 ? (
                      <CustomPieChart data={vendorPieData} size={PIE_SZ} title="Vendor Share" />
                    ) : (
                      <View style={[styles.emptyPie, { width: PIE_SZ, height: PIE_SZ }]}>
                        <Ionicons name="pie-chart-outline" size={40} color="#cbd5e1" />
                        <Text style={styles.emptyTxt}>No data</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.summaryColumn}>
                  <SummaryCard title={`Total : ${fmt(totalRevenue)}`}   subtitle={`Orders : ${completedOrders.length}`} color="#16a34a" />
                  <SummaryCard title={`COD : ${fmt(codRevenue)}`}       subtitle={`Orders : ${codCount}`}               color="#0891b2" />
                  <SummaryCard title={`Online : ${fmt(onlineRevenue)}`} subtitle={`Orders : ${onlineCount}`}            color="#7c3aed" />
                </View>
              </View>
            </View>

            <View style={styles.tableCard}>
              <View style={styles.tableHead}>
                {[
                  { label: 'No',        f: 0.4 },
                  { label: 'Vendor',    f: 1.8 },
                  { label: 'Delivered', f: 0.8 },
                  { label: 'Cancelled', f: 0.8 },
                  { label: 'Total',     f: 1.4 },
                  { label: 'COD',       f: 1.4 },
                  { label: 'Online',    f: 1.4 },
                  { label: 'Actions',   f: 0.9 },
                ].map(({ label, f }) => (
                  <Text key={label} style={[styles.th, { flex: f }]}>{label}</Text>
                ))}
              </View>

              {vendorSummary.length === 0 ? (
                <View style={styles.tableEmpty}>
                  <Ionicons name="receipt-outline" size={32} color="#cbd5e1" />
                  <Text style={styles.emptyTxt}>No orders found</Text>
                </View>
              ) : (
                vendorSummary.map((v, i) => (
                  <View key={v.vendorName} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                    <Text style={[styles.td, { flex: 0.4, color: '#94a3b8' }]}>{i + 1}</Text>
                    <Text style={[styles.td, { flex: 1.8, fontWeight: '600', color: '#1e293b' }]}>{v.vendorName}</Text>
                    <Text style={[styles.td, { flex: 0.8, color: '#16a34a', fontWeight: '700' }]}>{v.delivered}</Text>
                    <Text style={[styles.td, { flex: 0.8, color: v.cancelled > 0 ? '#dc2626' : '#94a3b8', fontWeight: '700' }]}>{v.cancelled}</Text>

                    <View style={{ flex: 1.4 }}>
                      <Text style={styles.tdAmt}>{fmt(v.total)}</Text>
                      <Text style={styles.tdCnt}>({v.totalCount} orders)</Text>
                    </View>
                    <View style={{ flex: 1.4 }}>
                      <Text style={[styles.tdAmt, { color: '#0891b2' }]}>{fmt(v.cod)}</Text>
                      <Text style={styles.tdCnt}>({v.codCount} orders)</Text>
                    </View>
                    <View style={{ flex: 1.4 }}>
                      <Text style={[styles.tdAmt, { color: '#7c3aed' }]}>{fmt(v.online)}</Text>
                      <Text style={styles.tdCnt}>({v.onlineCount} orders)</Text>
                    </View>

                    <View style={{ flex: 0.9, flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => setSelectedVendor(v.vendorName)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="chevron-forward" size={14} color="white" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {(showPeriodDrop || showStatusDrop) && (
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={() => { setShowPeriodDrop(false); setShowStatusDrop(false); }}
          activeOpacity={1}
          pointerEvents="box-only"
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eef2f7' },

  controlsBar: { backgroundColor: '#eef2f7', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4, zIndex: 100 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },

  searchBox: {
    flex: 0.7, minWidth: 110, maxWidth: 260,
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'white', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 9, paddingHorizontal: 11,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#1e293b', padding: 0, margin: 0, outlineStyle: 'none' },

  dropWrap: { zIndex: 200 },
  dropBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'white', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 9, paddingHorizontal: 13,
  },
  dropBtnText: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  dropMenu: {
    position: 'absolute', top: 42, left: 0,
    backgroundColor: 'white', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOpacity: 0.12,
    shadowRadius: 12, elevation: 20, minWidth: 120, zIndex: 9999,
  },
  dropMenuItem: { paddingVertical: 11, paddingHorizontal: 16 },
  dropMenuItemActive: { backgroundColor: '#eff6ff' },
  dropMenuText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  dropMenuTextActive: { color: '#2563eb', fontWeight: '700' },

  exportBtn: { backgroundColor: '#0f172a', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  exportBtnText: { color: 'white', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#eff6ff',
    paddingVertical: 7, paddingHorizontal: 10, borderRadius: 6,
  },
  dateBtnText: { fontSize: 12, color: '#1d4ed8', fontWeight: '600' },
  dateArrow:   { color: '#94a3b8', fontWeight: '700', fontSize: 16 },

  scroll: { flex: 1 },

  chartCard: {
    backgroundColor: 'white', borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
    padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  chartRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
  },
  piesSection: {
    flex: 2.5, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-around',
    minWidth: 500, gap: 10,
  },
  pieBlock:        { alignItems: 'center', justifyContent: 'center' },
  pieTitle:        { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6, letterSpacing: 0.3 },
  emptyPie:        { alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTxt:        { fontSize: 12, color: '#94a3b8' },

  summaryColumn:   { flex: 0.8, flexDirection: 'column', gap: 8, minWidth: 180, maxWidth: 220 },
  summaryCard:     { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  summaryTitle:    { fontSize: 12, fontWeight: '700', color: 'white', marginBottom: 2 },
  summarySubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },

  tableCard: {
    backgroundColor: 'white', borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  tableHead: { flexDirection: 'row', backgroundColor: '#0f172a', paddingVertical: 12, paddingHorizontal: 10 },
  th: { fontSize: 10, fontWeight: '700', color: 'white', letterSpacing: 0.3, textAlign: 'left' },
  tableRow: {
    flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 10,
    borderBottomWidth: 1, borderColor: '#f1f5f9', alignItems: 'center',
  },
  tableRowAlt: { backgroundColor: '#f8fafc' },
  td:          { fontSize: 12, color: '#475569' },
  tdAmt:       { fontSize: 11.5, color: '#1e293b', fontWeight: '700' },
  tdCnt:       { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  tableEmpty:  { paddingVertical: 44, alignItems: 'center', gap: 10 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
  },
});

// ─── Vendor Detail Styles ─────────────────────────────────────────────────────

const vStyles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 16, flexWrap: 'wrap',
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'white', borderRadius: 9,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 10, paddingHorizontal: 16,
  },
  backTxt: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  vendorTitle: { fontSize: 19, fontWeight: '800', color: '#0f172a', flex: 1 },

  pillRow: { flexDirection: 'row', gap: 6 },
  pill: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: 'white',
  },
  pillTxt: { fontSize: 13, fontWeight: '700', color: '#475569' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'white', borderRadius: 9,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 10, paddingHorizontal: 13,
    minWidth: 200, maxWidth: 280,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1e293b', padding: 0, margin: 0, outlineStyle: 'none' },

  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#0f172a', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 9,
  },
  exportBtnLoaded:  { backgroundColor: '#16a34a' },
  exportBtnCompare: { backgroundColor: '#2563eb' },
  exportTxt: { color: 'white', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },

  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: { flex: 1, borderRadius: 10, paddingVertical: 16, paddingHorizontal: 18 },
  summaryTitle:    { fontSize: 15, fontWeight: '800', color: 'white', marginBottom: 4 },
  summarySubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },

  tableContainer: {
    flex: 1, backgroundColor: 'white', borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#0f172a',
    paddingVertical: 14, paddingHorizontal: 14,
    borderBottomWidth: 1, borderColor: '#e2e8f0', alignItems: 'center',
  },
  col: { fontSize: 11, fontWeight: '700', color: '#ffffff', letterSpacing: 0.8 },
});

// ─── Expandable Row Styles ────────────────────────────────────────────────────

const dStyles = StyleSheet.create({
  cardContainer: { borderBottomWidth: 1, borderColor: '#f1f5f9' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', backgroundColor: 'white' },
  tableRowExpanded: { backgroundColor: '#f8fafc' },
  cell: { fontSize: 13, color: '#334155', fontWeight: '700' },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1, alignSelf: 'flex-start' },
  paymentTag: { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', letterSpacing: 0.5 },

  expandedContent: { backgroundColor: '#f8fafc', padding: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  expandedLayout: { flexDirection: 'row', gap: 16 },

  expandSectionLeft: { flex: 1.5, backgroundColor: 'white', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  miniTableHeader: { flexDirection: 'row', backgroundColor: '#f8fafc', padding: 8, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  miniHeadText: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.6 },
  miniTableRow: { flexDirection: 'row', padding: 9, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  miniCellText: { fontSize: 13, color: '#0f172a', fontWeight: '700' },

  expandSectionMid: { flex: 1, padding: 12, backgroundColor: 'white', borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.8, marginBottom: 8 },
  remarkText: { fontSize: 13, color: '#0f172a', fontWeight: '700', marginBottom: 3 },
  remarkBox: { marginTop: 10, padding: 10, backgroundColor: '#fffbeb', borderRadius: 6, borderWidth: 1, borderColor: '#fde68a' },
  remarkAlertText: { fontSize: 10, fontWeight: '700', color: '#b45309', marginBottom: 3, letterSpacing: 0.5 },
  remarkContentText: { fontSize: 12, color: '#92400e', fontWeight: '600', lineHeight: 16 },
  assignedBadgeBox: { marginTop: 12, padding: 10, backgroundColor: '#f0fdf4', borderRadius: 6, borderWidth: 1, borderColor: '#bbf7d0' },
  assignedBadgeLabel: { fontSize: 10, fontWeight: '700', color: '#16a34a', marginBottom: 2, letterSpacing: 0.5 },
  assignedBadgeName: { fontSize: 13, fontWeight: '700', color: '#14532d' },

  expandSectionRight: { flex: 1, backgroundColor: 'white', borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  financeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  financeLabel: { fontSize: 12, color: '#334155', fontWeight: '600' },
  financeValue: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  financeDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
  amountToCollectBar: { backgroundColor: '#0f172a', padding: 10, borderRadius: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  atcLabel: { color: '#94a3b8', fontWeight: '700', fontSize: 10, letterSpacing: 0.8 },
  atcValue: { color: 'white', fontWeight: '800', fontSize: 15 },
});
