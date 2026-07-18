import React, { useState } from 'react'
import { MenuItem, Order, OrderItem, Table, RestaurantInfo } from '../types.ts'
import { 
  ShoppingBag, 
  Bell, 
  Receipt, 
  Plus, 
  Minus, 
  Trash2, 
  CheckCircle,
  HelpCircle,
  Star,
  Edit3
} from 'lucide-react'

interface CustomerPortalProps {
  tableNumber: number
  restaurant: RestaurantInfo
  menu: MenuItem[]
  orders: Order[]
  tables: Table[]
  updateGlobalState: (
    updater: {
      restaurant?: RestaurantInfo
      menu?: MenuItem[]
      tables?: Table[]
      orders?: Order[]
    },
    actionContext?: string
  ) => void
}

export default function CustomerPortal({
  tableNumber,
  restaurant,
  menu,
  orders,
  tables,
  updateGlobalState
}: CustomerPortalProps) {
  // UI states
  const [activeCategory, setActiveCategory] = useState<string>('Tất cả')
  const [cart, setCart] = useState<{ [id: string]: { quantity: number; notes: string } }>({})
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile'>('cash')
  const [activeTab, setActiveTab] = useState<'menu' | 'status'>('menu')
  
  // Rating states
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [selectedOrderToRate, setSelectedOrderToRate] = useState<Order | null>(null)
  const [ratingScore, setRatingScore] = useState(5)
  const [commentText, setCommentText] = useState('')
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showQrPaymentModal, setShowQrPaymentModal] = useState(false)
  const [qrPaymentTotal, setQrPaymentTotal] = useState(0)
  const [qrPaymentOrderId, setQrPaymentOrderId] = useState<string | null>(null)

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Current time state for 2-minute countdown
  const [currentTime, setCurrentTime] = useState(Date.now())
  
  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Customer Name State (stored in localStorage)
  const [customerName, setCustomerName] = useState<string>(() => {
    return localStorage.getItem(`customer_name_table_${tableNumber}`) || ''
  })

  // Welcome Screen state
  const [showWelcomeScreen, setShowWelcomeScreen] = useState<boolean>(!localStorage.getItem(`customer_name_table_${tableNumber}`))

  // Local storage guest session ID
  const sessionKey = `qr_active_session_table_${tableNumber}`
  const [localSessionId, setLocalSessionId] = useState<string>(() => {
    return localStorage.getItem(sessionKey) || ''
  })
  const [showTakeoverModal, setShowTakeoverModal] = useState(false)

  const currentTableStatus = tables.find(t => t.number === tableNumber)
  const serverSessionId = currentTableStatus?.sessionId

  // Check if session needs takeover confirmation
  React.useEffect(() => {
    if (serverSessionId && serverSessionId !== localSessionId && currentTableStatus?.status !== 'empty') {
      setShowTakeoverModal(true)
    } else if (serverSessionId && !localSessionId) {
      // Automatically pair client with server session if table has a session
      localStorage.setItem(sessionKey, serverSessionId)
      setLocalSessionId(serverSessionId)
    }
  }, [serverSessionId, localSessionId, currentTableStatus])

  const handleStartNewSession = () => {
    const newSessionId = `session-${tableNumber}-${Date.now()}`
    localStorage.setItem(sessionKey, newSessionId)
    setLocalSessionId(newSessionId)
    setCart({})
    
    // Reset table status to empty/fresh ordering state on server
    const updatedTables = tables.map(t => {
      if (t.number === tableNumber) {
        return { ...t, status: 'empty' as const, activeCall: undefined, sessionId: newSessionId }
      }
      return t
    })
    updateGlobalState({ tables: updatedTables }, 'SESSION_RESET')
    setShowTakeoverModal(false)
  }

  const handleJoinExistingSession = () => {
    if (serverSessionId) {
      localStorage.setItem(sessionKey, serverSessionId)
      setLocalSessionId(serverSessionId)
    }
    setShowTakeoverModal(false)
  }

  const handleCustomerNameChange = (val: string) => {
    setCustomerName(val)
    localStorage.setItem(`customer_name_table_${tableNumber}`, val)
  }


  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Get active category elements
  const categories = ['Tất cả', ...Array.from(new Set(menu.map(item => item.category)))]
  
  const filteredMenu = menu.filter(item => {
    if (!item.available) return false
    if (activeCategory === 'Tất cả') return true
    return item.category === activeCategory
  })

  // Cart operations
  const addToCart = (itemId: string) => {
    // Phản hồi xúc giác - rung nhẹ 50ms khi bấm (Haptic feedback)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([50])
    }

    const dish = menu.find(d => d.id === itemId)
    if (!dish || !dish.available) {
      showToast('Món ăn hiện tại không khả dụng.')
      return
    }
    setCart((prev: typeof cart) => {
      const current = prev[itemId] || { quantity: 0, notes: '' }
      return {
        ...prev,
        [itemId]: { ...current, quantity: current.quantity + 1 }
      }
    })
  }

  const updateCartQuantity = (itemId: string, delta: number) => {
    setCart((prev: typeof cart) => {
      const current = prev[itemId]
      if (!current) return prev
      const newQty = current.quantity + delta
      if (newQty <= 0) {
        const { [itemId]: _, ...rest } = prev
        return rest
      }
      return {
        ...prev,
        [itemId]: { ...current, quantity: newQty }
      }
    })
  }

  const cartItemsCount = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0)
  
  const cartTotal = Object.entries(cart).reduce((sum, [itemId, cartInfo]) => {
    const dish = menu.find(d => d.id === itemId)
    return sum + (dish && dish.available ? dish.price * cartInfo.quantity : 0)
  }, 0)

  // Trigger calls to staff
  const handleCallStaff = () => {
    const updatedTables = tables.map(t => {
      if (t.number === tableNumber) {
        return { ...t, status: 'ordering' as const, activeCall: 'call_waiter' as const }
      }
      return t
    })
    updateGlobalState({ tables: updatedTables }, 'CALL_STAFF')
    showToast('Đang gọi nhân viên phục vụ...')
  }

  const handleRequestBill = () => {
    const updatedTables = tables.map(t => {
      if (t.number === tableNumber) {
        return { ...t, status: 'billing' as const, activeCall: 'request_bill' as const }
      }
      return t
    })
    updateGlobalState({ tables: updatedTables }, 'REQUEST_BILL')
    showToast('Đã gửi yêu cầu thanh toán...')
  }

  // Submit Order to manager
  const handlePlaceOrder = () => {
    if (cartItemsCount === 0) return

    const currentSessionId = localSessionId || `session-${tableNumber}-${Date.now()}`
    if (!localSessionId) {
      localStorage.setItem(sessionKey, currentSessionId)
      setLocalSessionId(currentSessionId)
    }

    // Sanitize order items - only allow active and available menu items
    const orderItems: OrderItem[] = Object.entries(cart)
      .filter(([itemId]) => menu.some(d => d.id === itemId && d.available))
      .map(([itemId, cartInfo]) => {
        const dishInfo = menu.find(d => d.id === itemId)
        return {
          menuItemId: itemId,
          quantity: cartInfo.quantity,
          notes: cartInfo.notes || notes,
          snapshotName: dishInfo?.name || 'Món đã xóa',
          snapshotPrice: dishInfo?.price || 0
        }
      })

    if (orderItems.length === 0) return

    const currentOrderTotal = Object.entries(cart).reduce((sum, [itemId, cartInfo]) => {
      const dish = menu.find(d => d.id === itemId)
      return sum + (dish && dish.available ? dish.price * cartInfo.quantity : 0)
    }, 0)

    const newOrder: Order = {
      id: `order-${Date.now()}`,
      tableNumber,
      items: orderItems,
      total: currentOrderTotal,
      status: 'pending',
      paymentMethod,
      timestamp: Date.now(),
      sessionId: currentSessionId,
      customerName: customerName.trim() || undefined
    }


    // Set Table to ordering, ensuring sessionId is set if it wasn't already
    const updatedTables = tables.map(t => {
      if (t.number === tableNumber) {
        return { ...t, status: 'ordering' as const, sessionId: currentSessionId }
      }
      return t
    })

    updateGlobalState({ orders: [...orders, newOrder], tables: updatedTables }, 'PLACE_ORDER')
    
    setCart({})
    setNotes('')
    setIsCartOpen(false)
    showToast('Đã gửi bếp thành công!')
    
    // Switch to status tab to show the tracking
    setActiveTab('status')
    
    if (paymentMethod === 'mobile' && restaurant.paymentQrCode) {
      setQrPaymentOrderId(newOrder.id)
      setQrPaymentTotal(currentOrderTotal)
      setShowQrPaymentModal(true)
    } else {
      setShowSuccessModal(true)
    }
  }

  const handleEditOrder = (order: Order) => {
    // 1. Delete order from server
    const updatedOrders = orders.filter(o => o.id !== order.id)
    updateGlobalState({ orders: updatedOrders }, 'CUSTOMER_EDIT_ORDER')
    
    // 2. Load items into cart
    const newCart = { ...cart }
    order.items.forEach(item => {
      if (newCart[item.menuItemId]) {
        newCart[item.menuItemId].quantity += item.quantity;
        newCart[item.menuItemId].notes = item.notes || newCart[item.menuItemId].notes;
      } else {
        newCart[item.menuItemId] = { quantity: item.quantity, notes: item.notes || '' }
      }
    })
    setCart(newCart)
    
    // 3. Switch to menu tab and open cart
    setActiveTab('menu')
    setIsCartOpen(true)
    showToast('Đơn hàng đã được hoàn tác. Bạn có thể sửa và Gửi bếp lại nhé!')
  }

  // Submit Customer rating
  const handleSubmitRating = () => {
    if (!selectedOrderToRate) return

    const updatedOrders = orders.map(o => {
      if (o.id === selectedOrderToRate.id) {
        return { ...o, rating: ratingScore, comment: commentText }
      }
      return o
    })

    updateGlobalState({ orders: updatedOrders }, 'RATE_ORDER')
    setShowRatingModal(false)
    setSelectedOrderToRate(null)
    setCommentText('')
    showToast('Cảm ơn bạn đã đánh giá món ăn!')
  }

  // Get active table calls & orders
  // Only show orders belonging to the CURRENT guest session to prevent
  // new customers from seeing or rating orders from a previous party.
  const currentTableOrders = orders.filter(o => {
    if (o.tableNumber !== tableNumber) return false
    // If the table has a sessionId, only show orders with a matching sessionId.
    if (localSessionId) return o.sessionId === localSessionId
    // Fallback for tables that haven't had a session ID assigned yet
    return o.status !== 'completed'
  })


  return (
    <>
    {showWelcomeScreen ? (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg-base)', position: 'relative', overflow: 'hidden' }}>
        {/* Background Banner */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60vh', backgroundImage: `url('https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80')`, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, var(--color-bg-base) 100%)' }} />
        </div>

        {/* Content */}
        <div className="animate-fade-in-up" style={{ position: 'relative', zIndex: 1, marginTop: 'auto', padding: 'var(--spacing-xl) var(--spacing-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 'var(--spacing-lg)' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', marginBottom: 'var(--spacing-xs)', textShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>{restaurant.name}</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '1.1rem', fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>Bàn số {tableNumber}</p>
          </div>

          <div className="glass-card" style={{ width: '100%', padding: 'var(--spacing-xl) var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <h2 style={{ fontSize: '1.25rem' }}>Chào mừng quý khách! 👋</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Vui lòng nhập tên xưng hô để nhân viên phục vụ bạn chu đáo nhất.</p>
            
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (!customerName.trim()) {
                    showToast('Vui lòng nhập tên của bạn!')
                    return
                  }
                  localStorage.setItem(`customer_name_table_${tableNumber}`, customerName)
                  setShowWelcomeScreen(false)
                }
              }}
              style={{ width: '100%', padding: '16px', fontSize: '1.1rem', textAlign: 'center', borderRadius: 'var(--radius-md)', border: '2px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface)', fontWeight: 600, transition: 'var(--transition-fast)' }}
              autoFocus
            />

            <button 
              className="btn-primary btn-active-scale" 
              onClick={() => {
                if (!customerName.trim()) {
                  showToast('Vui lòng nhập tên của bạn!')
                  return
                }
                localStorage.setItem(`customer_name_table_${tableNumber}`, customerName)
                setShowWelcomeScreen(false)
              }}
              style={{ width: '100%', minHeight: '54px', fontSize: '1.1rem', fontWeight: 700, borderRadius: 'var(--radius-md)', marginTop: 'var(--spacing-sm)' }}
            >
              Bắt Đầu Gọi Món
            </button>
          </div>
        </div>

        {/* Welcome Screen Toast */}
        {toastMessage && (
          <div className="toast-container">
            <div className="toast">
              <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
              <span>{toastMessage}</span>
            </div>
          </div>
        )}
      </div>
    ) : (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg-base)', position: 'relative' }}>
      
      {/* Mobile Top Header */}
      <header className="banner-gradient" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--spacing-md)', borderRadius: '0 0 var(--radius-md) var(--radius-md)', boxShadow: 'var(--shadow-low)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 800, margin: 0, color: 'inherit' }}>{restaurant.name}</h1>
            <p style={{ fontSize: '0.75rem', opacity: 0.9, fontWeight: 600, margin: 0, color: 'inherit' }}>
              Bàn {tableNumber} • Trạng thái: {
                currentTableStatus?.status === 'billing' ? 'Chờ tính tiền' :
                currentTableStatus?.status === 'ordering' ? 'Đang phục vụ' : 'Bàn trống'
              }
            </p>
          </div>
        </div>
        
        {/* Support Buttons */}
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
          <button 
            className="btn-secondary btn-active-scale" 
            style={{ padding: '6px 12px', borderRadius: 'var(--radius-full)', minHeight: '36px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, boxShadow: 'var(--shadow-low)' }}
            onClick={handleCallStaff}
          >
            <Bell size={16} /> Gọi NV
          </button>
          <button 
            className="btn-secondary btn-active-scale" 
            style={{ padding: '6px 12px', borderRadius: 'var(--radius-full)', minHeight: '36px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, boxShadow: 'var(--shadow-low)' }}
            onClick={handleRequestBill}
          >
            <Receipt size={16} /> Tính tiền
          </button>
        </div>
      </header>

      {/* Tabs Menu / Status */}
      <nav style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface)' }}>
        <button 
          style={{ flex: 1, background: 'none', border: 'none', borderBottom: activeTab === 'menu' ? '3px solid var(--color-primary)' : 'none', color: activeTab === 'menu' ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: 700, height: '48px' }}
          onClick={() => setActiveTab('menu')}
        >
          Thực Đơn
        </button>
        <button 
          style={{ flex: 1, background: 'none', border: 'none', borderBottom: activeTab === 'status' ? '3px solid var(--color-primary)' : 'none', color: activeTab === 'status' ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: 700, height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-xs)' }}
          onClick={() => setActiveTab('status')}
        >
          Đơn Của Bạn
          {currentTableOrders.filter(o => o.status === 'pending').length > 0 && (
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-error)' }}></span>
          )}
        </button>
      </nav>

      {/* Main Content Area */}
      <main style={{ flex: 1, paddingBottom: '80px' }}>
        {activeTab === 'menu' ? (
          <>
            {/* Beautiful Hero Banner for Menu */}
            <div style={{ padding: 'var(--spacing-md) var(--spacing-md) 0 var(--spacing-md)', backgroundColor: 'var(--color-bg-surface)' }}>
              <div style={{ 
                height: '140px', 
                borderRadius: 'var(--radius-md)', 
                backgroundImage: `url('https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=80')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'flex-end',
                padding: 'var(--spacing-md)'
              }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)' }} />
                <h2 style={{ position: 'relative', zIndex: 1, color: 'white', fontSize: '1.2rem', margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Thực đơn hôm nay có gì ngon?</h2>
              </div>
            </div>

            {/* Ordering Instructions Banner */}
            <div style={{ padding: 'var(--spacing-md) var(--spacing-md) 0 var(--spacing-md)', backgroundColor: 'var(--color-bg-surface)' }}>
              <div className="card" style={{ 
                backgroundColor: 'oklch(97% 0.01 60)', 
                borderColor: 'var(--color-primary-light)', 
                padding: 'var(--spacing-md)', 
                gap: 'var(--spacing-xs)',
                borderLeft: '4px solid var(--color-primary)',
                transform: 'none'
              }}>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.2rem' }}>💡</span>
                  <strong style={{ fontSize: '0.875rem', color: 'var(--color-primary)' }}>Hướng dẫn đặt món:</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: '1.5', margin: 0 }}>
                  Chọn món bạn thích, thêm vào giỏ hàng và nhấn <strong>"Gửi Bếp"</strong>. Món ăn sẽ được phục vụ tận bàn!
                </p>
              </div>
            </div>

            {/* Category horizontal scroller */}
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', overflowX: 'auto', padding: 'var(--spacing-md) var(--spacing-md)', scrollbarWidth: 'none', backgroundColor: 'var(--color-bg-surface)' }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    borderRadius: 'var(--radius-full)',
                    whiteSpace: 'nowrap',
                    backgroundColor: activeCategory === cat ? 'var(--color-primary)' : 'var(--color-bg-base)',
                    color: activeCategory === cat ? 'var(--color-text-inverse)' : 'var(--color-text-main)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    minHeight: '38px',
                    transition: 'var(--transition-fast)'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Food Grid */}
            <div className="layout-container" style={{ padding: 'var(--spacing-md)' }}>
              <div className="grid-responsive">
                {filteredMenu.map((dish, index) => {
                  const staggerClass = `stagger-${Math.min(index + 1, 6)}`
                  return (
                  <article key={dish.id} className={`card animate-fade-in-up ${staggerClass}`} style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: 'none', boxShadow: 'var(--shadow-low)' }}>
                    <div className="card-image-wrapper" style={{ margin: 0, borderRadius: 0, height: '160px' }}>
                      <img src={dish.image} alt={dish.name} className="card-image" style={{ objectFit: 'cover', height: '100%', width: '100%' }} />
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 'var(--spacing-md)', gap: 'var(--spacing-xs)' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{dish.category}</span>
                      <h3 style={{ fontSize: '1.1rem', fontFamily: 'var(--font-body)', fontWeight: 800, color: 'var(--color-text-main)', lineHeight: 1.3 }}>{dish.name}</h3>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: 'var(--spacing-sm)' }}>
                        <p style={{ color: 'var(--color-primary)', fontWeight: 800, fontSize: '1.15rem' }}>
                          {dish.price.toLocaleString('vi-VN')} đ
                        </p>
                        
                        <button 
                          className="btn-primary btn-active-scale" 
                          style={{ minHeight: '36px', padding: '0 var(--spacing-md)', borderRadius: 'var(--radius-full)' }}
                          onClick={() => addToCart(dish.id)}
                        >
                          + Thêm
                        </button>
                      </div>
                    </div>
                  </article>
                  )
                })}
              </div>

              {filteredMenu.length === 0 && (
                <div style={{ textAlign: 'center', padding: 'var(--spacing-xxl) var(--spacing-md)', color: 'var(--color-text-muted)' }}>
                  <HelpCircle size={48} style={{ strokeWidth: 1.5, marginBottom: 'var(--spacing-sm)' }} />
                  <p>Danh mục này hiện chưa có món nào sẵn sàng.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Order Status Tracking tab */
          <div className="layout-container" style={{ padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>Lịch sử đặt món bàn {tableNumber}</h2>
            
            {/* Friendly reminder banner */}
            <div className="card" style={{ 
              backgroundColor: 'oklch(97% 0.01 60)', 
              borderColor: 'var(--color-primary-light)', 
              padding: 'var(--spacing-md)', 
              gap: 'var(--spacing-xs)',
              borderLeft: '4px solid var(--color-primary)',
              transform: 'none'
            }}>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                <span style={{ fontSize: '1.2rem' }}>💡</span>
                <strong style={{ fontSize: '0.875rem', color: 'var(--color-primary)' }}>Lưu ý nhỏ:</strong>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: '1.5', margin: 0 }}>
                Nếu vô tình đóng trang này, quý khách chỉ cần <strong>quét lại mã QR tại bàn</strong>. Hệ thống sẽ hiển thị lại mục <strong>"Đơn Của Bạn"</strong> để tiếp tục theo dõi tiến độ phục vụ và chấm điểm đánh giá chất lượng món ăn!
              </p>
            </div>

            {currentTableOrders.map(order => {
              const timeDiff = currentTime - order.timestamp;
              const isEditable = order.status === 'pending' && timeDiff < 120000;
              const timeRemaining = Math.max(0, Math.floor((120000 - timeDiff) / 1000));
              const m = Math.floor(timeRemaining / 60);
              const s = timeRemaining % 60;
              
              return (
              <div key={order.id} className="card" style={{ padding: 'var(--spacing-md)', gap: 'var(--spacing-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-sm)' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>#{order.id.slice(-6)}</span>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>{new Date(order.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  
                  {/* Status Badge */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    {order.status === 'pending' && <span className="badge badge-error">Đang chờ bếp</span>}
                    {order.status === 'served' && <span className="badge badge-info">Đã phục vụ</span>}
                    {order.status === 'completed' && <span className="badge badge-success">Đã hoàn thành</span>}
                    {isEditable && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-error)', fontWeight: 600 }}>Khóa sau {m}:{s < 10 ? `0${s}` : s}</span>
                    )}
                  </div>
                </div>

                {/* Items details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)', margin: 'var(--spacing-sm) 0' }}>
                  {order.items.map(item => {
                    const dish = menu.find(d => d.id === item.menuItemId)
                    return (
                      <div key={item.menuItemId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span>
                          <strong>{item.quantity}x</strong> {dish?.name || 'Món ăn'}
                          {item.notes && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Ghi chú: {item.notes}</span>}
                        </span>
                        <span style={{ color: 'var(--color-text-muted)' }}>{((dish?.price || 0) * item.quantity).toLocaleString('vi-VN')} đ</span>
                      </div>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-sm)', fontWeight: 700 }}>
                  <span style={{ fontSize: '0.9rem' }}>Tổng cộng:</span>
                  <span style={{ color: 'var(--color-primary)' }}>{order.total.toLocaleString('vi-VN')} đ</span>
                </div>

                {/* Edit Order button (2 minute window) */}
                {isEditable && (
                  <button 
                    className="btn-secondary" 
                    style={{ width: '100%', minHeight: '38px', padding: 'var(--spacing-xs) var(--spacing-sm)', marginTop: 'var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-xs)', fontSize: '0.875rem', color: 'var(--color-error)' }}
                    onClick={() => handleEditOrder(order)}
                  >
                    <Edit3 size={16} /> Hủy & Sửa lại món
                  </button>
                )}

                {/* Feedback section - Show button if order status is served or completed & hasn't been rated yet */}
                {order.status !== 'pending' && !order.rating && (
                  <button 
                    className="btn-secondary" 
                    style={{ width: '100%', minHeight: '38px', padding: 'var(--spacing-xs) var(--spacing-sm)', marginTop: 'var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-xs)', fontSize: '0.875rem' }}
                    onClick={() => {
                      setSelectedOrderToRate(order)
                      setShowRatingModal(true)
                    }}
                  >
                    <Star size={16} fill="var(--color-primary)" stroke="var(--color-primary)" /> Đánh giá dịch vụ
                  </button>
                )}

                {order.rating && (
                  <div style={{ marginTop: 'var(--spacing-sm)', padding: 'var(--spacing-sm)', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <Star key={idx} size={12} fill={idx < (order.rating || 0) ? 'var(--color-primary)' : 'transparent'} stroke="var(--color-primary)" />
                      ))}
                    </div>
                    {order.comment && <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>"{order.comment}"</p>}
                  </div>
                )}
              </div>
              )
            })}

            {currentTableOrders.length === 0 && (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-xxl) var(--spacing-md)', color: 'var(--color-text-muted)' }}>
                <CheckCircle size={48} style={{ strokeWidth: 1.5, color: 'var(--color-border)', marginBottom: 'var(--spacing-sm)' }} />
                <p>Bạn chưa đặt món nào. Quét thực đơn để chọn món ngay nhé!</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {cartItemsCount > 0 && activeTab === 'menu' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 'var(--z-sticky)', padding: 'var(--spacing-md)', background: 'linear-gradient(to top, oklch(100% 0.001 60 / 90%) 30%, oklch(100% 0.001 60 / 0%))', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
          <button 
            className="btn-primary btn-active-scale" 
            style={{ width: '100%', borderRadius: 'var(--radius-full)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-md) var(--spacing-lg)', boxShadow: 'var(--shadow-high)' }}
            onClick={() => setIsCartOpen(true)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
              <ShoppingBag size={20} />
              <span style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                Xem giỏ hàng (<span key={cartItemsCount} style={{ display: 'inline-block', animation: 'popIn 0.4s var(--ease-expo)' }}>{cartItemsCount}</span>)
              </span>
            </div>
            <span key={cartTotal} style={{ fontWeight: 800, display: 'inline-block', animation: 'popIn 0.4s var(--ease-expo)' }}>{cartTotal.toLocaleString('vi-VN')} đ</span>
          </button>
        </div>
      )}

      {/* Cart Drawer Modal */}
      {isCartOpen && (
        <div className="dialog-backdrop" onClick={() => setIsCartOpen(false)}>
          <div className="dialog-content" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-sm)' }}>
              <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700 }}>Giỏ hàng bàn {tableNumber}</h2>
              <button className="btn-ghost" style={{ border: 'none', background: 'none', padding: 'var(--spacing-xs)', minHeight: '40px', minWidth: '40px' }} onClick={() => setIsCartOpen(false)}>
                ✕
              </button>
            </header>

            {/* Cart Items list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-md) 0', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
              {Object.entries(cart).map(([itemId, cartInfo]) => {
                const dish = menu.find(d => d.id === itemId)
                if (!dish) return null

                return (
                  <div key={itemId} style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center', borderBottom: '1px solid var(--color-bg-elevated)', paddingBottom: 'var(--spacing-md)' }}>
                    <img src={dish.image} alt={dish.name} style={{ width: '60px', height: '60px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{dish.name}</h4>
                      <p style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.9rem' }}>{dish.price.toLocaleString('vi-VN')} đ</p>
                      
                      {/* Item Ghi chú */}
                      <input 
                        type="text" 
                        placeholder="Ghi chú thêm (cay, ít đá...)" 
                        className="form-control"
                        style={{ height: '32px', minHeight: '32px', padding: '4px 8px', fontSize: '0.8rem', width: '100%', marginTop: 'var(--spacing-xs)' }}
                        value={cartInfo.notes}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const val = e.target.value
                          setCart((prev: typeof cart) => ({
                            ...prev,
                            [itemId]: { ...prev[itemId], notes: val }
                          }))
                        }}
                      />
                    </div>
                    
                    {/* Controls quantity */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--spacing-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '2px' }}>
                        <button className="star-btn" style={{ minWidth: '28px', minHeight: '28px', padding: 0, background: 'none' }} onClick={() => updateCartQuantity(itemId, -1)}>
                          <Minus size={14} />
                        </button>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{cartInfo.quantity}</span>
                        <button className="star-btn" style={{ minWidth: '28px', minHeight: '28px', padding: 0, background: 'none' }} onClick={() => updateCartQuantity(itemId, 1)}>
                          <Plus size={14} />
                        </button>
                      </div>
                      <button className="star-btn" style={{ minWidth: '28px', minHeight: '28px', padding: 0, color: 'var(--color-text-muted)' }} onClick={() => updateCartQuantity(itemId, -cartInfo.quantity)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Payment selection & placing order */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
              
              {/* Customer Name input */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700 }}>Tên người gọi món (để nhân viên dễ tìm khi thanh toán):</label>
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Nhập tên của bạn (Ví dụ: Anh Tuấn, Chị Lan...)" 
                  value={customerName}
                  onChange={(e) => handleCustomerNameChange(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                <span className="form-label">Chọn hình thức thanh toán:</span>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                  <button 
                    className="btn-ghost" 
                    style={{ flex: 1, minHeight: '40px', backgroundColor: paymentMethod === 'cash' ? 'var(--color-primary-light)' : 'transparent', borderColor: paymentMethod === 'cash' ? 'var(--color-primary)' : 'var(--color-border)', color: paymentMethod === 'cash' ? 'var(--color-primary)' : 'var(--color-text-main)', fontSize: '0.85rem' }}
                    onClick={() => setPaymentMethod('cash')}
                  >
                    Tiền mặt
                  </button>
                  <button 
                    className="btn-ghost" 
                    style={{ flex: 1, minHeight: '40px', backgroundColor: paymentMethod === 'card' ? 'var(--color-primary-light)' : 'transparent', borderColor: paymentMethod === 'card' ? 'var(--color-primary)' : 'var(--color-border)', color: paymentMethod === 'card' ? 'var(--color-primary)' : 'var(--color-text-main)', fontSize: '0.85rem' }}
                    onClick={() => setPaymentMethod('card')}
                  >
                    Quẹt thẻ
                  </button>
                  <button 
                    className="btn-ghost" 
                    style={{ flex: 1, minHeight: '40px', backgroundColor: paymentMethod === 'mobile' ? 'var(--color-primary-light)' : 'transparent', borderColor: paymentMethod === 'mobile' ? 'var(--color-primary)' : 'var(--color-border)', color: paymentMethod === 'mobile' ? 'var(--color-primary)' : 'var(--color-text-main)', fontSize: '0.85rem' }}
                    onClick={() => setPaymentMethod('mobile')}
                  >
                    Chuyển khoản / QR
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem' }}>
                <span>Tổng cộng:</span>
                <span style={{ color: 'var(--color-primary)' }}>{cartTotal.toLocaleString('vi-VN')} đ</span>
              </div>

              <button className="btn-primary" style={{ width: '100%' }} onClick={handlePlaceOrder}>
                Gửi yêu cầu Bếp đặt món
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Feedback Star Modal */}
      {showRatingModal && selectedOrderToRate && (
        <div className="dialog-backdrop" onClick={() => setShowRatingModal(false)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
              <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700 }}>Đánh giá bữa ăn</h2>
              <button className="btn-ghost" style={{ border: 'none', background: 'none', padding: 'var(--spacing-xs)', minHeight: '40px', minWidth: '40px' }} onClick={() => setShowRatingModal(false)}>
                ✕
              </button>
            </header>

            <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)' }}>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-md)' }}>Hãy chấm điểm và cho chúng tôi biết cảm nhận của bạn nhé!</p>
              
              {/* Stars Score Selector */}
              <div className="rating-stars">
                {Array.from({ length: 5 }).map((_, idx) => {
                  const score = idx + 1
                  return (
                    <button key={score} className="star-btn" onClick={() => setRatingScore(score)}>
                      <Star size={36} className={`star-icon ${score <= ratingScore ? 'active' : ''}`} />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Nhận xét của bạn (không bắt buộc):</label>
              <textarea 
                className="form-control" 
                rows={3} 
                style={{ resize: 'none', fontFamily: 'var(--font-body)', padding: 'var(--spacing-sm)' }}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
            </div>

            <button className="btn-primary" style={{ width: '100%', marginTop: 'var(--spacing-md)' }} onClick={handleSubmitRating}>
              Gửi Đánh Giá
            </button>
          </div>
        </div>
      )}

      {/* Order Success Modal with QR Re-scan Reminder */}
      {showSuccessModal && (
        <div className="dialog-backdrop" onClick={() => setShowSuccessModal(false)}>
          <div className="dialog-content" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', gap: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'oklch(93% 0.04 140)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--spacing-sm)' }}>
              <CheckCircle size={36} strokeWidth={2.5} />
            </div>
            
            <h2 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', fontWeight: 800 }}>Gửi đơn thành công!</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
              Bếp nhà hàng đã tiếp nhận món ăn của bạn và đang tiến hành chế biến.
            </p>

            <div style={{ backgroundColor: 'oklch(97% 0.01 60)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--spacing-md)', margin: 'var(--spacing-sm) 0', textAlign: 'left' }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                💡 Mẹo nhỏ dành cho bạn:
              </strong>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-main)', margin: 0, lineHeight: '1.5' }}>
                Nếu vô tình đóng trình duyệt, quý khách chỉ cần <strong>quét lại mã QR tại bàn</strong>. Hệ thống sẽ tự động khôi phục và hiển thị lại phần <strong>"Đơn Của Bạn"</strong> để bạn theo dõi tiến độ phục vụ và chấm điểm đánh giá món ăn sau khi dùng xong!
              </p>
            </div>

            <button className="btn-primary" style={{ width: '100%', marginTop: 'var(--spacing-sm)' }} onClick={() => setShowSuccessModal(false)}>
              Đồng ý và Theo dõi đơn
            </button>
          </div>
        </div>
      )}

      {/* QR Payment Modal */}
      {showQrPaymentModal && (
        <div className="dialog-backdrop" style={{ zIndex: 'var(--z-modal)' }}>
          <div className="dialog-content" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.3rem', fontFamily: 'var(--font-display)', fontWeight: 800, marginBottom: 'var(--spacing-xs)' }}>Thanh toán đơn hàng</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: '1.6', marginBottom: 'var(--spacing-md)' }}>
              Đơn hàng của bạn đã được gửi tới bếp. Vui lòng quét mã QR dưới đây để thanh toán số tiền:
            </p>
            
            <div style={{ fontSize: '1.5rem', color: 'var(--color-primary)', fontWeight: 800, marginBottom: 'var(--spacing-md)' }}>
              {qrPaymentTotal.toLocaleString('vi-VN')} đ
            </div>

            <div style={{ padding: 'var(--spacing-sm)', border: '2px solid var(--color-primary)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg-base)', marginBottom: 'var(--spacing-md)' }}>
              <img src={restaurant.paymentQrCode} alt="Payment QR Code" style={{ width: '200px', height: '200px', objectFit: 'contain' }} />
            </div>

            <button 
              className="btn-primary" 
              style={{ width: '100%', minHeight: '44px' }} 
              onClick={() => {
                if (qrPaymentOrderId) {
                  const updatedOrders = orders.map(o => {
                    if (o.id === qrPaymentOrderId) {
                      return { ...o, paymentReported: true }
                    }
                    return o
                  })
                  updateGlobalState({ orders: updatedOrders }, 'REPORT_QR_PAYMENT')
                }
                setShowQrPaymentModal(false)
                setShowSuccessModal(true)
              }}
            >
              Đã thanh toán / Hoàn tất
            </button>
          </div>
        </div>
      )}

      {showTakeoverModal && (
        <div className="dialog-backdrop" style={{ zIndex: 'var(--z-modal)' }}>
          <div className="dialog-content" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '3rem', marginBottom: 'var(--spacing-sm)' }}>👋</span>
            <h2 style={{ fontSize: '1.3rem', fontFamily: 'var(--font-display)', fontWeight: 800, marginBottom: 'var(--spacing-xs)' }}>Bắt đầu gọi món mới?</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: '1.6', marginBottom: 'var(--spacing-md)' }}>
              Hệ thống ghi nhận Bàn {tableNumber} đang có đơn phục vụ hoặc hóa đơn từ lượt khách trước.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', width: '100%' }}>
              <button className="btn-primary" style={{ width: '100%' }} onClick={handleStartNewSession}>
                Tạo Lượt Mới (Khách Mới)
              </button>
              <button className="btn-ghost" style={{ width: '100%', minHeight: '44px' }} onClick={handleJoinExistingSession}>
                Xem Đơn Hiện Tại (Đi Chung Nhóm)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert Popups */}
      {toastMessage && (
        <div className="toast-container">
          <div className="toast">
            <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
    )}
    </>
  )
}
