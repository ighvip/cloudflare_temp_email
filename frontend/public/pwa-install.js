/*!
 * pwa-install.js — 通用 PWA 安装引导（零依赖，可直接拷到任意站点）
 *
 * 能力：
 *   1) 已安装检测：standalone / minimal-ui 运行中、navigator.standalone、
 *      appinstalled 记忆，外加可选的 getInstalledRelatedApps()（见文件末尾 README 段）
 *      —— 已安装则永不提示
 *   2) 所有浏览器都会自动提示：Chromium 捕获 beforeinstallprompt 后即可一键安装；
 *      事件没来（iOS / Firefox / 桌面 Safari）也有定时器兜底弹出，绝不会"什么都不显示"
 *   3) 点「安装」时按浏览器给出不同引导：iOS「分享 → 添加到主屏幕」、安卓「⋮ → 安装应用」、
 *      桌面 Chromium「地址栏安装图标」、不支持的浏览器告知改用 Chrome / Edge / Safari
 *   4) 弹出频率上限：每个自然日最多自动弹 1 次（localStorage，跨标签页共享，所以手机当日不会
 *      再弹）；点「收起」再记当前标签页（sessionStorage，刷新也不弹）
 *   5) 「收起」不是"永不再提示"：下次新访问仍会提醒 —— 想彻底关掉只能用 dailyLimit 之外的
 *      自定义逻辑（如需"永久不再提示"，用自己的开关配合 PWAInstall.hide()）
 *   6) 可选两套图标（白底 / 黑底），让用户在安装前挑；切换即改写 manifest 与 apple-touch-icon
 *   7) 卡片进出场带 200ms 过渡，并尊重 prefers-reduced-motion
 *
 * 用法：
 *   <script>
 *     window.PWA_INSTALL_CONFIG = { appName: 'My App', delayMs: 1200 }
 *   </script>
 *   <script src="/pwa-install.js" defer></script>
 *
 * 全部配置项见下面的 DEFAULTS，内置文案（zh / en / ja / ko）见 TEXTS，可用 texts 整段覆盖。
 *
 * 调试：
 *   PWAInstall.show()                     // 强制弹出（忽略每日上限与收起记忆）
 *   PWAInstall.hide()                     // 只移除卡片，不写任何记忆
 *   PWAInstall.collapse()                 // 等价于点「收起」
 *   PWAInstall.reset()                    // 清空全部记忆
 *   PWAInstall.isInstalled()              // -> Promise<boolean>
 *   PWAInstall.showGuide('ios' | 'android' | 'desktop' | 'unsupported')
 *   PWAInstall.__debugFirePrompt()        // 模拟一次 beforeinstallprompt
 */
