# 私教课程台账 Web

基于 Vue 3、TypeScript、TSX 和 Vite 的私教课程台账前端。订单、课程、签到和汇总数据均通过 HTTP API 从后端读取或写入；前端不使用本地存储，也不生成订单号或计算业务汇总。

## 开发

```sh
npm install
npm run dev
```

开发服务器默认将 `/api` 请求代理到 `http://127.0.0.1:5000`。可在 `web/.env.local` 中设置 `VITE_BACKEND_URL` 更改代理目标。生产环境可设置 `VITE_API_BASE_URL` 为后端 API 根地址。

## 前端使用的 API 约定

日期使用 `YYYY-MM-DD`，课程类型为 `private` 或 `monthly`。消课只针对按课时收费的 `private` 定制私教订单；`monthly` 月卡课程不消课。成功响应为 JSON；失败响应建议使用 HTTP 错误状态码和 `{ "error": "错误说明" }`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/orders` | 获取订单，返回 `{ "orders": Order[] }` |
| GET | `/api/orders/export` | 按当前订单筛选条件生成并下载 XLSX 文件 |
| POST | `/api/orders` | 新建订单，服务端生成唯一订单号并返回 `{ "order": Order }` |
| GET | `/api/courses?course_type=private` | 获取定制私教课程，返回 `{ "courses": string[] }` |
| GET | `/api/attendance` | 获取签到记录，返回 `{ "attendances": Attendance[] }` |
| POST | `/api/attendance` | 批量签到并由服务端匹配订单，返回 `{ "results": AttendanceResult[] }` |
| GET | `/api/reports?start_date=YYYY-MM-DD&cutoff_date=YYYY-MM-DD` | 由服务端按统计起始日期（含）和截止日期（含）计算统计汇总 |

新建订单请求体：

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

所有订单都包含 `salesperson`（业务员，可空）、`remark`（备注，可空）、`isNewMember`（是否新会员，布尔值）和 `orderDate`（登记日期，`YYYY-MM-DD`，前端默认今天）。后端未收到登记日期时也默认使用当天。定制私教订单需要填写 `endDate`；月卡订单需要填写 `startDate` 和 `endDate`，日期格式为 `YYYY-MM-DD`，月卡结束日期不得早于起始日期。订单号由后端生成。旧订单中的 `month`、`monthStart`、`monthEnd` 字段仅用于兼容历史数据。消课请求体为 `{ "courseName": "定制私教课程", "date": "YYYY-MM-DD", "customers": ["客户姓名"] }`。后端只匹配所选课程和客户的 `private` 订单，并以 `sessions + gifts - 已消课次数` 判断是否有余课；每次成功登记消耗 1 次。无余课或仅有月卡订单的客户不会新增消课记录。同一批次中重复的客户姓名只登记一次。

订单台账可按登记月份起止范围、课程类型和客户/手机号/订单号/课程名称搜索。`GET /api/orders/export` 接收同名筛选参数 `start_month`、`end_month`（格式 `YYYY-MM`，边界包含）、`course_type`（`all`、`private` 或 `monthly`）及 `search`，返回由后端生成的 `.xlsx` 文件；导出行与订单台账当前显示的筛选结果一致。

`GET /api/attendance` 返回 `{ "attendances": Attendance[] }`。`POST /api/attendance` 返回 `{ "results": [{ "name": "客户姓名", "matched": true, "detail": "已关联订单号" }] }`。签到记录用于定制私教消课；月卡课程无需消课。

统计页面通过 `start_date` 和 `cutoff_date` 指定统计期间，两个日期均包含在范围内，且起始日期不得晚于截止日期。统计接口返回 `{ "cutoffDate", "sales", "orderCount", "attendanceCount", "privateSessionsLeft", "summaryRows", "attendances" }`。其中 `summaryRows` 包含客户、课程、购买/赠送/已消/剩余课时和销售额；`attendances` 是统计期间内用于导出明细的消课记录。XLSX 文件由前端根据这份后端汇总结果生成。经营概览仍仅按截止日期请求汇总。

Flask 服务在 `service/FlaskServer.py` 中实现上述 API；前端在服务不可用或接口异常时会显示请求错误，不会回退到本地模拟数据。

## 构建

```sh
npm run build
npm run preview
```
