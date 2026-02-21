const ext = typeof browser !== 'undefined' ? browser : chrome;

const el = {
  summary: document.getElementById('summary'),
  status: document.getElementById('status'),
  list: document.getElementById('list'),
  refresh: document.getElementById('refresh'),
  clear: document.getElementById('clear'),
  openOptions: document.getElementById('openOptions'),
  enabled: document.getElementById('enabled'),
  sniffMediaEnabled: document.getElementById('sniffMediaEnabled'),
  autoIntercept: document.getElementById('autoIntercept'),
};

function esc(input) {
  return String(input || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function fmtTs(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString();
}

async function ask(action, payload = {}) {
  return await ext.runtime.sendMessage({ action, ...payload });
}

async function loadQuickState() {
  const response = await ask('get_quick_state');
  if (!response?.ok) throw new Error(String(response?.error || 'state unavailable'));
  const state = response.state || {};
  el.enabled.checked = !!state.enabled;
  el.sniffMediaEnabled.checked = !!state.sniffMediaEnabled;
  el.autoIntercept.checked = !!state.autoIntercept;
  const activity = state.lastBridgeActivityAt ? fmtTs(state.lastBridgeActivityAt) : '-';
  el.summary.textContent = `Media ${Number(state.mediaCount || 0)} | Last ${activity}`;
}

async function loadCandidates() {
  const response = await ask('list_media_candidates');
  if (!response?.ok) throw new Error(String(response?.error || 'list unavailable'));
  const items = Array.isArray(response.items) ? response.items : [];
  if (items.length === 0) {
    el.list.innerHTML = '<div class="card muted">No media detected yet.</div>';
    return;
  }
  el.list.innerHTML = items
    .slice(0, 40)
    .map((item, idx) => {
      const url = String(item?.url || '');
      return `
<div class="card">
  <div class="hint">#${idx + 1} | ${esc(item?.reason)} | hits ${Number(item?.hits || 0)} | ${esc(fmtTs(item?.lastSeenAt))}</div>
  <div class="url">${esc(url)}</div>
  <div class="toolbar">
    <button class="send primary" data-url="${encodeURIComponent(url)}" type="button">Send</button>
    <button class="copy" data-url="${encodeURIComponent(url)}" type="button">Copy</button>
  </div>
</div>`;
    })
    .join('');

  el.list.querySelectorAll('.send').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = decodeURIComponent(String(btn.getAttribute('data-url') || ''));
      try {
        const response = await ask('send_media_candidate', { url: target });
        if (!response?.ok) throw new Error(String(response?.error || response?.reason || 'send failed'));
        const taskId = String(response?.task_id || '');
        el.status.textContent = taskId
          ? `Sent task: ${taskId}`
          : `Sent: ${target.slice(0, 80)}`;
      } catch (e) {
        el.status.textContent = String(e?.message || e);
      }
    });
  });

  el.list.querySelectorAll('.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = decodeURIComponent(String(btn.getAttribute('data-url') || ''));
      try {
        await navigator.clipboard.writeText(target);
        el.status.textContent = 'Copied URL';
      } catch (e) {
        el.status.textContent = String(e?.message || e);
      }
    });
  });
}

async function setQuickFlags() {
  try {
    await ask('set_quick_flags', {
      enabled: !!el.enabled.checked,
      sniffMediaEnabled: !!el.sniffMediaEnabled.checked,
      autoIntercept: !!el.autoIntercept.checked,
    });
    await loadQuickState();
  } catch (e) {
    el.status.textContent = String(e?.message || e);
  }
}

async function refreshAll() {
  await loadQuickState();
  await loadCandidates();
}

el.refresh.addEventListener('click', () => {
  refreshAll().catch((e) => {
    el.status.textContent = String(e?.message || e);
  });
});

el.clear.addEventListener('click', () => {
  ask('clear_media_candidates')
    .then(() => refreshAll())
    .catch((e) => {
      el.status.textContent = String(e?.message || e);
    });
});

el.openOptions.addEventListener('click', () => {
  if (ext.runtime.openOptionsPage) {
    ext.runtime.openOptionsPage();
  }
});

el.enabled.addEventListener('change', () => { void setQuickFlags(); });
el.sniffMediaEnabled.addEventListener('change', () => { void setQuickFlags(); });
el.autoIntercept.addEventListener('change', () => { void setQuickFlags(); });

refreshAll().catch((e) => {
  el.status.textContent = String(e?.message || e);
});
