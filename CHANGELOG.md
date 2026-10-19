<!-- markdownlint-disable-file MD004 MD024 MD033 MD034 MD036 -->
# CHANGE LOG

<p align="center">
  <a href="CHANGELOG.md">中文</a> |
  <a href="CHANGELOG_EN.md">English</a>
</p>

## v1.13.0(main)

### Features

- feat: |用户系统| 邮箱地址管理支持按地址关键字搜索已绑定邮箱，并保持分页结果准确（issue #1156）
- feat: |AI 识别| 新增 `AI_EXTRACT_MODE`，可显式选择仅用本地规则（`local`）或优先用 Workers AI（`ai`）识别邮件；不填默认使用本地规则，邮件内容不会发送给 AI。**升级注意**：原先依赖 Workers AI 绑定自动启用 AI 识别的部署需设置 `AI_EXTRACT_MODE = "ai"`
- feat: |首页| 公告跑马灯默认开启（约 45px/s），管理员可在系统设置中开关，经 `/open_api/settings` 下发
- feat: |首页| 「运行统计」与「服务状态」之间新增可拖拽分隔条，两卡片宽度自由调整（含各自宽度下限保护），比例本地持久化；统计卡片折叠时按自身宽度自适应逐列显示统计周期（今日 → 本周 → 本月 → 年度），展开时保持完整四列网格
- feat: |发信| 后台新增全站发信主开关（强制开启 / 全站禁发 / 跟随环境），保存在数据库设置中；「跟随环境」沿用原有「env 通道 + 每域名开关」判定，未改动过该开关的部署行为完全不变；「全站禁发」会直接拒绝用户发信接口（管理员发送与注册验证码等系统邮件不受影响）
- feat: |发信| 新增发信日志审计：记录发信地址、收件人、主题、发送通道、结果与错误原因，后台「邮件」标签页新增「发信日志」，支持按地址与结果查询、删除单条、清空、按保留天数清理与自动清理
  - `send_log` 表需先执行数据库迁移：`Admin -> 快速设置 -> 数据库 -> 升级数据库 Schema`，或调用接口 `POST /admin/db_migration`；未迁移时日志写入只告警，不影响发信
- feat: |发信| 支持按地址调整发信额度：发送前原子预扣额度（额度不足直接拒发），发送失败自动回补；管理员可在「地址发信权限」弹窗内直接增减额度
- feat: |发信| 默认日/月限额（100/3000）下沉到 worker：数据库未保存过限额配置时按默认值生效，管理员在面板中关掉两个开关即为不限额，后台发信设置页的默认值改为从 worker 读取
- feat: |发信| 后台「站点域名」新增只读「通道」列：按 resend → smtp → binding 的优先级展示每个域名的可用发信通道（通道仅来自环境变量，密钥不落库），高亮的通道即实际会使用的通道
- feat: |发信| 「站点域名」支持为每个域名单独设置发信日 / 月限额（留空即继承全局限额）：全局限额与每域限额同时生效，每域计数独立维护并从保存限额时开始累计
- feat: |首页| 右栏新增「实时汇率」换算工具（位于「外观」之后），支持 12 种常用货币（人民币 / 美元 / 欧元 / 日元 / 港币 / 英镑 / 韩元 / 澳元 / 加元 / 澳门元 / 泰铢 / 新台币）两两互换与双向速览，币种下拉带国旗图标且支持搜索，PC / 手机窄屏自适应；数据经 `/open_api/exchange_rates` 提供，新浪行情为主源（分钟级），依次回退腾讯 / 欧洲央行 / ExchangeRate-API，60 秒缓存、实时源全挂时展示最近一次可用数据并标注来源与更新时间；后台「站点设置」新增开关（默认关闭，开启后右栏才显示该标签页），适配 Windows 环境使用内联 SVG 国旗而非 emoji
- feat: |后台| 邮件详情新增发件来源 IP 标签（邮件 / 未知邮件页）：从邮件头最外层 Received 解析发件方 MTA 的 IP，查询 ip.guhong.vip（ip-api 兼容格式 `/json/?query=IP`）获取归属地与运营商，按 IP 在 D1 缓存 30 天；查询超时或站点不可用时自动降级为只显示 IP，首页不受影响；需在 Cloudflare WAF 添加自定义规则，为 `ip.guhong.vip/json/` 路径与固定 User-Agent `tempemail-iplookup/1.0` 跳过 Managed Challenge，否则查询会被防护页拦截而只显示裸 IP
- feat: |PWA| 补齐可安装能力并新增主动安装引导：manifest 明确声明 `display: standalone` / `start_url` / `scope` / `background_color`，图标改为站点 logo 生成的 192×192、512×512 与 512×512 maskable（不再把 1200×1200 的 `logo.png` 标成 192 尺寸），并新增 180×180 `apple-touch-icon`；首页新增主动安装提示：Chromium 系浏览器捕获 `beforeinstallprompt` 后弹出站点风格的一键「安装到桌面」卡片（安装完成或取消即收起），iOS 不支持该事件，改为进入首页 6 秒后引导「分享 → 添加到主屏幕」，点「以后再说」3 天内不再打扰，已以独立窗口运行（standalone）的用户不再提示；新增 6 条组件单测覆盖上述分支

### Security Fixes

- 邮件正文渲染统一强制净化：`processedMail` 无论「自动加载远程图片」是否开启都先经过 DOMPurify（关闭网络阻断 pass、剥离 `on*` 事件 / `<script>` / `<iframe>` / `javascript:` 等可执行内容）；两处 iframe 增加 `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`；后台「已发送」详情（SendBox）的 v-html 同样强制净化。此前默认开启远程图片时原始正文会直接进入 shadow DOM / iframe（`srcdoc` 路径可执行脚本）。新增 5 条单测（`<img onerror>` 在允许远程图片模式下也剥离处理器、仅网络阻断 pass 放行）；线上双路径（shadow 与 iframe）实测确认 payload 不执行、正文正常渲染
- 邮箱 / 管理员 Authorization 头按路径选择：`/admin/*` 使用管理员 JWT，其余路径使用邮箱 token；修复邮箱 token 无条件写在最后、覆盖管理员 Bearer 的问题（浏览器此前永远走不到管理员 JWT / 撤销名单路径）
- Telegram webhook 防伪造：`setWebhook` 下发 `secret_token`（`TELEGRAM_WEBHOOK_SECRET` 环境变量优先，未配置时生成随机值存入 KV `temp-mail-telegram-webhook-secret`），`/telegram/webhook` 校验 `X-Telegram-Bot-Api-Secret-Token`（常量时间比较）；未配置密钥的部署返回 401（fail-closed，需管理员重新执行一次 telegram 初始化）。本地 harness 实测四档：无密钥 401 / 无 header 401 / 错误 header 401 / 正确 header 通过认证
- Webhook 交付加固：新增 `parseWebhookHeaders`，保存时校验 headers 必须是 JSON 对象（用户与后台 webhook 保存接口实测 400）；交付携带 HMAC-SHA256 签名（`X-Webhook-Signature: sha256=<hex>`，`HMAC(JWT_SECRET, "${ts}.${body}")` + `X-Webhook-Timestamp`，本地验签通过且重试间保持稳定）；失败重试 3 次（300/900ms，仅 5xx/408/429 与网络错误可重试，本地实测全失败时恰好 3 次后停止）

### Bug Fixes

