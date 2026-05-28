import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Platform, TouchableOpacity, TextInput, ScrollView, Modal } from 'react-native';
import { collection, onSnapshot, query, where, updateDoc, doc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebaseConfig';

const STATUS_OPTIONS = ['Active', 'Confirmed', 'Cancelled'];

const ExpandableOrderRow = ({ item, onUpdateStatus, onAssign }) => {
  const [expanded, setExpanded] = useState(false);
  const isCancelled = item.status === 'Cancelled';
  const isCompleted = item.status === 'Completed';
  const badgeBg = isCancelled ? '#fef2f2' : isCompleted ? '#f0fdf4' : '#fffbeb';
  const badgeTxt = isCancelled ? '#dc2626' : isCompleted ? '#16a34a' : '#b45309';
  const badgeBorder = isCancelled ? '#fecaca' : isCompleted ? '#bbf7d0' : '#fde68a';
  const isCOD = ['COD', 'CASH', 'CASH_ON_DELIVERY'].includes((item.paymentType || '').toUpperCase().replace(/\s+/g, '_'));
  const paymentColor = isCOD ? '#b45309' : '#0f766e';
  const paymentLabel = isCOD ? 'COD' : 'ONLINE';
  const isAssigned = !!item.assignedExecutiveName;

  return (
    <View style={styles.cardContainer}>
      <TouchableOpacity style={[styles.tableRow, expanded && styles.tableRowExpanded]} onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#94a3b8', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#ffffff" />
        </View>
        <View style={{ flex: 0.8 }}>
          <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: badgeTxt }}>{item.status || 'ACTIVE'}</Text>
          </View>
        </View>
        <Text style={[styles.cell, { flex: 1.1, fontWeight: '700', color: '#0f172a' }]}>{item.orderNo}</Text>
        <Text style={[styles.cell, { flex: 1.0, fontSize: 12 }]}>{item.deliveryDate ? new Date(item.deliveryDate).toLocaleDateString('en-GB') : '—'}</Text>
        <Text style={[styles.cell, { flex: 0.8, fontSize: 12 }]}>{item.deliveryTime || '—'}</Text>
        <Text style={[styles.cell, { flex: 1.2 }]} numberOfLines={1}>{item.vendorName}</Text>
        <Text style={[styles.cell, { flex: 1.2 }]} numberOfLines={2}>{item.trainInfo || 'N/A'} <Text style={{ color: '#dc2626', fontWeight: '700' }}>({item.coach || '-'})</Text></Text>
        <View style={{ flex: 0.9 }}><Text style={[styles.paymentTag, { color: paymentColor, borderColor: paymentColor }]}>{paymentLabel}</Text></View>
        <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: isAssigned ? '#16a34a' : '#94a3b8' }} numberOfLines={1}>{item.assignedExecutiveName || 'Not Assigned'}</Text>
          <TouchableOpacity style={styles.assignBtn} onPress={() => onAssign(item)}>
            <Ionicons name="bicycle-outline" size={15} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={(e) => { e.stopPropagation(); onUpdateStatus(item); }}>
            <Ionicons name="create-outline" size={15} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.expandedContent}>
          <View style={styles.expandedLayout}>
            <View style={styles.expandSectionLeft}>
              <View style={styles.miniTableHeader}><Text style={[styles.miniHeadText, { flex: 1 }]}>ITEM NAME</Text><Text style={[styles.miniHeadText, { width: 56, textAlign: 'center' }]}>QTY</Text></View>
              {item.items?.map((prod, idx) => (<View key={idx} style={styles.miniTableRow}><Text style={[styles.miniCellText, { flex: 1 }]}>{prod.name}</Text><Text style={[styles.miniCellText, { width: 56, textAlign: 'center', fontWeight: '700', color: '#0f172a' }]}>{prod.quantity}</Text></View>))}
            </View>
            <View style={styles.expandSectionMid}>
              <Text style={styles.sectionLabel}>CUSTOMER</Text>
              <Text style={styles.remarkText}>{item.customerName}</Text>
              <Text style={[styles.remarkText, { color: '#64748b' }]}>Mo: {item.contactNo}</Text>
              {item.assignedExecutiveName && (<View style={styles.assignedBadgeBox}><Text style={styles.assignedBadgeLabel}>Delivered By:</Text><Text style={styles.assignedBadgeName}>{item.assignedExecutiveName}</Text></View>)}
            </View>
            <View style={styles.expandSectionRight}>
              <Text style={styles.sectionLabel}>BILLING</Text>
              <View style={styles.financeRow}><Text style={styles.financeLabel}>Sub Total</Text><Text style={styles.financeValue}>₹ {item.subTotal || 0}</Text></View>
              <View style={styles.financeRow}><Text style={styles.financeLabel}>Tax</Text><Text style={styles.financeValue}>₹ {item.tax || 0}</Text></View>
              <View style={styles.financeDivider} />
              <View style={styles.financeRow}><Text style={[styles.financeLabel, { fontWeight: '700' }]}>TOTAL</Text><Text style={[styles.financeValue, { fontSize: 15, fontWeight: '800' }]}>₹ {item.totalAmount || 0}</Text></View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default function FilteredOrdersScreen({ statusFilter, title, clientId }) {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusModalVisible, setStatusModalVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'executives'), where('clientId', '==', clientId)), (snapshot) => {
      setExecutives(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, error => { console.error('FilteredOrdersScreen execs sync error:', error.message); });
    return () => unsubscribe();
  }, [clientId]);

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('clientId', '==', clientId), where('status', '==', statusFilter));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setOrders(list);
      setFilteredOrders(list);
      setLoading(false);
    }, error => { console.error('FilteredOrdersScreen orders sync error:', error.message); setLoading(false); });
    return () => unsubscribe();
  }, [statusFilter, clientId]);

  useEffect(() => {
    if (!searchQuery.trim()) { setFilteredOrders(orders); }
    else {
      const q = searchQuery.toLowerCase();
      setFilteredOrders(orders.filter(o => (o.orderNo || '').toLowerCase().includes(q) || (o.vendorName || '').toLowerCase().includes(q) || (o.customerName || '').toLowerCase().includes(q)));
    }
  }, [searchQuery, orders]);

  const handleUpdateStatus = async (order) => {
    setSelectedOrder(order);
    setStatusModalVisible(true);
  };

  const handleStatusChange = async (newStatus) => {
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
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View><Text style={styles.heading}>{title}</Text><Text style={styles.subHeading}>{loading ? '…' : `${filteredOrders.length} orders`}</Text></View>
        {!loading && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput style={styles.searchInput} placeholder="Search order, vendor, customer…" value={searchQuery} onChangeText={setSearchQuery} />
          </View>
        )}
      </View>
      <View style={styles.tableContainer}>
        <View style={styles.tableHeader}>
          <View style={{ width: 36 }} />
          <Text style={[styles.col, { flex: 0.8 }]}>STATUS</Text>
          <Text style={[styles.col, { flex: 1.1 }]}>ORDER NO.</Text>
          <Text style={[styles.col, { flex: 1.0 }]}>DATE</Text>
          <Text style={[styles.col, { flex: 0.8 }]}>TIME</Text>
          <Text style={[styles.col, { flex: 1.2 }]}>VENDOR</Text>
          <Text style={[styles.col, { flex: 1.2 }]}>TRAIN</Text>
          <Text style={[styles.col, { flex: 0.9 }]}>PAYMENT</Text>
          <Text style={[styles.col, { flex: 1.2 }]}>EXECUTIVE</Text>
        </View>
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Loading…</Text></View>
        ) : filteredOrders.length === 0 ? (
          <View style={styles.emptyState}><Ionicons name="receipt-outline" size={36} color="#cbd5e1" /><Text style={styles.emptyStateText}>No {statusFilter.toLowerCase()} orders</Text></View>
        ) : (
          <FlatList
            data={filteredOrders}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <ExpandableOrderRow
                item={item}
                onUpdateStatus={handleUpdateStatus}
                onAssign={(order) => { setSelectedOrder(order); setAssignModalVisible(true); }}
              />
            )}
          />
        )}
      </View>

      <Modal visible={statusModalVisible} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' }} activeOpacity={1} onPress={() => setStatusModalVisible(false)}>
          <View style={{ backgroundColor: 'white', borderRadius: 8, width: 180, alignSelf: 'center', marginTop: 300, padding: 4, borderWidth: 1, borderColor: '#e2e8f0' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#94a3b8', padding: 10 }}>CHANGE STATUS</Text>
            {STATUS_OPTIONS.map(s => (
              <TouchableOpacity key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderBottomWidth: 1, borderColor: '#f8fafc' }} onPress={() => handleStatusChange(s)}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s === 'Active' ? '#f59e0b' : s === 'Confirmed' ? '#3b82f6' : '#dc2626' }} />
                <Text style={{ fontSize: 13, color: '#334155' }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={assignModalVisible} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' }} activeOpacity={1} onPress={() => setAssignModalVisible(false)}>
          <View style={{ backgroundColor: 'white', borderRadius: 8, width: 220, alignSelf: 'center', marginTop: 300, borderWidth: 1, borderColor: '#e2e8f0' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#3b82f6', padding: 11, borderBottomWidth: 1, borderColor: '#f1f5f9' }}>ASSIGN EXECUTIVE</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {executives.map(exec => (
                <TouchableOpacity key={exec.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderColor: '#f1f5f9' }} onPress={() => handleAssignExec(exec)}>
                  <Ionicons name="person-circle-outline" size={20} color="#475569" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#0f172a' }}>{exec.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 24 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  heading: { fontSize: 22, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  subHeading: { fontSize: 13, color: '#64748b', fontWeight: '500', marginTop: 3 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', minWidth: 280, gap: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#0f172a', outlineStyle: 'none' },
  tableContainer: { flex: 1, backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#0f172a', paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center' },
  col: { fontSize: 10, fontWeight: '700', color: '#ffffff', letterSpacing: 0.8 },
  cardContainer: { borderBottomWidth: 1, borderColor: '#f1f5f9' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', backgroundColor: 'white' },
  tableRowExpanded: { backgroundColor: '#f8fafc' },
  cell: { fontSize: 13, color: '#334155', fontWeight: '700' },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 1, alignSelf: 'flex-start' },
  paymentTag: { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  assignBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#16a34a', justifyContent: 'center', alignItems: 'center' },
  editBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyStateText: { fontSize: 14, color: '#94a3b8' },
  expandedContent: { backgroundColor: '#f8fafc', padding: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  expandedLayout: { flexDirection: 'row', gap: 16 },
  expandSectionLeft: { flex: 1.5, backgroundColor: 'white', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  miniTableHeader: { flexDirection: 'row', backgroundColor: '#f8fafc', padding: 8, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  miniHeadText: { fontSize: 10, fontWeight: '700', color: '#94a3b8' },
  miniTableRow: { flexDirection: 'row', padding: 9, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  miniCellText: { fontSize: 13, color: '#334155' },
  expandSectionMid: { flex: 1, padding: 12, backgroundColor: 'white', borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', marginBottom: 8 },
  remarkText: { fontSize: 13, color: '#0f172a', fontWeight: '500', marginBottom: 3 },
  assignedBadgeBox: { marginTop: 12, padding: 10, backgroundColor: '#f0fdf4', borderRadius: 6, borderWidth: 1, borderColor: '#bbf7d0' },
  assignedBadgeLabel: { fontSize: 10, fontWeight: '700', color: '#16a34a' },
  assignedBadgeName: { fontSize: 13, fontWeight: '700', color: '#14532d' },
  expandSectionRight: { flex: 1, backgroundColor: 'white', borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  financeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  financeLabel: { fontSize: 12, color: '#64748b' },
  financeValue: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  financeDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
});
