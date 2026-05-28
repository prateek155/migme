import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  SafeAreaView, Modal, Platform, Alert, TextInput, Dimensions, ScrollView
} from 'react-native';
import { collection, onSnapshot, query, where, updateDoc, doc, writeBatch, getDocs, getDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { db } from '../firebaseConfig';

const SOUND_OPTIONS = [
  { name: 'Classic Bell', url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
  { name: 'Soft Chime', url: 'https://assets.mixkit.co/active_storage/sfx/2875/2875-preview.mp3' },
  { name: 'Digital Alert', url: 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3' },
  { name: 'Notification Tone', url: 'https://assets.mixkit.co/active_storage/sfx/2872/2872-preview.mp3' },
];

const screenWidth = Dimensions.get('window').width;

let isShiftStarted = true;

const ExpandableOrderRow = ({ item, onPrint, onAssign, isPrinted }) => {
  const [expanded, setExpanded] = useState(false);
  const STORAGE_KEY = 'viewedOrders';
  const getViewedSet = () => { try {  return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { return new Set(); } };
  const [viewed, setViewed] = useState(() => getViewedSet().has(item.id));
  const assignBtnRef = useRef(null);

  const isAssigned = !!item.assignedExecutiveName;

  const isCancelled = item.status === 'Cancelled';
  const isCompleted = item.status === 'Completed';
  const badgeBg = isCancelled ? '#fef2f2' : (isCompleted ? '#f0fdf4' : '#fffbeb');
  const badgeTxt = isCancelled ? '#dc2626' : (isCompleted ? '#16a34a' : '#b45309');
  const badgeBorder = isCancelled ? '#fecaca' : (isCompleted ? '#bbf7d0' : '#fde68a');

  const codTypes = ['COD', 'CASH', 'CASH_ON_DELIVERY'];
  const isCOD = codTypes.includes((item.paymentType || '').toUpperCase().replace(/\s+/g, '_'));
  const paymentColor = isCOD ? '#b45309' : '#0f766e';
  const paymentLabel = isCOD ? 'COD' : 'ONLINE';
  const amountToCollect = isCOD ? (item.totalAmount || 0) : 0;

  const handleAssignPress = () => {
    assignBtnRef.current?.measure((fx, fy, width, height, px, py) => {
      onAssign(item, { x: px, y: py, width, height });
    });
  };

  return (
    <View style={styles.cardContainer}>
      <TouchableOpacity style={[styles.tableRow, expanded && styles.tableRowExpanded]} onPress={() => {  if (!expanded && !viewed) {  const set = getViewedSet(); set.add(item.id); localStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); setViewed(true); } setExpanded(!expanded); }} activeOpacity={0.85}>
        <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: viewed ? '#94a3b8' : '#f59e0b',
              alignItems: 'center', justifyContent: 'center',
              marginRight: 8,
            }}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#ffffff" />
        </View>

        <View style={{ flex: 0.8 }}>
          <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: badgeTxt, letterSpacing: 0.5 }}>{item.status || 'ACTIVE'}</Text>
          </View>
        </View>

        <Text style={[styles.cell, { flex: 1.1, fontWeight: '700', color: '#0f172a' }]}>{item.orderNo}</Text>
        <Text style={[styles.cell, { flex: 1.0, fontSize: 12 }]}>{item.deliveryDate ? new Date(item.deliveryDate).toLocaleDateString('en-GB') : '—'}</Text>
        <Text style={[styles.cell, { flex: 0.8, fontSize: 12, fontWeight: '500' }]}>{item.deliveryTime || '—'}</Text>
        <Text style={[styles.cell, { flex: 1.2 }]} numberOfLines={1}>{item.vendorName}</Text>

        <Text style={[styles.cell, { flex: 1.2 }]} numberOfLines={2}>
          {item.trainInfo || 'N/A'}{' '}
          <Text style={{ color: '#dc2626', fontWeight: '700' }}>({item.coach || 'No Coach'}{item.seat ? ` / ${item.seat}` : ''})</Text>
        </Text>

        <View style={{ flex: 0.9 }}>
          <Text style={[styles.paymentTag, { color: paymentColor, borderColor: paymentColor }]}>{paymentLabel}</Text>
        </View>

        {/* ── ACTIONS: green assign btn + blue print btn ── */}
        <View style={{ flex: 1.2, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>

          {/* Green assign / bicycle button */}
          <View style={{ position: 'relative' }}>
            <TouchableOpacity
              ref={assignBtnRef}
              style={styles.assignBtn}
              onPress={handleAssignPress}
            >
              <Ionicons name="bicycle-outline" size={16} color="#ffffff" />
            </TouchableOpacity>
            {isAssigned && (
              <View style={styles.tickBadge}>
                <Ionicons name="checkmark" size={8} color="#fff" />
              </View>
            )}
          </View>

          {/* Blue print button */}
          <View style={{ position: 'relative' }}>
            <TouchableOpacity
              style={styles.printBtn}
              onPress={() => onPrint(item)}
            >
              <Ionicons name="print-outline" size={16} color="#ffffff" />
            </TouchableOpacity>
            {isPrinted && (
              <View style={styles.tickBadge}>
                <Ionicons name="checkmark" size={8} color="#fff" />
              </View>
            )}
          </View>

        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.expandedContent}>
          <View style={styles.expandedLayout}>
            <View style={styles.expandSectionLeft}>
              <View style={styles.miniTableHeader}>
                <Text style={[styles.miniHeadText, { flex: 1 }]}>ITEM NAME</Text>
                <Text style={[styles.miniHeadText, { width: 56, textAlign: 'center' }]}>QTY</Text>
              </View>
              {item.items && item.items.map((prod, idx) => (
                <View key={idx} style={styles.miniTableRow}>
                  <Text style={[styles.miniCellText, { flex: 1 }]}>{prod.name}</Text>
                  <Text style={[styles.miniCellText, { width: 56, textAlign: 'center', fontWeight: '700', color: '#0f172a' }]}>{prod.quantity}</Text>
                </View>
              ))}
            </View>

            <View style={styles.expandSectionMid}>
              <Text style={styles.sectionLabel}>CUSTOMER DETAILS</Text>
              <Text style={styles.remarkText}>{item.customerName}</Text>
              <Text style={[styles.remarkText, { color: '#475569', fontWeight: '700' }]}>Mo: {item.contactNo}</Text>

              {item.remark && item.remark.trim() !== '' && (
                <View style={styles.remarkBox}>
                  <Text style={styles.remarkAlertText}>⚠ SPECIAL INSTRUCTIONS</Text>
                  <Text style={styles.remarkContentText}>{item.remark}</Text>
                </View>
              )}

              {item.assignedExecutiveName && (
                <View style={styles.assignedBadgeBox}>
                  <Text style={styles.assignedBadgeLabel}>ASSIGNED TO:</Text>
                  <Text style={styles.assignedBadgeName}>{item.assignedExecutiveName}</Text>
                </View>
              )}
            </View>

            <View style={styles.expandSectionRight}>
              <Text style={styles.sectionLabel}>BILLING SUMMARY</Text>
              <View style={styles.financeRow}><Text style={styles.financeLabel}>Sub Total</Text><Text style={styles.financeValue}>₹ {item.subTotal || 0}</Text></View>
              <View style={styles.financeRow}><Text style={styles.financeLabel}>Tax / GST</Text><Text style={styles.financeValue}>₹ {item.tax || 0}</Text></View>
              <View style={styles.financeRow}><Text style={styles.financeLabel}>Delivery</Text><Text style={styles.financeValue}>₹ {item.deliveryCharge || 0}</Text></View>
              <View style={styles.financeDivider} />
              <View style={styles.financeRow}>
                <Text style={[styles.financeLabel, { fontWeight: '700', color: '#0f172a' }]}>TOTAL BILL</Text>
                <Text style={[styles.financeValue, { fontSize: 15, fontWeight: '800', color: '#0f172a' }]}>₹ {item.totalAmount || 0}</Text>
              </View>

              {isCOD && (
                <View style={styles.amountToCollectBar}>
                  <Text style={styles.atcLabel}>COLLECT CASH</Text>
                  <Text style={styles.atcValue}>₹ {amountToCollect}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default function DashboardScreen({ clientId }) {
  const [appReady, setAppReady] = useState(true);
  const [orders, setOrders] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCount, setActiveCount] = useState(0);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);

  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [printedOrders, setPrintedOrders] = useState(new Set());
  const [alertSound, setAlertSound] = useState(SOUND_OPTIONS[0].url);

  const soundRef = useRef(null);
  const isFirstLoad = useRef(true);

  // Subscribe to client doc for alertSound preference
  useEffect(() => {
    if (!clientId) return;
    const unsub = onSnapshot(doc(db, 'clients', clientId), (snap) => {
      if (snap.exists()) {
        setAlertSound(snap.data().alertSound || SOUND_OPTIONS[0].url);
      }
    });
    return () => unsub();
  }, [clientId]);

  // Init sound system when alertSound changes
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web') {
          const audio = new window.Audio(alertSound);
          await audio.play().then(() => audio.pause()).catch(() => {});
          soundRef.current = audio;
        } else {
          const { sound } = await Audio.Sound.createAsync({ uri: alertSound });
          soundRef.current = sound;
        }
      } catch (e) {}
      setAppReady(true);
    })();
  }, [alertSound]);

  async function playAlert() {
    if (Platform.OS === 'web' && soundRef.current) {
      soundRef.current.currentTime = 0; soundRef.current.play().catch(e => {});
    } else if (soundRef.current) { await soundRef.current.replayAsync(); }
  }

  useEffect(() => {
    if (!appReady) return;
    const q = query(collection(db, 'orders'), where('clientId', '==', clientId));
    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      const ordersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      ordersList.sort((a, b) => {
         const timeA = a.deliveryTime || '23:59';
         const timeB = b.deliveryTime || '23:59';
         return timeA.localeCompare(timeB); // ascending: earliest time first
      });
      setOrders(ordersList);

      let active = 0; ordersList.forEach(o => { if (o.status === 'Active') active++; });
      setActiveCount(active); setLoading(false);

      if (isFirstLoad.current) { isFirstLoad.current = false; return; }
      snapshot.docChanges().forEach((change) => { if (change.type === 'added') playAlert(); });
    }, (error) => { Alert.alert('Sync Error', error.message); });

    const unsubscribeExecs = onSnapshot(query(collection(db, 'executives'), where('clientId', '==', clientId)), (snapshot) => {
      setExecutives(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubscribeOrders(); unsubscribeExecs(); };
  }, [appReady]);

  const handleMassDelete = async () => {
    if (Platform.OS === 'web') { if (!window.confirm('⚠️ Delete ALL orders?')) return; }
    setLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'orders'), where('clientId', '==', clientId)));
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      setSettingsVisible(false);
    } catch (error) { Alert.alert('Error', 'Delete failed.'); }
    setLoading(false);
  };

  const handlePrint = async (order) => {
    try {
      // Get client's payment ID for QR on bill
      let clientPaymentId = '';
      try {
        const clientSnap = await getDoc(doc(db, 'clients', clientId));
        if (clientSnap.exists()) clientPaymentId = clientSnap.data().paymentId || '';
      } catch (e) {}

      let itemsHtml = "";
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          itemsHtml += `
            <tr>
              <td style="padding: 4px 2px; border-bottom: 1px solid #eee; width: 75%; vertical-align: top;">${item.name}</td>
              <td style="padding: 4px 2px; border-bottom: 1px solid #eee; text-align: right; vertical-align: top;">${item.quantity}</td>
            </tr>`;
        });
      }

      const codTypes = ['COD', 'CASH', 'CASH_ON_DELIVERY'];
      const rawPaymentType = (order.paymentType || 'ONLINE').toUpperCase().replace(/\s+/g, '_');
      const isCOD = codTypes.includes(rawPaymentType);
      const paymentType = isCOD ? 'COD' : 'ONLINE';
      const amountToCollect = isCOD ? (order.totalAmount || 0) : 0;

      const trainNo = (order.trainInfo || 'N/A');
      const coachSeat = `${order.coach || '-'}/${order.seat || '-'}`;

     const upiUrl = `upi://pay?pa=${clientPaymentId}&pn=${order.vendorName || 'Vendor'}&am=${amountToCollect}&cu=INR`;