- fix: |数据| 数据库迁移补齐 5 张表与索引（`login_attempts` / `admin_token_blacklist` / `admin_gate_tokens` / `admin_gate_sessions` / `uptime_heartbeats`），`DB_VERSION` 升至 `v0.0.16`；线上已执行迁移（`GET /admin/db_version` 确认 `v0.0.16` 且 4 个新索引均生效）
- fix: |数据| AI 提取元数据改写目标行：优先按刚入库邮件的 `id + address` 定位（`WHERE id = ? AND address = ?`），无 `id` 时 `message_id` 也追加地址作用域；修复重复 Message-ID / 空 Message-ID 时误写或不写的问题（D1 实测旧语句同 id 两行同改、新语句只改最新一行）
- fix: |数据| 列表 `offset` / `limit` 改为 `Number.isInteger` 校验，非数字（如 `?offset=abc`）返回 400 而非 500（三个列表接口线上实测 400）
- fix: |数据| 自动回复设置保存前归一化 `subject` / `message`（`undefined` 不再抛 500）；禁用自动回复的保存可省略正文
- fix: |数据| 删除邮箱级联 `send_log`（单地址与批量两条路径均补 `DELETE FROM send_log`），修复删除后发信日志残留
- fix: |发信| 管理员 binding 发信与用户发信统一写入 `sendbox`（新增共享 `appendSendbox`），后台「已发送」成为完整投递记录
- fix: |发信| 自动回复接入站点发信总开关与每域名发信开关：总开关 `send_mail_enabled=false` 或该域名 `sendEnabled=false` 时不再自动回复；未纳管域名与未配置开关的部署行为不变（本地 harness 对真实 `email()` 处理链实测：基线触发、总开关关闭不触发、每域关闭不触发、每域开启触发、仅关闭其它域名仍触发）
- fix: |兑换码| 兑换三语句拆掉跨语句 `changes() = 1` 依赖：消耗语句改为按本次新写入的 `result` 匹配；`results[2].meta.changes === 1` 仍为原子性守卫
- fix: |发信| 发信域名白名单（`SEND_MAIL_DOMAINS`）移入 `[vars]` 段，修复 wrangler 顶层未知字段告警（仅约束 SEND_MAIL binding，部署日志已确认生效）
- fix: |i18n| SimpleIndex 极简模式三处硬编码中文改为 i18n 键（复制失败 / 删除邮件失败 / 获取邮件失败），registry + ja / ko / zhTW 同步补齐，四语言键集 0 缺 0 多
- fix: |前端| 下载凭证文件名中的中文改为 `tempemail-credentials-<addr>.txt`；删除 `MailBox` 未声明的 `useUTCDate` prop 透传；`MailContentRenderer` 模板中 `useUTCDate.value` 改为自动解包的 `useUTCDate`
- fix: |PWA| `build:pages:nopwa` 在 POSIX / CI 下真正生效：`VITE_PWA_DISABLED=true` 时不引入 VitePWA 插件（实测带开关无 `sw.js` / `registerSW.js`，不带开关生成 `sw.js`）
- fix: |汇率| 「最新更新时间」跨时区比较错误：各数据源时区不一致（er-api 回退用 UTC），改为按绝对时刻比较
- fix: |Telegram| webhook 路由补齐缺失的 `Context` 类型导入

- fix: |收件| 黑名单同时检查 SMTP 信封发件人与邮件头 From 的全部邮箱地址，任意一个命中即拒收；独立解析地址，避免正文解析失败或多个发件地址导致漏拦截；地址解析异常时保留原有信封检查
- fix: |AI 识别| `ai` 模式下地址未命中 AI 提取白名单时只跳过 Workers AI 调用，仍回退到本地规则提取验证码
- fix: |首页| 修复未登录首屏右栏操作面板出现内部滚动条、波浪装饰条被裁切的问题（取消面板对左栏高度的绝对定位钉挂）
- fix: |首页| 修复窄宽度下「运行统计」卡片标题折行使卡片骤增约 62px、拖动分栏时顶动下方「常见问题」模块的问题；标题改为始终单行（超出省略），卡宽不足时收起「公开数据」徽章，折叠与展开态卡片高度全程恒定
- fix: |i18n| 修复日语 100 处占位文本（首页标题、特性卡片、快速开始、帮助页、兑换页与登录引导等显示「メインタイトル A」「機能 1」「トラブル 1」等），补齐完整日语翻译
- fix: |i18n| 补齐「站点域名」发信限额列缺失的翻译键（原先表头与限额编辑弹层显示原始键名 `views.admin.DomainSettings.sendLimit`），同步补齐 zhTW / ko / ja；修正后台「发送邮件」未启用提示中的环境变量名（`RESEND_API_KEY` 更正为 `RESEND_TOKEN` / `SMTP_CONFIG` / `SEND_MAIL`）
- fix: |首页| 修复「实时汇率」币种选择框与下拉列表中国旗异常放大成 512px 巨图、覆盖页面的问题：naive-ui `render-label` 属性函数渲染的 VNode 不携带组件 scoped 样式属性导致尺寸规则失效，改为在渲染函数中内联样式（16px 圆形）

### Improvements

- feat: |AI 识别| 本地验证码规则增强：同时识别邮件标题，支持验证码在关键词前（如 `116352（动态验证码）`、`ABC123 is your code`）、`G-123456` 前缀、分组 / 空格 / 零宽字符 / 全角数字，新增俄西葡法德意土希伯来语等关键词；排除超过 8 位数字、小数金额、时间、URL 与邮箱地址中的数字、tracking / order / voucher code 及纯字母单词，收紧无关键词时的数字识别，并限制分析长度、消除正则回溯风险
- feat: |首页| 首页卡片支持拖拽调整顺序并在本地保存；「运行统计」默认折叠、折叠时顶对齐；收紧首页纵向间距，1440×760 与 1280×860 视口下整页无滚动条
- feat: |首页| 标题末段「真实邮箱」整体上移半个字高（标记带随文字同步上移，字间距、行高与下方布局均不变）；是否上移按标题实际渲染行数判定，仅在单行时生效，小屏或长语言（如韩语）折行时自动回位，避免与上一行重叠
- feat: |发信| 后台「维护」新增发信日志自动清理（默认保留 30 天），接入现有的定时清理与手动「立即清理」入口

## v1.12.0

### Features

- feat: |Webhook| 测试弹框支持随机邮件或指定邮件 ID，校验请求体及邮箱归属并适配现有前端语言及中英文错误提示
- feat: |Webhook| 支持无需 S3 的多附件签名链接、纯 URL 与 Markdown 链接列表，签名兼容大小写，绑定本次入库邮件并保留下载文件名，关闭 Webhook 时禁止附件下载（issue #1142）
- feat: |Worker| 新增 `DISABLE_ADDRESS_UPDATED_AT`，可关闭单地址及用户批量的主动保活刷新，并禁止内置手动及定时不活跃地址清理，降低 D1 写入量
- feat: |Frontend| 新增 `VITE_DEFAULT_LANG` 构建变量，并支持通过 `index.html` 运行时配置覆盖前端设置
- feat: |兑换码| 新增角色、发信额度及专属邮箱兑换与管理，完善并发保护和表单提示
- feat: |邮件| 新增可选的已读/未读状态，支持点击邮件自动已读和手动切换状态
- feat: |Admin| 数据库页面新增 D1 存储容量展示，支持选择并保存 Free 或 Workers Paid 套餐，对比当前数据库大小和容量上限
- feat: |Admin| 创建邮箱页面支持一键生成随机邮箱名称（issue #1126）
- feat: |Admin API| 新增 `ADMIN_API_IP_WHITELIST`，可按来源 IP 限制所有管理接口访问
- feat: |用户系统| 用户中心新增发送邮件、与收件箱一致的可按绑定地址过滤的发件箱，以及地址管理凭证弹框；提供使用用户 JWT 的地址设置、发信权限申请、发信及发件箱 API

### Bug Fixes

- fix: |邮箱鉴权| 修复旧邮箱凭证仍可访问 API、Telegram 越权解绑、重新绑定失效及外部发信保存凭证的问题，区分认证错误以准确提示站点及管理员登录，并将 E2E 测试接口移出生产代码
- fix: |Frontend| 修复 AdSense 脚本包含不受支持的 `data-onload` 和 `data-onerror` 属性
- fix: |Admin| 修复权限设置加载完成前短暂显示管理员密码输入框的问题
- fix: |Admin| 修复切换一级标签页时二级标签页偶发无选中项、内容不显示及指示条偏移的问题
- fix: |发信页面| 统一邮箱与名称字段顺序，并修复空正文输入框的光标与占位文字错位
- fix: |用户发信| 用户地址发信接口支持角色无限额度

### Improvements

- fix: |Frontend| 统一邮箱、邮箱地址、用户账号与管理后台的核心界面术语，并补齐附加语言缺失的邮件状态与远程图片文案（issue #1129）
- feat: |发信页面| 优化用户和 Admin 发信页面的信息层级与响应式布局，增加正文格式工具栏、草稿状态、底部发送操作区及隔离的 HTML 预览

### Testing

- test: |E2E| 覆盖 D1 数据库大小响应、配置键隔离，以及数据库页面套餐选择的持久化与刷新恢复
- fix: |E2E| 覆盖发信页面草稿编辑、正文格式切换及 HTML 预览
- fix: |E2E| 覆盖用户 JWT 发信接口的地址归属、额度扣减、实际投递和发件箱操作，以及用户中心查看地址凭证、切换发件地址和按地址过滤发件箱的完整流程

## v1.11.0

### Features

- feat: |Frontend| 在随机子域名允许范围内新增普通、随机和自定义子域名模式选择（issue #1108）

