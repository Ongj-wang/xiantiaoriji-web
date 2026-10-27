export type CourseType = 'private' | 'monthly'
export type OrderType = CourseType | 'package'
export type PaymentMethod =
  | '微信'
  | '支付宝'
  | '现金'
  | '银行卡'
  | '其他'
  | (string & {})
export type CustomerSource = '自然到店' | '老客户转介绍' | '线上平台' | '社交媒体' | '异业合作' | '其他'

export type Order = {
  orderNo: string
  customer: string
  phone: string
  courseName: string
  courseType: OrderType
  items?: PackageItem[]
  sessions: number | null
  gifts: number
  amount: number
  payment: PaymentMethod
  source: string
  salesperson: string
  remark: string
  isNewMember: boolean
  orderDate: string
  status: 'active' | 'disactive'
  cancelDate: string | null
  cancelAmount: number | null
  cancelReason: string
  attendance_time: number
  validFrom: string | null
  validTo: string | null
  startDate: string | null
  endDate: string | null
}

export type PackageItem = {
  itemId?: string
  courseType: CourseType
  courseName: string
  amount: number
  sessions: number | null
  gifts: number
  attendance_time?: number
  startDate: string | null
  endDate: string
  cancelDate?: string | null
  cancelAmount?: number | null
  cancelReason?: string
}

export type Attendance = {
  id: string
  customer: string
  phone: string
  courseName: string
  orderNo: string
  date: string
  teacher: string
}

export type AttendanceResult = {
  name: string
  matched: boolean
  detail: string
}

export type ScheduleCustomer = {
  customer: string
  phone: string
  orderNo: string
  time: string
}

export type ScheduleCourse = {
  courseName: string
  customers: ScheduleCustomer[]
}

export type ScheduleCell = {
  teacher: string
  hour: string
  courses: ScheduleCourse[]
}

export type AttendanceSchedule = {
  date: string
  hours: string[]
  teachers: string[]
  cells: ScheduleCell[]
  unscheduled: (ScheduleCustomer & { teacher: string; courseName: string })[]
}

export type SummaryRow = {
  customer: string
  phone: string
  courseName: string
  courseType: CourseType
  orders: number
  purchased: number | null
  gifts: number
  consumed: number
  remaining: number | null
  amount: number
}

export type Report = {
  cutoffDate: string
  sales: number
  orderCount: number
  attendanceCount: number
  privateSessionsLeft: number
  summaryRows: SummaryRow[]
  attendances: Attendance[]
}

export type CreateOrder = {
  customer: string
  phone: string
  courseName: string
  courseType: OrderType
  items?: PackageItem[]
  sessions: number | null
  gifts: number
  amount: number
  payment: PaymentMethod
  source: string
  salesperson: string
  remark: string
  isNewMember: boolean
  orderDate: string
  startDate: string | null
  endDate: string | null
}

export type Store = {
  id: string
  name: string
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

let selectedStoreId = ''

export function setSelectedStoreId(storeId: string) {
  selectedStoreId = storeId
  window.localStorage.setItem('selectedStoreId', storeId)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(selectedStoreId ? { 'X-Store-Id': selectedStoreId } : {}),
      ...init?.headers,
    },
  })
  const text = await response.text()
  let payload: unknown
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch (error) {
      console.error(`API ${path} returned invalid JSON.`, error)
      throw new Error(`后端接口 ${path} 返回了无效的 JSON 数据。`)
    }
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload &&
      typeof payload.error === 'string'
      ? payload.error
      : `请求失败（HTTP ${response.status}）`
    throw new Error(message)
  }
  if (payload === undefined) {
    throw new Error(`后端接口 ${path} 未返回 JSON 数据。`)
  }
  return payload as T
}

export async function getStores() {
  const response = await request<unknown>('/api/stores')
  if (
    typeof response !== 'object' ||
    response === null ||
    !('stores' in response) ||
    !Array.isArray(response.stores) ||
    response.stores.some((store) =>
      typeof store !== 'object' ||
      store === null ||
      !('id' in store) ||
      typeof store.id !== 'string' ||
      !('name' in store) ||
      typeof store.name !== 'string',
    )
  ) {
    throw new Error('后端接口 /api/stores 响应格式无效，应返回 { "stores": [] }。')
  }
  return response.stores as Store[]
}

