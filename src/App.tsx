import { computed, defineComponent, onMounted, ref } from 'vue'
import {
  createAttendance,
  createStore as postStore,
  cancelOrder as postCancellation,
  createOrder as postOrder,
  exportOrders as downloadOrders,
  getStores,
  getPrivateCourses,
  getOrders,
  getReport,
  searchOrders,
  updateStore as putStore,
  type AttendanceResult,
  type CourseType,
  type Order,
  type OrderType,
  type PackageItem,
  type PaymentMethod,
  type Report,
  type Store,
  setSelectedStoreId,
} from './api'
import { createXlsx } from './xlsx'

type Page = 'overview' | 'orders' | 'withdrawals' | 'attendance' | 'reports'
const today = localDate(new Date())

function localDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDateTime(date: Date) {
  return `${localDate(date)}T${localTime(date)}`
}

function localTime(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

const navItems: { id: Page; label: string; icon: string }[] = [
  { id: 'overview', label: '经营概览', icon: '▦' },
  { id: 'orders', label: '订单台账', icon: '▤' },
  { id: 'attendance', label: '消课登记', icon: '✓' },
  { id: 'withdrawals', label: '退课登记', icon: '↩' },
  { id: 'reports', label: '统计汇总', icon: '▥' },
]

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
})

export default defineComponent({
  setup() {
    const orders = ref<Order[]>([])
    const privateCourses = ref<string[]>([])
    const report = ref<Report | null>(null)
    const apiError = ref('')
    const activePage = ref<Page>('overview')
    const stores = ref<Store[]>([])
    const activeStoreId = ref('')
    const showStoreManager = ref(false)
    const newStoreName = ref('')
    const editingStoreId = ref('')
    const editingStoreName = ref('')
    const storeError = ref('')
    const loadingStores = ref(false)
    const creatingStore = ref(false)
    const switchingStore = ref(false)
    const showOrderForm = ref(false)
    const orderSearch = ref('')
    const orderTypeFilter = ref<'all' | OrderType>('all')
    const orderStartMonth = ref('')
    const orderEndMonth = ref('')
    const reportStartDate = ref(`${new Date().getFullYear()}-01-01`)
    const reportDate = ref(today)
    const loadingOrders = ref(false)
    const exportingOrders = ref(false)
    const loadingReport = ref(false)
    const submittingOrder = ref(false)
    const submittingAttendance = ref(false)
    const attendanceCourse = ref('')
    const attendanceDateTime = ref(localDateTime(new Date()))
    const attendanceTeacher = ref('')
    const attendanceNames = ref('')
    const attendanceResults = ref<AttendanceResult[]>([])
    const withdrawalSearch = ref('')
    const withdrawalResults = ref<Order[]>([])
    const searchingWithdrawals = ref(false)
    const cancellingOrderNo = ref('')
    const withdrawalError = ref('')
    const cancellationOrder = ref<Order | null>(null)
    const cancellationAmount = ref('')
    const cancellationReason = ref('')
    const orderFormError = ref('')
    const paymentLabels = ['微信', '支付宝', '现金', '银行卡', '收钱吧', '美团', '抖音'];
    const sourceLabels = ['自然到店', '老客户转介绍', '线上平台', '社交媒体', '异业合作'];

    const orderDraft = ref({
      customer: '',
      phone: '',
      courseName: '',
      courseType: 'private' as OrderType,
      sessions: 10,
      gifts: 0,
      amount: 0,
      payment: '微信' as PaymentMethod,
      source: '自然到店',
      salesperson: '',
      remark: '',
      isNewMember: false,
      orderDate: today,
      startDate: today,
      endDate: today,
      packageItems: [{
        courseType: 'private' as CourseType,
        courseName: '',
        amount: 0,
        sessions: 10,
        gifts: 0,
        startDate: null,
        endDate: today,
      }] as PackageItem[],
    })

    const filteredOrders = computed(() => {
      const query = orderSearch.value.trim().toLowerCase()
      return [...orders.value]
        .filter((order) => orderTypeFilter.value === 'all' || order.courseType === orderTypeFilter.value)
        .filter((order) => {
          const month = order.orderDate.slice(0, 7)
          return (!orderStartMonth.value || month >= orderStartMonth.value) &&
            (!orderEndMonth.value || month <= orderEndMonth.value)
        })
        .filter((order) => {
          if (!query) return true
          return [order.orderNo, order.customer, order.phone, order.courseName]
            .some((value) => value.toLowerCase().includes(query)) ||
            order.items?.some((item) => item.courseName.toLowerCase().includes(query))
        })
        .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    })

    const summaryRows = computed(() => report.value?.summaryRows ?? [])
    const reportAttendances = computed(() => report.value?.attendances ?? [])
    const metrics = computed(() => report.value)
    const activeStore = computed(() => stores.value.find((store) => store.id === activeStoreId.value))
    const packageTotal = computed(() => Number(orderDraft.value.packageItems
      .reduce((total, item) => total + (Number.isFinite(item.amount) ? item.amount : 0), 0)
      .toFixed(2)))

    function formatMoney(amount: number) {
      return currency.format(amount)
    }

    function formatSessionCount(sessions: number | null, gifts: number) {
      const total = (sessions ?? 0) + gifts
      return `${total} 次${gifts > 0 ? ` (包含赠送 ${gifts})` : ''}`
    }

    function addPackageItem() {
      orderDraft.value.packageItems.push({
        courseType: 'private',
        courseName: '',
        amount: 0,
        sessions: 10,
        gifts: 0,
        startDate: null,
        endDate: today,
      })
    }

    async function loadOrders() {
      loadingOrders.value = true
      apiError.value = ''
      try {
        orders.value = await getOrders()
      } catch (error) {
        console.error('加载课程订单失败。', error)
        apiError.value = error instanceof Error ? error.message : '加载课程订单失败。'
      } finally {
        loadingOrders.value = false
      }
    }

    async function exportOrders() {
      if (orderStartMonth.value && orderEndMonth.value && orderStartMonth.value > orderEndMonth.value) {
        apiError.value = '订单起始月份不能晚于结束月份。'
        return
      }
      exportingOrders.value = true
      apiError.value = ''
      try {
        const file = await downloadOrders({
          startMonth: orderStartMonth.value,
          endMonth: orderEndMonth.value,
          courseType: orderTypeFilter.value,
          search: orderSearch.value,
        })
        const url = URL.createObjectURL(file)
        const link = document.createElement('a')
        link.href = url
        const range = orderStartMonth.value || orderEndMonth.value
          ? `${orderStartMonth.value || '起始'}_${orderEndMonth.value || '至今'}`
          : '全部'
        link.download = `课程订单_${range}.xlsx`
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch (error) {
        console.error('导出课程订单失败。', error)
        apiError.value = error instanceof Error ? error.message : '导出订单失败，请稍后重试。'
      } finally {
        exportingOrders.value = false
      }
    }

    async function loadOverview() {
      loadingReport.value = true
      loadingOrders.value = true
      apiError.value = ''
      try {
        const [orderList, reportData] = await Promise.all([
          getOrders(),
          getReport(reportDate.value),
        ])
        orders.value = orderList
        report.value = reportData
      } catch (error) {
        console.error('加载经营概览失败。', error)
        apiError.value = error instanceof Error ? error.message : '加载经营概览失败。'
      } finally {
        loadingReport.value = false
        loadingOrders.value = false
      }
    }

    async function loadAttendancePage() {
      apiError.value = ''
      try {
        privateCourses.value = await getPrivateCourses()
      } catch (error) {
        console.error('加载定制私教课程失败。', error)
        apiError.value = error instanceof Error ? error.message : '加载定制私教课程失败。'
      }
    }

    async function searchWithdrawalOrders(event: SubmitEvent) {
      event.preventDefault()
      const query = withdrawalSearch.value.trim()
      if (!query) {
        withdrawalError.value = '请输入客户姓名或手机号。'
        withdrawalResults.value = []
        return
      }

      searchingWithdrawals.value = true
      withdrawalError.value = ''
      try {
        withdrawalResults.value = await searchOrders(query)
      } catch (error) {
        console.error('查询客户订单失败。', error)
        withdrawalError.value = error instanceof Error ? error.message : '查询订单失败，请稍后重试。'
      } finally {
        searchingWithdrawals.value = false
      }
    }

    function openCancellation(order: Order) {
      if (order.status !== 'active' || cancellingOrderNo.value) return
      cancellationOrder.value = order
      cancellationAmount.value = Number(order.amount).toFixed(2)
      cancellationReason.value = ''
      withdrawalError.value = ''
    }

    async function cancelCustomerOrder(event: SubmitEvent) {
      event.preventDefault()
      const order = cancellationOrder.value
      const amount = Number(cancellationAmount.value)
      const reason = cancellationReason.value.trim()
      if (!order || order.status !== 'active') return
      if (!Number.isFinite(amount) || amount < 0 || amount > order.amount || Math.round(amount * 100) / 100 !== amount) {
        withdrawalError.value = '退订金额需为不小于 0 且不超过订单金额的数值，最多保留两位小数。'
        return
      }
      if (!reason) {
        withdrawalError.value = '请填写退订理由。'
        return
      }

      cancellingOrderNo.value = order.orderNo
      withdrawalError.value = ''
      try {
        const cancelledOrder = await postCancellation({
          orderNo: order.orderNo,
          cancelAmount: amount,
          cancelReason: reason,
        })
        withdrawalResults.value = withdrawalResults.value.map((item) =>
          item.orderNo === cancelledOrder.orderNo ? cancelledOrder : item,
        )
        orders.value = orders.value.map((item) =>
          item.orderNo === cancelledOrder.orderNo ? cancelledOrder : item,
        )
        cancellationOrder.value = null
        await loadReport()
      } catch (error) {
        console.error('退订课程订单失败。', error)
        withdrawalError.value = error instanceof Error ? error.message : '退订失败，请稍后重试。'
      } finally {
        cancellingOrderNo.value = ''
      }
    }

    async function loadReport() {
      loadingReport.value = true
      apiError.value = ''
      report.value = null
      try {
        if (reportStartDate.value > reportDate.value) {
          apiError.value = '统计起始日期不能晚于统计截止日期。'
          return
        }
        report.value = await getReport(reportDate.value, reportStartDate.value)
      } catch (error) {
        console.error('加载统计汇总失败。', error)
        apiError.value = error instanceof Error ? error.message : '加载统计汇总失败。'
      } finally {
        loadingReport.value = false
      }
    }

    async function loadStores() {
      loadingStores.value = true
      storeError.value = ''
      try {
        stores.value = await getStores()
        const savedStoreId = window.localStorage.getItem('selectedStoreId')
        const selectedStore = stores.value.find((store) => store.id === savedStoreId) ?? stores.value[0]
        if (!selectedStore) {
          throw new Error('后端尚未配置任何门店。')
        }
        activeStoreId.value = selectedStore.id
        setSelectedStoreId(selectedStore.id)
        await loadOverview()
      } catch (error) {
        console.error('加载门店信息失败。', error)
        storeError.value = error instanceof Error ? error.message : '加载门店信息失败。'
      } finally {
        loadingStores.value = false
      }
    }

    async function switchStore(store: Store) {
      if (store.id === activeStoreId.value || switchingStore.value) return
      switchingStore.value = true
      activeStoreId.value = store.id
      setSelectedStoreId(store.id)
      stores.value = [...stores.value]
      orders.value = []
      report.value = null
      privateCourses.value = []
      withdrawalResults.value = []
      attendanceResults.value = []
      apiError.value = ''
      withdrawalError.value = ''
      showStoreManager.value = false
      try {
        await navigate(activePage.value)
      } finally {
        switchingStore.value = false
      }
    }

    async function createStore(event: SubmitEvent) {
      event.preventDefault()
      const name = newStoreName.value.trim()
      if (!name) {
        storeError.value = '请输入门店名称。'
        return
      }
      creatingStore.value = true
      storeError.value = ''
      try {
        const store = await postStore(name)
        stores.value = [...stores.value, store]
        newStoreName.value = ''
        await switchStore(store)
      } catch (error) {
        console.error('创建门店失败。', error)
        storeError.value = error instanceof Error ? error.message : '创建门店失败。'
      } finally {
        creatingStore.value = false
      }
    }

    function startEditingStore(store: Store) {
      editingStoreId.value = store.id
      editingStoreName.value = store.name
      storeError.value = ''
    }

    async function saveStoreName(event: SubmitEvent) {
      event.preventDefault()
      const name = editingStoreName.value.trim()
      if (!name) {
        storeError.value = '门店名称不能为空。'
        return
      }
      creatingStore.value = true
      storeError.value = ''
      try {
        const store = await putStore(editingStoreId.value, name)
        stores.value = stores.value.map((item) => item.id === store.id ? store : item)
        editingStoreId.value = ''
        editingStoreName.value = ''
      } catch (error) {
        console.error('修改门店名称失败。', error)
        storeError.value = error instanceof Error ? error.message : '修改门店名称失败。'
      } finally {
        creatingStore.value = false
      }
    }

    async function navigate(page: Page) {
      activePage.value = page
      if (page === 'overview') await loadOverview()
      if (page === 'orders') await loadOrders()
      if (page === 'attendance') await loadAttendancePage()
      if (page === 'reports') await loadReport()
    }

    onMounted(() => {
      void loadStores()
    })

    async function createOrder(event: SubmitEvent) {
      event.preventDefault()
      orderFormError.value = ''
      const draft = orderDraft.value
      const customer = draft.customer.trim()
      const phone = draft.phone.trim()
      const courseName = draft.courseName.trim()
      const orderAmount = draft.courseType === 'package' ? packageTotal.value : draft.amount
      if (!customer || !phone || !courseName || orderAmount <= 0) {
        orderFormError.value = '请完整填写客户、手机号、课程项目及大于 0 的订单总金额。'
        return
      }
      if (draft.courseType === 'private' && (!Number.isInteger(draft.sessions) || draft.sessions < 1)) {
        orderFormError.value = '私教课时数需填写大于 0 的整数。'
        return
      }
      if (draft.courseType === 'package') {
        if (!draft.packageItems.length) {
          orderFormError.value = '套餐至少需要添加一项课程。'
          return
        }
        for (const [index, item] of draft.packageItems.entries()) {
          if (!item.courseName.trim()) {
            orderFormError.value = `请填写套餐第 ${index + 1} 项课程名称。`
            return
          }
          if (!Number.isFinite(item.amount) || item.amount < 0 || Math.round(item.amount * 100) / 100 !== item.amount) {
            orderFormError.value = `套餐第 ${index + 1} 项课程金额需为不小于 0 的金额，最多保留两位小数。`
            return
          }
          if (item.courseType === 'private' && (!Number.isInteger(item.sessions) || !item.sessions || item.sessions < 1)) {
            orderFormError.value = `套餐第 ${index + 1} 项私教课时需为大于 0 的整数。`
            return
          }
          if (!Number.isInteger(item.gifts) || item.gifts < 0) {
            orderFormError.value = `套餐第 ${index + 1} 项赠送课时需为 0 或正整数。`
            return
          }
          if (!item.endDate || (item.courseType === 'monthly' && (!item.startDate || item.endDate < item.startDate))) {
            orderFormError.value = `请检查套餐第 ${index + 1} 项课程日期。`
            return
          }
        }
      }
      if (
        draft.courseType === 'monthly' &&
        (!draft.startDate || !draft.endDate || draft.endDate < draft.startDate)
      ) {
        orderFormError.value = '月卡结束日期不能早于起始日期。'
        return
      }
      if (draft.courseType === 'private' && !draft.endDate) {
        orderFormError.value = '请填写定制私教订单结束日期。'
        return
      }
      if (!draft.orderDate) {
        orderFormError.value = '请填写订单登记日期。'
        return
      }
      if (!Number.isInteger(draft.gifts) || draft.gifts < 0) {
        orderFormError.value = '赠送课时需填写 0 或正整数。'
        return
      }
      submittingOrder.value = true
      try {
        const createdOrder = await postOrder({
          customer,
          phone,
          courseName,
          courseType: draft.courseType,
          sessions: draft.courseType === 'private' ? Number(draft.sessions) : null,
          gifts: draft.courseType === 'private' ? Number(draft.gifts) : 0,
          items: draft.courseType === 'package' ? draft.packageItems.map((item) => ({
            ...item,
            courseName: item.courseName.trim(),
            amount: Number(item.amount),
            sessions: item.courseType === 'private' ? Number(item.sessions) : null,
            gifts: item.courseType === 'private' ? Number(item.gifts) : 0,
          })) : undefined,
          amount: orderAmount,
          payment: draft.payment,
          source: draft.source,
          salesperson: draft.salesperson.trim(),
          remark: draft.remark.trim(),
          isNewMember: draft.isNewMember,
          orderDate: draft.orderDate,
          startDate: draft.courseType === 'monthly' ? draft.startDate : null,
          endDate: draft.courseType === 'monthly' || draft.courseType === 'private' ? draft.endDate : null,
        })
        orders.value.unshift(createdOrder)
        showOrderForm.value = false
        orderDraft.value = {
          customer: '',
          phone: '',
          courseName: '',
          courseType: 'private',
          sessions: 10,
          gifts: 0,
          amount: 0,
          payment: '微信',
          source: '自然到店',
          salesperson: '',
          remark: '',
          isNewMember: false,
          orderDate: today,
          startDate: today,
          endDate: today,
          packageItems: [{
            courseType: 'private',
            courseName: '',
            amount: 0,
            sessions: 10,
            gifts: 0,
            startDate: null,
            endDate: today,
          }],
        }
        apiError.value = ''
        await loadReport()
      } catch (error) {
        console.error('提交课程订单失败。', error)
        orderFormError.value = error instanceof Error ? error.message : '提交订单失败，请稍后重试。'
      } finally {
        submittingOrder.value = false
      }
    }

    async function registerAttendance(event: SubmitEvent) {
      event.preventDefault()
      const names = attendanceNames.value
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
      if (!attendanceCourse.value || names.length === 0) {
        attendanceResults.value = [{
          name: '尚未登记',
          matched: false,
          detail: '请选择定制私教课程，并至少输入一位客户姓名。',
        }]
        return
      }
      submittingAttendance.value = true
      try {
        const response = await createAttendance({
          courseName: attendanceCourse.value,
          date: attendanceDateTime.value.replace('T', ' '),
          teacher: attendanceTeacher.value.trim(),
          customers: names,
        })
        attendanceResults.value = response.results
        attendanceNames.value = ''
        apiError.value = ''
      } catch (error) {
        console.error('提交批量消课失败。', error)
        apiError.value = error instanceof Error ? error.message : '提交消课失败，请稍后重试。'
      } finally {
        submittingAttendance.value = false
      }
    }

    async function exportReport() {
      if (summaryRows.value.length === 0) {
        apiError.value = '当前截止日期没有可导出的订单数据。'
        return
      }
      try {
        const summaryRowsForExport = [
          [
            '客户姓名', '手机号', '课程项目', '课程类型', '订单数',
            '购买课时', '赠送课时', '已消课时', '剩余课时', '销售金额',
          ],
          ...summaryRows.value.map((row) => [
            row.customer,
            row.phone,
            row.courseName,
            row.courseType === 'private' ? '定制私教课' : '月卡课程',
            row.orders,
            row.purchased ?? '不限次',
            row.gifts || '—',
            row.consumed,
            row.remaining ?? '不限次',
            row.amount,
          ]),
        ]
        const attendanceRowsForExport = [
          ['上课日期', '授课老师', '客户姓名', '手机号', '课程项目', '关联订单号'],
          ...reportAttendances.value.map((attendance) => [
            attendance.date,
            attendance.teacher,
            attendance.customer,
            attendance.phone,
            attendance.courseName,
            attendance.orderNo,
          ]),
        ]
        const workbook = createXlsx([
          { name: '客户课时汇总', rows: summaryRowsForExport },
          { name: '消课明细', rows: attendanceRowsForExport },
        ])
        const workbookBuffer = new ArrayBuffer(workbook.byteLength)
        new Uint8Array(workbookBuffer).set(workbook)
        const url = URL.createObjectURL(new Blob([workbookBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }))
        const link = document.createElement('a')
        link.href = url
        link.download = `私教课程台账_${reportStartDate.value}_${reportDate.value}.xlsx`
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        apiError.value = ''
      } catch (error) {
        console.error('生成 XLSX 文件失败。', error)
        apiError.value = '生成 XLSX 文件失败，请重试或检查浏览器下载权限。'
      }
    }

    function openNewOrder() {
      orderFormError.value = ''
      showOrderForm.value = true
    }

    return () => (
      <div class="app-shell">
        <aside class="sidebar">
          <a class="brand" href="#" onClick={(event) => { event.preventDefault(); void navigate('overview') }}>
            <span class="brand-icon">日</span>
            <span class="brand-copy">
              <strong>线条日记</strong>
              <small>SHAPE DARILY</small>
            </span>
          </a>
          <div class="side-label">工作台</div>
          <nav class="main-nav" aria-label="主导航">
            {navItems.map((item) => (
              <button
                type="button"
                class={['nav-item', activePage.value === item.id && 'active']}
                onClick={() => { void navigate(item.id) }}
                key={item.id}
              >
                <span class="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
                {item.id === 'orders' && <span class="nav-count">{orders.value.length}</span>}
              </button>
            ))}
          </nav>
          <div class="sidebar-bottom">
            <div class="mode-card">
              <span class="status-dot" />
              <div><strong>服务端数据模式</strong><small>订单与签到由后端读写</small></div>
            </div>
            <div class="profile">
              <button
                type="button"
                class="profile-button"
                aria-haspopup="dialog"
                onClick={() => { storeError.value = ''; showStoreManager.value = true }}
              >
                <span class="avatar">{activeStore.value?.name.slice(0, 1) ?? '店'}</span>
                <span class="profile-copy"><strong>{activeStore.value?.name ?? (loadingStores.value ? '正在加载门店…' : '门店管理')}</strong><small>切换 / 新增门店</small></span>
                <span class="profile-more">···</span>
              </button>
            </div>
          </div>
        </aside>

        <main class="main-area">
          <header class="topbar">
            <div class="breadcrumb"><span>工作台</span><span class="crumb-sep">/</span><strong>{navItems.find((item) => item.id === activePage.value)?.label}</strong></div>
            <div class="topbar-right">
              <span class="today-label">{today}</span>
              <span class="mode-pill"><i /> 后端接口</span>
            </div>
          </header>

          <div class="content">
            {apiError.value && (
              <div class="notice" role="alert">
                <span>!</span><p>{apiError.value}</p>
                <button type="button" aria-label="关闭提示" onClick={() => { apiError.value = '' }}>×</button>
              </div>
            )}

            {activePage.value === 'overview' && (
              <>
                <section class="page-intro">
                  <div><div class="eyebrow">STUDIO OVERVIEW</div><h1>经营概览</h1><p>记录每一份信任，让课程经营一目了然。</p></div>
                  <button type="button" class="button-primary" onClick={openNewOrder}><span>＋</span> 登记新订单</button>
                </section>
                <section class="metric-grid" aria-label="经营数据">
                  <article class="metric-card">
                    <div class="metric-top"><span>累计销售金额</span><span class="metric-icon sage">¥</span></div>
                    <strong>{metrics.value ? formatMoney(metrics.value.sales) : '--'}</strong>
                    <small>{metrics.value ? `截至 ${reportDate.value}` : '等待后端汇总数据'}</small>
                  </article>
                  <article class="metric-card">
                    <div class="metric-top"><span>订单总数</span><span class="metric-icon blue">▤</span></div>
                    <strong>{metrics.value ? <>{metrics.value.orderCount}<em> 笔</em></> : '--'}</strong>
                    <small>包含私教课与月卡订单</small>
                  </article>
                  <article class="metric-card">
                    <div class="metric-top"><span>私教剩余课时</span><span class="metric-icon amber">◷</span></div>
                    <strong>{metrics.value ? <>{metrics.value.privateSessionsLeft}<em> 次</em></> : '--'}</strong>
                    <small>购买课时及赠送课时</small>
                  </article>
                  <article class="metric-card">
                    <div class="metric-top"><span>累计私教消课</span><span class="metric-icon lilac">✓</span></div>
                    <strong>{metrics.value ? <>{metrics.value.attendanceCount}<em> 次</em></> : '--'}</strong>
                    <small>已登记的定制私教消课记录</small>
                  </article>
                </section>

                <section class="overview-grid">
                  <article class="panel recent-panel">
                    <div class="panel-heading">
                      <div><h2>最近订单</h2><p>查看近期登记的课程订单</p></div>
                      <button class="text-button" type="button" onClick={() => { void navigate('orders') }}>全部订单 <span>→</span></button>
                    </div>
                    {loadingOrders.value ? <div class="history-empty">正在从后端加载订单…</div> : apiError.value && !orders.value.length ? <div class="history-empty"><span>无法读取订单数据，请检查后端服务。</span><button type="button" class="text-button" onClick={() => { void loadOrders() }}>重新加载</button></div> : orders.value.length ? (
                      <div class="table-wrap">
                        <table><thead><tr><th>客户</th><th>课程项目</th><th>类型</th><th>销售金额</th><th>登记日期</th></tr></thead>
                          <tbody>{[...orders.value].sort((a, b) => b.orderDate.localeCompare(a.orderDate)).slice(0, 5).map((order) => (
                            <tr key={order.orderNo}><td><strong class="customer-name">{order.customer}</strong><small class="sub-cell">{order.phone}</small></td><td>{order.courseName}</td><td><span class={['type-tag', order.courseType]}>{order.courseType === 'private' ? '定制私教' : order.courseType === 'monthly' ? '月卡课程' : '套餐'}</span></td><td class="amount-cell">{formatMoney(order.amount)}</td><td>{order.orderDate}</td></tr>
                          ))}</tbody>
                        </table>
                      </div>
                    ) : (
                      <div class="empty-panel"><span class="empty-symbol">＋</span><strong>还没有课程订单</strong><p>登记第一笔订单后，经营数据会显示在这里。</p><button type="button" class="button-secondary" onClick={openNewOrder}>登记新订单</button></div>
                    )}
                  </article>
                  <article class="panel quick-panel">
                    <div class="panel-heading"><div><h2>快捷操作</h2><p>常用台账操作</p></div></div>
                    <button class="quick-action" type="button" onClick={openNewOrder}><span class="quick-icon quick-sage">＋</span><span><strong>生成课程订单</strong><small>登记新客户课程与收款信息</small></span><b>→</b></button>
                    <button class="quick-action" type="button" onClick={() => { void navigate('attendance') }}><span class="quick-icon quick-blue">✓</span><span><strong>批量消课登记</strong><small>按课程关联私教客户并扣减课时</small></span><b>→</b></button>
                    <button class="quick-action" type="button" onClick={() => { void navigate('withdrawals') }}><span class="quick-icon quick-amber">↩</span><span><strong>办理课程退订</strong><small>查询客户订单并退订激活中的课程</small></span><b>→</b></button>
                    <button class="quick-action" type="button" onClick={() => { void navigate('reports') }}><span class="quick-icon quick-amber">↗</span><span><strong>导出统计报表</strong><small>按截止日期生成 XLSX 文件</small></span><b>→</b></button>
                    <div class="quick-note"><span>i</span><p>订单号、消课关联及统计数据均由后端接口提供。</p></div>
                  </article>
                </section>
              </>
            )}

            {activePage.value === 'orders' && (
              <>
                <section class="page-intro">
                  <div><div class="eyebrow">ORDER MANAGEMENT</div><h1>订单台账</h1><p>统一登记定制私教课与月卡课程。</p></div>
                  <button type="button" class="button-primary" onClick={openNewOrder}><span>＋</span> 登记新订单</button>
                </section>
                <section class="panel list-panel">
                  <div class="list-toolbar">
                    <div><h2>课程订单 <span class="count-label">{filteredOrders.value.length} / {orders.value.length}</span></h2><p>订单信息从服务端读取，订单号由后台生成。</p></div>
                    <div class="list-controls">
                      <label class="search-box"><span>⌕</span><input value={orderSearch.value} onInput={(event) => { orderSearch.value = (event.target as HTMLInputElement).value }} placeholder="搜索客户、手机号或订单号" /></label>
                      <select aria-label="按课程类型筛选" value={orderTypeFilter.value} onChange={(event) => { orderTypeFilter.value = (event.target as HTMLSelectElement).value as typeof orderTypeFilter.value }}>
                        <option value="all">全部课程</option><option value="private">定制私教</option><option value="monthly">月卡课程</option><option value="package">套餐</option>
                      </select>
                      <label class="month-filter"><span>起始月</span><input type="month" value={orderStartMonth.value} max={orderEndMonth.value || undefined} onChange={(event) => { orderStartMonth.value = (event.target as HTMLInputElement).value }} /></label>
                      <label class="month-filter"><span>结束月</span><input type="month" value={orderEndMonth.value} min={orderStartMonth.value || undefined} onChange={(event) => { orderEndMonth.value = (event.target as HTMLInputElement).value }} /></label>
                      <button type="button" class="button-secondary export-orders-button" onClick={() => { void exportOrders() }} disabled={exportingOrders.value}>{exportingOrders.value ? '正在导出…' : '导出 Excel'}</button>
                    </div>
                  </div>
                  {loadingOrders.value ? <div class="history-empty">正在从后端加载订单…</div> : apiError.value && !orders.value.length ? <div class="history-empty"><span>无法读取订单数据，请检查后端服务。</span><button type="button" class="text-button" onClick={() => { void loadOrders() }}>重新加载</button></div> : filteredOrders.value.length ? (
                    <div class="table-wrap">
                      <table class="orders-table"><thead><tr><th>订单 / 客户</th><th>课程项目</th><th>课时信息</th><th>销售金额</th><th>支付 / 来源</th><th>业务信息</th><th>登记日期</th></tr></thead>
                        <tbody>{filteredOrders.value.map((order) => (
                          <tr key={order.orderNo}>
                            <td><strong class="order-number">{order.orderNo}</strong><strong class="customer-name">{order.customer}</strong><small class="sub-cell">{order.phone}</small></td>
                            <td><span class={['type-tag', order.courseType]}>{order.courseType === 'private' ? '定制私教' : order.courseType === 'monthly' ? '月卡课程' : '套餐'}</span><strong class="course-cell">{order.courseName}</strong></td>
                            <td>{order.courseType === 'private' ? <><strong>{order.sessions} 次</strong><small class="sub-cell">赠送 {order.gifts} 次</small><small class="sub-cell">有效至 {order.endDate ?? '—'}</small></> : order.courseType === 'monthly' ? <><strong>有效期不限次</strong><small class="sub-cell">{order.startDate ?? order.validFrom} 至 {order.endDate ?? order.validTo}</small></> : <><strong>{order.items?.length ?? 0} 项课程</strong>{order.items?.map((item, index) => <small class="sub-cell" key={`${order.orderNo}-item-${index}`}>{item.courseName} · {formatMoney(item.amount)} · {item.courseType === 'private' ? `私教 ${item.sessions} 次` : `月卡 ${item.startDate} 至 ${item.endDate}`}</small>)}</>}</td>
                            <td class="amount-cell">{formatMoney(order.amount)}</td>
                            <td><strong>{order.payment}</strong><small class="sub-cell">{order.source}</small></td>
                            <td><strong>{order.salesperson || '—'}</strong><small class="sub-cell">{order.isNewMember ? '新会员' : '老会员'}</small><small class="sub-cell">{order.remark || '无备注'}</small></td>
                            <td>{order.orderDate}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : <div class="empty-panel"><span class="empty-symbol">▤</span><strong>{orders.value.length ? '没有找到匹配订单' : '暂无订单记录'}</strong><p>{orders.value.length ? '试试调整搜索关键词或筛选条件。' : '登记订单后，订单信息会保存在此台账中。'}</p>{!orders.value.length && <button type="button" class="button-secondary" onClick={openNewOrder}>登记新订单</button>}</div>}
                </section>
              </>
            )}

            {activePage.value === 'withdrawals' && (
              <>
                <section class="page-intro">
                  <div><div class="eyebrow">COURSE WITHDRAWAL</div><h1>退课登记</h1><p>按客户姓名或手机号查询订单，并为激活中的课程办理退订。</p></div>
                </section>
                <section class="panel withdrawal-panel">
                  <div class="panel-heading"><div><h2>查询客户订单</h2><p>查询结果包含该客户的全部订单，只有激活中的订单可以退订。</p></div></div>
                  <form class="withdrawal-search" onSubmit={searchWithdrawalOrders}>
                    <label class="search-box"><span>⌕</span><input required maxlength={100} value={withdrawalSearch.value} onInput={(event) => { withdrawalSearch.value = (event.target as HTMLInputElement).value }} placeholder="请输入客户姓名或手机号" /></label>
                    <button type="submit" class="button-primary" disabled={searchingWithdrawals.value}>{searchingWithdrawals.value ? '正在查询…' : '查询订单'}</button>
                  </form>
                  {withdrawalError.value && !cancellationOrder.value && <div class="form-error withdrawal-error" role="alert">{withdrawalError.value}</div>}
                  {searchingWithdrawals.value ? <div class="history-empty">正在查询客户订单…</div> : withdrawalResults.value.length ? (
                    <div class="table-wrap">
                      <table class="orders-table withdrawal-table">
                        <thead><tr><th>订单 / 客户</th><th>课程项目</th><th>课时信息</th><th>签到次数</th><th>销售金额</th><th>登记日期</th><th>订单状态</th><th>操作</th></tr></thead>
                        <tbody>{withdrawalResults.value.map((order) => (
                          <tr key={order.orderNo}>
                            <td><strong class="order-number">{order.orderNo}</strong><strong class="customer-name">{order.customer}</strong><small class="sub-cell">{order.phone}</small></td>
                            <td><span class={['type-tag', order.courseType]}>{order.courseType === 'private' ? '定制私教' : order.courseType === 'monthly' ? '月卡课程' : '套餐'}</span><strong class="course-cell">{order.courseName}</strong></td>
                            <td>{order.courseType === 'private' ? <strong>{formatSessionCount(order.sessions, order.gifts || 0)}</strong> : order.courseType === 'monthly' ? <><strong>有效期不限次</strong><small class="sub-cell">{order.startDate ?? order.validFrom} 至 {order.endDate ?? order.validTo}</small></> : <><strong>{order.items?.length ?? 0} 项课程</strong>{order.items?.map((item, index) => <small class="sub-cell" key={`${order.orderNo}-withdrawal-item-${index}`}>{item.courseName} · {item.courseType === 'private' ? `私教 ${formatSessionCount(item.sessions, item.gifts || 0)}` : `月卡 ${item.startDate} 至 ${item.endDate}`}</small>)}</>}</td>
                            <td>{order.courseType === 'package'
                              ? order.items?.map((item, index) => <small class="sub-cell" key={`${order.orderNo}-attendance-${index}`}>{item.courseName}：{item.courseType === 'private' ? `${item.attendance_time ?? 0} 次` : '未登记'}</small>)
                              : order.courseType === 'private'
                                ? <strong>{order.attendance_time ?? 0} 次</strong>
                                : <span class="muted-cell">未登记</span>}</td>
                            <td class="amount-cell">{formatMoney(order.amount)}</td>
                            <td>{order.orderDate}</td>
                            <td><span class={['withdrawal-status', order.status]}>{order.status === 'active' ? '激活中' : '已失效'}</span>{order.cancelDate && <small class="sub-cell">退订日期 {order.cancelDate}</small>}{order.cancelAmount !== null && order.cancelAmount !== undefined && <small class="sub-cell">退订金额 {formatMoney(order.cancelAmount)}</small>}{order.cancelReason && <small class="sub-cell">理由：{order.cancelReason}</small>}</td>
                            <td>{order.status === 'active' ? <button type="button" class="button-danger" disabled={cancellingOrderNo.value !== ''} onClick={() => { openCancellation(order) }}>办理退订</button> : <span class="muted-cell">不可退订</span>}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : <div class="empty-panel"><span class="empty-symbol">↩</span><strong>{withdrawalSearch.value.trim() ? '没有找到该客户的订单' : '尚未查询订单'}</strong><p>{withdrawalSearch.value.trim() ? '请核对客户姓名或手机号后重试。' : '输入客户姓名或手机号后查询其全部订单。'}</p></div>}
                </section>
              </>
            )}

            {activePage.value === 'attendance' && (
              <>
                <section class="page-intro">
                  <div><div class="eyebrow">PRIVATE SESSION</div><h1>消课登记</h1><p>选择定制私教课程，登记到课客户并扣减对应订单课时。</p></div>
                  {/*
                  <div class="attendance-total"><strong>{attendances.value.length}</strong><span>条累计签到</span></div>
                  */}
                </section>
                <section class="attendance-layout">
                  <form class="panel attendance-form" onSubmit={registerAttendance}>
                    <div class="panel-heading"><div><h2>批量消课</h2><p>每行输入一位客户姓名，按所选课程匹配仍有剩余课时的私教订单。</p></div><span class="step-badge">01 — 02</span></div>
                    <label class="field"><span>定制私教课程项目 <b>*</b></span>
                      <select required value={attendanceCourse.value} onChange={(event) => { attendanceCourse.value = (event.target as HTMLSelectElement).value; attendanceResults.value = [] }}>
                        <option value="">请选择课程项目</option>{privateCourses.value.map((course) => <option value={course} key={course}>{course}</option>)}
                      </select>
                      {!privateCourses.value.length && <small class="field-help">后端暂未返回定制私教课程，请确认是否已有私教订单及接口状态。</small>}
                    </label>
                    <label class="field"><span>上课日期和时间 <b>*</b></span><input type="datetime-local" required value={attendanceDateTime.value} onInput={(event) => { attendanceDateTime.value = (event.target as HTMLInputElement).value; attendanceResults.value = [] }} /></label>
                    <label class="field"><span>授课老师 <b>*</b></span><input required maxlength={40} value={attendanceTeacher.value} onInput={(event) => { attendanceTeacher.value = (event.target as HTMLInputElement).value; attendanceResults.value = [] }} placeholder="请输入授课老师姓名" /></label>
                    <label class="field"><span>上课客户姓名 <b>*</b></span>
                      <textarea required rows={7} value={attendanceNames.value} onInput={(event) => { attendanceNames.value = (event.target as HTMLTextAreaElement).value }} placeholder={'每行一位客户姓名\n例如：\n林晓\n陈可'} />
                      <small class="field-help">系统按客户姓名和课程项目，优先关联最近登记且仍有剩余课时的私教订单。</small>
                    </label>
                    <div class="form-actions"><span>每位成功匹配的客户将扣减 1 个私教课时。</span><button type="submit" class="button-primary" disabled={!privateCourses.value.length || submittingAttendance.value}>{submittingAttendance.value ? '正在提交…' : <>确认消课 <span>→</span></>}</button></div>
                  </form>
                  <aside class="attendance-side">
                    <article class="panel rule-card"><div class="rule-icon">i</div><h3>消课规则</h3><ul><li>只匹配选定课程的定制私教订单，月卡课程不消课。</li><li>每位客户每次登记扣减 1 个购买或赠送课时。</li><li>同名客户有多笔订单时，优先关联最近且仍有余课的订单。</li><li>无匹配订单或课时已用完的客户不会登记消课。</li></ul></article>
                    <article class="panel result-card">
                      <div class="panel-heading"><div><h3>登记结果</h3><p>提交后查看每位客户的匹配情况</p></div></div>
                      {attendanceResults.value.length ? (
                        <ul class="result-list">{attendanceResults.value.map((result, index) => <li class={result.matched ? 'matched' : 'unmatched'} key={`${result.name}-${index}`}><span>{result.matched ? '✓' : '!'}</span><div><strong>{result.name}</strong><small>{result.detail}</small></div></li>)}</ul>
                      ) : <div class="result-empty">提交消课名单后，匹配结果会显示在这里。</div>}
                    </article>
                  </aside>
                </section>
                {/*
                <section class="panel attendance-history">
                  <div class="panel-heading"><div><h2>最近签到</h2><p>从后端读取已登记的月卡到课记录</p></div><span class="count-label">{attendances.value.length} 条记录</span></div>
                  {loadingAttendance.value ? <div class="history-empty">正在从后端加载签到记录…</div> : apiError.value && !attendances.value.length ? <div class="history-empty"><span>无法读取签到记录，请检查后端服务。</span><button type="button" class="text-button" onClick={() => { void loadAttendancePage() }}>重新加载</button></div> : attendances.value.length ? <div class="table-wrap"><table><thead><tr><th>签到日期</th><th>客户</th><th>课程项目</th><th>关联订单</th><th>消课</th></tr></thead><tbody>{[...attendances.value].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((item) => <tr key={item.id}><td>{item.date}</td><td><strong class="customer-name">{item.customer}</strong><small class="sub-cell">{item.phone}</small></td><td>{item.courseName}</td><td class="order-number">{item.orderNo}</td><td><span class="consumed-tag">− 1 次</span></td></tr>)}</tbody></table></div> : <div class="history-empty">还没有签到记录</div>}
                </section>
                */}
              </>
            )}

            {activePage.value === 'reports' && (
              <>
                <section class="page-intro">
                  <div><div class="eyebrow">LEDGER REPORTS</div><h1>统计汇总</h1><p>按指定日期范围汇总客户购买、赠送与消课信息。</p></div>
                  <div class="report-actions">
                    <label class="date-picker"><span>统计起始日期</span><input type="date" value={reportStartDate.value} max={reportDate.value} onChange={(event) => { const value = (event.target as HTMLInputElement).value; reportStartDate.value = value; if (value > reportDate.value) reportDate.value = value; void loadReport() }} /></label>
                    <label class="date-picker"><span>统计截止日期</span><input type="date" value={reportDate.value} min={reportStartDate.value} onChange={(event) => { reportDate.value = (event.target as HTMLInputElement).value; void loadReport() }} /></label>
                    <button type="button" class="button-primary" onClick={exportReport} disabled={loadingReport.value || !metrics.value}><span>↓</span> 导出 XLSX</button>
                  </div>
                </section>
                <section class="report-metrics">
                  <article class="report-metric"><span>统计期间销售额</span><strong>{metrics.value ? formatMoney(metrics.value.sales) : '--'}</strong></article>
                  <article class="report-metric"><span>客户 / 课程组合</span><strong>{summaryRows.value.length}<em> 组</em></strong></article>
                  <article class="report-metric"><span>累计私教消课</span><strong>{metrics.value ? <>{metrics.value.attendanceCount}<em> 次</em></> : '--'}</strong></article>
                  <article class="report-metric"><span>私教剩余课时</span><strong>{metrics.value ? <>{metrics.value.privateSessionsLeft}<em> 次</em></> : '--'}</strong></article>
                </section>
                <section class="panel report-panel">
                  <div class="panel-heading"><div><h2>客户课时汇总</h2><p>统计期间 {reportStartDate.value} 至 {reportDate.value} 的订单与消课记录</p></div><span class="count-label">{summaryRows.value.length} 项</span></div>
                  {summaryRows.value.length ? (
                    <div class="table-wrap"><table class="report-table"><thead><tr><th>客户</th><th>课程项目</th><th>类型</th><th>购买课时</th><th>赠送</th><th>已消课</th><th>剩余课时</th><th>销售金额</th></tr></thead><tbody>{summaryRows.value.map((row, index) => <tr key={`${row.customer}-${row.courseName}-${index}`}><td><strong class="customer-name">{row.customer}</strong><small class="sub-cell">{row.phone}</small></td><td>{row.courseName}<small class="sub-cell">{row.orders} 笔订单</small></td><td><span class={['type-tag', row.courseType]}>{row.courseType === 'private' ? '定制私教' : '月卡课程'}</span></td><td>{row.purchased === null ? <span class="unlimited">不限次</span> : `${row.purchased} 次`}</td><td>{row.gifts ? `${row.gifts} 次` : '—'}</td><td>{row.consumed} 次</td><td>{row.remaining === null ? <span class="unlimited">不限次</span> : <strong>{row.remaining} 次</strong>}</td><td class="amount-cell">{formatMoney(row.amount)}</td></tr>)}</tbody></table></div>
                  ) : loadingReport.value ? <div class="history-empty">正在从后端计算统计数据…</div> : !report.value ? <div class="empty-panel"><span class="empty-symbol">!</span><strong>无法加载统计数据</strong><p>请确认后端统计接口可用后重试。</p><button type="button" class="button-secondary" onClick={() => { void loadReport() }}>重新加载</button></div> : <div class="empty-panel"><span class="empty-symbol">▥</span><strong>该截止日期暂无统计数据</strong><p>截止日期前没有可汇总的课程订单。</p></div>}
                  <div class="report-footnote"><span>i</span>私教订单按购买及赠送课时消课；月卡课程按订单日期范围提供训练，不扣减课时。</div>
                </section>
              </>
            )}
            <footer class="app-footer"><span>练习簿 · 私教课程台账</span><span>业务数据由后端接口读写 · 汇总报表由后端计算</span></footer>
          </div>
        </main>

        {cancellationOrder.value && (
          <div class="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !cancellingOrderNo.value) cancellationOrder.value = null }}>
            <section class="order-modal cancellation-modal" role="dialog" aria-modal="true" aria-labelledby="cancellation-modal-title">
              <div class="modal-heading">
                <div><div class="eyebrow">COURSE WITHDRAWAL</div><h2 id="cancellation-modal-title">办理课程退订</h2><p>{cancellationOrder.value.customer} · {cancellationOrder.value.courseName} · 订单金额 {formatMoney(cancellationOrder.value.amount)}</p></div>
                <button class="close-button" type="button" aria-label="关闭" disabled={cancellingOrderNo.value !== ''} onClick={() => { cancellationOrder.value = null }}>×</button>
              </div>
              <form onSubmit={cancelCustomerOrder}>
                <div class="form-grid">
                  <label class="field"><span>退订金额（元） <b>*</b></span><input required type="number" min={0} max={cancellationOrder.value.amount} step={0.01} value={cancellationAmount.value} onInput={(event) => { cancellationAmount.value = (event.target as HTMLInputElement).value }} placeholder="请输入退订金额" /></label>
                  <label class="field form-grid-wide"><span>退订理由 <b>*</b></span><textarea required rows={3} maxlength={500} value={cancellationReason.value} onInput={(event) => { cancellationReason.value = (event.target as HTMLTextAreaElement).value }} placeholder="请填写退订原因" /></label>
                </div>
                {withdrawalError.value && <div class="form-error" role="alert">{withdrawalError.value}</div>}
                <div class="modal-footer"><span><b>*</b> 退订金额不可超过订单金额，提交后订单将失效。</span><div><button type="button" class="button-secondary" disabled={cancellingOrderNo.value !== ''} onClick={() => { cancellationOrder.value = null }}>取消</button><button type="submit" class="button-danger cancellation-submit" disabled={cancellingOrderNo.value !== ''}>{cancellingOrderNo.value ? '正在提交…' : '确认退订'}</button></div></div>
              </form>
            </section>
          </div>
        )}

        {showOrderForm.value && (
          <div class="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) showOrderForm.value = false }}>
            <section class="order-modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
              <div class="modal-heading"><div><div class="eyebrow">NEW COURSE ORDER</div><h2 id="order-modal-title">登记新订单</h2><p>录入客户课程与支付信息，订单号由后端生成。</p></div><button class="close-button" type="button" aria-label="关闭" onClick={() => { showOrderForm.value = false }}>×</button></div>
              <form onSubmit={createOrder}>
                <div class="form-grid">
                  <label class="field"><span>客户姓名 <b>*</b></span><input required maxlength={40} value={orderDraft.value.customer} onInput={(event) => { orderDraft.value.customer = (event.target as HTMLInputElement).value }} placeholder="请输入客户姓名" /></label>
                  <label class="field"><span>手机号码 <b>*</b></span><input required type="tel" maxlength={20} value={orderDraft.value.phone} onInput={(event) => { orderDraft.value.phone = (event.target as HTMLInputElement).value }} placeholder="请输入联系电话" /></label>
                  <label class="field"><span>课程类型 <b>*</b></span><select value={orderDraft.value.courseType} onChange={(event) => { orderDraft.value.courseType = (event.target as HTMLSelectElement).value as OrderType }}><option value="private">定制私教课（按课时）</option><option value="monthly">月卡课程（按月收费）</option><option value="package">套餐（组合课程）</option></select></label>
                  <label class="field"><span>{orderDraft.value.courseType === 'package' ? '套餐名称' : '课程项目'} <b>*</b></span><input required maxlength={60} value={orderDraft.value.courseName} onInput={(event) => { orderDraft.value.courseName = (event.target as HTMLInputElement).value }} placeholder={orderDraft.value.courseType === 'package' ? '例如：塑形进阶套餐' : '例如：体态改善 / 团体训练'} /></label>
                  {orderDraft.value.courseType === 'private' ? <>
                    <label class="field"><span>购买课时（次） <b>*</b></span><input required type="number" min={1} step={1} value={orderDraft.value.sessions} onInput={(event) => { orderDraft.value.sessions = Number((event.target as HTMLInputElement).value) }} /></label>
                    <label class="field"><span>赠送课时（次）</span><input type="number" min={0} step={1} value={orderDraft.value.gifts} onInput={(event) => { orderDraft.value.gifts = Number((event.target as HTMLInputElement).value) }} /></label>
                    <label class="field"><span>订单结束日期 <b>*</b></span><input required type="date" value={orderDraft.value.endDate} onInput={(event) => { orderDraft.value.endDate = (event.target as HTMLInputElement).value }} /></label>
                  </> : orderDraft.value.courseType === 'monthly' ? <>
                    <label class="field"><span>订单起始日期 <b>*</b></span><input required type="date" value={orderDraft.value.startDate} onInput={(event) => { orderDraft.value.startDate = (event.target as HTMLInputElement).value }} /></label>
                    <label class="field"><span>订单结束日期 <b>*</b></span><input required type="date" min={orderDraft.value.startDate} value={orderDraft.value.endDate} onInput={(event) => { orderDraft.value.endDate = (event.target as HTMLInputElement).value }} /></label>
                    <div class="month-note"><span>◷</span><span>订单起止日期均包含在有效期内，月卡课程不登记消课。</span></div>
                  </> : <>
                    <div class="package-items form-grid-wide">
                      <div class="package-items-heading"><strong>套餐课程明细</strong><button class="text-button" type="button" onClick={addPackageItem}>＋ 添加课程</button></div>
                      <div class="month-note"><span>i</span><span>每项课程分别定价，套餐总价自动汇总所有课程金额。</span></div>
                      {orderDraft.value.packageItems.map((item, index) => (
                        <article class="package-item" key={`package-item-${index}`}>
                          <div class="package-item-heading"><strong>课程 {index + 1}</strong>{orderDraft.value.packageItems.length > 1 && <button class="text-button" type="button" onClick={() => { orderDraft.value.packageItems.splice(index, 1) }}>移除</button>}</div>
                          <div class="form-grid">
                            <label class="field"><span>课程类型 <b>*</b></span><select value={item.courseType} onChange={(event) => { item.courseType = (event.target as HTMLSelectElement).value as CourseType; item.startDate = item.courseType === 'monthly' ? today : null }}><option value="private">定制私教</option><option value="monthly">月卡课程</option></select></label>
                            <label class="field"><span>课程项目 <b>*</b></span><input required maxlength={60} value={item.courseName} onInput={(event) => { item.courseName = (event.target as HTMLInputElement).value }} placeholder="请输入套餐内课程名称" /></label>
                            <label class="field"><span>课程金额（元） <b>*</b></span><input required type="number" min={0} step={0.01} value={item.amount} onInput={(event) => { item.amount = Number((event.target as HTMLInputElement).value) }} /></label>
                            {item.courseType === 'private' ? <>
                              <label class="field"><span>购买课时（次） <b>*</b></span><input required type="number" min={1} step={1} value={item.sessions ?? 1} onInput={(event) => { item.sessions = Number((event.target as HTMLInputElement).value) }} /></label>
                              <label class="field"><span>赠送课时（次）</span><input type="number" min={0} step={1} value={item.gifts} onInput={(event) => { item.gifts = Number((event.target as HTMLInputElement).value) }} /></label>
                              <label class="field"><span>课程结束日期 <b>*</b></span><input required type="date" value={item.endDate} onInput={(event) => { item.endDate = (event.target as HTMLInputElement).value }} /></label>
                            </> : <>
                              <label class="field"><span>课程起始日期 <b>*</b></span><input required type="date" value={item.startDate ?? today} onInput={(event) => { item.startDate = (event.target as HTMLInputElement).value }} /></label>
                              <label class="field"><span>课程结束日期 <b>*</b></span><input required type="date" min={item.startDate ?? today} value={item.endDate} onInput={(event) => { item.endDate = (event.target as HTMLInputElement).value }} /></label>
                            </>}
                          </div>
                        </article>
                      ))}
                    </div>
                  </>}
                  {orderDraft.value.courseType === 'package' ? (
                    <label class="field"><span>套餐总金额（元）</span><input type="number" value={packageTotal.value.toFixed(2)} readonly /></label>
                  ) : (
                    <label class="field"><span>销售金额（元） <b>*</b></span><input required type="number" min={0.01} step={0.01} value={orderDraft.value.amount || ''} onInput={(event) => { orderDraft.value.amount = Number((event.target as HTMLInputElement).value) }} placeholder="0.00" /></label>
                  )}
                  <label class="field"><span>支付方式 <b>*</b></span><select value={paymentLabels.includes(orderDraft.value.payment) ? orderDraft.value.payment : '其他'} onChange={(event) => { orderDraft.value.payment = (event.target as HTMLSelectElement).value as PaymentMethod }}>{([...paymentLabels, '其他'] as PaymentMethod[]).map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
                  {(! paymentLabels.includes(orderDraft.value.payment)) && (
                    <label class="field">
                      <span>自定义支付方式 <b>*</b></span>
                      <input
                        required
                        maxlength={40}
                        value={orderDraft.value.payment === '其他' ? '' : orderDraft.value.payment}
                        onInput={(event) => { orderDraft.value.payment = (event.target as HTMLInputElement).value }}
                        placeholder="请输入支付方式"
                      />
                    </label>
                    )}
                  <label class="field"><span>客户来源 <b>*</b></span><select value={sourceLabels.includes(orderDraft.value.source) ? orderDraft.value.source : '其他'} onChange={(event) => { orderDraft.value.source = (event.target as HTMLSelectElement).value }}>{([...sourceLabels, '其他']).map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
                  {!sourceLabels.includes(orderDraft.value.source) && (
                    <label class="field">
                      <span>自定义客户来源 <b>*</b></span>
                      <input
                        required
                        maxlength={40}
                        value={orderDraft.value.source === '其他' ? '' : orderDraft.value.source}
                        onInput={(event) => { orderDraft.value.source = (event.target as HTMLInputElement).value }}
                        placeholder="请输入客户来源"
                      />
                    </label>
                  )}
                  <label class="field"><span>登记日期 <b>*</b></span><input required type="date" value={orderDraft.value.orderDate} onInput={(event) => { orderDraft.value.orderDate = (event.target as HTMLInputElement).value }} /></label>
                  <label class="field"><span>业务员</span><input maxlength={40} value={orderDraft.value.salesperson} onInput={(event) => { orderDraft.value.salesperson = (event.target as HTMLInputElement).value }} placeholder="请输入业务员姓名" /></label>
                  <fieldset class="field radio-field"><legend>新会员</legend><div class="radio-options" role="radiogroup" aria-label="是否新会员">
                    <label><input type="radio" name="isNewMember" checked={orderDraft.value.isNewMember} onChange={() => { orderDraft.value.isNewMember = true }} />是</label>
                    <label><input type="radio" name="isNewMember" checked={!orderDraft.value.isNewMember} onChange={() => { orderDraft.value.isNewMember = false }} />否</label>
                  </div></fieldset>
                  <label class="field form-grid-wide"><span>备注</span><textarea rows={2} maxlength={500} value={orderDraft.value.remark} onInput={(event) => { orderDraft.value.remark = (event.target as HTMLTextAreaElement).value }} placeholder="可填写订单补充说明" /></label>
                </div>
                {orderFormError.value && <div class="form-error" role="alert">{orderFormError.value}</div>}
                <div class="modal-footer"><span><b>*</b> 为必填项。订单号由后端生成并保存。</span><div><button type="button" class="button-secondary" onClick={() => { showOrderForm.value = false }}>取消</button><button type="submit" class="button-primary" disabled={submittingOrder.value}>{submittingOrder.value ? '正在提交…' : <>确认登记 <span>→</span></>}</button></div></div>
              </form>
            </section>
          </div>
        )}
        {showStoreManager.value && (
          <div class="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) showStoreManager.value = false }}>
            <section class="store-modal" role="dialog" aria-modal="true" aria-labelledby="store-modal-title">
              <div class="modal-heading">
                <div><div class="eyebrow">STORE MANAGEMENT</div><h2 id="store-modal-title">门店管理</h2><p>每个门店使用独立账本，订单、消课及报表互不影响。</p></div>
                <button class="close-button" type="button" aria-label="关闭" onClick={() => { showStoreManager.value = false }}>×</button>
              </div>
              <div class="store-list-heading"><strong>选择门店</strong><span>{stores.value.length} 家</span></div>
              {loadingStores.value ? <div class="history-empty">正在加载门店…</div> : (
                <ul class="store-list">
                  {stores.value.map((store) => editingStoreId.value === store.id ? (
                    <li class="store-list-item editing" key={store.id}>
                      <form class="store-rename-form" onSubmit={saveStoreName}>
                        <label class="field"><span>修改门店名称</span><input autofocus required maxlength={40} value={editingStoreName.value} onInput={(event) => { editingStoreName.value = (event.target as HTMLInputElement).value }} /></label>
                        <div class="store-rename-actions">
                          <button type="button" class="button-secondary" disabled={creatingStore.value} onClick={() => { editingStoreId.value = ''; storeError.value = '' }}>取消</button>
                          <button type="submit" class="button-primary" disabled={creatingStore.value}>{creatingStore.value ? '正在保存…' : '保存'}</button>
                        </div>
                      </form>
                    </li>
                  ) : (
                    <li class="store-list-item" key={store.id}>
                      <button
                        type="button"
                        class={['store-option', store.id === activeStoreId.value && 'selected']}
                        disabled={switchingStore.value || creatingStore.value}
                        onClick={() => { void switchStore(store) }}
                      >
                        <span class="store-option-avatar">{store.name.slice(0, 1)}</span>
                        <span><strong>{store.name}</strong><small>{store.id === activeStoreId.value ? '当前账本' : '点击切换到此门店'}</small></span>
                        <span class="store-option-check">{store.id === activeStoreId.value ? '✓' : '→'}</span>
                      </button>
                      <button
                        type="button"
                        class="store-rename-button"
                        disabled={creatingStore.value || switchingStore.value}
                        onClick={() => { startEditingStore(store) }}
                      >修改名称</button>
                    </li>
                  ))}
                </ul>
              )}
              <form class="store-create" onSubmit={createStore}>
                <label class="field"><span>新增门店</span><input maxlength={40} value={newStoreName.value} onInput={(event) => { newStoreName.value = (event.target as HTMLInputElement).value }} placeholder="输入门店名称，例如：城西店" /></label>
                {storeError.value && <div class="form-error" role="alert">{storeError.value}</div>}
                <div class="modal-footer"><span>新门店将创建空白账本。</span><div><button type="submit" class="button-primary" disabled={creatingStore.value || switchingStore.value}>{creatingStore.value ? '正在创建…' : '＋ 创建门店'}</button></div></div>
              </form>
            </section>
          </div>
        )}
      </div>
    )
  },
})
