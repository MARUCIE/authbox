# SOP 4.1 Step 4 - 卡点与同类问题扫描报告

## 卡点记录
- 现象：`POST /api/telemetry/public-events` 返回 `400 INVALID_EVENT`。
- 根因：请求体使用了 `event_type`，而接口契约要求字段 `event`。
- 修复：将 Step 3 脚本 payload 字段改为 `event`，并按 `status=accepted` 校验事件上报成功。
- 结果：Step 3 复测 `overall.pass=PASS`。

## 同类问题扫描
- 扫描目标：代码/脚本中 telemetry payload 是否继续使用 `event_type`。
- 命令：`rg -n "event_type\\s*:|\"event_type\"" apps scripts doc`
- 结果：见 `event_field_scan.txt`。
- 结论：以 `event_field_scan.txt` 是否为空作为判定依据。
