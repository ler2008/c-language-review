/* =========================================================
   本地账号系统：注册 / 登录 / 退出 / 切换账号
   数据仅保存在本机 localStorage，不上传任何服务器。
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'c-review-accounts-v1';

  /* ---------- 同步 SHA-256（不依赖 secure context，file:// 也能用） ---------- */
  function sha256(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), result = '', i, j;
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = sha256.h = sha256.h || [];
    var k = sha256.k = sha256.k || [];
    var primeCounter = k.length;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i % 4) * 8);
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;

    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16);
      var oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (
            w[i - 16] +
            (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
            w[i - 7] +
            (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0);
        var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  /* ---------- 存储 ---------- */
  function load() {
    try {
      var db = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (db && db.users && typeof db.users === 'object') return db;
    } catch (e) { /* ignore */ }
    return { version: 1, current: null, users: {} };
  }

  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }

  var listeners = [];
  function emit() {
    listeners.forEach(function (fn) { try { fn(current()); } catch (e) { /* ignore */ } });
  }

  function current() {
    var db = load();
    if (!db.current) return null;
    var u = db.users[db.current];
    if (!u) return null;
    return { name: db.current, created: u.created };
  }

  function list() {
    var db = load();
    return Object.keys(db.users).map(function (name) {
      return { name: name, created: db.users[name].created };
    });
  }

  function normalizeName(name) {
    return String(name || '').trim();
  }

  function hashPassword(pw, salt) {
    return sha256(salt + '|' + pw + '|c-review');
  }

  function makeSalt() {
    var s = '';
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    if (window.crypto && crypto.getRandomValues) {
      var buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      for (var i = 0; i < buf.length; i++) s += chars[buf[i] % chars.length];
    } else {
      for (var j = 0; j < 16; j++) s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  }

  function register(name, pw) {
    name = normalizeName(name);
    if (name.length < 2 || name.length > 16) return { ok: false, msg: '用户名需 2~16 个字符' };
    if (/[\s/\\]/.test(name)) return { ok: false, msg: '用户名不能包含空格或斜杠' };
    if (String(pw || '').length < 6) return { ok: false, msg: '密码至少 6 位' };
    var db = load();
    if (db.users[name]) return { ok: false, msg: '这个用户名已经注册过了' };
    var salt = makeSalt();
    db.users[name] = { salt: salt, hash: hashPassword(pw, salt), created: Date.now() };
    db.current = name;
    save(db);
    emit();
    return { ok: true, msg: '欢迎，' + name };
  }

  function login(name, pw) {
    name = normalizeName(name);
    var db = load();
    var u = db.users[name];
    if (!u) return { ok: false, msg: '账号不存在，先注册一个吧' };
    if (u.hash !== hashPassword(pw, u.salt)) return { ok: false, msg: '密码不正确' };
    db.current = name;
    save(db);
    emit();
    return { ok: true, msg: '欢迎回来，' + name };
  }

  function logout() {
    var db = load();
    db.current = null;
    save(db);
    emit();
  }

  function onChange(fn) { listeners.push(fn); }

  /* 当前账号对应的学习数据 key；游客沿用旧 key，保证老进度不丢 */
  function dataKey(base) {
    var u = current();
    return u ? base + ':u:' + u.name : base;
  }

  window.C_AUTH = {
    current: current,
    list: list,
    register: register,
    login: login,
    logout: logout,
    onChange: onChange,
    dataKey: dataKey,
    storageKey: KEY
  };
})();
