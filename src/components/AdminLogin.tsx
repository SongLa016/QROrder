import { useState } from 'react'

interface Props {
  onSubmit: (password: string) => void
  navigateToHome: () => void
  restaurantName: string
}

export default function AdminLogin({ onSubmit, navigateToHome, restaurantName }: Props) {
  const [password, setPassword] = useState('')

  return (
    <div className="ambient-background" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-md)' }}>
      <div className="login-card" style={{ maxWidth: '420px', width: '100%', padding: '0' }}>
        <div className="banner-gradient" style={{ padding: 'var(--spacing-xl)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--spacing-xs)', color: 'inherit' }}>Đăng Nhập Quản Lý</h2>
          <p style={{ margin: 0, opacity: 0.9 }}>
            {restaurantName}
          </p>
        </div>

        <div style={{ padding: 'var(--spacing-xl)' }}>

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(password) }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
          <div>
            <label className="form-label" style={{ marginBottom: '8px', display: 'block', fontWeight: 600 }}>Mật khẩu:</label>
            <input 
              type="password" 
              className="form-control-large" 
              style={{ width: '100%' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          <button type="submit" className="btn-primary btn-active-scale" style={{ width: '100%', minHeight: '52px', fontSize: '1.1rem', fontWeight: 700, borderRadius: 'var(--radius-md)', marginTop: 'var(--spacing-sm)' }}>
            Đăng Nhập
          </button>
        </form>

        <button 
          className="btn-outline btn-active-scale" 
          onClick={navigateToHome}
          style={{ width: '100%', marginTop: 'var(--spacing-md)', minHeight: '44px', borderRadius: 'var(--radius-md)' }}
        >
          Quay lại Trang Chủ
        </button>
        </div>
      </div>
    </div>
  )
}