### Bug Fixes

- fix: |Frontend| 将邮箱主页的账户设置、删除账户等表述更正为邮箱地址操作，并明确发信权限与额度按当前邮箱地址独立管理

### Improvements

- docs: |发送邮件| 补充用户账号、邮箱地址和发信权限的概念区别及按当前地址申请权限的操作说明

- fix: |Worker| 地址活跃时间保活增加 1 天写入窗口，用户设置和邮箱访问不再重复更新近期活跃地址，降低 D1 写入量（issue #1103）

- feat: |用户系统| 用户绑定地址列表改用服务端分页，并仅在第一页查询总数；用户邮件列表改用 JOIN、删除改用 `EXISTS` 在数据库侧校验地址归属，避免为大用户加载全部绑定地址（issue #1103）

- feat: |Worker| 邮件、发件箱及按创建/活跃时间清理地址时改为分批处理，默认每次最多 3000 条并支持通过 `CLEANUP_BATCH_SIZE` 调整（上限 5000），减少单次扫描和删除量（issue #1103）

### Testing

- fix: |E2E| 新增近期地址活跃时间不会被用户设置接口重复写入的回归测试
- fix: |E2E| 新增清理批次上限、后续批次继续执行、保留未过期数据及地址关联数据清理测试

## v1.10.0

### Features

- feat: |Admin| 新增 `GET /admin/mails/:id` 接口，支持管理员按邮件 ID 跨邮箱读取单封邮件，并兼容 gzip 压缩存储（issue #1096）
- feat: |Frontend| 邮箱新增「邮箱全宽列表视图」开关（在外观设置中控制），开启后默认全宽列表展示邮件标题与正文预览，点击单封邮件再展开为双栏，再次点击同一封邮件可回到列表视图；多选模式下点击邮件会同步切换勾选状态与右侧预览，并禁用同邮件点击收回列表，展开时双栏左侧列表宽度仍遵循「邮箱双栏视图左侧列表宽度占比」配置；默认关闭，保留原有双栏行为
- feat: |Frontend| 邮箱全宽列表视图新增「正文预览行数」配置（在外观设置中控制），可设置邮件正文预览的最大行数，默认 2 行，0 表示关闭预览
- feat: |Frontend| 外观设置新增「自动加载邮件正文中的外部图片」开关，关闭后邮件预览（含全屏视图）会先经 DOMPurify 消毒，并以白名单策略处理所有可能发起请求的位置：仅保留可证明为本地的引用（`cid:`、`data:image/`、`blob:` 与站内相对路径），其余一律阻断；`base`、`meta`、`script`、`link`、`iframe`、`object`、`embed`、`noscript` 等会自行取用资源或改变解析基准的元素在此模式下移除，`<style>` 保留但其中 `url()`、`image-set()`、`@import` 的远端引用会被替换。正文上方显示已阻断资源数量的提示条，可一键按封加载；默认保持开启，行为与此前一致（issue #1073）

### Bug Fixes

- fix: |Frontend| 关闭邮件外部图片自动加载时保留 `<a>` 与 `<area>` 的外部导航链接，并阻断通过 CSS 转义函数名或 at-rule 绕过远程资源过滤的情况
- fix: |Frontend| 使用共享 DOMPurify 净化逻辑处理关于页面与启动通知中的 HTML 公告，避免 `ANNOUNCEMENT` 中的可执行标签或事件属性造成 XSS
- fix: |Worker| 按邮件认证规范修复垃圾邮件检测：SPF、DKIM、DMARC 的 `none` 及 SPF/DKIM `neutral` 按认证方法不存在处理，并忽略未注册结果和不支持的方法版本；`JUNK_MAIL_FORCE_PASS_LIST` 仍要求明确返回受支持的 `pass`
- fix: |Admin| 管理后台删除邮箱地址时，先删除该地址的邮件、发件记录、自动回复等关联数据，最后再删除地址本身；此前地址行先被删除导致按地址名匹配的子查询查不到数据，邮件等记录被遗留在数据库中
- fix: |AI 提取| 强化提示词，要求 AI 保持邮件原始链接域名，避免小模型改写验证链接域名导致错误跳转（issue #1072）
- fix: |AI 提取| HTML-only 邮件在发送给 Workers AI 前会先压缩为可读文本，避免样式模板过长导致验证码位于 4000 字截断之后而无法识别
- fix: |Frontend| 移动端 Header 增加页头内边距，避免标题、菜单按钮与屏幕边缘过近
- fix: |IMAP 代理| 修复 IMAP `STORE` 无法真正标记邮件已读的问题：邮件不再硬编码为 `\Seen`，且 `SimpleMailbox` 的 flags 变更现持久化到本地 SQLite（新增 `imap_flag_db_path` 配置），使已读/未读状态可在客户端断线重连（如 Thunderbird 轮询）后保留，而非每次新建连接即丢失（issue #1074）
- fix: |IMAP 代理| 修复 `SEARCH UNSEEN` 返回全部邮件的问题：`SimpleMailbox.search()` 现按持久化的 flags 计算 `SEEN`/`UNSEEN`/`FLAGGED`/`DELETED`/`ANSWERED`/`DRAFT` 及其否定形式，多个条件按 AND 组合；无法识别的检索条件仍沿用原有行为返回全部邮件
- fix: |IMAP 代理| 修复取信不会自动标记已读的问题：`BODY[...]`、`RFC822`、`RFC822.TEXT` 取信现按 RFC 3501 自动置 `\Seen`，而 `BODY.PEEK[...]`、`RFC822.HEADER` 及仅取元数据（如 `FLAGS`）不会

### Testing

- test: |Worker| 新增 junk_mail_policy 回归测试（issue #1084）：覆盖 SPF/DKIM/DMARC 的 `none`/`neutral` 按认证方法不存在处理、明确 `fail` 仍被拒收，以及 `JUNK_MAIL_FORCE_PASS_LIST` 仅接受明确 `pass`

### Improvements

- docs: |README| 新增完整日文 README，并在中文和英文 README 中添加日文导航链接
- feat: |Frontend| 「邮箱双栏视图左侧列表宽度占比」最小值由 0.25 放宽至 0，左侧列表可完全折叠使正文近乎全屏，刻度增加 0 点；收件箱与发件箱的双栏拆分同步生效，并优化外观设置文案以明确该比例控制左侧邮件列表宽度

## v1.9.0

### Features

- feat: |AI 识别| 未配置 Workers AI 绑定时，自动回退到内置正则提取验证码（支持中英日韩，并排除年份与 `YYYYMMDD` 日期误判），让无 Workers AI 的自部署用户也能在 Telegram 推送与 Webhook 中拿到验证码
- feat: |Telegram| Telegram 新邮件推送与 `/mails` 历史邮件查看支持展示 AI 提取结果，包含验证码、验证链接、服务链接、订阅链接等关键信息
- feat: |Webhook| 邮件 Webhook 模板支持填充 AI 提取结果占位符，包括 `aiExtractType`、`aiExtractResult`、`aiExtractResultText`
- feat: |Frontend| 新增 `DISABLE_SHOW_GITHUB_FOR_USER` 配置，可仅对普通用户隐藏 Header 的 GitHub/版本入口，admin 仍可见（issue #1041）
- feat: |Frontend| 将邮箱地址凭证弹窗升级为“地址凭证与连接方式”，复用普通用户与 admin 创建邮箱结果弹窗；支持通过 `ENABLE_AGENT_EMAIL_INFO` 展示 AI Agent 接入信息，并通过 `SMTP_IMAP_PROXY_CONFIG` 展示 SMTP/IMAP 客户端连接信息
- docs: |随机子域名| 在前端“启用随机子域名”提示与 `subdomain` / `worker-vars` 文档（中英）中明确说明：要让 `name@<随机>.abc.com` 真正收到邮件，必须在基础域名 DNS 中为 `*` 子域添加通配 MX 记录，Email Routing 子域不继承父域配置（issue #1035）

### Bug Fixes

