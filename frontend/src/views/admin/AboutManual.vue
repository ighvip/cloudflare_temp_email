<script setup lang="ts">
import { computed, ref } from 'vue'
import { useScopedI18n } from '../../i18n/app'

import { useGlobalState } from '../../store'

/**
 * 后台「关于」页 = 详细系统说明书 (问题19批外新增项)。
 * zh-first：正文直接中文；界面通用词条（标题/副标题）走 i18n，
 * 缺失时回退中文。内容按章节折叠，默认展开前两章。
 */
const { openSettings } = useGlobalState()

const { t } = useScopedI18n('views.admin.AboutManual')

const sections = [
    {
        id: 's-overview',
        titleKey: 'secOverview',
        blocks: [
            {
                heading: '这是什么',
                text: '本系统是基于 Cloudflare Workers + D1 + KV 的临时邮箱（一次性邮箱）服务：收信由 Cloudflare Email Routing 转发到 Worker，Worker 解析后写入 D1；发信可走 Resend / SMTP（worker-mailer）；附件可选落 S3/R2。前端为 Vue 3 + naive-ui 单页应用，作为 Worker 的静态资源（ASSETS）一起部署。',
            },
            {
                heading: '组件清单',
                list: [
                    'Worker（worker/）：全部 API、邮件收发、管理后台接口、静态资源托管。',
                    '前端（frontend/）：首页 / 用户中心 / 帮助 / 管理后台，一套 SPA。',
                    'D1（数据库）：邮箱地址、邮件、发件箱、用户、设置项。',
                    'KV（可选）：Webhook 配置、限流计数等高频小数据。',
                    'R2/S3（可选）：附件存储。',
                ],
            },
            {
                heading: '一次收信的链路',
                list: [
                    '外部来信 → Cloudflare Email Routing → Worker（email handler）。',
                    'Worker 校验域名/地址是否存在（或是否允许随机子域名），解析 MIME。',
                    '写入 raw_mails 表；命中转发规则则同时投递到 FORWARD_ADDRESS_LIST。',
                    '首页收件箱轮询 /api/mails 展示，未启用读状态时不做已读上报。',
                ],
            },
        ],
    },
    {
        id: 's-deploy',
        titleKey: 'secDeploy',
        blocks: [
            {
                heading: '首次部署',
                list: [
                    '1. 复制 wrangler.toml.example 为 wrangler.toml，填入 d1 数据库 id、KV 命名空间、JWT_SECRET、ADMIN_PASSWORD。',
                    '2. cd worker && npx wrangler deploy --minify（数据库迁移会自动执行，也可手动 npx wrangler d1 migrations apply）。',
                    '3. cd frontend && pnpm build:pages 生成 dist/，再部署——本仓库的 dist 由 worker 的 [assets] 段直接托管，随 wrangler deploy 一起发布。',
                    '4. 浏览器打开站点，首页左上角小圆点是唯一的后台入口。',
                ],
            },
            {
                heading: '升级',
                list: [
                    'git pull 后重复第 2、3 步即可；数据结构变更随迁移脚本自动应用，不需要手工改库。',
                    '回滚：切回上一个 tag 重新 deploy；D1 迁移是向前兼容的增量，一般无需回滚数据。',
                ],
            },
            {
                heading: '环境变量优先级',
                text: '后台「站点设置 / 全局邮箱设置」等保存到 D1 的值优先于 wrangler.toml 环境变量；表单里留空则回退到环境变量。修改环境变量需要重新 deploy 才生效，修改 D1 设置刷新页面即生效。',
            },
        ],
    },
    {
        id: 's-domain',
        titleKey: 'secDomain',
        blocks: [
            {
                heading: '接入步骤',
                list: [
                    '1. Cloudflare 控制台 → 你的域名 → Email → Email Routing → 添加域名（与站点同域或另一个已托管域名）。',
                    '2. CF 会给出 MX 记录（priority 10/20 的 mx01/mx02.*.net），按提示在 DNS 里确认。',
                    '3. Routing 规则里把「Catch-all」或具体规则的 Action 设为 Send to Worker，选择本 Worker。',
                    '4. 回到后台「域名管理」，手动添加同一个域名并打开「收信 / 发信」两个开关。',
                    '5. 发信（SMTP/Resend）还要求域名在 CF 上已配好 SPF/DKIM，且 Email Routing 的「Domain Sender» 部分允许该域。',
                ],
            },
            {
                heading: '常见坑',
                list: [
                    'Routing 生效前会显示「Pending」，此时来信不会到达 Worker——先等状态变绿。',
                    '域名换了 Worker 绑定后，旧的转发地址要删除，否则会 404。',
                    '多域名时每个域名的收信开关相互独立；域名删除前必须先清空该域下所有地址。',
                ],
            },
        ],
    },
    {
        id: 's-settings',
        titleKey: 'secNavigation',
        blocks: [
            {
                heading: '快速设置',
                list: [
                    '数据库：D1 连接、迁移状态、表统计。',
                    '站点设置：标题、版权、简介、默认语言、邮箱前缀、公开统计（真实/手动）、公告管理。',
                    '全局邮箱设置：收信过滤 / 转发 / 发信三组规则 + 统一关键词过滤与测试器。',
                    '用户设置：注册开关、用户可创建地址数量、删除邮件权限等。',
                    'Worker 配置：环境变量只读视图，对照 wrangler.toml 排查。',
                    '管理员设置：修改密码、登录方式、后台会话、禁用 env 旧密码登录。',
                ],
            },
            {
                heading: '邮箱 / 用户 / 邮件',
                list: [
                    '邮箱管理：地址列表（收/发计数）、创建地址（前缀可改可清空）、批量清空。',
                    '用户管理：注册用户、角色与角色前缀、角色地址配置、地址绑定。',
                    '邮件：收件箱全量视图、无收件人邮件、发件箱、发送邮件、邮件 Webhook。',
                ],
            },
            {
                heading: '其余',
                list: [
                    '统计：手绘黑白图表——每域名收信、来源分布、每日发送、注册趋势、未知邮件。',
                    '维护：清理任务（灰显无效项）、黑名单、限流说明。',
                    '外观：主题、简洁首页开关、深浅色切换。',
                    '站点域名：域名列表 + 收信/发信双开关 + Cloudflare 接入指引。',
                ],
            },
        ],
    },
    {
        id: 's-security',
        titleKey: 'secSecurity',
        blocks: [
            {
                heading: '后台入口',
                text: '后台没有任何公开链接：直输地址返回 404。唯一入口是首页左上角小圆点，点击后铸造一次性令牌（?k=）换取会话，令牌以 #gt= 片段保留在地址栏（可复制，但不会发给服务器），会话令牌存 sessionStorage 并以 x-gate-tab 头随每个 /admin/* 请求发送，服务端每 30s 心跳续期，关窗即失效。',
            },
            {
                heading: '密码',
                list: [
                    '管理员密码：env ADMIN_PASSWORD（旧）+ 后台可改的存储哈希（新）。可在「管理员设置」开启「禁用环境变量旧密码登录」，开启后仅存储哈希可登录。',
                    '地址密码：SHA-256 前端哈希后存 D1，需 ENABLE_ADDRESS_PASSWORD=true。',
                    '用户密码：同为 SHA-256 哈希，登录后签发 JWT。',
                ],
            },
            {
                heading: '加固建议',
                list: [
                    '开启 Turnstile（CF_TURNSTILE_SITE_KEY/SECRET）拦截机器注册。',
                    '配置 IP 黑名单 / 白名单（后台维护，支持 ASN、指纹）。',
                    '限制 ADMIN_API 可见性：关闭 workers.dev 域名、加 Cloudflare WAF 规则。',
                    '公开统计有 60s 缓存，勿把 D1 查询暴露给未认证路径。',
                ],
            },
        ],
    },
    {
        id: 's-troubleshoot',
        titleKey: 'secTroubleshoot',
        blocks: [
            {
                heading: '收不到信',
                list: [
                    '先看 Email Routing 状态是否 Active、Catch-all 是否指向本 Worker。',
                    '再看域名在后台是否「已启用收信」、地址是否存在（列表里查得到吗）。',
                    '仍无果：wrangler tail 看 email handler 是否报错（MIME 解析失败、D1 写入失败都会打日志）。',
                ],
            },
            {
                heading: '发信 400/403',
                list: [
                    '400「Failed to send mail …」：SMTP/Resend 配置错误或域名未配 SPF/DKIM。',
                    '403：该域未开发送信，或地址没有发送权限（地址发送需管理员在用户设置里授权）。',
                    '限流：SEND_MAIL_LIMIT_* 触发，计数在 KV，重启 Worker 不清零，等周期过。',
                ],
            },
            {
                heading: '后台打不开 / 404',
                list: [
                    '直输后台地址永远 404，必须从首页小圆点进入——这是设计行为，不是故障。',
                    '会话过期（120s 无心跳）也会回到 404，重新从小圆点进入即可。',
                    '换浏览器/隐私模式会丢 sessionStorage，同样需要重新进入。',
                ],
            },
            {
                heading: 'Webhook / 自动回复 403',
                text: '说明功能未启用：Webhook 需要 ENABLE_WEBHOOK=true 且绑定 KV；自动回复需要 ENABLE_AUTO_REPLY=true。页面会安静地显示「未启用 + 如何开启」，不会弹错误。',
            },
        ],
    },
]

