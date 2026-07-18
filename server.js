import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '50mb' }))

const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123'

// Multi-tenant Memory
const clientsMap = new Map() // { tenantId: Set<Response> }
const stateMap = new Map() // { tenantId: Object }
const activeMap = new Map() // { tenantId: Boolean }

// MongoDB Schema
const TenantSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, unique: true },
  state: { type: Object, default: {} },
  isActive: { type: Boolean, default: true }
})
const Tenant = mongoose.model('Tenant', TenantSchema)

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI
let isDbConnected = false

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✅ Đã kết nối thành công tới Cơ sở dữ liệu đám mây (MongoDB)')
      isDbConnected = true
      // Load all tenants into memory
      return Tenant.find({})
    })
    .then((tenants) => {
      tenants.forEach(t => {
        stateMap.set(t.tenantId, t.state)
        activeMap.set(t.tenantId, t.isActive !== false)
      })
    })
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err))
} else {
  console.log('⚠️ Chưa có đường link MongoDB. Hệ thống sẽ lưu file cục bộ (Dễ bị mất dữ liệu trên Render).')
}

// Fallback local file system for dev mode
const getDbFilePath = (tenantId) => path.join(__dirname, `database_${tenantId}.json`)

const loadState = async (tenantId) => {
  if (stateMap.has(tenantId)) return stateMap.get(tenantId)
  
  if (isDbConnected) {
    try {
      const doc = await Tenant.findOne({ tenantId })
      const state = doc ? doc.state : {}
      const isActive = doc ? (doc.isActive !== false) : true
      stateMap.set(tenantId, state)
      activeMap.set(tenantId, isActive)
      return state
    } catch (err) {
      console.error(`MongoDB load error for tenant ${tenantId}:`, err)
      return {}
    }
  } else {
    try {
      const data = fs.readFileSync(getDbFilePath(tenantId), 'utf8')
      const parsed = JSON.parse(data)
      const state = parsed.state !== undefined ? parsed.state : parsed
      const isActive = parsed.isActive !== undefined ? parsed.isActive : true
      stateMap.set(tenantId, state)
      activeMap.set(tenantId, isActive)
      return state
    } catch (err) {
      stateMap.set(tenantId, {})
      activeMap.set(tenantId, true)
      return {}
    }
  }
}

const saveState = async (tenantId, state) => {
  stateMap.set(tenantId, state)
  const isActive = activeMap.has(tenantId) ? activeMap.get(tenantId) : true
  if (isDbConnected) {
    try {
      await Tenant.updateOne({ tenantId }, { state, isActive }, { upsert: true })
    } catch (err) {
      console.error(`MongoDB save error for tenant ${tenantId}:`, err)
    }
  } else {
    try {
      fs.writeFileSync(getDbFilePath(tenantId), JSON.stringify({ state, isActive }, null, 2))
    } catch (err) {
      console.error(`File save error for tenant ${tenantId}:`, err)
    }
  }
}

const setTenantActive = async (tenantId, isActive) => {
  activeMap.set(tenantId, isActive)
  if (isDbConnected) {
    try {
      await Tenant.updateOne({ tenantId }, { isActive }, { upsert: true })
    } catch (err) {
      console.error(`MongoDB save error for tenant ${tenantId}:`, err)
    }
  } else {
    let state = {}
    if (stateMap.has(tenantId)) {
      state = stateMap.get(tenantId)
    } else {
       try {
         const data = fs.readFileSync(getDbFilePath(tenantId), 'utf8')
         const parsed = JSON.parse(data)
         state = parsed.state !== undefined ? parsed.state : parsed
       } catch (e) {}
    }
    fs.writeFileSync(getDbFilePath(tenantId), JSON.stringify({ state, isActive }, null, 2))
  }
}

