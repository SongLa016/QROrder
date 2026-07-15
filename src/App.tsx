import { useState, useEffect } from 'react'
import CustomerPortal from './components/CustomerPortal.tsx'
import ManagerDashboard from './components/ManagerDashboard.tsx'
import { playOrderPing, playWaiterCallPing, playBillRequestPing } from './utils/soundHelper.ts'
import { Layers, QrCode } from 'lucide-react'

// Types & Interfaces
import type { MenuItem, OrderItem, Order, Table, RestaurantInfo } from './types.ts'
export type { MenuItem, OrderItem, Order, Table, RestaurantInfo }


// Initial Seed Data
const DEFAULT_MENU: MenuItem[] = [
  {
    id: 'food-1',
    name: 'Phở Bò Tái Lăn',
    price: 65000,
    image: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500&auto=format&fit=crop&q=80',
    category: 'Món chính',
    available: true
  },
  {
    id: 'food-2',
    name: 'Bún Chả Hà Nội',
    price: 60000,
    image: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=500&auto=format&fit=crop&q=80',
    category: 'Món chính',
    available: true
  },
  {
    id: 'food-3',
    name: 'Nem Rán Giòn',
    price: 45000,
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80',
    category: 'Khai vị',
    available: true
  },
  {
    id: 'food-4',
    name: 'Cà Phê Muối Trứng',
    price: 35000,
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=80',
    category: 'Đồ uống',
    available: true
  },
  {
    id: 'food-5',
    name: 'Trà Đào Hồng Sả',
    price: 30000,
    image: 'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=500&auto=format&fit=crop&q=80',
    category: 'Đồ uống',
    available: true
  },
  {
    id: 'food-6',
    name: 'Bánh Mì Đặc Biệt',
    price: 35000,
    image: 'https://images.unsplash.com/photo-1600454021970-351feb2a5149?w=500&auto=format&fit=crop&q=80',
    category: 'Khai vị',
    available: true
  }
]

const DEFAULT_RESTAURANT: RestaurantInfo = {
  name: 'Tên quán của bạn',
  tagline: 'Khẩu hiệu kinh doanh',
  logo: '🍜',
  address: '123 Đường Nguyễn Huệ, Quận 1, TP. HCM',
  onboarded: false
}

const DEFAULT_TABLES: Table[] = Array.from({ length: 10 }, (_, i) => ({
  number: i + 1,
  status: 'empty'
}))

const DEFAULT_ORDERS: Order[] = [
  {
    id: 'order-707162',
    tableNumber: 9,
    items: [
      { menuItemId: 'food-4', quantity: 1, notes: 'Đậm vị' },
      { menuItemId: 'food-5', quantity: 1, notes: '' }
    ],
    total: 65000,
    status: 'pending',
    paymentMethod: 'cash',
    timestamp: (() => {
      const d = new Date()
      d.setHours(23, 31, 0, 0)
      return d.getTime()
    })(),
    customerName: 'La đẹp trai'
  }
]



