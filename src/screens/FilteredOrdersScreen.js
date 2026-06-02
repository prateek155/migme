import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Platform,
  TouchableOpacity, TextInput, ScrollView, Modal, Dimensions
} from 'react-native';
import { collection, onSnapshot, query, where, updateDoc, doc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebaseConfig';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_OPTIONS    = ['Active', 'Confirmed', 'Cancelled'];
const PAGE_SIZE_OPTIONS = [20, 50, 100];

// ─────────────────────────────────────────────────────────────────────────────
// Expandable Order Row
// ─────────────────────────────────────────────────────────────────────────────
const ExpandableOrderRow = ({ item, onUpdateStatus, onAssign }) => {
  const [expanded, setExpanded]               = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownPos, setDropdownPos]         = useState({ x: 0, y: 0 });
  const editBtnRef   = React.useRef(null);
  const assignBtnRef = React.useRef(null);

  const isCancelled = item.status === 'Cancelled';
  const isCompleted = item.status === 'Completed';

  const badgeBg     = isCancelled ? '#fef2f2' : isCompleted ? '#f0fdf4' : '#fffbeb';
  const badgeTxt    = isCancelled ? '#dc2626' : isCompleted ? '#16a34a' : '#b45309';
  const badgeBorder = isCancelled ? '#fecaca' : isCompleted ? '#bbf7d0' : '#fde68a';

  const codTypes     = ['COD', 'CASH', 'CASH_ON_DELIVERY'];
  const isCOD        = codTypes.includes((item.paymentType || '').toUpperCase().replace(/\s+/g, '_'));
  const paymentColor = isCOD ? '#b45309' : '#0f766e';
  const paymentLabel = isCOD ? 'COD' : 'ONLINE';
  const amountToCollect = isCOD ? (item.totalAmount || 0) : 0;

  const isAssigned    = !!item.assignedExecutiveName;
  const hasBillPrinted = !!item.billPrintedAt;

  const handleStatusSelect = (newStatus) => {
    setDropdownVisible(false);
    onUpdateStatus(item, newStatus);
  };

  const openDropdown = (e) => {
    e.stopPropagation();
    editBtnRef.current?.measure((fx, fy, width, height, px, py) => {
      const DROPDOWN_HEIGHT = 160;
      const screenHeight    = Dimensions.get('window').height;
      const fitsBelow       = screenHeight - (py + height) >= DROPDOWN_HEIGHT;
      setDropdownPos({
        x: px - 148 + width,
        y: fitsBelow ? py + height + 4 : py - DROPDOWN_HEIGHT - 4,
      });
      setDropdownVisible(true);
    });
  };

  const handleAssignPress = (e) => {
    e.stopPropagation();
    assignBtnRef.current?.measure((fx, fy, width, height, px, py) => {
      onAssign(item, { x: px, y: py, width, height });
    });
  };

  return (
    <View style={styles.cardContainer}>
      {/* ── Summary row ── */}
      <TouchableOpacity
        style={[styles.tableRow, expanded && styles.tableRowExpanded]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.85}
      >
        {/* Expand chevron */}
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: '#94a3b8',
          alignItems: 'center', justifyContent: 'center', marginRight: 8,
        }}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#ffffff" />
        </View>

        {/* Status + bill-printed badge */}
        <View style={{ flex: 0.8 }}>
          <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: badgeTxt, letterSpacing: 0.5 }}>
              {item.status || 'ACTIVE'}
            </Text>
          </View>
          {hasBillPrinted && (
            <View style={styles.billPrintedBadge}>
              <Ionicons name="print-outline" size={8} color="#ffffff" />
              <Text style={styles.billPrintedText}>PRINTED</Text>
            </View>
          )}
        </View>

        <Text style={[styles.cell, { flex: 1.1, fontWeight: '700', color: '#0f172a' }]}>{item.orderNo}</Text>
        <Text style={[styles.cell, { flex: 1.0, fontSize: 12 }]}>
          {item.deliveryDate ? new Date(item.deliveryDate).toLocaleDateString('en-GB') : '—'}
        </Text>
        <Text style={[styles.cell, { flex: 0.8, fontSize: 12, fontWeight: '500' }]}>{item.deliveryTime || '—'}</Text>
        <Text style={[styles.cell, { flex: 1.2 }]} numberOfLines={1}>{item.vendorName}</Text>
        <Text style={[styles.cell, { flex: 1.2 }]} numberOfLines={2}>
          {item.trainInfo || 'N/A'}{' '}
          <Text style={{ color: '#dc2626', fontWeight: '700' }}>
            ({item.coach || 'No Coach'}{item.seat ? ` / ${item.seat}` : ''})
          </Text>
        </Text>

        <View style={{ flex: 0.9 }}>
          <Text style={[styles.paymentTag, { color: paymentColor, borderColor: paymentColor }]}>
            {paymentLabel}
          </Text>
        </View>

        {/* Delivery exec column */}
        <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text
            style={[styles.cell, {
              fontSize: 11, fontWeight: '700', flex: 1,
              color: isAssigned ? '#16a34a' : '#94a3b8',
            }]}
            numberOfLines={1}
          >
            {item.assignedExecutiveName || 'Not Assigned'}
          </Text>

          <View style={{ position: 'relative' }}>
            <TouchableOpacity ref={assignBtnRef} style={styles.assignBtn} onPress={handleAssignPress}>
              <Ionicons name="bicycle-outline" size={15} color="#ffffff" />
            </TouchableOpacity>
            {isAssigned && (
              <View style={styles.tickBadge}>
                <Ionicons name="checkmark" size={8} color="#fff" />
              </View>
            )}
          </View>

          <TouchableOpacity ref={editBtnRef} style={styles.editBtn} onPress={openDropdown}>
            <Ionicons name="create-outline" size={15} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* ── Status dropdown modal ── */}
      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDropdownVisible(false)}>
          <View
            style={[styles.dropdownMenu, { position: 'absolute', top: dropdownPos.y, left: dropdownPos.x }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.dropdownTitle}>Change Status</Text>
            {STATUS_OPTIONS.map((status) => (
              <TouchableOpacity
                key={status}
                style={[styles.dropdownItem, item.status === status && styles.dropdownItemActive]}
                onPress={() => handleStatusSelect(status)}
              >
                <View style={[styles.dropdownDot, {
                  backgroundColor:
                    status === 'Active'    ? '#f59e0b' :
                    status === 'Confirmed' ? '#3b82f6' : '#dc2626',
                }]} />
                <Text style={[styles.dropdownItemText, item.status === status && styles.dropdownItemTextActive]}>
                  {status}
                </Text>
                {item.status === status && (
                  <Ionicons name="checkmark" size={14} color="#0f172a" style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <View style={styles.expandedContent}>
          <View style={styles.expandedLayout}>

            {/* LEFT — Items */}
            <View style={styles.expandSectionLeft}>
              <View style={styles.miniTableHeader}>
                <Text style={[styles.miniHeadText, { flex: 1 }]}>ITEM NAME</Text>
                <Text style={[styles.miniHeadText, { width: 56, textAlign: 'center' }]}>QTY</Text>
              </View>
              {item.items?.map((prod, idx) => (
                <View key={idx} style={styles.miniTableRow}>
                  <Text style={[styles.miniCellText, { flex: 1 }]}>{prod.name}</Text>
                  <Text style={[styles.miniCellText, { width: 56, textAlign: 'center', fontWeight: '700', color: '#0f172a' }]}>
                    {prod.quantity}
                  </Text>
                </View>
              ))}
            </View>

            {/* MID — Customer */}
            <View style={styles.expandSectionMid}>
              <Text style={styles.sectionLabel}>CUSTOMER DETAILS</Text>
              <Text style={styles.remarkText}>{item.customerName}</Text>
              <Text style={[styles.remarkText, { color: '#64748b' }]}>Mo: {item.contactNo}</Text>

              {hasBillPrinted && (
                <View style={styles.billPrintInfoBox}>
                  <Ionicons name="print-outline" size={13} color="#3b82f6" />
                  <View>
                    <Text style={styles.billPrintInfoLabel}>BILL PRINTED</Text>
                    <Text style={styles.billPrintInfoTime}>
                      {new Date(
                        item.billPrintedAt?.toDate
                          ? item.billPrintedAt.toDate()
                          : item.billPrintedAt
                      ).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </Text>
                  </View>
                </View>
              )}

              {item.remark && item.remark.trim() !== '' && (
                <View style={styles.remarkBox}>
                  <Text style={styles.remarkAlertText}>⚠ SPECIAL INSTRUCTIONS</Text>
                  <Text style={styles.remarkContentText}>{item.remark}</Text>
                </View>
              )}

              {item.assignedExecutiveName && (
                <View style={styles.assignedBadgeBox}>
                  <Text style={styles.assignedBadgeLabel}>Delivered By:</Text>
                  <Text style={styles.assignedBadgeName}>{item.assignedExecutiveName}</Text>
                </View>
              )}
            </View>

            {/* RIGHT — Billing */}
            <View style={styles.expandSectionRight}>
              <Text style={styles.sectionLabel}>BILLING SUMMARY</Text>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Sub Total</Text>
                <Text style={styles.financeValue}>₹ {item.subTotal || 0}</Text>
              </View>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Tax / GST</Text>
                <Text style={styles.financeValue}>₹ {item.tax || 0}</Text>
              </View>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Delivery</Text>
                <Text style={styles.financeValue}>₹ {item.deliveryCharge || 0}</Text>
              </View>
              <View style={styles.financeDivider} />
              <View style={styles.financeRow}>
                <Text style={[styles.financeLabel, { fontWeight: '700', color: '#0f172a' }]}>TOTAL BILL</Text>
                <Text style={[styles.financeValue, { fontSize: 15, fontWeight: '800', color: '#0f172a' }]}>
                  ₹ {item.totalAmount || 0}
                </Text>
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

// ─────────────────────────────────────────────────────────────────────────────
// Pagination Bar
// ─────────────────────────────────────────────────────────────────────────────
const PaginationBar = ({ currentPage, totalItems, itemsPerPage, onPageChange, onItemsPerPageChange }) => {
  const [pageSizeDropdownVisible, setPageSizeDropdownVisible] = useState(false);
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startItem  = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem    = Math.min(currentPage * itemsPerPage, totalItems);

  const NavBtn = ({ onPress, disabled, iconName }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.pageNavBtn, disabled && styles.pageNavBtnDisabled]}
    >
      <Ionicons name={iconName} size={14} color={disabled ? '#cbd5e1' : '#0f172a'} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.paginationBar}>
      <View style={styles.pageSizeWrapper}>
        <Text style={styles.pageSizeLabel}>Items per page:</Text>
        <TouchableOpacity
          style={styles.pageSizeSelector}
          onPress={() => setPageSizeDropdownVisible(v => !v)}
        >
          <Text style={styles.pageSizeSelectorText}>{itemsPerPage}</Text>
          <Ionicons name="chevron-down" size={12} color="#64748b" />
        </TouchableOpacity>

        {pageSizeDropdownVisible && (
          <View style={styles.pageSizeDropdown}>
            {PAGE_SIZE_OPTIONS.map(size => (
              <TouchableOpacity
                key={size}
                style={[styles.pageSizeOption, size === itemsPerPage && styles.pageSizeOptionActive]}
                onPress={() => {
                  onItemsPerPageChange(size);
                  setPageSizeDropdownVisible(false);
                }}
              >
                <Text style={[styles.pageSizeOptionText, size === itemsPerPage && styles.pageSizeOptionTextActive]}>
                  {size}
                </Text>
                {size === itemsPerPage && <Ionicons name="checkmark" size={12} color="#0f172a" />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <Text style={styles.pageRangeText}>{startItem}–{endItem} of {totalItems}</Text>

      <View style={styles.pageNavRow}>
        <NavBtn iconName="play-skip-back"    onPress={() => onPageChange(1)}               disabled={currentPage === 1} />
        <NavBtn iconName="chevron-back"      onPress={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} />
        <NavBtn iconName="chevron-forward"   onPress={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} />
        <NavBtn iconName="play-skip-forward" onPress={() => onPageChange(totalPages)}      disabled={currentPage === totalPages} />
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function FilteredOrdersScreen({ statusFilter, title, clientId }) {
  const [orders, setOrders]                 = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [executives, setExecutives]         = useState([]);
  const [loading, setLoading]               = useState(true);
  const [searchQuery, setSearchQuery]       = useState('');

  // Pagination state
  const [currentPage, setCurrentPage]   = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Assign modal
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder]           = useState(null);
  const [assignDropdownPos, setAssignDropdownPos]   = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Derived pagination values
  const totalItems  = filteredOrders.length;
  const totalPages  = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIdx    = (currentPage - 1) * itemsPerPage;
  const pagedOrders = filteredOrders.slice(startIdx, startIdx + itemsPerPage);

  // ── Fetch executives ──
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'executives'), where('clientId', '==', clientId)),
      (snapshot) => setExecutives(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
      (error) => console.error('Execs sync error:', error.message)
    );
    return () => unsubscribe();
  }, [clientId]);

  // ── Fetch orders ──
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('clientId', '==', clientId),
      where('status', '==', statusFilter)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // Sort: bill-printed first (desc by printedAt), then by createdAt desc
      list.sort((a, b) => {
        const toMs = (val) => {
          if (!val) return 0;
          if (val?.toDate) return val.toDate().getTime();
          const d = new Date(val).getTime();
          return isNaN(d) ? 0 : d;
        };
        const aPrinted = !!a.billPrintedAt;
        const bPrinted = !!b.billPrintedAt;
        if (aPrinted && !bPrinted) return -1;
        if (!aPrinted && bPrinted) return 1;
        if (aPrinted && bPrinted) return toMs(b.billPrintedAt) - toMs(a.billPrintedAt);
        return toMs(b.createdAt) - toMs(a.createdAt);
      });

      setOrders(list);
      setLoading(false);
    }, (error) => {
      console.error('Orders sync error:', error.message);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [statusFilter, clientId]);

  // ── Effect 1: Filter orders whenever orders list or search query changes ──
  // ✅ Does NOT reset the page — so staying on page 2/3 is preserved
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredOrders(orders);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredOrders(orders.filter(o =>
        (o.orderNo || '').toString().toLowerCase().includes(q) ||
        (o.vendorName || '').toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.trainInfo || '').toLowerCase().includes(q) ||
        (o.assignedExecutiveName || '').toLowerCase().includes(q)
      ));
    }
  }, [searchQuery, orders]);

  // ── Effect 2: Reset to page 1 ONLY when the search query changes ──
  // ✅ Firestore updates do NOT trigger this — page stays stable
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleUpdateStatus = async (order, newStatus) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), { status: newStatus });
    } catch (err) {
      console.error('Status update failed', err);
    }
  };

  const openAssignModal = (order, pos) => {
    setSelectedOrder(order);
    setAssignDropdownPos(pos);
    setAssignModalVisible(true);
  };

  const handleAssignExec = async (exec) => {
    if (!selectedOrder) return;
    try {
      await updateDoc(doc(db, 'orders', selectedOrder.id), {
        assignedExecutiveId: exec.id,
        assignedExecutiveName: exec.name,
      });
    } catch (err) {
      console.error('Assign executive failed', err);
    }
    setAssignModalVisible(false);
  };

  const handleRemoveExec = async () => {
    if (!selectedOrder) return;
    try {
      await updateDoc(doc(db, 'orders', selectedOrder.id), {
        assignedExecutiveId: null,
        assignedExecutiveName: null,
      });
    } catch (err) {
      console.error('Remove executive failed', err);
    }
    setAssignModalVisible(false);
  };

  const handleItemsPerPageChange = (size) => {
    setItemsPerPage(size);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(Math.min(Math.max(1, page), totalPages));
  };

  return (
    <View style={styles.container}>

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.heading}>{title}</Text>
          <View style={styles.countRow}>
            <View style={[styles.countDot, {
              backgroundColor:
                statusFilter === 'Completed' ? '#16a34a' :
                statusFilter === 'Cancelled' ? '#dc2626' : '#f59e0b',
            }]} />
            <Text style={styles.subHeading}>
              {loading ? '…' : `${filteredOrders.length} ${filteredOrders.length === 1 ? 'order' : 'orders'} found`}
            </Text>
          </View>
        </View>

        {!loading && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by order, vendor, train…"
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>

      {/* ── Table container ── */}
      <View style={styles.tableContainer}>
        {/* Header */}
        <View style={styles.tableHeader}>
          <View style={{ width: 36 }} />
          <Text style={[styles.col, { flex: 0.8 }]}>STATUS</Text>
          <Text style={[styles.col, { flex: 1.1 }]}>ORDER NO.</Text>
          <Text style={[styles.col, { flex: 1.0 }]}>DATE</Text>
          <Text style={[styles.col, { flex: 0.8 }]}>TIME</Text>
          <Text style={[styles.col, { flex: 1.2 }]}>VENDOR</Text>
          <Text style={[styles.col, { flex: 1.2 }]}>TRAIN</Text>
          <Text style={[styles.col, { flex: 0.9 }]}>PAYMENT</Text>
          <Text style={[styles.col, { flex: 1.2 }]}>DELIVERY EXEC</Text>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: '#94a3b8', fontSize: 14 }}>Loading…</Text>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={36} color="#cbd5e1" />
            <Text style={styles.emptyStateText}>
              {searchQuery ? 'No orders match your search' : `No ${statusFilter.toLowerCase()} orders`}
            </Text>
          </View>
        ) : (
          <>
            {/* ── Rows ── */}
            <FlatList
              data={pagedOrders}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <ExpandableOrderRow
                  item={item}
                  onUpdateStatus={handleUpdateStatus}
                  onAssign={openAssignModal}
                />
              )}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 0, flexGrow: 1 }}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            />

            {/* ── Pagination bar ── */}
            <PaginationBar
              currentPage={currentPage}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          </>
        )}
      </View>

      {/* ── Assign Executive Modal ── */}
      <Modal
        visible={assignModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.dropdownBackdrop}
          activeOpacity={1}
          onPress={() => setAssignModalVisible(false)}
        >
          <View
            style={[
              styles.assignDropdownContainer,
              (() => {
                const DROPDOWN_HEIGHT = 320;
                const screenHeight    = Dimensions.get('window').height;
                const fitsBelow       = screenHeight - (assignDropdownPos.y + assignDropdownPos.height) >= DROPDOWN_HEIGHT;
                return {
                  top:  fitsBelow ? assignDropdownPos.y + assignDropdownPos.height + 6 : assignDropdownPos.y - DROPDOWN_HEIGHT - 6,
                  left: assignDropdownPos.x - 170,
                };
              })(),
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.assignDropdownHeader}>
              <Ionicons name="bicycle-outline" size={14} color="#3b82f6" />
              <Text style={styles.assignDropdownTitle}>
                {selectedOrder?.assignedExecutiveName ? 'REASSIGN EXECUTIVE' : 'ASSIGN EXECUTIVE'}
              </Text>
            </View>

            {selectedOrder?.assignedExecutiveName && (
              <View style={styles.currentlyAssignedRow}>
                <View style={styles.currentlyAssignedDot} />
                <Text style={styles.currentlyAssignedText}>
                  Currently: {selectedOrder.assignedExecutiveName}
                </Text>
              </View>
            )}

            <ScrollView
              style={{ maxHeight: 240 }}
              showsVerticalScrollIndicator={false}
            >
              {executives.map(exec => (
                <TouchableOpacity
                  key={exec.id}
                  style={[
                    styles.execDropdownRow,
                    selectedOrder?.assignedExecutiveId === exec.id && styles.execDropdownRowActive,
                  ]}
                  onPress={() => handleAssignExec(exec)}
                >
                  <Ionicons name="person-circle-outline" size={20} color="#475569" />
                  <Text style={[
                    styles.execName,
                    selectedOrder?.assignedExecutiveId === exec.id && styles.execNameActive,
                  ]}>
                    {exec.name}
                  </Text>
                  {selectedOrder?.assignedExecutiveId === exec.id && (
                    <Ionicons name="checkmark-circle" size={16} color="#16a34a" style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              ))}
              {executives.length === 0 && (
                <Text style={styles.noExecsText}>No executives found.</Text>
              )}
            </ScrollView>

            {selectedOrder?.assignedExecutiveName && (
              <TouchableOpacity style={styles.removeExecRow} onPress={handleRemoveExec}>
                <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
                <Text style={styles.removeExecText}>Remove Assignment</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
    height: Platform.OS === 'web' ? '100vh' : '100%',
  },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
    flexWrap: 'wrap', gap: 12,
  },
  heading:    { fontSize: 22, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  countRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  countDot:   { width: 7, height: 7, borderRadius: 4 },
  subHeading: { fontSize: 13, color: '#64748b', fontWeight: '500' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', paddingHorizontal: 14,
    paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    minWidth: 280, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#0f172a', outlineStyle: 'none' },

  tableContainer: {
    flex: 1, backgroundColor: 'white',
    borderRadius: 8, borderWidth: 1,
    borderColor: '#e2e8f0', overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#0f172a',
    paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center',
  },
  col: { fontSize: 10, fontWeight: '700', color: '#ffffff', letterSpacing: 0.8 },

  cardContainer: { borderBottomWidth: 1, borderColor: '#f1f5f9' },
  tableRow: {
    flexDirection: 'row', paddingVertical: 12,
    paddingHorizontal: 12, alignItems: 'center', backgroundColor: 'white',
  },
  tableRowExpanded: { backgroundColor: '#f8fafc' },
  cell: { fontSize: 13, color: '#334155', fontWeight: '700' },

  badge: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 4, borderWidth: 1, alignSelf: 'flex-start',
  },

  billPrintedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    marginTop: 3, backgroundColor: '#3b82f6',
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 3, alignSelf: 'flex-start',
  },
  billPrintedText: { fontSize: 8, fontWeight: '700', color: '#ffffff', letterSpacing: 0.4 },

  billPrintInfoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, marginBottom: 4, padding: 8,
    backgroundColor: '#eff6ff', borderRadius: 6,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  billPrintInfoLabel: { fontSize: 9, fontWeight: '700', color: '#3b82f6', letterSpacing: 0.5 },
  billPrintInfoTime:  { fontSize: 12, fontWeight: '700', color: '#1d4ed8' },

  paymentTag: {
    fontSize: 10, fontWeight: '700', borderWidth: 1,
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
    alignSelf: 'flex-start', letterSpacing: 0.5,
  },

  assignBtn: {
    width: 28, height: 28, borderRadius: 6,
    backgroundColor: '#16a34a', justifyContent: 'center', alignItems: 'center',
  },
  tickBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: '#0f172a', justifyContent: 'center',
    alignItems: 'center', borderWidth: 1.5, borderColor: '#fff',
  },
  editBtn: {
    width: 28, height: 28, borderRadius: 6,
    backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center',
  },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyStateText: { fontSize: 14, color: '#94a3b8' },

  dropdownMenu: {
    width: 180, backgroundColor: 'white',
    borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
    zIndex: 999, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12,
    shadowRadius: 12, elevation: 8, overflow: 'hidden',
  },
  dropdownTitle: {
    fontSize: 10, fontWeight: '700', color: '#94a3b8',
    letterSpacing: 0.8, paddingHorizontal: 14,
    paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderColor: '#f1f5f9',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11,
    gap: 10, borderBottomWidth: 1, borderColor: '#f8fafc',
  },
  dropdownItemActive:     { backgroundColor: '#f8fafc' },
  dropdownDot:            { width: 8, height: 8, borderRadius: 4 },
  dropdownItemText:       { fontSize: 13, color: '#334155', fontWeight: '500' },
  dropdownItemTextActive: { color: '#0f172a', fontWeight: '700' },

  dropdownBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  assignDropdownContainer: {
    position: 'absolute', backgroundColor: 'white',
    borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
    width: 220, shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12,
    shadowRadius: 16, elevation: 12, overflow: 'hidden',
  },
  assignDropdownHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderColor: '#f1f5f9', backgroundColor: '#f8fafc',
  },
  assignDropdownTitle: { fontSize: 10, fontWeight: '700', color: '#3b82f6', letterSpacing: 0.8 },
  currentlyAssignedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#f0fdf4', borderBottomWidth: 1, borderColor: '#bbf7d0',
  },
  currentlyAssignedDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16a34a' },
  currentlyAssignedText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
  execDropdownRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderColor: '#f1f5f9', gap: 10,
  },
  execDropdownRowActive: { backgroundColor: '#f0fdf4' },
  execName:              { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  execNameActive:        { color: '#16a34a', fontWeight: '700' },
  noExecsText:           { textAlign: 'center', color: '#94a3b8', padding: 16, fontSize: 13 },
  removeExecRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    borderTopWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2',
  },
  removeExecText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },

  expandedContent: {
    backgroundColor: '#f8fafc', padding: 16,
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
  },
  expandedLayout: { flexDirection: 'row', gap: 16 },

  expandSectionLeft: {
    flex: 1.5, backgroundColor: 'white', borderRadius: 6,
    overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0',
  },
  miniTableHeader: {
    flexDirection: 'row', backgroundColor: '#f8fafc',
    padding: 8, borderBottomWidth: 1, borderColor: '#e2e8f0',
  },
  miniHeadText: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.6 },
  miniTableRow: { flexDirection: 'row', padding: 9, borderBottomWidth: 1, borderColor: '#f1f5f9' },
  miniCellText: { fontSize: 13, color: '#334155' },

  expandSectionMid: {
    flex: 1, padding: 12, backgroundColor: 'white',
    borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0',
  },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.8, marginBottom: 8 },
  remarkText:   { fontSize: 13, color: '#0f172a', fontWeight: '500', marginBottom: 3 },
  remarkBox: {
    marginTop: 10, padding: 10, backgroundColor: '#fffbeb',
    borderRadius: 6, borderWidth: 1, borderColor: '#fde68a',
  },
  remarkAlertText:   { fontSize: 10, fontWeight: '700', color: '#b45309', marginBottom: 3, letterSpacing: 0.5 },
  remarkContentText: { fontSize: 12, color: '#92400e', fontWeight: '600', lineHeight: 16 },
  assignedBadgeBox: {
    marginTop: 12, padding: 10, backgroundColor: '#f0fdf4',
    borderRadius: 6, borderWidth: 1, borderColor: '#bbf7d0',
  },
  assignedBadgeLabel: { fontSize: 10, fontWeight: '700', color: '#16a34a', marginBottom: 2, letterSpacing: 0.5 },
  assignedBadgeName:  { fontSize: 13, fontWeight: '700', color: '#14532d' },

  expandSectionRight: {
    flex: 1, backgroundColor: 'white', borderRadius: 6,
    borderWidth: 1, borderColor: '#e2e8f0', padding: 12,
  },
  financeRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  financeLabel:  { fontSize: 12, color: '#64748b' },
  financeValue:  { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  financeDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
  amountToCollectBar: {
    backgroundColor: '#0f172a', padding: 10, borderRadius: 6,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 10,
  },
  atcLabel: { color: '#94a3b8', fontWeight: '700', fontSize: 10, letterSpacing: 0.8 },
  atcValue: { color: 'white', fontWeight: '800', fontSize: 15 },

  // ── Pagination ──
  paginationBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', gap: 20,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderColor: '#e2e8f0', backgroundColor: 'white',
  },
  pageSizeWrapper:  { flexDirection: 'row', alignItems: 'center', gap: 8, position: 'relative' },
  pageSizeLabel:    { fontSize: 12, color: '#64748b', fontWeight: '500' },
  pageSizeSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc', minWidth: 60,
  },
  pageSizeSelectorText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  pageSizeDropdown: {
    position: 'absolute', bottom: 36, left: 0,
    width: 80, backgroundColor: 'white', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 10,
    elevation: 6, overflow: 'hidden', zIndex: 999,
  },
  pageSizeOption: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f1f5f9',
  },
  pageSizeOptionActive:    { backgroundColor: '#f8fafc' },
  pageSizeOptionText:      { fontSize: 13, color: '#334155', fontWeight: '500' },
  pageSizeOptionTextActive: { color: '#0f172a', fontWeight: '700' },
  pageRangeText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  pageNavRow:    { flexDirection: 'row', gap: 4 },
  pageNavBtn: {
    width: 32, height: 32, borderRadius: 6,
    borderWidth: 1, borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center',
  },
  pageNavBtnDisabled: { borderColor: '#f1f5f9', backgroundColor: '#fafafa' },
});