- fix: |Admin| 管理员重置邮箱地址密码时改为前端 SHA-256 后提交，后端只接受并存储哈希值，避免该接口继续接收明文密码
- fix: |Address| 管理员邮箱地址列表与用户绑定地址列表不再返回已存储的地址密码哈希值，避免列表接口暴露敏感字段
- fix: |Address| 统一规范化配置域名、收件地址域名与前缀的空白和大小写，覆盖 `DOMAINS`、`DEFAULT_DOMAINS`、`USER_ROLES.domains`、随机子域名、转发规则、SMTP 与 `SEND_MAIL` 域名匹配，保留转发规则空域名 catch-all 行为，并明确空 `DEFAULT_DOMAINS` / 角色域名回退到 `DOMAINS` 的行为，避免大小写配置或入站收件域名导致创建、收件、转发或发信失败（issue #926）
- fix: |AI 提取| 将 AI 邮件识别默认 Workers AI 模型切换为支持 JSON Mode 且未弃用的 `@cf/meta/llama-3.1-8b-instruct-fast`，并在文档中补充 `@cf/zai-org/glm-4.7-flash` 结构化输出兼容性提示（issue #1029）
- fix: |CI| 将 GitHub Actions 与 e2e Docker 镜像统一升级到 Node.js 24，适配 Wrangler 4.90.0 的运行时要求
- fix: |Frontend| 修复 iOS Safari 点击输入框时因移动端表单控件字号过小导致页面自动放大的问题

### Improvements

## v1.8.0

### Features

- feat: |Frontend| 前端新增 6 国语言支持（`zh` / `en` / `es` / `pt-BR` / `ja` / `de`），默认语言保持为 `zh`；无 locale 前缀路由（如 `/`、`/user`）默认使用中文渲染，同时会记录浏览器语言作为语言偏好。用户手动切换后会持久化语言偏好，并保持当前页面路径、查询参数与 canonical locale URL 一致
- feat: |API| 新增服务端解析邮件接口 `/api/parsed_mails` 与 `/api/parsed_mail/:id`，直接返回 `sender` / `subject` / `text` / `html` / `attachments` 元信息（复用 `commonParseMail`），AI agent 侧不再需要引入 MIME 解析器
- feat: |Skill| 新增仓库内置只读 skill `cf-temp-mail-agent-mail`（`skills/cf-temp-mail-agent-mail/`），让 OpenClaw / Codex / Cursor 等 AI agent 凭用户提供的 Address JWT + API 地址读取邮箱、轮询验证码，绕开创建邮箱时的 Turnstile 人机验证；可通过 `npx degit dreamhunter2333/cloudflare_temp_email/skills/cf-temp-mail-agent-mail` 安装
- docs: |文档| 新增"AI Agent 使用邮箱"文档（`guide/feature/agent-email`），说明 `parsed_mail` API 用法，并在 parsed API 不可用时给出对齐前端的 `mail-parser-wasm` + `postal-mime` 本地解析回退方案
- docs: |文档| 在 `quick-start` / `worker-vars` / `email-routing` 三个入口文档（中英文）显式补充"域名是部署前提条件"提示，强调需先在 Cloudflare 启用 Email Routing 并下发邮件 DNS 记录、Worker 部署后再绑定 Catch-all，子域名需单独启用，避免用户在没有可用域名时直接开始部署却收不到邮件（issue #1004）
- docs: |部署排障| 优化近期 issue 暴露的 UI 部署与升级排障文档：补充 `nodejs_compat`、D1 绑定名必须为 `DB`、`/open_api/settings` 校验、后端 API 地址填写、Cloudflare 安全挑战导致 `Network Error`、D1 容量上限与 Cron Trigger 自动清理、GitHub OAuth 公开邮箱、admin 管理口令与用户账号区别、随机二级域名 API 需传 `enableRandomSubdomain` 等说明；同时将帮助/FAQ 菜单移动到核心配置之后，提升可见性
- docs: |文档| 补充重新创建旧邮箱提示地址已存在时的处理方式，并完善 GitHub Actions 自动更新配合 Page Functions 转发后端请求的 workflow 说明（issues #947 #654）
- docs: |OAuth2| 补充 GitHub 私密邮箱登录配置，说明可使用 `https://api.github.com/user/emails`、JSONPath 邮箱字段和 `user:email` scope 获取主邮箱（issue #655）

### Bug Fixes

- fix: |Frontend| 收窄地址管理相关弹窗宽度，并让地址表格在弹窗内部横向滚动，避免多地址场景撑宽弹窗
- fix: |Frontend| 修复 `/open_api/settings` 未返回 `domains` 数组时前端设置初始化直接调用 `map()` 报 `undefined` 错误的问题，统一按空数组兜底处理
- fix: |Frontend| 修复前端在 `jwt` / `auth` / `adminAuth` 等 localStorage 凭据为空字符串、字面量 `"undefined"` 或包含换行/控制符时，请求构造的 `Authorization` 等头部抛出 `Invalid character in header content` 导致前端所有接口报错的问题（issue #1000）。新增 `safeHeaderValue` / `safeBearerHeader` 工具，对全部认证头做 RFC 7230 校验，不安全的值直接跳过该头部，让 worker 走标准 401 而不是请求级崩溃
- fix: |Frontend| 修复多语言菜单在移动端顶部显示语言与版本按钮导致 Header 横向拥挤或溢出的问题，移动端仅保留菜单按钮并将语言/版本入口放入抽屉

### Improvements

- refactor: |Worker| 拆分 `mails_api/index.ts` 与 `admin_api/index.ts`，入口只负责挂路由，业务拆到各自的 `*_api.ts` 文件（`mails_crud.ts` / `new_address.ts` / `parsed_mail_api.ts` / `address_api.ts` / `address_sender_api.ts` / `sendbox_api.ts` / `statistics_api.ts` / `account_settings_api.ts`），保持路径与行为不变

## v1.7.0

### Breaking Changes

- breaking: |发信| `SEND_MAIL` 的语义已从“仅用于 `verifiedAddressList` 命中的兼容发信路径”调整为“常规兜底发信通道”。如果实例已绑定 `SEND_MAIL` 且未配置 Resend/SMTP，升级后未命中 `verifiedAddressList` 的收件人也会直接通过 Cloudflare binding 发出，发信行为与成本路径会发生变化

### Features

- feat: |发信| 推荐使用 Cloudflare `send_email` binding 作为默认发信通道，已 onboard Email Routing 的域名未配置 Resend/SMTP 时自动走 binding 发至任意地址（Workers Paid 每月含 3000 封，超出 $0.35/1000 封）；历史 `verifiedAddressList` / Resend / SMTP 配置完全兼容（#964）

### Bug Fixes

- fix: |发送邮件| 当 `DEFAULT_SEND_BALANCE > 0` 时，首次访问发信设置或调用发信接口会为缺少 `address_sender` 记录的地址自动初始化默认额度（`ON CONFLICT DO NOTHING`），用户不再需要先手动申请发信权限；已存在的记录（包括管理员禁用或手动设置的行）一律保持原样，runtime 不会覆盖（#925 #985）
- fix: |用户侧收件箱| 修复 `ENABLE_USER_DELETE_EMAIL` 关闭时用户中心仍显示删除按钮且仍可通过 `/user_api/mails/:id` 删除邮件的问题（#978）
- fix: |Address| 创建邮箱时统一将配置的前缀转为小写，避免生成包含大写前缀的地址；历史数据需用户自行迁移为小写（#930）

### Improvements

## v1.6.0

### Features

- feat: |Admin| IP 黑名单设置新增 **IP 白名单（严格模式）**：启用后仅允许匹配白名单的 IP 访问受限流保护的 API（创建邮箱、发送邮件、外部发送邮件、用户注册、验证码校验），其他所有 IP 一律拒绝（#920）
- feat: |Address| 支持最大地址数量设置为 `0` 表示无限制（#968）

### Bug Fixes

- fix: |Admin| 修复 `/admin/address` 与 `/admin/users` 在使用完整邮箱（query 长度超过 50 字节）作为搜索条件时报错 `D1_ERROR: LIKE or GLOB pattern too complex` 的问题，长查询自动改用 `instr()` 绕开 D1 的 LIKE pattern 长度限制（#956）

### Improvements

- docs: |发送邮件 API| 明确 `/api/send_mail` 与 `/external/api/send_mail` 两个端点的认证方式差异，补充"地址 JWT"概念说明（#922）
- docs: |Worker 变量| `JWT_SECRET` 补充生成方式说明（`openssl rand -hex 32`）（#932）
- docs: |CLI 部署| `routes` 自定义域名配置增加用途说明（#932）
- docs: |Admin API| `/admin/new_address` 返回值文档补充 `address_id` 字段（#912）
- docs: |Admin| 补充管理后台账号列表排序功能说明（#918）
- docs: |Pages 部署| 补充 SPA 模式说明，避免刷新页面或直接访问子路径时 404（#813）
- docs: |侧边栏| 重组文档侧边栏结构，拆分为"核心配置"、"通知与集成"、"高级功能"、"管理后台"等分组
- docs: |FAQ| 大幅扩充常见问题，新增 SPA 404、发信余额、SMTP_CONFIG 配置、邮件客户端登录等高频问题（#919, #925, #839, #715, #921, #609）
- docs: |发送邮件| 增强 SMTP_CONFIG 字段说明和多域名示例，新增发信余额机制说明
- docs: |Email Routing| 补充子域名需单独启用 Email Routing 的说明，避免仅在一级域名开启导致子域收不到邮件（#969）

