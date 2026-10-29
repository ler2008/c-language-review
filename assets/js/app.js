/* =========================================================
   C 语言程序设计基础 · 习题复习库
   纯前端交互：筛选 / 作答 / 解析 / 进度 / 答题卡
   ========================================================= */
(function () {
  'use strict';

  var bank = window.C_BANK;
  if (!bank || !Array.isArray(bank.questions)) {
    document.body.innerHTML = '<div style="padding:60px;font-family:sans-serif;text-align:center">' +
      '<h2>题库数据加载失败</h2><p>请确认 assets/js/data.js 已生成。</p></div>';
    return;
  }

  var STORAGE_KEY = 'c-review-bank-v1';
  var TYPE_LABEL = { choice: '选择题', fill: '程序填空', design: '程序设计' };
  var MODULE_CLASS = {
    'C语言基础': 'mod-basics', '数组': 'mod-array', '指针': 'mod-pointer',
    '结构体': 'mod-struct', '枚举': 'mod-enum', '函数': 'mod-function'
  };
  var MODULE_COLOR = {
    'C语言基础': '#3b82f6', '数组': '#10b981', '指针': '#8b5cf6',
    '结构体': '#f59e0b', '枚举': '#f43f5e', '函数': '#06b6d4'
  };
  var LETTERS = 'ABCD';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var byId = new Map();
  bank.questions.forEach(function (q) { byId.set(q.id, q); });
  var TOTAL = bank.questions.length;

  /* ---------------- State ---------------- */
  var state = {
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

  function loadState() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && typeof saved === 'object') {
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

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore quota */ }
  }

  /* ---------------- Utils ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function icon(name, extra) {
    return '<svg class="icon' + (extra ? ' ' + extra : '') + '"><use href="#i-' + name + '"></use></svg>';
  }

  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  function progressOf(q) {
    var p = state.progress[q.id];
    return p && typeof p === 'object' ? p : null;
  }

  function status(q) {
    var p = progressOf(q);
    if (!p) return 'none';
    if (q.type === 'choice') {
      if (typeof p.choice === 'number') return p.choice === q.answer ? 'ok' : 'bad';
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

  function haystack(q) {
    return [q.id, q.module, TYPE_LABEL[q.type], q.stem, (q.tags || []).join(' '),
      (q.options || []).join(' '), q.blanks ? q.blanks.map(function (b) { return b.answer + ' ' + (b.note || ''); }).join(' ') : '']
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

  /* ---------------- Markdown-ish rendering ---------------- */
  var KEYWORDS = ('auto break case char const continue default do double else enum extern float for goto if ' +
    'inline int long register restrict return short signed sizeof static struct switch typedef union ' +
    'unsigned void volatile while _Bool bool true false NULL').split(' ');
  var FUNCS = ('printf scanf puts gets putchar getchar malloc calloc realloc free strlen strcpy strncpy strcat strcmp ' +
    'strncmp memset memcpy fopen fclose fgets fputs fprintf fscanf sprintf sscanf qsort exit abs sqrt pow fabs ' +
    'toupper tolower isdigit isalpha isspace').split(' ');
  var KW_SET = new Set(KEYWORDS);
  var FN_SET = new Set(FUNCS);

  function highlightC(code) {
    var re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|^[ \t]*#[^\n]*|\b(?:printf|scanf|puts|gets|putchar|getchar|malloc|calloc|realloc|free|strlen|strcpy|strncpy|strcat|strcmp|strncmp|memset|memcpy|fopen|fclose|fgets|fputs|fprintf|fscanf|sprintf|sscanf|qsort|exit|abs|sqrt|pow|fabs|toupper|tolower|isdigit|isalpha|isspace)\b|\b(?:auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Bool|bool|true|false|NULL)\b|\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?[fFuUlL]*)\b)/gm;
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(code)) !== null) {
      out += esc(code.slice(last, m.index));
      var tok = m[0];
      var cls = '';
      if (tok.indexOf('//') === 0 || tok.indexOf('/*') === 0) cls = 'tok-com';
      else if (tok.charAt(0) === '"' || tok.charAt(0) === "'") cls = 'tok-str';
      else if (/^[ \t]*#/.test(tok)) cls = 'tok-pre';
      else if (/^(0[xX][0-9a-fA-F]+|\d)/.test(tok)) cls = 'tok-num';
      else if (FN_SET.has(tok)) cls = 'tok-fn';
      else if (KW_SET.has(tok)) cls = 'tok-key';
      out += cls ? '<span class="' + cls + '">' + esc(tok) + '</span>' : esc(tok);
      last = re.lastIndex;
    }
    out += esc(code.slice(last));
    return out;
  }

  function renderCode(code, lang) {
    var label = lang === 'text' ? '输入 / 输出样例' : (lang ? lang.toUpperCase() : 'C');
    var body = (lang === 'text' || lang === 'output') ? esc(code) : highlightC(code);
    return '<div class="code-block">' +
      '<div class="code-head"><span class="code-dots"><i></i><i></i><i></i></span>' +
      '<span class="code-lang">' + esc(label) + '</span>' +
      '<button class="code-copy" type="button" data-act="copy">' + icon('copy') + '复制</button></div>' +
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
    var p = progressOf(q) || {};
    var st = status(q);
    var answeredChoice = q.type === 'choice' && typeof p.choice === 'number';
    var revealed = answeredChoice || p.revealed === true;

    var badges = '<span class="pill ' + (MODULE_CLASS[q.module] || '') + '">' + esc(q.module) + '</span>' +
      '<span class="pill type-' + q.type + '">' + TYPE_LABEL[q.type] + '</span>' +
      '<span class="diff" title="难度 ' + q.difficulty + '/3">' +
      [1, 2, 3].map(function (i) { return '<i class="' + (i <= q.difficulty ? 'on' : '') + '">●</i>'; }).join('') +
      '</span>';

    var head = '<div class="q-head">' +
      '<div class="q-no"><span class="seq">' + String(q.seq).padStart(3, '0') + '</span><span class="qid">' + esc(q.id) + '</span></div>' +
      '<div class="q-badges">' + badges + '</div>' +
      '<div class="q-tools">' +
      '<button class="icon-btn fav' + (isFav(q.id) ? ' active' : '') + '" data-act="fav" type="button" title="' + (isFav(q.id) ? '取消收藏' : '收藏本题') + '" aria-pressed="' + isFav(q.id) + '">' + icon('star') + '</button>' +
      '</div></div>';

    var body = '<div class="q-stem">' + renderRich(q.stem) + '</div>';

    if (q.type === 'choice') {
      body += '<div class="options" role="radiogroup" aria-label="选项">' + (q.options || []).map(function (opt, i) {
        var cls = 'option';
        if (answeredChoice) {
          if (i === q.answer) cls += ' correct';
          else if (i === p.choice) cls += ' wrong';
        } else if (revealed && i === q.answer) {
          cls += ' hint';
        }
        return '<button class="' + cls + '" type="button" data-act="option" data-index="' + i + '"' +
          (answeredChoice ? ' disabled' : '') + '>' +
          '<span class="opt-letter">' + LETTERS[i] + '</span>' +
          '<span class="opt-text">' + inline(opt) + '</span>' +
          '<span class="opt-mark" aria-hidden="true"></span></button>';
      }).join('') + '</div>';

      if (answeredChoice) {
        var ok = p.choice === q.answer;
        body += '<div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + icon(ok ? 'check' : 'x') +
          '<span>' + (ok ? '回答正确' : '回答错误') + ' · 正确答案 ' + LETTERS[q.answer] +
          (ok ? '' : '，对照解析看看错因') + '</span></div>';
      }
    }

    if (revealed) {
      body += renderAnswerPanel(q, p);
    } else {
      body += '<div class="reveal-row"><button class="btn reveal" type="button" data-act="reveal">' +
        icon('eye') + '查看答案与解析</button><span class="hint-text">建议先独立写出答案</span></div>';
    }

    var el = document.createElement('article');
    el.className = 'q-card';
    el.id = 'q-' + q.id;
    el.dataset.id = q.id;
    el.innerHTML = head + body;
    return el;
  }

  function renderAnswerPanel(q, p) {
    var inner = '';

    if (q.type === 'fill' && Array.isArray(q.blanks)) {
      inner += '<div class="blank-list">' + q.blanks.map(function (b) {
        return '<div class="blank-row"><span class="blank-no">' + esc(b.no) + '</span>' +
          '<div class="blank-body"><div class="blank-answer"><code>' + esc(b.answer) + '</code></div>' +
          (b.note ? '<div class="blank-note">' + inline(b.note) + '</div>' : '') + '</div></div>';
      }).join('') + '</div>';
    }

    if (q.type === 'design') {
      inner += '<div class="solution-head"><span>参考程序（C）</span><span>可直接复制运行</span></div>' +
        renderCode(String(q.solution || '').replace(/\n$/, ''), 'c');
      if (Array.isArray(q.points) && q.points.length) {
        inner += '<ul class="points">' + q.points.map(function (pt) { return '<li>' + inline(pt) + '</li>'; }).join('') + '</ul>';
      }
    }

    inner += '<div class="analysis"><h4>答案解析</h4>' + renderRich(q.analysis || '') + '</div>';

    if (q.type === 'choice') {
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
      (q.type === 'fill' ? '先填空，再核对' : q.type === 'design' ? '先写代码，再对照' : '理解比记住更重要') +
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
    if (state.module !== 'all') title = state.module;
    else if (state.scope === 'wrong') title = '错题本';
    else if (state.scope === 'fav') title = '我的收藏';
    else if (state.scope === 'undone') title = '未做题目';
    else if (state.type !== 'all') title = TYPE_LABEL[state.type] + '专项';
    $('#listTitle').textContent = title;

    var counts = { choice: 0, fill: 0, design: 0 };
    arr.forEach(function (q) { counts[q.type]++; });
    var sub = arr.length + ' 题 · 选择 ' + counts.choice + ' / 填空 ' + counts.fill + ' / 设计 ' + counts.design;
    if (state.keyword.trim()) sub += ' · 关键词「' + state.keyword.trim() + '」';
    $('#listSub').textContent = sub;
    $('#collapseAllBtn').hidden = true;

    syncAll();
  }

  function buildNav() {
    var items = [{ name: 'all', label: '全部题目', count: TOTAL, color: '#1d4ed8' }];
    bank.modules.forEach(function (m) {
      items.push({ name: m.name, label: m.name, count: m.count, color: MODULE_COLOR[m.name] || '#1d4ed8' });
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
        esc(q.id + ' · ' + q.module + ' · ' + TYPE_LABEL[q.type]) + '">' + q.seq + '</button>';
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
      var st = status(q);
      var p = progressOf(q);
      if (st !== 'none') done++;
      if (st === 'bad') wrong++;
      if (q.type === 'choice' && p && typeof p.choice === 'number') {
        attempt++;
        if (p.choice === q.answer) correct++;
      } else if (q.type !== 'choice' && p && (p.self === 'ok' || p.self === 'bad')) {
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
    $$('#moduleNav .nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.module === state.module);
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

    if (act === 'option') {
      var p = progressOf(q) || {};
      if (typeof p.choice === 'number') return;
      p.choice = Number(btn.dataset.index);
      p.revealed = true;
      p.ts = Date.now();
      state.progress[q.id] = p;
      saveState();
      afterChange(q);
      if (p.choice !== q.answer) toast('已自动加入错题本');
      return;
    }

    if (act === 'reveal') {
      var p2 = progressOf(q) || {};
      p2.revealed = true;
      p2.ts = Date.now();
      state.progress[q.id] = p2;
      saveState();
      afterChange(q);
      return;
    }

    if (act === 'self') {
      var p3 = progressOf(q) || {};
      p3.self = btn.dataset.self;
      p3.revealed = true;
      p3.ts = Date.now();
      state.progress[q.id] = p3;
      saveState();
      afterChange(q);
      toast(p3.self === 'ok' ? '已标记为掌握' : '已加入错题本');
      return;
    }

    if (act === 'reset') {
      delete state.progress[q.id];
      saveState();
      afterChange(q);
      toast('已重置本题');
      return;
    }

    if (act === 'fav') {
      var idx = state.favorites.indexOf(q.id);
      if (idx >= 0) state.favorites.splice(idx, 1);
      else state.favorites.push(q.id);
      saveState();
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
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('代码已复制'); } catch (e) { toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('代码已复制'); }, fallback);
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
      if (!window.confirm('确定清空所有作答记录、错题和收藏吗？此操作不可撤销。')) return;
      state.progress = {};
      state.favorites = [];
      saveState();
      syncControls();
      renderList();
      toast('学习进度已重置');
    });

    $('#clearFilterBtn').addEventListener('click', resetFilters);
    $('#emptyResetBtn').addEventListener('click', resetFilters);

    $('#startBtn').addEventListener('click', function () {
      $('#listTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#randomBtn').addEventListener('click', randomQuestion);

    $('#themeBtn').addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      saveState();
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
      if (e.key === 'Escape') closeSidebar();
    });
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
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
  buildNav();
  buildChips();
  buildSheet();
  bind();
  initWeChatBanner();
  syncControls();
  renderList();

  // 首次进入时，如果之前没有进度，给出轻提示
  if (localStorage.getItem(STORAGE_KEY) === null) {
    setTimeout(function () { toast('提示：按 / 可快速搜索题目'); }, 900);
  }
})();
