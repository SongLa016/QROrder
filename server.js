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

// Multi-tenant Memory
const clientsMap = new Map() // { tenantId: Set<Response> }
const stateMap = new Map() // { tenantId: Object }

// MongoDB Schema
const TenantSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, unique: true },
  state: { type: Object, default: {} }
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
      tenants.forEach(t => stateMap.set(t.tenantId, t.state))
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
    const doc = await Tenant.findOne({ tenantId })
    const state = doc ? doc.state : {}
    stateMap.set(tenantId, state)
    return state
  } else {
    try {
      const data = fs.readFileSync(getDbFilePath(tenantId), 'utf8')
      const state = JSON.parse(data)
      stateMap.set(tenantId, state)
      return state
    } catch (err) {
      stateMap.set(tenantId, {})
      return {}
    }
  }
}

const saveState = async (tenantId, state) => {
  stateMap.set(tenantId, state)
  if (isDbConnected) {
    await Tenant.updateOne({ tenantId }, { state }, { upsert: true })
  } else {
    fs.writeFileSync(getDbFilePath(tenantId), JSON.stringify(state, null, 2))
  }
}

// Routes
app.get('/api/state', async (req, res) => {
  const tenantId = req.query.r
  if (!tenantId) return res.status(400).json({ error: 'Missing tenant ID (r)' })
  const state = await loadState(tenantId)
  res.json(state)
})

app.post('/api/state', async (req, res) => {
  const tenantId = req.query.r
  if (!tenantId) return res.status(400).json({ error: 'Missing tenant ID (r)' })

  // Tách các biến điều khiển ra khỏi dữ liệu State
  const { actionContext, modifiedTableNumbers, ...partialState } = req.body

  // Gộp State mới vào State cũ
  const currentState = await loadState(tenantId)
  const newState = { ...currentState, ...partialState }
  await saveState(tenantId, newState)

  // Phát tín hiệu Real-time cho mọi thiết bị (Gói đúng định dạng {state, actionContext})
  const clients = clientsMap.get(tenantId) || new Set()
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify({ state: partialState, actionContext })}\n\n`)
  })

  res.json({ success: true })
})

app.get('/api/events', async (req, res) => {
  const tenantId = req.query.r
  if (!tenantId) {
    res.status(400).end()
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
  const state = await loadState(tenantId)
  res.write(`data: ${JSON.stringify({ state })}\n\n`)

  req.on('close', () => {
    clients.delete(res)
    if (clients.size === 0) {
      clientsMap.delete(tenantId)
    }
  })
})

app.use(express.static(path.join(__dirname, 'dist')))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(port, () => {
  console.log(`🚀 Máy chủ Đa Nhánh (SaaS) đã chạy tại http://localhost:${port}`)
})
