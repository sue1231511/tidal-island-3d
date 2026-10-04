// 地点数据：方位按游戏总览图（北在上 = -z），用途按 reference/places.md。
// “此刻”一栏只引用游戏木牌原话（reference/world-clock.md），描写部分是给画面配的文字。

import { LABELS, SIGNS } from '../core/clock.js';

const P = (s) => s; // 仅作标记：这一行是游戏原话

// at: 固定坐标 {x, z}；coast: 沿方向角 θ 找海岸，inset 为往内陆收的距离
export const SURFACE = [
  {
    id: 'hut',
    name: '岸畔小屋',
    sub: '管理员的家',
    icon: 'home',
    at: { x: -44, z: -52 },
    pad: 9,
    role: '岛民自己的家，能睡、能做饭。游戏里会从棚屋一路升级成临海邸。',
    desc: '西北岬上的小屋，背后就是海。院子用矮篱笆围着，烟囱一冒烟，半座岛都知道有人在做饭。',
    scene: (s) =>
      [
        '白天屋里没人，窗台上晒着一双鞋。',
        '暮色里烟囱起烟，正是做饭的时候。',
        '窗里亮着暖灯，屋外只剩海声。',
      ][s.phase],
    effects: () => [],
  },
  {
    id: 'allotment',
    name: '份地',
    sub: '种植与收获',
    icon: 'sprout',
    at: { x: -4, z: -60 },
    pad: 14,
    role: '菜地、果园、温室，旁边有风车。',
    desc: '一畦一畦的菜地顺着北坡铺开，温室的玻璃顶反着光，风车替整片地看着风向。',
    scene: (s) =>
      s.weather === 2 ? '风车转得飞快，叶子被吹得翻过身来。' : s.weather === 1 ? '雾气挂在温室玻璃上，菜叶湿漉漉的。' : '风车慢悠悠地转，地里很安静。',
    effects: (s) => {
      const out = [P(SIGNS.weather[s.weather])];
      if (s.phase === 2) out.push(P('户外长得稍快。'));
      out.push(`本季是${LABELS.season[s.season]}。温室不受季节影响。`);
      return out;
    },
  },
  {
    id: 'beach',
    name: '海边',
    sub: '拾贝·垂钓·发呆',
    icon: 'shell',
    coast: -0.84,
    inset: 5,
    pad: 0,
    role: '沙滩加港口码头。撒网、坐钓、开船、赶海。潮汐对这里影响最大。',
    desc: '东北的月牙湾，细沙一直铺到木码头脚下。潮一退，滩涂和潮池就露出来，螃蟹横着走。',
    scene: (s) =>
      [
        '潮水退得远远的，滩涂上全是闪光的小水洼。',
        '潮水停在码头的半腰，不涨也不退。',
        '潮水漫上来，码头的桩子只剩一截露在外面。',
      ][s.tide],
    effects: (s) => [
      P(['能赶海。', '能掏洞。', '赶海和掏洞都不行。'][s.tide]),
      P(['赶海贝壳多一点。', '出海多花时间。', '出海容易失败。'][s.weather]),
    ],
  },
  {
    id: 'cliff',
    name: '盐风崖',
    sub: '眺望与思考',
    icon: 'cliff',
    coast: 3.08,
    inset: 7,
    pad: 5,
    role: '挖矿的崖：铁砂、铜绿、盐脉。涨潮出盐，退潮出铁，海雾出稀有。',
    desc: '西岸最高的一面崖，崖壁上嵌着锈红的铁砂、青绿的铜绿和白亮的盐脉。哪一种矿正肥，哪一种就微微发亮。',
    scene: (s) =>
      s.weather === 1 ? '雾从崖下漫上来，崖缝里有说不清颜色的光。' : '站在崖边往西看，只有海和风。',
    effects: (s) => {
      const out = [P(['崖上铁砂更肥。', '崖上铜绿略肥。', '盐脉更肥。'][s.tide])];
      if (s.weather === 1) out.push(P('海雾出稀有。'));
      if (s.weather === 2) out.push(P('阵风天更容易出事。'));
      return out;
    },
  },
  {
    id: 'workshop',
    name: '岸工坊',
    sub: '修理·改造·制作',
    icon: 'hammer',
    coast: -0.2,
    inset: 15,
    pad: 9,
    role: '打铜钉、补网、盐田、阵风后打捞。',
    desc: '东岸的工坊，门口挂着补了一半的渔网。往下走几步就是盐田，海水灌进去，晒出来就是盐。',
    scene: (s) =>
      s.tide === 2 ? '盐田的闸开着，海水正往格子里灌。' : '盐田里的水慢慢晒干，格子边结了一圈白。',
    effects: (s) => {
      const out = [s.tide === 2 ? P('盐田只能这时灌。') : '盐田要等涨潮才能灌。'];
      if (s.weather === 2) out.push(P('岸工坊能打捞。'));
      return out;
    },
  },
  {
    id: 'plaza',
    name: '广场',
    sub: '岛屿的中心',
    icon: 'compass',
    at: { x: 0, z: 0 },
    pad: 21,
    role: '圆形大广场。里面有杂货铺、灯塔、乔乔诊所、潮汐公告、栗栗流动摊。',
    desc: '全岛的路都通到这里。地上嵌着一枚罗盘，公告板上写着此刻的潮汐，诊所和杂货铺的门总开着一扇。',
    scene: (s) => (s.phase === 0 ? '斑鸠在石板缝里找吃的。' : '路灯一盏盏亮起来，公告板被照得暖黄。'),
    effects: (s) => [
      `${LABELS.phase[s.phase]}：${P(SIGNS.phase[s.phase])}`,
      `${LABELS.tide[s.tide]}：${P(SIGNS.tide[s.tide])}`,
      `${LABELS.weather[s.weather]}：${P(SIGNS.weather[s.weather])}`,
    ],
  },
  {
    id: 'bar',
    name: '酒吧',
    sub: '微醺·故事·相遇',
    icon: 'cup',
    at: { x: -34, z: 2 },
    pad: 9,
    role: '滨海酒吧。暮和夜开门，岛民来洗碗上工、点酒。',
    desc: '广场西边的木头酒吧，露台上挂着一串小灯。白天它在睡觉，天一暗就醒。',
    scene: (s) => (s.phase === 0 ? '门上挂着打烊的牌子，椅子倒扣在桌上。' : '小灯串亮着，里面有杯子碰在一起的声音。'),
    effects: (s) => {
      const out = [P(['酒吧默认打烊。', '酒吧开门。', '酒吧继续开。'][s.phase])];
      if (s.weather === 1) out.push(P('酒吧小费好一点。'));
      return out;
    },
  },
  {
    id: 'theater',
    name: '剧场',
    sub: '小橘星光',
    icon: 'star',
    at: { x: 34, z: 2 },
    pad: 9,
    role: '红顶剧场，门头有星。里面有编剧社、衣泊坊、剧场看台。',
    desc: '红屋顶，门头上一颗金星。夜里星星会亮，像是在提醒谁该上台了。',
    scene: (s) => (s.phase === 2 ? '门头的星亮着，台阶上落着一张节目单。' : '门半掩着，里面有人在对台词。'),
    effects: () => [],
  },
  {
    id: 'market',
    name: '集市',
    sub: '交易·热闹·人情',
    icon: 'awning',
    at: { x: -38, z: 31 },
    pad: 10,
    role: '条纹摊篷的集市，旁边有默语花房。',
    desc: '蓝白、橙白的条纹篷子挤在一起，摊上堆着筐和箱子。旁边的默语花房，玻璃里永远开着花。',
    scene: (s) => (s.weather === 2 ? '篷布被风鼓起来，摊主正压着货。' : '篷子下面有人在讨价还价。'),
    effects: () => [],
  },
  {
    id: 'eatery',
    name: '小馆',
    sub: '简餐·茶饮·小憩',
    icon: 'bowl',
    at: { x: 37, z: 27 },
    pad: 8,
    role: '岸畔小馆，堂食。',
    desc: '东南坡上的小馆，露台摆着几张桌子，一只猫常年占着其中一把椅子。',
    scene: (s) => (s.phase === 0 ? '露台上晒着太阳，猫睡得很沉。' : '灯笼亮了，茶还是热的。'),
    effects: () => [],
  },
  {
    id: 'ting',
    name: '听潮亭',
    sub: '静听潮声',
    icon: 'pavilion',
    at: { x: -6, z: 45 },
    pad: 7,
    role: '一座亭子，木牌墙，岛民钉牌问事。',
    desc: '六角的小亭子，旁边一面木牌墙，钉满了岛民写下的问题。风一吹，木牌就互相敲着响。',
    scene: (s) =>
      [
        '潮在退，听得见水声一点点往外走。',
        '平潮的时候最静，木牌也不响。',
        '潮在涨，浪声一阵比一阵近。',
      ][s.tide],
    effects: () => [],
  },
  {
    id: 'hui',
    name: '潮生会',
    sub: '岛民组织',
    icon: 'flag',
    at: { x: 24, z: 51 },
    pad: 8,
    role: '会堂。交岸税、捐基金、看告示。',
    desc: '一座结实的会堂，旗杆上的旗子替全岛看着风。门口的告示板总是贴得满满的。',
    scene: (s) => (s.weather === 2 ? '旗子被扯得笔直，啪啪作响。' : '旗子懒懒地垂着。'),
    effects: () => [],
  },
  {
    id: 'lianli',
    name: '连理所',
    sub: '缔结·纪念·誓约',
    icon: 'arch',
    at: { x: -44, z: 54 },
    pad: 8,
    role: '开花的拱廊。订婚、成婚。',
    desc: '一条开满花的拱廊，从这头走到那头，就算说好了。花的颜色跟着季节换。',
    scene: (s) =>
      ['拱廊开满了粉花，风一过就落一阵。', '藤叶浓得遮住了天，花一簇一簇的。', '叶子黄了，拱廊下铺了一地。', '藤是光的，挂着几盏小灯和一点雪。'][
        s.season
      ],
    effects: () => [],
  },
  {
    id: 'entrance',
    name: '井下入口',
    sub: '深入之地',
    icon: 'cave',
    at: { x: 3, z: 64 },
    pad: 5,
    role: '山洞口，往下通井下世界。',
    desc: '南丘脚下的山洞口，两盏灯笼守着一架往下的木梯。洞里有风往外吹，带着一点水声。',
    scene: () => '洞口的灯笼一直亮着，往下看不到底。',
    effects: () => [P('井下是减岛缘的高风险区。')],
    descend: true,
  },
  {
    id: 'lighthouse',
    name: '灯塔',
    sub: '广场里的子地点',
    icon: 'lighthouse',
    lighthouse: true,
    pad: 0,
    role: '游戏里灯塔归在广场下面。这里把它立在东南的礁上。',
    desc: '东南海岬外的一块礁上立着灯塔。退潮的时候，海岬和礁之间会露出一条沙洲，可以走过去。',
    scene: (s) => {
      const bar = s.tide === 0 ? '沙洲露出来了，可以走到灯塔脚下。' : '沙洲淹在水下，灯塔孤零零地站在礁上。';
      return s.weather === 1 ? `${bar}雾里只看得见它的光。` : bar;
    },
    effects: () => [],
  },
];

