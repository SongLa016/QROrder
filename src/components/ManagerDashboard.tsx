import React, { useState, useMemo } from 'react'
import { MenuItem, Order, Table, RestaurantInfo, OrderItem } from '../types.ts'
import { QRCodeSVG } from '../utils/qrGenerator.ts'
import { playOrderPing, playWaiterCallPing, playBillRequestPing } from '../utils/soundHelper.ts'
import {
  ShoppingBag,
  UtensilsCrossed,
  TrendingUp,
  Star,
  Check,
  Plus,
  Edit3,
  Trash2,
  Printer,
  HelpCircle,
  Bell,
  RefreshCw,
  Home,
  ChevronLeft,
  QrCode,
  Inbox,
  LogOut
} from 'lucide-react'

interface ManagerDashboardProps {
  restaurant: RestaurantInfo
  menu: MenuItem[]
  tables: Table[]
  orders: Order[]
  updateGlobalState: (
    updater: {
      restaurant?: RestaurantInfo
      menu?: MenuItem[]
      tables?: Table[]
      orders?: Order[]
    },
    actionContext?: string
  ) => void
  navigateToHome: () => void
}

export default function ManagerDashboard({
  restaurant,
  menu,
  tables,
  orders,
  updateGlobalState,
  navigateToHome
}: ManagerDashboardProps) {
  // Navigation Tabs: 'orders' | 'menu-tables' | 'analytics'
  const [activeTab, setActiveTab] = useState<'orders' | 'menu-tables' | 'analytics'>('orders')

  // Edit Restaurant Form
  const [isEditingRest, setIsEditingRest] = useState(false)
  const [restForm, setRestForm] = useState({
    name: restaurant.name,
    tagline: restaurant.tagline,
    logo: restaurant.logo,
    address: restaurant.address || '',
    paymentQrCode: restaurant.paymentQrCode || ''
  })

  // Edit / Add Dish State
  const [showDishModal, setShowDishModal] = useState(false)
  const [editingDish, setEditingDish] = useState<MenuItem | null>(null)
  const [dishForm, setDishForm] = useState({ name: '', price: 30000, category: 'Món chính', image: '', available: true })

  // Print Settings for QR
  const [selectedPrintTables, setSelectedPrintTables] = useState<number[]>(tables.map(t => t.number))
  const [isPrintMode, setIsPrintMode] = useState(false)

  // Receipt Printing State
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [tableReceiptToPrint, setTableReceiptToPrint] = useState<Table | null>(null)
  
  // Edit order state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)

  const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month' | 'custom'>('day')
  // Custom date range (ISO date strings, e.g. '2026-07-01')
  const todayStr = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState<string>(todayStr)
  const [dateTo, setDateTo] = useState<string>(todayStr)

  // Table label editing state — key: table number, value: draft label text
  const [editingTableLabel, setEditingTableLabel] = useState<number | null>(null)
  const [tableLabelDraft, setTableLabelDraft] = useState<string>('')
  
  // Search query for orders in Kanban board (by customer name or table label/number)
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('')


  // Onboarding Setup State
  const [onboardForm, setOnboardForm] = useState({
    name: restaurant.name || '',
    tagline: restaurant.tagline || '',
    logo: restaurant.logo || '🍜',
    address: restaurant.address || '',
    paymentQrCode: restaurant.paymentQrCode || ''
  })

  // Audio Context State
  const [isAudioSuspended, setIsAudioSuspended] = useState(false)
  
  // Notification Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const prevOrdersRef = React.useRef(orders)
  const prevTablesRef = React.useRef(tables)

  // Listen for orders that just reported QR payment & new orders/calls for audio notification
  React.useEffect(() => {
    let shouldPlayOrderPing = false;
    let shouldPlayCallPing = false;
    let shouldPlayBillPing = false;

    // Check for new orders
    if (orders.length > prevOrdersRef.current.length) {
      const newOrders = orders.filter(o => !prevOrdersRef.current.find(po => po.id === o.id));
      if (newOrders.some(o => o.status === 'pending')) {
        shouldPlayOrderPing = true;
      }
    }

    // Check for canceled/edited orders (customer canceled)
    if (orders.length < prevOrdersRef.current.length) {
      const canceledOrders = prevOrdersRef.current.filter(po => !orders.find(o => o.id === po.id));
      const pendingCanceled = canceledOrders.filter(o => o.status === 'pending');
      if (pendingCanceled.length > 0) {
        shouldPlayCallPing = true;
        const canceledTexts = pendingCanceled.map(o => {
          const tableDisp = tables.find(t => t.number === o.tableNumber)?.label || `Bàn ${o.tableNumber}`;
          return `${tableDisp} (Đơn #${o.id.slice(-6)})`;
        }).join(', ');
        // Set a slight delay for the toast to ensure it overrides any other toasts or state updates
        setTimeout(() => {
          setToastMessage(`⚠️ Khách hàng đã Hủy/Sửa lại món: ${canceledTexts}`);
        }, 100);
      }
    }

    orders.forEach(order => {
      if (order.paymentMethod === 'mobile' && order.paymentReported) {
        const prevOrder = prevOrdersRef.current.find(po => po.id === order.id)
        if (!prevOrder || !prevOrder.paymentReported) {
          // This order just transitioned to paymentReported = true
          const dishNames = order.items.map(item => {
            const dish = menu.find(d => d.id === item.menuItemId)
            return dish ? `${item.quantity}x ${dish.name}` : `${item.quantity}x Món ăn`
          }).join(', ')
          
          const tableDisp = tables.find(t => t.number === order.tableNumber)?.label || `Bàn ${order.tableNumber}`
          const titleText = order.customerName ? `${order.customerName} (${tableDisp})` : tableDisp
          
          setToastMessage(`🔔 ${titleText} báo cáo ĐÃ CHUYỂN KHOẢN cho đơn hàng (${dishNames}). Quản lý vui lòng kiểm tra App Ngân hàng để đối chiếu!`)
          shouldPlayOrderPing = true;
        }
      }
    })
    prevOrdersRef.current = orders

    // Check for new table calls
    tables.forEach(table => {
      const prevTable = prevTablesRef.current.find(t => t.number === table.number)
      if (table.activeCall && (!prevTable || prevTable.activeCall !== table.activeCall)) {
        if (table.activeCall === 'request_bill') {
          shouldPlayBillPing = true;
        } else {
          shouldPlayCallPing = true;
        }
      }
    })
    prevTablesRef.current = tables

    if (!isAudioSuspended) {
      if (shouldPlayOrderPing) playOrderPing();
      else if (shouldPlayBillPing) playBillRequestPing();
      else if (shouldPlayCallPing) playWaiterCallPing();
    }
  }, [orders, tables, menu, isAudioSuspended])

  React.useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 8000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])

  // Listen to Web Audio API status
  React.useEffect(() => {
    try {
      const AudioCtxClass = (window.AudioContext || (window as any).webkitAudioContext)
      if (AudioCtxClass) {
        const dummyCtx = new AudioCtxClass()
        if (dummyCtx.state === 'suspended') {
          setIsAudioSuspended(true)
        }
        dummyCtx.close()
      }
    } catch (e) {
      console.warn('AudioContext check skipped:', e)
    }
  }, [])

  const handleActivateAudio = () => {
    try {
      const AudioCtxClass = (window.AudioContext || (window as any).webkitAudioContext)
      if (AudioCtxClass) {
        const dummyCtx = new AudioCtxClass()
        dummyCtx.resume().then(() => {
          setIsAudioSuspended(false)
          dummyCtx.close()
        })
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Sync state helpers
  const handleToggleAvailable = (dishId: string) => {
    const updatedMenu = menu.map(item => {
      if (item.id === dishId) {
        return { ...item, available: !item.available }
      }
      return item
    })
    updateGlobalState({ menu: updatedMenu }, 'TOGGLE_STOCK')
  }

  const handleVerifyPayment = (orderId: string) => {
    const updatedOrders = orders.map(order => {
      if (order.id === orderId) {
        return { ...order, paymentVerified: true }
      }
      return order
    })
    updateGlobalState({ orders: updatedOrders }, 'VERIFY_PAYMENT')
  }

  const handleUpdateOrderStatus = (orderId: string, newStatus: 'pending' | 'served' | 'completed') => {
    const updatedOrders = orders.map(order => {
      if (order.id === orderId) {
        return { ...order, status: newStatus }
      }
      return order
    })

    // If order is completed, update the matching table status
    let updatedTables = [...tables]
    const orderObj = orders.find(o => o.id === orderId)
    if (orderObj && newStatus === 'completed') {
      // Check if there are other pending or served orders for this table
      const remainingActiveOrders = updatedOrders.filter(
        o => o.tableNumber === orderObj.tableNumber && o.status !== 'completed'
      )
      if (remainingActiveOrders.length === 0) {
        // All orders done — rotate sessionId so the next guest starts fresh
        const newSessionId = `session-${Date.now()}`
        updatedTables = tables.map(t => {
          if (t.number === orderObj.tableNumber) {
            return { ...t, status: 'empty' as const, activeCall: null, sessionId: newSessionId }
          }
          return t
        })
      }
    } else if (orderObj && newStatus === 'served') {
      updatedTables = tables.map(t => {
        if (t.number === orderObj.tableNumber) {
          return { ...t, status: 'served' as const }
        }
        return t
      })
    }

    updateGlobalState({ orders: updatedOrders, tables: updatedTables }, 'STATUS_CHANGE')
  }


  // Clear waiter call
  const handleClearCall = (tableNumber: number) => {
    const updatedTables = tables.map(t => {
      if (t.number === tableNumber) {
        // Check if there are any pending or served orders for this table
        const hasActiveOrders = orders.some(o => o.tableNumber === tableNumber && o.status !== 'completed')
        
        // If there are no active orders, revert the table to 'empty'
        // Otherwise, keep its current status (e.g. 'billing' or 'ordering')
        const newStatus = hasActiveOrders ? t.status : 'empty'
        
        return { ...t, activeCall: null, status: newStatus }
      }
      return t
    })
    updateGlobalState({ tables: updatedTables }, 'CLEAR_CALL')
  }

  // Menu crud operations
  const handleSaveDish = (e: React.FormEvent) => {
    e.preventDefault()

    const sanitizedPrice = Math.max(0, dishForm.price)
    const sanitizedForm = { ...dishForm, price: sanitizedPrice }

    if (editingDish) {
      // Edit mode
      const updatedMenu = menu.map(d => {
        if (d.id === editingDish.id) {
          return { ...d, ...sanitizedForm }
        }
        return d
      })
      updateGlobalState({ menu: updatedMenu }, 'EDIT_DISH')
    } else {
      // Create mode
      const newDish: MenuItem = {
        id: `food-${Date.now()}`,
        ...sanitizedForm
      }
      updateGlobalState({ menu: [...menu, newDish] }, 'ADD_DISH')
    }

    setShowDishModal(false)
    setEditingDish(null)
  }

  const handleDeleteDish = (dishId: string) => {
    // Check if dish is in any active orders
    const isInActiveOrder = orders.some(o => 
      o.status !== 'completed' && o.items.some(i => i.menuItemId === dishId)
    )

    if (isInActiveOrder) {
      alert('Không thể xóa! Món này đang nằm trong đơn hàng chờ phục vụ. Gợi ý: Chuyển trạng thái sang "Hết món" thay vì xóa.')
      return
    }

    if (window.confirm('Bạn có chắc chắn muốn xóa món này?')) {
      const updatedMenu = menu.filter(d => d.id !== dishId)
      updateGlobalState({ menu: updatedMenu }, 'DELETE_DISH')
    }
  }

  // Table grid operations
  const handleAddTable = () => {
    const nextNumber = tables.length > 0 ? Math.max(...tables.map(t => t.number)) + 1 : 1
    const newTable: Table = {
      number: nextNumber,
      status: 'empty'
    }
    updateGlobalState({ tables: [...tables, newTable] }, 'ADD_TABLE')
    setSelectedPrintTables((prev: number[]) => [...prev, nextNumber])
  }

  const handleRemoveTable = () => {
    if (tables.length === 0) return
    const maxNum = Math.max(...tables.map(t => t.number))
    if (window.confirm(`Bạn có chắc chắn muốn xóa Bàn số ${maxNum}?`)) {
      const updatedTables = tables.filter(t => t.number !== maxNum)
      updateGlobalState({ tables: updatedTables }, 'DELETE_TABLE')
      setSelectedPrintTables((prev: number[]) => prev.filter((n: number) => n !== maxNum))
    }
  }

  const handleDeleteTable = (tableNumber: number) => {
    // Check if table has active orders
    const hasActiveOrders = orders.some(o => o.tableNumber === tableNumber && o.status !== 'completed')

    if (hasActiveOrders) {
      alert(`Không thể xóa! Bàn ${tableNumber} đang có khách và chưa hoàn tất thanh toán.`)
      return
    }

    const tableDisp = tables.find(t => t.number === tableNumber)
    const displayName = tableDisp ? getTableName(tableDisp) : `Bàn ${tableNumber}`
    if (window.confirm(`Bạn có chắc chắn muốn xóa ${displayName}?`)) {
      const updatedTables = tables.filter(t => t.number !== tableNumber)
      updateGlobalState({ tables: updatedTables }, 'DELETE_TABLE')
      setSelectedPrintTables((prev: number[]) => prev.filter((n: number) => n !== tableNumber))
    }
  }


  // Save Restaurant Info
  const handleSaveRestaurant = () => {
    updateGlobalState({ restaurant: restForm }, 'UPDATE_RESTAURANT')
    setIsEditingRest(false)
  }

  // Helper: returns display name for a table
  const getTableName = (t: Table) => t.label?.trim() ? t.label.trim() : `Bàn ${t.number}`

  // Save a custom label for a table
  const handleSaveTableLabel = (tableNumber: number) => {
    const updatedTables = tables.map(t =>
      t.number === tableNumber ? { ...t, label: tableLabelDraft.trim() || undefined } : t
    )
    updateGlobalState({ tables: updatedTables }, 'RENAME_TABLE')
    setEditingTableLabel(null)
  }



  // Print Trigger
  const triggerPrintWindow = () => {
    window.print()
  }

  // Analytics Metrics computation
  const activeOrdersCount = orders.filter(o => o.status === 'pending').length
  const callStaffAlerts = tables.filter(t => t.activeCall)

  // Real-time operational revenue for today (from 00:00:00)
  const totalRevenue = useMemo(() => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const dayMs = startOfDay.getTime()
    return orders
      .filter(o => o.timestamp >= dayMs && (o.status === 'completed' || o.status === 'served'))
      .reduce((sum, o) => sum + o.total, 0)
  }, [orders])

  const averageRating = useMemo(() => {
    const ratedOrders = orders.filter(o => o.rating)
    if (ratedOrders.length === 0) return 5.0
    const sum = ratedOrders.reduce((acc, o) => acc + (o.rating || 5), 0)
    return parseFloat((sum / ratedOrders.length).toFixed(1))
  }, [orders])

  // Time Filtered Orders for Analytics reports
  const filteredOrders = useMemo(() => {
    const now = Date.now()
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const dayMs = startOfDay.getTime()

    if (timeFilter === 'day') {
      return orders.filter(o => o.timestamp >= dayMs)
    }
    if (timeFilter === 'week') {
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000
      return orders.filter(o => o.timestamp >= weekAgo)
    }
    if (timeFilter === 'month') {
      const monthAgo = now - 30 * 24 * 60 * 60 * 1000
      return orders.filter(o => o.timestamp >= monthAgo)
    }
    // custom range
    const from = new Date(dateFrom)
    from.setHours(0, 0, 0, 0)
    const to = new Date(dateTo)
    to.setHours(23, 59, 59, 999)
    return orders.filter(o => o.timestamp >= from.getTime() && o.timestamp <= to.getTime())
  }, [orders, timeFilter, dateFrom, dateTo])

  const filteredRevenue = useMemo(() => {
    return filteredOrders
      .filter(o => o.status === 'completed' || o.status === 'served')
      .reduce((sum, o) => sum + o.total, 0)
  }, [filteredOrders])

  const filteredCompletedCount = useMemo(() => {
    return filteredOrders.filter(o => o.status === 'completed').length
  }, [filteredOrders])

  const filteredAverageRating = useMemo(() => {
    const rated = filteredOrders.filter(o => o.rating)
    if (rated.length === 0) return 5.0
    const sum = rated.reduce((acc, o) => acc + (o.rating || 5), 0)
    return parseFloat((sum / rated.length).toFixed(1))
  }, [filteredOrders])

  // Custom Chart Data: Revenue by Category (filtered)
  const categoryRevenue = useMemo(() => {
    const map: { [cat: string]: number } = {}
    filteredOrders
      .filter(o => o.status === 'completed' || o.status === 'served')
      .forEach(order => {
        order.items.forEach(item => {
          const dish = menu.find(d => d.id === item.menuItemId)
          if (dish) {
            map[dish.category] = (map[dish.category] || 0) + (dish.price * item.quantity)
          }
        })
      })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [filteredOrders, menu])

  // Top Dishes Sales Ranking (filtered)
  const topDishes = useMemo(() => {
    const map: { [dishId: string]: number } = {}
    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        map[item.menuItemId] = (map[item.menuItemId] || 0) + item.quantity
      })
    })

    return Object.entries(map)
      .map(([dishId, quantity]) => {
        const dish = menu.find(d => d.id === dishId)
        return {
          name: dish?.name || 'Món đã xóa',
          category: dish?.category || 'Chưa phân loại',
          quantity
        }
      })
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
  }, [filteredOrders, menu])

  // Chart 1: Revenue trend — bucketed by hour (day) or by day (week/month/custom)
  const revenueTrend = useMemo(() => {
    if (timeFilter === 'day') {
      const slots = ['0–4h', '4–8h', '8–12h', '12–16h', '16–20h', '20–24h']
      const values = new Array(6).fill(0)
      filteredOrders
        .filter(o => o.status === 'completed' || o.status === 'served')
        .forEach(o => {
          const h = new Date(o.timestamp).getHours()
          values[Math.floor(h / 4)] += o.total
        })
      return slots.map((label, i) => ({ label, value: values[i] }))
    }
    if (timeFilter === 'week') {
      const days: { label: string; value: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        d.setHours(0, 0, 0, 0)
        const start = d.getTime()
        const end = start + 86400000
        const rev = filteredOrders
          .filter(o => (o.status === 'completed' || o.status === 'served') && o.timestamp >= start && o.timestamp < end)
          .reduce((sum, o) => sum + o.total, 0)
        days.push({ label: d.toLocaleDateString('vi-VN', { weekday: 'short' }), value: rev })
      }
      return days
    }
    if (timeFilter === 'month') {
      const weeks: { label: string; value: number }[] = []
      for (let i = 3; i >= 0; i--) {
        const end = Date.now() - i * 7 * 86400000
        const start = end - 7 * 86400000
        const rev = filteredOrders
          .filter(o => (o.status === 'completed' || o.status === 'served') && o.timestamp >= start && o.timestamp < end)
          .reduce((sum, o) => sum + o.total, 0)
        weeks.push({ label: `Tuần ${4 - i}`, value: rev })
      }
      return weeks
    }
    // custom: bucket each day between dateFrom..dateTo
    const from = new Date(dateFrom)
    from.setHours(0, 0, 0, 0)
    const to = new Date(dateTo)
    to.setHours(23, 59, 59, 999)
    const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
    const days: { label: string; value: number }[] = []
    for (let i = 0; i < Math.min(diffDays, 31); i++) {
      const d = new Date(from)
      d.setDate(d.getDate() + i)
      const start = d.getTime()
      const end = start + 86400000
      const rev = filteredOrders
        .filter(o => (o.status === 'completed' || o.status === 'served') && o.timestamp >= start && o.timestamp < end)
        .reduce((sum, o) => sum + o.total, 0)
      days.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: rev })
    }
    return days
  }, [filteredOrders, timeFilter, dateFrom, dateTo])

  // Chart 2: Order status donut — pending / served / completed
  const orderStatusCounts = useMemo(() => {
    const pending = filteredOrders.filter(o => o.status === 'pending').length
    const served = filteredOrders.filter(o => o.status === 'served').length
    const done = filteredOrders.filter(o => o.status === 'completed').length
    const total = pending + served + done || 1
    return [
      { label: 'Đang chờ', count: pending, pct: pending / total, color: 'var(--color-error)' },
      { label: 'Đã phục vụ', count: served, pct: served / total, color: 'var(--color-info)' },
      { label: 'Hoàn thành', count: done, pct: done / total, color: 'var(--color-success)' },
    ]
  }, [filteredOrders])

  // Chart 3: Rating distribution 1–5 stars
  const ratingDistribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0] // index 0 = 1 star … index 4 = 5 stars
    filteredOrders.filter(o => o.rating).forEach(o => {
      const idx = Math.min(Math.max((o.rating || 1) - 1, 0), 4)
      counts[idx]++
    })
    const max = Math.max(...counts) || 1
    return counts.map((count, i) => ({ stars: i + 1, count, pct: (count / max) * 100 }))
  }, [filteredOrders])


  // Print receipt side effect
  React.useEffect(() => {
    if (receiptOrder || tableReceiptToPrint) {
      const timer1 = setTimeout(() => {
        window.print();
        setTimeout(() => {
          setReceiptOrder(null);
          setTableReceiptToPrint(null);
        }, 500);
      }, 300);
      return () => clearTimeout(timer1);
    }
  }, [receiptOrder, tableReceiptToPrint]);

  // Render Consolidated Table Receipt directly
  if (tableReceiptToPrint) {
    const tableDisp = getTableName(tableReceiptToPrint);
    
    // Gom nhóm các đơn hàng của bàn trong phiên này
    const sessionOrders = orders.filter(o => 
      o.tableNumber === tableReceiptToPrint.number && 
      (o.sessionId === tableReceiptToPrint.sessionId || (!tableReceiptToPrint.sessionId && o.status !== 'completed'))
    );
    
    const consolidated = new Map<string, { item: OrderItem, quantity: number, price: number, name: string }>();
    let grandTotal = 0;
    
    sessionOrders.forEach(o => {
      grandTotal += o.total;
      o.items.forEach(item => {
        const key = item.menuItemId + (item.notes ? `-${item.notes}` : '');
        if (consolidated.has(key)) {
          const existing = consolidated.get(key)!;
          existing.quantity += item.quantity;
        } else {
          const dish = menu.find(d => d.id === item.menuItemId);
          const name = item.snapshotName || dish?.name || 'Món ăn';
          const price = item.snapshotPrice ?? dish?.price ?? 0;
          consolidated.set(key, { item, quantity: item.quantity, price, name });
        }
      });
    });

    const consolidatedItems = Array.from(consolidated.values());
    const customerNames = Array.from(new Set(sessionOrders.map(o => o.customerName).filter(Boolean))).join(', ');

    return (
      <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '300px', margin: '0 auto', color: 'black', backgroundColor: 'white' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '1.5rem' }}>{restaurant.name}</h2>
          {restaurant.address && <p style={{ margin: 0, fontSize: '0.85rem' }}>{restaurant.address}</p>}
          <p style={{ margin: '5px 0', fontSize: '0.85rem' }}>{restaurant.tagline}</p>
          <div style={{ borderBottom: '1px dashed black', margin: '10px 0' }}></div>
          <h3 style={{ margin: '5px 0' }}>TỔNG HÓA ĐƠN BÀN</h3>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Giờ in: {new Date().toLocaleString('vi-VN')}</p>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <p style={{ margin: '2px 0', fontSize: '1.2rem' }}><strong>{tableDisp}</strong></p>
          {customerNames && <p style={{ margin: '2px 0' }}>Khách hàng: {customerNames}</p>}
        </div>

        <div style={{ borderBottom: '1px dashed black', margin: '10px 0' }}></div>

        <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ paddingBottom: '5px' }}>Món</th>
              <th style={{ paddingBottom: '5px', textAlign: 'center' }}>SL</th>
              <th style={{ paddingBottom: '5px', textAlign: 'right' }}>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {consolidatedItems.map((ci, idx) => (
              <tr key={idx}>
                <td style={{ padding: '4px 0', borderBottom: '1px dotted #ccc' }}>{ci.name}</td>
                <td style={{ padding: '4px 0', borderBottom: '1px dotted #ccc', textAlign: 'center' }}>{ci.quantity}</td>
                <td style={{ padding: '4px 0', borderBottom: '1px dotted #ccc', textAlign: 'right' }}>{(ci.price * ci.quantity).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderBottom: '1px dashed black', margin: '10px 0' }}></div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', margin: '10px 0' }}>
          <span>TỔNG CỘNG:</span>
          <span>{grandTotal.toLocaleString('vi-VN')} đ</span>
        </div>

        <div style={{ borderBottom: '1px dashed black', margin: '10px 0' }}></div>

        <div style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '20px' }}>
          <p style={{ margin: '2px 0' }}>Cảm ơn quý khách!</p>
          <p style={{ margin: '2px 0' }}>Hẹn gặp lại</p>
        </div>
      </div>
    );
  }

  // Render receipt directly
  if (receiptOrder) {
    const table = tables.find(t => t.number === receiptOrder.tableNumber);
    const tableDisp = table ? getTableName(table) : `Bàn ${receiptOrder.tableNumber}`;
    return (
      <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '300px', margin: '0 auto', color: 'black', backgroundColor: 'white' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '1.5rem' }}>{restaurant.name}</h2>
          {restaurant.address && <p style={{ margin: 0, fontSize: '0.85rem' }}>{restaurant.address}</p>}
          <p style={{ margin: '5px 0', fontSize: '0.85rem' }}>{restaurant.tagline}</p>
          <div style={{ borderBottom: '1px dashed black', margin: '10px 0' }}></div>
          <h3 style={{ margin: '5px 0' }}>HÓA ĐƠN THANH TOÁN</h3>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Số: #{receiptOrder.id.slice(-6)}</p>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Ngày: {new Date(receiptOrder.timestamp).toLocaleString('vi-VN')}</p>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <p style={{ margin: '2px 0' }}><strong>{tableDisp}</strong></p>
          {receiptOrder.customerName && <p style={{ margin: '2px 0' }}>Khách hàng: {receiptOrder.customerName}</p>}
        </div>

        <div style={{ borderBottom: '1px dashed black', margin: '10px 0' }}></div>

        <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ paddingBottom: '5px' }}>Món</th>
              <th style={{ paddingBottom: '5px', textAlign: 'center' }}>SL</th>
              <th style={{ paddingBottom: '5px', textAlign: 'right' }}>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {receiptOrder.items.map((item, idx) => {
              const dish = menu.find(d => d.id === item.menuItemId);
              const name = item.snapshotName || dish?.name || 'Món ăn';
              const price = item.snapshotPrice ?? dish?.price ?? 0;
              return (
                <tr key={idx}>
                  <td style={{ padding: '4px 0', borderBottom: '1px dotted #ccc' }}>{name}</td>
                  <td style={{ padding: '4px 0', borderBottom: '1px dotted #ccc', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ padding: '4px 0', borderBottom: '1px dotted #ccc', textAlign: 'right' }}>{(price * item.quantity).toLocaleString('vi-VN')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ borderBottom: '1px dashed black', margin: '10px 0' }}></div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', margin: '10px 0' }}>
          <span>TỔNG CỘNG:</span>
          <span>{receiptOrder.total.toLocaleString('vi-VN')} đ</span>
        </div>

        <div style={{ borderBottom: '1px dashed black', margin: '10px 0' }}></div>

        <div style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: '20px' }}>
          <p style={{ margin: '2px 0' }}>Cảm ơn quý khách!</p>
          <p style={{ margin: '2px 0' }}>Hẹn gặp lại</p>
        </div>
      </div>
    );
  }

  // If in Print Mode, render separate print layout sheet
  if (isPrintMode) {
    return (
      <div className="layout-container" style={{ padding: 'var(--spacing-md)' }}>
        {/* Navigation back */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <button className="btn-secondary" onClick={() => setIsPrintMode(false)}>
              <ChevronLeft size={16} /> Quay lại
            </button>
            <h2 style={{ fontSize: '1.25rem' }}>Bản in mã QR đặt món ({selectedPrintTables.length} bàn)</h2>
          </div>
          <button className="btn-primary" onClick={triggerPrintWindow}>
            <Printer size={18} /> In ngay (PDF)
          </button>
        </div>

        {/* Paper Layout */}
        <div className="print-page" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--spacing-lg)' }}>
          {selectedPrintTables.map((num: number) => {
            const tenantId = new URLSearchParams(window.location.search).get('r')
            const qrUrl = `${window.location.origin}${window.location.pathname}?r=${tenantId}&table=${num}`
            const absoluteQrUrl = qrUrl.startsWith('http') ? qrUrl : `https://${window.location.host}${qrUrl}`
            return (
              <div
                key={num}
                className="qr-card-print card"
                style={{ alignItems: 'center', textAlign: 'center', padding: 'var(--spacing-xl)', gap: 'var(--spacing-md)', cursor: 'pointer' }}
                onClick={() => window.open(absoluteQrUrl, '_blank')}
                title="Click để mở nhanh tab gọi món"
              >
                <span style={{ fontSize: '2.5rem', display: 'block' }}>
                  {restaurant.logo.startsWith('data:') ? (
                    <img
                      src={restaurant.logo}
                      alt="Logo"
                      style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--color-border)' }}
                    />
                  ) : (
                    restaurant.logo
                  )}
                </span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800 }}>{restaurant.name}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '-10px' }}>{restaurant.tagline}</p>

                {/* Dynamically render QR Code */}
                <div style={{ width: '180px', height: '180px', margin: 'var(--spacing-md) 0' }}>
                  <QRCodeSVG text={absoluteQrUrl} size={180} />
                </div>

                <div style={{ border: '2px solid var(--color-primary)', padding: 'var(--spacing-sm) var(--spacing-md)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)', fontWeight: 800, fontSize: '1.5rem', width: '100%' }}>
                  BÀN SỐ {num}
                </div>

                <footer style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, marginTop: 'var(--spacing-sm)' }}>
                  Quét mã QR để xem Thực đơn & Gọi món trực tiếp
                </footer>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // If not onboarded yet, show setup screen
  if (!restaurant.onboarded) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-base)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 'var(--spacing-md)'
      }}>
        <div className="card" style={{
          maxWidth: '520px',
          width: '100%',
          padding: 'var(--spacing-xl)',
          gap: 'var(--spacing-md)',
          boxShadow: 'var(--shadow-high)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-sm)' }}>
            <span style={{ fontSize: '3.5rem', display: 'block', marginBottom: 'var(--spacing-xs)' }}>
              {onboardForm.logo.startsWith('data:') ? (
                <img
                  src={onboardForm.logo}
                  alt="Logo"
                  style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-primary)' }}
                />
              ) : (
                onboardForm.logo
              )}
            </span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800 }}>Thiết lập quán ăn của bạn</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Chào mừng bạn đến với hệ thống đặt món QR cao cấp. Hãy điền các thông tin cơ bản để bắt đầu sử dụng.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            {/* Restaurant Name */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Tên cửa hàng / nhà hàng:</label>
              <input
                type="text"
                required
                className="form-control"
                placeholder="Ví dụ: VibeC Bistro, Cà Phê Ông Bầu..."
                value={onboardForm.name === 'Tên quán của bạn' ? '' : onboardForm.name}
                onChange={(e) => setOnboardForm({ ...onboardForm, name: e.target.value })}
              />
            </div>

            {/* Tagline */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Khẩu hiệu / Slogan kinh doanh:</label>
              <input
                type="text"
                required
                className="form-control"
                placeholder="Ví dụ: Cà phê sạch cho ngày mới năng động..."
                value={onboardForm.tagline === 'Khẩu hiệu kinh doanh' ? '' : onboardForm.tagline}
                onChange={(e) => setOnboardForm({ ...onboardForm, tagline: e.target.value })}
              />
            </div>

            {/* Address */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Địa chỉ quán ăn:</label>
              <input
                type="text"
                required
                className="form-control"
                placeholder="Ví dụ: 120 Nguyễn Huệ, Bến Nghé, Quận 1..."
                value={onboardForm.address === '123 Đường Nguyễn Huệ, Quận 1, TP. HCM' ? '' : onboardForm.address}
                onChange={(e) => setOnboardForm({ ...onboardForm, address: e.target.value })}
              />
            </div>

            {/* Logo Selection */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Ảnh đại diện (Logo) quán:</label>

              {/* Preset Emoji Scroller */}
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)', overflowX: 'auto', padding: 'var(--spacing-xs) 0', marginBottom: 'var(--spacing-xs)' }}>
                {['🍜', '☕', '🍕', '🍔', '🍰', '🍣', '🥞', '🥗', '🥤'].map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    style={{
                      minHeight: '38px',
                      minWidth: '38px',
                      padding: 0,
                      fontSize: '1.25rem',
                      border: onboardForm.logo === emoji ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      backgroundColor: onboardForm.logo === emoji ? 'var(--color-primary-light)' : 'transparent',
                      borderRadius: 'var(--radius-sm)'
                    }}
                    onClick={() => setOnboardForm({ ...onboardForm, logo: emoji })}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Custom logo upload */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Hoặc chọn ảnh từ máy của bạn:</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ fontSize: '0.85rem', padding: 'var(--spacing-xs)', width: '100%', minHeight: '38px' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        if (typeof reader.result === 'string') {
                          setOnboardForm({ ...onboardForm, logo: reader.result })
                        }
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                />
              </div>
            </div>

            {/* QR Payment Setup */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Mã QR Thanh toán (Tùy chọn):</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Tải lên ảnh mã QR nhận tiền (VietQR, Momo...) để khách quét:</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ fontSize: '0.85rem', padding: 'var(--spacing-xs)', width: '100%', minHeight: '38px' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        if (typeof reader.result === 'string') {
                          setOnboardForm({ ...onboardForm, paymentQrCode: reader.result })
                        }
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                />
                {onboardForm.paymentQrCode && (
                  <div style={{ marginTop: 'var(--spacing-xs)', textAlign: 'center' }}>
                    <img src={onboardForm.paymentQrCode} alt="Payment QR" style={{ width: '100px', height: '100px', objectFit: 'contain', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            className="btn-primary"
            style={{ width: '100%', marginTop: 'var(--spacing-md)' }}
            disabled={!onboardForm.name || !onboardForm.tagline || !onboardForm.address}
            onClick={() => {
              updateGlobalState({
                restaurant: {
                  ...onboardForm,
                  onboarded: true
                }
              }, 'ONBOARD_COMPLETE')
            }}
          >
            Hoàn tất và Khởi tạo Hệ thống
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-base)', display: 'flex', flexDirection: 'column' }}>

      {/* Top dashboard header */}
      <header className="header-sticky" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <button className="btn-ghost" style={{ padding: 'var(--spacing-xs)', border: 'none', minHeight: '40px', minWidth: '40px' }} onClick={navigateToHome} title="Về trang chủ">
            <Home size={20} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 800 }}>
              {restaurant.name}
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Hệ thống vận hành realtime</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <button
            className="btn-secondary"
            style={{ minHeight: '38px', padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: '0.85rem' }}
            onClick={playOrderPing}
          >
            <RefreshCw size={14} /> Test Ping
          </button>
          <button
            className="btn-outline"
            style={{ minHeight: '38px', padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: '0.85rem', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
            onClick={() => {
              const tenantId = new URLSearchParams(window.location.search).get('r')
              window.location.href = `/?r=${tenantId}`
            }}
          >
            <LogOut size={14} /> Đăng Xuất
          </button>
        </div>
      </header>

      {isAudioSuspended && (
        <div 
          className="no-print"
          onClick={handleActivateAudio}
          style={{
            backgroundColor: 'var(--color-error-light)',
            borderBottom: '1px solid var(--color-error)',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            textAlign: 'center',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'var(--color-error)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          <span>🔔</span>
          <span>Hệ thống chuông cảnh báo đang bị trình duyệt tắt âm. Click vào đây để kích hoạt chuông báo đơn mới/yêu cầu phục vụ.</span>
        </div>
      )}

      {/* Top Metrics Cards */}
      <section className="layout-container" style={{ padding: 'var(--spacing-md) var(--spacing-md) 0 var(--spacing-md)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', width: '100%' }}>
          {/* Revenue */}
          <div className="card metric-card" style={{ flex: '1 1 220px', padding: 'var(--spacing-md)', gap: 'var(--spacing-xs)' }}>
            <TrendingUp className="metric-card-icon" size={80} style={{ color: 'var(--color-success)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Doanh thu hôm nay</span>
            <h2 style={{ color: 'var(--color-success)', fontSize: '1.75rem', fontFamily: 'var(--font-body)', fontWeight: 800 }}>
              {totalRevenue.toLocaleString('vi-VN')} đ
            </h2>
          </div>

          {/* Active Orders */}
          <div className="card metric-card" style={{ flex: '1 1 220px', padding: 'var(--spacing-md)', gap: 'var(--spacing-xs)' }}>
            <ShoppingBag className="metric-card-icon" size={80} style={{ color: 'var(--color-error)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Đơn đang chờ</span>
            <h2 style={{ color: 'var(--color-error)', fontSize: '1.75rem', fontFamily: 'var(--font-body)', fontWeight: 800 }}>
              {activeOrdersCount} đơn
            </h2>
          </div>

          {/* Assistant alerts */}
          <div className="card metric-card" style={{ flex: '1 1 220px', padding: 'var(--spacing-md)', gap: 'var(--spacing-xs)' }}>
            <Bell className="metric-card-icon" size={80} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Yêu cầu hỗ trợ</span>
            <h2 style={{ color: 'var(--color-primary)', fontSize: '1.75rem', fontFamily: 'var(--font-body)', fontWeight: 800 }}>
              {callStaffAlerts.length} bàn
            </h2>
          </div>

          {/* Average Rating */}
          <div className="card metric-card" style={{ flex: '1 1 220px', padding: 'var(--spacing-md)', gap: 'var(--spacing-xs)' }}>
            <Star className="metric-card-icon" size={80} style={{ color: 'var(--color-info)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Đánh giá trung bình</span>
            <h2 style={{ color: 'var(--color-info)', fontSize: '1.75rem', fontFamily: 'var(--font-body)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
              {averageRating} <Star size={20} fill="var(--color-info)" stroke="var(--color-info)" />
            </h2>
          </div>
        </div>
      </section>

      {/* Tabs list */}
      <div className="layout-container" style={{ paddingBottom: 0 }}>
        <nav className="tabs-container" style={{ margin: 'var(--spacing-md) 0' }}>
          <button
            className={`tab-pill ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            Xử Lý Đơn Hàng ({activeOrdersCount})
          </button>
          <button
            className={`tab-pill ${activeTab === 'menu-tables' ? 'active' : ''}`}
            onClick={() => setActiveTab('menu-tables')}
          >
            Cấu Hình Menu & Bàn
          </button>
          <button
            className={`tab-pill ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Thống Kê & Phản Hồi
          </button>
        </nav>
      </div>

      {/* Operations Area */}
      <main style={{ flex: 1, padding: 'var(--spacing-md) 0' }}>
        {activeTab === 'orders' ? (
          /* Tab 1: Orders Kanban Board */
          <div className="layout-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

            {/* Realtime Table Map Grid */}
            <div className="card" style={{ gap: 'var(--spacing-md)' }}>
              <h2 style={{ fontSize: '1.15rem', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <QrCode size={18} /> Sơ đồ bàn ăn trực tuyến
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 'var(--spacing-md)' }}>
                {tables.map(t => {
                  let bgColor = 'var(--color-bg-base)';
                  let textColor = 'var(--color-text-main)';
                  let borderColor = 'var(--color-border)';
                  let statusText = 'Bàn trống';

                  if (t.activeCall) {
                    bgColor = 'var(--color-error-light)';
                    borderColor = 'var(--color-error)';
                    textColor = 'var(--color-error)';
                    statusText = t.activeCall === 'request_bill' ? 'Gọi tính tiền' : 'Gọi phục vụ';
                  } else if (t.status === 'billing') {
                    bgColor = 'oklch(93% 0.04 280)';
                    borderColor = 'oklch(60% 0.18 280)';
                    textColor = 'oklch(40% 0.18 280)';
                    statusText = 'Chờ tính tiền';
                  } else if (t.status === 'ordering') {
                    bgColor = 'var(--color-primary-light)';
                    borderColor = 'var(--color-primary)';
                    textColor = 'var(--color-primary)';
                    statusText = 'Đang dùng món';
                  }

                  const tableUrl = `${window.location.origin}${window.location.pathname}?table=${t.number}`;

                  return (
                    <div
                      key={t.number}
                      style={{
                        backgroundColor: bgColor,
                        border: `2px solid ${borderColor}`,
                        borderRadius: 'var(--radius-sm)',
                        padding: 'var(--spacing-sm)',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        aspectRatio: '1',
                        transition: 'var(--transition-fast)',
                        boxShadow: 'var(--shadow-low)',
                        position: 'relative',
                        paddingBottom: t.status !== 'empty' ? '32px' : 'var(--spacing-sm)'
                      }}
                    >
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', width: '100%' }} onClick={() => window.open(tableUrl, '_blank')} title={`Mở tab khách: ${getTableName(t)}`}>
                        <strong style={{ fontSize: '0.9rem', color: textColor, lineHeight: 1.2 }}>{getTableName(t)}</strong>
                        <span style={{ fontSize: '0.65rem', marginTop: '4px', fontWeight: 600, color: textColor }}>{statusText}</span>
                      </div>
                      
                      {t.status !== 'empty' && (
                        <button 
                          className="btn-secondary" 
                          style={{ position: 'absolute', bottom: '6px', left: '6px', right: '6px', fontSize: '0.7rem', padding: '2px', minHeight: '22px', backgroundColor: 'var(--color-bg-surface)' }}
                          onClick={(e) => { e.stopPropagation(); setTableReceiptToPrint(t); }}
                        >
                          🖨️ Tổng Bill
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Staff call alerts row */}
            {callStaffAlerts.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                {callStaffAlerts.map(t => (
                  <div key={t.number} className="card" style={{ borderLeft: '4px solid var(--color-error)', padding: 'var(--spacing-sm) var(--spacing-md)', gap: 'var(--spacing-sm)', flex: '1 1 220px', flexDirection: 'row', alignItems: 'center' }}>
                    <Bell size={16} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '0.9rem' }}>{getTableName(t)}</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-error)' }}>
                        {t.activeCall === 'request_bill' ? 'Yêu cầu tính tiền' : 'Gọi phục vụ'}
                      </span>
                    </div>
                    <button className="btn-secondary" style={{ minHeight: '32px', padding: '4px 10px', fontSize: '0.8rem', flexShrink: 0 }} onClick={() => handleClearCall(t.number)}>
                      <Check size={12} /> Xong
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search filter for orders (customer name or table name) */}
            <div className="card" style={{ padding: 'var(--spacing-sm) var(--spacing-md)', flexDirection: 'row', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🔍</span>
              <input
                type="text"
                className="form-control"
                placeholder="Tìm nhanh đơn hàng theo tên người gọi (Ví dụ: Tuấn) hoặc tên bàn (Ví dụ: Bàn 1)..."
                value={orderSearchQuery}
                onChange={(e) => setOrderSearchQuery(e.target.value)}
                style={{ flex: 1, height: '36px', minHeight: '36px', border: 'none', background: 'transparent', outline: 'none', padding: 0, fontSize: '0.875rem' }}
              />
              {orderSearchQuery && (
                <button 
                  className="btn-ghost" 
                  style={{ border: 'none', background: 'none', padding: 'var(--spacing-xs)', fontSize: '0.75rem', minHeight: '28px', color: 'var(--color-text-muted)', flexShrink: 0 }}
                  onClick={() => setOrderSearchQuery('')}
                >
                  Xóa lọc
                </button>
              )}
            </div>

            {/* ── Kanban columns ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--spacing-md)', alignItems: 'start' }}>

              {/* Column 1: Chưa phục vụ (pending) */}
              {(() => {
                const searchLower = orderSearchQuery.toLowerCase().trim()
                const col = orders.filter(o => {
                  if (o.status !== 'pending') return false
                  if (!searchLower) return true
                  const tbl = tables.find(t => t.number === o.tableNumber)
                  const tblName = tbl ? getTableName(tbl).toLowerCase() : `bàn ${o.tableNumber}`
                  const custName = o.customerName ? o.customerName.toLowerCase() : ''
                  return tblName.includes(searchLower) || custName.includes(searchLower)
                })
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)', backgroundColor: 'oklch(96% 0.02 25)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-error)', borderLeft: '4px solid var(--color-error)' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-error)', display: 'inline-block', animation: col.length > 0 ? 'pulse 1.5s infinite' : 'none', flexShrink: 0 }} />
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-error)' }}>🔴 Chưa phục vụ</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-error)' }}>{col.length}</span>
                    </div>
                    {col.map(order => {
                      const table = tables.find(t => t.number === order.tableNumber)
                      const tableDisp = table ? getTableName(table) : `Bàn ${order.tableNumber}`
                      const titleText = order.customerName ? `${order.customerName} (${tableDisp})` : tableDisp
                      return (
                        <div key={order.id} className="card" style={{ padding: 'var(--spacing-sm)', gap: 'var(--spacing-xs)', borderTop: '3px solid var(--color-error)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <strong style={{ fontSize: '0.95rem' }}>{titleText}</strong>
                              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>#{order.id.slice(-6)} · {new Date(order.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày {new Date(order.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {order.paymentMethod === 'cash' ? '💵' : order.paymentMethod === 'card' ? '💳' : '📲'}
                              {order.paymentMethod === 'mobile' && (
                                order.paymentVerified 
                                  ? <span style={{ color: 'var(--color-success)', fontWeight: 700, fontStyle: 'normal' }}>✅ Đã nhận tiền</span>
                                  : <span style={{ color: 'var(--color-warning)', fontWeight: 700, fontStyle: 'normal', backgroundColor: 'var(--color-warning-light)', padding: '2px 4px', borderRadius: '4px' }}>⚠️ Chờ xác nhận</span>
                              )}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '4px 0', fontSize: '0.82rem' }}>
                            {order.items.map(item => {
                              const dish = menu.find(d => d.id === item.menuItemId)
                              return (
                                <div key={item.menuItemId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>
                                    <strong>{item.quantity}×</strong> {item.snapshotName || dish?.name || 'Món ăn'}
                                    {(item.snapshotPrice !== undefined || dish) && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginLeft: '4px' }}>({(item.snapshotPrice ?? dish?.price ?? 0).toLocaleString('vi-VN')} đ)</span>}
                                  </span>
                                  {item.notes && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>({item.notes})</span>}
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-primary)' }}>{order.total.toLocaleString('vi-VN')} đ</span>
                            <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                              {order.paymentMethod === 'mobile' && !order.paymentVerified && (
                                <button className="btn-secondary" style={{ minHeight: '30px', padding: '4px 8px', fontSize: '0.75rem', borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }} onClick={() => handleVerifyPayment(order.id)}>
                                  Xác nhận tiền
                                </button>
                              )}
                              <button className="btn-secondary" style={{ minHeight: '30px', padding: '4px 8px', fontSize: '0.78rem' }} onClick={() => setEditingOrder(order)}>
                                ✏️ Sửa
                              </button>
                              <button className="btn-primary" style={{ minHeight: '30px', padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => handleUpdateOrderStatus(order.id, 'served')}>
                                ✓ Đã phục vụ
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {col.length === 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl) var(--spacing-md)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '2px dashed var(--color-border)', fontSize: '0.85rem', opacity: 0.8 }}>
                        <Inbox size={32} style={{ color: 'var(--color-border-hover)' }} />
                        <span style={{ fontWeight: 600 }}>Chưa có đơn chờ phục vụ</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Column 2: Đã phục vụ (served) */}
              {(() => {
                const searchLower = orderSearchQuery.toLowerCase().trim()
                const col = orders.filter(o => {
                  if (o.status !== 'served') return false
                  if (!searchLower) return true
                  const tbl = tables.find(t => t.number === o.tableNumber)
                  const tblName = tbl ? getTableName(tbl).toLowerCase() : `bàn ${o.tableNumber}`
                  const custName = o.customerName ? o.customerName.toLowerCase() : ''
                  return tblName.includes(searchLower) || custName.includes(searchLower)
                })
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)', backgroundColor: 'oklch(96% 0.02 220)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-info)', borderLeft: '4px solid var(--color-info)' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-info)', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-info)' }}>🔵 Đã phục vụ</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-info)' }}>{col.length}</span>
                    </div>
                    {col.map(order => {
                      const table = tables.find(t => t.number === order.tableNumber)
                      const tableDisp = table ? getTableName(table) : `Bàn ${order.tableNumber}`
                      const titleText = order.customerName ? `${order.customerName} (${tableDisp})` : tableDisp
                      return (
                        <div key={order.id} className="card" style={{ padding: 'var(--spacing-sm)', gap: 'var(--spacing-xs)', borderTop: '3px solid var(--color-info)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <strong style={{ fontSize: '0.95rem' }}>{titleText}</strong>
                              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>#{order.id.slice(-6)} · {new Date(order.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày {new Date(order.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {order.paymentMethod === 'cash' ? '💵' : order.paymentMethod === 'card' ? '💳' : '📲'}
                              {order.paymentMethod === 'mobile' && (
                                order.paymentVerified 
                                  ? <span style={{ color: 'var(--color-success)', fontWeight: 700, fontStyle: 'normal' }}>✅ Đã nhận tiền</span>
                                  : <span style={{ color: 'var(--color-warning)', fontWeight: 700, fontStyle: 'normal', backgroundColor: 'var(--color-warning-light)', padding: '2px 4px', borderRadius: '4px' }}>⚠️ Chờ xác nhận</span>
                              )}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '4px 0', fontSize: '0.82rem' }}>
                            {order.items.map(item => {
                              const dish = menu.find(d => d.id === item.menuItemId)
                              return (
                                <div key={item.menuItemId} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>
                                    <strong>{item.quantity}×</strong> {item.snapshotName || dish?.name || 'Món ăn'}
                                    {(item.snapshotPrice !== undefined || dish) && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginLeft: '4px' }}>({(item.snapshotPrice ?? dish?.price ?? 0).toLocaleString('vi-VN')} đ)</span>}
                                  </span>
                                  {item.notes && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>({item.notes})</span>}
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-primary)' }}>{order.total.toLocaleString('vi-VN')} đ</span>
                            <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                              {order.paymentMethod === 'mobile' && !order.paymentVerified && (
                                <button className="btn-secondary" style={{ minHeight: '30px', padding: '4px 8px', fontSize: '0.75rem', borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }} onClick={() => handleVerifyPayment(order.id)}>
                                  Xác nhận tiền
                                </button>
                              )}
                              <button className="btn-secondary" style={{ minHeight: '30px', padding: '4px 8px', fontSize: '0.78rem' }} onClick={() => setReceiptOrder(order)}>
                                🖨️ In HĐ
                              </button>
                              <button className="btn-primary" style={{ minHeight: '30px', padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => handleUpdateOrderStatus(order.id, 'completed')}>
                                💳 Hoàn tất TT
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {col.length === 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl) var(--spacing-md)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '2px dashed var(--color-border)', fontSize: '0.85rem', opacity: 0.8 }}>
                        <Inbox size={32} style={{ color: 'var(--color-border-hover)' }} />
                        <span style={{ fontWeight: 600 }}>Chưa có đơn đã phục vụ</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Column 3: Hoàn thành (completed) */}
              {(() => {
                const searchLower = orderSearchQuery.toLowerCase().trim()
                const filteredDone = orders.filter(o => {
                  if (o.status !== 'completed') return false
                  if (!searchLower) return true
                  const tbl = tables.find(t => t.number === o.tableNumber)
                  const tblName = tbl ? getTableName(tbl).toLowerCase() : `bàn ${o.tableNumber}`
                  const custName = o.customerName ? o.customerName.toLowerCase() : ''
                  return tblName.includes(searchLower) || custName.includes(searchLower)
                })
                const col = filteredDone.slice(0, 10)
                const totalDone = filteredDone.length
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)', backgroundColor: 'oklch(96% 0.02 140)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-success)', borderLeft: '4px solid var(--color-success)' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-success)', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-success)' }}>✅ Hoàn thành</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-success)' }}>{totalDone}</span>
                    </div>
                    {col.map(order => {
                      const table = tables.find(t => t.number === order.tableNumber)
                      const tableDisp = table ? getTableName(table) : `Bàn ${order.tableNumber}`
                      const titleText = order.customerName ? `${order.customerName} (${tableDisp})` : tableDisp
                      return (
                        <div key={order.id} className="card" style={{ padding: 'var(--spacing-sm)', gap: 'var(--spacing-xs)', borderTop: '3px solid var(--color-success)', opacity: 0.82 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <strong style={{ fontSize: '0.9rem' }}>{titleText}</strong>
                              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>#{order.id.slice(-6)} · {new Date(order.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ngày {new Date(order.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            </div>
                            {order.rating && (
                              <div style={{ display: 'flex', gap: '2px' }}>
                                {Array.from({ length: order.rating }).map((_, i) => <Star key={i} size={10} fill="var(--color-primary)" stroke="var(--color-primary)" />)}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                            {order.items.map(item => {
                              const dish = menu.find(d => d.id === item.menuItemId)
                              const name = item.snapshotName || dish?.name || 'Món ăn'
                              const price = item.snapshotPrice ?? dish?.price
                              return `${item.quantity}× ${name}${price !== undefined ? ` (${price.toLocaleString('vi-VN')} đ)` : ''}`
                            }).join(', ')}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', borderTop: '1px solid var(--color-border)', paddingTop: '4px' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>
                              {order.paymentMethod === 'cash' ? '💵 Tiền mặt' : order.paymentMethod === 'card' ? '💳 Quẹt thẻ' : '📲 CK'}
                            </span>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <button className="btn-ghost" style={{ padding: '2px 6px', fontSize: '0.75rem', minHeight: '24px', color: 'var(--color-text-main)' }} onClick={() => setReceiptOrder(order)}>
                                🖨️ In
                              </button>
                              <strong style={{ color: 'var(--color-success)' }}>{order.total.toLocaleString('vi-VN')} đ</strong>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {totalDone === 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl) var(--spacing-md)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', border: '2px dashed var(--color-border)', fontSize: '0.85rem', opacity: 0.8 }}>
                        <Inbox size={32} style={{ color: 'var(--color-border-hover)' }} />
                        <span style={{ fontWeight: 600 }}>Chưa có đơn hoàn thành</span>
                      </div>
                    )}
                    {totalDone > 10 && (
                      <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0 }}>Hiển thị 10/{totalDone} đơn gần nhất</p>
                    )}
                  </div>
                )
              })()}

            </div>

          </div>

        ) : activeTab === 'menu-tables' ? (

          /* Tab 2: Menu and Tables editor */
          <div className="layout-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--spacing-lg)' }}>

            {/* Restaurant configuration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
              <div className="card" style={{ gap: 'var(--spacing-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700 }}>Thông tin nhà hàng</h2>
                  <button className="btn-ghost" style={{ border: 'none', background: 'none', padding: 'var(--spacing-xs)', minHeight: '36px' }} onClick={() => setIsEditingRest(!isEditingRest)}>
                    <Edit3 size={16} />
                  </button>
                </div>

                {isEditingRest ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Tên nhà hàng:</label>
                      <input type="text" className="form-control" value={restForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRestForm({ ...restForm, name: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Khẩu hiệu:</label>
                      <input type="text" className="form-control" value={restForm.tagline} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRestForm({ ...restForm, tagline: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Địa chỉ quán:</label>
                      <input type="text" className="form-control" value={restForm.address} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRestForm({ ...restForm, address: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Biểu tượng (Emoji hoặc file):</label>
                      <div style={{ display: 'flex', gap: 'var(--spacing-xs)', overflowX: 'auto', padding: 'var(--spacing-xs) 0' }}>
                        {['🍜', '☕', '🍕', '🍔', '🍰', '🍣', '🥞', '🥗', '🥤'].map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            style={{
                              minHeight: '34px',
                              minWidth: '34px',
                              padding: 0,
                              fontSize: '1.1rem',
                              border: restForm.logo === emoji ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                              backgroundColor: restForm.logo === emoji ? 'var(--color-primary-light)' : 'transparent',
                              borderRadius: 'var(--radius-sm)'
                            }}
                            onClick={() => setRestForm({ ...restForm, logo: emoji })}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ fontSize: '0.8rem', padding: 'var(--spacing-xs)', width: '100%', minHeight: '38px', marginTop: 'var(--spacing-xs)' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const reader = new FileReader()
                            reader.onloadend = () => {
                              if (typeof reader.result === 'string') {
                                setRestForm({ ...restForm, logo: reader.result })
                              }
                            }
                            reader.readAsDataURL(file)
                          }
                        }}
                      />
                    </div>
                    
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Mã QR Thanh toán (Tùy chọn):</label>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ fontSize: '0.8rem', padding: 'var(--spacing-xs)', width: '100%', minHeight: '38px' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const reader = new FileReader()
                            reader.onloadend = () => {
                              if (typeof reader.result === 'string') {
                                setRestForm({ ...restForm, paymentQrCode: reader.result })
                              }
                            }
                            reader.readAsDataURL(file)
                          }
                        }}
                      />
                      {restForm.paymentQrCode && (
                        <div style={{ marginTop: 'var(--spacing-xs)', textAlign: 'center' }}>
                          <img src={restForm.paymentQrCode} alt="Payment QR" style={{ width: '100px', height: '100px', objectFit: 'contain', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }} />
                        </div>
                      )}
                    </div>

                    <button className="btn-primary" style={{ width: '100%' }} onClick={handleSaveRestaurant}>Lưu thông tin</button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 'var(--spacing-md) 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <span style={{ fontSize: '3rem', display: 'block' }}>
                      {restaurant.logo.startsWith('data:') ? (
                        <img
                          src={restaurant.logo}
                          alt="Logo"
                          style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-primary)' }}
                        />
                      ) : (
                        restaurant.logo
                      )}
                    </span>
                    <div>
                      <strong style={{ fontSize: '1.25rem', display: 'block', margin: 0 }}>{restaurant.name}</strong>
                      {restaurant.address && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>📍 {restaurant.address}</p>}
                    </div>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: 0 }}>{restaurant.tagline}</p>
                  </div>
                )}
              </div>

              {/* Table setup exporter */}
              <div className="card" style={{ gap: 'var(--spacing-sm)' }}>
                <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700 }}>Danh mục Bàn & Xuất mã QR</h2>

                <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
                  <button className="btn-ghost" style={{ flex: 1 }} onClick={handleRemoveTable}>Bớt Bàn (-)</button>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={handleAddTable}>Thêm Bàn (+)</button>
                </div>

                {/* Table management grid with label editing */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)', maxHeight: '280px', overflowY: 'auto', padding: '2px' }}>
                  {tables.map(t => (
                    <div key={t.number} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xs) var(--spacing-sm)', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>

                      {/* QR export checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedPrintTables.includes(t.number)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          if (e.target.checked) {
                            setSelectedPrintTables([...selectedPrintTables, t.number])
                          } else {
                            setSelectedPrintTables(selectedPrintTables.filter((n: number) => n !== t.number))
                          }
                        }}
                        style={{ flexShrink: 0 }}
                      />

                      {/* Name / inline editor */}
                      {editingTableLabel === t.number ? (
                        <>
                          <input
                            autoFocus
                            type="text"
                            className="form-control"
                            style={{ flex: 1, height: '28px', minHeight: '28px', padding: '2px 6px', fontSize: '0.82rem' }}
                            placeholder={`Bàn ${t.number}`}
                            value={tableLabelDraft}
                            onChange={e => setTableLabelDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveTableLabel(t.number)
                              if (e.key === 'Escape') setEditingTableLabel(null)
                            }}
                          />
                          <button
                            className="btn-primary"
                            style={{ minHeight: '28px', padding: '2px 8px', fontSize: '0.75rem', flexShrink: 0 }}
                            onClick={() => handleSaveTableLabel(t.number)}
                          >
                            Lưu
                          </button>
                          <button
                            className="btn-ghost"
                            style={{ minHeight: '28px', padding: '2px 6px', fontSize: '0.75rem', border: 'none', flexShrink: 0 }}
                            onClick={() => setEditingTableLabel(null)}
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>
                            {getTableName(t)}
                            {t.label && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: '4px' }}>#{t.number}</span>}
                          </span>
                          <button
                            className="btn-ghost"
                            style={{ minHeight: '28px', padding: '2px 6px', border: 'none', flexShrink: 0 }}
                            title="Đổi tên bàn"
                            onClick={() => { setEditingTableLabel(t.number); setTableLabelDraft(t.label || '') }}
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            className="btn-ghost"
                            style={{ minHeight: '28px', padding: '2px 6px', border: 'none', flexShrink: 0, color: 'var(--color-error)' }}
                            title="Xóa bàn"
                            onClick={() => handleDeleteTable(t.number)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {tables.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', padding: 'var(--spacing-md)' }}>Chưa có bàn nào. Nhấn "Thêm Bàn" để bắt đầu.</p>
                  )}
                </div>

                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: 0, fontStyle: 'italic' }}>
                  💡 Nhấn <Edit3 size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> để đổi tên (VD: "Bàn 1 Tầng 2", "VIP 01")
                </p>


                <button
                  className="btn-secondary"
                  style={{ width: '100%', marginTop: 'var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-xs)' }}
                  onClick={() => setIsPrintMode(true)}
                  disabled={selectedPrintTables.length === 0}
                >
                  <Printer size={16} /> Mở Trang In Hàng Loạt
                </button>
              </div>
            </div>

            {/* Menu Items Crud Management */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                  <UtensilsCrossed size={20} /> Danh sách thực đơn ({menu.length} món)
                </h2>
                <button
                  className="btn-primary"
                  style={{ minHeight: '38px', padding: 'var(--spacing-xs) var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-xs)', fontSize: '0.85rem' }}
                  onClick={() => {
                    setEditingDish(null)
                    setDishForm({ name: '', price: 35000, category: 'Món chính', image: '', available: true })
                    setShowDishModal(true)
                  }}
                >
                  <Plus size={16} /> Thêm món mới
                </button>
              </div>

              {/* Items List layout */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {menu.map(dish => (
                  <div key={dish.id} className="card" style={{ flexDirection: 'row', alignItems: 'center', padding: 'var(--spacing-md)', gap: 'var(--spacing-md)' }}>
                    <img src={dish.image} alt={dish.name} style={{ width: '60px', height: '60px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />

                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{dish.category}</span>
                      <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>{dish.name}</h4>
                      <p style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.9rem' }}>{dish.price.toLocaleString('vi-VN')} đ</p>
                    </div>

                    {/* Quick stock toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: dish.available ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                          {dish.available ? 'Đang bán' : 'Hết món'}
                        </span>
                        {/* Toggle Slider */}
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={dish.available}
                            onChange={() => handleToggleAvailable(dish.id)}
                          />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>

                      {/* Action buttons */}
                      <button
                        className="btn-ghost"
                        style={{ padding: 'var(--spacing-sm)', minWidth: '40px', minHeight: '40px' }}
                        onClick={() => {
                          setEditingDish(dish)
                          setDishForm({ ...dish })
                          setShowDishModal(true)
                        }}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        className="btn-ghost"
                        style={{ padding: 'var(--spacing-sm)', minWidth: '40px', minHeight: '40px', color: 'var(--color-error)' }}
                        onClick={() => handleDeleteDish(dish.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Tab 3: Statistics / Analytics */
          <div className="layout-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

            {/* Time Filter controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', backgroundColor: 'var(--color-bg-surface)', padding: 'var(--spacing-md)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontFamily: 'var(--font-body)', fontWeight: 700, margin: 0 }}>Bộ lọc khoảng thời gian</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0 }}>Báo cáo thống kê, sản lượng bán ra và ý kiến phản hồi sẽ lọc theo khoảng này</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
                  {(['day', 'week', 'month', 'custom'] as const).map(filter => (
                    <button
                      key={filter}
                      className={timeFilter === filter ? 'btn-primary' : 'btn-secondary'}
                      style={{ minHeight: '34px', fontSize: '0.8rem', padding: 'var(--spacing-xs) var(--spacing-md)', borderRadius: 'var(--radius-full)' }}
                      onClick={() => setTimeFilter(filter)}
                    >
                      {filter === 'day' ? 'Hôm nay' : filter === 'week' ? '7 ngày qua' : filter === 'month' ? '30 ngày qua' : '📅 Tùy chỉnh'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom date range pickers — only visible when 'custom' is active */}
              {timeFilter === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap', paddingTop: 'var(--spacing-sm)', borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Từ ngày:</label>
                    <input
                      type="date"
                      className="form-control"
                      style={{ minHeight: '34px', padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: '0.85rem', width: 'auto' }}
                      value={dateFrom}
                      max={dateTo}
                      onChange={e => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Đến ngày:</label>
                    <input
                      type="date"
                      className="form-control"
                      style={{ minHeight: '34px', padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: '0.85rem', width: 'auto' }}
                      value={dateTo}
                      min={dateFrom}
                      onChange={e => setDateTo(e.target.value)}
                    />
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                    {(() => {
                      const from = new Date(dateFrom)
                      const to = new Date(dateTo)
                      const diff = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
                      return diff > 0 ? `${diff} ngày` : 'Chọn khoảng hợp lệ'
                    })()}
                  </span>
                </div>
              )}
            </div>

            {/* Filtered Metrics Cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', width: '100%' }}>
              <div className="card" style={{ flex: '1 1 240px', padding: 'var(--spacing-md)', gap: 'var(--spacing-xs)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                  DOANH THU ({timeFilter === 'day' ? 'HÔM NAY' : timeFilter === 'week' ? '7 NGÀY QUA' : timeFilter === 'month' ? '30 NGÀY QUA' : `${dateFrom} — ${dateTo}`})
                </span>
                <h2 style={{ color: 'var(--color-success)', fontSize: '1.75rem', fontFamily: 'var(--font-body)', fontWeight: 800, margin: 0 }}>
                  {filteredRevenue.toLocaleString('vi-VN')} đ
                </h2>
              </div>

              <div className="card" style={{ flex: '1 1 240px', padding: 'var(--spacing-md)', gap: 'var(--spacing-xs)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>ĐƠN HOÀN THÀNH</span>
                <h2 style={{ color: 'var(--color-primary)', fontSize: '1.75rem', fontFamily: 'var(--font-body)', fontWeight: 800, margin: 0 }}>
                  {filteredCompletedCount} đơn
                </h2>
              </div>

              <div className="card" style={{ flex: '1 1 240px', padding: 'var(--spacing-md)', gap: 'var(--spacing-xs)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>ĐÁNH GIÁ TRUNG BÌNH</span>
                <h2 style={{ color: 'var(--color-info)', fontSize: '1.75rem', fontFamily: 'var(--font-body)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                  {filteredAverageRating} <Star size={18} fill="var(--color-info)" stroke="var(--color-info)" />
                </h2>
              </div>
            </div>

            {/* ── CHART ROW 1: Revenue Trend Bar Chart + Order Status Donut ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--spacing-lg)' }}>

              {/* Revenue Trend Bar Chart */}
              <div className="card" style={{ gap: 'var(--spacing-md)' }}>
                <h3 style={{ fontSize: '1.15rem', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', margin: 0 }}>
                  <TrendingUp size={20} /> Xu hướng doanh thu
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  {timeFilter === 'day' ? 'Theo khung giờ trong ngày' : timeFilter === 'week' ? 'Theo ngày trong tuần' : timeFilter === 'month' ? 'Theo tuần trong tháng' : `Theo ngày: ${dateFrom} → ${dateTo}`}
                </p>
                {(() => {
                  const maxVal = Math.max(...revenueTrend.map(d => d.value)) || 1
                  const hasData = revenueTrend.some(d => d.value > 0)
                  return hasData ? (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '140px', padding: '8px 0 0 0' }}>
                      {revenueTrend.map((slot, i) => {
                        const heightPct = (slot.value / maxVal) * 100
                        return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                              {slot.value > 0 ? `${Math.round(slot.value / 1000)}k` : ''}
                            </span>
                            <div
                              title={`${slot.label}: ${slot.value.toLocaleString('vi-VN')} đ`}
                              style={{
                                width: '100%',
                                height: `${Math.max(heightPct, slot.value > 0 ? 4 : 2)}%`,
                                background: slot.value > 0
                                  ? 'linear-gradient(180deg, var(--color-primary) 0%, oklch(55% 0.18 260) 100%)'
                                  : 'var(--color-bg-elevated)',
                                borderRadius: '4px 4px 0 0',
                                transition: 'height 0.4s cubic-bezier(0.4,0,0.2,1)',
                                cursor: 'default'
                              }}
                            />
                            <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {slot.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: 'var(--spacing-lg)' }}>Chưa có dữ liệu doanh thu trong khoảng này.</p>
                  )
                })()}
              </div>

              {/* Order Status Donut Chart */}
              <div className="card" style={{ gap: 'var(--spacing-md)' }}>
                <h3 style={{ fontSize: '1.15rem', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', margin: 0 }}>
                  <ShoppingBag size={20} /> Phân bổ trạng thái đơn
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0 }}>Tổng {filteredOrders.length} đơn trong khoảng đã chọn</p>
                {filteredOrders.length > 0 ? (
                  <div style={{ display: 'flex', gap: 'var(--spacing-lg)', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* SVG Donut */}
                    <svg viewBox="0 0 120 120" width="120" height="120" style={{ flexShrink: 0 }}>
                      {(() => {
                        const r = 46, cx = 60, cy = 60
                        const circumference = 2 * Math.PI * r
                        let offset = 0
                        const gap = 2
                        return orderStatusCounts.map((seg, i) => {
                          const dash = seg.pct * (circumference - gap * orderStatusCounts.length)
                          const el = (
                            <circle
                              key={i}
                              cx={cx} cy={cy} r={r}
                              fill="none"
                              stroke={seg.color}
                              strokeWidth="16"
                              strokeDasharray={`${dash} ${circumference - dash}`}
                              strokeDashoffset={-offset + circumference * 0.25}
                              strokeLinecap="round"
                              style={{ transition: 'stroke-dasharray 0.5s ease' }}
                            />
                          )
                          offset += dash + gap
                          return el
                        })
                      })()}
                      <text x="60" y="56" textAnchor="middle" style={{ fontSize: '14px', fontWeight: 800, fill: 'var(--color-text-main)', fontFamily: 'var(--font-body)' }}>
                        {filteredOrders.length}
                      </text>
                      <text x="60" y="70" textAnchor="middle" style={{ fontSize: '8px', fill: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
                        đơn
                      </text>
                    </svg>
                    {/* Legend */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', flex: 1, minWidth: '120px' }}>
                      {orderStatusCounts.map(seg => (
                        <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: seg.color, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                              <span style={{ fontWeight: 600 }}>{seg.label}</span>
                              <span style={{ color: 'var(--color-text-muted)' }}>{seg.count}</span>
                            </div>
                            <div style={{ height: '4px', backgroundColor: 'var(--color-bg-elevated)', borderRadius: '2px', marginTop: '2px' }}>
                              <div style={{ width: `${seg.pct * 100}%`, height: '100%', backgroundColor: seg.color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: 'var(--spacing-lg)' }}>Chưa có đơn hàng trong khoảng này.</p>
                )}
              </div>
            </div>

            {/* ── CHART ROW 2: Category Revenue bars + Top Dishes ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--spacing-lg)' }}>

              {/* Category Revenue horizontal bars */}
              <div className="card" style={{ gap: 'var(--spacing-md)' }}>
                <h3 style={{ fontSize: '1.15rem', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                  <TrendingUp size={20} /> Phân tích doanh số danh mục
                </h3>

                {categoryRevenue.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', margin: 'var(--spacing-sm) 0' }}>
                    {categoryRevenue.map((cat, i) => {
                      const maxVal = Math.max(...categoryRevenue.map(c => c.value)) || 1
                      const pct = (cat.value / maxVal) * 100
                      const colors = ['var(--color-primary)', 'var(--color-success)', 'var(--color-info)', 'var(--color-error)', 'oklch(65% 0.18 320)']
                      const color = colors[i % colors.length]
                      return (
                        <div key={cat.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: color }} />
                              <span>{cat.name}</span>
                            </div>
                            <strong>{cat.value.toLocaleString('vi-VN')} đ</strong>
                          </div>
                          <div style={{ height: '10px', width: '100%', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)', borderRadius: 'var(--radius-full)' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: 'var(--spacing-lg)' }}>Chưa có dữ liệu bán hàng trong khoảng thời gian này.</p>
                )}
              </div>

              {/* Best selling dishes with mini bar */}
              <div className="card" style={{ gap: 'var(--spacing-md)' }}>
                <h3 style={{ fontSize: '1.15rem', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                  <TrendingUp size={20} /> Sản phẩm bán chạy nhất
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                  {topDishes.map((dish, i) => {
                    const maxQty = topDishes[0]?.quantity || 1
                    const pct = (dish.quantity / maxQty) * 100
                    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
                    return (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '1rem' }}>{medals[i]}</span>
                            <div>
                              <strong style={{ display: 'block' }}>{dish.name}</strong>
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{dish.category}</span>
                            </div>
                          </div>
                          <span className="badge badge-success" style={{ fontSize: '0.8rem' }}>{dish.quantity} suất</span>
                        </div>
                        <div style={{ height: '6px', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-success), oklch(60% 0.18 140))', borderRadius: 'var(--radius-full)', transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    )
                  })}

                  {topDishes.length === 0 && (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: 'var(--spacing-lg)' }}>Chưa có món ăn nào được bán trong khoảng thời gian này.</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── CHART ROW 3: Rating Distribution + Customer Feedback ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--spacing-lg)' }}>

              {/* Rating Distribution Bar Chart */}
              <div className="card" style={{ gap: 'var(--spacing-md)' }}>
                <h3 style={{ fontSize: '1.15rem', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', margin: 0 }}>
                  <Star size={20} /> Phân bổ đánh giá sao
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  {filteredOrders.filter(o => o.rating).length} lượt đánh giá trong khoảng đã chọn
                </p>
                <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
                  {ratingDistribution.map(row => (
                    <div key={row.stars} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                      <div style={{ display: 'flex', gap: '2px', width: '72px', flexShrink: 0 }}>
                        {Array.from({ length: row.stars }).map((_, idx) => (
                          <Star key={idx} size={11} fill="var(--color-primary)" stroke="var(--color-primary)" />
                        ))}
                      </div>
                      <div style={{ flex: 1, height: '16px', backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${row.pct}%`,
                            height: '100%',
                            background: row.stars >= 4
                              ? 'linear-gradient(90deg, var(--color-success), oklch(62% 0.18 140))'
                              : row.stars === 3
                                ? 'linear-gradient(90deg, var(--color-primary), oklch(60% 0.18 260))'
                                : 'linear-gradient(90deg, var(--color-error), oklch(50% 0.22 25))',
                            borderRadius: 'var(--radius-full)',
                            transition: 'width 0.5s ease'
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, width: '24px', textAlign: 'right', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                        {row.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customers feedback cards */}
              <div className="card" style={{ gap: 'var(--spacing-md)' }}>
                <h3 style={{ fontSize: '1.15rem', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', margin: 0 }}>
                  <Star size={20} /> Ý kiến phản hồi khách hàng
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', maxHeight: '280px', overflowY: 'auto' }}>
                  {filteredOrders.filter(o => o.rating).map(order => (
                    <div key={order.id} style={{ padding: 'var(--spacing-sm)', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Bàn {order.tableNumber}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>#{order.id.slice(-6)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '2px', margin: '2px 0' }}>
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star key={idx} size={12} fill={idx < (order.rating || 0) ? 'var(--color-primary)' : 'transparent'} stroke="var(--color-primary)" />
                        ))}
                      </div>
                      {order.comment && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic', margin: 0 }}>"{order.comment}"</p>}
                    </div>
                  ))}
                </div>

                {filteredOrders.filter(o => o.rating).length === 0 && (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: 'var(--spacing-lg)' }}>Chưa có đánh giá nào từ khách hàng trong khoảng thời gian này.</p>
                )}
              </div>
            </div>

            {/* ── ROW 4: Detailed Order History List ── */}
            <div className="card" style={{ gap: 'var(--spacing-md)', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', margin: 0 }}>
                  📋 Danh sách đơn hàng chi tiết ({filteredOrders.length} đơn)
                </h3>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                  Tổng doanh thu kỳ: {filteredRevenue.toLocaleString('vi-VN')} đ
                </span>
              </div>

              {filteredOrders.length > 0 ? (
                <div style={{ overflowX: 'auto', width: '100%' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                        <th style={{ padding: 'var(--spacing-sm)', width: '90px' }}>Mã đơn</th>
                        <th style={{ padding: 'var(--spacing-sm)', width: '120px' }}>Thời gian</th>
                        <th style={{ padding: 'var(--spacing-sm)', width: '150px' }}>Khách & Bàn</th>
                        <th style={{ padding: 'var(--spacing-sm)' }}>Chi tiết món gọi</th>
                        <th style={{ padding: 'var(--spacing-sm)', width: '100px', textAlign: 'right' }}>Tổng tiền</th>
                        <th style={{ padding: 'var(--spacing-sm)', width: '100px', textAlign: 'center' }}>Thanh toán</th>
                        <th style={{ padding: 'var(--spacing-sm)', width: '120px', textAlign: 'center' }}>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...filteredOrders].sort((a, b) => b.timestamp - a.timestamp).map((order, index) => {
                        const table = tables.find(t => t.number === order.tableNumber)
                        const tableLabelText = table ? getTableName(table) : `Bàn ${order.tableNumber}`
                        const customerDisp = order.customerName ? `${order.customerName} (${tableLabelText})` : tableLabelText
                        
                        return (
                          <tr 
                            key={order.id} 
                            style={{ 
                              borderBottom: '1px solid var(--color-border)', 
                              backgroundColor: index % 2 === 0 ? 'transparent' : 'var(--color-bg-base)',
                              transition: 'background-color 0.2s ease'
                            }}
                          >
                            <td style={{ padding: 'var(--spacing-sm)', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                              #{order.id.slice(-6)}
                            </td>
                            <td style={{ padding: 'var(--spacing-sm)', whiteSpace: 'nowrap' }}>
                              {new Date(order.timestamp).toLocaleString('vi-VN', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                            <td style={{ padding: 'var(--spacing-sm)', fontWeight: 700 }}>
                              {customerDisp}
                            </td>
                            <td style={{ padding: 'var(--spacing-sm)', lineHeight: '1.4' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {order.items.map((item, idx) => {
                                  const dish = menu.find(d => d.id === item.menuItemId)
                                  return (
                                    <div key={idx} style={{ fontSize: '0.82rem' }}>
                                      <strong>{item.quantity}x</strong> {item.snapshotName || dish?.name || 'Món ăn'} 
                                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginLeft: '4px' }}>
                                        ({(item.snapshotPrice ?? dish?.price ?? 0).toLocaleString('vi-VN')} đ)
                                      </span>
                                      {item.notes && <span style={{ color: 'var(--color-error)', fontStyle: 'italic', fontSize: '0.75rem', marginLeft: '6px' }}>*Ghi chú: {item.notes}</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                            <td style={{ padding: 'var(--spacing-sm)', textAlign: 'right', fontWeight: 800, color: 'var(--color-primary)' }}>
                              {order.total.toLocaleString('vi-VN')} đ
                            </td>
                            <td style={{ padding: 'var(--spacing-sm)', textAlign: 'center', fontSize: '0.8rem', fontWeight: 600 }}>
                              {order.paymentMethod === 'cash' ? '💵 Tiền mặt' : order.paymentMethod === 'card' ? '💳 Thẻ' : '📲 CK'}
                            </td>
                            <td style={{ padding: 'var(--spacing-sm)', textAlign: 'center' }}>
                              {order.status === 'pending' && <span className="badge badge-error">Chưa phục vụ</span>}
                              {order.status === 'served' && <span className="badge badge-info">Đã phục vụ</span>}
                              {order.status === 'completed' && <span className="badge badge-success">Hoàn thành</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)', color: 'var(--color-text-muted)' }}>
                  <HelpCircle size={40} style={{ strokeWidth: 1.5, marginBottom: 'var(--spacing-xs)', color: 'var(--color-border)' }} />
                  <p style={{ margin: 0 }}>Không có đơn hàng nào trong khoảng thời gian được chọn.</p>
                </div>
              )}
            </div>

          </div>

        )}
      </main>

      {/* Dish modal overlay (CRUD) */}
      {showDishModal && (
        <div className="dialog-backdrop" onClick={() => setShowDishModal(false)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
              <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
                {editingDish ? 'Chỉnh sửa món ăn' : 'Thêm món mới'}
              </h2>
              <button className="btn-ghost" style={{ border: 'none', background: 'none', padding: 'var(--spacing-xs)', minHeight: '40px', minWidth: '40px' }} onClick={() => setShowDishModal(false)}>
                ✕
              </button>
            </header>

            <form onSubmit={handleSaveDish} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Tên món ăn:</label>
                <input
                  type="text"
                  required
                  className="form-control"
                  value={dishForm.name}
                  onChange={(e) => setDishForm({ ...dishForm, name: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Giá bán (VND):</label>
                <input
                  type="number"
                  required
                  min={0}
                  className="form-control"
                  value={dishForm.price}
                  onChange={(e) => setDishForm({ ...dishForm, price: parseInt(e.target.value, 10) || 0 })}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Danh mục:</label>
                <select
                  className="form-control"
                  value={dishForm.category}
                  onChange={(e) => setDishForm({ ...dishForm, category: e.target.value })}
                >
                  <option value="Khai vị">Khai vị</option>
                  <option value="Món chính">Món chính</option>
                  <option value="Đồ uống">Đồ uống</option>
                  <option value="Tráng miệng">Tráng miệng</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Ảnh món ăn:</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600 }}>Tải lên file hoặc nhập URL</span>
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                  {/* File Upload Selector */}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ fontSize: '0.85rem', padding: 'var(--spacing-xs)', width: '100%', minHeight: '38px' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          if (typeof reader.result === 'string') {
                            setDishForm({ ...dishForm, image: reader.result })
                          }
                        }
                        reader.readAsDataURL(file)
                      }
                    }}
                  />

                  {/* Text URL Input as fallback */}
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Hoặc dán URL ảnh: https://images.unsplash.com/..."
                    value={dishForm.image.startsWith('data:') ? '' : dishForm.image}
                    onChange={(e) => setDishForm({ ...dishForm, image: e.target.value })}
                    style={{ minHeight: '38px', padding: 'var(--spacing-sm) var(--spacing-md)', fontSize: '0.9rem' }}
                  />
                </div>

                {/* Live Preview Thumbnail */}
                {dishForm.image && (
                  <div style={{ marginTop: 'var(--spacing-xs)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <img
                      src={dishForm.image}
                      alt="Xem trước"
                      style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                      {dishForm.image.startsWith('data:') ? 'Ảnh tải lên từ máy (Base64)' : 'Xem trước ảnh từ link'}
                    </span>
                  </div>
                )}
              </div>

              <button className="btn-primary" type="submit" style={{ width: '100%', marginTop: 'var(--spacing-md)' }}>
                {editingDish ? 'Cập Nhật' : 'Tạo Mới'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="dialog-backdrop" onClick={() => setEditingOrder(null)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-sm)' }}>
              <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700 }}>
                Sửa Đơn #{editingOrder.id.slice(-6)}
              </h2>
              <button className="btn-ghost" style={{ border: 'none', background: 'none', padding: 'var(--spacing-xs)', minHeight: '40px', minWidth: '40px' }} onClick={() => setEditingOrder(null)}>
                ✕
              </button>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-md) 0', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
              {editingOrder.items.map(item => {
                const dish = menu.find(d => d.id === item.menuItemId)
                const price = item.snapshotPrice ?? dish?.price ?? 0
                return (
                  <div key={item.menuItemId} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', borderBottom: '1px solid var(--color-bg-elevated)', paddingBottom: 'var(--spacing-sm)' }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '0.95rem' }}>{item.snapshotName || dish?.name || 'Món ăn'}</strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-primary)' }}>{price.toLocaleString('vi-VN')} đ</span>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                      <button 
                        className="btn-secondary" 
                        style={{ minWidth: '32px', minHeight: '32px', padding: 0 }}
                        onClick={() => {
                          const newQty = item.quantity - 1;
                          let newItems = [...editingOrder.items];
                          if (newQty <= 0) {
                            newItems = newItems.filter(i => i.menuItemId !== item.menuItemId);
                          } else {
                            const idx = newItems.findIndex(i => i.menuItemId === item.menuItemId);
                            newItems[idx] = { ...newItems[idx], quantity: newQty };
                          }
                          const newTotal = newItems.reduce((acc, i) => acc + (i.snapshotPrice ?? menu.find(d=>d.id===i.menuItemId)?.price ?? 0) * i.quantity, 0);
                          setEditingOrder({ ...editingOrder, items: newItems, total: newTotal });
                        }}
                      >-</button>
                      <span style={{ fontWeight: 700, width: '20px', textAlign: 'center' }}>{item.quantity}</span>
                      <button 
                        className="btn-secondary" 
                        style={{ minWidth: '32px', minHeight: '32px', padding: 0 }}
                        onClick={() => {
                          const newItems = [...editingOrder.items];
                          const idx = newItems.findIndex(i => i.menuItemId === item.menuItemId);
                          newItems[idx] = { ...newItems[idx], quantity: newItems[idx].quantity + 1 };
                          const newTotal = newItems.reduce((acc, i) => acc + (i.snapshotPrice ?? menu.find(d=>d.id===i.menuItemId)?.price ?? 0) * i.quantity, 0);
                          setEditingOrder({ ...editingOrder, items: newItems, total: newTotal });
                        }}
                      >+</button>
                    </div>
                  </div>
                )
              })}
              
              {/* Thêm món mới */}
              <div style={{ marginTop: 'var(--spacing-sm)' }}>
                <strong style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>+ Thêm món:</strong>
                <select 
                  className="form-control" 
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const dish = menu.find(d => d.id === e.target.value);
                    if (!dish) return;
                    const existingIdx = editingOrder.items.findIndex(i => i.menuItemId === dish.id);
                    let newItems = [...editingOrder.items];
                    if (existingIdx >= 0) {
                      newItems[existingIdx].quantity += 1;
                    } else {
                      newItems.push({ menuItemId: dish.id, quantity: 1, snapshotName: dish.name, snapshotPrice: dish.price, notes: '' });
                    }
                    const newTotal = newItems.reduce((acc, i) => acc + (i.snapshotPrice ?? menu.find(d=>d.id===i.menuItemId)?.price ?? 0) * i.quantity, 0);
                    setEditingOrder({ ...editingOrder, items: newItems, total: newTotal });
                    e.target.value = '';
                  }}
                >
                  <option value="">-- Chọn món thêm --</option>
                  {menu.filter(d => d.available).map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.price.toLocaleString('vi-VN')}đ)</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Tổng tiền mới:</span>
                <strong style={{ display: 'block', fontSize: '1.2rem', color: 'var(--color-primary)' }}>{editingOrder.total.toLocaleString('vi-VN')} đ</strong>
              </div>
              <button 
                className="btn-primary" 
                style={{ minHeight: '40px', padding: '0 var(--spacing-lg)' }}
                onClick={() => {
                  const updatedOrders = orders.map(o => o.id === editingOrder.id ? editingOrder : o);
                  updateGlobalState({ orders: updatedOrders }, 'MANAGER_EDIT_ORDER');
                  setEditingOrder(null);
                  setToastMessage('Đã cập nhật đơn hàng thành công!');
                }}
              >Lưu Thay Đổi</button>
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: 'var(--color-success)',
          color: 'var(--color-text-inverse)',
          padding: 'var(--spacing-md) var(--spacing-lg)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-high)',
          zIndex: 9999,
          fontWeight: 600,
          animation: 'fadeIn 0.3s ease',
          maxWidth: '400px',
          lineHeight: '1.5'
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  )
}
