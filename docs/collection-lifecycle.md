# 采集任务生命周期

采集任务用项目已有的 XState 5 和 RxJS 7 管理，不需要增加运行时依赖。

通用队列与取消作用域已迁到 `electron/services/common`，采集、巡查窗口共同继承 `BrowserWindowService`，采集结果存储继承 `JsonFileStoreService`。实现文件统一使用 `.services.ts` 后缀；公共模块职责及继承示例见 [公共服务说明](../electron/services/common/README.md)。

## 状态与职责

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> initializing: START
    initializing --> collecting: READY
    collecting --> draining: COLLECTED
    draining --> expanding: EXPAND
    expanding --> drainingExpansion: EXPANDED
    draining --> uploading: UPLOAD
    drainingExpansion --> uploading: UPLOAD
    draining --> cleaning: FINISH
    drainingExpansion --> cleaning: FINISH
    uploading --> cleaning: FINISH
    cleaning --> completed: CLEANED
    cleaning --> cancelled: CLEANED / 取消
    cleaning --> failed: CLEANED / 异常
```

任一运行阶段均可通过 `CANCEL`、`FAIL` 进入 `cleaning`。清理完成后才进入终态；正常结束不再通过 `reason = success` 推断。

前端和服务端仍使用原有 `TaskStatus`：运行阶段统一映射为 `running`，队列等待为 `pending`，最终为 `completed`、`failed`、`cancelled`。IPC 进度额外携带 `phase`，现有界面可以继续使用。

`phase` 为扁平字符串。取消后立即推送 `stopping`，正常结束进入 `cleaning`；界面分别显示“终止中”和“收尾中”。这些阶段不作为服务端状态提交。点击终止后界面立即显示加载状态，并禁用开始、重复终止、编辑和删除；实际取消接口在回收完成后返回最终任务快照。

任务列表同时订阅 `task-status-update`。刷新列表时优先使用本地活跃任务及其阶段；结果落盘、状态同步尚未完成时仍保持结束中的提示，清理完成后才恢复操作入口。

- `Collection`：一次运行的资源所有者。重复 `run()` 返回同一个 Promise；重新执行由管理器创建新实例。
- `collection-machine.services.ts`：允许的阶段转换和最终结果。
- `TaskScope`：RxJS 订阅、取消等待和操作超时；退订会触发底层 `AbortSignal`。
- `TaskQueueService`：仅每个 `Collection` 的 1688 图搜并发为 3；生产、基础数据、筛选翻译和保存使用 `Infinity` 直接并发。只保留成功/失败计数，不缓存已完成商品对象。
- `TaskManager`：只在运行结束、结果落盘和清理完成后移除任务并释放并发名额。退出和切换账号共用同一个停止 Promise。

## 结束与异常

生产者请求、商品处理和保存都被等待；拓店各店铺的采集与商品处理可重叠，全部生产结束后统一等待完成，上架仅使用已经确认保存成功的商品。页面基础数据按页整批获取；快照发现新 SKU 后即可继续滚动，本页跟卖和前页基础数据未返回不会阻塞新请求。分类列表和详情每隔至少 1 秒启动下一次请求，响应仍并行，不等上一页排空。1688 图搜完成即释放本任务的 3 个名额，后续筛选翻译和保存不占用它；积压不会暂停其他任务的委托请求。保存按剩余目标数量预留名额，防止并发超采，达到目标后中止其余生产和图搜。

新分页和滚动以各任务自己的 `processing.size` 为依据：正在处理超过 20 件时暂停，降到 20 或以下时恢复。当前整批已登记商品及图搜、筛选、保存必须继续消费，不在同一计数上等待；否则会因未派发项自己占住计数而死锁。暂停由本任务商品完成事件唤醒，不持有全局锁，不停止其他采集任务。取消、失败或达到目标也会解除等待。

取消、窗口关闭、渲染进程退出、超时、保存失败均有明确的结束路径。HTTP 请求传递 `AbortSignal`；窗口取消时移除 IPC/事件监听并关闭窗口。不能真正取消的旧 Promise，其迟到结果会被信号检查拦截，不能继续入队保存。

分类商品的单件网络错误或超时记录任务/商品 ID 后跳过，不取消其他商品。验证恢复失败仍结束整项任务。启动配置、页面停止原因、基础筛选接受数、无有效价格和服务端筛选无结果分别记录，任务失败会在进度日志中输出原因。

资源清理幂等，某个资源释放失败也继续处理剩余资源。默认单操作超时 30 秒、商品任务 120 秒、自动上架 10 分钟；窗口加载和结果落盘也有独立期限。队列等待依赖各商品的超时和整个作用域的取消。整项任务可通过 `timing.run` 设置总时限，默认保留正常大批量采集持续运行的能力；测试通过依赖注入缩短期限。

状态同步串行执行，并设置独立的 5 秒超时；断网不会阻止本地资源回收，但云端状态可能未成功同步。进程被强制终止时无法执行 JavaScript 清理，内存由操作系统回收，不能将 `finally` 当作服务端状态持久化保证。

## 结果与内存

`getSellingData/getDataByApi` 按 Session/来源共享请求窗口，正常请求直接并发执行；1688 使用各采集任务独立的图搜窗口，不走委托。403/验证 HTML 触发导航或重建请求窗口，暂停同 Session、同来源的接口请求；滑块验证最多 3 次，以原接口返回正常 JSON 确认恢复。超过上限明确失败，不当作空商品继续采集。采集视图通过本地 `verification` 字段显示验证进度，终止操作仍然有效。实现和测试入口见 [OZON 请求窗口](../electron/services/ozon/README.md)。

商品结果保存在 Electron `userData/collection-results/<账号哈希>/`，每个任务分为商品文件和摘要文件。管理器最多在内存中缓存 200 个摘要，手动上架时才读取商品文件；删除任务时同步删除缓存。商品文件不因任务完成而自动删除，以保留手动上架能力。

保存失败的商品不会加入上架结果；额度不足同时处理 402/403。已被服务端接受的请求不因客户端取消而自动回滚。

## 验证

运行 `npm run test:collection`。测试使用注入的服务和 Electron 事件替身，不访问真实店铺，也不会保存或上架真实商品；覆盖状态转换、延迟生产者、拓店排空、取消、超时、迟到结果、窗口监听释放、清理异常、管理器并发名额以及结果缓存。

运行 `npm run build:electron` 编译主进程代码。