(function () {
  'use strict'

  if (typeof window === 'undefined' || window.PWAInstall) return

  var STYLE_ID = 'pwa-install-style'
  var ROOT_ID = 'pwa-install-root'

  var DEFAULTS = {
    // —— 何时提示 ——
    immediate: true,             // 打开页面就提示（需满足下面的前置条件）
    requireManifest: true,       // 页面没有 <link rel="manifest"> 就不自动提示
    requireServiceWorker: false, // true = 还需已注册 Service Worker
    delayMs: 1200,               // 兜底弹出延迟：事件没到也照弹
    iosDelayMs: 6000,            // iOS 完全没有安装事件，稍晚一点再弹
    dailyLimit: true,            // 每个自然日最多自动弹 1 次（跨标签页共享）
    autoShowUnsupported: true,   // 桌面 Firefox / Safari 也弹（点「安装」给出替代方案）
    // —— 外观 ——
    position: 'bottom-center',   // bottom-center | bottom-left | bottom-right | top-center
    theme: 'auto',               // auto | light | dark
    radius: 12,
    accent: 'auto',              // 主按钮颜色：auto=跟随文字色（黑白），也可传 #e5484d 等
    appName: '',                 // 应用名，用于引导文案「安装 xxx」；留空则用域名
    icon: '',                    // 卡片左侧预览图 URL，如 /pwa-192x192.png
    icons: null,                 // 两套图标（可选）：{ light: {...}, dark: {...} }
    // —— 文案与记忆 ——
    texts: null,                 // 覆盖内置文案（结构见 TEXTS）
    storagePrefix: 'pwaInstall', // 记忆键前缀：<前缀>Collapsed / AutoShownOn / Installed / IconVariant
    // —— 回调 ——
    onInstalled: null,           // 安装成功回调
    onCollapse: null,            // 点「收起」回调
  }

  // 内置文案（zh / en / ja / ko），传 texts 可整段覆盖
  var TEXTS = {
    zh: {
      title: '安装到桌面', desc: '添加到主屏幕，像 App 一样一键打开。',
      descIos: '点「安装」后按提示两步添加（分享 → 添加到主屏幕）。',
      descDesktop: '安装一次后即可从桌面直接打开，像 App 一样使用。',
      descUnsupported: '当前浏览器不支持网页安装，可改用 Chrome、Edge 或 Safari。',
      install: '安装', installing: '安装中…',
      collapse: '收起', collapseHint: '收起（下次打开仍会提醒）',
      iconStyle: '图标样式', iconLight: '白底黑信封', iconDark: '黑底白信封',
      guideTitle: '安装到桌面', iosTitle: '添加到主屏幕',
      guideIos: ['点击 Safari 工具栏上的「分享」按钮', '选择「添加到主屏幕」', '点击「添加」完成'],
      guideAndroid: ['点击浏览器右上角「⋮」菜单', '选择「安装应用」或「添加到主屏幕」', '点击「确认」完成'],
      guideDesktop: ['点击地址栏右侧的「安装」图标，或打开浏览器「⋮」菜单', '选择「安装 {app}」', '点击「安装」确认'],
      guideUnsupported: '当前浏览器不支持把网页安装为应用，可改用 Chrome / Edge（安卓、桌面）或 Safari（iPhone / iPad）。',
      iosTip: 'iPhone / iPad 的图标由系统在添加时截图缓存，换图标需删除后重新添加。',
      gotIt: '知道了',
    },
    en: {
      title: 'Install this app', desc: 'Add it to your home screen and open it like a native app.',
      descIos: 'Tap "Install" and follow the two steps: Share → Add to Home Screen.',
      descDesktop: 'Install it once, then open it from your desktop like an app.',
      descUnsupported: 'This browser cannot install web apps — try Chrome, Edge or Safari.',
      install: 'Install', installing: 'Installing…',
      collapse: 'Minimize', collapseHint: 'Minimize (we will remind you next time)',
      iconStyle: 'Icon style', iconLight: 'Black on white', iconDark: 'White on black',
      guideTitle: 'Install this app', iosTitle: 'Add to Home Screen',
      guideIos: ['Tap the Share button in Safari\u2019s toolbar', 'Choose "Add to Home Screen"', 'Tap "Add" to finish'],
      guideAndroid: ['Open the "\u22ee" menu in your browser', 'Choose "Install app" or "Add to Home screen"', 'Tap "Confirm" to finish'],
      guideDesktop: ['Click the install icon in the address bar, or open the "\u22ee" menu', 'Choose "Install {app}"', 'Click "Install" to confirm'],
      guideUnsupported: 'This browser cannot install web apps. Use Chrome / Edge (Android, desktop) or Safari (iPhone / iPad).',
      iosTip: 'On iPhone / iPad the icon is captured when you add it to the home screen, so re-add to refresh it.',
      gotIt: 'Got it',
    },
    ja: {
      title: 'アプリをインストール', desc: 'ホーム画面に追加すると、アプリのようにすぐ開けます。',
      descIos: '「インストール」をタップし、共有 → ホーム画面に追加 の 2 ステップで完了します。',
      descDesktop: '一度インストールすれば、デスクトップからアプリのように開けます。',
      descUnsupported: 'このブラウザは Web アプリのインストールに対応していません。Chrome、Edge、Safari をお試しください。',
      install: 'インストール', installing: 'インストール中…',
      collapse: 'たたむ', collapseHint: 'たたむ（次回またお知らせします）',
      iconStyle: 'アイコンのスタイル', iconLight: '白地に黒い封筒', iconDark: '黒地に白い封筒',
      guideTitle: 'アプリをインストール', iosTitle: 'ホーム画面に追加',
      guideIos: ['Safari のツールバーの「共有」ボタンをタップ', '「ホーム画面に追加」を選択', '「追加」をタップして完了'],
      guideAndroid: ['ブラウザ右上の「⋮」メニューを開く', '「アプリをインストール」または「ホーム画面に追加」を選択', '「確認」をタップして完了'],
      guideDesktop: ['アドレスバー右のインストールアイコン、または「⋮」メニューを開く', '「{app} をインストール」を選択', '「インストール」をクリックして確認'],
      guideUnsupported: 'このブラウザは Web アプリとしてインストールできません。Chrome / Edge（Android・デスクトップ）または Safari（iPhone / iPad）をご利用ください。',
      iosTip: 'iPhone / iPad のアイコンは追加時に取得されキャッシュされます。変更するには削除して追加し直してください。',
      gotIt: 'OK',
    },
    ko: {
      title: '앱 설치', desc: '홈 화면에 추가하면 앱처럼 바로 열 수 있습니다.',
      descIos: '"설치"를 탭한 뒤 공유 → 홈 화면에 추가 두 단계로 완료됩니다.',
      descDesktop: '한 번 설치하면 데스크톱에서 앱처럼 바로 열 수 있습니다.',
      descUnsupported: '이 브라우저는 웹 앱 설치를 지원하지 않습니다. Chrome, Edge, Safari를 사용해 보세요.',
      install: '설치', installing: '설치 중…',
      collapse: '접기', collapseHint: '접기(다음 방문 시 다시 알려드립니다)',
      iconStyle: '아이콘 스타일', iconLight: '흰 바탕 검은 봉투', iconDark: '검은 바탕 흰 봉투',
      guideTitle: '앱 설치', iosTitle: '홈 화면에 추가',
      guideIos: ['Safari 도구 막대의 공유 버튼을 탭하세요', '"홈 화면에 추가"를 선택하세요', '"추가"를 탭하면 완료됩니다'],
      guideAndroid: ['브라우저 오른쪽 위 "⋮" 메뉴를 엽니다', '"앱 설치" 또는 "홈 화면에 추가"를 선택합니다', '"확인"을 탭하면 완료됩니다'],
      guideDesktop: ['주소 표시줄 오른쪽의 설치 아이콘 또는 "⋮" 메뉴를 엽니다', '"{app} 설치"를 선택합니다', '"설치"를 클릭해 확인합니다'],
      guideUnsupported: '이 브라우저는 웹 앱으로 설치할 수 없습니다. Chrome / Edge(Android·데스크톱) 또는 Safari(iPhone / iPad)를 사용하세요.',
      iosTip: 'iPhone / iPad 아이콘은 추가할 때 캡처되어 캐시됩니다. 아이콘을 바꾸려면 삭제 후 다시 추가하세요.',
      gotIt: '확인',
    },
  }

  var config = Object.assign({}, DEFAULTS, window.PWA_INSTALL_CONFIG || {})
  var deferredPrompt = null
  var els = null
  var guideOptions = []
  var showTimer = null
  var mounted = false

  /* ---------------- 环境检测 ---------------- */

  function isStandalone() {
    if (window.navigator.standalone === true) return true
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
    if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return true
    if (document.referrer && document.referrer.indexOf('android-app://') === 0) return true
    return false
  }

  function ua() {
    return window.navigator.userAgent || ''
  }

  function isIos() {
    var u = ua()
    return /iPad|iPhone|iPod/.test(u) || (u.indexOf('Macintosh') > -1 && 'ontouchend' in document)
  }

  function isAndroid() {
    return /Android/.test(ua())
  }

  function isChromium() {
    return /Chrome\/\d|Chromium\/\d|Edg[A-Z]?\//.test(ua()) && !/Firefox\//.test(ua())
  }

  // 卡片文案与手动引导都按这个来分
  function platform() {
    if (isIos()) return 'ios'
    if (isAndroid()) return 'android'
    if (isChromium()) return 'desktop'
    return 'unsupported'
  }

  // 已经安装过？（关键的“不再提示”判断）
  function installedFlag() {
    return readLocal(key('Installed')) === '1'
  }

  // 可选加强：安卓 Chrome / Windows Edge 能检测“同源已安装的 PWA”，
  // 需要 manifest 里加 related_applications（见文件末尾说明），没配则返回 false。
  function hasInstalledRelatedApp() {
    if (!navigator.getInstalledRelatedApps) return Promise.resolve(false)
    return navigator.getInstalledRelatedApps()
      .then(function (apps) { return !!(apps && apps.length) })
      .catch(function () { return false })
  }

  function isInstalled() {
    if (isStandalone() || installedFlag()) return Promise.resolve(true)
    return hasInstalledRelatedApp()
  }

  /* ---------------- 记忆（本地存储） ---------------- */

  function key(name) {
    return (config.storagePrefix || DEFAULTS.storagePrefix) + name
  }

  function readLocal(name) {
    try { return window.localStorage.getItem(name) } catch (e) { return null }
  }

  function writeLocal(name, value) {
    try { window.localStorage.setItem(name, value) } catch (e) { /* 隐私模式忽略 */ }
  }

  function readSession(name) {
    try { return window.sessionStorage.getItem(name) } catch (e) { return null }
  }

  function writeSession(name, value) {
    try { window.sessionStorage.setItem(name, value) } catch (e) { /* 隐私模式忽略 */ }
  }

  // 本地日期（不是 UTC），这样上限在用户本地零点翻篇
  function today() {
    var d = new Date()
    var pad = function (n) { return (n < 10 ? '0' : '') + n }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }

  function collapsedInThisTab() {
    return readSession(key('Collapsed')) === '1'
  }

  function shownToday() {
    if (config.dailyLimit === false) return false
    return readLocal(key('AutoShownOn')) === today()
  }

  /* ---------------- 文案 ---------------- */

  function pickTexts() {
    if (config.texts) {
      return Object.assign({}, TEXTS.zh, config.texts)
    }
    var raw = (window.navigator.language || 'zh').toLowerCase()
    var short = raw.split('-')[0]
    return TEXTS[short] || TEXTS.en
  }

  // 卡片副标题跟着浏览器变
  function descFor(texts, kind) {
    if (kind === 'ios') return texts.descIos || texts.desc
    if (kind === 'desktop') return texts.descDesktop || texts.desc
    if (kind === 'unsupported') return texts.descUnsupported || texts.desc
    return texts.desc
  }

  /* ---------------- 样式 ---------------- */

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return
    var css = [
      '#pwa-install-root{--pi-fg:#1a1a1a;--pi-bg:#fff;--pi-line:rgba(128,128,128,.35);--pi-muted:rgba(26,26,26,.62);--pi-shadow:0 6px 24px rgba(0,0,0,.12)}',
      '#pwa-install-root.pi-dark{--pi-fg:#eee;--pi-bg:#18181c;--pi-line:rgba(238,238,238,.25);--pi-muted:rgba(238,238,238,.62);--pi-shadow:0 6px 24px rgba(0,0,0,.5)}',
      '#pwa-install-root *{box-sizing:border-box}',
      '.pi-card{position:fixed;z-index:900;display:flex;align-items:center;gap:10px;width:max-content;max-width:min(94vw,520px);padding:10px 12px;border:1px solid var(--pi-line);border-radius:var(--pi-radius,12px);background:var(--pi-bg);color:var(--pi-fg);box-shadow:var(--pi-shadow);font-family:inherit;font-size:13px;line-height:1.35}',
      // 居中用 auto 边距而不是 translateX(-50%)：一是滚动条不再带来偏移，二是把 transform 让给动画
      '.pi-card.pi-bottom-center{left:0;right:0;bottom:16px;margin:0 auto}',
      '.pi-card.pi-bottom-left{left:16px;bottom:16px}',
      '.pi-card.pi-bottom-right{right:16px;bottom:16px}',
      '.pi-card.pi-top-center{left:0;right:0;top:16px;margin:0 auto}',
      // 进场用 CSS animation（不依赖 requestAnimationFrame，标签页不可见时元素也停在可见的终态）
      '.pi-card.pi-in{animation:pi-in .2s cubic-bezier(.2,.7,.2,1)}',
      '.pi-card.pi-out{animation:pi-out .16s ease both}',
      '@keyframes pi-in{from{opacity:0;transform:translateY(8px)}}',
      '@keyframes pi-out{to{opacity:0;transform:translateY(8px)}}',
      '@media (prefers-reduced-motion:reduce){.pi-card.pi-in,.pi-card.pi-out{animation:none}}',
      '.pi-preview{flex:0 0 auto;display:block;width:32px;height:32px;border-radius:8px}',
      '.pi-text{flex:1 1 auto;min-width:7.5em;text-align:left}',
      '.pi-title{font-size:13px;font-weight:600;white-space:nowrap}',
      '.pi-desc{font-size:11px;line-height:1.4;color:var(--pi-muted)}',
      '.pi-swatches{flex:0 0 auto;display:flex;gap:4px}',
      '.pi-swatch{display:block;width:24px;height:24px;padding:0;border:1px solid var(--pi-line);border-radius:6px;background:transparent;cursor:pointer;overflow:hidden}',
      '.pi-swatch img{display:block;width:100%;height:100%}',
      '.pi-swatch.pi-on{border-color:var(--pi-fg);box-shadow:0 0 0 1px var(--pi-fg)}',
      '.pi-actions{flex:0 0 auto;display:flex;align-items:center;gap:8px}',
      '.pi-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border:1px solid var(--pi-line);border-radius:6px;background:transparent;color:var(--pi-fg);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.pi-btn:hover{opacity:.8}',
      '.pi-btn svg{width:15px;height:15px;flex:0 0 auto}',
      '.pi-btn.pi-primary{background:var(--pi-accent,var(--pi-fg));border-color:var(--pi-accent,var(--pi-fg));color:var(--pi-bg)}',
      // 「收起」：纯图标按钮，和色板同一套描边
      '.pi-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:1px solid var(--pi-line);border-radius:8px;background:transparent;color:var(--pi-fg);cursor:pointer}',
      '.pi-icon-btn:hover{border-color:var(--pi-fg)}',
      '.pi-icon-btn svg{width:16px;height:16px}',
      '.pi-mask{position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.45)}',
      '.pi-modal{width:100%;max-width:420px;padding:22px;border:1px solid var(--pi-line);border-radius:var(--pi-radius,12px);background:var(--pi-bg);color:var(--pi-fg);font-family:inherit;text-align:left}',
      '.pi-modal h3{margin:0 0 14px;font-size:15px}',
      '.pi-steps{margin:0;padding-left:18px;font-size:13px;line-height:1.9}',
      '.pi-tip{margin:12px 0 0;font-size:12px;line-height:1.6;color:var(--pi-muted)}',
      '.pi-tip.pi-first{margin-top:0}',
      '.pi-icons{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:14px}',
      '.pi-icons-label{font-size:12px;color:var(--pi-muted)}',
      '.pi-opt{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border:1px solid var(--pi-line);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}',
      '.pi-opt img{width:20px;height:20px;border-radius:4px;display:block}',
      '.pi-opt.pi-on{border-color:var(--pi-fg);box-shadow:0 0 0 1px var(--pi-fg)}',
      '.pi-modal-foot{display:flex;justify-content:flex-end;margin-top:18px}',
      // 手机：副标题省掉、动作换到第二行、抬高到 BackTop 之上
      '@media (max-width:640px){.pi-card.pi-bottom-center{left:12px;right:12px;bottom:96px;margin:0;width:auto;max-width:none;flex-wrap:wrap}.pi-desc{display:none}.pi-actions{margin-left:auto}}',
    ].join('')
    var style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = css
    document.head.appendChild(style)
  }

  function applyTheme(host) {
    var dark = config.theme === 'dark'
      || (config.theme === 'auto' && window.matchMedia
        && window.matchMedia('(prefers-color-scheme: dark)').matches)
    host.classList.toggle('pi-dark', !!dark)
    if (config.accent && config.accent !== 'auto') host.style.setProperty('--pi-accent', config.accent)
    host.style.setProperty('--pi-radius', config.radius + 'px')
  }

  /* ---------------- 图标两套可选 ---------------- */

  function variants() {
    return config.icons || {}
  }

  function currentVariant() {
    var stored = readLocal(key('IconVariant'))
    return stored === 'dark' && variants().dark ? 'dark' : 'light'
  }

  function applyVariant(name) {
    var set = variants()
    var chosen = set[name] ? set[name] : set.light
    if (!chosen) return
    if (chosen.manifest) {
      var link = document.head.querySelector('link[rel="manifest"]')
      if (link) link.setAttribute('href', chosen.manifest)
    }
    if (chosen.appleTouchIcon) {
      var apple = document.head.querySelector('link[rel="apple-touch-icon"]')
      if (!apple) {
        apple = document.createElement('link')
        apple.rel = 'apple-touch-icon'
        document.head.appendChild(apple)
      }
      apple.setAttribute('href', chosen.appleTouchIcon)
    }
  }

  function setVariant(name) {
    writeLocal(key('IconVariant'), name)
    applyVariant(name)
    if (els && els.preview && variants()[name] && variants()[name].preview) {
      els.preview.src = variants()[name].preview
    }
    // 卡片上的色板与引导弹窗里的选项都要跟着高亮（两者可能同时只存在一个）
    var all = (els ? els.swatches : []).concat(guideOptions)
    all.forEach(function (btn) {
      btn.classList.toggle('pi-on', btn.dataset.variant === name)
    })
  }

  /* ---------------- 卡片 ---------------- */

  function root() {
    var host = document.getElementById(ROOT_ID)
    if (!host) {
      host = document.createElement('div')
      host.id = ROOT_ID
      document.body.appendChild(host)
    }
    return host
  }

  function previewSrc() {
    var set = variants()
    var name = currentVariant()
    if (set[name] && set[name].preview) return set[name].preview
    if (set.light && set.light.preview) return set.light.preview
    return config.icon || ''
  }

  function buildCard(texts, kind) {
    var host = root()
    applyTheme(host)
    var old = host.querySelector('.pi-card')
    if (old) old.remove()

    var card = document.createElement('div')
    card.className = 'pi-card pi-' + config.position
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-live', 'polite')
    card.setAttribute('aria-label', texts.title)

    var preview = null
    var src = previewSrc()
    if (src) {
      preview = document.createElement('img')
      preview.className = 'pi-preview'
      preview.src = src
      preview.alt = ''
      preview.width = 32
      preview.height = 32
      card.appendChild(preview)
    }

    var text = document.createElement('div')
    text.className = 'pi-text'
    var title = document.createElement('div')
    title.className = 'pi-title'
    title.textContent = texts.title
    var desc = document.createElement('div')
    desc.className = 'pi-desc'
    desc.textContent = descFor(texts, kind)
    text.appendChild(title)
    text.appendChild(desc)
    card.appendChild(text)

    var swatches = []
    var set = variants()
    if (set.light && set.dark) {
      var wrap = document.createElement('div')
      wrap.className = 'pi-swatches'
      ;['light', 'dark'].forEach(function (name) {
        var btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'pi-swatch'
        btn.dataset.variant = name
        btn.title = name === 'dark' ? texts.iconDark : texts.iconLight
        btn.setAttribute('aria-label', btn.title)
        var img = document.createElement('img')
        img.src = set[name].preview || ''
        img.alt = ''
        btn.appendChild(img)
        btn.addEventListener('click', function () { setVariant(name) })
        wrap.appendChild(btn)
        swatches.push(btn)
      })
      card.appendChild(wrap)
    }

    var actions = document.createElement('div')
    actions.className = 'pi-actions'
    var collapseBtn = document.createElement('button')
    collapseBtn.type = 'button'
    collapseBtn.className = 'pi-icon-btn'
    collapseBtn.title = texts.collapseHint || texts.collapse
    collapseBtn.setAttribute('aria-label', collapseBtn.title)
    collapseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9.5L12 15.5L18 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    collapseBtn.addEventListener('click', collapse)
    var install = document.createElement('button')
    install.type = 'button'
    install.className = 'pi-btn pi-primary pi-install'
    install.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v10M12 14l-3.5-3.5M12 14l3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 15v2.5A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span></span>'
    install.querySelector('span').textContent = texts.install
    install.addEventListener('click', onInstallClick)
    actions.appendChild(collapseBtn)
    actions.appendChild(install)
    card.appendChild(actions)

    host.appendChild(card)
    els = {
      host: host, card: card, preview: preview, install: install, title: title,
      collapse: collapseBtn, swatches: swatches,
    }
    setVariant(currentVariant())
    return card
  }

  /* ---------------- 手动引导弹窗 ---------------- */

  function guideKind() {
    return platform()
  }

  function buildGuide(texts, kind) {
    var host = root()
    applyTheme(host)
    var mask = document.createElement('div')
    mask.className = 'pi-mask'
    mask.addEventListener('click', function (e) {
      if (e.target === mask) closeGuide()
    })

    var modal = document.createElement('div')
    modal.className = 'pi-modal'
    var h3 = document.createElement('h3')
    h3.textContent = kind === 'ios' ? (texts.iosTitle || texts.guideTitle) : texts.guideTitle
    modal.appendChild(h3)

    if (kind === 'unsupported') {
      var p = document.createElement('p')
      p.className = 'pi-tip pi-first'
      p.textContent = texts.guideUnsupported
      modal.appendChild(p)
    } else {
      var ol = document.createElement('ol')
      ol.className = 'pi-steps'
      var steps = kind === 'ios' ? texts.guideIos : (kind === 'android' ? texts.guideAndroid : texts.guideDesktop)
      var appName = config.appName || window.location.hostname
      steps.forEach(function (step) {
        var li = document.createElement('li')
        li.textContent = String(step).replace('{app}', appName)
        ol.appendChild(li)
      })
      modal.appendChild(ol)
    }

    var set = variants()
    var options = []
    if (set.light && set.dark) {
      var icons = document.createElement('div')
      icons.className = 'pi-icons'
      var label = document.createElement('span')
      label.className = 'pi-icons-label'
      label.textContent = texts.iconStyle
      icons.appendChild(label)
      ;['light', 'dark'].forEach(function (name) {
        var btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'pi-opt'
        btn.dataset.variant = name
        if (name === currentVariant()) btn.classList.add('pi-on')
        var img = document.createElement('img')
        img.src = set[name].preview || ''
        img.alt = ''
        btn.appendChild(img)
        btn.appendChild(document.createTextNode(name === 'dark' ? texts.iconDark : texts.iconLight))
        btn.addEventListener('click', function () { setVariant(name) })
        icons.appendChild(btn)
        options.push(btn)
      })
      modal.appendChild(icons)
    }

    if (kind === 'ios') {
      var tip = document.createElement('p')
      tip.className = 'pi-tip'
      tip.textContent = texts.iosTip
      modal.appendChild(tip)
    }

    var foot = document.createElement('div')
    foot.className = 'pi-modal-foot'
    var ok = document.createElement('button')
    ok.type = 'button'
    ok.className = 'pi-btn pi-primary'
    ok.textContent = texts.gotIt
    ok.addEventListener('click', closeGuide)
    foot.appendChild(ok)
    modal.appendChild(foot)

    mask.appendChild(modal)
    guideOptions = options
    host.appendChild(mask)
    return mask
  }

  function closeGuide() {
    guideOptions = []
    var mask = document.querySelector('#' + ROOT_ID + ' .pi-mask')
    if (mask) mask.remove()
  }

  /* ---------------- 显示 / 隐藏 ---------------- */

  function showGuide(kind) {
    injectStyles()
    closeGuide()
    buildGuide(pickTexts(), kind || guideKind())
  }

  // 只把卡片移除，不写任何记忆
  function hide() {
    closeGuide()
    if (!els || !els.card) return
    var card = els.card
    els = null
    if (card.dataset.piLeaving === '1') return
    card.dataset.piLeaving = '1'
    card.classList.add('pi-out')
    var done = function () {
      if (card.parentNode) card.parentNode.removeChild(card)
    }
    card.addEventListener('animationend', done)
    // 兜底：动效被禁用或标签页不可见时，也一定收掉
    setTimeout(done, 400)
  }

  // 「收起」：本标签页不再弹（当天上限在弹出时就记过了），下次新访问照常提醒
  function collapse() {
    writeSession(key('Collapsed'), '1')
    hide()
    if (typeof config.onCollapse === 'function') config.onCollapse()
  }

  // 强制弹出（API / 调试用），不看每日上限与收起记忆
  function show() {
    injectStyles()
    if (isStandalone() || installedFlag()) return
    var card = buildCard(pickTexts(), platform())
    card.classList.add('pi-in')
    card.addEventListener('animationend', function () { card.classList.remove('pi-in') })
  }

  // 自动弹出：走完整判断，并在弹出时占用当天的名额
  function autoShow() {
    if (!mayAutoShow()) return
    show()
    writeLocal(key('AutoShownOn'), today())
  }

  function mayAutoShow() {
    if (!config.immediate) return false
    if (isStandalone() || installedFlag()) return false
    if (collapsedInThisTab()) return false
    if (shownToday()) return false
    if (config.autoShowUnsupported === false && platform() === 'unsupported') return false
    return true
  }

  function onInstallClick() {
    var texts = pickTexts()
    if (!deferredPrompt) {
      // 原生安装事件还没到（或该浏览器不支持），退化为手动引导
      showGuide()
      return
    }
    els.install.disabled = true
    els.install.querySelector('span').textContent = texts.installing
    deferredPrompt.prompt()
    deferredPrompt.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') markInstalled()
      deferredPrompt = null
      hide()
    }).catch(function () {
      deferredPrompt = null
      hide()
    })
  }

  function markInstalled() {
    writeLocal(key('Installed'), '1')
    hide()
    if (typeof config.onInstalled === 'function') config.onInstalled()
  }

  /* ---------------- 事件 ---------------- */

  function onBeforeInstallPrompt(event) {
    event.preventDefault()
    deferredPrompt = event
    autoShow() // Chromium 认为可安装时立刻弹（比兜底定时器早）
  }

  function onAppInstalled() {
    markInstalled()
  }

  function prerequisitesMet() {
    return Promise.resolve().then(function () {
      if (config.requireManifest && !document.querySelector('link[rel="manifest"]')) return false
      if (!config.requireServiceWorker) return true
      if (!('serviceWorker' in navigator)) return false
      return navigator.serviceWorker.getRegistration().then(function (reg) { return !!reg })
    })
  }

  function boot() {
    if (mounted) return
    mounted = true
    applyVariant(currentVariant())
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    isInstalled().then(function (installed) {
      if (installed || !config.immediate) return
      prerequisitesMet().then(function (ok) {
        if (!ok || !mayAutoShow()) return
        // 所有浏览器都提示：Chromium 等事件（事件到了会提前弹），其余靠这个定时器
        var delay = platform() === 'ios' ? config.iosDelayMs : config.delayMs
        if (showTimer) clearTimeout(showTimer)
        showTimer = setTimeout(autoShow, delay || 0)
      })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }

  /* ---------------- 对外 API ---------------- */

  window.PWAInstall = {
    show: show,               // 强制弹出（调试）
    hide: hide,               // 只移除，不写记忆
    collapse: collapse,       // 等价于点「收起」
    autoShow: autoShow,       // 走完整判断的自动弹出
    isInstalled: isInstalled,
    showGuide: showGuide,
    platform: platform,
    config: config,
    reset: function () {
      hide()
      try {
        window.localStorage.removeItem(key('AutoShownOn'))
        window.localStorage.removeItem(key('Installed'))
        window.localStorage.removeItem(key('IconVariant'))
      } catch (e) { /* ignore */ }
      try {
        window.sessionStorage.removeItem(key('Collapsed'))
      } catch (e) { /* ignore */ }
    },
    __debugFirePrompt: function () {
      var event = new Event('beforeinstallprompt', { cancelable: true })
      event.prompt = function () { window.__pwaPrompted = (window.__pwaPrompted || 0) + 1 }
      event.userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
      return event
    },
  }

  /* ------------------------------------------------------------------
   * 可选加强：让“已安装”检测更准
   *
   * 在 manifest 里声明同源已安装的应用，安卓 Chrome / Windows Edge 会通过
   * getInstalledRelatedApps() 告知；命中后本脚本连卡片都不会弹。
   *
   *   // manifest.webmanifest
   *   {
   *     "related_applications": [
   *       { "platform": "webapp", "url": "https://example.com/manifest.webmanifest" }
   *     ],
   *     "prefer_related_applications": false
   *   }
   *
   * iOS 无法检测“是否已添加到主屏幕”（没有 appinstalled，Safari 里也读不到
   * standalone），所以 iPhone / iPad 用户即使已经添加，Safari 页面里每天仍可能
   * 被提醒一次 —— dailyLimit 就是为这种情况兜底的。
   * ------------------------------------------------------------------ */
})()
