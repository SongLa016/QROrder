import { useState } from 'react'

interface Props {
  onSubmit: (password: string) => void
  navigateToHome: () => void
  restaurantName: string
}

export default function AdminLogin({ onSubmit, navigateToHome, restaurantName }: Props) {
  const [password, setPassword] = useState('')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', padding: 'var(--spacing-md)' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', padding: 'var(--spacing-xl)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', textAlign: 'center', marginBottom: 'var(--spacing-xs)' }}>Đăng Nhập Quản Lý</h2>
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-lg)' }}>
          {restaurantName}
        </p>

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(password) }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
          <div>
            <label className="form-label">Mật khẩu:</label>
            <input 
              type="password" 
              className="form-control" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              autoFocus
              required
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', minHeight: '44px' }}>
            Đăng Nhập
          </button>
        </form>

        <button 
          className="btn-outline" 
          onClick={navigateToHome}
          style={{ width: '100%', marginTop: 'var(--spacing-md)' }}
        >
          Quay lại Trang Chủ
        </button>
      </div>
    </div>
  )
}
