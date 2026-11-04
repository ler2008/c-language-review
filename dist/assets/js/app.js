/* =========================================================
   程序设计基础 · C / C++ / Python 三语言习题复习库
   纯前端交互：语言切换 / 筛选 / 作答 / 解析 / 进度 / 答题卡
   ========================================================= */
(function () {
  'use strict';

  var bank = window.C_BANK;
  if (!bank || !Array.isArray(bank.questions)) {
    document.body.innerHTML = '<div style="padding:60px;font-family:sans-serif;text-align:center">' +
      '<h2>题库数据加载失败</h2><p>请确认 assets/js/data.js 已生成。</p></div>';
    return;
  }

  var BASE_KEY = 'c-review-bank-v2';
  var LEGACY_KEY = 'c-review-bank-v1';
  function authUser() { return (window.C_AUTH && window.C_AUTH.current()) || null; }
  function storageKey() { return window.C_AUTH ? window.C_AUTH.dataKey(BASE_KEY) : BASE_KEY; }
  var TYPE_LABEL = { choice: '选择题', fill: '程序填空', design: '程序设计' };
  var MODULE_CLASS = {
    'C语言基础': 'mod-basics', '数组': 'mod-array', '指针': 'mod-pointer',
    '结构体': 'mod-struct', '枚举': 'mod-enum', '函数': 'mod-function'
  };
  var MODULE_COLOR = {
    'C语言基础': '#0071e3', '数组': '#30b06e', '指针': '#8b5cf6',
    '结构体': '#f59e0b', '枚举': '#ff375f', '函数': '#06b6d4'
  };
  var LANGS = (bank.meta && bank.meta.languages) || [
    { key: 'c', label: 'C' }, { key: 'cpp', label: 'C++' }, { key: 'python', label: 'Python' }
  ];
  var LANG_MAP = {};
  LANGS.forEach(function (l) { LANG_MAP[l.key] = l; });
  var LETTERS = 'ABCD';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var byId = new Map();
  bank.questions.forEach(function (q) { byId.set(q.id, q); });
  var TOTAL = bank.questions.length;
  var MODULE_DISPLAY = {};
  bank.modules.forEach(function (m) { MODULE_DISPLAY[m.name] = m.display || m.name; });

  function moduleLabel(name) { return MODULE_DISPLAY[name] || name; }
  function langLabel(key) { return (LANG_MAP[key] || {}).label || String(key).toUpperCase(); }
  function isLang(key) { return Object.prototype.hasOwnProperty.call(LANG_MAP, key); }

  /* 知识点主题：按题目标签匹配，匹配不到时回退到模块速查卡 */
  var KNOWLEDGE = (bank.knowledge && bank.knowledge.topics) || [];
  function moduleFallback(module) {
    for (var i = 0; i < KNOWLEDGE.length; i++) {
      if (KNOWLEDGE[i].module === module && String(KNOWLEDGE[i].id).indexOf('module-') === 0) return KNOWLEDGE[i];
    }
    return null;
  }
  function topicsFor(q) {
    var tags = q.tags || [];
    var scored = KNOWLEDGE.filter(function (t) {
      return t.id.indexOf('module-') !== 0 && t.tags && t.tags.length;
    }).map(function (t) {
      var score = 0;
      t.tags.forEach(function (tag) { if (tags.indexOf(tag) >= 0) score++; });
      return { topic: t, score: score };
    }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        var am = a.topic.module === q.module ? 1 : 0;
        var bm = b.topic.module === q.module ? 1 : 0;
        return bm - am;
      });
    var picked = scored.slice(0, 2).map(function (x) { return x.topic; });
    if (!picked.length) {
      var fb = moduleFallback(q.module);
      if (fb) picked.push(fb);
    }
    return picked;
  }

  /* ---------------- State ---------------- */
  var state = {
    lang: 'c',
    haptics: true,
    module: 'all',
    type: 'all',
    diff: 'all',
    scope: 'all',
    keyword: '',
    shuffle: false,
    shufOrder: [],
    progress: {},
    favorites: [],
    theme: 'light'
  };

  function parseJSON(raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function loadState() {
    var saved = parseJSON(localStorage.getItem(storageKey()) || 'null');
    if (!saved && !authUser()) {
      var legacy = parseJSON(localStorage.getItem(LEGACY_KEY) || 'null');
      if (legacy && typeof legacy === 'object') {
        saved = legacy;
        if (legacy.progress && typeof legacy.progress === 'object') {
          var migrated = {};
          Object.keys(legacy.progress).forEach(function (id) { migrated['c:' + id] = legacy.progress[id]; });
          saved.progress = migrated;
        }
        saved.lang = 'c';
        saved.haptics = true;
      }
    }
    if (saved && typeof saved === 'object') {
      state.lang = isLang(saved.lang) ? saved.lang : 'c';
      state.haptics = saved.haptics !== false;
      state.module = saved.module || 'all';
      state.type = saved.type || 'all';
      state.diff = saved.diff || 'all';
      state.scope = saved.scope || 'all';
      state.keyword = '';
      state.shuffle = !!saved.shuffle;
      state.shufOrder = Array.isArray(saved.shufOrder) ? saved.shufOrder : [];
      state.progress = saved.progress && typeof saved.progress === 'object' ? saved.progress : {};
      state.favorites = Array.isArray(saved.favorites) ? saved.favorites : [];
      if (saved.theme === 'dark' || saved.theme === 'light') state.theme = saved.theme;
    } else {
      state.theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (!bank.modules.some(function (m) { return m.name === state.module; })) state.module = 'all';
    if (['all', 'choice', 'fill', 'design'].indexOf(state.type) < 0) state.type = 'all';
    if (['all', '1', '2', '3'].indexOf(String(state.diff)) < 0) state.diff = 'all';
    if (['all', 'undone', 'wrong', 'fav'].indexOf(state.scope) < 0) state.scope = 'all';
    if (state.shufOrder.length !== TOTAL) {
      state.shufOrder = [];
      state.shuffle = false;
    }
  }

  function saveStateTo(key) {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) { /* ignore quota */ }
  }
  function saveState() { saveStateTo(storageKey()); }

  /* ---------------- Localization ---------------- */
  function localized(q, lang) {
    lang = lang || state.lang;
    var out = {};
    Object.keys(q).forEach(function (k) {
      if (k !== 'variants') out[k] = q[k];
    });
    var variant = q.variants && q.variants[lang];
    if (variant) {
      Object.keys(variant).forEach(function (k) { out[k] = variant[k]; });
    }
    out.lang = lang;
    out.baseId = q.id;
    out.contextOnly = lang !== 'c' && q.type === 'choice' && !(variant && variant.stem);
    return out;
  }

  function progressOf(q, lang) {
    var key = (lang || state.lang) + ':' + q.id;
    var p = state.progress[key];
    return p && typeof p === 'object' ? p : null;
  }

  function status(q, lang) {
    var lq = localized(q, lang);
    var p = progressOf(q, lang);
    if (!p) return 'none';
    if (lq.type === 'choice') {
      if (typeof p.choice === 'number') return p.choice === lq.answer ? 'ok' : 'bad';
      return p.revealed ? 'seen' : 'none';
    }
    if (p.self === 'ok') return 'ok';
    if (p.self === 'bad') return 'bad';
    return p.revealed ? 'seen' : 'none';
  }

  function isFav(id) { return state.favorites.indexOf(id) >= 0; }

  function scopeMatch(q) {
    var st = status(q);
    if (state.scope === 'undone') return st === 'none';
    if (state.scope === 'wrong') return st === 'bad';
    if (state.scope === 'fav') return isFav(q.id);
    return true;
  }

  function variantText(q) {
    var v = q.variants || {};
    return Object.keys(v).map(function (k) {
      var x = v[k] || {};
      return [x.stem, x.analysis, (x.options || []).join(' '),
        (x.blanks || []).map(function (b) { return (b.answer || '') + ' ' + (b.note || ''); }).join(' '),
        x.solution].join(' ');
    }).join(' ');
  }

  function haystack(q) {
    return [q.id, moduleLabel(q.module), TYPE_LABEL[q.type], q.stem, (q.tags || []).join(' '),
      (q.options || []).join(' '),
      q.blanks ? q.blanks.map(function (b) { return b.answer + ' ' + (b.note || ''); }).join(' ') : '',
      q.analysis, q.solution || '', variantText(q)]
      .join(' ').toLowerCase();
  }

  function match(q, kw) {
    if (!kw) return true;
    var terms = kw.toLowerCase().split(/\s+/).filter(Boolean);
    var hay = haystack(q);
    return terms.every(function (t) { return hay.indexOf(t) >= 0; });
  }

  function filteredQuestions() {
    var arr = bank.questions.filter(function (q) {
      if (state.module !== 'all' && q.module !== state.module) return false;
      if (state.type !== 'all' && q.type !== state.type) return false;
      if (state.diff !== 'all' && String(q.difficulty) !== String(state.diff)) return false;
      if (!scopeMatch(q)) return false;
      if (!match(q, state.keyword.trim())) return false;
      return true;
    });
    if (state.shuffle) {
      var pos = new Map();
      state.shufOrder.forEach(function (id, i) { pos.set(id, i); });
      arr.sort(function (a, b) { return (pos.has(a.id) ? pos.get(a.id) : 1e9) - (pos.has(b.id) ? pos.get(b.id) : 1e9); });
    }
    return arr;
  }

  /* ---------------- Feedback ---------------- */
  function haptic(pattern) {
    if (!state.haptics || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
  }

  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  /* ---------------- 本地账号与错题本 ---------------- */
  var authMode = 'login';

  function showAuthMsg(text) {
    var el = $('#authMsg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  function setAuthTab(mode) {
    authMode = mode === 'register' ? 'register' : 'login';
    $$('#authTabs button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === authMode);
    });
    var row = $('#authPass2Row');
    if (row) row.hidden = authMode !== 'register';
    var submit = $('#authSubmit');
    if (submit) submit.textContent = authMode === 'register' ? '注册并登录' : '登录';
    var pass = $('#authPass');
    if (pass) pass.setAttribute('autocomplete', authMode === 'register' ? 'new-password' : 'current-password');
    showAuthMsg('');
  }

  function updateAuthUI() {
    var u = authUser();
    var label = $('#authLabel');
    if (label) label.textContent = u ? u.name : '登录';
    var btn = $('#authBtn');
    if (btn) {
      btn.classList.toggle('signed', !!u);
      btn.setAttribute('data-initial', u ? String(u.name).slice(0, 1) : '');
      btn.setAttribute('title', u ? '已登录：' + u.name : '登录 / 注册');
    }
    var form = $('#authForm');
    var tabs = $('#authTabs');
    var account = $('#authAccount');
    if (!form || !tabs || !account) return;
    account.hidden = !u;
    form.hidden = !!u;
    tabs.hidden = !!u;
    if (u) {
      $('#authWho').textContent = u.name;
      $('#authSince').textContent = '错题本与进度按账号独立保存 · 仅本机';
      $('#authAvatar').textContent = String(u.name).slice(0, 1).toUpperCase();
      $('#authTitle').textContent = '我的账号';
      $('#authSub').textContent = '登录中，学习记录只属于这个账号';
    } else {
      $('#authTitle').textContent = authMode === 'register' ? '注册账号' : '登录';
      $('#authSub').textContent = '登录后拥有独立的错题本，记录保存在本机';
    }
  }

  function openAuth(mode) {
    if (!authUser()) setAuthTab(mode || 'login');
    updateAuthUI();
    var modal = $('#authModal');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('auth-open');
    haptic(6);
    setTimeout(function () {
      var focus = authUser() ? $('#authLogout') : $('#authUser');
      if (focus) focus.focus();
    }, 40);
  }

  function closeAuth() {
    var modal = $('#authModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('auth-open');
    showAuthMsg('');
  }

  function resetProgressState() {
    state.module = 'all';
    state.type = 'all';
    state.diff = 'all';
    state.scope = 'all';
    state.keyword = '';
    state.shuffle = false;
    state.shufOrder = [];
    state.progress = {};
    state.favorites = [];
  }

  function applyUserSwitch(oldKey, msg) {
    saveStateTo(oldKey);
    var newKey = storageKey();
    var moved = false;
    if (newKey !== oldKey && !localStorage.getItem(newKey) &&
        oldKey === BASE_KEY && localStorage.getItem(oldKey)) {
      try {
        localStorage.setItem(newKey, localStorage.getItem(oldKey));
        moved = true;
      } catch (e) { /* ignore quota */ }
    }
    resetProgressState();
    loadState();
    syncControls();
    renderList();
    updateAuthUI();
    haptic([10, 30, 12]);
    toast(moved ? '已把游客进度带入账号' : (msg || '已切换账号'));
  }

  function submitAuth(e) {
    e.preventDefault();
    if (!window.C_AUTH) { showAuthMsg('账号模块未加载，请刷新页面'); return; }
    var name = ($('#authUser').value || '').trim();
    var pw = $('#authPass').value || '';
    if (authMode === 'register' && pw !== $('#authPass2').value) {
      showAuthMsg('两次输入的密码不一致');
      haptic(24);
      return;
    }
    var oldKey = storageKey();
    var res = authMode === 'register' ? C_AUTH.register(name, pw) : C_AUTH.login(name, pw);
    if (!res.ok) {
      showAuthMsg(res.msg);
      haptic(24);
      return;
    }
    applyUserSwitch(oldKey, res.msg);
    closeAuth();
  }

  function doLogout() {
    var oldKey = storageKey();
    saveStateTo(oldKey);
    if (window.C_AUTH) C_AUTH.logout();
    resetProgressState();
    loadState();
    closeAuth();
    syncControls();
    renderList();
    updateAuthUI();
    toast('已退出登录，当前为游客模式');
  }

  function openMyWrongBook() {
    closeAuth();
    state.scope = 'wrong';
    state.module = 'all';
    state.type = 'all';
    state.diff = 'all';
    state.keyword = '';
    syncControls();
    renderList();
    var title = $('#listTitle');
    if (title) title.scrollIntoView({ behavior: 'smooth', block: 'start' });
    haptic(8);
  }

  function bindAuth() {
    var btn = $('#authBtn');
    if (btn) btn.addEventListener('click', function () { openAuth('login'); });
    var close = $('#authClose');
    var mask = $('#authMask');
    if (close) close.addEventListener('click', closeAuth);
    if (mask) mask.addEventListener('click', closeAuth);
    var tabs = $('#authTabs');
    if (tabs) tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (b) { setAuthTab(b.dataset.tab); updateAuthUI(); }
    });
    var form = $('#authForm');
    if (form) form.addEventListener('submit', submitAuth);
    var logout = $('#authLogout');
    if (logout) logout.addEventListener('click', doLogout);
    var mine = $('#authWrongBtn');
    if (mine) mine.addEventListener('click', openMyWrongBook);
    ['authUser', 'authPass', 'authPass2'].forEach(function (id) {
      var el = $('#' + id);
      if (el) el.addEventListener('input', function () { showAuthMsg(''); });
    });
    updateAuthUI();
  }

  function initRipple() {
    document.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest('button');
      if (!btn || btn.disabled) return;
      if (btn.dataset.noRipple === 'true') return;
      var rect = btn.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var size = Math.max(rect.width, rect.height) * 1.2;
      var ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = size + 'px';
      ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      setTimeout(function () { ripple.remove(); }, 560);
    }, { passive: true });
  }

  /* ---------------- Markdown-ish rendering ---------------- */
  var C_KEYWORDS = ('auto break case char const continue default do double else enum extern float for goto if ' +
    'inline int long register restrict return short signed sizeof static struct switch typedef union ' +
    'unsigned void volatile while _Bool bool true false NULL').split(' ');
  var C_FUNCS = ('printf scanf puts gets putchar getchar malloc calloc realloc free strlen strcpy strncpy strcat strcmp ' +
    'strncmp memset memcpy fopen fclose fgets fputs fprintf fscanf sprintf sscanf qsort exit abs sqrt pow fabs ' +
    'toupper tolower isdigit isalpha isspace').split(' ');
  var CPP_KEYWORDS = C_KEYWORDS.concat(('alignas alignof and and_eq asm bitand bitor catch class compl constexpr ' +
    'const_cast decltype delete dynamic_cast explicit export friend mutable namespace new noexcept not not_eq ' +
    'nullptr operator or or_eq private protected public reinterpret_cast static_assert static_cast template ' +
    'this thread_local throw try typeid typename using virtual wchar_t xor xor_eq std string vector map set ' +
    'unordered_map queue stack deque pair make_pair auto').split(' '));
  var CPP_FUNCS = C_FUNCS.concat(('cout cin cerr endl getline push_back pop_back size empty begin end sort ' +
    'reverse max min swap to_string stoi stod').split(' '));
  var PY_KEYWORDS = ('False None True and as assert async await break class continue def del elif else except ' +
    'finally for from global if import in is lambda nonlocal not or pass raise return try while with yield ' +
    'match case self cls').split(' ');
  var PY_FUNCS = ('print input len range enumerate zip map filter sorted reversed sum min max abs round ' +
    'str int float list dict set tuple open type isinstance super append extend insert pop remove ' +
    'split join strip replace startswith endswith lower upper format').split(' ');

  function kwSet(words) { return new Set(words); }
  var C_KW = kwSet(C_KEYWORDS), C_FN = kwSet(C_FUNCS);
  var CPP_KW = kwSet(CPP_KEYWORDS), CPP_FN = kwSet(CPP_FUNCS);
  var PY_KW = kwSet(PY_KEYWORDS), PY_FN = kwSet(PY_FUNCS);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function icon(name, extra) {
    return '<svg class="icon' + (extra ? ' ' + extra : '') + '"><use href="#i-' + name + '"></use></svg>';
  }

  function highlight(code, lang) {
    var isPy = lang === 'python';
    var isCpp = lang === 'cpp';
    var kw = isPy ? PY_KW : (isCpp ? CPP_KW : C_KW);
    var fn = isPy ? PY_FN : (isCpp ? CPP_FN : C_FN);
    var re = isPy
      ? /(#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:print|input|len|range|enumerate|zip|map|filter|sorted|reversed|sum|min|max|abs|round|str|int|float|list|dict|set|tuple|open|type|isinstance|super|append|extend|insert|pop|remove|split|join|strip|replace|startswith|endswith|lower|upper|format)\b|\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|match|case|self|cls)\b|\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)\b)/gm
      : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|^[ \t]*#[^\n]*|\b(?:std|cout|cin|cerr|endl|string|vector|map|set|queue|stack|pair|auto|class|public|private|protected|namespace|using|new|delete|nullptr|constexpr|template|typename|bool|true|false|NULL)\b|\b(?:printf|scanf|puts|gets|putchar|getchar|malloc|calloc|realloc|free|strlen|strcpy|strncpy|strcat|strcmp|strncmp|memset|memcpy|fopen|fclose|fgets|fputs|fprintf|fscanf|sprintf|sscanf|qsort|exit|abs|sqrt|pow|fabs|toupper|tolower|isdigit|isalpha|isspace|sort|reverse|max|min|swap|to_string|stoi|stod)\b|\b(?:auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Bool)\b|\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?[fFuUlL]*)\b)/gm;
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(code)) !== null) {
      out += esc(code.slice(last, m.index));
      var tok = m[0];
      var cls = '';
      if (!isPy && (tok.indexOf('//') === 0 || tok.indexOf('/*') === 0)) cls = 'tok-com';
      else if (isPy && tok.charAt(0) === '#') cls = 'tok-com';
      else if (tok.charAt(0) === '"' || tok.charAt(0) === "'") cls = 'tok-str';
      else if (!isPy && /^[ \t]*#/.test(tok)) cls = 'tok-pre';
      else if (/^(0[xX][0-9a-fA-F]+|\d)/.test(tok)) cls = 'tok-num';
      else if (fn.has(tok)) cls = 'tok-fn';
      else if (kw.has(tok)) cls = 'tok-key';
      out += cls ? '<span class="' + cls + '">' + esc(tok) + '</span>' : esc(tok);
      last = re.lastIndex;
    }
    out += esc(code.slice(last));
    return out;
  }

  function renderCode(code, lang) {
    var label = lang === 'text' ? '输入 / 输出样例' : (lang === 'python' ? 'PYTHON' : (lang ? lang.toUpperCase() : 'C'));
    var body = (lang === 'text' || lang === 'output') ? esc(code) : highlight(code, lang);
    return '<div class="code-block">' +
      '<div class="code-head"><span class="code-dots"><i></i><i></i><i></i></span>' +
      '<span class="code-lang">' + esc(label) + '</span>' +
      '<button class="code-copy" type="button" data-act="copy" data-no-ripple="true">' + icon('copy') + '复制</button></div>' +
      '<pre><code>' + body + '</code></pre></div>';
  }

  function inline(text) {
    return esc(text)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  }

  function renderTextBlock(text) {
    var s = String(text || '').replace(/^\n+|\n+$/g, '');
    if (!s) return '';
    var h = inline(s)
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>');
    return '<p>' + h + '</p>';
  }

  function renderRich(text) {
    var src = String(text || '');
    var re = /```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/g;
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(src)) !== null) {
      out += renderTextBlock(src.slice(last, m.index));
      var code = m[2].replace(/\n$/, '');
      out += renderCode(code, (m[1] || 'c').toLowerCase());
      last = re.lastIndex;
    }
    out += renderTextBlock(src.slice(last));
    return out || '<p></p>';
  }

  /* ---------------- Card rendering ---------------- */
  function renderCard(q) {
    var lq = localized(q, state.lang);
    var p = progressOf(q) || {};
    var answeredChoice = lq.type === 'choice' && typeof p.choice === 'number';
    var revealed = answeredChoice || p.revealed === true;

    var badges = '<span class="pill ' + (MODULE_CLASS[q.module] || '') + '">' + esc(moduleLabel(q.module)) + '</span>' +
      '<span class="pill type-' + lq.type + '">' + TYPE_LABEL[lq.type] + '</span>' +
      '<span class="pill lang-pill lang-' + lq.lang + '">' + esc(langLabel(lq.lang)) + '</span>' +
      '<span class="diff" title="难度 ' + q.difficulty + '/3">' +
      [1, 2, 3].map(function (i) { return '<i class="' + (i <= q.difficulty ? 'on' : '') + '">●</i>'; }).join('') +
      '</span>';

    var head = '<div class="q-head">' +
      '<div class="q-no"><span class="seq">' + String(q.seq).padStart(3, '0') + '</span><span class="qid">' + esc(q.id) + '</span></div>' +
      '<div class="q-badges">' + badges + '</div>' +
      '<div class="q-tools">' +
      '<button class="icon-btn fav' + (isFav(q.id) ? ' active' : '') + '" data-act="fav" type="button" title="' + (isFav(q.id) ? '取消收藏' : '收藏本题') + '" aria-pressed="' + isFav(q.id) + '">' + icon('star') + '</button>' +
      '</div></div>';

    var body = '';
    if (lq.contextOnly) {
      body += '<div class="lang-context">' + icon('command') +
        '<span>本题保留 C 语言题干，下方为 ' + esc(langLabel(lq.lang)) + ' 视角解析</span></div>';
    }
    body += '<div class="q-stem">' + renderRich(lq.stem) + '</div>';

    if (lq.type === 'choice') {
      body += '<div class="options" role="radiogroup" aria-label="选项">' + (lq.options || []).map(function (opt, i) {
        var cls = 'option';
        if (answeredChoice) {
          if (i === lq.answer) cls += ' correct';
          else if (i === p.choice) cls += ' wrong';
        } else if (revealed && i === lq.answer) {
          cls += ' hint';
        }
        return '<button class="' + cls + '" type="button" data-act="option" data-index="' + i + '"' +
          (answeredChoice ? ' disabled' : '') + '>' +
          '<span class="opt-letter">' + LETTERS[i] + '</span>' +
          '<span class="opt-text">' + inline(opt) + '</span>' +
          '<span class="opt-mark" aria-hidden="true"></span></button>';
      }).join('') + '</div>';

      if (answeredChoice) {
        var ok = p.choice === lq.answer;
        body += '<div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + icon(ok ? 'check' : 'x') +
          '<span>' + (ok ? '回答正确' : '回答错误') + ' · 正确答案 ' + LETTERS[lq.answer] +
          (ok ? '' : '，对照解析看看错因') + '</span></div>';
      }
    }

    if (revealed) {
      body += renderAnswerPanel(lq, p, q);
    } else {
      body += '<div class="reveal-row"><button class="btn reveal" type="button" data-act="reveal">' +
        icon('eye') + '查看答案与解析</button><span class="hint-text">建议先独立写出答案</span></div>';
    }

    var el = document.createElement('article');
    el.className = 'q-card';
    el.id = 'q-' + q.id;
    el.dataset.id = q.id;
    el.dataset.lang = state.lang;
    el.innerHTML = head + body;
    return el;
  }

  function renderKnowledge(q, lq, bad) {
    var topics = topicsFor(q);
    if (!topics.length) return '';
    var cards = topics.map(function (t) {
      var usage = (t.usage && (t.usage[lq.lang] || t.usage.c)) || '';
      var points = (t.points || []).map(function (pt) { return '<li>' + inline(pt) + '</li>'; }).join('');
      var pitfalls = (t.pitfalls || []).map(function (pt) { return '<span>' + inline(pt) + '</span>'; }).join('');
      return '<div class="know-item">' +
        '<div class="know-title">' + icon('spark') + '<h5>' + esc(t.title) + '</h5>' +
        '<span class="know-mod">' + esc(moduleLabel(t.module)) + '</span></div>' +
        '<p class="know-summary">' + inline(t.summary) + '</p>' +
        (points ? '<ul class="know-points">' + points + '</ul>' : '') +
        '<div class="know-code">' +
        renderCode(String(usage).replace(/\n$/, ''), lq.lang) + '</div>' +
        (pitfalls ? '<div class="know-pitfall"><b>易错</b>' + pitfalls + '</div>' : '') +
        '</div>';
    }).join('');
    return '<details class="know-block' + (bad ? ' is-bad' : '') + '"' + (bad ? ' open' : '') + '>' +
      '<summary>' + icon('spark') + '<span>' + (bad ? '为什么错 · 相关知识点讲解' : '相关知识点讲解') + '</span>' +
      '<em>' + topics.length + ' 个知识点</em></summary>' +
      '<div class="know-body">' + cards + '</div></details>';
  }

  function renderAnswerPanel(lq, p, q) {
    var inner = '';

    if (lq.type === 'fill' && Array.isArray(lq.blanks)) {
      inner += '<div class="blank-list">' + lq.blanks.map(function (b) {
        return '<div class="blank-row"><span class="blank-no">' + esc(b.no) + '</span>' +
          '<div class="blank-body"><div class="blank-answer"><code>' + esc(b.answer) + '</code></div>' +
          (b.note ? '<div class="blank-note">' + inline(b.note) + '</div>' : '') + '</div></div>';
      }).join('') + '</div>';
    }

    if (lq.type === 'design') {
      inner += '<div class="solution-head"><span>参考程序（' + esc(langLabel(lq.lang)) + '）</span><span>可直接复制运行</span></div>' +
        renderCode(String(lq.solution || '').replace(/\n$/, ''), lq.lang);
      if (Array.isArray(lq.points) && lq.points.length) {
        inner += '<ul class="points">' + lq.points.map(function (pt) { return '<li>' + inline(pt) + '</li>'; }).join('') + '</ul>';
      }
    }

    inner += '<div class="analysis"><h4>' + esc(langLabel(lq.lang)) + ' 答案解析</h4>' + renderRich(lq.analysis || '') + '</div>';

    var bad = (lq.type === 'choice' && typeof p.choice === 'number' && p.choice !== lq.answer) ||
      (lq.type !== 'choice' && p.self === 'bad');
    if (q) inner += renderKnowledge(q, lq, bad);

    if (lq.type === 'choice') {
      inner += '<div class="self-check"><span>做完啦？</span>' +
        '<button class="self-btn reset" type="button" data-act="reset">' + icon('reset') + '重做本题</button></div>';
    } else {
      inner += '<div class="self-check"><span>这道题掌握了吗？</span>' +
        '<button class="self-btn ok' + (p.self === 'ok' ? ' active' : '') + '" type="button" data-act="self" data-self="ok">' + icon('check') + '已掌握</button>' +
        '<button class="self-btn bad' + (p.self === 'bad' ? ' active' : '') + '" type="button" data-act="self" data-self="bad">' + icon('x') + '加入错题</button>' +
        '<button class="self-btn reset" type="button" data-act="reset">' + icon('reset') + '重做</button></div>';
    }

    return '<div class="answer-panel"><div class="answer-head">' + icon('book') +
      '<strong>答案与解析</strong><span class="answer-hint">' +
      (lq.type === 'fill' ? '先填空，再核对' : lq.type === 'design' ? '先写代码，再对照' : '理解比记住更重要') +
      '</span></div>' + inner + '</div>';
  }

  /* ---------------- List / nav / stats ---------------- */
  var list = $('#questionList');
  var empty = $('#emptyState');

  function renderList() {
    var arr = filteredQuestions();
    var frag = document.createDocumentFragment();
    for (var i = 0; i < arr.length; i++) frag.appendChild(renderCard(arr[i]));
    list.innerHTML = '';
    list.appendChild(frag);
    empty.hidden = arr.length > 0;

    var activeFilter = state.module !== 'all' || state.type !== 'all' || state.diff !== 'all' ||
      state.scope !== 'all' || !!state.keyword.trim();
    $('#clearFilterBtn').hidden = !activeFilter;
    $('#resultCount').textContent = arr.length === TOTAL ? '共 ' + TOTAL + ' 题' : '筛选出 ' + arr.length + ' / ' + TOTAL + ' 题';

    var title = '全部题目';
    if (state.module !== 'all') title = moduleLabel(state.module);
    else if (state.scope === 'wrong') title = authUser() ? authUser().name + ' 的错题本' : '错题本（游客）';
    else if (state.scope === 'fav') title = '我的收藏';
    else if (state.scope === 'undone') title = '未做题目';
    else if (state.type !== 'all') title = TYPE_LABEL[state.type] + '专项';
    $('#listTitle').textContent = title;

    var emptyTitle = $('#emptyState h3');
    var emptyText = $('#emptyState p');
    var emptyBtn = $('#emptyResetBtn');
    if (emptyTitle && emptyText && emptyBtn) {
      if (state.scope === 'wrong') {
        emptyTitle.textContent = '错题本还是空的';
        emptyText.textContent = '答错的题目会自动收进来，也可以在题目里手动点「加入错题」。';
        emptyBtn.textContent = '去全部题目练习';
      } else if (state.scope === 'fav') {
        emptyTitle.textContent = '还没有收藏的题目';
        emptyText.textContent = '点题目右上角的星标就能收藏，方便考前回看。';
        emptyBtn.textContent = '去全部题目看看';
      } else {
        emptyTitle.textContent = '没有符合条件的题目';
        emptyText.textContent = '换一个关键词，或清除筛选条件再试试。';
        emptyBtn.textContent = '清除全部筛选';
      }
    }

    var counts = { choice: 0, fill: 0, design: 0 };
    arr.forEach(function (q) { counts[q.type]++; });
    var sub = arr.length + ' 题 · 选择 ' + counts.choice + ' / 填空 ' + counts.fill + ' / 设计 ' + counts.design;
    sub += ' · ' + langLabel(state.lang) + ' 模式';
    if (state.keyword.trim()) sub += ' · 关键词「' + state.keyword.trim() + '」';
    $('#listSub').textContent = sub;
    $('#collapseAllBtn').hidden = true;

    syncAll();
  }

  function buildNav() {
    var items = [{ name: 'all', label: '全部题目', count: TOTAL, color: '#0071e3' }];
    bank.modules.forEach(function (m) {
      items.push({ name: m.name, label: m.display || m.name, count: m.count, color: MODULE_COLOR[m.name] || '#0071e3' });
    });
    $('#moduleNav').innerHTML = items.map(function (it) {
      return '<button class="nav-item' + (state.module === it.name ? ' active' : '') + '" type="button" data-module="' + esc(it.name) + '">' +
        '<span class="nav-dot" style="--nav-color:' + it.color + '"></span>' +
        '<span class="nav-name">' + esc(it.label) + '</span>' +
        '<span class="nav-count">' + it.count + '</span>' +
        '<span class="nav-bar"><i data-navbar="' + esc(it.name) + '"></i></span></button>';
    }).join('');
    updateNavProgress();
  }

  function updateNavProgress() {
    var totalDone = 0;
    var moduleDone = {};
    bank.questions.forEach(function (q) {
      if (status(q) !== 'none') {
        totalDone++;
        moduleDone[q.module] = (moduleDone[q.module] || 0) + 1;
      }
    });
    var allBar = $('[data-navbar="all"]');
    if (allBar) allBar.style.width = (totalDone / TOTAL * 100) + '%';
    bank.modules.forEach(function (m) {
      var bar = $('[data-navbar="' + m.name + '"]');
      if (bar) bar.style.width = ((moduleDone[m.name] || 0) / m.count * 100) + '%';
    });
    return { totalDone: totalDone, moduleDone: moduleDone };
  }

  function buildChips() {
    var types = [
      { key: 'all', label: '全部', n: TOTAL },
      { key: 'choice', label: '选择题', n: bank.typeCounts.choice },
      { key: 'fill', label: '程序填空', n: bank.typeCounts.fill },
      { key: 'design', label: '程序设计', n: bank.typeCounts.design }
    ];
    $('#typeChips').innerHTML = types.map(function (t) {
      return '<button class="chip' + (state.type === t.key ? ' active' : '') + '" type="button" data-type="' + t.key + '">' +
        t.label + '<span class="n">' + t.n + '</span></button>';
    }).join('');

    var scopes = [
      { key: 'all', label: '全部' },
      { key: 'undone', label: '未做' },
      { key: 'wrong', label: '错题' },
      { key: 'fav', label: '收藏' }
    ];
    $('#scopeChips').innerHTML = scopes.map(function (s) {
      return '<button class="chip' + (state.scope === s.key ? ' active' : '') + '" type="button" data-scope="' + s.key + '">' +
        s.label + '<span class="n" data-scope-n="' + s.key + '"></span></button>';
    }).join('');
    updateChips();
  }

  function updateChips() {
    $$('#typeChips .chip').forEach(function (b) {
      b.classList.toggle('active', b.dataset.type === state.type);
    });
    $$('#scopeChips .chip').forEach(function (b) {
      b.classList.toggle('active', b.dataset.scope === state.scope);
    });
    var counts = { all: TOTAL, undone: 0, wrong: 0, fav: state.favorites.length };
    bank.questions.forEach(function (q) {
      var st = status(q);
      if (st === 'none') counts.undone++;
      if (st === 'bad') counts.wrong++;
    });
    $$('[data-scope-n]').forEach(function (el) {
      var k = el.getAttribute('data-scope-n');
      el.textContent = counts[k] == null ? '' : counts[k];
    });
  }

  function buildSheet() {
    $('#sheetGrid').innerHTML = bank.questions.map(function (q) {
      return '<button class="sheet-cell" type="button" data-id="' + esc(q.id) + '" title="' +
        esc(q.id + ' · ' + moduleLabel(q.module) + ' · ' + TYPE_LABEL[q.type]) + '">' + q.seq + '</button>';
    }).join('');
    updateSheet();
  }

  function updateSheet() {
    $$('#sheetGrid .sheet-cell').forEach(function (cell) {
      var q = byId.get(cell.dataset.id);
      if (!q) return;
      var st = status(q);
      cell.className = 'sheet-cell' + (st === 'none' ? '' : ' ' + st) + (isFav(q.id) ? ' fav' : '');
    });
  }

  function updateStats() {
    var done = 0, attempt = 0, correct = 0, wrong = 0;
    bank.questions.forEach(function (q) {
      var lq = localized(q, state.lang);
      var st = status(q);
      var p = progressOf(q);
      if (st !== 'none') done++;
      if (st === 'bad') wrong++;
      if (lq.type === 'choice' && p && typeof p.choice === 'number') {
        attempt++;
        if (p.choice === lq.answer) correct++;
      } else if (lq.type !== 'choice' && p && (p.self === 'ok' || p.self === 'bad')) {
        attempt++;
        if (p.self === 'ok') correct++;
      }
    });
    var pct = Math.round(done / TOTAL * 100);
    $('#statDone').innerHTML = done + '<em>/' + TOTAL + '</em>';
    $('#statRate').textContent = attempt ? Math.round(correct / attempt * 100) + '%' : '--';
    $('#statWrong').textContent = wrong;
    $('#statFav').textContent = state.favorites.length;
    $('#sidePercent').textContent = pct + '%';
    $('#sideBar').style.width = pct + '%';
    $('#heroRing').style.setProperty('--p', pct);
    $('#heroRingText').textContent = pct + '%';
    $('#sideHint').textContent = done === 0 ? '从任意模块开始刷题吧' :
      done === TOTAL ? '全部完成，去回顾错题吧' : '还剩 ' + (TOTAL - done) + ' 题，继续加油';
    updateNavProgress();
    updateChips();
    updateSheet();
  }

  function syncAll() { updateStats(); }

  function syncControls() {
    $('#searchInput').value = state.keyword;
    $('#typeSelect').value = state.type;
    $('#diffSelect').value = state.diff;
    $('#shuffleBtn').setAttribute('aria-pressed', state.shuffle ? 'true' : 'false');
    $('#hapticBtn').setAttribute('aria-pressed', state.haptics ? 'true' : 'false');
    $$('#moduleNav .nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.module === state.module);
    });
    $$('#langSwitch .lang-btn').forEach(function (b) {
      var on = b.dataset.lang === state.lang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    updateChips();
  }

  /* ---------------- Actions ---------------- */
  function afterChange(q) {
    if (state.scope !== 'all' && !scopeMatch(q)) {
      renderList();
      return;
    }
    var card = document.querySelector('.q-card[data-id="' + q.id + '"]');
    if (card) card.replaceWith(renderCard(q));
    syncAll();
  }

  function onListClick(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var card = btn.closest('.q-card');
    if (!card) return;
    var q = byId.get(card.dataset.id);
    if (!q) return;
    var act = btn.dataset.act;
    var lq = localized(q, state.lang);

    if (act === 'option') {
      var p = progressOf(q) || {};
      if (typeof p.choice === 'number') return;
      p.choice = Number(btn.dataset.index);
      p.revealed = true;
      p.ts = Date.now();
      state.progress[state.lang + ':' + q.id] = p;
      saveState();
      haptic(p.choice === lq.answer ? [12, 35, 18] : [42]);
      afterChange(q);
      if (p.choice !== lq.answer) toast('已自动加入错题本');
      return;
    }

    if (act === 'reveal') {
      var p2 = progressOf(q) || {};
      p2.revealed = true;
      p2.ts = Date.now();
      state.progress[state.lang + ':' + q.id] = p2;
      saveState();
      haptic(8);
      afterChange(q);
      return;
    }

    if (act === 'self') {
      var p3 = progressOf(q) || {};
      p3.self = btn.dataset.self;
      p3.revealed = true;
      p3.ts = Date.now();
      state.progress[state.lang + ':' + q.id] = p3;
      saveState();
      haptic(p3.self === 'ok' ? [10, 25, 12] : [35]);
      afterChange(q);
      toast(p3.self === 'ok' ? '已标记为掌握' : '已加入错题本');
      return;
    }

    if (act === 'reset') {
      delete state.progress[state.lang + ':' + q.id];
      saveState();
      haptic(10);
      afterChange(q);
      toast('已重置本题');
      return;
    }

    if (act === 'fav') {
      var idx = state.favorites.indexOf(q.id);
      if (idx >= 0) state.favorites.splice(idx, 1);
      else state.favorites.push(q.id);
      saveState();
      haptic(10);
      afterChange(q);
      toast(idx >= 0 ? '已取消收藏' : '已收藏本题');
      return;
    }

    if (act === 'copy') {
      var block = btn.closest('.code-block');
      var pre = block && block.querySelector('pre');
      if (pre) copyText(pre.innerText);
    }
  }

  function copyText(text) {
    function done() { haptic(8); toast('代码已复制'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function resetFilters() {
    state.module = 'all';
    state.type = 'all';
    state.diff = 'all';
    state.scope = 'all';
    state.keyword = '';
    syncControls();
    renderList();
  }

  function jumpTo(id) {
    var q = byId.get(id);
    if (!q) return;
    state.module = 'all';
    state.type = 'all';
    state.diff = 'all';
    state.scope = 'all';
    state.keyword = '';
    $('#searchInput').value = '';
    syncControls();
    renderList();
    setTimeout(function () {
      var el = document.getElementById('q-' + id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
      setTimeout(function () { el.classList.remove('flash'); }, 1600);
    }, 30);
  }

  function randomQuestion() {
    var pool = bank.questions.filter(function (q) { return status(q) === 'none'; });
    if (!pool.length) pool = bank.questions.slice();
    var q = pool[Math.floor(Math.random() * pool.length)];
    state.module = 'all';
    state.type = 'all';
    state.diff = 'all';
    state.scope = 'all';
    state.keyword = '';
    $('#searchInput').value = '';
    syncControls();
    renderList();
    haptic(10);
    setTimeout(function () {
      var el = document.getElementById('q-' + q.id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(function () { el.classList.remove('flash'); }, 1600);
    }, 30);
    toast('随机抽到 ' + q.id);
  }

  function ensureShuffleOrder() {
    if (state.shufOrder.length === TOTAL) return;
    var ids = bank.questions.map(function (q) { return q.id; });
    for (var i = ids.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    }
    state.shufOrder = ids;
  }

  /* ---------------- Language ---------------- */
  function buildLangSwitch() {
    $('#langSwitch').innerHTML = LANGS.map(function (l) {
      return '<button class="lang-btn' + (state.lang === l.key ? ' active' : '') + '" type="button" role="tab" ' +
        'data-lang="' + l.key + '" aria-selected="' + (state.lang === l.key) + '">' +
        '<span class="lang-name">' + esc(l.label) + '</span>' +
        '<span class="lang-glow" aria-hidden="true"></span></button>';
    }).join('');
  }

  function setLang(key) {
    if (!isLang(key) || key === state.lang) return;
    state.lang = key;
    saveState();
    haptic(10);
    syncControls();
    renderList();
    updateSheet();
    toast('已切换到 ' + langLabel(key) + ' 模式，答案与解析已同步');
  }

  /* ---------------- Events ---------------- */
  function bind() {
    $('#moduleNav').addEventListener('click', function (e) {
      var btn = e.target.closest('.nav-item');
      if (!btn) return;
      state.module = btn.dataset.module;
      state.scope = 'all';
      syncControls();
      renderList();
      closeSidebar();
      var anchor = $('#listTitle');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#typeChips').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      state.type = btn.dataset.type;
      syncControls();
      renderList();
    });

    $('#scopeChips').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      state.scope = btn.dataset.scope;
      syncControls();
      renderList();
    });

    $('#langSwitch').addEventListener('click', function (e) {
      var btn = e.target.closest('.lang-btn');
      if (!btn) return;
      setLang(btn.dataset.lang);
    });

    $('#searchInput').addEventListener('input', function (e) {
      clearTimeout(bind._t);
      var v = e.target.value;
      bind._t = setTimeout(function () {
        state.keyword = v;
        renderList();
      }, 180);
    });

    $('#searchInput').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.target.value = '';
        state.keyword = '';
        renderList();
        e.target.blur();
      }
    });

    $('#typeSelect').addEventListener('change', function (e) {
      state.type = e.target.value;
      syncControls();
      renderList();
    });

    $('#diffSelect').addEventListener('change', function (e) {
      state.diff = e.target.value;
      syncControls();
      renderList();
    });

    $('#shuffleBtn').addEventListener('click', function () {
      state.shuffle = !state.shuffle;
      if (state.shuffle) {
        ensureShuffleOrder();
        toast('已开启乱序练习');
      } else {
        toast('已恢复顺序练习');
      }
      haptic(8);
      saveState();
      syncControls();
      renderList();
    });

    $('#sheetBtn').addEventListener('click', function () {
      var sheet = $('#sheet');
      var show = sheet.hidden;
      sheet.hidden = !show;
      this.setAttribute('aria-expanded', show ? 'true' : 'false');
      if (show) sheet.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    $('#sheetGrid').addEventListener('click', function (e) {
      var cell = e.target.closest('.sheet-cell');
      if (!cell) return;
      jumpTo(cell.dataset.id);
    });

    list.addEventListener('click', onListClick);

    $('#resetBtn').addEventListener('click', function () {
      var who = authUser() ? authUser().name + ' 账号' : '游客模式';
      if (!window.confirm('确定清空「' + who + '」下三种语言的全部作答记录、错题和收藏吗？此操作不可撤销。')) return;
      state.progress = {};
      state.favorites = [];
      saveState();
      haptic(18);
      syncControls();
      renderList();
      toast('三种语言的学习进度已重置');
    });

    $('#clearFilterBtn').addEventListener('click', resetFilters);
    $('#emptyResetBtn').addEventListener('click', resetFilters);

    $('#startBtn').addEventListener('click', function () {
      $('#listTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
      haptic(8);
    });
    $('#randomBtn').addEventListener('click', randomQuestion);

    $('#themeBtn').addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      saveState();
      haptic(8);
    });

    $('#hapticBtn').addEventListener('click', function () {
      state.haptics = !state.haptics;
      saveState();
      syncControls();
      haptic(12);
      toast(state.haptics ? '触感反馈已开启' : '触感反馈已关闭');
    });

    $('#menuBtn').addEventListener('click', openSidebar);
    $('#sidebarClose').addEventListener('click', closeSidebar);
    $('#sidebarMask').addEventListener('click', closeSidebar);

    $('#toTop').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.addEventListener('scroll', function () {
      $('#toTop').classList.toggle('show', window.scrollY > 600);
    }, { passive: true });

    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
        e.preventDefault();
        $('#searchInput').focus();
      }
      if (e.key === 'Escape') { closeSidebar(); closeAuth(); }
    });
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#000000' : '#f5f5f7');
  }

  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#sidebarMask').classList.add('show');
  }
  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#sidebarMask').classList.remove('show');
  }

  function initWeChatBanner() {
    if (!/MicroMessenger/i.test(navigator.userAgent)) return;
    if (localStorage.getItem('c-review-wx-tip') === 'off') return;
    var banner = $('#wxBanner');
    var close = $('#wxClose');
    if (!banner || !close) return;
    banner.hidden = false;
    close.addEventListener('click', function () {
      banner.hidden = true;
      try { localStorage.setItem('c-review-wx-tip', 'off'); } catch (e) { /* ignore */ }
    });
  }

  /* ---------------- Init ---------------- */
  loadState();
  applyTheme();
  buildLangSwitch();
  buildNav();
  buildChips();
  buildSheet();
  bind();
  bindAuth();
  initRipple();
  initWeChatBanner();
  syncControls();
  renderList();

  if (localStorage.getItem(storageKey()) === null && localStorage.getItem(LEGACY_KEY) === null) {
    setTimeout(function () { toast('提示：右上角可切换 C / C++ / Python，按 / 可搜索'); }, 900);
  }
})();
