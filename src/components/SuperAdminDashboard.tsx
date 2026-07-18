import { useState } from 'react'

interface Tenant {
  tenantId: string
  isActive: boolean
  restaurantName: string
}

interface Props {
  navigateToHome: () => void
}

export default function SuperAdminDashboard({ navigateToHome }: Props) {
  const [password, setPassword] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [error, setError] = useState('')

  // New Tenant Form State
  const [newTenantId, setNewTenantId] = useState('')
  const [newTenantName, setNewTenantName] = useState('')
  const [newTenantPwd, setNewTenantPwd] = useState('')
  const [createError, setCreateError] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const fetchTenants = async (pwd: string) => {
    try {
      const res = await fetch('/api/admin/tenants', {
        headers: { 'x-admin-password': pwd }
      })
      if (res.status === 401) {
        setError('Mật khẩu không đúng!')
        return
      }
      const data = await res.json()
      if (data.tenants) {
        setTenants(data.tenants)
        setIsAuthenticated(true)
        setError('')
      }
    } catch (e) {
      setError('Lỗi kết nối server.')
    }
  }

  const toggleTenant = async (tenantId: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({ isActive })
      })
      if (res.ok) {
        setTenants(prev => prev.map(t => t.tenantId === tenantId ? { ...t, isActive } : t))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({
          tenantId: newTenantId.trim(),
          name: newTenantName.trim(),
          password: newTenantPwd.trim()
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error || 'Có lỗi xảy ra khi tạo mã quán')
      } else {
        // Success
        setNewTenantId('')
        setNewTenantName('')
        setNewTenantPwd('')
        // Refresh list
        fetchTenants(password)
        alert('Tạo mã quán thành công!')
      }
    } catch (e) {
      setCreateError('Lỗi kết nối server.')
    } finally {
      setIsCreating(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', padding: 'var(--spacing-md)' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '0' }}>
          <div className="banner-gradient" style={{ padding: 'var(--spacing-xl)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 0, color: 'inherit' }}>Super Admin Login</h2>
          </div>
          <div style={{ padding: 'var(--spacing-xl)' }}>
          <form onSubmit={(e) => { e.preventDefault(); fetchTenants(password) }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div>
              <input 
                type="password" 
                className="form-control" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.9rem', margin: 0 }}>{error}</p>}
            <button type="submit" className="btn-primary" style={{ width: '100%', minHeight: '44px', background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}>
              Truy Cập
            </button>
          </form>
          <button className="btn-outline" onClick={navigateToHome} style={{ width: '100%', marginTop: 'var(--spacing-md)' }}>Quay Lại</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: 'var(--spacing-xl)' }}>
      <header className="banner-gradient glass-card" style={{ padding: 'var(--spacing-xl)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 'var(--spacing-md) 0 var(--spacing-xl) 0', boxShadow: 'var(--shadow-primary)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, marginBottom: 'var(--spacing-xs)', letterSpacing: '-0.02em' }}>
            👋 Chúc một ngày tốt lành!
          </h1>
          <p style={{ fontWeight: 500, fontSize: '1.1rem', opacity: 0.9 }}>Bảng điều khiển Super Admin - Quản lý và cấp quyền chi nhánh</p>
        </div>
        <button className="btn-primary" style={{ backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-primary)', border: 'none', fontWeight: 800 }} onClick={navigateToHome}>Thoát Dashboard</button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--spacing-xl)', alignItems: 'start' }}>
        {/* Create Tenant Form */}
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: 'var(--spacing-md)' }}>Cấp Tài Khoản Mới</h2>
          <form onSubmit={handleCreateTenant} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div>
              <label className="form-label">Tên Nhà Hàng:</label>
              <input 
                type="text" 
                className="form-control" 
                value={newTenantName}
                onChange={e => setNewTenantName(e.target.value)}
                required 
              />
            </div>
            <div>
              <label className="form-label">Mã Quán (Tenant ID):</label>
              <input 
                type="text" 
                className="form-control" 
                value={newTenantId}
                onChange={e => setNewTenantId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                required 
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Viết liền không dấu (Dùng làm link truy cập)</span>
            </div>
            <div>
              <label className="form-label">Mật khẩu Quản lý:</label>
              <input 
                type="password" 
                className="form-control" 
                value={newTenantPwd}
                onChange={e => setNewTenantPwd(e.target.value)}
                required 
              />
            </div>
            {createError && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', margin: 0 }}>{createError}</p>}
            <button type="submit" className="btn-primary" disabled={isCreating} style={{ marginTop: 'var(--spacing-xs)' }}>
              {isCreating ? 'Đang tạo...' : 'Tạo Quán Mới'}
            </button>
          </form>
        </div>

        {/* Tenants List */}
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: 'var(--spacing-md)' }}>Mã Quán</th>
                <th style={{ padding: 'var(--spacing-md)' }}>Tên Nhà Hàng</th>
                <th style={{ padding: 'var(--spacing-md)' }}>Trạng Thái</th>
                <th style={{ padding: 'var(--spacing-md)', textAlign: 'right' }}>Hành Động</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.tenantId} className="table-row-hover" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 'var(--spacing-md)', fontWeight: 600 }}>{t.tenantId}</td>
                  <td style={{ padding: 'var(--spacing-md)' }}>{t.restaurantName}</td>
                  <td style={{ padding: 'var(--spacing-md)' }}>
                    <span style={{ 
                      display: 'inline-block', 
                      padding: '4px 8px', 
                      borderRadius: 'var(--radius-sm)', 
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      backgroundColor: t.isActive ? 'oklch(94% 0.03 140)' : 'oklch(95% 0.02 20)',
                      color: t.isActive ? 'var(--color-success)' : 'var(--color-danger)'
                    }}>
                      {t.isActive ? 'Đang Hoạt Động' : 'Bị Khóa'}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--spacing-md)', textAlign: 'right' }}>
                    <button 
                      className={t.isActive ? "btn-secondary" : "btn-primary"}
                      style={{ 
                        padding: '6px 16px', 
                        fontSize: '0.85rem',
                        borderRadius: 'var(--radius-full)',
                        minHeight: '36px'
                      }}
                      onClick={() => toggleTenant(t.tenantId, !t.isActive)}
                    >
                      {t.isActive ? 'Khóa' : 'Mở Khóa'}
                    </button>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 'var(--spacing-xl)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Chưa có nhà hàng nào trong hệ thống. Hãy cấp tài khoản mới.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
