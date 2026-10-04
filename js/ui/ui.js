// 界面：天时木牌（左上）、按钮（右下）、地点卡片、工作台、地名标签。

import { log } from '../core/logger.js';
import { LABELS, PHASES, TIDES, WEATHERS, SEASONS, formatCST, formatDuration, DIMS } from '../core/clock.js';
import { icon } from './icons.js';

const DIM_ICONS = { phase: PHASES, tide: TIDES, weather: WEATHERS, season: SEASONS };
const DIM_NAMES = { phase: '时辰', tide: '潮汐', weather: '天气', season: '季节' };

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function createUI(opts) {
  const { world, root, placesById, onDescend, onAscend, onReset, onFocus, onQuality, getQuality } = opts;
  const ui = { labelsOn: true, mode: 'surface' };

  // ---------- 天时木牌 ----------
  const hud = el('section', 'hud', '');
  hud.setAttribute('aria-label', '此刻的天时');
  hud.innerHTML = `
    <div class="hud-title">
      <div class="hud-name">潮汐岛</div>
      <button class="hud-mode" type="button" title="回到实时">${icon('live')}<span>实时</span></button>
    </div>
    <div class="hud-time"></div>
    <div class="hud-chips"></div>`;
  root.appendChild(hud);
  const chipsBox = hud.querySelector('.hud-chips');
  const timeBox = hud.querySelector('.hud-time');
  const modeBtn = hud.querySelector('.hud-mode');
  const chips = {};
  DIMS.forEach((d) => {
    const c = el('div', `chip chip-${d}`, '');
    c.innerHTML = `<span class="chip-ico"></span><span class="chip-txt"><b></b><small></small></span>`;
    chipsBox.appendChild(c);
    chips[d] = c;
  });
  modeBtn.addEventListener('click', () => {
    try {
      world.setLive();
      syncBench();
    } catch (e) {
      log.error('ui.modeBtn', e);
    }
  });

  // ---------- 按钮 ----------
  const dock = el('nav', 'dock', '');
  dock.setAttribute('aria-label', '操作');
  const btn = (name, label, fn) => {
    const b = el('button', 'dock-btn', `${icon(name)}<span>${label}</span>`);
    b.type = 'button';
    b.title = label;
    b.addEventListener('click', () => {
      try {
        fn(b);
      } catch (e) {
        log.error(`ui.dock.${name}`, e);
      }
    });
    dock.appendChild(b);
    return b;
  };
  const benchBtn = btn('bench', '工作台', () => toggleBench());
  const layerBtn = btn('down', '下井', () => (ui.mode === 'surface' ? onDescend() : onAscend()));
  const tagBtn = btn('tag', '地名', () => {
    ui.labelsOn = !ui.labelsOn;
    tagBtn.classList.toggle('off', !ui.labelsOn);
    labelsBox.classList.toggle('hidden', !ui.labelsOn);
  });
  btn('reset', '复位', () => onReset());
  root.appendChild(dock);

  // ---------- 地名标签 ----------
  const labelsBox = el('div', 'labels', '');
  root.appendChild(labelsBox);
  const labels = [];
  Object.values(placesById).forEach((p) => {
    const L = el('button', `label ${p.under ? 'is-under' : 'is-surface'}`, `<span class="label-ico">${icon(p.def.icon)}</span><span>${esc(p.def.name)}</span>`);
    L.type = 'button';
    L.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openCard(p.id);
    });
    L.style.display = 'none';
    labelsBox.appendChild(L);
    labels.push({ el: L, p, x: -999, y: -999, vis: false });
  });

  // ---------- 地点卡片 ----------
  const card = el('aside', 'card hidden', '');
  card.setAttribute('aria-live', 'polite');
  root.appendChild(card);
  let cardId = null;
  let cardSig = '';
  const sigOf = (s) => `${s.phase}${s.tide}${s.weather}${s.season}`;

  function renderCard() {
    if (!cardId) return;
    cardSig = sigOf(world.info);
    const p = placesById[cardId];
    if (!p) return;
    const d = p.def;
    const s = world.info;
    let effects = [];
    let scene = '';
    try {
      effects = d.effects ? d.effects(s) : [];
      scene = d.scene ? d.scene(s) : '';
    } catch (e) {
      log.error('ui.renderCard.text', e, { id: cardId });
    }
    const tags = DIMS.map((dim) => `<span class="tag">${icon(DIM_ICONS[dim][s[dim]])}${LABELS[dim][s[dim]]}</span>`).join('');
    const actions = [];
    if (d.descend) actions.push(`<button type="button" class="act act-down">${icon('down')}下到井下</button>`);
    if (d.ascend) actions.push(`<button type="button" class="act act-up">${icon('up')}回到地面</button>`);
    actions.push(`<button type="button" class="act act-focus">${icon('focus')}看看这里</button>`);
    card.innerHTML = `
      <button type="button" class="card-close" title="关上">${icon('close')}</button>
      <header>
        <span class="card-ico">${icon(d.icon)}</span>
        <div><h2>${esc(d.name)}</h2><p class="card-sub">${esc(d.sub)}</p></div>
      </header>
      <p class="card-role">${esc(d.role)}</p>
      <p class="card-desc">${esc(d.desc)}</p>
      <div class="card-now">
        <div class="now-head">此刻</div>
        <div class="now-tags">${tags}</div>
        ${scene ? `<p class="now-scene">${esc(scene)}</p>` : ''}
        ${effects.length ? `<ul class="now-fx">${effects.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="card-acts">${actions.join('')}</div>`;
    card.querySelector('.card-close').addEventListener('click', closeCard);
    const down = card.querySelector('.act-down');
    if (down) down.addEventListener('click', () => onDescend());
    const up = card.querySelector('.act-up');
    if (up) up.addEventListener('click', () => onAscend());
    card.querySelector('.act-focus').addEventListener('click', () => onFocus(cardId));
  }

  function openCard(id) {
    try {
      cardId = id;
      renderCard();
      card.classList.remove('hidden');
      bench.classList.add('hidden');
      benchBtn.classList.remove('on');
      labels.forEach((l) => l.el.classList.toggle('active', l.p.id === id));
    } catch (e) {
      log.error('ui.openCard', e, { id });
    }
  }
  function closeCard() {
    cardId = null;
    card.classList.add('hidden');
    labels.forEach((l) => l.el.classList.remove('active'));
  }

  // ---------- 工作台 ----------
  const bench = el('aside', 'bench hidden', '');
  bench.innerHTML = `
    <button type="button" class="card-close" title="关上">${icon('close')}</button>
    <header><span class="card-ico">${icon('bench')}</span><div><h2>工作台</h2><p class="card-sub">按公式翻看别的天时，或者直接拼一个组合</p></div></header>
    <section class="bench-sec">
      <div class="sec-head">${icon('clock')}<span>时间轴</span><em class="bench-when"></em></div>
      <label class="slider"><span>日子</span><input type="range" class="sl-day" min="-14" max="28" step="1" value="0"><output class="out-day">今天</output></label>
      <label class="slider"><span>时刻</span><input type="range" class="sl-min" min="-720" max="720" step="5" value="0"><output class="out-min">此刻</output></label>
      <p class="bench-hint">拖动后，下面四项会显示那个时刻按游戏公式算出的状态。</p>
    </section>
    <section class="bench-sec">
      <div class="sec-head">${icon('bench')}<span>手动组合</span></div>
      <div class="segs"></div>
    </section>
    <div class="bench-acts">
      <button type="button" class="act act-live">${icon('live')}回到实时</button>
      <button type="button" class="act act-quality">${icon('quality')}<span></span></button>
    </div>`;
  root.appendChild(bench);
  const segsBox = bench.querySelector('.segs');
  const segBtns = {};
  DIMS.forEach((d) => {
    const row = el('div', 'seg-row', `<span class="seg-name">${DIM_NAMES[d]}</span>`);
    const group = el('div', 'seg', '');
    segBtns[d] = LABELS[d].map((lab, i) => {
      const b = el('button', 'seg-btn', `${icon(DIM_ICONS[d][i])}<span>${lab}</span>`);
      b.type = 'button';
      b.addEventListener('click', () => {
        try {
          world.setManual(d, i);
          slDay.value = '0';
          slMin.value = '0';
          syncBench();
        } catch (e) {
          log.error('ui.seg', e, { d, i });
        }
      });
      group.appendChild(b);
      return b;
    });
    row.appendChild(group);
    segsBox.appendChild(row);
  });
  const slDay = bench.querySelector('.sl-day');
  const slMin = bench.querySelector('.sl-min');
  const outDay = bench.querySelector('.out-day');
  const outMin = bench.querySelector('.out-min');
  const whenBox = bench.querySelector('.bench-when');
  const qBtn = bench.querySelector('.act-quality');
  const onSlide = () => {
    try {
      const d = parseInt(slDay.value, 10) || 0;
      const m = parseInt(slMin.value, 10) || 0;
      world.setOffset(d * 86400000 + m * 60000);
      syncBench();
    } catch (e) {
      log.error('ui.slider', e, { day: slDay.value, min: slMin.value });
    }
  };
  slDay.addEventListener('input', onSlide);
  slMin.addEventListener('input', onSlide);
  bench.querySelector('.card-close').addEventListener('click', () => toggleBench(false));
  bench.querySelector('.act-live').addEventListener('click', () => {
    slDay.value = '0';
    slMin.value = '0';
    world.setLive();
    syncBench();
  });
  qBtn.addEventListener('click', () => {
    onQuality();
    syncBench();
  });

  function toggleBench(force) {
    const show = force === undefined ? bench.classList.contains('hidden') : force;
    bench.classList.toggle('hidden', !show);
    benchBtn.classList.toggle('on', show);
    if (show) {
      closeCard();
      syncBench();
    }
  }

  function syncBench() {
    try {
      const s = world.info;
      DIMS.forEach((d) => segBtns[d].forEach((b, i) => b.classList.toggle('on', s[d] === i)));
      const d = parseInt(slDay.value, 10) || 0;
      const m = parseInt(slMin.value, 10) || 0;
      outDay.textContent = d === 0 ? '今天' : d > 0 ? `${d} 天后` : `${-d} 天前`;
      outMin.textContent = m === 0 ? '此刻' : `${m > 0 ? '+' : '−'}${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, '0')}`;
      if (world.mode === 'manual') whenBox.textContent = '手动组合中';
      else whenBox.textContent = `东八区 ${formatCST(Date.now() + (world.mode === 'scrub' ? world.offsetMs : 0))}`;
      const q = getQuality();
      qBtn.querySelector('span').textContent = q === 'high' ? '画质：高' : '画质：省电';
    } catch (e) {
      log.error('ui.syncBench', e);
    }
  }

  // ---------- 刷新 ----------
  function refreshHUD() {
    try {
      const s = world.info;
      const live = world.mode === 'live';
      modeBtn.classList.toggle('is-preview', !live);
      modeBtn.querySelector('span').textContent = live ? '实时' : world.mode === 'manual' ? '手动 · 点此回到实时' : '预览 · 点此回到实时';
      const now = Date.now() + (world.mode === 'scrub' ? world.offsetMs : 0);
      timeBox.textContent = `东八区 ${formatCST(now)}`;
      DIMS.forEach((d) => {
        const c = chips[d];
        const idx = s[d];
        c.querySelector('.chip-ico').innerHTML = icon(DIM_ICONS[d][idx]);
        c.querySelector('b').textContent = LABELS[d][idx];
        let sub = '';
        if (world.mode === 'manual') sub = DIM_NAMES[d];
        else if (d === 'season') sub = `还剩 ${s.seasonRemainingDays} 天`;
        else sub = `${formatDuration(s.next[d])} 后换`;
        c.querySelector('small').textContent = sub;
      });
      if (cardId && sigOf(s) !== cardSig) renderCard();
      if (!bench.classList.contains('hidden')) syncBench();
    } catch (e) {
      log.error('ui.refreshHUD', e);
    }
  }

  let lastHud = 0;
  function tick(nowMs) {
    if (nowMs - lastHud > 1000) {
      lastHud = nowMs;
      refreshHUD();
    }
  }
  world.onChange(() => {
    refreshHUD();
  });

  // ---------- 标签跟随 ----------
  function updateLabels(project, width, height, underAmount) {
    if (!ui.labelsOn) return;
    for (let i = 0; i < labels.length; i++) {
      const L = labels[i];
      try {
        const wantUnder = underAmount > 0.5;
        if (L.p.under !== wantUnder) {
          if (L.vis) {
            L.el.style.display = 'none';
            L.vis = false;
          }
          continue;
        }
        const r = project(L.p.labelPos);
        const visible = r.z < 1 && r.x > -40 && r.x < width + 40 && r.y > -20 && r.y < height + 20;
        if (!visible) {
          if (L.vis) {
            L.el.style.display = 'none';
            L.vis = false;
          }
          continue;
        }
        if (!L.vis) {
          L.el.style.display = '';
          L.vis = true;
        }
        if (Math.abs(r.x - L.x) > 0.3 || Math.abs(r.y - L.y) > 0.3) {
          L.x = r.x;
          L.y = r.y;
          L.el.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px) translate(-50%, -100%)`;
        }
        L.el.style.opacity = String(Math.max(0.35, Math.min(1, 1.6 - r.dist / 260)));
      } catch (e) {
        log.errorThrottled('ui.updateLabels', e, { id: L.p.id });
      }
    }
  }

  function setLayer(mode) {
    ui.mode = mode;
    layerBtn.innerHTML = mode === 'surface' ? `${icon('down')}<span>下井</span>` : `${icon('up')}<span>地面</span>`;
    layerBtn.title = mode === 'surface' ? '下到井下' : '回到地面';
    document.body.classList.toggle('is-under', mode !== 'surface');
    if (cardId) {
      const p = placesById[cardId];
      if (p && !!p.under !== (mode !== 'surface')) closeCard();
    }
  }

  function setNight(isNight) {
    document.body.classList.toggle('is-night', isNight);
  }

  refreshHUD();
  return { tick, updateLabels, openCard, closeCard, setLayer, setNight, refreshHUD, isCardOpen: () => !!cardId };
}

/** 加载失败或不支持 WebGL 时的提示 */
export function showFatal(message) {
  try {
    const box = document.getElementById('fatal');
    if (!box) return;
    box.querySelector('.fatal-msg').textContent = message;
    box.classList.remove('hidden');
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
  } catch (e) {
    log.error('ui.showFatal', e, { message });
  }
}

