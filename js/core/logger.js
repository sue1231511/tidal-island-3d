// 统一日志：哪里出的错 + 错误堆栈 + 关键变量。
// 所有模块都只通过这里输出，不直接调用 console。
// 渲染循环里的错误会按 where 去重限流，避免每帧刷屏。

const PREFIX = '[潮汐岛]';
const ring = [];
const RING_MAX = 200;
const throttle = new Map();
const listeners = new Set();

let debug = false;
try {
  debug = /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search);
} catch (e) {
  // 日志器自身还没初始化完，只能直接写控制台
  console.warn(PREFIX, '[logger.init] 读取地址参数失败，调试输出关闭', e && e.stack);
  debug = false;
}

function safeVars(vars) {
  if (vars === undefined) return '';
  try {
    return JSON.stringify(vars, (k, v) => {
      if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
      if (v && typeof v === 'object' && v.isObject3D) return `Object3D(${v.name || v.type})`;
      return v;
    });
  } catch (e) {
    return `[vars 无法序列化: ${e && e.message}]`;
  }
}

function push(level, where, message, stack, vars) {
  const entry = { time: Date.now(), level, where, message, stack, vars: safeVars(vars) };
  ring.push(entry);
  if (ring.length > RING_MAX) ring.shift();
  listeners.forEach((fn) => {
    try {
      fn(entry);
    } catch (e) {
      // 监听器自身出错时只能写回控制台，不能再走 listeners，避免递归
      console.error(PREFIX, '[logger.listener]', e && e.stack);
    }
  });
  return entry;
}

function out(level, entry) {
  const head = `${PREFIX}[${entry.where}] ${entry.message}`;
  const tail = [];
  if (entry.stack) tail.push(`\n堆栈: ${entry.stack}`);
  if (entry.vars) tail.push(`\n变量: ${entry.vars}`);
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  fn(head + tail.join(''));
}

export const log = {
  /** 出错：where = 出错位置，err = 异常对象，vars = 关键变量 */
  error(where, err, vars) {
    const message = (err && err.message) || String(err);
    const stack = (err && err.stack) || new Error('(无原始堆栈)').stack;
    out('error', push('error', where, message, stack, vars));
  },
  /** 渲染循环用：同一个 where 每 5 秒最多打印一次，并带上累计次数 */
  errorThrottled(where, err, vars) {
    const now = Date.now();
    const rec = throttle.get(where) || { last: 0, count: 0 };
    rec.count += 1;
    if (now - rec.last > 5000) {
      rec.last = now;
      this.error(where, err, Object.assign({ 累计次数: rec.count }, vars || {}));
    }
    throttle.set(where, rec);
  },
  warn(where, message, vars) {
    out('warn', push('warn', where, message, '', vars));
  },
  info(where, message, vars) {
    const entry = push('info', where, message, '', vars);
    if (debug) out('info', entry);
  },
  get debug() {
    return debug;
  },
  history() {
    return ring.slice();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// 兜底：没被 try/catch 接住的错误也要能追到
try {
  window.addEventListener('error', (ev) => {
    log.error('window.onerror', ev.error || new Error(ev.message), {
      file: ev.filename,
      line: ev.lineno,
      col: ev.colno,
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason));
    log.error('window.unhandledrejection', reason);
  });
} catch (e) {
  console.error(PREFIX, '[logger.install]', e && e.stack);
}