export async function createStore(name: string) {
  const response = await request<{ store: Store }>('/api/stores', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return response.store
}

export async function updateStore(storeId: string, name: string) {
  const response = await request<{ store: Store }>('/api/stores/rename', {
    method: 'POST',
    body: JSON.stringify({ id: storeId, name }),
  })
  return response.store
}

export async function getOrders() {
  const response = await request<unknown>('/api/orders')
  if (
    typeof response !== 'object' ||
    response === null ||
    !('orders' in response) ||
    !Array.isArray(response.orders)
  ) {
    throw new Error('后端接口 /api/orders 响应格式无效，应返回 { "orders": [] }。')
  }
  return response.orders as Order[]
}

export async function searchOrders(query: string) {
  const params = new URLSearchParams({ query: query.trim() })
  const response = await request<unknown>(`/api/orders/search?${params.toString()}`)
  if (
    typeof response !== 'object' ||
    response === null ||
    !('orders' in response) ||
    !Array.isArray(response.orders)
  ) {
    throw new Error('后端接口 /api/orders/search 响应格式无效，应返回 { "orders": [] }。')
  }
  return response.orders as Order[]
}

export async function cancelOrder(input: {
  orderNo: string
  cancelAmount: number
  cancelReason: string
}) {
  const response = await request<{ order: Order }>('/api/orders/cancel', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return response.order
}

export async function exportOrders(filters: {
  startMonth: string
  endMonth: string
  courseType: 'all' | OrderType
  search: string
}) {
  const params = new URLSearchParams()
  if (filters.startMonth) params.set('start_month', filters.startMonth)
  if (filters.endMonth) params.set('end_month', filters.endMonth)
  if (filters.courseType !== 'all') params.set('course_type', filters.courseType)
  if (filters.search.trim()) params.set('search', filters.search.trim())

  const path = `/api/orders/export?${params.toString()}`
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...(selectedStoreId ? { 'X-Store-Id': selectedStoreId } : {}),
    },
  })
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined)
    const message = typeof payload === 'object' && payload !== null && 'error' in payload &&
      typeof payload.error === 'string'
      ? payload.error
      : `请求失败（HTTP ${response.status}）`
    throw new Error(message)
  }
  return response.blob()
}

export async function createOrder(order: CreateOrder) {
  const response = await request<{ order: Order }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  })
  return response.order
}

export async function getPrivateCourses() {
  const response = await request<{ courses: string[] }>('/api/courses?course_type=private')
  return response.courses
}

export async function getAttendances() {
  const response = await request<{ attendances: Attendance[] }>('/api/attendance')
  return response.attendances
}

export async function createAttendance(input: {
  courseName: string
  date: string
  teacher: string
  customers: string[]
}) {
  return request<{ results: AttendanceResult[] }>('/api/attendance', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getAttendanceSchedule(date: string) {
  const params = new URLSearchParams({ date })
  const response = await request<unknown>(`/api/attendance/schedule?${params.toString()}`)
  if (
    typeof response !== 'object' ||
    response === null ||
    !('hours' in response) ||
    !Array.isArray(response.hours) ||
    !('teachers' in response) ||
    !Array.isArray(response.teachers) ||
    !('cells' in response) ||
    !Array.isArray(response.cells) ||
    !('unscheduled' in response) ||
    !Array.isArray(response.unscheduled)
  ) {
    throw new Error('后端接口 /api/attendance/schedule 响应格式无效。')
  }
  return response as AttendanceSchedule
}

export async function getReport(cutoffDate: string, startDate?: string) {
  const params = new URLSearchParams({ cutoff_date: cutoffDate })
  if (startDate) params.set('start_date', startDate)
  return request<Report>(`/api/reports?${params.toString()}`)
}
