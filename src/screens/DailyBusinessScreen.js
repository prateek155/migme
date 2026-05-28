import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, Modal, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../firebaseConfig';

const isWeb = Platform.OS === 'web';

export default function DailyBusinessScreen({ visible, onClose, clientId }) {
  const [loading, setLoading] = useState(true);
  const [todayStats, setTodayStats] = useState({ revenue: 0, orders: 0, cod: 0, codCount: 0, online: 0, onlineCount: 0 });

  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    const unsubscribe = onSnapshot(
      query(collection(db, 'orders'), where('clientId', '==', clientId)),
      (snapshot) => {
        let revenue = 0, count = 0, codTotal = 0, codCount = 0, onlineTotal = 0, onlineCount = 0;
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (data.deliveryDate === todayStr && data.status !== 'Cancelled') {
            const total = data.items?.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0) || 0;
            revenue += total;
            count++;
            if (data.paymentType === 'COD') { codTotal += total; codCount++; }
            else { onlineTotal += total; onlineCount++; }
          }
        });
        setTodayStats({ revenue, orders: count, cod: codTotal, codCount, online: onlineTotal, onlineCount });
        setLoading(false);
      },
      (error) => { console.error('DailyBusinessScreen sync error:', error.message); setLoading(false); }
    );
    return () => unsubscribe();
  }, [visible, clientId]);

  const fmt = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Daily Business</Text>
                <View style={styles.headerRight}>
                  <View style={styles.dateBadge}>
                    <MaterialCommunityIcons name="calendar" size={13} color="#64748b" />
                    <Text style={styles.dateText}>{todayStr}</Text>
                  </View>
                  <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <MaterialCommunityIcons name="close" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.divider} />
              {loading ? (
                <View style={styles.loadingRow}><ActivityIndicator size="small" color="#0f172a" /></View>
              ) : (
                <>
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Total number of orders</Text>
                    <Text style={styles.statValue}>: {todayStats.orders}</Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Total amount from orders</Text>
                    <Text style={styles.statValue}>: ₹ {fmt(todayStats.revenue)}</Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Online Orders ({todayStats.onlineCount})</Text>
                    <Text style={styles.statValue}>: ₹ {fmt(todayStats.online)}</Text>
                  </View>
                  <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.statLabel}>COD Orders ({todayStats.codCount})</Text>
                    <Text style={styles.statValue}>: ₹ {fmt(todayStats.cod)}</Text>
                  </View>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-start', alignItems: 'flex-start', paddingTop: 70, paddingLeft: isWeb ? 272 : 16 },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 20, width: isWeb ? 400 : 320 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', letterSpacing: -0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, gap: 5, borderWidth: 1, borderColor: '#e2e8f0' },
  dateText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  closeBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginBottom: 4 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  statLabel: { fontSize: 13, color: '#334155', fontWeight: '400' },
  statValue: { fontSize: 13, color: '#0f172a', fontWeight: '600' },
  loadingRow: { paddingVertical: 24, alignItems: 'center' },
});