const openIds = ref<string[]>(['s-overview', 's-deploy'])
const toggle = (id: string) => {
    openIds.value = openIds.value.includes(id)
        ? openIds.value.filter((item) => item !== id)
        : [...openIds.value, id]
}

const version = computed(() => openSettings.value.version || '')
</script>

<template>
    <div class="manual">
        <div class="page-head">
            <h2>{{ t('pageTitle') }}</h2>
            <p>
                {{ t('pageDesc') }}
                <n-tag v-if="version" size="small" :bordered="false" style="margin-left: 6px;">
                    {{ version }}
                </n-tag>
            </p>
        </div>

        <div v-for="section in sections" :key="section.id" class="manual-section">
            <button type="button" class="manual-head" @click="toggle(section.id)">
                <span class="manual-caret">{{ openIds.includes(section.id) ? '−' : '+' }}</span>
                <span class="manual-title">{{ t(section.titleKey) }}</span>
                <span class="manual-count">{{ section.blocks.length }}</span>
            </button>
            <div v-if="openIds.includes(section.id)" class="manual-body">
                <div v-for="(block, blockIndex) in section.blocks" :key="blockIndex" class="manual-block">
                    <h3 class="manual-block-title">{{ block.heading }}</h3>
                    <p v-if="block.text" class="manual-text">{{ block.text }}</p>
                    <ol v-if="block.list" class="manual-list">
                        <li v-for="(item, itemIndex) in block.list" :key="itemIndex">{{ item }}</li>
                    </ol>
                </div>
            </div>
        </div>

        <div class="manual-foot">
            {{ t('footNote') }}
        </div>
    </div>
