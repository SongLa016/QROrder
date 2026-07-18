export interface MenuItem {
  id: string
  name: string
  price: number
  image: string
  category: string
  available: boolean
}

export interface OrderItem {
  menuItemId: string
  quantity: number
  notes?: string
  snapshotName?: string
  snapshotPrice?: number
}

export interface Order {
  id: string
  tableNumber: number
  items: OrderItem[]
  total: number
  status: 'pending' | 'served' | 'completed'
  paymentMethod: 'cash' | 'card' | 'mobile'
  timestamp: number
  sessionId?: string   // Identifies the guest session; rotates when table is cleared
  rating?: number
  comment?: string
  customerName?: string
  paymentVerified?: boolean
  paymentReported?: boolean
}



export interface Table {
  number: number
  label?: string            // Custom display name e.g. "Bàn 1 Tầng 2", "VIP 01"
  status: 'empty' | 'ordering' | 'served' | 'billing'
  activeCall?: 'call_waiter' | 'request_bill' | null
  sessionId?: string   // Rotates each time a new guest party sits down
}



export interface RestaurantInfo {
  name: string
  tagline: string
  logo: string
  address?: string
  paymentQrCode?: string
  onboarded?: boolean
  password?: string
}
