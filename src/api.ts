export type CourseType = 'private' | 'monthly'
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
  courseType: CourseType
  sessions: number | null
  gifts: number
  amount: number
  payment: PaymentMethod
  source: string
  salesperson: string
  remark: string
  isNewMember: boolean
  orderDate: string
  validFrom: string | null
  validTo: string | null
  startDate: string | null
  endDate: string | null
}

export type Attendance = {
  id: string
  customer: string
  phone: string
  courseName: string
  orderNo: string
  date: string
}

export type AttendanceResult = {
  name: string
  matched: boolean
  detail: string
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
  courseType: CourseType
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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
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

export async function exportOrders(filters: {
  startMonth: string
  endMonth: string
  courseType: 'all' | CourseType
  search: string
}) {
  const params = new URLSearchParams()
  if (filters.startMonth) params.set('start_month', filters.startMonth)
  if (filters.endMonth) params.set('end_month', filters.endMonth)
  if (filters.courseType !== 'all') params.set('course_type', filters.courseType)
  if (filters.search.trim()) params.set('search', filters.search.trim())

  const path = `/api/orders/export?${params.toString()}`
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
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
  customers: string[]
}) {
  return request<{ results: AttendanceResult[] }>('/api/attendance', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getReport(cutoffDate: string, startDate?: string) {
  const params = new URLSearchParams({ cutoff_date: cutoffDate })
  if (startDate) params.set('start_date', startDate)
  return request<Report>(`/api/reports?${params.toString()}`)
}
