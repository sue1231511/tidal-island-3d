// 游戏时钟：与服务端 allotment-relay/server/world.py、season.py、config.py 完全一致。
// 只由时间决定，不连服务器。
//   时辰 floor(t/2400)%3   潮汐 floor(t/3600)%3   天气 floor(t/7200)%3
//   季节：东八区自 2026-01-05 00:00 起的整天数 d，max(0,d) 后 floor(d/7)%4

import { log } from './logger.js';

export const PHASE_CYCLE = 2400;
export const TIDE_CYCLE = 3600;
export const WEATHER_CYCLE = 7200;
export const DAY_MS = 86400000;
// 2026-01-05 00:00 +08:00 = 2026-01-04 16:00 UTC
export const SEASON_EPOCH_MS = Date.UTC(2026, 0, 4, 16, 0, 0);

export const PHASES = ['day', 'dusk', 'night'];
export const TIDES = ['ebb', 'slack', 'flood'];
export const WEATHERS = ['clear', 'misty', 'gale'];
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export const LABELS = {
  phase: ['昼', '暮', '夜'],
  tide: ['退潮', '平潮', '涨潮'],
  weather: ['晴朗', '海雾', '阵风'],
  season: ['春', '夏', '秋', '冬'],
};

// 游戏木牌原话（reference/world-clock.md）
export const SIGNS = {
  phase: ['斑鸠只在这时出现。酒吧默认打烊。', '酒吧开门。意外略高。', '酒吧继续开。户外长得稍快。'],
  tide: ['能赶海。崖上铁砂更肥。', '能掏洞。崖上铜绿略肥。', '赶海和掏洞都不行。盐脉更肥，盐田只能这时灌。'],
  weather: [
    '地里长得稳，赶海贝壳多一点。',
    '打理过的地慢一点。出海多花时间，酒吧小费好一点。',
    '没人看的地疯长，也更容易出事。出海容易失败，岸工坊能打捞。',
  ],
  season: ['虫害潮、花粉潮、春汛', '常干旱，也有热浪、渔汛、雷暴、赤潮', '秋台、落叶、畜瘟潮', '霜冻、雪封、北风'],
};

export const DIMS = ['phase', 'tide', 'weather', 'season'];
export const DIM_SIZE = { phase: 3, tide: 3, weather: 3, season: 4 };

function mod(a, n) {
  return ((a % n) + n) % n;
}

/**
 * 根据毫秒时间戳算出游戏状态。
 * 返回各维度索引、段内进度 0..1、到下一次切换的秒数、本季剩余天数。
 */
export function stateAt(ms) {
  try {
    if (!Number.isFinite(ms)) throw new Error('时间戳不是有限数');
    const t = Math.floor(ms / 1000);
    const phaseSeg = Math.floor(t / PHASE_CYCLE);
    const tideSeg = Math.floor(t / TIDE_CYCLE);
    const weatherSeg = Math.floor(t / WEATHER_CYCLE);
    // Python timedelta.days 对负数向下取整，服务端再 max(0, days)
    const rawDays = Math.floor((ms - SEASON_EPOCH_MS) / DAY_MS);
    const days = Math.max(0, rawDays);
    const season = mod(Math.floor(days / 7), 4);
    const dayStartMs = SEASON_EPOCH_MS + rawDays * DAY_MS;
    return {
      ms,
      phase: mod(phaseSeg, 3),
      tide: mod(tideSeg, 3),
      weather: mod(weatherSeg, 3),
      season,
      progress: {
        phase: mod(t, PHASE_CYCLE) / PHASE_CYCLE,
        tide: mod(t, TIDE_CYCLE) / TIDE_CYCLE,
        weather: mod(t, WEATHER_CYCLE) / WEATHER_CYCLE,
        season: (mod(days, 7) + (ms - dayStartMs) / DAY_MS) / 7,
      },
      next: {
        phase: PHASE_CYCLE - mod(t, PHASE_CYCLE),
        tide: TIDE_CYCLE - mod(t, TIDE_CYCLE),
        weather: WEATHER_CYCLE - mod(t, WEATHER_CYCLE),
      },
      seasonRemainingDays: 7 - mod(days, 7),
    };
  } catch (e) {
    log.error('clock.stateAt', e, { ms });
    return {
      ms: 0,
      phase: 0,
      tide: 1,
      weather: 0,
      season: 0,
      progress: { phase: 0, tide: 0, weather: 0, season: 0 },
      next: { phase: PHASE_CYCLE, tide: TIDE_CYCLE, weather: WEATHER_CYCLE },
      seasonRemainingDays: 7,
    };
  }
}

/** 东八区的日期时间文字，用于工作台显示 */
export function formatCST(ms) {
  try {
    const d = new Date(ms + 8 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(
      d.getUTCMinutes()
    )}`;
  } catch (e) {
    log.error('clock.formatCST', e, { ms });
    return '--';
  }
}

/** 倒计时：mm:ss，超过一小时显示 h:mm:ss */
export function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

/** 启动自测：文档给出的样例必须对上 */
export function selfTest() {
  try {
    // 东八区 2026-10-05 01:16 → 冬、暮、涨潮、阵风
    const ms = Date.UTC(2026, 9, 4, 17, 16, 0);
    const s = stateAt(ms);
    const ok = s.season === 3 && s.phase === 1 && s.tide === 2 && s.weather === 2;
    if (!ok) {
      log.error('clock.selfTest', new Error('时钟自测不通过'), {
        期望: '冬 暮 涨潮 阵风',
        实际: [LABELS.season[s.season], LABELS.phase[s.phase], LABELS.tide[s.tide], LABELS.weather[s.weather]],
      });
    } else {
      log.info('clock.selfTest', '时钟自测通过：冬 暮 涨潮 阵风');
    }
    return ok;
  } catch (e) {
    log.error('clock.selfTest', e);
    return false;
  }
}