## v1.5.0

### Features

- feat: |Admin| 管理后台账号列表支持按列排序（ID、名称、创建时间、更新时间、邮件数量、发送数量），搜索时自动重置分页到第1页（#918）
- feat: |Admin API| `/admin/new_address` 接口返回值新增 `address_id` 字段，避免创建后需再次查询地址 ID（#912）
- feat: |创建邮箱| 新增 `ENABLE_CREATE_ADDRESS_SUBDOMAIN_MATCH` 开关，并支持在管理后台单独控制创建邮箱 API 的子域名后缀匹配；开启后允许 `foo.example.com` 匹配基础域名 `example.com`
- feat: |自动回复| 发件人过滤支持正则表达式匹配，使用 `/pattern/` 语法（如 `/@example\.com$/`），同时保持前缀匹配的向后兼容
- feat: |Turnstile| 新增全局登录表单 Turnstile 人机验证，通过 `ENABLE_GLOBAL_TURNSTILE_CHECK` 环境变量控制（#767）
- feat: |Telegram| Telegram 推送支持发送邮件附件（单文件限制 50MB），多附件通过 `sendMediaGroup` 批量发送，通过 `ENABLE_TG_PUSH_ATTACHMENT` 环境变量开启（#894）
- feat: |邮件存储| 支持通过 `ENABLE_MAIL_GZIP` 变量启用 Gzip 压缩邮件存储（#823）
  - 启用前需先执行数据库迁移：`Admin -> 快速设置 -> 数据库 -> 升级数据库 Schema`，或调用接口 `POST /admin/db_migration`
  - 新邮件写入 `raw_blob`，兼容读取 `raw` / `raw_blob`；压缩与解压会增加 CPU 开销，建议付费 Worker Plan 再开启

### Bug Fixes

- fix: |自动回复| 修复 `source_prefix` 为空字符串时自动回复不触发的问题（#459），空值现在正确匹配所有发件人
- fix: |OAuth2| 修复 Android via 浏览器等移动端 OAuth2 登录时 sessionStorage 丢失导致回调失败的问题，新增 localStorage 兜底（#900）
- fix: |IMAP| 修复嵌套回复邮件乱码、Gmail 空 Content-Type 头解析失败、缺失 Date 头及 locale 依赖日期格式等问题

### Testing

- test: |E2E| 新增创建邮箱子域名匹配测试，覆盖默认精确匹配、后台开启后生效，以及 env=false 的硬禁用优先级
- test: |E2E| 新增自动回复触发 E2E 测试，覆盖空前缀、前缀匹配、正则匹配和禁用状态场景

### Docs

- docs: |创建邮箱| 补充创建邮箱 API / Worker 变量 / 子域名文档，说明“直接指定子域名”和“随机子域名”两种能力的区别
- docs: |API| 新增地址 JWT 与用户 JWT 的区分说明，避免混淆两种认证方式；调整文档菜单结构，将 API 接口文档归类到独立分组（#910）
- docs: |Telegram| 新增每用户邮件推送和全局推送功能说明文档（#769）
- docs: |Webhook| 新增 Telegram Bot、企业微信、Discord 等常用推送平台的 Webhook 模板示例
- feat: |Webhook| 前端预设模板新增 Telegram Bot、企业微信、Discord 三个模板

### Improvements

## v1.4.0

### Features

- feat: |用户注册| 新增用户注册邮箱正则校验功能，管理员可配置邮箱格式验证规则
- feat: |前端| 新增可配置的 Status 菜单按钮，通过 `STATUS_URL` 环境变量配置状态监控页面链接
- feat: |SMTP| SMTP 代理服务支持 STARTTLS，通过 `smtp_tls_cert` 和 `smtp_tls_key` 环境变量配置
- feat: |Webhook| Webhook 设置页面新增预设模板下拉菜单，支持 Message Pusher、Bark、ntfy 一键填充配置

### Bug Fixes

- fix: |Telegram| 修复 admin 用户通过 Telegram MiniApp 查看邮件时报 `Auth date expired` 的问题，支持 admin 密码认证查看邮件
- fix: |Admin API| 修复 `/admin/account_settings` 在未配置 KV 且 `fromBlockList` 为空时触发 `Cannot read properties of undefined (reading 'put')` 的问题
- fix: |数据库| 修复 `DB_INIT_QUERIES` 缺少 `idx_raw_mails_message_id` 索引导致 `UPDATE raw_mails ... WHERE message_id = ?` 全表扫描的问题，同步 `schema.sql` 与初始化代码，新增 v0.0.6 迁移逻辑
- fix: |文档| 修复 User Mail API 文档中错误使用 `x-admin-auth` 的问题，改为正确的 `x-user-token`
- fix: |前端| 修复暗色主题下邮件内容文字看不清的问题，优化纯文本邮件和 Shadow DOM 渲染的暗色模式样式
- docs: |文档| 新增 Admin 删除邮件、删除邮箱地址、清空收件箱、清空发件箱 API 文档
- fix: |前端| 修复回复 HTML 格式邮件时丢失原邮件 HTML 内容的问题，优先使用 HTML 原文而非纯文本
- fix: |安全| 修复回复/转发邮件时的 XSS 风险，使用 DOMPurify 对 HTML 内容进行白名单消毒，对纯文本内容进行 HTML 转义
- fix: |API| 修复 `requset_send_mail_access` API 路径拼写错误，改为 `request_send_mail_access`

### Testing

- test: |E2E| 新增 Docker 化端到端测试环境（Playwright + Mailpit），`cd e2e && npm test` 一条命令运行
- test: |E2E| 覆盖 API 健康检查、地址生命周期、SMTP 发信、收件箱 UI、回复 HTML 邮件及 XSS 防护
- test: |Worker| 新增 `/admin/test/seed_mail` 测试端点

### Improvements

- style: |邮件列表| 优化收件箱和发件箱空状态显示，根据邮件数量显示不同提示信息，添加语义化图标
- feat: |后台管理| 邮箱地址列表来源IP添加 ip.im 查询链接，点击可快速查看IP信息
- docs: |文档| 修复 VitePress 中英文切换路径错误，改用双前缀 locale 配置
- feat: |IMAP 代理| 重构 IMAP 服务端，拆分为独立模块（HTTP 客户端、邮箱、消息），使用 `deferToThread` 异步 HTTP 避免阻塞 Twisted reactor，使用后端 `id` 作为稳定 UID，新增 STARTTLS 支持、LRU 消息缓存、session 级 flags 管理、SEARCH 命令支持、JWT 凭证和地址+密码双登录方式，新增完整测试套件
- fix: |IMAP 代理| 修复 `getHeaders()` 过滤逻辑、`store()` 崩溃问题
- fix: |邮件解析| 修复 `parse_email.py` 中使用私有属性 `_payload` 导致编码错误的问题，改用 `get_payload(decode=True)` 正确解码邮件体

## v1.3.0

### Features

- feat: |OAuth2| 新增 OAuth2 邮箱格式转换功能，支持通过正则表达式转换第三方登录返回的邮箱格式（如将 `user@domain` 转换为 `user@custom.domain`）
- feat: |OAuth2| 新增 OAuth2 提供商 SVG 图标支持，管理员可为登录按钮配置自定义图标，预置 GitHub、Linux Do、Authentik 模板图标
- feat: |发送邮件| 未配置发送邮件功能时自动隐藏发送邮件 tab、发件箱 tab 和回复按钮

### Bug Fixes

- fix: |用户地址| 修复禁止匿名创建时，已登录用户地址数量限制检查失效的问题，新增公共函数 `isAddressCountLimitReached` 统一处理地址数量限制逻辑

### Improvements

- refactor: |代码重构| 提取地址数量限制检查为公共函数，优化代码复用性
- perf: |性能优化| GET 请求中的地址活动时间更新改为异步执行，使用 `waitUntil` 不阻塞响应

## v1.2.1

### Bug Fixes

- fix: |定时任务| 修复定时任务清理报错 `e.get is not a function`，使用可选链安全访问 Context 方法

### Improvements

