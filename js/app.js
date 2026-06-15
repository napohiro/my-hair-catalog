/* ===================================================
   ヘアカタログ - app.js
   =================================================== */

// ============================================================
// CONSTANTS
// ============================================================
const ANGLES = [
  { key: 'front',    label: '前',      icon: '⬆' },
  { key: 'side',     label: '横',      icon: '➡' },
  { key: 'back',     label: '後ろ',    icon: '⬇' },
  { key: 'diagonal', label: '斜め',    icon: '↗' },
  { key: 'overall',  label: '全体',    icon: '⊞' },
  { key: 'styled',   label: 'セット例', icon: '✦' },
  { key: 'other',    label: 'その他',  icon: '◎' },
];

const GENRES = [
  { key: 'short',      label: 'ショート' },
  { key: 'veryshort',  label: 'ベリーショート' },
  { key: 'mush',       label: 'マッシュ' },
  { key: 'twoblock',   label: 'ツーブロック' },
  { key: 'fade',       label: 'フェード' },
  { key: 'centpart',   label: 'センターパート' },
  { key: 'perm',       label: 'パーマ' },
  { key: 'wolf',       label: 'ウルフ' },
  { key: 'medium',     label: 'ミディアム' },
  { key: 'other',      label: 'その他' },
];

const ANGLE_MAP = Object.fromEntries(ANGLES.map(a => [a.key, a]));
const GENRE_MAP = Object.fromEntries(GENRES.map(g => [g.key, g]));

const AI_PROMPT = `この画像のヘアスタイルを分析してください。

回答は美容師さんへ見せるための「カット指示書」として作成してください。

重要：
長い説明文は禁止。
できるだけ短く、箇条書き中心で回答してください。
美容師さんが5秒で把握できる内容を目指してください。

以下のフォーマットで出力してください。

【ヘアスタイル名】
〇〇系ショート

【全体イメージ】
・〇〇
・〇〇

【前髪】
・長さ：約〇cm
・特徴：〇〇

【トップ】
・長さ：約〇cm
・特徴：〇〇

【サイド】
・長さ：約〇cm
・ツーブロック：あり／なし
・刈り上げ目安：〇mm

【後ろ・襟足】
・長さ：約〇cm
・特徴：〇〇

【毛量】
・多め／普通／軽め

【レイヤー】
・強め／普通／弱め

【セット】
・ワックス：〇〇
・仕上げ：〇〇

【美容師さんへの伝え方】
・〇〇
・〇〇
・〇〇

注意：
断定しすぎず、
「目安」
「〜程度」
「画像から推測」
などの表現を使用してください。

回答はスマホ画面で見やすいように15〜25行程度に収めてください。
長文解説は禁止です。`;

const BEAUTY_PROMPT = AI_PROMPT;

// ============================================================
// STATE
// ============================================================
const state = {
  view: 'list',        // 'list' | 'form' | 'detail' | 'salon' | 'beauty'
  editId: null,
  detailId: null,
  salonId: null,
  beautyId: null,
  beautyEditMode: false,
  beautyImgIdx: 0,
  beautySalonMode: false,
  filterGenre: null,
  filterFav: false,
  searchQuery: '',
  formImages: [],      // { id, data, angle } – draft images in form
  salonAngle: null,
  salonImgIdx: 0,
  galleryIdx: 0,
};

// ============================================================
// UTILITIES
// ============================================================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type = '') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 310);
  }, 2000);
}