</template>

<style scoped>
.manual {
    max-width: 860px;
    margin: 0 auto;
    text-align: left;
}

.page-head {
    margin-bottom: 12px;
}

.page-head h2 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 4px;
}

.page-head p {
    font-size: 12.5px;
    opacity: 0.65;
    line-height: 1.6;
}

.manual-section {
    border: 1px solid rgba(128, 128, 128, 0.16);
    border-radius: 12px;
    background: rgba(128, 128, 128, 0.04);
    margin-bottom: 10px;
    overflow: hidden;
}

.manual-head {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    width: 100%;
    padding: 12px 14px;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.manual-head:hover {
    background: rgba(128, 128, 128, 0.07);
}

.manual-caret {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 1px solid rgba(128, 128, 128, 0.4);
    border-radius: 5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1;
}

.manual-title {
    flex: 0 0 auto;
    font-size: 13.5px;
    font-weight: 700;
}

.manual-count {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    letter-spacing: 1px;
    opacity: 0.5;
}

.manual-body {
    padding: 2px 14px 14px;
    border-top: 1px dashed rgba(128, 128, 128, 0.22);
}

.manual-block {
    margin-top: 12px;
}

.manual-block-title {
    font-size: 12.5px;
    font-weight: 700;
    margin-bottom: 6px;
}

.manual-block-title::before {
    content: '';
    display: inline-block;
    width: 4px;
    height: 11px;
    margin-right: 7px;
    border-radius: 2px;
    background: currentColor;
    vertical-align: -1px;
}

.manual-text {
    font-size: 13px;
    line-height: 1.75;
    opacity: 0.8;
    margin: 0;
}

.manual-list {
    margin: 0;
    padding-left: 0;
    list-style-position: inside;
    font-size: 13px;
    line-height: 1.8;
    opacity: 0.8;
}

.manual-list li {
    padding-left: 2px;
}

.manual-foot {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid rgba(128, 128, 128, 0.14);
    font-size: 12px;
    line-height: 1.7;
    opacity: 0.55;
}

@media (max-width: 768px) {
    .manual-body {
        padding: 2px 10px 12px;
    }
}
</style>
