import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, SectionList, StyleSheet, Modal, Animated } from 'react-native';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, where, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Loader
// ─────────────────────────────────────────────────────────────────────────────
const SkeletonRow = ({ alt }) => {
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

  const Box = ({ flex }) => (
    <Animated.View style={{
      height: 12, borderRadius: 4, backgroundColor: '#e2e8f0',
      opacity, flex,
    }} />
  );

  return (
    <View style={[{
      flexDirection: 'row', paddingVertical: 18, paddingHorizontal: 16,
      borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
      alignItems: 'center', gap: 12,
    }, alt && { backgroundColor: '#fafafa' }]}>
      <Box flex={0.6} />
      <Box flex={2} />
      <Box flex={1.4} />
      <Box flex={1} />
      <Box flex={1.2} />
      <Box flex={1.2} />
    </View>
  );
};

const SkeletonLoader = () => (
  <View>
    {Array.from({ length: 8 }).map((_, i) => (
      <SkeletonRow key={i} alt={i % 2 !== 0} />
    ))}
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function MenuScreen({ clientId }) {
  const [categories, setCategories]     = useState([]);
  const [menuItems, setMenuItems]       = useState([]);
  const [search, setSearch]             = useState('');
  const [loading, setLoading]           = useState(true);

  // Add Category modal
  const [catModalVisible, setCatModalVisible]   = useState(false);
  const [newCategoryName, setNewCategoryName]   = useState('');

  // Add Menu Item modal
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [newItemName, setNewItemName]           = useState('');
  const [newItemPrice, setNewItemPrice]         = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isVeg, setIsVeg]                       = useState(true);

  // Edit Item modal
  const [editItemModalVisible, setEditItemModalVisible] = useState(false);
  const [editingItem, setEditingItem]                   = useState(null);
  const [editItemName, setEditItemName]                 = useState('');
  const [editItemPrice, setEditItemPrice]               = useState('');
  const [editItemCategory, setEditItemCategory]         = useState('');
  const [editItemIsVeg, setEditItemIsVeg]               = useState(true);

  // Edit Category modal
  const [editCatModalVisible, setEditCatModalVisible] = useState(false);
  const [editingCat, setEditingCat]                   = useState(null);
  const [editCatName, setEditCatName]                 = useState('');

  // ── Firebase ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clientId) return;
    let catsLoaded = false, itemsLoaded = false;

    const catUnsub = onSnapshot(query(collection(db, 'categories'), where('clientId', '==', clientId)), (snap) => {
      const cats = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setCategories(cats);
      if (cats.length > 0 && !selectedCategory) setSelectedCategory(cats[0].id);
      catsLoaded = true;
      if (itemsLoaded) setLoading(false);
    });

    const menuUnsub = onSnapshot(query(collection(db, 'menuItems'), where('clientId', '==', clientId)), (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      itemsLoaded = true;
      if (catsLoaded) setLoading(false);
    });

    return () => { catUnsub(); menuUnsub(); };
  }, [clientId]);

  // ── Add Category ──────────────────────────────────────────────────────────
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    await addDoc(collection(db, 'categories'), { name: newCategoryName.trim(), clientId });
    setNewCategoryName('');
    setCatModalVisible(false);
  };

  // ── Add Menu Item ─────────────────────────────────────────────────────────
  const handleAddItem = async () => {
    if (!newItemName || !newItemPrice || !selectedCategory) return;
    await addDoc(collection(db, 'menuItems'), {
      name: newItemName,
      price: parseFloat(newItemPrice),
      categoryId: selectedCategory,
      isVeg: isVeg,
      clientId,
    });
    setItemModalVisible(false);
    setNewItemName('');
    setNewItemPrice('');
    setIsVeg(true);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (col, id) => {
    try {
      await deleteDoc(doc(db, col, id));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  // ── Edit Item ─────────────────────────────────────────────────────────────
  const handleEditItem = (item) => {
    setEditingItem(item);
    setEditItemName(item.name);
    setEditItemPrice(String(item.price));
    setEditItemCategory(item.categoryId);
    setEditItemIsVeg(item.isVeg !== false);
    setEditItemModalVisible(true);
  };

  const handleSaveItem = async () => {
    if (!editItemName.trim() || !editItemPrice || !editingItem) return;
    await updateDoc(doc(db, 'menuItems', editingItem.id), {
      name: editItemName.trim(),
      price: parseFloat(editItemPrice),
      categoryId: editItemCategory,
      isVeg: editItemIsVeg,
    });
    setEditItemModalVisible(false);
    setEditingItem(null);
  };

  // ── Edit Category ─────────────────────────────────────────────────────────
  const handleEditCategory = (cat) => {
    setEditingCat(cat);
    setEditCatName(cat.name);
    setEditCatModalVisible(true);
  };

  const handleSaveCategory = async () => {
    if (!editCatName.trim() || !editingCat) return;
    await updateDoc(doc(db, 'categories', editingCat.id), {
      name: editCatName.trim(),
    });
    setEditCatModalVisible(false);
    setEditingCat(null);
  };

  const openItemModal = () => {
    if (categories.length === 0) return;
    setItemModalVisible(true);
  };

  // ── Build category-based sections (sorted A→Z by category name) ──────────
  const buildSections = () => {
    const filtered = menuItems.filter(item =>
      item.name?.toLowerCase().includes(search.toLowerCase())
    );

    const grouped = {};
    filtered.forEach(item => {
      const catName = categories.find(c => c.id === item.categoryId)?.name || 'Unknown';
      if (!grouped[catName]) grouped[catName] = [];
      grouped[catName].push(item);
    });

    return Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b))
      .map(catName => ({ title: catName, data: grouped[catName] }));
  };

  const sections = buildSections();

  const buildSerialMap = () => {
    const map = {};
    let counter = 1;
    sections.forEach(sec => {
      sec.data.forEach(item => {
        map[item.id] = counter++;
      });
    });
    return map;
  };
  const serialMap = buildSerialMap();

  return (
    <View style={styles.screen}>

      {/* ── Page Header ── */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Menu Management</Text>
        <Text style={styles.pageSub}>{categories.length} categories · {menuItems.length} items</Text>
      </View>

      {/* ── Toolbar: Search + Buttons ── */}
      <View style={styles.actionBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={15} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginLeft: 'auto' }}>
          <TouchableOpacity style={styles.actionBtn} onPress={openItemModal}>
            <Ionicons name="add" size={15} color="white" />
            <Text style={styles.actionBtnText}>MENU ITEM</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setCatModalVisible(true)}>
            <Ionicons name="add" size={15} color="white" />
            <Text style={styles.actionBtnText}>CATEGORY</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Table ── */}
      <View style={styles.tableWrapper}>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 0.6 }]}>Sr. No.</Text>
          <Text style={[styles.th, { flex: 2 }]}>Item Name</Text>
          <Text style={[styles.th, { flex: 1.4 }]}>Menu</Text>
          <Text style={[styles.th, { flex: 1 }]}>Price</Text>
          <Text style={[styles.th, { flex: 1.2 }]}>Veg / NonVeg</Text>
          <Text style={[styles.th, { flex: 1.2 }]}>Actions</Text>
        </View>

        {/* Skeleton or Sections */}
        {loading ? (
          <SkeletonLoader />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            stickySectionHeadersEnabled={true}

            // ── Category Divider Header ──
            renderSectionHeader={({ section }) => {
              const cat = categories.find(c => c.name === section.title);
              return (
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionCategoryBadge}>
                    <Text style={styles.sectionCategoryText}>{section.title}</Text>
                  </View>
                  <View style={styles.sectionDividerLine} />
                  <Text style={styles.sectionCount}>
                    {section.data.length} item{section.data.length !== 1 ? 's' : ''}
                  </Text>
                  {cat && (
                    <TouchableOpacity style={styles.catEditBtn} onPress={() => handleEditCategory(cat)}>
                      <Ionicons name="pencil" size={12} color="#475569" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}

            // ── Row ──
            renderItem={({ item, index }) => {
              const catName = categories.find(c => c.id === item.categoryId)?.name || 'Unknown';
              const veg = item.isVeg !== false;
              const srNo = serialMap[item.id];
              return (
                <View style={[styles.tableRow, index % 2 !== 0 && styles.tableRowAlt]}>
                  <Text style={[styles.td, styles.tdBold, { flex: 0.6 }]}>{srNo}</Text>
                  <Text style={[styles.td, styles.tdBold, { flex: 2 }]}>{item.name}</Text>
                  <Text style={[styles.td, styles.tdBold, { flex: 1.4 }]}>{catName}</Text>
                  <Text style={[styles.td, styles.tdBold, { flex: 1 }]}>₹ {item.price}</Text>
                  <View style={[styles.tdCell, { flex: 1.2, justifyContent: 'center' }]}>
                    <View style={[styles.vegDot, { backgroundColor: veg ? '#16a34a' : '#dc2626' }]} />
                  </View>
                  <View style={[styles.tdCell, { flex: 1.2, gap: 8, justifyContent: 'center' }]}>
                    <TouchableOpacity style={styles.editBtn} onPress={() => handleEditItem(item)}>
                      <Ionicons name="pencil" size={13} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDelete('menuItems', item.id)}
                    >
                      <Ionicons name="trash" size={13} color="white" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}

            ListEmptyComponent={
              <View style={styles.emptyRow}>
                <Ionicons name="restaurant-outline" size={28} color="#cbd5e1" />
                <Text style={styles.emptyText}>No menu items yet. Click + MENU ITEM to add one.</Text>
              </View>
            }
          />
        )}
      </View>

      {/* ── Add Category Modal ── */}
      <Modal visible={catModalVisible} transparent animationType="fade" onRequestClose={() => setCatModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Add Category</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setCatModalVisible(false); setNewCategoryName(''); }}>
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
            <Text style={styles.fieldLabel}>Category Name</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Category Name"
              placeholderTextColor="#b0b8c9"
              value={newCategoryName}
              onChangeText={setNewCategoryName}
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setCatModalVisible(false); setNewCategoryName(''); }}>
                <Text style={styles.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addBtn, !newCategoryName.trim() && styles.addBtnDisabled]}
                onPress={handleAddCategory}
                disabled={!newCategoryName.trim()}
              >
                <Text style={styles.addBtnText}>ADD</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add Menu Item Modal ── */}
      <Modal visible={itemModalVisible} transparent animationType="fade" onRequestClose={() => setItemModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { maxWidth: 500 }]}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Add Menu Item</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setItemModalVisible(false); setNewItemName(''); setNewItemPrice(''); setIsVeg(true); }}>
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />

            <Text style={styles.fieldLabel}>Menu Name</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={selectedCategory}
                onValueChange={(v) => setSelectedCategory(v)}
                style={styles.picker}
              >
                <Picker.Item label="Select Menu" value="" color="#b0b8c9" />
                {categories.map(cat => (
                  <Picker.Item key={cat.id} label={cat.name} value={cat.id} />
                ))}
              </Picker>
            </View>

            <View style={styles.radioRow}>
              <TouchableOpacity style={styles.radioOption} onPress={() => setIsVeg(true)}>
                <View style={[styles.radioOuter, isVeg && styles.radioOuterActive]}>
                  {isVeg && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.radioLabel}>Vegetarian</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.radioOption} onPress={() => setIsVeg(false)}>
                <View style={[styles.radioOuter, !isVeg && styles.radioOuterActive]}>
                  {!isVeg && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.radioLabel}>Non Vegetarian</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Item Name</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Item Name"
              placeholderTextColor="#b0b8c9"
              value={newItemName}
              onChangeText={setNewItemName}
            />

            <Text style={styles.fieldLabel}>Item Price</Text>
            <TextInput
              style={[styles.fieldInput, { width: '50%' }]}
              placeholder="Item Price"
              placeholderTextColor="#b0b8c9"
              keyboardType="numeric"
              value={newItemPrice}
              onChangeText={setNewItemPrice}
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setItemModalVisible(false); setNewItemName(''); setNewItemPrice(''); setIsVeg(true); }}>
                <Text style={styles.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtnDark} onPress={handleAddItem}>
                <Text style={styles.addBtnDarkText}>ADD</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit Menu Item Modal ── */}
      <Modal visible={editItemModalVisible} transparent animationType="fade" onRequestClose={() => setEditItemModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { maxWidth: 500 }]}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Edit Menu Item</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setEditItemModalVisible(false); setEditingItem(null); }}>
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={editItemCategory}
                onValueChange={(v) => setEditItemCategory(v)}
                style={styles.picker}
              >
                {categories.map(cat => (
                  <Picker.Item key={cat.id} label={cat.name} value={cat.id} />
                ))}
              </Picker>
            </View>

            <View style={styles.radioRow}>
              <TouchableOpacity style={styles.radioOption} onPress={() => setEditItemIsVeg(true)}>
                <View style={[styles.radioOuter, editItemIsVeg && styles.radioOuterActive]}>
                  {editItemIsVeg && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.radioLabel}>Vegetarian</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.radioOption} onPress={() => setEditItemIsVeg(false)}>
                <View style={[styles.radioOuter, !editItemIsVeg && styles.radioOuterActive]}>
                  {!editItemIsVeg && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.radioLabel}>Non Vegetarian</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Item Name</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Item Name"
              placeholderTextColor="#b0b8c9"
              value={editItemName}
              onChangeText={setEditItemName}
            />

            <Text style={styles.fieldLabel}>Item Price</Text>
            <TextInput
              style={[styles.fieldInput, { width: '50%' }]}
              placeholder="Item Price"
              placeholderTextColor="#b0b8c9"
              keyboardType="numeric"
              value={editItemPrice}
              onChangeText={setEditItemPrice}
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditItemModalVisible(false); setEditingItem(null); }}>
                <Text style={styles.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addBtnDark, (!editItemName.trim() || !editItemPrice) && styles.addBtnDisabled]}
                onPress={handleSaveItem}
                disabled={!editItemName.trim() || !editItemPrice}
              >
                <Text style={styles.addBtnDarkText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit Category Modal ── */}
      <Modal visible={editCatModalVisible} transparent animationType="fade" onRequestClose={() => setEditCatModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalTop}>
              <Text style={styles.modalTitle}>Edit Category</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setEditCatModalVisible(false); setEditingCat(null); }}>
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
            <Text style={styles.fieldLabel}>Category Name</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Category Name"
              placeholderTextColor="#b0b8c9"
              value={editCatName}
              onChangeText={setEditCatName}
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditCatModalVisible(false); setEditingCat(null); }}>
                <Text style={styles.cancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addBtn, !editCatName.trim() && styles.addBtnDisabled]}
                onPress={handleSaveCategory}
                disabled={!editCatName.trim()}
              >
                <Text style={styles.addBtnText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9', padding: 24 },

  // Header
  pageHeader: { marginBottom: 20 },
  pageTitle:  { fontSize: 22, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  pageSub:    { fontSize: 13, color: '#94a3b8', marginTop: 3, fontWeight: '500' },

  // Action Bar
  actionBar:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  searchBox:     { width: 220, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  searchInput:   { flex: 1, fontSize: 14, color: '#0f172a', outlineStyle: 'none' },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#111827', paddingVertical: 11, paddingHorizontal: 18, borderRadius: 8 },
  actionBtnText: { color: 'white', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },

  // Table
  tableWrapper: { flex: 1, backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tableHeader:  { flexDirection: 'row', backgroundColor: '#111827', paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  th:           { fontSize: 12, fontWeight: '700', color: 'white', textAlign: 'center', letterSpacing: 0.3 },

  tableRow:    { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'center' },
  tableRowAlt: { backgroundColor: '#fafafa' },
  td:          { fontSize: 14, color: '#374151', textAlign: 'center' },
  tdBold:      { fontWeight: '700', color: '#111827' },
  tdCell:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },

  // ── Category Section Header ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  sectionCategoryBadge: {
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 6,
  },
  sectionCategoryText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'white',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#cbd5e1',
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: 0.3,
  },
  catEditBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Veg dot
  vegDot: { width: 22, height: 22, borderRadius: 11 },

  // Row action buttons
  editBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#38bdf8', justifyContent: 'center', alignItems: 'center' },
  deleteBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },

  emptyRow:  { paddingVertical: 50, alignItems: 'center', gap: 10 },
  emptyText: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },

  // Modal shared
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard:  { backgroundColor: 'white', borderRadius: 12, padding: 28, width: '100%', maxWidth: 400, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  modalTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  closeBtn:   { width: 30, height: 30, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { fontSize: 18, color: '#374151', lineHeight: 20 },
  divider:    { height: 1, backgroundColor: '#e2e8f0', marginBottom: 20 },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 8, letterSpacing: 0.3 },
  fieldInput: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 14, color: '#0f172a', backgroundColor: '#f8fafc',
    marginBottom: 16, outlineStyle: 'none',
  },

  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, backgroundColor: '#f8fafc', overflow: 'hidden', marginBottom: 16 },
  picker:     { height: 48, width: '100%' },

  radioRow:    { flexDirection: 'row', gap: 24, marginBottom: 16 },
  radioOption: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radioOuter:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#cbd5e1', justifyContent: 'center', alignItems: 'center' },
  radioOuterActive: { borderColor: '#374151' },
  radioInner:       { width: 10, height: 10, borderRadius: 5, backgroundColor: '#374151' },
  radioLabel:       { fontSize: 14, color: '#374151', fontWeight: '500' },

  modalFooter:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn:     { backgroundColor: '#9f1239', paddingVertical: 11, paddingHorizontal: 22, borderRadius: 8, justifyContent: 'center' },
  cancelBtnText: { color: 'white', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  addBtn:        { backgroundColor: '#111827', paddingVertical: 11, paddingHorizontal: 22, borderRadius: 8, justifyContent: 'center' },
  addBtnDisabled:{ opacity: 0.5 },
  addBtnText:    { color: '#e2e8f0', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  addBtnDark:    { backgroundColor: '#111827', paddingVertical: 11, paddingHorizontal: 22, borderRadius: 8, justifyContent: 'center' },
  addBtnDarkText:{ color: 'white', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
});
