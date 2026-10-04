// 手绘 SVG 图标：24×24，描边用 currentColor，线条故意带一点手抖的弧度。

const S = (inner, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${inner}</svg>`;

export const ICONS = {
  // 时辰
  day: S(`<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.3M12 18.9v2.3M2.8 12h2.3M18.9 12h2.3M5.4 5.5l1.6 1.6M17 17.1l1.6 1.5M5.5 18.6l1.6-1.6M17 7l1.6-1.6"/>`),
  dusk: S(`<path d="M3 17.5h18"/><path d="M6.6 17.4a5.4 5.4 0 0 1 10.8 0"/><path d="M12 6.2v2.1M5.7 9.6l1.4 1.3M18.3 9.6l-1.4 1.3"/><path d="M6 20.6h4.2M13.4 20.6h4.6"/>`),
  night: S(`<path d="M19.2 14.6A7.6 7.6 0 0 1 9.4 4.8a7.7 7.7 0 1 0 9.8 9.8z"/><path d="M16.6 4.4l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" stroke-width="1.1"/>`),
  // 潮汐
  ebb: S(`<path d="M3 15.2c1.6-1.2 3.2-1.2 4.8 0s3.2 1.2 4.8 0 3.2-1.2 4.8 0 2.2 1 2.6.6"/><path d="M12 3.4v7.4M9 8l3 3 3-3"/><path d="M4.5 19.4c2.5.9 5 .9 7.5 0s5-.9 7.5 0"/>`),
  slack: S(`<path d="M3 11c1.6-1.1 3.2-1.1 4.8 0s3.2 1.1 4.8 0 3.2-1.1 4.8 0 2.2 .9 2.6.5"/><path d="M3 16c1.6-1.1 3.2-1.1 4.8 0s3.2 1.1 4.8 0 3.2-1.1 4.8 0 2.2 .9 2.6.5"/><path d="M8.5 6.4h7"/>`),
  flood: S(`<path d="M3 9.4c1.6-1.2 3.2-1.2 4.8 0s3.2 1.2 4.8 0 3.2-1.2 4.8 0 2.2 1 2.6.6"/><path d="M12 21v-7.6M9 16.3l3-3 3 3"/><path d="M4.5 4.8c2.5-.9 5-.9 7.5 0s5 .9 7.5 0"/>`),
  // 天气
  clear: S(`<circle cx="9.2" cy="9.4" r="3.4"/><path d="M9.2 2.6v1.6M2.6 9.4h1.6M4.6 4.7l1.1 1.1M13.8 4.7l-1.1 1.1"/><path d="M11.4 18.6h6.4a2.8 2.8 0 0 0 .2-5.6 4 4 0 0 0-7.6 1.2 2.2 2.2 0 0 0 1 4.4z"/>`),
  misty: S(`<path d="M4 8.6h11.4M7.6 12.2h12.6M3.4 15.8h10.8M8.4 19.4h9"/><path d="M17.6 8.6h2.2M16.6 15.8h1.6" stroke-width="1.3"/>`),
  gale: S(`<path d="M3 8.4h10.6a2.6 2.6 0 1 0-2.6-2.7"/><path d="M3 12.4h15.4a2.8 2.8 0 1 1-2.8 2.8"/><path d="M3 16.4h7.6a2.2 2.2 0 1 1-2.2 2.2"/>`),
  // 季节
  spring: S(`<path d="M12 21v-7.6"/><path d="M12 15.6c-3.2 0-5.2-2-5.4-5 3.1 0 5.2 1.8 5.4 5z"/><circle cx="12" cy="7.2" r="2"/><path d="M12 3.4v1.8M12 9.2v1.6M8.2 7.2h1.8M14 7.2h1.8M9.4 4.6l1.2 1.2M13.4 8.6l1.2 1.2M14.6 4.6l-1.2 1.2M10.6 8.6l-1.2 1.2" stroke-width="1.2"/>`),
  summer: S(`<circle cx="12" cy="11" r="3.6"/><path d="M12 3.2v1.9M12 16.9v1.9M4.2 11h1.9M17.9 11h1.9M6.5 5.5l1.3 1.3M16.2 15.2l1.3 1.3M6.5 16.5l1.3-1.3M16.2 6.8l1.3-1.3"/><path d="M5 21.2c2.4-.9 4.6-.9 7 0s4.6.9 7 0"/>`),
  autumn: S(`<path d="M5.6 18.6C4.4 11 8.8 5 18.8 4.2c.6 9.8-5.2 14.6-13.2 14.4z"/><path d="M5.6 18.6l3.4-3.6M9 15l4.4-5M9 15l-.4-3.4M11.6 12l3 .3"/>`),
  winter: S(`<path d="M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2"/><path d="M9.6 4.4L12 6.4l2.4-2M9.6 19.6l2.4-2 2.4 2M3.8 10l3 1-.8 3M20.2 10l-3 1 .8 3M3.8 14l3-1M20.2 14l-3-1" stroke-width="1.2"/>`),
  // 界面
  bench: S(`<path d="M4 6.4h16M4 12h16M4 17.6h16"/><circle cx="8.4" cy="6.4" r="1.8" fill="currentColor" stroke="none"/><circle cx="15.2" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="10.6" cy="17.6" r="1.8" fill="currentColor" stroke="none"/>`),
  down: S(`<path d="M7.4 3v18M16.6 3v18"/><path d="M7.4 7h9.2M7.4 11.4h9.2M7.4 15.8h9.2"/><path d="M19.6 16.4l-1.6 2.6-1.6-2.6" stroke-width="1.3"/>`),
  up: S(`<path d="M4 20.4c2.2-6.2 4.6-9.4 8-9.4s5.8 3.2 8 9.4"/><path d="M12 11V3.2M9.2 6l2.8-2.8L14.8 6"/><path d="M3 20.6h18"/>`),
  tag: S(`<path d="M3.6 12.2V4.4a.8.8 0 0 1 .8-.8h7.8l8.6 8.6a1.2 1.2 0 0 1 0 1.7l-6.1 6.1a1.2 1.2 0 0 1-1.7 0z"/><circle cx="8" cy="8" r="1.4"/>`),
  reset: S(`<circle cx="12" cy="12" r="8.6"/><path d="M12 5.6l2.2 6.4-2.2 6.4-2.2-6.4z"/><path d="M12 5.6l2.2 6.4h-4.4z" fill="currentColor" stroke="none"/>`),
  close: S(`<path d="M6 6.2l11.8 11.6M17.8 6.2L6 17.8"/>`),
  live: S(`<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M6.4 6.4a8 8 0 0 0 0 11.2M17.6 6.4a8 8 0 0 1 0 11.2"/>`),
  clock: S(`<circle cx="12" cy="12.6" r="8.2"/><path d="M12 7.6v5.2l3.2 2"/><path d="M9.6 2.8h4.8"/>`),
  focus: S(`<path d="M4 9V5.2c0-.7.5-1.2 1.2-1.2H9M15 4h3.8c.7 0 1.2.5 1.2 1.2V9M20 15v3.8c0 .7-.5 1.2-1.2 1.2H15M9 20H5.2C4.5 20 4 19.5 4 18.8V15"/><circle cx="12" cy="12" r="2.6"/>`),
  quality: S(`<path d="M4 18.4l4.4-6 3.4 4 2.6-3.2 5.6 5.2z"/><circle cx="16.4" cy="7.4" r="2.2"/><rect x="2.8" y="3.6" width="18.4" height="16.8" rx="2"/>`),
  // 地上地点
  home: S(`<path d="M3.6 11.4L12 4.2l8.4 7.2"/><path d="M5.8 9.8v10h12.4v-10"/><path d="M10.2 19.8v-5.2h3.6v5.2"/><path d="M16 6.4V3.8h1.8v4.2"/>`),
  sprout: S(`<path d="M12 20.6V11"/><path d="M12 13.2c0-3.6-2.4-6-6.6-6.2 0 3.8 2.6 6.2 6.6 6.2z"/><path d="M12 11c.2-3.4 2.6-5.6 6.6-5.6 0 3.6-2.6 5.6-6.6 5.6z"/><path d="M5 20.6h14"/>`),
  shell: S(`<path d="M12 19.6c-4.6 0-8-3.2-8-7.2C4 8 7.6 4.4 12 4.4s8 3.6 8 8c0 4-3.4 7.2-8 7.2z"/><path d="M12 19.6V5M12 19.6L6.4 7.6M12 19.6l5.6-12M12 19.6L4.4 11.6M12 19.6l7.6-8"/>`),
  cliff: S(`<path d="M3 20.4h7.6l1.6-5.2 2.2-1.2 1-4.6 3.2-2.4 2.4.2"/><path d="M3 20.4V10.6l3.6-3.4 2.2 1.4"/><path d="M15.4 20.4c1.6-.8 3.2-.8 5.6 0" stroke-width="1.3"/><path d="M7.2 13.4l1 .8M5.6 16.4l1.2-.4" stroke-width="1.3"/>`),
  hammer: S(`<path d="M13.4 10.6l-8.2 8.2a1.6 1.6 0 0 0 2.2 2.2l8.2-8.2"/><path d="M11.4 6.2l3.2-3 6.4 6.4-3 3.2z"/><path d="M14 8.8l2.4 2.4"/>`),
  compass: S(`<circle cx="12" cy="12" r="8.6"/><path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2z"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>`),
  cup: S(`<path d="M6.4 3.6h11.2l-1.4 7.6a4.2 4.2 0 0 1-8.4 0z"/><path d="M12 15.4v4.8M8.4 20.4h7.2"/><path d="M7 7.4h10" stroke-width="1.2"/>`),
  star: S(`<path d="M12 3.4l2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L12 16.2 6.9 19l1.1-5.7-4.2-3.9 5.7-.7z"/>`),
  awning: S(`<path d="M3.4 9.4L5.4 4h13.2l2 5.4"/><path d="M3.4 9.4c0 1.4 1.2 2.4 2.4 2.4s2.4-1 2.4-2.4c0 1.4 1.2 2.4 2.4 2.4s2.4-1 2.4-2.4c0 1.4 1 2.4 2.4 2.4s2.4-1 2.4-2.4c0 1.4 1 2.4 2.4 2.4"/><path d="M5 12v8.4h14V12M9.6 20.4v-4.6h4.8v4.6"/>`),
  bowl: S(`<path d="M3.4 11.4h17.2a8.6 8.6 0 0 1-17.2 0z"/><path d="M8.6 7.6c0-1.2 1-1.4 1-2.6M12 7.6c0-1.2 1-1.4 1-2.6M15.4 7.6c0-1.2 1-1.4 1-2.6" stroke-width="1.3"/><path d="M8.6 20.6h6.8"/>`),
  pavilion: S(`<path d="M2.8 9.6c3.4-.6 6.4-2.6 9.2-6 2.8 3.4 5.8 5.4 9.2 6"/><path d="M5 9.4v10.8M19 9.4v10.8M10 10v10.2M14 10v10.2"/><path d="M3.4 20.4h17.2"/><path d="M5 15.6h5M14 15.6h5" stroke-width="1.2"/>`),
  flag: S(`<path d="M5.4 21V3.4"/><path d="M5.4 4.4c3-1.6 5.4 1.4 8.2 0s4.4-1 5.4-.2v8.2c-1 .8-2.6.6-5.4.2-2.8 1.4-5.2-1.6-8.2 0"/>`),
  arch: S(`<path d="M5 20.6V11a7 7 0 0 1 14 0v9.6"/><path d="M8.4 20.6v-9a3.6 3.6 0 0 1 7.2 0v9"/><circle cx="6.8" cy="6.6" r="1.4"/><circle cx="12" cy="3.8" r="1.4"/><circle cx="17.2" cy="6.6" r="1.4"/>`),
  cave: S(`<path d="M2.6 20.4c.6-6.4 3.2-11.6 6-13.4 1.8-1.2 3.2-.4 4.4.8 2.8-1.4 5.6 1.4 8.4 12.6"/><path d="M8.4 20.4c0-4 1.6-6.6 3.6-6.6s3.6 2.6 3.6 6.6"/><path d="M1.8 20.4h20.4"/>`),
  lighthouse: S(`<path d="M9.4 21l1.2-12.6h2.8L14.6 21"/><path d="M8.2 21h7.6"/><path d="M9.8 8.4V6.2h4.4v2.2"/><path d="M12 6.2V4.4"/><path d="M15.6 6.8l4.6-1.6M15.6 8l4.6 1.6M8.4 6.8L3.8 5.2M8.4 8L3.8 9.6" stroke-width="1.2"/><path d="M10.2 13.4h3.6M9.8 17.2h4.4" stroke-width="1.2"/>`),
  // 井下地点
  ladder: S(`<path d="M7.6 2.8v18.4M16.4 2.8v18.4"/><path d="M7.6 6.4h8.8M7.6 10.2h8.8M7.6 14h8.8M7.6 17.8h8.8"/>`),
  curtain: S(`<path d="M3 3.6h18"/><path d="M4.6 3.6c0 6 1.4 11 4.2 16.8H4.6z"/><path d="M19.4 3.6c0 6-1.4 11-4.2 16.8h4.2z"/><path d="M10.4 20.4h3.2" stroke-width="1.2"/>`),
  scroll: S(`<rect x="4.4" y="3.6" width="15.2" height="16.8" rx="1.2"/><path d="M7.4 7.4h4M7.4 10.6h9.2M7.4 13.8h6.4M7.4 17h8"/><path d="M15.4 5.6l1.4 1.4" stroke-width="1.2"/>`),
  coin: S(`<ellipse cx="12" cy="7.2" rx="7.4" ry="3.2"/><path d="M4.6 7.2v4.6c0 1.8 3.4 3.2 7.4 3.2s7.4-1.4 7.4-3.2V7.2"/><path d="M4.6 11.8v4.6c0 1.8 3.4 3.2 7.4 3.2s7.4-1.4 7.4-3.2v-4.6"/>`),
  ring: S(`<ellipse cx="12" cy="9" rx="9" ry="4"/><ellipse cx="12" cy="11.6" rx="6" ry="2.6"/><ellipse cx="12" cy="13.8" rx="3" ry="1.3"/><path d="M3 9v6.4c0 2.2 4 4 9 4s9-1.8 9-4V9"/>`),
  dice: S(`<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.6" cy="8.6" r="1.1" fill="currentColor"/><circle cx="15.4" cy="15.4" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>`),
  mug: S(`<path d="M5 6.4h10.4v11.6a2.4 2.4 0 0 1-2.4 2.4H7.4A2.4 2.4 0 0 1 5 18z"/><path d="M15.4 9h2a2.6 2.6 0 0 1 0 5.2h-2"/><path d="M5.4 6.4c0-1.8 1.4-2.8 2.8-2.4 1-1 3-1 4 0 1.4-.4 2.8.6 2.8 2.4"/>`),
  cross: S(`<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3"/><path d="M12 7.4v9.2M7.4 12h9.2"/>`),
  bars: S(`<path d="M3.6 4h16.8M3.6 20h16.8"/><path d="M6.4 4v16M10.2 4v16M13.8 4v16M17.6 4v16"/>`),
  door: S(`<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="5.4"/><path d="M12 3.4v3.2M12 17.4v3.2M3.4 12h3.2M17.4 12h3.2"/><circle cx="14" cy="12" r=".8" fill="currentColor"/>`),
};

export function icon(name, cls = '') {
  const svg = ICONS[name] || ICONS.compass;
  return cls ? svg.replace('<svg ', `<svg class="${cls}" `) : svg;
}
