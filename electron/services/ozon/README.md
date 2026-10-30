# OZON 请求窗口与验证恢复

采集与巡查的 `MainWindowService` 都继承这里的 [OzonWindowService](./main-window.services.ts)，再继承公共 `BrowserWindowService`。

## 窗口分工

- 业务窗口：保留原采集页面，读取 HTML、滚动和进入店铺。页面本身出现滑块时也使用公共验证服务。
- [shared-request.services.ts](./shared-request.services.ts)：按 `Session` 和来源统一管理请求窗口。所有采集任务和跟卖巡查任务共用一个隐藏请求窗口及串行队列，首次请求时才创建窗口；不同 Session 或来源保持隔离。
- [OzonRequestWindowService](./request-window.services.ts)：`getSellingData/getDataByApi` 全部委托给它执行，验证和恢复也在此共享窗口内完成。验证状态按请求回传给所属任务，排队任务收到等待状态。
- 任务结束时只释放自己的使用权，取消自己的在途及排队请求。其他任务继续使用共享队列；最后一个使用者结束后才销毁请求窗口。取消在途请求时可能回收窗口，下一项请求自动重建，始终只保留一个有效请求窗口。

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
    → 成功且返回 JSON 对象：恢复队列
      仍受限：继续下一轮，最多 3 轮（包含首次尝试）
```

重建只影响请求窗口，不切换业务窗口。服务器返回的 HTML 不会被写入 `document.write` 或本地 data 页面，而是通过真实地址导航加载。

拖动成功不等于解除 403，必须以接口探测结果为准。达到 3 次上限抛出 `OzonVerificationError`，业务不会把它吞成空商品。每次新触发的受限恢复独立计数，不是无限重建。

## 公共服务

- [SliderVerificationService](../common/slider-verification.services.ts)：OpenCV 检查/注入、验证页准备、滑块检测与原有拖动算法；`MAX_SLIDER_ATTEMPTS = 3` 是统一上限。
- [VerificationCoordinatorService](../common/verification-coordinator.services.ts)：按 Session 对象和 origin 协调正常请求与恢复，验证期间只允许一个恢复过程。OZON 共享窗口中的请求已统一串行，其他任务在共享队列等待；等待任务取消不影响验证者，验证者取消后后续任务可继续请求并按需验证。
- `BrowserWindowService.fetchPage`：返回 `success/status/contentType/url/redirected/data`。先读取文本，再按 Content-Type 解析 JSON，保留 HTML 403 的诊断信息。

滑块检测默认适配当前站点的 `#slider/#image/#puzzle` 和验证页重试按钮。站点 DOM 或验证跳转规则变化时需要重新联调；业务接口的额度 403 不经过本服务。

## 超时与取消

单次网络请求、请求窗口加载各限 30 秒。OpenCV 检查、注入和初始化分别有独立期限，单次滑块拖动限 30 秒。每轮恢复都响应任务取消。

采集工作流的 `pageStep` 只负责整项任务取消，把网络和验证时限交给请求窗口，避免旧的普通 `step` 30 秒期限提前中止验证。整项任务显式配置的 `timing.run` 总期限仍然有效。读取业务页面的 HTML 自身仍有 30 秒期限。

窗口异常关闭、渲染进程退出会中止旧队列的请求，后续请求可重建共享服务。排队请求取消不会让后面的请求越过尚未结束的前一项。取消与销毁解除所属请求的监听，不会中止其他任务。

## 界面与测试

采集任务快照增加可选本地字段 `verification`，用来显示等待验证、验证中（次数/3）和恢复请求中；任务业务状态仍是 `running`，终止和收尾提示优先。巡查通过原有日志输出对应进度。

执行 `npm run test:collection` 和 `npm run test:inspection`，重点阅读 [request-window.test.ts](../../../tests/collection/request-window.test.ts)：覆盖采集与巡查共享窗口、最后使用者回收、任务取消隔离、状态回调归属、Session 隔离、异常关闭重建，以及正常复用、403 重建、重定向、三次上限、队列顺序、超时、响应解析及业务窗口不跳转。测试不访问真实 OZON 网站，不保存或上架真实商品。
