/* ═══════════════════════════════════════════════════════
   GIF POND — Franky the Frog
   Frontend App Logic
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── State — Giphy ────────────────────────────────────────
const STATE = {
  trends: [],
  activeTopic: null,
  isLoadingTrends: false,
  isGenerating: false,
  pendingConcept: null,
  briefs: [],
  nextId: 1,
};

// ── State — TikTok ───────────────────────────────────────
const TT_STATE = {
  trends: [],
  activeTopic: null,
  isLoadingTrends: false,
  isGenerating: false,
  pendingConcept: null,
  briefs: [],
  nextId: 1,
};

// ── DOM Helpers ──────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

function escapeHtml(str) {
  const el = document.createElement('div');
  el.appendChild(document.createTextNode(String(str ?? '')));
  return el.innerHTML;
}

// ── State — Publish ──────────────────────────────────────
const PUB_STATE = {
  file: null,           // File object
  fileURL: null,        // Object URL for preview
  hashtags: [],         // Current hashtag array
  platformStatus: { giphy: false, instagram: false, tiktok: false, youtube: false },
};

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  updateGenerateBtn();
  initPublishTab();
});

function bindEvents() {
  // Platform tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('locked')) {
        showToast('Coming soon — Franky is working on it', 'info');
        return;
      }
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      $(`tab-${tab}`).classList.remove('hidden');
      updateScanBtn(tab);
      if (tab === 'publish') populateBriefSelector();
    });
  });

  // Scan button — routes to active platform
  $('fetchTrends').addEventListener('click', () => {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab === 'tiktok') {
      fetchTikTokTrends();
    } else {
      fetchTrends();
    }
  });

  // Giphy: Custom topic input
  $('customTopic').addEventListener('input', handleCustomTopicChange);
  $('customTopic').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('generateBtn').disabled) generateConcept();
  });

  // Giphy: Generate
  $('generateBtn').addEventListener('click', generateConcept);

  // TikTok: Custom topic input
  $('tt-customTopic').addEventListener('input', handleTikTokCustomTopicChange);
  $('tt-customTopic').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('tt-generateBtn').disabled) generateTikTokConcept();
  });

  // TikTok: Generate
  $('tt-generateBtn').addEventListener('click', generateTikTokConcept);
}

function updateScanBtn(tab) {
  const btnText = document.querySelector('#fetchTrends .scan-btn-text');
  const indicator = $('platformIndicator');
  if (tab === 'tiktok') {
    btnText.textContent = 'Scan TikTok';
    if (indicator) { indicator.textContent = 'TIKTOK'; indicator.classList.add('tiktok'); }
  } else {
    btnText.textContent = 'Scan Trends';
    if (indicator) { indicator.textContent = 'GIPHY'; indicator.classList.remove('tiktok'); }
  }
}

// ── Trend Radar ──────────────────────────────────────────
async function fetchTrends() {
  STATE.isLoadingTrends = true;
  setTrendLoading(true);

  try {
    const res = await fetch('/api/giphy/trending-searches');
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    STATE.trends = data.data || [];
    renderTrends();
    showToast(`${STATE.trends.length} trending topics loaded`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
    $('trends-container').innerHTML = `<div class="error-display">
      <span>⚠</span>
      <span>${escapeHtml(err.message)}</span>
    </div>`;
  } finally {
    STATE.isLoadingTrends = false;
    setTrendLoading(false);
  }
}

function setTrendLoading(loading) {
  const btn = $('fetchTrends');
  const btnText = btn.querySelector('.scan-btn-text');

  if (loading) {
    btn.disabled = true;
    btnText.textContent = 'Scanning...';
    $('trends-container').innerHTML = `<div class="loading-state">
      <div class="spinner"></div>
      <span>Hitting Giphy API...</span>
    </div>`;
  } else {
    btn.disabled = false;
    btnText.textContent = 'Scan Trends';
  }
}

function renderTrends() {
  const container = $('trends-container');
  const badge = $('trend-count');

  if (!STATE.trends.length) {
    badge.textContent = '';
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🤷</div>
      <p>No trending searches returned</p>
    </div>`;
    return;
  }

  badge.textContent = STATE.trends.length;

  const pills = STATE.trends
    .map(
      (term) => `
      <button
        class="pill-tag${STATE.activeTopic === term ? ' selected' : ''}"
        data-term="${escapeHtml(term)}"
        title="${escapeHtml(term)}"
      >${escapeHtml(term)}</button>
    `
    )
    .join('');

  container.innerHTML = `<div class="pills-grid">${pills}</div>`;

  // Bind pill clicks via delegation
  container.querySelector('.pills-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-tag');
    if (btn) selectTopic(btn.dataset.term);
  });
}

function selectTopic(topic) {
  STATE.activeTopic = topic;

  // Update active topic display
  const chip = $('active-topic-text');
  chip.textContent = topic;
  chip.classList.add('has-topic');

  // Clear custom input
  $('customTopic').value = '';

  // Re-render pills so selected state updates
  renderTrends();
  updateGenerateBtn();

  // Scroll Panel 2 into view on mobile
  $('panel-generator').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Clear any stale concept preview
  $('concept-preview').innerHTML = '';
  STATE.pendingConcept = null;
}

function handleCustomTopicChange(e) {
  const val = e.target.value.trim();
  if (val) {
    // Deselect trend pill
    STATE.activeTopic = null;
    const chip = $('active-topic-text');
    chip.textContent = 'none (using custom)';
    chip.classList.remove('has-topic');
    // Update pill selection visually
    renderTrends();
  }
  updateGenerateBtn();
}

// ── Concept Generator ────────────────────────────────────
function updateGenerateBtn() {
  const btn = $('generateBtn');
  const hasTopic = !!STATE.activeTopic;
  const hasCustom = $('customTopic').value.trim().length > 0;
  btn.disabled = (!hasTopic && !hasCustom) || STATE.isGenerating;
}

async function generateConcept() {
  const topic = STATE.activeTopic || $('customTopic').value.trim();
  if (!topic) return;

  STATE.isGenerating = true;
  updateGenerateBtn();
  setGeneratingState(true, topic);

  try {
    const res = await fetch('/api/generate-concept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    STATE.pendingConcept = { ...data.concept, topic: data.topic };
    renderConceptPreview(data.concept, data.topic);
  } catch (err) {
    showToast(err.message, 'error');
    $('concept-preview').innerHTML = `<div class="error-display">
      <span>⚠</span>
      <span>${escapeHtml(err.message)}</span>
    </div>`;
  } finally {
    STATE.isGenerating = false;
    setGeneratingState(false);
    updateGenerateBtn();
  }
}

function setGeneratingState(loading, topic = '') {
  const btn = $('generateBtn');
  const content = $('generateBtnContent');
  const preview = $('concept-preview');

  if (loading) {
    btn.classList.add('loading');
    content.innerHTML = `<span class="spinner-sm"></span> Brewing brief...`;
    preview.innerHTML = `<div class="generating-anim">
      <div class="cheese-thinking">🐸</div>
      <span style="color:var(--text-muted);font-size:13px;">Franky is reading the room on <strong style="color:var(--accent)">${escapeHtml(topic)}</strong>...</span>
      <div class="dots"><span></span><span></span><span></span></div>
    </div>`;
  } else {
    btn.classList.remove('loading');
    content.innerHTML = `<span>Generate Franky Brief</span><span class="btn-emoji">🐸</span>`;
  }
}

function renderConceptPreview(concept, topic) {
  const preview = $('concept-preview');

  const hashtagsHtml = (concept.hashtags || [])
    .map((tag) => `<span class="hashtag-pill">${escapeHtml(tag)}</span>`)
    .join('');

  const giphyTagsHtml = (concept.giphyTags || [])
    .map((tag) => `<span class="giphy-tag">${escapeHtml(tag)}</span>`)
    .join('');

  preview.innerHTML = `
    <div class="concept-card">
      <div class="concept-topic-label">📡 ${escapeHtml(topic)}</div>

      <div class="concept-caption">"${escapeHtml(concept.caption)}"</div>

      <div class="concept-section">
        <span class="section-label">POSE</span>
        <p class="section-content">${escapeHtml(concept.pose)}</p>
      </div>

      <div class="concept-section">
        <span class="section-label">ANIMATION</span>
        <p class="section-content">${escapeHtml(concept.animation)}</p>
      </div>

      <div class="concept-section">
        <span class="section-label">HASHTAGS</span>
        <div class="hashtags-row">${hashtagsHtml}</div>
      </div>

      <div class="concept-section">
        <span class="section-label">GIPHY UPLOAD TAGS</span>
        <div class="giphy-tags-row">${giphyTagsHtml}</div>
      </div>

      <div class="concept-section">
        <span class="section-label">BEST POST TIMING</span>
        <p class="section-content timing">⏰ ${escapeHtml(concept.postTiming)}</p>
      </div>

      <button class="save-to-queue-btn" id="saveToQueueBtn">
        + Save to Brief Queue
      </button>
    </div>
  `;

  $('saveToQueueBtn').addEventListener('click', savePendingConcept);
}

// ── Brief Queue ──────────────────────────────────────────
function savePendingConcept() {
  if (!STATE.pendingConcept) return;

  const brief = {
    id: STATE.nextId++,
    ...STATE.pendingConcept,
    savedAt: new Date(),
  };

  STATE.briefs.unshift(brief);
  renderBriefQueue();

  // Clear pending & show confirmation
  STATE.pendingConcept = null;
  $('concept-preview').innerHTML = `<div class="saved-state">
    <span class="saved-icon">✓</span>
    <span>Saved to queue!</span>
  </div>`;

  setTimeout(() => {
    $('concept-preview').innerHTML = '';
  }, 2200);

  showToast('Brief saved to queue', 'success');

  // Scroll to queue on mobile
  $('panel-queue').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderBriefQueue() {
  const list = $('brief-list');
  const badge = $('queue-count');

  badge.textContent = STATE.briefs.length;

  if (!STATE.briefs.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>Generated briefs<br>will stack here</p>
    </div>`;
    return;
  }

  list.innerHTML = STATE.briefs.map(renderBriefCardHtml).join('');

  // Bind copy buttons
  list.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => copyBrief(Number(btn.dataset.id)));
  });
}

function renderBriefCardHtml(brief) {
  const topHashtags = (brief.hashtags || []).slice(0, 4).join(' ');
  const time = brief.savedAt.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
    <div class="brief-card" data-id="${brief.id}">
      <div class="brief-card-header">
        <span class="brief-topic">${escapeHtml(brief.topic)}</span>
        <div class="brief-actions">
          <span class="brief-time">${time}</span>
          <button class="copy-btn" data-id="${brief.id}" title="Copy full brief as plain text">
            <span id="copy-icon-${brief.id}">⎘</span>
          </button>
        </div>
      </div>
      <div class="brief-caption">${escapeHtml(brief.caption)}</div>
      <div class="brief-pose">${escapeHtml(brief.pose)}</div>
      <div class="brief-hashtags">${escapeHtml(topHashtags)}</div>
    </div>
  `;
}

function copyBrief(id) {
  const brief = STATE.briefs.find((b) => b.id === id);
  if (!brief) return;

  const text = formatBriefAsText(brief);

  navigator.clipboard.writeText(text).then(() => {
    const icon = $(`copy-icon-${id}`);
    if (icon) {
      const original = icon.textContent;
      icon.textContent = '✓';
      setTimeout(() => {
        icon.textContent = original;
      }, 1800);
    }
    showToast('Brief copied to clipboard', 'success');
  }).catch(() => {
    showToast('Copy failed — try selecting manually', 'error');
  });
}

function formatBriefAsText(brief) {
  const divider = '─'.repeat(40);
  return [
    'GIF POND BRIEF — Franky the Frog',
    divider,
    `TOPIC:   ${brief.topic}`,
    `SAVED:   ${brief.savedAt.toLocaleString()}`,
    '',
    'CAPTION:',
    `  ${brief.caption}`,
    '',
    'POSE:',
    `  ${brief.pose}`,
    '',
    'ANIMATION:',
    `  ${brief.animation}`,
    '',
    'HASHTAGS:',
    `  ${(brief.hashtags || []).join('  ')}`,
    '',
    'GIPHY UPLOAD TAGS:',
    `  ${(brief.giphyTags || []).join(', ')}`,
    '',
    'BEST POST TIMING:',
    `  ${brief.postTiming}`,
    '',
    divider,
    'Generated by The GIF Pond · Franky the Frog',
  ].join('\n');
}

// ── Toast ────────────────────────────────────────────────
let toastTimer = null;

function showToast(message, type = 'info') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ═══════════════════════════════════════════════════════
//  TIKTOK MODULE
// ═══════════════════════════════════════════════════════

// ── TikTok Trend Radar ────────────────────────────────
async function fetchTikTokTrends() {
  TT_STATE.isLoadingTrends = true;
  setTikTokTrendLoading(true);

  try {
    const res = await fetch('/api/tiktok/trending');
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    TT_STATE.trends = data.data || [];
    renderTikTokTrends();
    showToast(`${TT_STATE.trends.length} TikTok trends loaded`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
    $('tt-trends-container').innerHTML = `<div class="error-display">
      <span>⚠</span>
      <span>${escapeHtml(err.message)}</span>
    </div>`;
  } finally {
    TT_STATE.isLoadingTrends = false;
    setTikTokTrendLoading(false);
  }
}

function setTikTokTrendLoading(loading) {
  const btn = $('fetchTrends');
  const btnText = btn.querySelector('.scan-btn-text');

  if (loading) {
    btn.disabled = true;
    btnText.textContent = 'Scanning...';
    $('tt-trends-container').innerHTML = `<div class="loading-state">
      <div class="spinner"></div>
      <span>Hitting TikTok API...</span>
    </div>`;
  } else {
    btn.disabled = false;
    btnText.textContent = 'Scan TikTok';
  }
}

function renderTikTokTrends() {
  const container = $('tt-trends-container');
  const badge = $('tt-trend-count');

  if (!TT_STATE.trends.length) {
    badge.textContent = '';
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🤷</div>
      <p>No trending topics returned</p>
    </div>`;
    return;
  }

  badge.textContent = TT_STATE.trends.length;

  const pills = TT_STATE.trends
    .map(
      (term) => `
      <button
        class="pill-tag tt-pill${TT_STATE.activeTopic === term ? ' selected' : ''}"
        data-term="${escapeHtml(term)}"
        title="#${escapeHtml(term)}"
      >#${escapeHtml(term)}</button>
    `
    )
    .join('');

  container.innerHTML = `<div class="pills-grid">${pills}</div>`;

  container.querySelector('.pills-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-tag');
    if (btn) selectTikTokTopic(btn.dataset.term);
  });
}

function selectTikTokTopic(topic) {
  TT_STATE.activeTopic = topic;

  const chip = $('tt-active-topic-text');
  chip.textContent = '#' + topic;
  chip.classList.add('has-topic');

  $('tt-customTopic').value = '';

  renderTikTokTrends();
  updateTikTokGenerateBtn();

  $('tt-panel-generator').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  $('tt-concept-preview').innerHTML = '';
  TT_STATE.pendingConcept = null;
}

function handleTikTokCustomTopicChange(e) {
  const val = e.target.value.trim();
  if (val) {
    TT_STATE.activeTopic = null;
    const chip = $('tt-active-topic-text');
    chip.textContent = 'none (using custom)';
    chip.classList.remove('has-topic');
    renderTikTokTrends();
  }
  updateTikTokGenerateBtn();
}

// ── TikTok Concept Generator ──────────────────────────
function updateTikTokGenerateBtn() {
  const btn = $('tt-generateBtn');
  const hasTopic = !!TT_STATE.activeTopic;
  const hasCustom = $('tt-customTopic').value.trim().length > 0;
  btn.disabled = (!hasTopic && !hasCustom) || TT_STATE.isGenerating;
}

async function generateTikTokConcept() {
  const topic = TT_STATE.activeTopic || $('tt-customTopic').value.trim();
  if (!topic) return;

  TT_STATE.isGenerating = true;
  updateTikTokGenerateBtn();
  setTikTokGeneratingState(true, topic);

  try {
    const res = await fetch('/api/tiktok/generate-concept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    TT_STATE.pendingConcept = { ...data.concept, topic: data.topic };
    renderTikTokConceptPreview(data.concept, data.topic);
  } catch (err) {
    showToast(err.message, 'error');
    $('tt-concept-preview').innerHTML = `<div class="error-display">
      <span>⚠</span>
      <span>${escapeHtml(err.message)}</span>
    </div>`;
  } finally {
    TT_STATE.isGenerating = false;
    setTikTokGeneratingState(false);
    updateTikTokGenerateBtn();
  }
}

function setTikTokGeneratingState(loading, topic = '') {
  const btn = $('tt-generateBtn');
  const content = $('tt-generateBtnContent');
  const preview = $('tt-concept-preview');

  if (loading) {
    btn.classList.add('loading');
    content.innerHTML = `<span class="spinner-sm"></span> Scripting video...`;
    preview.innerHTML = `<div class="generating-anim">
      <div class="cheese-thinking">🎬</div>
      <span style="color:var(--text-muted);font-size:13px;">Franky is reading the algo on <strong style="color:var(--pink)">#${escapeHtml(topic.replace(/^#/, ''))}</strong>...</span>
      <div class="dots"><span></span><span></span><span></span></div>
    </div>`;
  } else {
    btn.classList.remove('loading');
    content.innerHTML = `<span>Generate Video Brief</span><span class="btn-emoji">🎬</span>`;
  }
}

function renderTikTokConceptPreview(concept, topic) {
  const preview = $('tt-concept-preview');

  const hashtagsHtml = (concept.hashtags || [])
    .map((tag) => `<span class="hashtag-pill">${escapeHtml(tag)}</span>`)
    .join('');

  preview.innerHTML = `
    <div class="concept-card tt-concept-card">
      <div class="concept-topic-label">🎵 #${escapeHtml(topic.replace(/^#/, ''))}</div>

      <div class="tt-hook-box">
        <span class="tt-hook-label">⚡ HOOK — FIRST 3 SECONDS</span>
        <p class="tt-hook-text">${escapeHtml(concept.hook)}</p>
      </div>

      <div class="concept-section">
        <span class="section-label">VIDEO CONCEPT</span>
        <p class="section-content">${escapeHtml(concept.concept)}</p>
      </div>

      <div class="concept-section">
        <span class="section-label">SOUND / AUDIO</span>
        <p class="section-content tt-sound">🎵 ${escapeHtml(concept.sound)}</p>
      </div>

      <div class="concept-caption">"${escapeHtml(concept.caption)}"</div>

      <div class="concept-section">
        <span class="section-label">FORMAT</span>
        <span class="tt-format-badge">${escapeHtml(concept.format)}</span>
      </div>

      <div class="concept-section">
        <span class="section-label">HASHTAGS</span>
        <div class="hashtags-row">${hashtagsHtml}</div>
      </div>

      <div class="concept-section">
        <span class="section-label">BEST POST TIMING</span>
        <p class="section-content timing">⏰ ${escapeHtml(concept.postTiming)}</p>
      </div>

      <button class="save-to-queue-btn tt-save-btn" id="tt-saveToQueueBtn">
        + Save to Brief Queue
      </button>
    </div>
  `;

  $('tt-saveToQueueBtn').addEventListener('click', saveTikTokPendingConcept);
}

// ── TikTok Brief Queue ────────────────────────────────
function saveTikTokPendingConcept() {
  if (!TT_STATE.pendingConcept) return;

  const brief = {
    id: TT_STATE.nextId++,
    ...TT_STATE.pendingConcept,
    savedAt: new Date(),
  };

  TT_STATE.briefs.unshift(brief);
  renderTikTokBriefQueue();

  TT_STATE.pendingConcept = null;
  $('tt-concept-preview').innerHTML = `<div class="saved-state">
    <span class="saved-icon">✓</span>
    <span>Saved to queue!</span>
  </div>`;

  setTimeout(() => {
    $('tt-concept-preview').innerHTML = '';
  }, 2200);

  showToast('TikTok brief saved to queue', 'success');

  $('tt-panel-queue').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderTikTokBriefQueue() {
  const list = $('tt-brief-list');
  const badge = $('tt-queue-count');

  badge.textContent = TT_STATE.briefs.length;

  if (!TT_STATE.briefs.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎬</div>
      <p>Generated briefs<br>will stack here</p>
    </div>`;
    return;
  }

  list.innerHTML = TT_STATE.briefs.map(renderTikTokBriefCardHtml).join('');

  list.querySelectorAll('.tt-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => copyTikTokBrief(Number(btn.dataset.id)));
  });
}

function renderTikTokBriefCardHtml(brief) {
  const topHashtags = (brief.hashtags || []).slice(0, 4).join(' ');
  const time = brief.savedAt.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
    <div class="brief-card tt-brief-card" data-id="${brief.id}">
      <div class="brief-card-header">
        <span class="brief-topic">#${escapeHtml(brief.topic.replace(/^#/, ''))}</span>
        <div class="brief-actions">
          <span class="tt-format-mini">${escapeHtml(brief.format || '')}</span>
          <span class="brief-time">${time}</span>
          <button class="copy-btn tt-copy-btn" data-id="${brief.id}" title="Copy full brief as plain text">
            <span id="tt-copy-icon-${brief.id}">⎘</span>
          </button>
        </div>
      </div>
      <div class="brief-caption">${escapeHtml(brief.caption)}</div>
      <div class="brief-pose tt-hook-preview">⚡ ${escapeHtml(brief.hook)}</div>
      <div class="brief-hashtags">${escapeHtml(topHashtags)}</div>
    </div>
  `;
}

function copyTikTokBrief(id) {
  const brief = TT_STATE.briefs.find((b) => b.id === id);
  if (!brief) return;

  const text = formatTikTokBriefAsText(brief);

  navigator.clipboard.writeText(text).then(() => {
    const icon = $(`tt-copy-icon-${id}`);
    if (icon) {
      const original = icon.textContent;
      icon.textContent = '✓';
      setTimeout(() => { icon.textContent = original; }, 1800);
    }
    showToast('TikTok brief copied to clipboard', 'success');
  }).catch(() => {
    showToast('Copy failed — try selecting manually', 'error');
  });
}

function formatTikTokBriefAsText(brief) {
  const divider = '─'.repeat(40);
  return [
    'TIKTOK VIDEO BRIEF — Franky the Frog',
    divider,
    `TOPIC:    #${brief.topic.replace(/^#/, '')}`,
    `FORMAT:   ${brief.format || ''}`,
    `SAVED:    ${brief.savedAt.toLocaleString()}`,
    '',
    'HOOK (FIRST 3 SECONDS):',
    `  ${brief.hook}`,
    '',
    'VIDEO CONCEPT:',
    `  ${brief.concept}`,
    '',
    'SOUND / AUDIO:',
    `  ${brief.sound}`,
    '',
    'CAPTION:',
    `  ${brief.caption}`,
    '',
    'HASHTAGS:',
    `  ${(brief.hashtags || []).join('  ')}`,
    '',
    'BEST POST TIMING:',
    `  ${brief.postTiming}`,
    '',
    divider,
    'Generated by The GIF Pond · Franky the Frog',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════
//  PUBLISH MODULE
// ═══════════════════════════════════════════════════════

// ── Publish Tab Init ──────────────────────────────────
async function initPublishTab() {
  // Load platform credential status from server
  try {
    const res = await fetch('/api/publish/status');
    if (res.ok) {
      const data = await res.json();
      PUB_STATE.platformStatus = data;
      updatePlatformCredUI();
    }
  } catch (e) {
    // Silently fail — UI shows unconfigured state by default
  }

  // File drop zone wiring
  const dropZone  = $('pub-drop-zone');
  const fileInput = $('pub-file-input');
  const browseBtn = $('pub-browse-btn');

  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  });

  // Remove-file button (delegated)
  document.addEventListener('click', (e) => {
    if (e.target.closest('.pub-remove-file')) clearFile();
  });

  // Load brief button — enable when something is selected
  const pubLoadBtn = $('pub-load-btn');
  const pubBriefSel = $('pub-brief-select');
  pubBriefSel.addEventListener('change', () => {
    pubLoadBtn.disabled = pubBriefSel.value === '';
  });
  pubLoadBtn.addEventListener('click', loadSelectedBrief);

  // Hashtag pill input — Enter or comma adds tag
  const hashInput = $('pub-hashtag-input');
  hashInput.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && hashInput.value.trim()) {
      e.preventDefault();
      addPublishHashtag(hashInput.value.trim().replace(/^#/, ''));
      hashInput.value = '';
    }
  });

  // Platform toggles
  ['giphy', 'ig', 'tt', 'yt'].forEach((p) => {
    const tog = $(`pub-tog-${p}`);
    if (tog) tog.addEventListener('change', updatePublishBtn);
  });

  // Publish button
  $('pub-publish-btn').addEventListener('click', publishToAllPlatforms);

  // Caption change
  $('pub-caption').addEventListener('input', updatePublishBtn);
}

// ── Platform Credential UI ────────────────────────────
function updatePlatformCredUI() {
  const map = {
    giphy: 'giphy',
    ig:    'instagram',
    tt:    'tiktok',
    yt:    'youtube',
  };

  Object.entries(map).forEach(([uiKey, stateKey]) => {
    const tog      = $(`pub-tog-${uiKey}`);
    const statusEl = $(`pub-${uiKey}-cred`);
    const ok       = !!PUB_STATE.platformStatus[stateKey];

    if (tog) {
      tog.disabled = !ok;
      if (!ok) tog.checked = false;
    }
    if (statusEl) {
      statusEl.textContent = ok ? '● connected' : '⏳ awaiting key';
      statusEl.classList.toggle('connected', ok);
      statusEl.classList.toggle('pending',  !ok);
    }
  });

  updatePublishBtn();
}

// ── File Handling ─────────────────────────────────────
function handleFileSelect(file) {
  const allowed = ['image/gif', 'video/mp4', 'video/quicktime', 'video/webm'];
  if (!allowed.includes(file.type)) {
    showToast('Only GIF, MP4, MOV, and WebM are supported', 'error');
    return;
  }

  if (PUB_STATE.fileURL) URL.revokeObjectURL(PUB_STATE.fileURL);

  PUB_STATE.file    = file;
  PUB_STATE.fileURL = URL.createObjectURL(file);

  const dropZone = $('pub-drop-zone');
  dropZone.classList.add('has-file');

  const isVideo = file.type.startsWith('video/');
  const sizeMB  = (file.size / 1048576).toFixed(1);

  $('pub-file-preview').innerHTML = `
    <div class="file-preview-wrap">
      ${isVideo
        ? `<video class="file-preview-media" src="${PUB_STATE.fileURL}" muted loop playsinline autoplay></video>`
        : `<img  class="file-preview-media" src="${PUB_STATE.fileURL}" alt="Preview">`
      }
      <div class="file-preview-meta">
        <span class="file-name">${escapeHtml(file.name)}</span>
        <span class="file-size">${sizeMB} MB</span>
        <button class="pub-remove-file" title="Remove">✕ Remove</button>
      </div>
    </div>
  `;

  updatePublishBtn();
}

function clearFile() {
  if (PUB_STATE.fileURL) URL.revokeObjectURL(PUB_STATE.fileURL);
  PUB_STATE.file    = null;
  PUB_STATE.fileURL = null;

  $('pub-drop-zone').classList.remove('has-file');
  $('pub-file-preview').innerHTML = '';
  $('pub-file-input').value = '';

  updatePublishBtn();
}

// ── Brief Selector ────────────────────────────────────
function populateBriefSelector() {
  const sel = $('pub-brief-select');
  if (!sel) return;

  const allBriefs = [
    ...STATE.briefs.map((b)    => ({ ...b, _platform: 'GIPHY'  })),
    ...TT_STATE.briefs.map((b) => ({ ...b, _platform: 'TIKTOK' })),
  ];

  if (!allBriefs.length) {
    sel.innerHTML = '<option value="">— no saved briefs yet —</option>';
    sel._allBriefs = [];
    return;
  }

  sel.innerHTML = '<option value="">— select a brief to load —</option>' +
    allBriefs.map((b, i) =>
      `<option value="${i}">[${b._platform}] ${escapeHtml(b.topic)} — "${escapeHtml(b.caption)}"</option>`
    ).join('');

  sel._allBriefs = allBriefs;
}

function loadSelectedBrief() {
  const sel = $('pub-brief-select');
  if (!sel || sel.value === '' || !sel._allBriefs) return;

  const brief = sel._allBriefs[Number(sel.value)];
  if (!brief) return;

  $('pub-caption').value = brief.caption || '';

  PUB_STATE.hashtags = [...(brief.hashtags || [])].map((h) => h.replace(/^#/, ''));
  renderPublishHashtags();

  showToast(`Brief loaded: ${brief.topic}`, 'success');
  updatePublishBtn();
}

// ── Hashtag Pills ─────────────────────────────────────
function addPublishHashtag(tag) {
  const clean = tag.replace(/^#/, '').trim();
  if (!clean || PUB_STATE.hashtags.includes(clean)) return;
  PUB_STATE.hashtags.push(clean);
  renderPublishHashtags();
  updatePublishBtn();
}

function removePublishHashtag(tag) {
  PUB_STATE.hashtags = PUB_STATE.hashtags.filter((h) => h !== tag);
  renderPublishHashtags();
  updatePublishBtn();
}

function renderPublishHashtags() {
  const zone = $('pub-hashtag-pills');
  if (!zone) return;

  zone.innerHTML = PUB_STATE.hashtags
    .map((h) => `
      <span class="pub-hash-pill">
        #${escapeHtml(h)}
        <button class="pub-hash-remove" data-tag="${escapeHtml(h)}" title="Remove">✕</button>
      </span>
    `)
    .join('');

  zone.querySelectorAll('.pub-hash-remove').forEach((btn) => {
    btn.addEventListener('click', () => removePublishHashtag(btn.dataset.tag));
  });
}

// ── Publish Button State ──────────────────────────────
function updatePublishBtn() {
  const btn = $('pub-publish-btn');
  if (!btn) return;

  const hasFile    = !!PUB_STATE.file;
  const hasCaption = ($('pub-caption')?.value || '').trim().length > 0;
  const anyEnabled = ['giphy', 'ig', 'tt', 'yt'].some((p) => $(`pub-tog-${p}`)?.checked);

  btn.disabled = !(hasFile && hasCaption && anyEnabled);
}

// ── Publish All ───────────────────────────────────────
async function publishToAllPlatforms() {
  const btn = $('pub-publish-btn');
  btn.disabled = true;
  btn.textContent = 'Publishing...';

  const caption  = ($('pub-caption')?.value || '').trim();
  const hashtags = PUB_STATE.hashtags;

  const platformMap = {
    giphy: { endpoint: '/api/publish/giphy',    label: 'Giphy'     },
    ig:    { endpoint: '/api/publish/instagram', label: 'Instagram' },
    tt:    { endpoint: '/api/publish/tiktok',   label: 'TikTok'    },
    yt:    { endpoint: '/api/publish/youtube',  label: 'YouTube'   },
  };

  const results = [];

  for (const [key, { endpoint, label }] of Object.entries(platformMap)) {
    if (!$(`pub-tog-${key}`)?.checked) continue;

    try {
      const formData = new FormData();
      formData.append('file',     PUB_STATE.file);
      formData.append('caption',  caption);
      formData.append('hashtags', JSON.stringify(hashtags));

      const res  = await fetch(endpoint, { method: 'POST', body: formData });
      const data = await res.json();

      if (data.status === 'pending') {
        results.push({ label, status: 'pending', message: data.message });
      } else if (res.ok) {
        results.push({ label, status: 'ok', message: 'Published successfully!' });
      } else {
        results.push({ label, status: 'error', message: data.error || `HTTP ${res.status}` });
      }
    } catch (err) {
      results.push({ label, status: 'error', message: err.message });
    }
  }

  renderPublishResults(results);
  btn.textContent = 'Publish All ↑';
  updatePublishBtn();
}

// ── Publish Results ───────────────────────────────────
function renderPublishResults(results) {
  const el = $('pub-results');
  if (!el) return;

  el.innerHTML = results.map((r) => `
    <div class="pub-result-row pub-result-${r.status}">
      <span class="pub-result-label">${escapeHtml(r.label)}</span>
      <span class="pub-result-msg">${escapeHtml(r.message)}</span>
    </div>
  `).join('');

  el.classList.remove('hidden');
}