// Routes
app.get('/api/state', async (req, res) => {
  try {
    const tenantId = req.query.r
    if (!tenantId) return res.status(400).json({ error: 'Missing tenant ID (r)' })
    
    const state = await loadState(tenantId)
    const isActive = activeMap.has(tenantId) ? activeMap.get(tenantId) : true
    if (!isActive) return res.status(403).json({ error: 'Mã quán đã bị khóa' })

    res.json(state)
  } catch (err) {
    console.error('Error loading state:', err)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

app.post('/api/state', async (req, res) => {
  try {
    const tenantId = req.query.r
    if (!tenantId) return res.status(400).json({ error: 'Missing tenant ID (r)' })

    // Force load state first to check active status
    await loadState(tenantId)
    const isActive = activeMap.has(tenantId) ? activeMap.get(tenantId) : true
    if (!isActive) return res.status(403).json({ error: 'Mã quán đã bị khóa' })

    // Tách các biến điều khiển ra khỏi dữ liệu State
    const { actionContext, modifiedTableNumbers, ...partialState } = req.body

    // Gộp State mới vào State cũ
    const currentState = stateMap.get(tenantId) || {}
    const newState = { ...currentState, ...partialState }
    await saveState(tenantId, newState)

    // Phát tín hiệu Real-time cho mọi thiết bị (Gói đúng định dạng {state, actionContext})
    const clients = clientsMap.get(tenantId) || new Set()
    clients.forEach(client => {
      try {
        client.write(`data: ${JSON.stringify({ state: partialState, actionContext })}\n\n`)
      } catch (e) {
        console.error('Error writing to client SSE:', e)
        clients.delete(client)
      }
    })

    res.json({ success: true })
  } catch (err) {
    console.error('Error saving state:', err)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

app.get('/api/events', async (req, res) => {
  try {
    const tenantId = req.query.r
    if (!tenantId) {
      res.status(400).end()
      return
    }

    const state = await loadState(tenantId)
    const isActive = activeMap.has(tenantId) ? activeMap.get(tenantId) : true
    if (!isActive) {
      res.status(403).json({ error: 'Mã quán đã bị khóa' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    if (!clientsMap.has(tenantId)) {
      clientsMap.set(tenantId, new Set())
    }
    const clients = clientsMap.get(tenantId)
    clients.add(res)

    // Gửi toàn bộ state hiện tại ngay lập tức khi vừa kết nối
    res.write(`data: ${JSON.stringify({ state })}\n\n`)

    req.on('close', () => {
      clients.delete(res)
      if (clients.size === 0) {
        clientsMap.delete(tenantId)
      }
    })
  } catch (err) {
    console.error('Error in SSE events:', err)
    res.status(500).end()
  }
})

// Super Admin routes
app.get('/api/admin/tenants', async (req, res) => {
  if (req.headers['x-admin-password'] !== SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  
  let allTenants = []
  if (isDbConnected) {
    const docs = await Tenant.find({}, 'tenantId isActive state.restaurant.name')
    allTenants = docs.map(d => ({
      tenantId: d.tenantId,
      isActive: d.isActive !== false,
      restaurantName: d.state?.restaurant?.name || 'Chưa đặt tên'
    }))
  } else {
    // local mode - list activeMap keys
    const keys = Array.from(new Set([...stateMap.keys(), ...activeMap.keys()]))
    allTenants = keys.map(tenantId => ({
      tenantId,
      isActive: activeMap.has(tenantId) ? activeMap.get(tenantId) : true,
      restaurantName: stateMap.get(tenantId)?.restaurant?.name || 'Chưa đặt tên'
    }))
  }
  res.json({ tenants: allTenants })
})

app.post('/api/admin/tenants', async (req, res) => {
  if (req.headers['x-admin-password'] !== SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const { tenantId, name, password } = req.body
  if (!tenantId || !name || !password) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  
  if (stateMap.has(tenantId)) {
    return res.status(400).json({ error: 'Mã quán đã tồn tại' })
  }
  
  const newState = {
    restaurant: {
      name,
      tagline: 'Khẩu hiệu kinh doanh',
      logo: '🍜',
      password,
      onboarded: false
    }
  }
  await saveState(tenantId, newState)
  await setTenantActive(tenantId, true)
  
  res.json({ success: true, tenantId })
})

app.post('/api/admin/tenants/:tenantId/toggle', async (req, res) => {
  if (req.headers['x-admin-password'] !== SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const { tenantId } = req.params
  const { isActive } = req.body
  await setTenantActive(tenantId, !!isActive)
  
  // Broadcast action Context to force refresh/lock client side
  const clients = clientsMap.get(tenantId) || new Set()
  clients.forEach(client => {
    try {
      client.write(`data: ${JSON.stringify({ actionContext: 'TENANT_STATUS_CHANGED' })}\n\n`)
    } catch (e) {}
  })
  
  res.json({ success: true, tenantId, isActive: !!isActive })
})

app.use(express.static(path.join(__dirname, 'dist')))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(port, () => {
  console.log(`🚀 Máy chủ Đa Nhánh (SaaS) đã chạy tại http://localhost:${port}`)
})
