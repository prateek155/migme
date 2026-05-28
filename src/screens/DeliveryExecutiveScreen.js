import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Modal } from 'react-native';
import Toast from 'react-native-toast-message';
import { collection, addDoc, onSnapshot, query, deleteDoc, doc, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebaseConfig';

export default function DeliveryExecutiveScreen({ clientId }) {
  const [executives, setExecutives] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [formName, setFormName] = useState('');
  const [formCommission, setFormCommission] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsubExecs = onSnapshot(query(collection(db, 'executives'), where('clientId', '==', clientId)), (snap) => {
      setExecutives(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, error => { console.error('DeliveryExecutiveScreen execs sync error:', error.message); });
    const unsubOrders = onSnapshot(query(collection(db, 'orders'), where('clientId', '==', clientId)), (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, error => { console.error('DeliveryExecutiveScreen orders sync error:', error.message); setLoading(false); });
    return () => { unsubExecs(); unsubOrders(); };
  }, [clientId]);

  const handleAddExecutive = async () => {
    if (!formName.trim() || !formCommission.trim()) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Fill all fields' });
      return;
    }
    const commVal = parseFloat(formCommission);
    if (isNaN(commVal) || commVal < 0) {
      Toast.show({ type: 'error', text1: 'Invalid', text2: 'Valid commission required' });
      return;
    }
    setFormSaving(true);
    try {
      await addDoc(collection(db, 'executives'), { name: formName.trim(), commission: commVal, createdAt: new Date().toISOString(), clientId });
      Toast.show({ type: 'success', text1: 'Success', text2: 'Executive added' });
      setFormName(''); setFormCommission(''); setModalVisible(false);
    } catch (e) {
      console.error('DeliveryExecutiveScreen add error:', e.message);
      Toast.show({ type: 'error', text1: 'Error', text2: e.message });
    } finally { setFormSaving(false); }
  };

  const handleDelete = async (id, name) => {
    try {
      await deleteDoc(doc(db, 'executives', id));
      Toast.show({ type: 'success', text1: 'Deleted', text2: `${name} removed` });
    } catch (e) {
      console.error('DeliveryExecutiveScreen delete error:', e.message);
      Toast.show({ type: 'error', text1: 'Error', text2: e.message });
    }
  };

  const getStats = (execId) => {
    const execOrders = orders.filter(o => o.assignedExecutiveId === execId && o.status === 'Completed');
    const codOrders = execOrders.filter(o => o.paymentType === 'COD');
    const codTotal = codOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const commission = execOrders.length * (executives.find(e => e.id === execId)?.commission || 0);
    return { delivered: execOrders.length, commission, codTotal, codOrders: codOrders.length, totalComm: commission };
  };

  const filtered = executives.filter(e => e.name?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#1a56db" /></View>;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Delivery Executives</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={16} color="white" /><Text style={styles.addButtonText}>ADD EXECUTIVE</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={15} color="#94a3b8" />
          <TextInput style={styles.searchInput} placeholder="Search" value={search} onChangeText={setSearch} />
        </View>
      </View>
      <View style={styles.tableWrapper}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 0.5 }]}>Id</Text>
          <Text style={[styles.th, { flex: 1.8 }]}>Name</Text>
          <Text style={[styles.th, { flex: 1.2 }]}>Delivered</Text>
          <Text style={[styles.th, { flex: 1 }]}>Commission</Text>
          <Text style={[styles.th, { flex: 1.2 }]}>COD Total</Text>
          <Text style={[styles.th, { flex: 1 }]}>COD Orders</Text>
          <Text style={[styles.th, { flex: 1.2 }]}>Total Comm</Text>
          <Text style={[styles.th, { flex: 1 }]}>Actions</Text>
        </View>
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => {
            const stats = getStats(item.id);
            return (
              <View style={[styles.tableRow, index % 2 !== 0 && { backgroundColor: '#fafafa' }]}>
                <Text style={[styles.td, { flex: 0.5, fontWeight: '700' }]}>{index + 1}</Text>
                <Text style={[styles.td, { flex: 1.8, fontWeight: '700' }]}>{item.name}</Text>
                <Text style={[styles.td, { flex: 1.2, fontWeight: '700' }]}>{stats.delivered}</Text>
                <Text style={[styles.td, { flex: 1, fontWeight: '700' }]}>{item.commission ?? 0}</Text>
                <Text style={[styles.td, { flex: 1.2, fontWeight: '700' }]}>₹{stats.codTotal.toFixed(2)}</Text>
                <Text style={[styles.td, { flex: 1, fontWeight: '700' }]}>{stats.codOrders}</Text>
                <Text style={[styles.td, { flex: 1.2, fontWeight: '700' }]}>₹{stats.totalComm.toFixed(2)}</Text>
                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center' }}>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.name)}>
                    <Ionicons name="trash-outline" size={15} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<View style={{ padding: 40, alignItems: 'center' }}><Text style={{ color: '#94a3b8' }}>No executives found</Text></View>}
        />
      </View>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Executive</Text>
            <TouchableOpacity onPress={() => { setModalVisible(false); setFormName(''); setFormCommission(''); }}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
          </View>
          <Text style={styles.label}>Full Name</Text>
          <TextInput style={styles.modalInput} placeholder="e.g. Ankit Sharma" value={formName} onChangeText={setFormName} />
          <Text style={styles.label}>Commission per Delivery (₹)</Text>
          <TextInput style={styles.modalInput} placeholder="e.g. 45" value={formCommission} onChangeText={setFormCommission} keyboardType="numeric" />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalVisible(false); setFormName(''); setFormCommission(''); }}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, formSaving && { opacity: 0.6 }]} onPress={handleAddExecutive} disabled={formSaving}>
              {formSaving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.saveBtnText}>Add Executive</Text>}
            </TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9', padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111827', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  addButtonText: { color: 'white', fontWeight: '700', fontSize: 13 },
  toolbar: { flexDirection: 'row', marginBottom: 16 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minWidth: 200, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a', outlineStyle: 'none' },
  tableWrapper: { flex: 1, backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#111827', paddingVertical: 14, paddingHorizontal: 16 },
  th: { fontSize: 12, fontWeight: '700', color: 'white', textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'center' },
  td: { fontSize: 14, color: '#374151', textAlign: 'center' },
  deleteBtn: { padding: 8, backgroundColor: '#fef2f2', borderRadius: 6, borderWidth: 1, borderColor: '#fecaca' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: 'white', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 13, fontSize: 14, color: '#0f172a', backgroundColor: '#f8fafc', marginBottom: 18 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  saveBtn: { flex: 1, backgroundColor: '#111827', borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: 'white' },
});