- style: |AI 提取| 暗色模式下 AI 提取信息使用更柔和的蓝色 (#A8C7FA)，减少视觉疲劳

## v1.2.0

### Breaking Changes

- |数据库| 新增 `source_meta` 字段，需执行 `db/2025-12-27-source-meta.sql` 更新数据库或到 admin 维护页面点击数据库更新按钮

### Features

- feat: |Admin| 新增管理员账号页面，显示当前登录方式并支持退出登录（仅限密码登录方式）
- fix: |GitHub Actions| 修复容器镜像名需要全部小写的问题
- feat: |邮件转发| 新增来源地址正则转发功能，支持按发件人地址过滤转发，完全向后兼容
- feat: |地址来源| 新增地址来源追踪功能，记录地址创建来源（Web 记录 IP，Telegram 记录用户 ID，Admin 后台标记）
- feat: |邮件过滤| 移除后端 keyword 参数，改为前端过滤当前页邮件，优化查询性能
- feat: |前端| 地址切换统一为下拉组件，极简模式支持切换，主页提供地址管理入口
- feat: |数据库| 为 `message_id` 字段添加索引，优化邮件更新操作性能，需执行 `db/2025-12-15-message-id-index.sql` 更新数据库
- feat: |Admin| 维护页面增加自定义 SQL 清理功能，支持定时任务执行自定义清理语句
- feat: |国际化| 后端 API 错误消息全面支持中英文国际化
- feat: |Telegram| 机器人支持中英文切换，新增 `/lang` 命令设置语言偏好

## v1.1.0

- feat: |AI 提取| 增加 AI 邮件识别功能，使用 Cloudflare Workers AI 自动提取邮件中的验证码、认证链接、服务链接等重要信息
  - 支持优先级提取：验证码 > 认证链接 > 服务链接 > 订阅链接 > 其他链接
  - 管理员可配置地址白名单（支持通配符，如 `*@example.com`）
  - 前端列表和详情页展示提取结果
  - 需要配置 `ENABLE_AI_EMAIL_EXTRACT` 环境变量和 AI 绑定
  - 需要执行 `db/2025-12-06-metadata.sql` 文件中的 SQL 更新 `D1` 数据库 或者到 admin维护页面点击数据库更新按钮
- feat: |Admin| 维护页面增加清理 n 天前空邮件的邮箱地址功能
- fix: 修复自定义认证密码功能异常的问题 (前端属性名错误 & /open_api 接口被拦截)

## v1.0.7

- feat: |Admin| 新增 IP 黑名单功能，用于限制访问频率较高的 API
- feat: |Admin| 新增 ASN 组织黑名单功能，支持基于 ASN 组织名称过滤请求（支持文本匹配和正则表达式）
- feat: |Admin| 新增浏览器指纹黑名单功能，支持基于浏览器指纹过滤请求（支持精确匹配和正则表达式）

## v1.0.6

- feat: |DB| update db schema add index
- feat: |地址密码| 增加地址密码登录功能, 通过 `ENABLE_ADDRESS_PASSWORD` 配置启用, 需要执行 `db/2025-09-23-patch.sql` 文件中的 SQL 更新 `D1` 数据库
- fix: |GitHub Actions| 修复 debug 模式配置，仅当 DEBUG_MODE 为 'true' 时才启用调试模式
- feat: |Admin| 账户管理页面新增多选批量操作功能（批量删除、批量清空收件箱、批量清空发件箱）
- feat: |Admin| 维护页面增加清理未绑定用户地址的功能
- feat: 支持针对角色配置不同的绑定地址数量上限, 可在 admin 页面配置

## v1.0.5

- feat: 新增 `DISABLE_CUSTOM_ADDRESS_NAME` 配置: 禁用自定义邮箱地址名称功能
- feat: 新增 `CREATE_ADDRESS_DEFAULT_DOMAIN_FIRST` 配置: 创建地址时优先使用第一个域名
- feat: |UI| 主页增加进入极简模式按钮
- feat: |Webhook| 增加白名单开关功能，支持灵活控制访问权限

## v1.0.4

- feat: |UI| 优化极简模式主页, 增加全部邮件页面功能(删除/下载/附件/...), 可在 `外观` 中切换
- feat: admin 账号设置页面增加 `邮件转发规则` 配置
- feat: admin 账号设置页面增加 `禁止接收未知地址邮件` 配置
- feat: 邮件页面增加 上一封/下一封 按钮

## v1.0.3

- fix: 修复 github actions 部署问题
- feat: telegram /new 不指定域名时, 使用随机地址

## v1.0.2

- fix: 修复 oauth2 登录失败的问题

## v1.0.1

- feat: |UI| 增加极简模式主页, 可在 `外观` 中切换
- fix: 修复 oauth2 登录时，default role 不生效的问题

## v1.0.0

- fix: |UI| 修复 User 查看收件箱，不选择地址时，关键词查询不生效
- fix: 修复自动清理任务，时间为 0 时不生效的问题
- feat: 清理功能增加 创建 n 天前地址清理，n 天前未活跃地址清理
- fix: |IMAP Proxy| 修复 IMAP Proxy 服务器，无法查看新邮件的问题

## v0.10.0

- feat: 支持 User 查看收件箱，`/user_api/mails` 接口, 支持 `address` 和 `keyword` 过滤
- fix: 修复 Oauth2 登录获取 Token 时，一些 Oauth2 需要 `redirect_uri` 参数的问题
- feat: 用户访问网页时，如果 `user token` 在 7 天内过期，自动刷新
- feat: admin portal 中增加初始化 db 的功能
- feat: 增加 `ALWAYS_SHOW_ANNOUNCEMENT` 变量，用于配置是否总是显示公告

## v0.9.1

- feat: |UI| support google ads
- feat: |UI| 使用 shadow DOM 防止样式污染
- feat: |UI| 支持 URL jwt 参数自动登录邮箱，jwt 参数会覆盖浏览器中的 jwt
- fix: |CleanUP| 修复清理邮件时，清理时间超过 30 天报错的 bug
- feat: admin 用户管理页面: 增加 用户地址查看功能
- feat: | S3 附件| 增加 S3 附件删除功能
- feat: | Admin API| 增加 admin 绑定用户和地址的 api
- feat: | Oauth2 | Oatuh2 获取用户信息时，支持 `JSONPATH` 表达式

## v0.9.0

- feat: | Worker | 支持多语言
- feat: | Worker | `NO_LIMIT_SEND_ROLE` 配置支持多角色, 逗号分割
- feat: | Actions | build 里增加 `worker-with-wasm-mail-parser.zip` 支持 UI 部署带 `wasm` 的 worker

## v0.8.7

- fix: |UI| 修复移动设备日期显示问题
- feat: |Worker| 支持通过 `SMTP` 发送邮件, 使用 [zou-yu/worker-mailer](https://github.com/zou-yu/worker-mailer/blob/main/README_zh-CN.md)

## v0.8.6

- feat: |UI| 公告支持 html 格式
- feat: |UI| `COPYRIGHT` 支持 html 格式
- feat: |Doc| 优化部署文档，补充了 `Github Actions 部署文档`，增加了 `Worker 变量说明`

## v0.8.5

- feat: |mail-parser-wasm-worker| 修复 `initSync` 函数调用时的 `deprecated` 参数警告
- feat: rpc headers covert & typo (#559)
- fix: telegram mail page use iframe show email (#561)
- feat: |Worker| 增加 `REMOVE_ALL_ATTACHMENT` 和 `REMOVE_EXCEED_SIZE_ATTACHMENT` 用于移除邮件附件，由于是解析邮件的一些信息会丢失，比如图片等.

## v0.8.4

- fix: |UI| 修复 admin portal 无收件人邮箱删除调用api 错误
- feat: |Telegram Bot| 增加 telegram bot 清理无效地址凭证命令
- feat: 增加 worker 配置 `DISABLE_ANONYMOUS_USER_CREATE_EMAIL` 禁用匿名用户创建邮箱地址，只允许登录用户创建邮箱地址
- feat: 增加 worker 配置 `ENABLE_ANOTHER_WORKER` 及 `ANOTHER_WORKER_LIST` ，用于调用其他 worker 的 rpc 接口 (#547)
- feat: |UI| 自动刷新配置保存到浏览器，可配置刷新间隔
- feat: 垃圾邮件检测增加存在时才检查的列表 `JUNK_MAIL_CHECK_LIST` 配置
- feat: | Worker | 增加 `ParsedEmailContext` 类用于缓存解析后的邮件内容，减少解析次数
- feat: |Github Action| Worker 部署增加 `DEBUG_MODE` 输出日志, `BACKEND_USE_MAIL_WASM_PARSER` 配置是否使用 wasm 解析邮件

## v0.8.3

- feat: |Github Action| 增加自动更新并部署功能
- feat: |UI| admin 用户设置，支持 oauth2 配置的删除
- feat: 增加垃圾邮件检测必须通过的列表 `JUNK_MAIL_FORCE_PASS_LIST` 配置

## v0.8.2

- fix: |Doc| 修复文档中的一些错误
- fix: |Github Action| 修复 frontend 部署分支错误的问题
- feat: admin 发送邮件功能
- feat: admin 后台，账号配置页面添加无限发送邮件的地址列表

## v0.8.1

- feat: |Doc| 更新 UI 安装的文档
- feat: |UI| 对用户隐藏邮箱账号的 ID
- feat: |UI| 增加邮件详情页的 `转发` 按钮

## v0.8.0

- feat: |UI| 随机生成地址时不超过最大长度
- feat: |UI| 邮件时间显示浏览器时区，可在设置中切换显示为 UTC 时间
- feat: 支持转移邮件到其他用户

## v0.7.6

### Breaking Changes

UI 部署 worker 需要点击 Settings -> Runtime, 修改 Compatibility flags, 增加 `nodejs_compat`

![worker-runtime](vitepress-docs/docs/public/ui_install/worker-runtime.png)

### Changes

- feat: 支持提前设置 bot info, 降低 telegram 回调延迟 (#441)
- feat: 增加 telegram mini app 的 build 压缩包
- feat: 增加是否启用垃圾邮件检查 `ENABLE_CHECK_JUNK_MAIL` 配置

## v0.7.5

- fix: 修复 `name` 的校验检查

## v0.7.4

- feat: UI 列表页面增加最小宽度
- fix: 修复 `name` 的校验检查
- fix: 修复 `DEFAULT_DOMAINS` 配置为空不生效的问题

## v0.7.3

- feat: worker 增加 `ADDRESS_CHECK_REGEX`, address name 的正则表达式, 只用于检查，符合条件将通过检查
- fix: UI 修复登录页面 tab 激活图标错位
- fix: UI 修复 admin 页面刷新弹框输入密码的问题
- feat: support `Oath2` 登录, 可以通过 `Github` `Authentik` 等第三方登录, 详情查看 [OAuth2 第三方登录](https://temp-mail-docs.awsl.uk/zh/guide/feature/user-oauth2.html)

## v0.7.2

### Breaking Changes

`webhook` 的结构增加了 `enabled` 字段，已经配置了的需要重新在页面开启并保存。

### Changes

- fix: worker 增加 `NO_LIMIT_SEND_ROLE` 配置, 加载失败的问题
- feat: worker 增加 `# ADDRESS_REGEX = "[^a-z.0-9]"` 配置, 替换非法符号的正则表达式，如果不设置，默认为 [^a-z0-9], 需谨慎使用, 有些符号可能导致无法收件
- feat: worker 优化 webhook 逻辑, 支持 admin 配置全局 webhook, 添加 `message pusher` 集成示例

## v0.7.1

- fix: 修复用户角色加载失败的问题
- feat: admin 账号设置增加来源邮件地址黑名单配置

## v0.7.0

### Breaking Changes

DB changes: 增加用户 `passkey` 表, 需要执行 `db/2024-08-10-patch.sql` 更新 `D1` 数据库

### Changes

- Docs: Update new-address-api.md (#360)
- feat: worker 增加 `ADMIN_USER_ROLE` 配置, 用于配置管理员用户角色，此角色的用户可访问 admin 管理页面 (#363)
- feat: worker 增加 `DISABLE_SHOW_GITHUB` 配置, 用于配置是否显示 github 链接
- feat: worker 增加 `NO_LIMIT_SEND_ROLE` 配置, 用于配置可以无限发送邮件的角色
- feat: 用户增加 `passkey` 登录方式, 用于用户登录, 无需输入密码
- feat: worker 增加 `DISABLE_ADMIN_PASSWORD_CHECK` 配置, 用于配置是否禁用 admin 控制台密码检查, 若你的网站只可私人访问，可通过此禁用检查

## v0.6.1

- pages github actions && 修复清理邮件天数为 0 不生效 by @tqjason (#355)
- fix: imap proxy server 不支持 密码 by @dreamhunter2333 (#356)
- worker 新增 `ANNOUNCEMENT` 配置, 用于配置公告信息 by @dreamhunter2333 (#357)
- fix: telegram bot 新建地址默认选择第一个域名 by @dreamhunter2333 (#358)

## v0.6.0

### Breaking Changes

DB changes: 增加用户角色表, 需要执行 `db/2024-07-14-patch.sql` 更新 `D1` 数据库

### Changes

worker 配置文件新增 `DEFAULT_DOMAINS`, `USER_ROLES`, `USER_DEFAULT_ROLE`, 具体查看文档 [worker配置](https://temp-mail-docs.awsl.uk/zh/guide/cli/worker.html#%E4%BF%AE%E6%94%B9-wrangler-toml-%E9%85%8D%E7%BD%AE%E6%96%87%E4%BB%B6)

- 移除 `apiV1` 相关代码和相关的数据库表
- 更新 `admin/statistics` api, 添加用户统计信息
- 更新地址的规则，只允许小写+数字，对于历史的地址在查询邮件时会进行 `lowercase` 处理
- 增加用户角色功能，`admin` 可以设置用户角色(目前可配置每个角色域名和前缀)
- admin 页面搜索优化, 回车自动搜索, 输入内容自动 trim

## v0.5.4

- 点击 logo 5 次进入 admin 页面
- 修复 401 时无法跳转登录页面(admin 和 网站认证)

## v0.5.3

- 修复 smtp imap proxy sever 的一些 bug
- 完善用户/admin 删除收件箱/发件箱的功能
- admin 可以删除 发件权限记录
- 添加中文邮件别名配置 `DOMAIN_LABELS` [文档](https://temp-mail-docs.awsl.uk/zh/guide/cli/worker.html)
- 移除 `mail channels` 相关代码
- github actions 增加 `FRONTEND_BRANCH` 变量用于指定部署的分支 (#324)

## v0.5.1

- 添加 `mail-parser-wasm-worker` 用于 worker 解析邮件, [文档](https://temp-mail-docs.awsl.uk/zh/guide/feature/mail_parser_wasm_worker.html)
- 添加校验用户邮箱长度配置 `MIN_ADDRESS_LEN` 和 `MAX_ADDRESS_LEN`
- 修复 `pages function` 未转发 `telegram` api 问题

## v0.5.0

- UI: 增加本地缓存进行地址管理
- worker: 增加 `FORWARD_ADDRESS_LIST` 全局邮件转发地址(等同于 `catch all`)
- UI: 多语言使用路由进行切换
- 添加保存附件到 S3 的功能
- UI: 增加收取邮件列表 `批量删除` 和 `批量下载`

## v0.4.6

- worker 配置文件添加 `TITLE = "Custom Title"`, 可自定义网站标题
- 修复 KV 未绑定无法删除地址的问题

## v0.4.5

- UI lazy load 懒加载
- telegram bot 添加用户全局推送功能(admin 用户)
- 增加对 cloudflare verified 用户发送邮件
- 增加使用 `resend` 发送邮件, `resend` 提供 http 和 smtp api, 使用更加方便, 文档: https://temp-mail-docs.awsl.uk/zh/guide/config-send-mail.html

## v0.4.4

- 增加 telegram mini app
- telegram bot 增加 `ubind`, `delete` 指令
- 修复 webhook 多行文本的问题

## v0.4.3

### Breaking Changes

配置文件 `main = "src/worker.js"` 改为 `main = "src/worker.ts"`

### Changes

- `telegram bot`  白名单配置
- `ENABLE_WEBHOOK` 添加 webhook
- UI: admin 页面使用双层 tab
- UI: 登录后可直接主页切换地址
- UI: 发件箱也采用左右分栏显示(类似收件箱)
- `SMTP IMAP Proxy` 添加发件箱查看

* feat: telegram bot TelegramSettings && webhook by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/244
* fix build by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/245
* feat: UI changes by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/247
* feat: SMTP IMAP Proxy: add sendbox && UI: sendbox use split view by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/248

## v0.4.2

- 修复 smtp imap proxy sever 的一些 bug
- 修复 UI 界面文字错误, 界面增加版本号
- 增加  telegram bot 文档 https://temp-mail-docs.awsl.uk/zh/guide/feature/telegram.html

* fix: imap server by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/227
* fix: Maintenance wrong label by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/229
* feat: add version for frontend && backend by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/230
* feat: add page functions proxy to make response faster by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/234
* feat: add about page by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/235
* feat: remove mailV1Alert && fix mobile showSideMargin by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/236
* feat: telegram bot by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/238
* fix: remove cleanup address due to many table need to be clean by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/240
* feat: docs: Telegram Bot by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/241
* fix: smtp_proxy: cannot decode 8bit && tg bot new random address by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/242
* fix: smtp_proxy: update raise imap4.NoSuchMailbox by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/243

### v0.4.1

- 用户名限制最长30个字符
- 修复 `/external/api/send_mail` 未返回的 bug (#222)
- 添加 `IMAP proxy` 服务，支持 `IMAP` 查看邮件
- UI 界面增加版本号显示

* feat: use common function handleListQuery when query by page by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/220
* fix: typos by @lwd-temp in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/221
* fix: name max 30 && /external/api/send_mail not return result by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/222
* fix: smtp_proxy_server support decode from mail charset by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/223
* feat: add imap proxy server by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/225
* feat: UI show version by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/226

### New Contributors

* @lwd-temp made their first contribution in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/221

## v0.4.0

### DB Changes/Breaking changes

新增 user 相关表，用于存储用户信息

- `db/2024-05-08-patch.sql`

### config changs

启用用户注册邮箱验证需要 `KV`

```toml
# kv config for send email verification code
# [[kv_namespaces]]
# binding = "KV"
# id = "xxxx"
```

### function changs

- 增加用户注册功能，可绑定邮箱地址，绑定后可自动获取邮箱JWT凭证
- 增加默认以文本显示邮件，文本和HTML邮箱显示方式切换按钮
- 修复 `BUG` 随机生成的邮箱名字不合法 #211
- `admin` 邮件页面支持邮件内容搜索 #210
- 修复删除地址时邮件未删除的BUG #213
- UI 增加全局标签页位置配置, 侧边距配置

* feat: update docs by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/204
* feat: add Deploy to Cloudflare Workers button by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/205
* feat: add Deploy to Cloudflare Workers docs by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/206
* feat: add UserLogin by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/209
* feat: admin search mailbox && fix generateName multi dot && user jwt exp in 30 days && UI globalTabplacement && useSideMargin by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/214
* feat: UI check openSettings in Login page by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/215
* feat: UI move AdminContact to common by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/217
* feat: docs by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/218

## v0.3.3

- 修复 Admin 删除邮件报错
- UI: 回复邮件按钮, 引用原始邮件文本  #186
- 添加发送邮件地址黑名单
- 添加 `CF Turnstile` 人机验证配置
- 添加 `/external/api/send_mail` 发送邮件 api, 使用 body 验证 #194

## v0.3.2

## What's Changed

- UI: 添加回复邮件按钮
- 添加定时清理功能，可在 admin 页面配置（需要在配置文件启用定时任务）
- 修复删除账户无反应的问题

* feat: UI: MailBox add reply button by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/187
* feat: add cron auto clean up by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/189
* fix: delete account by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/190

## v0.3.1

### DB Changes

新增 `settings` 表，用于存储通用配置信息

- `db/2024-05-01-patch.sql`

### Changes

- `ENABLE_USER_CREATE_EMAIL` 是否允许用户创建邮件
- 允许 admin 创建无前缀的邮件
- 添加 `SMTP proxy server`，支持 SMTP 发送邮件
- 修复某些情况浏览器无法加载 `wasm` 时使用 js 解析邮件
- 页脚添加 `COPYRIGHT`
- UI 允许用户切换邮件展示模式 `v-html` / `iframe`
- 添加 `admin` 账户配置页面，支持配置用户注册名称黑名单

* feat: support admin create address && add ENABLE_USER_CREATE_EMAIL co… by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/175
* feat: add SMTP proxy server by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/177
* fix: cf ui var is string by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/178
* fix: UI mailbox 100vh to 80vh by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/179
* fix: smtp_proxy_server hostname && add docker image for linux/arm64 by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/180
* fix: some browser do not support wasm by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/182
* feat: add COPYRIGHT by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/183
* feat: UI: add user page: useIframeShowMail && mailboxSplitSize by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/184
* feat: add address_block_list for new address by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/185

## v0.3.0

### Breaking Changes

`address` 表的前缀将从代码中迁移到 db 中，请将下面 sql 中的 `tmp` 替换为你的前缀，然后执行。
如果你的数据很重要，请先备份数据库。

**注意替换前缀**

```sql
update
    address
set
    name = 'tmp' || name;
```

### Changes

- `address` 表的前缀将从代码中迁移到 db 中
- `admin` 账户页面添加收发邮件数量
- `admin` 发件页面默认显示全部
- `admin` 发件权限页面支持搜索地址
- `admin` 邮件页面使用左右分栏 UI

* feat: remove PREFIX logic in db by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/171
* feat: admin page add account mail count && sendbox default all && sen… by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/172
* feat: all mail use MailBox Component by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/173

**Full Changelog**: https://github.com/dreamhunter2333/cloudflare_temp_email/compare/0.2.10...v0.3.0

## v0.2.10

- `ENABLE_USER_DELETE_EMAIL` 是否允许用户删除账户和邮件
- `ENABLE_AUTO_REPLY` 是否启用自动回复
- fetchAddressError 提示改进
- 自动刷新显示倒计时

* feat: docs update by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/165
* feat: add ENABLE_USER_DELETE_EMAIL && ENABLE_AUTO_REPLY && modify fetchAddressError i18n && UI: show autoRefreshInterval by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/169

## v0.2.9

- 添加富文本编辑器
- admin 联系方式，不配置则不显示，可配置任意字符串 `ADMIN_CONTACT = "xx@xx.xxx"`
- 默认发送邮件余额，如果不设置，将为 0 `DEFAULT_SEND_BALANCE = 1`

## v0.2.8

- 允许用户删除邮件
- admin 修改发件权限时邮件通知用户
- 发件权限默认 1 条
- 添加 RATE_LIMITER 限流 发送邮件 和 新建地址
- 一些 bug 修复

- feat: allow user delete mail && notify when send access changed by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/132
- feat: requset_send_mail_access default 1 balance by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/143
- fix: RATE_LIMITER not call jwt by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/146
- fix: delete_address not delete address_sender by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/153
- fix: send_balance not update when click sendmail by @dreamhunter2333 in https://github.com/dreamhunter2333/cloudflare_temp_email/pull/155

## v0.2.7

- Added user interface installation documentation
- Support email DKIM
- Rate limiting configuration for `/api/new_address`

## v0.2.6

- Added admin query outbox page
- Add admin data cleaning page

## 2024-04-12 v0.2.5

- support send email

DB changes:

- `db/2024-04-12-patch.sql`

## 2024-04-10 v0.2.0

### Breaking Changes

- remove `ENABLE_ATTACHMENT` config
- use rust wasm to parse email in frontend
- deprecated api moved to `/api/v1`

### Rust Mail Parser

由于 nodejs 解析 email 的库有些问题，此版本切换到使用 rust wasm 调用 rust 的mail 解析库

- 速度更快，附件支持好，可以显示邮件的附件图片
- 解析支持更多 rfc 规范

Due to some problems with nodejs' email parsing library, this version switches to using rust wasm to call rust's mail parsing library.

- Faster speed, good attachment support, can display attachment images of emails
- Parsing supports more rfc specifications

### DB changs

将 `mails` 表废弃，新的 `mail` 的 `raw` 文本将直接存入 `raw_mails` 表.
The `mails` table will be discarded, and the `raw` text of the new `mail` will be directly stored in the `raw_mails` table

## Upgrade Step

```bash
git checkout v0.2.0
cd worker
wrangler d1 execute dev  --file=../db/2024-04-09-patch.sql --remote
pnpm run deploy
cd ../frontend
pnpm run deploy
```

注意：对于历史邮件，请使用部署新网页查看旧数据。
Note: For historical messages, use the Deploy New web page to view old data.

```bash
git checkout feature/backup
cd frontend
# 创建一个新的 pages, 用于访问旧数据
pnpm run deploy --project-name temp-email-v1
```

## 2024-04-09 v0.0.0

release v0.0.0

## 2024-04-03

DB changes

- `db/2024-04-03-patch.sql`

Changes:

- add delete account
- add admin panel search

## 2024-01-13

DB changes

- `db/2024-01-13-patch.sql`
