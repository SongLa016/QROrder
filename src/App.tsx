import { useState, useEffect } from 'react'
import CustomerPortal from './components/CustomerPortal.tsx'
import ManagerDashboard from './components/ManagerDashboard.tsx'
import AdminLogin from './components/AdminLogin.tsx'
import SuperAdminDashboard from './components/SuperAdminDashboard.tsx'
import { playOrderPing, playWaiterCallPing, playBillRequestPing } from './utils/soundHelper.ts'
import { Layers, QrCode } from 'lucide-react'

// Types & Interfaces
import type { MenuItem, OrderItem, Order, Table, RestaurantInfo } from './types.ts'
export type { MenuItem, OrderItem, Order, Table, RestaurantInfo }

// Initial Seed Data
const DEFAULT_MENU: MenuItem[] = [
  { id: 'food-1', name: 'Phở Bò Tái Lăn', price: 65000, image: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500&auto=format&fit=crop&q=80', category: 'Món chính', available: true },
  { id: 'food-2', name: 'Bún Chả Hà Nội', price: 60000, image: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=500&auto=format&fit=crop&q=80', category: 'Món chính', available: true },
  { id: 'food-3', name: 'Nem Rán Giòn', price: 45000, image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80', category: 'Khai vị', available: true },
  { id: 'food-4', name: 'Cà Phê Muối Trứng', price: 35000, image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=80', category: 'Đồ uống', available: true },
  { id: 'food-5', name: 'Trà Đào Hồng Sả', price: 30000, image: 'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=500&auto=format&fit=crop&q=80', category: 'Đồ uống', available: true },
  { id: 'food-6', name: 'Bánh Mì Đặc Biệt', price: 35000, image: 'https://tse4.mm.bing.net/th/id/OIP.MzrUVQRmy9lCS6MCQVYNcgHaE7?r=0&rs=1&pid=ImgDetMain&o=7&rm=3', category: 'Khai vị', available: true }
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

const DEFAULT_ORDERS: Order[] = []

export default function App() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [landingMode, setLandingMode] = useState<'login' | 'register'>('login')

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

  // Routing Logic
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search))

  useEffect(() => {
    const handlePopState = () => {
      setParams(new URLSearchParams(window.location.search))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateTo = (queryParams: string) => {
    const currentTenantId = params.get('r')
    const finalParams = new URLSearchParams(queryParams)
    if (currentTenantId && !finalParams.has('r')) {
      finalParams.set('r', currentTenantId)
    }
    const newUrl = `${window.location.pathname}?${finalParams.toString()}`
    window.history.pushState({}, '', newUrl)
    setParams(finalParams)
  }

  const tenantId = params.get('r')
  const tableParam = params.get('table')
  const roleParam = params.get('role')

  // Global States
  const [restaurant, setRestaurant] = useState<RestaurantInfo>(() => {
    const data = localStorage.getItem(`qr_restaurant_${tenantId}`)
    return data ? JSON.parse(data) : DEFAULT_RESTAURANT
  })

  const [menu, setMenu] = useState<MenuItem[]>(() => {
    const data = localStorage.getItem(`qr_menu_${tenantId}`)
    return data ? JSON.parse(data) : DEFAULT_MENU
  })

  const [tables, setTables] = useState<Table[]>(() => {
    const data = localStorage.getItem(`qr_tables_${tenantId}`)
    return data ? JSON.parse(data) : DEFAULT_TABLES
  })

  const [orders, setOrders] = useState<Order[]>(() => {
    const data = localStorage.getItem(`qr_orders_${tenantId}`)
    return data ? JSON.parse(data) : DEFAULT_ORDERS
  })

  // Synchronize state across devices
  useEffect(() => {
    if (!tenantId) return 
    
    setIsBlocked(false)

    fetch(`/api/state?r=${tenantId}`)
      .then(res => {
        if (res.status === 403) {
          setIsBlocked(true)
          throw new Error('Tenant is blocked')
        }
        return res.json()
      })
      .then(data => {
        if (data && data.restaurant) {
          setRestaurant(data.restaurant)
          setMenu(data.menu || [])
          setTables(data.tables || [])
          setOrders(data.orders || [])
        }
      })
      .catch((err) => {
        if (err.message !== 'Tenant is blocked') {
          console.warn('QROrder: Realtime sync server error. Operating in LocalStorage-only mode.')
        }
      })

    const eventSource = new EventSource(`/api/events?r=${tenantId}`)
    eventSource.onmessage = (event) => {
      try {
        const { state, actionContext } = JSON.parse(event.data)
        
        if (actionContext === 'TENANT_STATUS_CHANGED') {
          window.location.reload()
          return
        }

        const isAdminMode = new URLSearchParams(window.location.search).get('role') === 'admin'
        
        if (isAdminMode) {
          if (actionContext === 'CALL_STAFF') playWaiterCallPing()
          else if (actionContext === 'REQUEST_BILL') playBillRequestPing()
        }

        if (state) {
          if (state.restaurant) setRestaurant(state.restaurant)
          if (state.menu) setMenu(state.menu)
          if (state.tables) setTables(state.tables)
          if (state.orders) {
             if (actionContext === 'NEW_ORDER' && isAdminMode) playOrderPing()
             setOrders(state.orders)
          }
        }
      } catch (e) {
        console.error('Error parsing SSE data', e)
      }
    }
    
    eventSource.onerror = (err) => {
      // If 403, SSE usually fails to connect
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [tenantId])

  // Update LocalStorage whenever states change
  useEffect(() => {
    if (!tenantId) return
    localStorage.setItem(`qr_restaurant_${tenantId}`, JSON.stringify(restaurant))
  }, [restaurant, tenantId])
  useEffect(() => {
    if (!tenantId) return
    localStorage.setItem(`qr_menu_${tenantId}`, JSON.stringify(menu))
  }, [menu, tenantId])
  useEffect(() => {
    if (!tenantId) return
    localStorage.setItem(`qr_tables_${tenantId}`, JSON.stringify(tables))
  }, [tables, tenantId])
  useEffect(() => {
    if (!tenantId) return
    localStorage.setItem(`qr_orders_${tenantId}`, JSON.stringify(orders))
  }, [orders, tenantId])

  const updateGlobalState = (
    updater: { restaurant?: RestaurantInfo, menu?: MenuItem[], tables?: Table[], orders?: Order[] },
    actionContext?: string
  ) => {
    let modifiedTableNumbers: number[] = []
    if (updater.tables) {
       tables.forEach((t, i) => {
        const newT = updater.tables![i]
        if (newT && (newT.status !== t.status || newT.activeCall !== t.activeCall)) modifiedTableNumbers.push(newT.number)
      })
    }

    if (updater.restaurant) setRestaurant(updater.restaurant)
    if (updater.menu) setMenu(updater.menu)
    if (updater.tables) setTables(updater.tables)
    if (updater.orders) setOrders(updater.orders)

    fetch(`/api/state?r=${tenantId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...updater, modifiedTableNumbers, actionContext })
    }).catch(err => console.error('Error broadcasting update to server:', err))
  }

  // SUPER ADMIN ROUTE
  if (roleParam === 'superadmin') {
    return <SuperAdminDashboard navigateToHome={() => {
      window.history.pushState({}, '', window.location.pathname)
      setParams(new URLSearchParams())
    }} />
  }

  // BLOCKED STATE (For both Customer & Admin)
  if (isBlocked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', padding: 'var(--spacing-md)' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: 'var(--spacing-xl)', borderColor: 'var(--color-danger)', borderWidth: '2px' }}>
          <div style={{ fontSize: '4rem', marginBottom: 'var(--spacing-md)' }}>🔒</div>
          <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--spacing-xs)', color: 'var(--color-danger)' }}>Quán Đã Bị Khóa</h1>
          <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>Mã quán này hiện đang bị tạm khóa do hết hạn dịch vụ. Vui lòng liên hệ nhà cung cấp phần mềm để gia hạn và mở khóa.</p>
          <button className="btn-outline" style={{ marginTop: 'var(--spacing-lg)' }} onClick={() => window.location.href = '/'}>Quay lại Trang Chủ</button>
        </div>
      </div>
    )
  }

  // SAAS LANDING PAGE
  if (!tenantId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', padding: 'var(--spacing-md)' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: 'var(--spacing-xl)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>🍽️</div>
          <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--spacing-xs)' }}>TapOrder SaaS</h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-lg)' }}>Nền tảng Quản lý gọi món bằng mã QR.</p>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--spacing-lg)', background: 'var(--color-bg)', padding: '4px', borderRadius: 'var(--radius-sm)' }}>
            <button 
              style={{ flex: 1, padding: '8px', border: 'none', background: landingMode === 'login' ? 'var(--color-surface)' : 'transparent', borderRadius: 'var(--radius-xs)', fontWeight: landingMode === 'login' ? 700 : 500, boxShadow: landingMode === 'login' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'var(--transition-fast)' }}
              onClick={() => setLandingMode('login')}
            >
              Đăng Nhập
            </button>
            <button 
              style={{ flex: 1, padding: '8px', border: 'none', background: landingMode === 'register' ? 'var(--color-surface)' : 'transparent', borderRadius: 'var(--radius-xs)', fontWeight: landingMode === 'register' ? 700 : 500, boxShadow: landingMode === 'register' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'var(--transition-fast)' }}
              onClick={() => setLandingMode('register')}
            >
              Tạo Quán Mới
            </button>
          </div>

          {landingMode === 'login' ? (
             <form onSubmit={(e) => {
              e.preventDefault()
              const r = (e.target as any).r.value.trim()
              const pwd = (e.target as any).pwd.value.trim()
              if (r) {
                // To support both direct login to admin vs just navigating to the tenant
                // We will navigate to role=admin and the AdminLogin component will catch it if pwd doesn't match
                // We can't pre-auth easily without an API, so we just set url and let the component handle it.
                // Actually, let's just go to ?r=...&role=admin and let it prompt for password if we don't know it here.
                window.location.href = `/?r=${r}&role=admin`
              }
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', textAlign: 'left' }}>
                <div>
                  <label className="form-label">Mã Quán:</label>
                  <input type="text" name="r" className="form-control" placeholder="Ví dụ: quan-pho-a" required />
                </div>
                <button type="submit" className="btn-primary" style={{ minHeight: '44px' }}>Truy cập Quản lý</button>
              </div>
            </form>
          ) : (
            <form onSubmit={(e) => {
              e.preventDefault()
              const r = (e.target as any).r.value.trim()
              const pwd = (e.target as any).pwd.value.trim()
              if (r && pwd) {
                // Initialize default restaurant with password
                const newRestaurant = { ...DEFAULT_RESTAURANT, password: pwd }
                localStorage.setItem(`qr_restaurant_${r}`, JSON.stringify(newRestaurant))
                window.location.href = `/?r=${r}&role=admin`
              }
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', textAlign: 'left' }}>
                <div>
                  <label className="form-label">Tạo Mã Quán:</label>
                  <input type="text" name="r" className="form-control" placeholder="Nhập mã viết liền không dấu..." required />
                </div>
                <div>
                  <label className="form-label">Mật khẩu Quản lý:</label>
                  <input type="password" name="pwd" className="form-control" placeholder="Nhập mật khẩu..." required />
                </div>
                <button type="submit" className="btn-primary" style={{ minHeight: '44px' }}>Khởi tạo Quán</button>
              </div>
            </form>
          )}
        </div>
      </div>
    )
  }

  // Render correct view based on URL route
  if (roleParam === 'admin') {
    if (restaurant.password && !isAdminAuthenticated) {
      return (
        <AdminLogin 
          restaurantName={restaurant.name}
          onSubmit={(pwd) => {
            if (pwd === restaurant.password) {
              setIsAdminAuthenticated(true)
            } else {
              alert('Mật khẩu không chính xác!')
            }
          }} 
          navigateToHome={() => navigateTo('r=' + tenantId)} 
        />
      )
    }

    return (
      <ManagerDashboard
        restaurant={restaurant}
        menu={menu}
        tables={tables}
        orders={orders}
        updateGlobalState={updateGlobalState}
        navigateToHome={() => navigateTo('r=' + tenantId)}
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
          <button className="btn-primary" style={{ minHeight: '44px' }} onClick={() => navigateTo('r=' + tenantId)}>
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
        navigateToHome={() => navigateTo('r=' + tenantId)}
      />
    )
  }

  // Tenant Landing Page (Customer Entry)
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
        <section className="card" style={{ gap: 'var(--spacing-md)', cursor: 'pointer', border: '2px solid transparent' }} onClick={() => navigateTo(`r=${tenantId}&table=1`)}>
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
              onChange={(e) => navigateTo(`r=${tenantId}&table=${e.target.value}`)}
              defaultValue="1"
            >
              {tables.map(t => (
                <option key={t.number} value={t.number}>Bàn số {t.number}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Manager Panel Option */}
        <section className="card" style={{ gap: 'var(--spacing-md)', cursor: 'pointer' }} onClick={() => navigateTo(`r=${tenantId}&role=admin`)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            <div style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-sm)', backgroundColor: 'oklch(94% 0.03 140)', color: 'var(--color-success)' }}>
              <Layers size={32} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-body)', fontWeight: 700 }}>Quản Lý & Vận Hành</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Theo dõi đơn hàng realtime, thống kê doanh số & xuất mã QR</p>
            </div>
          </div>
          <button className="btn-primary" style={{ width: '100%', marginTop: 'auto' }} onClick={(e) => { e.stopPropagation(); navigateTo(`r=${tenantId}&role=admin`) }}>
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
