import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, Platform, Dimensions, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Audio } from 'expo-av';
import { db } from '../firebaseConfig';

const SOUND_OPTIONS = [
  { name: 'Classic Bell', icon: 'notifications-outline', url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
  { name: 'Soft Chime', icon: 'musical-notes-outline', url: 'https://assets.mixkit.co/active_storage/sfx/2875/2875-preview.mp3' },
  { name: 'Digital Alert', icon: 'pulse-outline', url: 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3' },
  { name: 'Notification Tone', icon: 'volume-medium-outline', url: 'https://assets.mixkit.co/active_storage/sfx/2872/2872-preview.mp3' },
];

// Build a QR code image URL from Google Charts API (no extra dependency needed)
const getQRUrl = (text) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}&color=0f172a&bgcolor=ffffff&qzone=2`;

function useScreenWidth() {
  const [width, setWidth] = useState(Dimensions.get('window').width);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setWidth(window.width));
    return () => sub?.remove?.();
  }, []);
  return width;
}

export default function ClientSettingsScreen({ clientId, clientEmail, onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  // Payment state
  const [paymentId, setPaymentId] = useState('');
  const [savedPaymentId, setSavedPaymentId] = useState(''); // what's committed in DB
  const [editingPayment, setEditingPayment] = useState(false);

  // Password state
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [storedPassword, setStoredPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  // Sound state
  const [selectedSound, setSelectedSound] = useState(SOUND_OPTIONS[0].url);
  const [playingSound, setPlayingSound] = useState(null);

  const screenWidth = useScreenWidth();
  const isWide = screenWidth >= 768;

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'clients', clientId));
        if (snap.exists()) {
          const data = snap.data();
          setStoredPassword(data.password || '');
          const pid = data.paymentId || '';
          setPaymentId(pid);
          setSavedPaymentId(pid);
          setEditingPayment(!pid); // auto-open editor if no ID yet
          setSelectedSound(data.alertSound || SOUND_OPTIONS[0].url);
        }
      } catch (e) {
        console.error('ClientSettingsScreen load error:', e.message);
      }
      setLoading(false);
    })();
  }, [clientId]);

  /* ── Password ── */
  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      Alert.alert('Missing Fields', 'Please fill in all password fields');
      return;
    }
    if (currentPwd !== storedPassword) {
      Alert.alert('Incorrect Password', 'Current password does not match');
      return;
    }
    if (newPwd.length < 4) {
      Alert.alert('Too Short', 'New password must be at least 4 characters');
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert('Mismatch', 'New password and confirm password do not match');
      return;
    }
    setSavingPwd(true);
    try {
      await updateDoc(doc(db, 'clients', clientId), { password: newPwd });
      setStoredPassword(newPwd);
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
      Alert.alert('✓ Password Updated', 'Your password has been changed successfully');
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setSavingPwd(false);
  };

  /* ── Payment ID save / update ── */
  const handleSavePaymentId = async () => {
    const trimmed = paymentId.trim();
    if (!trimmed) {
      Alert.alert('Empty ID', 'Please enter a UPI ID before saving');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'clients', clientId), { paymentId: trimmed });
      setSavedPaymentId(trimmed);
      setPaymentId(trimmed);
      setEditingPayment(false);
      Alert.alert('✓ Saved', 'Payment ID saved. QR code is now visible below.');
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setSaving(false);
  };

  /* ── Payment ID remove ── */
  const handleRemovePaymentId = () => {
    Alert.alert(
      'Remove Payment ID',
      'This will delete your UPI ID and QR code from bills. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await updateDoc(doc(db, 'clients', clientId), { paymentId: '' });
              setSavedPaymentId('');
              setPaymentId('');
              setEditingPayment(true);
            } catch (e) {
              Alert.alert('Error', e.message);
            }
            setSaving(false);
          }
        }
      ]
    );
  };

  /* ── Cancel edit ── */
  const handleCancelEdit = () => {
    setPaymentId(savedPaymentId);
    setEditingPayment(false);
  };

  /* ── Sound ── */
  const handleSoundSelect = async (opt) => {
    setSelectedSound(opt.url);
    setPlayingSound(opt.url);
    try {
      if (Platform.OS === 'web') {
        const a = new window.Audio(opt.url);
        a.volume = 0.5;
        a.play().catch(() => {});
        setTimeout(() => setPlayingSound(null), 2000);
      } else {
        const { sound } = await Audio.Sound.createAsync({ uri: opt.url });
        await sound.setVolumeAsync(0.5);
        await sound.playAsync();
        setTimeout(() => setPlayingSound(null), 2000);
      }
    } catch (e) {}
    try {
      await updateDoc(doc(db, 'clients', clientId), { alertSound: opt.url });
    } catch (e) {}
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  /* ── QR Preview Section ── */
  const QRSection = () => (
    <View style={styles.qrWrapper}>
      {/* UPI badge */}
      <View style={styles.qrBadgeRow}>
        <View style={styles.qrBadge}>
          <Ionicons name="flash" size={11} color="#16a34a" />
          <Text style={styles.qrBadgeText}>UPI</Text>
        </View>
        <Text style={styles.qrLabel}>Scan to Pay</Text>
      </View>

      {/* QR image */}
      <View style={styles.qrImageWrap}>
        <Image
          source={{ uri: getQRUrl(savedPaymentId) }}
          style={styles.qrImage}
          resizeMode="contain"
        />
      </View>

      {/* UPI ID */}
      <View style={styles.qrUpiRow}>
        <Ionicons name="wallet-outline" size={13} color="#64748b" />
        <Text style={styles.qrUpiText} numberOfLines={1}>{savedPaymentId}</Text>
      </View>

      <Text style={styles.qrNote}>
        This QR will appear on printed bills for instant customer payments.
      </Text>

      {/* Action buttons */}
      <View style={styles.qrActions}>
        <TouchableOpacity
          style={styles.qrEditBtn}
          onPress={() => {
            setPaymentId(savedPaymentId);
            setEditingPayment(true);
          }}
        >
          <Ionicons name="pencil-outline" size={13} color="#6366f1" />
          <Text style={styles.qrEditText}>Update ID</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.qrRemoveBtn}
          onPress={handleRemovePaymentId}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#ef4444" />
            : <>
                <Ionicons name="trash-outline" size={13} color="#ef4444" />
                <Text style={styles.qrRemoveText}>Remove</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </View>
  );

  /* ── Payment Editor ── */
  const PaymentEditor = () => (
    <>
      <Text style={styles.fieldLabel}>UPI ID / Payment Address</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name="wallet-outline" size={15} color="#94a3b8" style={styles.inputIcon} />
        <TextInput
          style={[styles.fieldInput, { paddingLeft: 36 }]}
          placeholder="e.g. name@upi or 98765@paytm"
          placeholderTextColor="#c7d0dc"
          value={paymentId}
          onChangeText={setPaymentId}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
      </View>

      <View style={styles.hintBox}>
        <Ionicons name="information-circle-outline" size={14} color="#16a34a" style={{ marginTop: 1 }} />
        <Text style={styles.hintText}>
          This ID will appear as a scannable QR code on printed bills, so customers can pay instantly.
        </Text>
      </View>

      <View style={styles.paymentBtnRow}>
        {savedPaymentId ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { flex: 1 }]}
            onPress={handleCancelEdit}
          >
            <Ionicons name="close-outline" size={15} color="#64748b" style={{ marginRight: 4 }} />
            <Text style={styles.btnOutlineText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.btn, styles.btnGreen, { flex: savedPaymentId ? 2 : 1 }, saving && styles.btnDisabled]}
          onPress={handleSavePaymentId}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <>
                <Ionicons name="save-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.btnText}>{savedPaymentId ? 'Update Payment ID' : 'Save Payment ID'}</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onNavigate('Dashboard')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={17} color="#475569" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSub}>{clientEmail}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>ACCOUNT</Text>

        {/* Password + Payment side by side on wide */}
        <View style={[styles.row, !isWide && { flexDirection: 'column' }]}>

          {/* ── Password Card ── */}
          <View style={[styles.card, isWide && styles.cardHalf]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="lock-closed-outline" size={18} color="#6366f1" />
              </View>
              <View>
                <Text style={styles.cardTitle}>Change Password</Text>
                <Text style={styles.cardSubtitle}>Update your login credentials</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.fieldLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={15} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={[styles.fieldInput, styles.disabledInput, { paddingLeft: 36 }]}
                value={clientEmail}
                editable={false}
              />
            </View>

            <Text style={styles.fieldLabel}>Current Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="key-outline" size={15} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={[styles.fieldInput, { paddingLeft: 36, paddingRight: 40 }]}
                placeholder="Enter current password"
                placeholderTextColor="#c7d0dc"
                secureTextEntry={!showCurrentPwd}
                value={currentPwd}
                onChangeText={setCurrentPwd}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowCurrentPwd(v => !v)}>
                <Ionicons name={showCurrentPwd ? 'eye-off-outline' : 'eye-outline'} size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>New Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-open-outline" size={15} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={[styles.fieldInput, { paddingLeft: 36, paddingRight: 40 }]}
                placeholder="Min. 4 characters"
                placeholderTextColor="#c7d0dc"
                secureTextEntry={!showNewPwd}
                value={newPwd}
                onChangeText={setNewPwd}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowNewPwd(v => !v)}>
                <Ionicons name={showNewPwd ? 'eye-off-outline' : 'eye-outline'} size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Confirm New Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="checkmark-circle-outline" size={15} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={[styles.fieldInput, { paddingLeft: 36, paddingRight: 40 }]}
                placeholder="Re-enter new password"
                placeholderTextColor="#c7d0dc"
                secureTextEntry={!showConfirmPwd}
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirmPwd(v => !v)}>
                <Ionicons name={showConfirmPwd ? 'eye-off-outline' : 'eye-outline'} size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, savingPwd && styles.btnDisabled]}
              onPress={handleChangePassword}
              disabled={savingPwd}
            >
              {savingPwd
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="shield-checkmark-outline" size={15} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.btnText}>Update Password</Text>
                  </>
              }
            </TouchableOpacity>
          </View>

          {/* ── Payment Card ── */}
          <View style={[styles.card, isWide && styles.cardHalf]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="qr-code-outline" size={18} color="#16a34a" />
              </View>
              <View>
                <Text style={styles.cardTitle}>Payment ID</Text>
                <Text style={styles.cardSubtitle}>UPI / QR code for bills</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Show QR preview if saved & not editing, otherwise show editor */}
            {savedPaymentId && !editingPayment
              ? <QRSection />
              : <PaymentEditor />
            }
          </View>

        </View>

        {/* ── Notification Sound ── */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>NOTIFICATIONS</Text>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#fff7ed' }]}>
              <Ionicons name="musical-note-outline" size={18} color="#f59e0b" />
            </View>
            <View>
              <Text style={styles.cardTitle}>Alert Sound</Text>
              <Text style={styles.cardSubtitle}>Plays when a new order arrives</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={[styles.soundGrid, isWide && styles.soundGridWide]}>
            {SOUND_OPTIONS.map((opt, i) => {
              const isSelected = selectedSound === opt.url;
              const isPlaying = playingSound === opt.url;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.soundTile, isSelected && styles.soundTileSelected]}
                  onPress={() => handleSoundSelect(opt)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.soundIconWrap, isSelected && styles.soundIconWrapSelected]}>
                    <Ionicons
                      name={isPlaying ? 'volume-high' : opt.icon}
                      size={20}
                      color={isSelected ? '#f59e0b' : '#94a3b8'}
                    />
                  </View>
                  <Text style={[styles.soundName, isSelected && styles.soundNameSelected]}>{opt.name}</Text>
                  {isSelected && (
                    <View style={styles.soundCheck}>
                      <Ionicons name="checkmark" size={11} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9', gap: 12 },
  loadingText: { fontSize: 13, color: '#94a3b8' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0',
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  headerSub: { fontSize: 11, color: '#94a3b8', lineHeight: 16 },

  scrollContent: { padding: 16, paddingBottom: 40 },
  scrollContentWide: { padding: 24, paddingBottom: 48 },

  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 1.2, marginBottom: 10, marginLeft: 2 },

  row: { flexDirection: 'row', gap: 16, marginBottom: 16 },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  cardHalf: { flex: 1, marginBottom: 0 },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  cardIconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
  cardSubtitle: { fontSize: 11, color: '#94a3b8', lineHeight: 16 },

  divider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: 16 },

  fieldLabel: { fontSize: 11, fontWeight: '600', color: '#475569', marginBottom: 6, letterSpacing: 0.3 },

  inputWrapper: { position: 'relative', marginBottom: 14 },
  inputIcon: { position: 'absolute', left: 11, top: 11, zIndex: 1 },
  eyeBtn: { position: 'absolute', right: 10, top: 10, padding: 2 },

  fieldInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    fontSize: 13, color: '#0f172a', backgroundColor: '#f8fafc',
  },
  disabledInput: { backgroundColor: '#f1f5f9', color: '#94a3b8' },

  hintBox: {
    flexDirection: 'row', gap: 7, backgroundColor: '#f0fdf4',
    borderRadius: 8, padding: 10, marginBottom: 16,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  hintText: { fontSize: 11, color: '#15803d', lineHeight: 16, flex: 1 },

  paymentBtnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#6366f1', marginTop: 4 },
  btnGreen: { backgroundColor: '#16a34a' },
  btnOutline: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.3 },
  btnOutlineText: { color: '#64748b', fontWeight: '600', fontSize: 13 },

  // ── QR Section ──
  qrWrapper: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
  },
  qrBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
    alignSelf: 'stretch', justifyContent: 'center',
  },
  qrBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#dcfce7', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  qrBadgeText: { fontSize: 10, fontWeight: '700', color: '#15803d', letterSpacing: 0.5 },
  qrLabel: { fontSize: 13, fontWeight: '600', color: '#0f172a' },

  qrImageWrap: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 14,
  },
  qrImage: { width: 160, height: 160 },

  qrUpiRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
    alignSelf: 'stretch',
  },
  qrUpiText: { fontSize: 12, color: '#475569', fontWeight: '600', flex: 1 },

  qrNote: {
    fontSize: 11, color: '#94a3b8', textAlign: 'center',
    lineHeight: 16, marginBottom: 16, paddingHorizontal: 8,
  },

  qrActions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  qrEditBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#ede9fe', borderWidth: 1, borderColor: '#c4b5fd',
  },
  qrEditText: { fontSize: 12, fontWeight: '700', color: '#6366f1' },
  qrRemoveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
  },
  qrRemoveText: { fontSize: 12, fontWeight: '700', color: '#ef4444' },

  // ── Sound ──
  soundGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  soundGridWide: {},

  soundTile: {
    flex: 1, minWidth: 120, alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 8,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc', gap: 8, position: 'relative',
  },
  soundTileSelected: { backgroundColor: '#fffbeb', borderColor: '#fbbf24' },
  soundIconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  soundIconWrapSelected: { backgroundColor: '#fef3c7' },
  soundName: { fontSize: 12, fontWeight: '500', color: '#64748b', textAlign: 'center' },
  soundNameSelected: { color: '#b45309', fontWeight: '700' },
  soundCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#f59e0b', justifyContent: 'center', alignItems: 'center',
  },
});
