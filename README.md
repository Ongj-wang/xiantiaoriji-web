# 私教课程台账 Web

基于 Vue 3、TypeScript、TSX 和 Vite 的私教课程台账前端。订单、课程、签到和汇总数据均通过 HTTP API 从后端读取或写入；浏览器仅在本地保存当前选中的门店，业务数据不保存在前端，也不生成订单号或计算业务汇总。

## 开发

```sh
npm install
npm run dev
```

开发服务器默认将 `/api` 请求代理到 `http://127.0.0.1:5000`。可在 `web/.env.local` 中设置 `VITE_BACKEND_URL` 更改代理目标。生产环境可设置 `VITE_API_BASE_URL` 为后端 API 根地址。

## 前端使用的 API 约定

日期使用 `YYYY-MM-DD`，普通课程类型为 `private` 或 `monthly`，订单类型另支持 `package` 套餐。消课只针对按课时收费的 `private` 定制私教课程；`monthly` 月卡课程不消课。成功响应为 JSON；失败响应建议使用 HTTP 错误状态码和 `{ "error": "错误说明" }`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/stores` | 获取门店列表，返回 `{ "stores": Store[] }` |
| POST | `/api/stores` | 创建空白门店账本，请求体为 `{ "name": "门店名称" }` |
| GET | `/api/orders` | 获取订单，返回 `{ "orders": Order[] }` |
| GET | `/api/orders/search?query=客户姓名或手机号` | 按客户姓名或手机号模糊查询全部订单 |
| POST | `/api/orders/cancel` | 退订一个激活中的订单，将订单及套餐明细转为失效状态 |
| GET | `/api/orders/export` | 按当前订单筛选条件生成并下载 XLSX 文件 |
| POST | `/api/orders` | 新建订单，服务端生成唯一订单号并返回 `{ "order": Order }` |
| GET | `/api/courses?course_type=private` | 获取定制私教课程，返回 `{ "courses": string[] }` |
| GET | `/api/attendance` | 获取签到记录，返回 `{ "attendances": Attendance[] }` |
| POST | `/api/attendance` | 批量签到并由服务端匹配订单，返回 `{ "results": AttendanceResult[] }` |
| GET | `/api/reports?start_date=YYYY-MM-DD&cutoff_date=YYYY-MM-DD` | 由服务端按统计起始日期（含）和截止日期（含）计算统计汇总 |

订单、课程、消课、退课和报表请求均通过 `X-Store-Id` 请求头指定门店；每个门店的 SQLite 账本独立存放。新增门店后会自动切换到该门店的空账本。首次启动会创建“宝龙门店”；原有 `data/orders.db` 不会自动迁移、覆盖或删除。

退订请求体为 `{ "orderNo": "订单号", "cancelAmount": 300, "cancelReason": "客户个人原因" }`。退订金额须为 0 或正数、最多两位小数且不超过订单金额，退订理由必填且最多 500 字。只有 `active_orders` 中的订单可以退订；后端会将订单状态更新为 `disactive`，写入当天的 `cancelDate`、退订金额 `cancelAmount` 和退订理由 `cancelReason`，并将其从 `active_orders` 移入 `disactive_orders`。退订套餐时，套餐主订单及其每条 `package_items` 明细都会保存相同的退订日期、金额和理由；套餐明细同时从 `active_package_items` 移入 `disactive_package_items`。

新建普通订单请求体：

```json
{
  "customer": "客户姓名",
  "phone": "手机号",
  "courseName": "课程项目",
  "courseType": "private",
  "sessions": 10,
  "gifts": 1,
  "amount": 3000,
  "payment": "微信",
  "source": "自然到店",
  "salesperson": "业务员姓名",
  "remark": "订单备注",
  "isNewMember": true,
  "orderDate": "2026-10-25",
  "startDate": null,
  "endDate": "2026-12-31"
}
```

所有订单都包含 `salesperson`（业务员，可空）、`remark`（备注，可空）、`isNewMember`（是否新会员，布尔值）和 `orderDate`（登记日期，`YYYY-MM-DD`，前端默认今天）。后端未收到登记日期时也默认使用当天。定制私教订单需要填写 `endDate`；月卡订单需要填写 `startDate` 和 `endDate`，日期格式为 `YYYY-MM-DD`，月卡结束日期不得早于起始日期。订单号由后端生成。旧订单中的 `month`、`monthStart`、`monthEnd` 字段仅用于兼容历史数据。消课请求体为 `{ "courseName": "定制私教课程", "date": "YYYY-MM-DD HH:MM", "teacher": "授课老师", "customers": ["客户姓名"] }`，`date` 同时保存上课日期和消课时间，`teacher` 为必填授课老师姓名；旧客户端仍可只传 `YYYY-MM-DD`，但需提供 `teacher`。后端只匹配所选课程和客户的 `private` 订单，并以 `sessions + gifts - 已消课次数` 判断是否有余课；每次成功登记消耗 1 次。无余课或仅有月卡订单的客户不会新增消课记录。同一批次中重复的客户姓名只登记一次。

套餐订单的 `courseType` 为 `package`，`courseName` 是套餐名称，使用 `items` 数组记录组成课程。每项包含 `courseType`（`private` 或 `monthly`）、`courseName`、`amount`、`sessions`、`gifts`、`startDate`、`endDate`。私教项填写金额、课时、赠送课时和结束日期；月卡项填写金额和起止日期。订单总金额必须等于所有课程明细金额之和（精确到分），前端自动汇总，后端校验；每个课程金额保存在 `package_items` 表中并随明细返回。套餐仍共用一个订单号。套餐中的私教项目可单独消课，月卡项目不消课。套餐明细另由 `active_package_items` 和 `disactive_package_items` 按状态维护；月卡明细超过结束日期后转入失效表，已耗尽课时的私教明细也会转入失效表。启动时会依据 `package_items` 主表状态同步这两张表。

套餐请求示例：

```json
{
  "customer": "客户姓名",
  "phone": "手机号",
  "courseName": "塑形组合",
  "courseType": "package",
  "sessions": null,
  "gifts": 0,
  "amount": 5000,
  "payment": "微信",
  "source": "自然到店",
  "salesperson": "业务员姓名",
  "remark": "",
  "isNewMember": true,
  "orderDate": "2026-10-25",
  "startDate": null,
  "endDate": null,
  "items": [
    {
      "courseType": "private",
      "courseName": "一对一私教",
      "amount": 4200,
      "sessions": 10,
      "gifts": 1,
      "startDate": null,
      "endDate": "2026-12-31"
    },
    {
      "courseType": "monthly",
      "courseName": "瑜伽月卡",
      "amount": 800,
      "sessions": null,
      "gifts": 0,
      "startDate": "2026-11-01",
      "endDate": "2026-11-30"
    }
  ]
}
```

订单台账可按登记月份起止范围、课程类型和客户/手机号/订单号/课程名称搜索。`GET /api/orders/export` 接收同名筛选参数 `start_month`、`end_month`（格式 `YYYY-MM`，边界包含）、`course_type`（`all`、`private` 或 `monthly`）及 `search`，返回由后端生成的 `.xlsx` 文件；导出行与订单台账当前显示的筛选结果一致。

`GET /api/attendance` 返回 `{ "attendances": Attendance[] }`。`POST /api/attendance` 返回 `{ "results": [{ "name": "客户姓名", "matched": true, "detail": "已关联订单号" }] }`。签到记录用于定制私教消课；月卡课程无需消课。

统计页面通过 `start_date` 和 `cutoff_date` 指定统计期间，两个日期均包含在范围内，且起始日期不得晚于截止日期。统计接口返回 `{ "cutoffDate", "sales", "orderCount", "attendanceCount", "privateSessionsLeft", "summaryRows", "attendances" }`。其中 `summaryRows` 包含客户、课程、购买/赠送/已消/剩余课时和销售额；`attendances` 是统计期间内用于导出明细的消课记录。XLSX 文件由前端根据这份后端汇总结果生成。经营概览仍仅按截止日期请求汇总。

Flask 服务在 `service/FlaskServer.py` 中实现上述 API；将前端生产构建产物放入仓库根目录的 `static` 后，访问 `http://localhost:5000/` 即可打开网页，服务同时提供 `static/assets` 下的前端资源。PyInstaller 打包后，配置和数据库目录位于 exe 同级目录；前端资源可放在 exe 同级的 `static` 目录，或通过 PyInstaller 的 `--add-data` 打包到应用资源目录。前端在服务不可用或接口异常时会显示请求错误，不会回退到本地模拟数据。

## 构建

```sh
npm run build
npm run preview
```
