import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());

// Phục vụ các file tĩnh của giao diện (Frontend) sau khi build
app.use(express.static(path.join(__dirname, 'dist')));

// Khởi tạo State ban đầu
let appState = {
  restaurant: null,
  menu: [],
  tables: [],
  orders: []
};

// Đọc dữ liệu từ ổ cứng (Persistence)
if (fs.existsSync(DB_PATH)) {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    appState = JSON.parse(data);
    console.log('✅ Đã nạp thành công dữ liệu từ database.json');
  } catch (error) {
    console.error('❌ Lỗi khi đọc database.json:', error);
  }
}

// Lưu dữ liệu vào ổ cứng
const saveDatabase = () => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(appState, null, 2), 'utf-8');
  } catch (error) {
    console.error('❌ Lỗi khi ghi dữ liệu vào database.json:', error);
  }
};

// Danh sách thiết bị đang kết nối (Real-time SSE)
let sseClients = [];

const broadcast = (event, data) => {
  sseClients.forEach(client => {
    client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
};

// API: Lắng nghe sự kiện Real-time (Server-Sent Events)
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('\n');
  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

// API: Lấy trạng thái hiện tại
app.get('/api/state', (req, res) => {
  res.json(appState);
});

// API: Cập nhật trạng thái và đồng bộ cho tất cả thiết bị
app.post('/api/state', (req, res) => {
  const updates = req.body;

  if (updates.restaurant !== undefined) appState.restaurant = updates.restaurant;
  if (updates.menu !== undefined) appState.menu = updates.menu;

  if (updates.tables !== undefined) {
    if (updates.modifiedTableNumbers !== undefined && Array.isArray(updates.modifiedTableNumbers)) {
      appState.tables = appState.tables.map(t => {
        if (updates.modifiedTableNumbers.includes(t.number)) {
          const incoming = updates.tables.find(it => it.number === t.number);
          return incoming ? { ...t, ...incoming } : t;
        }
        return t;
      });
      updates.tables.forEach(it => {
        if (!appState.tables.some(t => t.number === it.number)) {
          appState.tables.push(it);
        }
      });
    } else {
      appState.tables = updates.tables;
    }
  }

  if (updates.orders !== undefined) {
    const serverOrderMap = new Map(appState.orders.map(o => [o.id, o]));
    updates.orders.forEach(newOrder => {
      const existing = serverOrderMap.get(newOrder.id);
      if (!existing) {
        appState.orders.push(newOrder);
      } else {
        Object.assign(existing, newOrder);
      }
    });
    appState.orders.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Phát tín hiệu đồng bộ cho mọi điện thoại/máy tính
  broadcast('state-updated', {
    state: appState,
    actionContext: updates.actionContext
  });

  // Ghi xuống file JSON
  saveDatabase();

  res.json({ success: true });
});

// Chuyển hướng mọi URL khác về file index.html của React (Hỗ trợ Routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Máy chủ Quản lý Quán đã chạy tại http://localhost:${PORT}`);
});
