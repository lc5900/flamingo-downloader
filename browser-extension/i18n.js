(() => {
  const dict = {
    'en-US': {
      popup_title: '🦩 Flamingo',
      popup_loading: 'Loading...',
      popup_advanced: 'Advanced',
      popup_refresh: 'Refresh',
      popup_clear: 'Clear',
      popup_send_selected: 'Send Selected',
      popup_copy_selected: 'Copy Selected',
      popup_bridge: 'Bridge',
      popup_sniffer: 'Sniffer',
      popup_auto: 'Auto',
      popup_current_tab_only: 'Current tab only',
      popup_footer_hint: 'Click a video page, then reopen this popup to pick links.',
      popup_no_media: 'No media detected yet.',
      popup_select: 'Select',
      popup_send: 'Send',
      popup_copy: 'Copy',
      popup_open_source: 'Open Source',
      popup_no_source_page: 'No source page available',
      popup_status_sent_task: 'Sent task: {taskId}',
      popup_status_sent_short: 'Sent: {target}',
      popup_status_copied_url: 'Copied URL',
      popup_status_no_selected_media: 'No selected media',
      popup_status_sent_batch: 'Sent {ok}/{total}',
      popup_status_batch_failed: 'Batch send failed',
      popup_status_copied_batch: 'Copied {count} URL(s)',
      popup_summary: 'Media {count} | Last {activity}',

      options_title: 'Flamingo Downloader Bridge',
      options_enable_bridge: 'Enable Flamingo bridge',
      options_native_msg: 'Use native messaging (optional)',
      options_auto_intercept: 'Auto-intercept browser downloads',
      options_enable_sniffer: 'Enable media sniffing (experimental)',
      options_allowlist: 'Sniffer allowlist (optional, one rule per line)',
      options_blocklist: 'Sniffer blocklist (optional, one rule per line)',
      options_intercept_allowlist: 'Intercept allowlist (domain per line, empty = all)',
      options_native_host: 'Native host name',
      options_endpoint: 'Bridge endpoint',
      options_token: 'Bridge token',
      options_save: 'Save',
      options_refresh_activity: 'Refresh Activity',
      options_detected_media: 'Detected Media Candidates',
      options_refresh_media: 'Refresh Media',
      options_clear_media: 'Clear Media',
      options_saved_at: 'Saved at {time}',
      options_last_activity: 'Last Activity: {v}',
      options_last_success: 'Last Success: {v}',
      options_last_skipped: 'Last Skipped: {v}',
      options_last_error: 'Last Error: {v}',
      options_no_media: 'No media candidates detected yet.',
      options_send_to_flamingo: 'Send to Flamingo',
      options_sent_task: 'Sent task {taskId}',
      options_sent_media_at: 'Sent media URL at {time}',
      options_placeholder_allowlist: 'host:example.com\npath:*playlist*.m3u8',
      options_placeholder_blocklist: 'host:ads.example.com\npath:*tracker*',
      options_placeholder_intercept_allowlist: 'example.com\ndownload.example.org',
      options_placeholder_native_host: 'com.lc5900.flamingo.bridge',
      options_placeholder_endpoint: 'http://127.0.0.1:16789/add',
      options_placeholder_token: 'optional (leave empty for default extension-origin mode)',
    },
    'zh-CN': {
      popup_title: '🦩 火烈鸟下载器',
      popup_loading: '加载中...',
      popup_advanced: '高级',
      popup_refresh: '刷新',
      popup_clear: '清空',
      popup_send_selected: '发送所选',
      popup_copy_selected: '复制所选',
      popup_bridge: '桥接',
      popup_sniffer: '嗅探',
      popup_auto: '自动',
      popup_current_tab_only: '仅当前标签页',
      popup_footer_hint: '先打开视频页面，再重新打开插件弹窗即可选择下载链接。',
      popup_no_media: '暂未检测到媒体链接。',
      popup_select: '选择',
      popup_send: '发送',
      popup_copy: '复制',
      popup_open_source: '打开来源页',
      popup_no_source_page: '没有可打开的来源页面',
      popup_status_sent_task: '已发送任务: {taskId}',
      popup_status_sent_short: '已发送: {target}',
      popup_status_copied_url: '链接已复制',
      popup_status_no_selected_media: '未选择媒体链接',
      popup_status_sent_batch: '已发送 {ok}/{total}',
      popup_status_batch_failed: '批量发送失败',
      popup_status_copied_batch: '已复制 {count} 个链接',
      popup_summary: '媒体 {count} | 最近 {activity}',

      options_title: '火烈鸟下载器桥接设置',
      options_enable_bridge: '启用火烈鸟桥接',
      options_native_msg: '使用原生消息（可选）',
      options_auto_intercept: '自动接管浏览器下载',
      options_enable_sniffer: '启用媒体嗅探（实验性）',
      options_allowlist: '嗅探白名单（可选，每行一条）',
      options_blocklist: '嗅探黑名单（可选，每行一条）',
      options_intercept_allowlist: '接管白名单（每行一个域名，留空=全部）',
      options_native_host: 'Native Host 名称',
      options_endpoint: '桥接地址',
      options_token: '桥接令牌',
      options_save: '保存',
      options_refresh_activity: '刷新活动',
      options_detected_media: '检测到的媒体候选',
      options_refresh_media: '刷新媒体',
      options_clear_media: '清空媒体',
      options_saved_at: '已保存于 {time}',
      options_last_activity: '最近活动: {v}',
      options_last_success: '最近成功: {v}',
      options_last_skipped: '最近跳过: {v}',
      options_last_error: '最近错误: {v}',
      options_no_media: '暂未检测到媒体候选。',
      options_send_to_flamingo: '发送到火烈鸟',
      options_sent_task: '已发送任务 {taskId}',
      options_sent_media_at: '已发送媒体链接（{time}）',
      options_placeholder_allowlist: 'host:example.com\npath:*playlist*.m3u8',
      options_placeholder_blocklist: 'host:ads.example.com\npath:*tracker*',
      options_placeholder_intercept_allowlist: 'example.com\ndownload.example.org',
      options_placeholder_native_host: 'com.lc5900.flamingo.bridge',
      options_placeholder_endpoint: 'http://127.0.0.1:16789/add',
      options_placeholder_token: '可选（留空使用默认 extension-origin 模式）',
    },
  };

  const SUPPORTED_LOCALES = ['en-US', 'zh-CN'];

  function resolveLocale(raw) {
    const lower = String(raw || '').trim().toLowerCase();
    if (!lower) return 'en-US';
    if (lower.startsWith('zh')) return 'zh-CN';
    return 'en-US';
  }

  function detectLocale() {
    const candidates = [];
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
        candidates.push(chrome.i18n.getUILanguage() || '');
      }
    } catch (_) {}
    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages)) {
        candidates.push(...navigator.languages);
      }
      candidates.push(navigator.language || '');
    }
    for (const raw of candidates) {
      const locale = resolveLocale(raw);
      if (SUPPORTED_LOCALES.includes(locale)) return locale;
    }
    return 'en-US';
  }

  const locale = detectLocale();
  const table = dict[locale] || dict['en-US'];

  function format(text, vars = {}) {
    let out = String(text || '');
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
    return out;
  }

  function t(key, vars = {}) {
    return format(table[key] || dict['en-US'][key] || key, vars);
  }

  function apply(root = document) {
    if (root?.documentElement) {
      root.documentElement.lang = locale;
    }
    root.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      if (!key) return;
      node.textContent = t(key);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      const key = node.getAttribute('data-i18n-placeholder');
      if (!key) return;
      node.setAttribute('placeholder', t(key));
    });
  }

  const api = { t, apply, locale, supportedLocales: SUPPORTED_LOCALES.slice() };
  if (typeof window !== 'undefined') {
    window.FlamingoI18n = api;
  }
})();