// 井下：按井下总览图的上下（mx 左右 -1..1，my 上下 0..1）
export const UNDER = [
  { id: 'u-entrance', name: '井下入口', sub: '竖梯下来', icon: 'ladder', m: [0, 0], r: 7, role: '从地面下来的地方。', desc: '竖梯下面是一池清水，灯笼沿着两侧的石阶往下排。', ascend: true },
  { id: 'u-backroom', name: '后室铺', sub: '帘子后的杂货铺', icon: 'curtain', m: [-0.62, 0.17], r: 9, role: '帘子后的杂货铺，能买、能修。', desc: '红帘子后面是一间塞满瓶瓶罐罐的小铺子，柜台后面的架子一直顶到岩顶。' },
  { id: 'u-bounty', name: '恩怨墙', sub: '悬赏', icon: 'scroll', m: [0, 0.22], r: 8, role: '一面贴满悬赏的墙，接单、挂单。', desc: '一整面墙贴满了悬赏，新的压着旧的。墙前是一块圆形的小空地。' },
  { id: 'u-bank', name: '恶猫钱庄', sub: '钱庄', icon: 'coin', m: [0.62, 0.19], r: 9.5, role: '钱庄，查账、借还、存取。', desc: '青绿地毯上印着一只猫爪，书桌后面的账本堆得很高。笼子里有只蓝鹦鹉，桌底下有只猫。' },
  { id: 'u-pit', name: '深坑', sub: '角斗场', icon: 'ring', m: [-0.56, 0.46], r: 12, role: '下沉的圆形角斗场，一圈圈石阶。', desc: '一圈圈石阶往下收，坑底是一块刻着罗纹的圆地。四周拉着红绳。' },
  { id: 'u-casino', name: '死人赌场', sub: '赌场', icon: 'dice', m: [0.58, 0.45], r: 10.5, role: '赌场，骰子、灯、抽牌。荷官叫 Silas。', desc: '红地毯，绿绒桌，墙边一台老虎机闪着灯。荷官 Silas 总在洗牌。' },
  { id: 'u-tavern', name: '凯斯酒馆', sub: '井下的酒馆', icon: 'mug', m: [0, 0.63], r: 10, role: '井下的酒馆。', desc: '青瓦檐下一圈吧台，高脚凳一字排开。井下的人都在这里歇脚。' },
  { id: 'u-medic', name: '晏安医务间', sub: '诊室', icon: 'cross', m: [0.6, 0.7], r: 9, role: '治井下伤的诊室。', desc: '浅色的瓷砖地，一张病床，药柜透着青光。门外就是地下水潭。' },
  { id: 'u-jail', name: '地下监牢', sub: '牢', icon: 'bars', m: [-0.6, 0.77], r: 8.5, role: '铁栏围起来的牢。', desc: '一圈铁栏围着一张桌子，灯笼挂在栏杆外面。' },
  { id: 'u-k', name: 'K 室', sub: '最深处', icon: 'door', m: [0, 0.93], r: 10, role: '最深处一扇圆门，帘幔、贝壳和灯。', desc: '最深处的一扇圆门，两边垂着青色帘幔，贝壳和灯笼挂了一墙。' },
].map((u) => Object.assign(u, {
  scene: (s) =>
    [
      '外面在退潮，地下水潭的水面也低了一截。',
      '外面平潮，地下的水静静的。',
      '外面在涨潮，地下水潭漫到了石阶边上。',
    ][s.tide],
  effects: () => [],
}));