function compressImage(file, maxW = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function getAngle(key) { return ANGLE_MAP[key] || { label: key, icon: '◎' }; }
function getGenre(key) { return GENRE_MAP[key] || { label: key }; }

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function copyAiPrompt(btnId, text) {
  const copyText = text || AI_PROMPT;
  const done = () => {
    showToast('プロンプトをコピーしました', 'success');
    const btn = document.getElementById(btnId);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'コピーしました ✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(copyText).then(done).catch(() => fallbackCopy(copyText, done));
  } else {
    fallbackCopy(copyText, done);
  }
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  ta.remove();
  cb();
}

function getBeautyData(id) {
  try {
    const raw = localStorage.getItem('beauty_' + id);
    return raw ? JSON.parse(raw) : { aiText: '', userMemo: '', updatedAt: null };
  } catch(e) {
    return { aiText: '', userMemo: '', updatedAt: null };
  }
}

function saveBeautyData(id, data) {
  try {
    localStorage.setItem('beauty_' + id, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
  } catch(e) {}
}

// ============================================================
// DOM HELPERS
// ============================================================
const $  = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

function setMain(html) {
  const main = document.getElementById('app-main');
  if (main) main.innerHTML = html;
}

function buildHeader({ title = 'ヘアカタログ', back = false, actions = '' } = {}) {
  return `
    <header class="app-header">
      ${back ? `<button class="btn-icon" onclick="goBack()" aria-label="戻る">${ICONS.back}</button>` : `<div style="width:40px"></div>`}
      <h1 class="header-title">${escHtml(title)}</h1>
      <div style="display:flex;align-items:center;gap:4px">${actions}</div>
    </header>`;
}

function buildBottomNav(active = 'list') {
  return `
    <nav class="bottom-nav">
      <button class="nav-item ${active==='list'?'active':''}" onclick="navigate('list')">
        ${ICONS.home}
        <span>ホーム</span>
      </button>
      <div class="nav-item-add">
        <button class="nav-add-btn" onclick="navigate('form')" aria-label="追加">${ICONS.plus}</button>
      </div>
      <button class="nav-item ${active==='fav'?'active':''}" onclick="toggleFavFilter()">
        ${ICONS.heart}
        <span>お気に入り</span>
      </button>
    </nav>`;
}

// ============================================================
// ICONS (inline SVG)
// ============================================================
const ICONS = {
  back:   `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  home:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  plus:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  heart:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
  heartFill: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
  edit:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
  scissors:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`,
  camera: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  x:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  chevLeft: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  chevRight:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
  star:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  starFill:`<svg width="22" height="22" viewBox="0 0 24 24" fill="#C8A96E" stroke="#C8A96E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  image:  `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  salon:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>`,
  note:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
};

// ============================================================
// NAVIGATION
// ============================================================
function navigate(view, id) {
  state.view = view;
  if (view === 'detail') state.detailId = id;
  if (view === 'salon')  { state.salonId = id; state.salonAngle = null; state.salonImgIdx = 0; }
  if (view === 'beauty') { state.beautyId = id; state.beautyEditMode = false; state.beautyImgIdx = 0; state.beautySalonMode = false; }
  if (view === 'form')   { state.editId = id || null; state.formImages = []; }
  if (view === 'list')   { state.searchQuery = ''; }
  renderApp();
  const main = document.getElementById('app-main');
  if (main) main.scrollTop = 0;
}

function goBack() {
  if (state.view === 'salon')  navigate('detail', state.salonId);
  else if (state.view === 'beauty' && state.beautySalonMode) { state.beautySalonMode = false; renderApp(); return; }
  else if (state.view === 'beauty') navigate('detail', state.beautyId);
  else if (state.view === 'detail') navigate('list');
  else if (state.view === 'form')   navigate('list');
  else navigate('list');
}

function toggleFavFilter() {
  state.filterFav = !state.filterFav;
  state.filterGenre = null;
  navigate('list');
}

// ============================================================
// RENDER APP SHELL
// ============================================================
async function renderApp() {
  const app = document.getElementById('app');
  const loading = document.getElementById('loading-screen');
  if (loading) loading.remove();

  if (state.view === 'salon') {
    await renderSalon(app);
    return;
  }

  if (state.view === 'beauty') {
    await renderBeauty(app);
    return;
  }

  const isList = state.view === 'list';
  const isForm = state.view === 'form';
  const isDetail = state.view === 'detail';

  let headerTitle = 'ヘアカタログ';
  let headerBack = false;
  let headerActions = '';

  if (isForm) {
    headerTitle = state.editId ? '編集' : '新しいスタイルを追加';
    headerBack = true;
    headerActions = `<button class="btn-icon" onclick="submitForm()" id="btn-save-header" aria-label="保存">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
    </button>`;
  }
  if (isDetail) {
    headerBack = true;
    headerActions = `
      <button class="btn-icon" onclick="navigate('form','${state.detailId}')" aria-label="編集">${ICONS.edit}</button>
      <button class="btn-icon danger" onclick="confirmDelete('${state.detailId}')" aria-label="削除">${ICONS.trash}</button>`;
  }

  app.innerHTML = `
    ${buildHeader({ title: headerTitle, back: headerBack, actions: headerActions })}
    <main class="app-main" id="app-main"></main>
    ${isList ? buildBottomNav('list') : ''}
    ${isForm ? '' : ''}
    ${isDetail ? '' : ''}
  `;

  if (isList) await renderList();
  else if (isForm) await renderForm();
  else if (isDetail) await renderDetail();
}

// ============================================================
// VIEW: LIST
// ============================================================
async function renderList() {
  const all = await DB.getAll();
  const q = state.searchQuery.toLowerCase();

  let items = all.filter(s => {
    if (state.filterFav && !s.isFavorite) return false;
    if (state.filterGenre && !(s.genres || []).includes(state.filterGenre)) return false;
    if (q) {
      const text = (s.title + ' ' + (s.genres || []).join(' ') + ' ' + (s.memo || '')).toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const filtersHtml = `
    <div class="filter-chips">
      <button class="chip fav-chip ${state.filterFav ? 'active' : ''}" onclick="toggleFavChip()">${ICONS.heartFill} お気に入り</button>
      <button class="chip ${!state.filterGenre ? 'active' : ''}" onclick="setGenreFilter(null)">すべて</button>
      ${GENRES.map(g => `<button class="chip ${state.filterGenre===g.key?'active':''}" onclick="setGenreFilter('${g.key}')">${escHtml(g.label)}</button>`).join('')}
    </div>`;

  const emptyHtml = `
    <div class="empty-state">
      ${ICONS.image}
      <p>${state.searchQuery || state.filterGenre || state.filterFav
        ? '条件に合うスタイルが見つかりません'
        : 'まだスタイルが登録されていません\n＋ボタンから追加してみましょう！'}</p>
    </div>`;

  const cardsHtml = items.length === 0 ? emptyHtml : `
    <div class="cards-grid">${items.map(renderCard).join('')}</div>`;

  document.getElementById('app-main').innerHTML = `
    <div class="view-list">
      <div class="search-bar">
        <span class="search-icon">${ICONS.search}</span>
        <input type="search" placeholder="スタイルを検索..." value="${escHtml(state.searchQuery)}"
          oninput="handleSearch(this.value)" />
        ${state.searchQuery ? `<button class="search-clear" onclick="handleSearch('')">${ICONS.x}</button>` : ''}
      </div>
      ${filtersHtml}
      ${cardsHtml}
      <p class="disclaimer-bar">AI生成や自動説明は参考用です。実際のカットでは美容師さんと相談しながら調整してください。</p>
    </div>`;
}

function renderCard(s) {
  const thumb = (s.images && s.images.length > 0) ? s.images[0].data : null;
  const genres = (s.genres || []).slice(0, 2).map(k => `<span class="tag">${escHtml(getGenre(k).label)}</span>`).join('');
  const imgCount = (s.images || []).length;
  return `
    <div class="style-card" onclick="navigate('detail','${s.id}')">
      ${thumb
        ? `<img class="card-thumb" src="${thumb}" alt="${escHtml(s.title)}" loading="lazy">`
        : `<div class="card-thumb-placeholder">${ICONS.image}</div>`}
      ${imgCount > 1 ? `<span class="card-img-count">${imgCount}枚</span>` : ''}
      <button class="card-fav ${s.isFavorite ? 'active' : ''}" onclick="handleFavToggle(event,'${s.id}')">
        ${s.isFavorite ? ICONS.heartFill : ICONS.heart}
      </button>
      <div class="card-body">
        <div class="card-title">${escHtml(s.title || '(タイトルなし)')}</div>
        <div class="card-tags">${genres}</div>
      </div>
    </div>`;
}

async function handleFavToggle(e, id) {
  e.stopPropagation();
  const s = await DB.get(id);
  if (!s) return;
  s.isFavorite = !s.isFavorite;
  s.updatedAt = new Date().toISOString();
  await DB.save(s);
  showToast(s.isFavorite ? 'お気に入りに追加しました' : 'お気に入りを解除しました');
  renderList();
}

function handleSearch(q) {
  state.searchQuery = q;
  renderList();
}

function setGenreFilter(key) {
  state.filterGenre = key;
  state.filterFav = false;
  renderList();
}

function toggleFavChip() {
  state.filterFav = !state.filterFav;
  state.filterGenre = null;
  renderList();
}

// ============================================================
// VIEW: FORM (ADD / EDIT)
// ============================================================
async function renderForm() {
  let existing = null;
  if (state.editId) {
    existing = await DB.get(state.editId);
    if (existing && existing.images) {
      state.formImages = existing.images.map(img => ({ ...img }));
    }
  }

  const v = (field) => existing ? escHtml(existing[field] || '') : '';
  const n = (field) => existing ? escHtml(existing.stylistNotes?.[field] || '') : '';
  const checked = (key) => existing && (existing.genres || []).includes(key) ? 'checked' : '';

  document.getElementById('app-main').innerHTML = `
    <div class="view-form">

      <!-- 基本情報 -->
      <div class="form-section">
        <div class="form-section-header">基本情報</div>
        <div class="form-row">
          <span class="form-label">タイトル <span style="color:#E53E3E">*</span></span>
          <input class="form-input" id="f-title" type="text" placeholder="例: マッシュ × ツーブロック" value="${v('title')}" maxlength="60">
        </div>
        <div class="form-row">
          <span class="form-label">メモ</span>
          <textarea class="form-input" id="f-memo" placeholder="気になったポイントや参考にした点など..." rows="3">${v('memo')}</textarea>
        </div>
      </div>

      <!-- ジャンル -->
      <div class="form-section">
        <div class="form-section-header">ヘアスタイルジャンル <span style="font-weight:400;color:#AAA">(複数選択可)</span></div>
        <div class="genre-grid">
          ${GENRES.map(g => `
            <div class="genre-check">
              <input type="checkbox" id="g-${g.key}" value="${g.key}" ${checked(g.key)}>
              <label for="g-${g.key}">${escHtml(g.label)}</label>
            </div>`).join('')}
        </div>
      </div>

      <!-- 画像 -->
      <div class="form-section">
        <div class="form-section-header">
          <span>画像</span>
          <span id="img-count-badge" style="font-size:12px;font-weight:400;color:#AAA">${state.formImages.length}枚</span>
        </div>
        <div class="image-list" id="image-list"></div>
        <button class="add-image-btn" onclick="document.getElementById('img-file-input').click()">
          ${ICONS.camera} 画像を追加
        </button>
        <input type="file" id="img-file-input" accept="image/*" multiple style="display:none" onchange="handleImageFiles(this)">
      </div>

      <!-- 美容師さん向けメモ -->
      <div class="form-section">
        <div class="form-section-header">美容師さん向けメモ <span style="font-weight:400;color:#AAA">(任意)</span></div>

        <div class="form-row">
          <span class="form-label">好きなポイント</span>
          <textarea class="form-input" id="f-liked" placeholder="例: 前髪の重さ、サイドのすっきり感..." rows="2">${n('likedPoints')}</textarea>
        </div>
        <div class="form-row">
          <span class="form-label">避けたいポイント</span>
          <textarea class="form-input" id="f-avoid" placeholder="例: 広がり、パサつき..." rows="2">${n('avoidPoints')}</textarea>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border)">
          <div class="form-row" style="border-right:1px solid var(--border);border-bottom:none">
            <span class="form-label">前髪の長さ</span>
            <input class="form-input-line" id="f-fringe" type="text" placeholder="例: 眉上2cm" value="${n('fringeLength')}">
          </div>
          <div class="form-row" style="border-bottom:none">
            <span class="form-label">サイドの長さ</span>
            <input class="form-input-line" id="f-side" type="text" placeholder="例: 耳にかかる程度" value="${n('sideLength')}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border)">
          <div class="form-row" style="border-right:1px solid var(--border);border-bottom:none">
            <span class="form-label">襟足の長さ</span>
            <input class="form-input-line" id="f-nape" type="text" placeholder="例: 刈り上げ" value="${n('napeLength')}">
          </div>
          <div class="form-row" style="border-bottom:none">
            <span class="form-label">トップの長さ</span>
            <input class="form-input-line" id="f-top" type="text" placeholder="例: 8〜10cm" value="${n('topLength')}">
          </div>
        </div>

        <div class="form-row">
          <span class="form-label">毛量</span>
          <input class="form-input-line" id="f-volume" type="text" placeholder="例: 少なめ・すきすぎない" value="${n('hairVolume')}">
        </div>
        <div class="form-row">
          <span class="form-label">セット方法</span>
          <textarea class="form-input" id="f-styling" placeholder="例: ドライヤーで前に流す、ワックスで仕上げ..." rows="2">${n('stylingMethod')}</textarea>
        </div>
        <div class="form-row">
          <span class="form-label">カット時に伝えたいこと</span>
          <textarea class="form-input" id="f-instructions" placeholder="例: 全体的に軽めに、自然に動きが出るように..." rows="3">${n('cutInstructions')}</textarea>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn-primary" onclick="submitForm()">
          ${ICONS.note} ${state.editId ? '変更を保存' : '登録する'}
        </button>
        ${state.editId ? `<button class="btn-danger" onclick="confirmDelete('${state.editId}')">削除する</button>` : ''}
        <button class="btn-text" onclick="goBack()">キャンセル</button>
      </div>
    </div>`;

  renderFormImages();
}

function renderFormImages() {
  const list = document.getElementById('image-list');
  const badge = document.getElementById('img-count-badge');
  if (!list) return;
  if (badge) badge.textContent = state.formImages.length + '枚';

  if (state.formImages.length === 0) {
    list.innerHTML = `<p style="text-align:center;color:var(--text-tertiary);font-size:13px;padding:8px 0;">画像を追加してください</p>`;
    return;
  }

  list.innerHTML = state.formImages.map((img, i) => {
    const a = getAngle(img.angle);
    return `
      <div class="image-item" data-img-id="${img.id}">
        <img class="image-item-thumb" src="${img.data}" alt="">
        <div class="image-item-info">
          <div class="image-item-angle">
            <span>${a.icon}</span>
            <span>${escHtml(a.label)}</span>
            <button class="image-item-change" onclick="changeImageAngle('${img.id}')">変更</button>
          </div>
          <div style="font-size:11px;color:var(--text-tertiary)">${i+1}枚目</div>
        </div>
        <button class="image-item-remove" onclick="removeFormImage('${img.id}')" aria-label="削除">${ICONS.x}</button>
      </div>`;
  }).join('');
}

async function handleImageFiles(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  for (const file of files) {
    await processNewImage(file);
  }
  input.value = '';
}

function processNewImage(file) {
  return new Promise(async (resolve) => {
    const data = await compressImage(file);
    const pendingId = uid();
    showAnglePicker((angle) => {
      state.formImages.push({ id: pendingId, data, angle });
      renderFormImages();
      resolve();
    });
  });
}

function changeImageAngle(imgId) {
  showAnglePicker((angle) => {
    const img = state.formImages.find(i => i.id === imgId);
    if (img) img.angle = angle;
    renderFormImages();
  });
}

function removeFormImage(imgId) {
  state.formImages = state.formImages.filter(i => i.id !== imgId);
  renderFormImages();
}

function showAnglePicker(onSelect) {
  const overlay = document.getElementById('angle-picker-overlay');
  const grid    = document.getElementById('angle-picker-grid');
  const cancel  = document.getElementById('angle-picker-cancel');

  grid.innerHTML = ANGLES.map(a => `
    <button class="angle-picker-item" data-key="${a.key}">
      <span class="angle-picker-icon">${a.icon}</span>
      <span class="angle-picker-label">${escHtml(a.label)}</span>
    </button>`).join('');

  overlay.classList.remove('hidden');
  document.body.classList.add('no-scroll');

  function cleanup() {
    overlay.classList.add('hidden');
    document.body.classList.remove('no-scroll');
    grid.innerHTML = '';
  }

  grid.onclick = (e) => {
    const btn = e.target.closest('[data-key]');
    if (!btn) return;
    cleanup();
    onSelect(btn.dataset.key);
  };

  cancel.onclick = cleanup;
  overlay.onclick = (e) => { if (e.target === overlay) cleanup(); };
}

async function submitForm() {
  const titleEl = document.getElementById('f-title');
  if (!titleEl) return;
  const title = titleEl.value.trim();
  if (!title) { showToast('タイトルを入力してください', 'error'); titleEl.focus(); return; }

  const genres = GENRES.map(g => g.key).filter(k => document.getElementById('g-' + k)?.checked);

  const stylistNotes = {
    likedPoints:    document.getElementById('f-liked')?.value.trim() || '',
    avoidPoints:    document.getElementById('f-avoid')?.value.trim() || '',
    fringeLength:   document.getElementById('f-fringe')?.value.trim() || '',
    sideLength:     document.getElementById('f-side')?.value.trim() || '',
    napeLength:     document.getElementById('f-nape')?.value.trim() || '',
    topLength:      document.getElementById('f-top')?.value.trim() || '',
    hairVolume:     document.getElementById('f-volume')?.value.trim() || '',
    stylingMethod:  document.getElementById('f-styling')?.value.trim() || '',
    cutInstructions:document.getElementById('f-instructions')?.value.trim() || '',
  };

  const now = new Date().toISOString();
  let style;

  if (state.editId) {
    style = await DB.get(state.editId);
    Object.assign(style, { title, genres, memo: document.getElementById('f-memo').value.trim(), images: state.formImages, stylistNotes, updatedAt: now });
  } else {
    style = {
      id: uid(),
      title,
      genres,
      memo: document.getElementById('f-memo').value.trim(),
      images: state.formImages,
      stylistNotes,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  await DB.save(style);
  showToast(state.editId ? '変更を保存しました' : '登録しました！', 'success');
  navigate('detail', style.id);
}

// ============================================================
// VIEW: DETAIL
// ============================================================
async function renderDetail() {
  const s = await DB.get(state.detailId);
  if (!s) { navigate('list'); return; }

  state.galleryIdx = 0;
  const images = s.images || [];

  const galleryHtml = images.length > 0 ? buildGallery(images, 0) : `
    <div style="width:100%;aspect-ratio:3/4;max-height:55vh;background:#111;display:flex;align-items:center;justify-content:center;color:#444">
      ${ICONS.image}
    </div>`;

  const genresHtml = (s.genres || []).map(k => `<span class="tag">${escHtml(getGenre(k).label)}</span>`).join('');
  const n = s.stylistNotes || {};

  const hasLengths = n.fringeLength || n.sideLength || n.napeLength || n.topLength || n.hairVolume;
  const hasText    = n.likedPoints || n.avoidPoints || n.stylingMethod || n.cutInstructions;

  const lengthsHtml = hasLengths ? `
    <div class="notes-grid">
      ${lengthItem('前髪', n.fringeLength)}
      ${lengthItem('サイド', n.sideLength)}
      ${lengthItem('襟足', n.napeLength)}
      ${lengthItem('トップ', n.topLength)}
      ${n.hairVolume ? `<div class="notes-item" style="grid-column:span 2"><div class="notes-item-label">毛量</div><div class="notes-item-value">${escHtml(n.hairVolume)}</div></div>` : ''}
    </div>` : '';

  function lengthItem(label, val) {
    if (!val) return '';
    return `<div class="notes-item"><div class="notes-item-label">${label}</div><div class="notes-item-value">${escHtml(val)}</div></div>`;
  }

  function textRow(label, val) {
    if (!val) return '';
    return `<div class="notes-full"><div class="notes-full-label">${label}</div><div class="notes-full-value">${escHtml(val)}</div></div>`;
  }

  document.getElementById('app-main').innerHTML = `
    <div class="view-detail">
      <div class="detail-gallery" id="detail-gallery">
        ${galleryHtml}
      </div>

      <div class="detail-body">
        <h2 class="detail-title">${escHtml(s.title || '(タイトルなし)')}</h2>
        ${genresHtml ? `<div class="detail-genres">${genresHtml}</div>` : ''}

        ${s.memo ? `
          <div class="detail-section">
            <div class="detail-section-title">メモ</div>
            <div class="detail-memo">${escHtml(s.memo)}</div>
          </div>` : ''}

        ${(hasLengths || hasText) ? `
          <div class="detail-section">
            <div class="detail-section-title">美容師さん向けメモ</div>
            ${lengthsHtml}
            ${textRow('好きなポイント', n.likedPoints)}
            ${textRow('避けたいポイント', n.avoidPoints)}
            ${textRow('セット方法', n.stylingMethod)}
            ${textRow('カット時に伝えたいこと', n.cutInstructions)}
          </div>` : ''}

        <div style="font-size:12px;color:var(--text-tertiary);text-align:right;margin-bottom:16px">
          登録日: ${formatDate(s.createdAt)}
        </div>

        <div class="detail-section ai-prompt-section">
          <div class="detail-section-title">AIでヘアスタイル説明を作成</div>
          <div class="ai-prompt-body">
            <p class="ai-prompt-desc">この画像をChatGPT・Claude・Geminiなどに添付し、下の文章をコピーして送ると、美容師さん向けのカット説明文を作成しやすくなります。</p>
            <div class="ai-prompt-box">
              <div class="ai-prompt-text">${escHtml(AI_PROMPT)}</div>
            </div>
            <button class="btn-copy-prompt" id="btn-copy-prompt" onclick="copyAiPrompt('btn-copy-prompt')">プロンプトをコピー</button>
            <div class="ai-how-to">
              <div class="ai-how-to-title">使い方</div>
              <ol class="ai-how-to-list">
                <li>上の「プロンプトをコピー」を押す</li>
                <li>ChatGPT・Claude・Geminiのどれかを開く</li>
                <li>登録したヘアスタイル画像を添付する</li>
                <li>コピーした文章を貼り付けて送信する</li>
                <li>生成された説明文を美容師さんに見せる</li>
              </ol>
            </div>
            <div class="ai-links-group">
              <div class="ai-links-label">STEP 2　AIを開く</div>
              <div class="ai-links">
                <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" class="btn-ai-link">ChatGPTで相談</a>
                <a href="https://claude.ai/" target="_blank" rel="noopener noreferrer" class="btn-ai-link">Claudeで相談</a>
                <a href="https://gemini.google.com/" target="_blank" rel="noopener noreferrer" class="btn-ai-link">Geminiで相談</a>
              </div>
            </div>
            <p class="ai-disclaimer-note">AIの回答は参考用です。実際の髪質・毛量・骨格・クセ・現在の髪の長さによって仕上がりは変わるため、最終的には美容師さんと相談してください。</p>
          </div>
        </div>

        <div class="detail-actions">
          <button class="btn-gold" onclick="navigate('salon','${s.id}')">
            ${ICONS.scissors} 美容院で見せるモード
          </button>
          <button class="btn-beauty-show" onclick="navigate('beauty','${s.id}')">
            ✦ 美容師さんに見せるページ
          </button>
          <div class="btn-row">
            <button class="btn-secondary" onclick="navigate('form','${s.id}')">${ICONS.edit} 編集</button>
            <button class="btn-danger" onclick="confirmDelete('${s.id}')">${ICONS.trash} 削除</button>
          </div>
        </div>
      </div>
    </div>`;

  if (images.length > 0) {
    attachGalleryEvents(images);
  }
}

function buildGallery(images, idx) {
  const img = images[idx];
  const angle = getAngle(img.angle);
  const thumbsHtml = images.map((im, i) =>
    `<img class="gallery-thumb ${i===idx?'active':''}" src="${im.data}" data-idx="${i}" alt="">`
  ).join('');
  const dotsHtml = images.length > 1 ? images.map((_, i) =>
    `<span class="gallery-dot ${i===idx?'active':''}" data-idx="${i}"></span>`
  ).join('') : '';

  return `
    ${images.length > 1 && idx > 0 ? `<button class="gallery-nav-btn prev" onclick="moveGallery(-1)">${ICONS.chevLeft}</button>` : ''}
    ${images.length > 1 && idx < images.length-1 ? `<button class="gallery-nav-btn next" onclick="moveGallery(1)">${ICONS.chevRight}</button>` : ''}
    <img class="gallery-main" src="${img.data}" alt="${escHtml(img.angle)}" id="gallery-main-img">
    <span class="gallery-angle-badge">${angle.icon} ${escHtml(angle.label)}</span>
    ${dotsHtml ? `<div class="gallery-dots">${dotsHtml}</div>` : ''}
    <div class="gallery-thumbs" id="gallery-thumbs">${thumbsHtml}</div>`;
}

function attachGalleryEvents(images) {
  const thumbsEl = document.getElementById('gallery-thumbs');
  if (thumbsEl) {
    thumbsEl.addEventListener('click', (e) => {
      const thumb = e.target.closest('.gallery-thumb');
      if (thumb) {
        state.galleryIdx = parseInt(thumb.dataset.idx);
        refreshGallery(images);
      }
    });
  }

  const gallery = document.getElementById('detail-gallery');
  if (gallery && images.length > 1) {
    let startX = 0;
    gallery.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    gallery.addEventListener('touchend', (e) => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) {
        if (diff > 0 && state.galleryIdx < images.length - 1) state.galleryIdx++;
        else if (diff < 0 && state.galleryIdx > 0) state.galleryIdx--;
        refreshGallery(images);
      }
    }, { passive: true });
  }
}

function refreshGallery(images) {
  const gallery = document.getElementById('detail-gallery');
  if (!gallery) return;
  gallery.innerHTML = buildGallery(images, state.galleryIdx);
  attachGalleryEvents(images);
}

function moveGallery(dir) {
  const gallery = document.getElementById('detail-gallery');
  if (!gallery) return;
  DB.get(state.detailId).then(s => {
    if (!s) return;
    const images = s.images || [];
    state.galleryIdx = Math.max(0, Math.min(images.length - 1, state.galleryIdx + dir));
    refreshGallery(images);
  });
}

// ============================================================
// VIEW: SALON MODE
// ============================================================
async function renderSalon(app) {
  const s = await DB.get(state.salonId);
  if (!s) { navigate('list'); return; }

  const images = s.images || [];
  const angles = [...new Set(images.map(i => i.angle))];
  if (!state.salonAngle && angles.length > 0) state.salonAngle = angles[0];

  const filteredImgs = state.salonAngle
    ? images.filter(i => i.angle === state.salonAngle)
    : images;
  const curImgs = filteredImgs.length > 0 ? filteredImgs : images;
  const idx = Math.min(state.salonImgIdx, curImgs.length - 1);
  const curImg = curImgs[idx];

  const tabsHtml = angles.length > 1 ? angles.map(k => {
    const a = getAngle(k);
    return `<button class="salon-tab ${state.salonAngle===k?'active':''}" onclick="setSalonAngle('${k}')">${a.icon} ${escHtml(a.label)}</button>`;
  }).join('') + (angles.length > 1 ? `<button class="salon-tab ${!state.salonAngle?'active':''}" onclick="setSalonAngle(null)">すべて</button>` : '') : '';

  const n = s.stylistNotes || {};
  const lengthPairs = [
    { label: '前髪', val: n.fringeLength },
    { label: 'サイド', val: n.sideLength },
    { label: '襟足', val: n.napeLength },
    { label: 'トップ', val: n.topLength },
    { label: '毛量', val: n.hairVolume },
  ].filter(p => p.val);

  const hasNotes = n.likedPoints || n.avoidPoints || n.cutInstructions || lengthPairs.length > 0;

  app.innerHTML = `
    <header class="app-header">
      <button class="btn-icon" onclick="navigate('detail','${s.id}')" aria-label="戻る">${ICONS.back}</button>
      <h1 class="header-title">${escHtml(s.title || '(タイトルなし)')}</h1>
      <div style="width:40px"></div>
    </header>
    <main class="app-main no-nav" id="app-main">
      <div class="salon-view-root">
        ${tabsHtml ? `<div class="salon-angle-tabs">${tabsHtml}</div>` : ''}

        <div class="salon-image-area" id="salon-img-area">
          ${curImg ? `
            <img class="salon-main-image" src="${curImg.data}" alt="${escHtml(getAngle(curImg.angle).label)}" id="salon-main-img">
            ${curImgs.length > 1 && idx > 0 ? `<button class="salon-nav-btn prev" onclick="moveSalonImg(-1)">${ICONS.chevLeft}</button>` : ''}
            ${curImgs.length > 1 && idx < curImgs.length-1 ? `<button class="salon-nav-btn next" onclick="moveSalonImg(1)">${ICONS.chevRight}</button>` : ''}
            ${curImgs.length > 1 ? `<span class="salon-image-counter">${idx+1} / ${curImgs.length}</span>` : ''}
          ` : `<div style="color:#444;font-size:14px">画像がありません</div>`}
        </div>

        <div class="salon-notes-panel">
          ${hasNotes ? `
            <div class="salon-notes-title">カット指示</div>
            ${lengthPairs.length > 0 ? `
              <div class="salon-notes-grid">
                ${lengthPairs.map(p => `
                  <div class="salon-note-item">
                    <div class="salon-note-label">${escHtml(p.label)}</div>
                    <div class="salon-note-value">${escHtml(p.val)}</div>
                  </div>`).join('')}
              </div>` : ''}
            ${n.likedPoints ? `<div class="salon-notes-text"><div class="salon-notes-label">好きなポイント</div>${escHtml(n.likedPoints)}</div>` : ''}
            ${n.avoidPoints ? `<div class="salon-notes-text"><div class="salon-notes-label">避けたいポイント</div>${escHtml(n.avoidPoints)}</div>` : ''}
            ${n.cutInstructions ? `<div class="salon-notes-text"><div class="salon-notes-label">伝えたいこと</div>${escHtml(n.cutInstructions)}</div>` : ''}
            <p class="salon-disclaimer">AI生成や自動説明は参考用です。実際のカットでは美容師さんと相談しながら調整してください。</p>
          ` : ''}
          <button class="btn-salon-ai-copy" id="btn-salon-copy-prompt" onclick="copyAiPrompt('btn-salon-copy-prompt')">AI相談用プロンプトをコピー</button>
        </div>
      </div>
    </main>`;

  const imgArea = document.getElementById('salon-img-area');
  if (imgArea && curImgs.length > 1) {
    let startX = 0;
    imgArea.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    imgArea.addEventListener('touchend', (e) => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) moveSalonImg(diff > 0 ? 1 : -1);
    }, { passive: true });
  }
}

async function setSalonAngle(key) {
  state.salonAngle = key;
  state.salonImgIdx = 0;
  await renderSalon(document.getElementById('app'));
}

async function moveSalonImg(dir) {
  const s = await DB.get(state.salonId);
  if (!s) return;
  const images = s.images || [];
  const filtered = state.salonAngle ? images.filter(i => i.angle === state.salonAngle) : images;
  state.salonImgIdx = Math.max(0, Math.min(filtered.length - 1, state.salonImgIdx + dir));
  await renderSalon(document.getElementById('app'));
}

// ============================================================
// VIEW: BEAUTY PAGE（美容師さんに見せる）
// ============================================================
async function renderBeauty(app) {
  const s = await DB.get(state.beautyId);
  if (!s) { navigate('list'); return; }

  const bd = getBeautyData(state.beautyId);
  const images = s.images || [];
  const hasData = !!(bd.aiText);
  const isEdit = state.beautyEditMode;
  const isSalon = state.beautySalonMode;
  const idx = Math.min(state.beautyImgIdx, Math.max(0, images.length - 1));

  const imgHtml = images.length > 0 ? `
    <div class="beauty-img-area" id="beauty-img-area">
      <img class="beauty-main-img" src="${images[idx].data}" alt="${escHtml(s.title)}">
      ${images.length > 1 && idx > 0 ? `<button class="salon-nav-btn prev" onclick="moveBeautyImg(-1)">${ICONS.chevLeft}</button>` : ''}
      ${images.length > 1 && idx < images.length - 1 ? `<button class="salon-nav-btn next" onclick="moveBeautyImg(1)">${ICONS.chevRight}</button>` : ''}
      ${images.length > 1 ? `<span class="salon-image-counter">${idx + 1} / ${images.length}</span>` : ''}
      <span class="gallery-angle-badge">${getAngle(images[idx].angle).icon} ${escHtml(getAngle(images[idx].angle).label)}</span>
    </div>` : `
    <div class="beauty-img-area beauty-img-empty">${ICONS.image}</div>`;

  function attachSwipe() {
    const area = document.getElementById('beauty-img-area');
    if (!area || images.length <= 1) return;
    let sx = 0;
    area.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    area.addEventListener('touchend', (e) => {
      const d = sx - e.changedTouches[0].clientX;
      if (Math.abs(d) > 40) moveBeautyImg(d > 0 ? 1 : -1);
    }, { passive: true });
  }

  // ── 見せるモード（AI・編集ボタン非表示）──
  if (isSalon) {
    app.innerHTML = `
      <header class="app-header">
        <button class="btn-icon" onclick="goBack()" aria-label="戻る">${ICONS.back}</button>
        <h1 class="header-title">${escHtml(s.title || '(タイトルなし)')}</h1>
        <div style="width:40px"></div>
      </header>
      <main class="app-main no-nav" id="app-main">
        <div class="beauty-view">
          ${imgHtml}
          <div class="beauty-salon-body">
            ${bd.aiText ? `<div class="beauty-salon-text">${escHtml(bd.aiText)}</div>` : ''}
            ${bd.userMemo ? `
              <div class="beauty-salon-memo">
                <div class="beauty-salon-memo-label">メモ</div>
                <div>${escHtml(bd.userMemo)}</div>
              </div>` : ''}
          </div>
        </div>
      </main>`;
    attachSwipe();
    return;
  }

  // ── 保存済み確認モード ──
  if (hasData && !isEdit) {
    app.innerHTML = `
      <header class="app-header">
        <button class="btn-icon" onclick="goBack()" aria-label="戻る">${ICONS.back}</button>
        <h1 class="header-title">美容師さんに見せる</h1>
        <div style="width:40px"></div>
      </header>
      <main class="app-main no-nav" id="app-main">
        <div class="beauty-view">
          ${imgHtml}
          <div class="beauty-style-name">${escHtml(s.title || '(タイトルなし)')}</div>
          <div class="beauty-body">
            <div class="beauty-saved-card">
              <div class="beauty-saved-card-label">カット説明書</div>
              <div class="beauty-saved-text">${escHtml(bd.aiText)}</div>
            </div>
            ${bd.userMemo ? `
              <div class="beauty-saved-card memo">
                <div class="beauty-saved-card-label">メモ</div>
                <div class="beauty-saved-text">${escHtml(bd.userMemo)}</div>
              </div>` : ''}
            ${bd.updatedAt ? `<p class="beauty-updated-date">更新日: ${formatDate(bd.updatedAt)}</p>` : ''}
            <button class="btn-gold" onclick="enterBeautySalon()">${ICONS.scissors} 美容師さんに見せるモード</button>
            <div class="btn-row">
              <button class="btn-secondary" onclick="enterBeautyEdit()">編集する</button>
              <button class="btn-danger" onclick="confirmClearBeauty()">クリア</button>
            </div>
          </div>
        </div>
      </main>`;
    attachSwipe();
    return;
  }

  // ── 入力モード（新規 or 編集）──
  app.innerHTML = `
    <header class="app-header">
      <button class="btn-icon" onclick="goBack()" aria-label="戻る">${ICONS.back}</button>
      <h1 class="header-title">美容師さんに見せる</h1>
      <div style="width:40px"></div>
    </header>
    <main class="app-main no-nav" id="app-main">
      <div class="beauty-view">
        ${imgHtml}
        <div class="beauty-style-name">${escHtml(s.title || '(タイトルなし)')}</div>
        <div class="beauty-body">
          <div class="beauty-main-input">
            <div class="beauty-main-input-label">カット説明書</div>
            <textarea class="beauty-textarea large" id="beauty-ai-text"
              placeholder="ここにAI回答を貼り付け...">${escHtml(bd.aiText || '')}</textarea>
          </div>
          <div class="beauty-input-card">
            <div class="beauty-card-section-label">メモ（任意）</div>
            <textarea class="beauty-textarea small" id="beauty-user-memo"
              placeholder="例：前回より少し短め、襟足は残したい...">${escHtml(bd.userMemo || '')}</textarea>
          </div>
          <div class="beauty-form-actions">
            <button class="btn-primary" onclick="saveBeautyForm()">説明書を保存</button>
            ${isEdit ? `<button class="btn-text" onclick="cancelBeautyEdit()">キャンセル</button>` : ''}
          </div>
          <details class="ai-accordion">
            <summary class="ai-accordion-summary">AIで説明書を作る</summary>
            <div class="ai-accordion-body">
              <p class="ai-accordion-desc">ChatGPT・Claude・Geminiに画像とプロンプトを送ると説明書が生成されます。コピーして上の欄に貼り付けてください。</p>
              <div class="ai-prompt-box">
                <div class="ai-prompt-text">${escHtml(BEAUTY_PROMPT)}</div>
              </div>
              <button class="btn-copy-prompt" id="btn-beauty-copy" onclick="copyAiPrompt('btn-beauty-copy', BEAUTY_PROMPT)">プロンプトをコピー</button>
              <div class="ai-links-group">
                <div class="ai-links-label">STEP 2　AIを開く</div>
                <div class="ai-links">
                  <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" class="btn-ai-link">ChatGPT</a>
                  <a href="https://claude.ai/" target="_blank" rel="noopener noreferrer" class="btn-ai-link">Claude</a>
                  <a href="https://gemini.google.com/" target="_blank" rel="noopener noreferrer" class="btn-ai-link">Gemini</a>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </main>`;
  attachSwipe();
}

async function moveBeautyImg(dir) {
  const s = await DB.get(state.beautyId);
  if (!s) return;
  const images = s.images || [];
  state.beautyImgIdx = Math.max(0, Math.min(images.length - 1, state.beautyImgIdx + dir));
  await renderApp();
}

function enterBeautySalon() {
  state.beautySalonMode = true;
  renderApp();
}

function saveBeautyForm() {
  const aiText = document.getElementById('beauty-ai-text')?.value.trim() || '';
  const userMemo = document.getElementById('beauty-user-memo')?.value.trim() || '';
  if (!aiText && !userMemo) {
    showToast('内容を入力してください', 'error');
    return;
  }
  saveBeautyData(state.beautyId, { aiText, userMemo });
  state.beautyEditMode = false;
  showToast('保存しました', 'success');
  renderApp();
}

function enterBeautyEdit() {
  state.beautyEditMode = true;
  renderApp();
}

function cancelBeautyEdit() {
  state.beautyEditMode = false;
  renderApp();
}

function confirmClearBeauty() {
  const overlay = document.getElementById('modal-overlay');
  const box = document.getElementById('modal-box');
  box.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">クリアの確認</div>
    <div class="modal-content">
      <p style="font-size:15px;color:var(--text-secondary);text-align:center;line-height:1.6">
        保存した説明文をクリアします。<br>この操作は取り消せません。
      </p>
    </div>
    <div class="modal-actions">
      <button class="btn-danger" onclick="doClearBeauty()">クリアする</button>
      <button class="btn-text" onclick="closeModal()">キャンセル</button>
    </div>`;
  overlay.classList.remove('hidden');
  document.body.classList.add('no-scroll');
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}

function doClearBeauty() {
  closeModal();
  localStorage.removeItem('beauty_' + state.beautyId);
  state.beautyEditMode = false;
  showToast('クリアしました');
  renderApp();
}

// ============================================================
// DELETE
// ============================================================
function confirmDelete(id) {
  const overlay = document.getElementById('modal-overlay');
  const box     = document.getElementById('modal-box');

  box.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">削除の確認</div>
    <div class="modal-content">
      <p style="font-size:15px;color:var(--text-secondary);text-align:center;line-height:1.6">
        このスタイルを削除します。<br>この操作は取り消せません。
      </p>
    </div>
    <div class="modal-actions">
      <button class="btn-danger" onclick="doDelete('${id}')">削除する</button>
      <button class="btn-text" onclick="closeModal()">キャンセル</button>
    </div>`;

  overlay.classList.remove('hidden');
  document.body.classList.add('no-scroll');
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}

async function doDelete(id) {
  closeModal();
  await DB.remove(id);
  showToast('削除しました');
  navigate('list');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.classList.remove('no-scroll');
}

// ============================================================
// INIT
// ============================================================
async function init() {
  await DB.getAll(); // warm up DB
  await renderApp();
}

init();