const qrHtml = clientPaymentId && isCOD ? `
  <div class="center" style="margin-top:12px;">
    
    <img 
      id="qrImg"
      src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUrl)}"
      style="
        width:150px;
        height:150px;
        object-fit:contain;
        border:1px solid #ccc;
        padding:4px;
      "
    />

    <div style="
      font-size:11px;
      margin-top:6px;
      font-weight:bold;
      word-break:break-all;
    ">
      Scan & Pay
    </div>

    <div style="
      font-size:10px;
      margin-top:2px;
      word-break:break-all;
    ">
      ${clientPaymentId}
    </div>

  </div>
` : '';

      const htmlContent = `
  <html>
    <head>
      <title>Receipt</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
      <style>
        @page { margin: 0; size: 80mm auto; }
        * { box-sizing: border-box; font-weight: inherit; }
        html { background-color: #ffffff; }
        body {
          background-color: #ffffff;
          font-family: 'Courier New', Courier, monospace;
          width: 72mm;
          margin: 0 auto;
          padding: 10px 16px 16px 10px;
          font-size: 12px;
          color: #000;
          font-weight: 900;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .divider { border: none; border-top: 1px #000; margin: 7px 0; }
        .detail-table { width: 100%; border-collapse: collapse; }
        .detail-table tr td { padding: 2px 0; vertical-align: top; }
        .detail-table tr td:first-child { white-space: nowrap; padding-right: 8px; }
        .detail-table tr td:last-child { text-align: right; word-break: break-word; }
        .items-table { width: 100%; border-collapse: collapse; margin-top: 2px; }
        .items-head th { font-weight: bold; padding: 4px 2px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-size: 14px; }
        .items-head th:first-child { text-align: left; }
        .items-head th:last-child { text-align: right; width: 40px; }
        .items-table tbody tr td { padding: 3px 2px; vertical-align: top; font-size: 15px; }
        .items-table tbody tr td:last-child { text-align: right; width: 40px; }
        .totals-table { width: 100%; border-collapse: collapse; }
        .totals-table td { padding: 2px 0; font-size: 14px; }
        .totals-table td:last-child { text-align: right; padding-right: 6px; }
        .totals-table tr.total-row td { font-weight: bold; font-size: 14px; padding-top: 3px; }
        .totals-table tr.collect-row td { font-weight: bold; font-size: 14px; }
        .payment-box { border: 2.5px solid #000; text-align: center; padding: 8px 4px; margin: 10px 0 0 0; font-size: 30px; font-weight: 900; letter-spacing: 4px; }
        .train-box { border: 2.5px solid #000; border-top: none; display: flex; margin: 0 0 10px 0; }
        .train-cell { flex: 1; text-align: center; padding: 8px 4px; font-size: 16px; font-weight: 900; }
        .train-cell.divider-right { border-right: 2.5px solid #000; }
      </style>
    </head>
    <body>
      <div class="center bold" style="font-size:16px; margin-bottom:2px;">E-Catering Orders</div>
      <div class="center" style="font-size:11px;">26 - Shree Siddhivinayak Complex,<br/>Railway Station Vadodara</div>
      <hr class="divider"/>
      <table class="detail-table">
        <tr><td>Order No.</td><td>${order.orderNo || order.pnr || 'N/A'}</td></tr>
        <tr><td>Vendor</td><td>${order.vendorName || 'N/A'}</td></tr>
        <tr><td>Date</td><td>${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}</td></tr>
        <tr><td>Time</td><td>${order.deliveryTime || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}</td></tr>
        <tr><td>Customer</td><td>${order.customerName || 'Customer'}</td></tr>
        <tr><td>Mobile</td><td>${order.contactNo || 'N/A'}</td></tr>
      </table>
      <hr class="divider"/>
      <table class="items-table">
        <thead class="items-head"><tr><th>Item</th><th>Qty</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <hr class="divider"/>
      <table class="totals-table">
        <tr><td>Remarks:</td><td>${order.remark && order.remark.trim() !== '' ? order.remark : ''}</td></tr>
        <tr><td>Advance:</td><td>₹ 0</td></tr>
        <tr><td>GST:</td><td>₹ ${order.tax || 0}</td></tr>
        <tr><td>Tax:</td><td>₹ 0</td></tr>
        <tr><td>Discount:</td><td>₹ 0</td></tr>
        <tr class="total-row"><td>Total:</td><td>₹ ${order.totalAmount || 0}</td></tr>
        <tr class="collect-row"><td>Amount to collect:</td><td>₹ ${amountToCollect}</td></tr>
      </table>
      <div class="payment-box">${paymentType}</div>
      <div class="train-box">
        <div class="train-cell divider-right">${trainNo}</div>
        <div class="train-cell">${coachSeat}</div>
      </div>
      ${qrHtml}
      <div class="center" style="font-size:14px;">www.imperiial.tech</div>
    </body>
  </html>`;

      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        iframe.contentDocument.write(htmlContent);
        iframe.contentDocument.close();
        const doPrint = () => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setPrintedOrders(prev => new Set([...prev, order.id]));
          updateDoc(doc(db, 'orders', order.id), { status: 'Completed' }).catch(() => {});
          setTimeout(() => { document.body.removeChild(iframe); }, 1000);
        };
        const img = iframe.contentDocument.getElementById('qrImg');
        if (img && !img.complete) { img.onload = doPrint; img.onerror = doPrint; }
        else { doPrint(); }
      } else {
        Alert.alert("Notice", "Printing is currently configured for Web only.");
      }
    } catch (error) {
      console.error("Printing Error:", error);
      Alert.alert("Print Failed", "Could not generate the receipt.");
    }
  };

  const openStatusModal = (order, pos) => {
    setSelectedOrder(order);
    setDropdownPos(pos);
    setStatusModalVisible(true);
  };

  const openAssignModal = (order, pos) => {
    setSelectedOrder(order);
    setDropdownPos(pos);
    setAssignModalVisible(true);
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!selectedOrder) return;
    await updateDoc(doc(db, 'orders', selectedOrder.id), { status: newStatus });
    setStatusModalVisible(false);
  };

  const handleAssignExec = async (exec) => {
    if (!selectedOrder) return;
    await updateDoc(doc(db, 'orders', selectedOrder.id), { assignedExecutiveId: exec.id, assignedExecutiveName: exec.name });
    setAssignModalVisible(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.heading}>Active Orders</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => { setIsAdminUnlocked(false); setAdminPin(''); setSettingsVisible(true); }}>
          <Ionicons name="settings-outline" size={16} color="#64748b" />
        </TouchableOpacity>
      </View>

      <View style={styles.tableContainer}>
        <View style={styles.tableHeader}>
          <View style={{ width: 36 }} />
          <Text style={[styles.col, { flex: 0.8 }]}>STATUS</Text>
          <Text style={[styles.col, { flex: 1.1 }]}>ORDER NO.</Text>
          <Text style={[styles.col, { flex: 1.0 }]}>DEL. DATE</Text>
          <Text style={[styles.col, { flex: 0.8 }]}>DEL. TIME</Text>
          <Text style={[styles.col, { flex: 1.2 }]}>VENDOR</Text>
          <Text style={[styles.col, { flex: 1.2 }]}>TRAIN</Text>
          <Text style={[styles.col, { flex: 0.9 }]}>PAYMENT</Text>
          <Text style={[styles.col, { flex: 1.2, textAlign: 'center' }]}>ACTIONS</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#0f172a" style={{ marginTop: 60 }} />
        ) : orders.filter(o => o.status === 'Active').length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={36} color="#cbd5e1" />
            <Text style={styles.emptyStateText}>No active orders right now</Text>
          </View>
        ) : (
          <FlatList
            data={orders.filter(o => o.status === 'Active')}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <ExpandableOrderRow
                item={item}
                onPrint={handlePrint}
                onAssign={openAssignModal}
                isPrinted={printedOrders.has(item.id)}
              />
            )}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 50, flexGrow: 1 }}
          />
        )}
      </View>

      <Modal visible={assignModalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.dropdownBackdrop}
          activeOpacity={1}
          onPress={() => setAssignModalVisible(false)}
        >
          <View
            style={[
              styles.dropdownContainer,
              { top: dropdownPos.y + dropdownPos.height + 6, left: dropdownPos.x - 180 }
            ]}
          >
            <Text style={styles.dropdownTitle}>ASSIGN EXECUTIVE</Text>
            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
              {executives.map(exec => (
                <TouchableOpacity
                  key={exec.id}
                  style={styles.execDropdownRow}
                  onPress={() => handleAssignExec(exec)}
                >
                  <Ionicons name="person-circle-outline" size={20} color="#475569" />
                  <Text style={styles.execName}>{exec.name}</Text>
                </TouchableOpacity>
              ))}
              {executives.length === 0 && (
                <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 16, fontSize: 13 }}>
                  No executives found.
                </Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Admin Panel</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            {!isAdminUnlocked ? (
              <View>
                <Text style={styles.pinLabel}>Enter Admin PIN</Text>
                <TextInput
                  style={styles.pinInput}
                  placeholder="• • • •"
                  keyboardType="numeric"
                  secureTextEntry
                  value={adminPin}
                  onChangeText={setAdminPin}
                />
                <TouchableOpacity
                  style={styles.unlockBtn}
                  onPress={() => adminPin === '1234' ? setIsAdminUnlocked(true) : Alert.alert('Wrong PIN')}
                >
                  <Text style={styles.unlockBtnText}>Unlock</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.dangerWarning}>This will permanently delete all orders from the database.</Text>
                <TouchableOpacity style={styles.dangerBtn} onPress={handleMassDelete}>
                  <Ionicons name="trash-outline" size={16} color="white" />
                  <Text style={styles.dangerBtnText}>Delete Entire Database</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 24, height: Platform.OS === 'web' ? '100vh' : '100%' },
  lockScreen: { flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' },
  lockIconWrapper: { width: 80, height: 80, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  lockTitle: { fontSize: 28, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  lockSubtitle: { fontSize: 14, color: '#94a3b8', marginTop: 4, marginBottom: 36 },
  startButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 8 },
  startText: { color: '#0f172a', fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  heading: { fontSize: 22, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  activeCountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16a34a' },
  subHeading: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  settingsBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  tableContainer: { flex: 1, backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#0f172a', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  col: { fontSize: 10, fontWeight: '700', color: '#ffffff', letterSpacing: 0.8 },
  cardContainer: { borderBottomWidth: 1, borderColor: '#f1f5f9' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', backgroundColor: 'white' },
  tableRowExpanded: { backgroundColor: '#f8fafc' },
  cell: { fontSize: 13, color: '#334155', fontWeight: '700' },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1, alignSelf: 'flex-start' },
  paymentTag: { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', letterSpacing: 0.5 },

  // ── Green assign (bicycle) button ──
  assignBtn: {
    width: 32, height: 32, borderRadius: 6,
    backgroundColor: '#16a34a',
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Blue print button ──
  printBtn: {
    width: 32, height: 32, borderRadius: 6,
    backgroundColor: '#3b82f6',
    justifyContent: 'center', alignItems: 'center',
  },

  tickBadge: { position: 'absolute', top: -5, right: -5, width: 14, height: 14, borderRadius: 7, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#fff' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyStateText: { fontSize: 14, color: '#94a3b8' },
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
  dropdownBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  dropdownContainer: { position: 'absolute', backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', width: 210, paddingVertical: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 12 },
  dropdownTitle: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  dropdownItemText: { fontSize: 13, fontWeight: '600' },
  execDropdownRow: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: '#f1f5f9', gap: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { backgroundColor: 'white', width: 360, borderRadius: 10, padding: 24, borderWidth: 1, borderColor: '#e2e8f0' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  pinLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 8 },
  pinInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, padding: 12, textAlign: 'center', fontSize: 18, letterSpacing: 8, marginBottom: 12, color: '#0f172a', backgroundColor: '#f8fafc' },
  unlockBtn: { backgroundColor: '#0f172a', padding: 12, borderRadius: 6, alignItems: 'center' },
  unlockBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  dangerWarning: { fontSize: 12, color: '#64748b', marginBottom: 14, lineHeight: 18 },
  dangerBtn: { flexDirection: 'row', gap: 8, backgroundColor: '#dc2626', padding: 13, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  dangerBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  execName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
});