// 地下坐标：x = -mx*50（从北往南看时与总览图左右一致），z = 50 - my*96，y 逐层下降
export function underPos(m) {
  return { x: -m[0] * 50, z: 50 - m[1] * 96, y: -18 - m[1] * 24 };
}

// 地下通道：按总览图的连接关系
export const UNDER_LINKS = [
  ['u-entrance', 'u-bounty'],
  ['u-bounty', 'u-backroom'],
  ['u-bounty', 'u-bank'],
  ['u-bounty', 'u-pit'],
  ['u-bounty', 'u-casino'],
  ['u-pit', 'u-tavern'],
  ['u-casino', 'u-tavern'],
  ['u-tavern', 'u-jail'],
  ['u-tavern', 'u-medic'],
  ['u-jail', 'u-k'],
  ['u-medic', 'u-k'],
  ['u-entrance', 'u-backroom'],
  ['u-entrance', 'u-bank'],
];

/** 地面小路：从广场辐射出去，再串起南边几处 */
export function surfacePaths(pos) {
  const p = (id) => [pos[id].x, pos[id].z];
  const mid = (a, b, k, ox = 0, oz = 0) => [a[0] + (b[0] - a[0]) * k + ox, a[1] + (b[1] - a[1]) * k + oz];
  const plaza = [0, 0];
  const north = [-2, -24];
  const list = [
    { pts: [[0, -19], north, mid(north, p('hut'), 0.5, 4, 2), [p('hut')[0] + 5, p('hut')[1] + 6]], w: 1.6 },
    { pts: [north, [-3, -40], [p('allotment')[0], p('allotment')[1] + 10]], w: 1.7 },
    { pts: [north, [16, -34], mid([16, -34], p('beach'), 0.6, 0, 3), p('beach')], w: 1.5 },
    { pts: [[17, -10], mid([17, -10], p('workshop'), 0.5, 0, 2), p('workshop')], w: 1.5 },
    { pts: [[-19, 1], [p('bar')[0] + 7, p('bar')[1] + 1]], w: 1.8 },
    { pts: [[19, 1], [p('theater')[0] - 7, p('theater')[1] + 1]], w: 1.8 },
    { pts: [[-14, -31], [-34, -24], mid([-34, -24], p('cliff'), 0.6, 0, -2), p('cliff')], w: 1.3 },
    { pts: [[-13, 14], [-26, 24], [p('market')[0] + 6, p('market')[1] - 2]], w: 1.6 },
    { pts: [[13, 14], [26, 21], [p('eatery')[0] - 5, p('eatery')[1] - 1]], w: 1.6 },
    { pts: [[0, 20], [-3, 32], [p('ting')[0] + 1, p('ting')[1] - 5]], w: 1.7 },
    { pts: [[p('ting')[0] + 5, p('ting')[1] + 1], [12, 50], [p('hui')[0] - 6, p('hui')[1]]], w: 1.4 },
    { pts: [[p('ting')[0] - 5, p('ting')[1] + 2], [-24, 52], [p('lianli')[0] + 7, p('lianli')[1]]], w: 1.4 },
    { pts: [[p('ting')[0] + 3, p('ting')[1] + 5], [2, 55], [p('entrance')[0], p('entrance')[1] - 3]], w: 1.4 },
    { pts: [[p('eatery')[0] - 2, p('eatery')[1] + 5], [30, 42], [p('hui')[0] + 3, p('hui')[1] - 5]], w: 1.2 },
    { pts: [[p('workshop')[0] - 3, p('workshop')[1] + 6], [44, 12], [p('eatery')[0] + 1, p('eatery')[1] - 5]], w: 1.2 },
  ];
  list.forEach((l) => {
    if (l.pts[0][0] === plaza[0] && l.pts[0][1] === plaza[1]) l.pts.shift();
  });
  return list;
}