export default function App() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstallable, setIsInstallable] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setIsInstallable(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      deferredPrompt.userChoice.then(() => {
        setDeferredPrompt(null)
        setIsInstallable(false)
      })
    }
  }

  // Global States loaded from LocalStorage or seed data
  const [restaurant, setRestaurant] = useState<RestaurantInfo>(() => {
    const data = localStorage.getItem('qr_restaurant')
    return data ? JSON.parse(data) : DEFAULT_RESTAURANT
  })

  const [menu, setMenu] = useState<MenuItem[]>(() => {
    const data = localStorage.getItem('qr_menu')
    return data ? JSON.parse(data) : DEFAULT_MENU
  })

  const [tables, setTables] = useState<Table[]>(() => {
    const data = localStorage.getItem('qr_tables')
    return data ? JSON.parse(data) : DEFAULT_TABLES
  })

  const [orders, setOrders] = useState<Order[]>(() => {
    const data = localStorage.getItem('qr_orders')
    return data ? JSON.parse(data) : DEFAULT_ORDERS
  })


  // Load state from local storage as quick default fallback
  useEffect(() => {
    const isGitHubPages = window.location.hostname.includes('github.io')
    if (isGitHubPages) {
      console.log('QROrder: Running on GitHub Pages static demo (Offline LocalStorage mode active).')
      return
    }

    let eventSource: EventSource | null = null

    // 1. Fetch initial synchronized state from backend API
    fetch('/api/state')
      .then(res => res.json())
      .then(data => {
        if (data.menu && data.menu.length > 0) {
          if (data.restaurant) {
            setRestaurant(data.restaurant)
            localStorage.setItem('qr_restaurant', JSON.stringify(data.restaurant))
          }
          if (data.menu) {
            setMenu(data.menu)
            localStorage.setItem('qr_menu', JSON.stringify(data.menu))
          }
          if (data.tables) {
            setTables(data.tables)
            localStorage.setItem('qr_tables', JSON.stringify(data.tables))
          }
          if (data.orders) {
            setOrders(data.orders)
            localStorage.setItem('qr_orders', JSON.stringify(data.orders))
          }
        } else {
          // Backend is empty (fresh server start), seed the default state to the server!
          updateGlobalState({
            restaurant,
            menu,
            tables,
            orders
          }, 'SEED')
        }

        // 2. Set up SSE connection ONLY if backend is active
        eventSource = new EventSource('/api/events')
        
        eventSource.addEventListener('state-updated', (event: any) => {
          try {
            const { state, actionContext } = JSON.parse(event.data)
            const isAdminMode = new URLSearchParams(window.location.search).get('role') === 'admin'
            
            // Play distinct chimes on the manager dashboard
            if (isAdminMode) {
              if (actionContext === 'CALL_STAFF') {
                playWaiterCallPing()
              } else if (actionContext === 'REQUEST_BILL') {
                playBillRequestPing()
              }
            }

            if (state.restaurant) {
              setRestaurant(state.restaurant)
              localStorage.setItem('qr_restaurant', JSON.stringify(state.restaurant))
            }
            if (state.menu) {
              setMenu(state.menu)
              localStorage.setItem('qr_menu', JSON.stringify(state.menu))
            }
            if (state.tables) {
              setTables(state.tables)
              localStorage.setItem('qr_tables', JSON.stringify(state.tables))
            }
            if (state.orders) {
              setOrders((currentOrders) => {
                // Trigger audio ping alert on dashboard if a customer placed a new order
                if (actionContext === 'NEW_ORDER' && state.orders.length > currentOrders.length && isAdminMode) {
                  playOrderPing()
                }
                return state.orders
              })
              localStorage.setItem('qr_orders', JSON.stringify(state.orders))
            }
          } catch (err) {
            console.error('Error parsing SSE sync payload:', err)
          }
        })
      })
      .catch(() => {
        console.warn('QROrder: Realtime sync server not detected. Operating in LocalStorage-only mode.')
      })

    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [])

  // Helper to mutate state, update localStorage, and broadcast to all devices via Vite API
  const updateGlobalState = (
    updater: {
      restaurant?: RestaurantInfo
      menu?: MenuItem[]
      tables?: Table[]
      orders?: Order[]
    },
    actionContext?: string
  ) => {
    let modifiedTableNumbers: number[] = []

    if (updater.tables) {
      // Find tables that actually changed
      tables.forEach((t, i) => {
        const newT = updater.tables![i]
        if (newT && (newT.status !== t.status || newT.activeCall !== t.activeCall || newT.sessionId !== t.sessionId || newT.label !== t.label)) {
          modifiedTableNumbers.push(newT.number)
        }
      })
      // If table list structure changed (add/delete), mark all as modified
      if (updater.tables.length !== tables.length) {
        modifiedTableNumbers = updater.tables.map(t => t.number)
      }
    }

    // Update local React states and browser caches
    if (updater.restaurant) {
      localStorage.setItem('qr_restaurant', JSON.stringify(updater.restaurant))
      setRestaurant(updater.restaurant)
    }
    if (updater.menu) {
      localStorage.setItem('qr_menu', JSON.stringify(updater.menu))
      setMenu(updater.menu)
    }
    if (updater.tables) {
      localStorage.setItem('qr_tables', JSON.stringify(updater.tables))
      setTables(updater.tables)
    }
    if (updater.orders) {
      localStorage.setItem('qr_orders', JSON.stringify(updater.orders))
      setOrders(updater.orders)
    }

    // Publish update to Vite backend API
    fetch('/api/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...updater, modifiedTableNumbers, actionContext })
    }).catch(err => console.error('Error broadcasting update to server:', err))
  }

  // Routing Logic: detect parameters from URL search
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search))

  useEffect(() => {
    const handlePopState = () => {
      setParams(new URLSearchParams(window.location.search))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateTo = (queryParams: string) => {
    const newUrl = queryParams ? `${window.location.pathname}?${queryParams}` : window.location.pathname
    window.history.pushState({}, '', newUrl)
    setParams(new URLSearchParams(queryParams))
  }

  const tableParam = params.get('table')
  const roleParam = params.get('role')

  // Render correct view based on URL route
  if (roleParam === 'admin') {
    return (
      <ManagerDashboard
        restaurant={restaurant}
        menu={menu}
        tables={tables}
        orders={orders}
        updateGlobalState={updateGlobalState}
        navigateToHome={() => navigateTo('')}
      />
    )
  }

  if (tableParam) {
    const tableNumber = parseInt(tableParam, 10)
    const tableExists = tables.some(t => t.number === tableNumber)

    if (isNaN(tableNumber) || !tableExists) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', textAlign: 'center' }}>
          <span style={{ fontSize: '4rem' }}>⚠️</span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>Bàn không tồn tại</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', maxWidth: '400px' }}>
            Mã quét QR hoặc số bàn trên đường dẫn không hợp lệ. Vui lòng quét lại mã QR tại bàn của bạn hoặc quay về trang chủ.
          </p>
          <button className="btn-primary" style={{ minHeight: '44px' }} onClick={() => navigateTo('')}>
            Quay về Trang Chủ
          </button>
        </div>
      )
    }

    return (
      <CustomerPortal
        tableNumber={tableNumber}
        restaurant={restaurant}
        menu={menu}
        orders={orders}
        tables={tables}
        updateGlobalState={updateGlobalState}
        navigateToHome={() => navigateTo('')}
      />
    )
  }

  // Landing Page (Choose role if access path is root)
  return (
    <div className="layout-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 'var(--spacing-xl)', padding: 'var(--spacing-xl) var(--spacing-md)' }}>
      <header style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: '4rem', display: 'block', marginBottom: 'var(--spacing-sm)' }}>
          {restaurant.logo.startsWith('data:') ? (
            <img 
              src={restaurant.logo} 
              alt="Logo" 
              style={{ width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--color-primary)', margin: '0 auto' }}
            />
          ) : (
            restaurant.logo
          )}
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--spacing-xs)' }}>{restaurant.name}</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '1.1rem', margin: 0 }}>{restaurant.tagline}</p>
        {restaurant.address && <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '6px', fontWeight: 600 }}>📍 {restaurant.address}</p>}

        {isInstallable && (
          <button 
            className="btn-primary" 
            style={{ marginTop: 'var(--spacing-md)', fontSize: '1rem', padding: '10px 24px', borderRadius: '100px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, var(--color-primary), #f43f5e)', border: 'none', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)' }}
            onClick={handleInstallClick}
          >
            <span style={{ fontSize: '1.2rem' }}>⬇️</span> Tải Ứng Dụng (App)
          </button>
        )}
      </header>

      <main className="grid-responsive" style={{ maxWidth: '700px', width: '100%' }}>
        {/* Customer Panel Option */}
        <section className="card" style={{ gap: 'var(--spacing-md)', cursor: 'pointer', border: '2px solid transparent' }} onClick={() => navigateTo('table=1')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            <div style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              <QrCode size={32} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700 }}>Khách Hàng</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Quét mã QR tại bàn để xem thực đơn & đặt món</p>
            </div>
          </div>
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
            <label className="form-label" style={{ marginBottom: 'var(--spacing-xs)', display: 'block' }}>Chọn bàn test nhanh:</label>
            <select 
              className="form-control" 
              style={{ width: '100%' }}
              onClick={(e) => e.stopPropagation()} 
              onChange={(e) => navigateTo(`table=${e.target.value}`)}
              defaultValue="1"
            >
              {tables.map(t => (
                <option key={t.number} value={t.number}>Bàn số {t.number}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Manager Panel Option */}
        <section className="card" style={{ gap: 'var(--spacing-md)', cursor: 'pointer' }} onClick={() => navigateTo('role=admin')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            <div style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-sm)', backgroundColor: 'oklch(94% 0.03 140)', color: 'var(--color-success)' }}>
              <Layers size={32} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700 }}>Quản Lý & Vận Hành</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Theo dõi đơn hàng realtime, thống kê doanh số & xuất mã QR</p>
            </div>
          </div>
          <button className="btn-primary" style={{ width: '100%', marginTop: 'auto' }} onClick={() => navigateTo('role=admin')}>
            Vào Dashboard
          </button>
        </section>
      </main>

      <footer style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: 'var(--spacing-xl)' }}>
        © 2026 {restaurant.name} • Trải nghiệm đặt món không chạm
      </footer>
    </div>
  )
}
