# OZON 请求窗口与验证恢复

采集与巡查的 `MainWindowService` 都继承这里的 [OzonWindowService](./main-window.services.ts)，再继承公共 `BrowserWindowService`。

## 窗口分工

- 业务窗口：保留原采集页面，读取 HTML、滚动和进入店铺。页面本身出现滑块时也使用公共验证服务。
- [shared-request.services.ts](./shared-request.services.ts)：按 `Session` 和来源统一管理请求窗口。所有采集任务和跟卖巡查任务共用一个请求窗口，并发执行正常接口请求，首次请求时才创建窗口；不同 Session 或来源保持隔离。
- [OzonRequestWindowService](./request-window.services.ts)：`getSellingData/getDataByApi` 全部委托给它执行，验证和恢复也在此共享窗口内完成。首次并发请求共同等待同一次窗口初始化完成，验证期间等待的请求收到等待状态，状态按请求回传给所属任务。
- 任务结束时只释放自己的使用权，取消自己的在途及等待请求。取消在途请求只中止对应的 renderer fetch，不回收共享窗口，也不中止其他请求或共享初始化；最后一个使用者结束后才销毁请求窗口。

## 403 恢复流程

```text
原请求返回 403 或 HTML
    → 暂停同 Session、同来源的新接口请求
    → 等待已经发出的接口请求结束
    → 有同源重定向：请求窗口导航到最终地址
      没有重定向：关闭请求窗口，用原 Session 重建并加载入口页
    → 准备验证页并检查滑块
    → 有滑块：调用公共验证服务；没有滑块：直接探测接口
    → 以原 URL、原查询参数重新请求
    → 成功且返回 JSON 对象：恢复并发请求
      仍受限：继续下一轮，最多 3 轮（包含首次尝试）
```

重建只影响请求窗口，不切换业务窗口。服务器返回的 HTML 不会被写入 `document.write` 或本地 data 页面，而是通过真实地址导航加载。

拖动成功不等于解除 403，必须以接口探测结果为准。达到 3 次上限抛出 `OzonVerificationError`，业务不会把它吞成空商品。每次新触发的受限恢复独立计数，不是无限重建。

## 公共服务

- [SliderVerificationService](../common/slider-verification.services.ts)：OpenCV 检查/注入、验证页准备、滑块检测与原有拖动算法；`MAX_SLIDER_ATTEMPTS = 3` 是统一上限。
- [VerificationCoordinatorService](../common/verification-coordinator.services.ts)：按 Session 对象和 origin 协调正常请求与恢复。正常请求并发执行；验证时暂停新请求，等待在途请求退出后只执行一个恢复过程，同时返回 403 的请求共用验证结果，再分别重放自己的 URL。等待任务取消不影响验证者，验证者取消后后续任务可继续请求并按需验证。
- `BrowserWindowService.fetchPage`：返回 `success/status/contentType/url/redirected/data`。先读取文本，再按 Content-Type 解析 JSON，保留 HTML 403 的诊断信息。

滑块检测默认适配当前站点的 `#slider/#image/#puzzle` 和验证页重试按钮。站点 DOM 或验证跳转规则变化时需要重新联调；业务接口的额度 403 不经过本服务。

验证码图片可能来自跨域 CDN，直接读取页面原图会使 Canvas 的 `getImageData` 抛出跨域污染错误。验证服务通过当前窗口的 `Session.fetch` 读取图片字节，再用独立的 data URL 图片做 OpenCV 计算；页面原图和拖动坐标保持不变。图片读取限 10 秒并响应取消，验证码更换后不会继续使用旧图片拖动。采集窗口加载完成后也会检查验证，因此分类选品即使不调用 `getHTML` 也会执行滑块处理。业务窗口和请求窗口均记录拖动结果，便于区分未检测到滑块与图片读取、匹配或拖动失败。

## 超时与取消

单次网络请求、请求窗口加载各限 30 秒。OpenCV 检查、注入和初始化分别有独立期限，单次滑块拖动限 30 秒。每轮恢复都响应任务取消。

采集工作流的 `pageStep` 只负责整项任务取消，把网络和验证时限交给请求窗口，避免旧的普通 `step` 30 秒期限提前中止验证。整项任务显式配置的 `timing.run` 总期限仍然有效。读取业务页面的 HTML 自身仍有 30 秒期限。

窗口异常关闭、渲染进程退出会中止旧服务的请求，后续请求可重建共享服务。单个请求取消不会关闭共享窗口，也不会取消其他请求正在等待的初始化。取消与销毁解除所属请求的监听，不会中止其他任务。

## 界面与测试

采集任务快照增加可选本地字段 `verification`，用来显示等待验证、验证中（次数/3）和恢复请求中；任务业务状态仍是 `running`，终止和收尾提示优先。巡查通过原有日志输出对应进度。

执行 `npm run test:collection` 和 `npm run test:inspection`，重点阅读 [request-window.test.ts](../../../tests/collection/request-window.test.ts)：覆盖采集与巡查共享窗口、最后使用者回收、任务取消隔离、状态回调归属、Session 隔离、异常关闭重建，以及正常并发、初始化等待、同窗口 403 合并恢复、恢复前等待在途请求、403 重建、重定向、三次上限、超时、响应解析及业务窗口不跳转。测试不访问真实 OZON 网站，不保存或上架真实商品。
