/*!
 * DINO PRO — game.js
 * ------------------------------------------------------------------
 * Chrome 小恐龙加强版（Pro）：
 *   1. 金币机制 —— 地面与空中分层分布，连击递增倍率，右上角独立计数，
 *      结算时统一按倍率转化为分数。
 *   2. 键位重构 —— W / 空格 跳跃，S 下蹲，A 减速，D 加速（按住持续微调）。
 *   3. 纯前端零依赖，单页静态站点，可直接部署 GitHub Pages。
 * ------------------------------------------------------------------
 */
(function () {
  'use strict';

  // ==================== 基础常量 ====================
  var W = 800, H = 200;                 // 逻辑画布尺寸
  var GROUND_Y = 170;                   // 地面线 y
  var DINO_X = 60;                      // 恐龙固定 x
  var DINO_W = 44, DINO_H = 48;         // 恐龙站立尺寸
  var DUCK_W = 52, DUCK_H = 28;         // 恐龙下蹲尺寸

  var GRAVITY = 2600;                   // px/s^2
  var JUMP_SPEED = 700;                 // px/s（向上），峰值约 94px
  var JUMP_CUT = 0.40;                  // 提前松开按键时的速度保留比例
  var DUCK_FALL_MULT = 3.0;             // 空中按下蹲时重力倍率
  var MAX_FALL = 1500;

  var SPEED_START = 340;                // 起始滚动速度 px/s
  var SPEED_MAX = 640;                  // 基础速度上限 px/s
  var SPEED_GAIN = 0.010;               // 每 px 距离提升的基础速度
  var FACTOR_MIN = 0.7, FACTOR_MAX = 1.6;
  var FACTOR_UP_RATE = 1.05;            // 按住 D 每秒提升的倍率
  var FACTOR_DOWN_RATE = 1.20;          // 按住 A 每秒降低的倍率
  var FACTOR_RETURN = 0.62;             // 松开后每秒向 1.0 回归的速率

  var COIN_R = 10;                      // 金币半径
  var COIN_VALUE = 10;                  // 单枚金币基础分
  // 金币离地高度（px）：折线图形态已废弃，仅保留贴地高度
  var AIR = { GROUND: 14, LOW: 62, MID: 74, HIGH: 84 };

  // ---- 抛物线金币参数 ----
  var JUMP_TAU = 2 * JUMP_SPEED / GRAVITY;  // 满跳滞空时间 ≈ 0.54s
  var COIN_TRAIL_OFFSET = 22;               // 金币相对恐龙跳跃轨迹的高度偏移（落在身体中部）
  var COIN_MIN_GAP = 26;                    // 金币之间的最小水平间距：禁止同列堆叠
  // 金币保护半径按"时间"计算（px = 秒 × 当前速度）：
  // 速度越高，同样的像素距离对应的反应时间越短，所以必须按时间留余量。
  var COIN_EDGE_TIME = 0.50;                // 弧线起点左侧 / 终点右侧的保护时间（起跳助跑 + 落地缓冲）
  var COIN_EDGE_MIN = 140;                  // 上述保护距离的下限（px，低速兜底）
  var COIN_MID_TIME = 0.20;                 // 弧线中段金币的保护时间：障碍可靠近，但不至于贴脸
  var COIN_MID_MIN = 80;                    // 弧线中段金币的保护距离下限（px）
  var COIN_GROUND_TIME = 0.28;              // 贴地金币串的保护时间：保证有落脚位能吃完整串
  var COIN_GROUND_MIN = 100;                // 贴地金币串的保护距离下限（px）

  // ---- 障碍组间距（同样按"时间"换算：速度越高，同样的反应时间需要越大的像素间距）----
  // 两个"必须跳"的障碍之间至少要留出一次满跳滞空的距离，否则玩家跳过一个、
  // 还没落地就会被下一个接住 —— 这正是翼龙成群时"跳完一只、正好落进下一只身上"的根因。
  var OBS_GAP_TIME = 0.86;      // 相邻障碍组的基准时间间隔（≈ 满跳 0.54s + 落地再起跳余量）
  var OBS_GAP_DIFF = 0.16;      // 难度拉满时压缩掉的时间（0.86 → 0.70s，仍然可解）
  var OBS_GAP_MIN = 240;        // 像素下限兜底，避免极低速时贴脸生成
  var OBS_GAP_JIT_MIN = 1.0, OBS_GAP_JIT_MAX = 1.45;

  // ---- 翼龙成群 ----
  // 同一群必须统一高度：低空只能跳、中空只能蹲、高空不能乱跳，
  // 混高度会出现"跳完低空那只、落地正好撞上高空那只"的死局。
  var BIRD_GROUP_CHANCE = 0.30; // 高难度下成群的附加概率
  var BIRD_GROUP_MAX = 3;       // 一群最多几只，避免高速时刷出一整排"翼龙墙"
  var BIRD_GROUP_INNER_MIN = 6; // 群内相邻翼龙的间隙（紧贴，像仙人掌组一样一次通过）
  var BIRD_GROUP_INNER_MAX = 18;
  var BIRD_GROUP_SAFETY = 0.72; // 用"一次满跳覆盖整群"反算群规模时保留的安全余量

  var COMBO_TIERS = [
    { min: 45, mult: 3.0 },
    { min: 30, mult: 2.5 },
    { min: 18, mult: 2.0 },
    { min: 8, mult: 1.5 },
    { min: 0, mult: 1.0 }
  ];

  var OBS = {
    cactusSmall: { w: 18, h: 34, key: 'cactusSmall' },
    cactusLarge: { w: 22, h: 50, key: 'cactusLarge' }
  };
  var BIRD_W = 40, BIRD_H = 32;
  // 翼龙底部离地高度：低空必须跳、中空必须蹲、高空不能乱跳
  var BIRD_HEIGHTS = [8, 34, 52];

  var STORE_KEY = 'dinopro.save.v1';

  // ==================== 工具函数 ====================
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function fmt(n) { return Math.floor(n).toLocaleString('en-US'); }
  function pad5(n) { return String(Math.floor(n)).padStart(5, '0'); }

  // ==================== 存档 ====================
  var Save = {
    data: { best: 0, totalCoins: 0, muted: false, theme: null },
    load: function () {
      try {
        var raw = localStorage.getItem(STORE_KEY);
        if (raw) {
          var o = JSON.parse(raw);
          if (o && typeof o === 'object') {
            this.data.best = Number(o.best) || 0;
            this.data.totalCoins = Number(o.totalCoins) || 0;
            this.data.muted = !!o.muted;
            this.data.theme = o.theme === 'dark' || o.theme === 'light' ? o.theme : null;
          }
        }
      } catch (e) { /* 忽略隐私模式等异常 */ }
    },
    save: function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { /* noop */ }
    }
  };

  // ==================== 音效（WebAudio 合成，无音频文件） ====================
  var Sfx = {
    ac: null,
    muted: false,
    ensure: function () {
      if (this.ac) {
        if (this.ac.state === 'suspended') this.ac.resume();
        return this.ac;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { this.ac = new AC(); } catch (e) { return null; }
      return this.ac;
    },
    tone: function (freq, dur, type, vol, glideTo) {
      if (this.muted) return;
      var ac = this.ensure();
      if (!ac) return;
      var t = ac.currentTime;
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, glideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.055, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(ac.destination);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    },
    jump: function () { this.tone(430, 0.11, 'square', 0.035, 660); },
    land: function () { this.tone(150, 0.06, 'triangle', 0.02, 110); },
    coin: function (combo) {
      // 连击越高，音高越高，形成阶梯式爽感
      var step = Math.min(combo, 24);
      var f = 720 * Math.pow(1.0595, step);
      this.tone(f, 0.075, 'square', 0.04);
      this.tone(f * 2, 0.05, 'sine', 0.02);
    },
    breakCombo: function () { this.tone(190, 0.14, 'sawtooth', 0.03, 110); },
    die: function () {
      this.tone(320, 0.16, 'square', 0.05, 240);
      var self = this;
      setTimeout(function () { self.tone(200, 0.3, 'square', 0.05, 80); }, 130);
    },
    record: function () {
      this.tone(660, 0.1, 'sine', 0.05);
      var self = this;
      setTimeout(function () { self.tone(880, 0.1, 'sine', 0.05); }, 110);
      setTimeout(function () { self.tone(1320, 0.22, 'sine', 0.05); }, 220);
    }
  };

  // ==================== 画布与精灵 ====================
  var stageEl = document.getElementById('stage');
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });

  var RS = (window.devicePixelRatio || 1) >= 1.5 ? 2 : 1;  // 渲染倍率
  canvas.width = W * RS;
  canvas.height = H * RS;
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
  ctx.imageSmoothingEnabled = true;

  var S = bakeSprites(SPRITES, 4);   // 4 倍预渲染，缩放到逻辑尺寸时像素干净

  // ==================== 输入 ====================
  var Input = {
    jumpHeld: false,
    duck: false,
    slow: false,
    fast: false
  };

  // ==================== 游戏状态 ====================
  var G = {
    state: 'ready',          // ready | running | paused | dying | over
    baseSpeed: SPEED_START,
    speed: SPEED_START,
    factor: 1,
    distance: 0,
    scroll: 0,
    score: 0,

    coinCount: 0,
    coinScore: 0,
    combo: 0,
    bestCombo: 0,
    bestMult: 1.0,

    obs: [],
    coins: [],
    clouds: [],
    parts: [],

    obsCountdown: 520,
    coinCountdown: 380,
    cloudCountdown: 0,

    dino: { h: 0, vy: 0, onGround: true, ducking: false },

    runFrame: 0,
    duckFrame: 0,
    animT: 0,
    dyingT: 0,
    shake: 0,
    patternHistory: [],
    lastResult: null
  };

  // 地面碎石纹理（可无缝平铺）
  var TILE_W = 800;
  var groundDots = (function () {
    var arr = [];
    for (var i = 0; i < 46; i++) {
      arr.push({
        x: Math.random() * TILE_W,
        y: GROUND_Y + 5 + Math.random() * 16,
        w: 1 + Math.floor(Math.random() * 3),
        h: 1 + Math.floor(Math.random() * 2)
      });
    }
    return arr;
  })();

  // ==================== 主题 ====================
  var COLORS = {
    light: { stage: '#ffffff', ground: '#535353', dot: '#c9c9c9', cloud: '#d6d6d6', text: '#535353', gold: '#e8a317', goldSoft: '#ffd968', goldDeep: '#b57500', dim: '#a8a8a8' },
    dark: { stage: '#171a20', ground: '#8d94a1', dot: '#3b414c', cloud: '#2c313a', text: '#d7dbe3', gold: '#f0b429', goldSoft: '#ffdd7a', goldDeep: '#c8901a', dim: '#5b6472' }
  };
  var theme = 'light';

  function applyTheme(name) {
    theme = name === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    Save.data.theme = theme;
    Save.save();
  }

  function C() { return COLORS[theme]; }

  // ==================== 音效状态同步 ====================
  Sfx.muted = Save.data.muted;

  // ==================== 实体 ====================
  /**
   * 金币带方向性保护距离 padL / padR（左 / 右）：
   * 该侧的障碍会被推迟生成，保证起跳点、落地点和贴地串两侧都有腾挪空间。
   * 用方向性而不是单一半径，是因为守卫弧的仙人掌本来就该待在弧线中间。
   */
  function makeCoin(x, height, padL, padR) {
    return {
      x: x, h: height,
      padL: padL || 0, padR: padR || 0,
      phase: Math.random() * Math.PI * 2, taken: false, bob: Math.random() * Math.PI * 2
    };
  }

  function coinEdgePad() { return Math.max(COIN_EDGE_MIN, G.speed * COIN_EDGE_TIME); }
  function coinMidPad() { return Math.max(COIN_MID_MIN, G.speed * COIN_MID_TIME); }
  function coinGroundPad() { return Math.max(COIN_GROUND_MIN, G.speed * COIN_GROUND_TIME); }

  function makeCactus(x, kind) {
    var d = OBS[kind];
    return { type: 'cactus', kind: kind, x: x, w: d.w, h: d.h, top: GROUND_Y - d.h, sprite: d.key, box: null };
  }

  function makeBird(x, height) {
    return { type: 'bird', x: x, w: BIRD_W, h: BIRD_H, top: GROUND_Y - height - BIRD_H, vy: 0, frame: 0, animT: 0, box: null };
  }

  function makeCloud(x) {
    return { x: x, y: rand(18, 78), s: rand(0.7, 1.25), v: rand(0.22, 0.42) };
  }

  function addParticles(x, y, n, color, spread) {
    for (var i = 0; i < n; i++) {
      G.parts.push({
        x: x, y: y,
        vx: rand(-spread, spread),
        vy: rand(-spread * 0.9, spread * 0.25),
        life: rand(0.32, 0.62),
        max: 0.62,
        s: rand(1.4, 3.0),
        color: color
      });
    }
  }

  // ==================== 速度 ====================
  function updateSpeed(dt) {
    if (Input.slow && !Input.fast) {
      G.factor = clamp(G.factor - FACTOR_DOWN_RATE * dt, FACTOR_MIN, FACTOR_MAX);
    } else if (Input.fast && !Input.slow) {
      G.factor = clamp(G.factor + FACTOR_UP_RATE * dt, FACTOR_MIN, FACTOR_MAX);
    } else {
      // 松开后缓慢回归 1.0
      if (G.factor > 1) G.factor = Math.max(1, G.factor - FACTOR_RETURN * dt);
      else if (G.factor < 1) G.factor = Math.min(1, G.factor + FACTOR_RETURN * dt);
    }
    G.baseSpeed = Math.min(SPEED_MAX, SPEED_START + G.distance * SPEED_GAIN);
    G.speed = G.baseSpeed * G.factor;
    G.score += G.speed * dt * 0.1;   // 距离分：约 40 分/秒 @400px/s
  }

  // ==================== 恐龙物理 ====================
  function updateDino(dt) {
    var d = G.dino;
    var wantDuck = Input.duck;

    if (d.onGround) {
      d.ducking = wantDuck;
    } else {
      d.ducking = false;
    }

    if (!d.onGround) {
      var g = GRAVITY * (wantDuck ? DUCK_FALL_MULT : 1);
      d.vy -= g * dt;
      if (d.vy < -MAX_FALL) d.vy = -MAX_FALL;
      d.h += d.vy * dt;
      if (d.h <= 0) {
        d.h = 0;
        d.vy = 0;
        d.onGround = true;
        Sfx.land();
        addParticles(DINO_X + 20, GROUND_Y - 2, 5, C().dot, 70);
      }
    }
  }

  function doJump() {
    var d = G.dino;
    if (d.onGround) {
      d.vy = JUMP_SPEED;
      d.onGround = false;
      d.ducking = false;
      Sfx.jump();
      addParticles(DINO_X + 18, GROUND_Y - 2, 4, C().dot, 60);
    }
  }

  function releaseJump() {
    var d = G.dino;
    if (!d.onGround && d.vy > JUMP_SPEED * JUMP_CUT) {
      d.vy = JUMP_SPEED * JUMP_CUT;   // 松开按键 = 跳跃高度截断
    }
  }

  // ==================== 生成：障碍 ====================
  /** 恐龙站立碰撞箱的底边 y（贴地时）。与 dinoBox() 的 top+6+(DINO_H-8) 等价。 */
  function dinoBoxBottom() { return GROUND_Y - 2; }

  /** 障碍碰撞箱的顶边 y —— 与 obstacleBox() 保持一致。 */
  function obstacleBoxTop(o) {
    return o.type === 'cactus' ? o.top + 4 : o.top + 5;
  }

  /**
   * 满跳滞空中"恐龙碰撞箱底高于 boxTop"的持续时长（秒）；跳不过去返回 0。
   * 解 JUMP_SPEED*t - GRAVITY/2*t^2 > need 得窗口 = 2*sqrt(v^2 - 2*g*need) / g。
   */
  function jumpWindowAbove(boxTop) {
    var need = dinoBoxBottom() - boxTop;
    if (need <= 0) return JUMP_TAU;
    var disc = JUMP_SPEED * JUMP_SPEED - 2 * GRAVITY * need;
    return disc <= 0 ? 0 : 2 * Math.sqrt(disc) / GRAVITY;
  }

  /**
   * 一群同高度翼龙最多并排几只。
   * 低空翼龙只能靠跳，整群必须落进一次满跳的窗口里；中空可蹲、高空可站，
   * 都是"按住就能持续"的动作，不受窗口限制。
   */
  function birdGroupMaxCount(height) {
    if (height > BIRD_HEIGHTS[1]) return BIRD_GROUP_MAX;
    var win = jumpWindowAbove(obstacleBoxTop({ type: 'bird', top: GROUND_Y - height - BIRD_H }));
    if (win <= 0) return 1;
    // 水平重叠距离 = 恐龙碰撞箱宽 + 整群碰撞箱宽，必须 <= 窗口内走过的距离
    var boxW = (DINO_W - 20) + (BIRD_W - 10);   // 与 dinoBox() / obstacleBox() 保持一致
    var span = G.speed * win * BIRD_GROUP_SAFETY - boxW;
    if (span < BIRD_W) return 1;
    return clamp(1 + Math.floor(span / (BIRD_W + BIRD_GROUP_INNER_MIN)), 1, BIRD_GROUP_MAX);
  }

  function difficulty() {
    return clamp((G.baseSpeed - SPEED_START) / (SPEED_MAX - SPEED_START), 0, 1);
  }

  /** 决定这次要生成什么障碍（只做规划，先不落到世界里）。 */
  function planObstacle(diff, x) {
    var r = Math.random();

    if (G.score > 260 && r < 0.16 + diff * 0.22) {
      // 翼龙：难度越高出现越多。成群时必须统一高度 —— 低空只能跳、高空不能乱跳，
      // 混高度会让玩家跳完第一只、落地正好撞上第二只。
      var pool = [BIRD_HEIGHTS[0], BIRD_HEIGHTS[1]];
      if (Math.random() < 0.35) pool.push(BIRD_HEIGHTS[2]);
      var bh = pool[randInt(0, pool.length - 1)];

      var birds = [makeBird(x, bh)];
      // 高难度下翼龙成"群"：紧贴排列，让玩家一次跳跃（或一次下蹲）就整群通过。
      // 原来的群内间距是 BIRD_W+70~130，既不够紧到能一次跳过、又不够松到能逐个跳，
      // 正好落在"跳完一只就落进下一只身上"的死区里，这里改成紧贴式。
      if (diff > 0.45 && Math.random() < BIRD_GROUP_CHANCE) {
        var n = birdGroupMaxCount(bh);
        var step = BIRD_W + rand(BIRD_GROUP_INNER_MIN, BIRD_GROUP_INNER_MAX);
        for (var b = 1; b < n; b++) birds.push(makeBird(x + b * step, bh));
      }
      return { obs: birds, cactus: null };
    }

    if (r < 0.62) {
      var n = randInt(1, diff > 0.5 ? 3 : 2);
      var list = [];
      for (var i = 0; i < n; i++) list.push(makeCactus(x + i * 22, 'cactusSmall'));
      return { obs: list, cactus: list[0] };
    }

    var m = diff > 0.55 && Math.random() < 0.35 ? 2 : 1;
    var big = [];
    for (var j = 0; j < m; j++) big.push(makeCactus(x + j * 26, 'cactusLarge'));
    return { obs: big, cactus: big[0] };
  }

  /**
   * 障碍要让开已有金币：返回需要等待的额外距离（0 表示可立即生成）。
   * 只统计 padR > 0 的金币 —— 保护区是方向性的，障碍只会出现在金币右侧，
   * 所以看金币的"右侧保护区"即可；padR = 0 表示"故意架在障碍正上方"的守卫弧中段金币。
   */
  function obstacleDelayFor(x) {
    var need = 0;
    for (var i = 0; i < G.coins.length; i++) {
      var c = G.coins[i];
      if (!(c.padR > 0)) continue;
      // 障碍的左边界必须落在金币右侧保护区之外
      var d = (c.x + c.padR) - x;
      if (d > need) need = d;
    }
    return need;
  }

  function spawnObstacle() {
    var diff = difficulty();
    var x = W + 40;
    var plan = planObstacle(diff, x);

    // 金币优先：等金币从生成点滚开再放障碍，避免仙人掌长在金币上
    var need = obstacleDelayFor(x);
    if (need > 0) {
      G.obsCountdown = need;
      return;
    }

    for (var i = 0; i < plan.obs.length; i++) G.obs.push(plan.obs[i]);

    // 下一个障碍的间隔：按"时间"换算成像素，速度越高间距越大。
    // 必须 >= 一次满跳滞空的水平覆盖，否则会出现"跳过一个、落地就撞上下一个"。
    // 间距要从本组的"尾巴"（最后一个成员）算起，所以把组内偏移加上。
    var tail = 0;
    for (var t = 0; t < plan.obs.length; t++) {
      if (plan.obs[t].x - x > tail) tail = plan.obs[t].x - x;
    }
    var gapTime = OBS_GAP_TIME - OBS_GAP_DIFF * diff;
    var gapPx = G.speed * gapTime * rand(OBS_GAP_JIT_MIN, OBS_GAP_JIT_MAX) + tail;
    G.obsCountdown = Math.max(OBS_GAP_MIN + tail, gapPx);

    // 仙人掌有概率附带一条完整抛物线金币弧（跳过障碍的同时正好收完）
    if (plan.cactus && Math.random() < 0.32) attachGuardCoins(plan.cactus);
  }

  /**
   * 在仙人掌上方铺一条完整跳跃轨迹的金币弧：
   * 障碍左侧起跳 → 越过障碍 → 右侧落地，全程正好吃完。
   */
  function attachGuardCoins(cactus) {
    // 跨度取满跳覆盖的 0.84~0.94：跨度越大，起跳点离仙人掌越远，
    // 且这条弧的起跳净距在"时间"上恒为 ~0.22 秒，不随速度变紧。
    var span = G.speed * JUMP_TAU * rand(0.84, 0.94);
    var minSpan = cactus.w + 120;
    if (span < minSpan) span = minSpan;
    var coef = span / (G.speed * JUMP_TAU);

    var count = randInt(4, 5);
    var startX = cactus.x + cactus.w / 2 - span / 2;
    var endX = startX + span;
    var edgePad = coinEdgePad();

    // 与已有金币冲突就放弃这条弧，保证金币之间永远不挤在一起
    for (var j = 0; j < G.coins.length; j++) {
      var c = G.coins[j];
      if (c.x > startX - COIN_MIN_GAP && c.x < endX + COIN_MIN_GAP) return;
    }

    // 与已有障碍也要保持保护距离，并且确认这条弧真的跳得过去：
    // 起跳点 / 落地点不能被别的障碍贴脸，弧线下方也不能出现越不过的障碍。
    for (var k = 0; k < G.obs.length; k++) {
      var o = G.obs[k];
      if (o === cactus) continue;
      var oR = o.x + o.w;
      if (oR <= startX) {
        if (startX - oR < edgePad) return;      // 起跳点左边太挤
        continue;
      }
      if (o.x >= endX) {
        if (o.x - endX < edgePad) return;       // 落地点右边太挤
        continue;
      }
      // 水平方向与弧线重叠：按轨迹高度验证最吃亏的那一点能否越过
      var ta = (Math.max(o.x, startX) - startX) / span;
      var tb = (Math.min(oR, endX) - startX) / span;
      var hA = trailHeight(ta * JUMP_TAU * coef);
      var hB = trailHeight(tb * JUMP_TAU * coef);
      if (Math.min(hA, hB) < o.h + 8) return;
    }

    // 只保护弧的两个"外端"：起点左侧留起跳空间，终点右侧留落地空间。
    // 弧内一律不设保护 —— 仙人掌本来就架在弧顶正下方，这是刻意设计。
    for (var i = 0; i < count; i++) {
      var t = i / (count - 1);
      var tau = t * JUMP_TAU * coef;
      var padL = t <= 0.01 ? edgePad : 0;
      var padR = t >= 0.99 ? edgePad : 0;
      G.coins.push(makeCoin(startX + t * span, trailHeight(tau) + COIN_TRAIL_OFFSET, padL, padR));
    }
  }

  // ==================== 生成：金币 ====================
  var PATTERNS = [
    { name: 'arc', weight: 6 },
    { name: 'arcTight', weight: 3 },
    { name: 'ground', weight: 2 }
  ];

  function pickPattern() {
    // 避免同一个图案连续出现 3 次以上
    var pool = PATTERNS.filter(function (p) {
      var h = G.patternHistory;
      var n = h.length;
      return !(n >= 2 && h[n - 1] === p.name && h[n - 2] === p.name);
    });
    if (!pool.length) pool = PATTERNS;
    var total = pool.reduce(function (s, p) { return s + p.weight; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) return pool[i].name;
    }
    return pool[pool.length - 1].name;
  }

  /** 恐龙跳跃轨迹在 tau 时刻的离地高度（tau ∈ [0, JUMP_TAU]）。 */
  function trailHeight(tau) {
    return JUMP_SPEED * tau - 0.5 * GRAVITY * tau * tau;
  }

  /**
   * 沿跳跃轨迹铺一条抛物线金币。
   * coef = 跨度相对"满跳水平覆盖"的比例，高度按同一比例压缩，
   * 保证每一枚都恰好落在恐龙的必经高度上 —— 起跳时机对了就能一次全收。
   */
  function buildArc(count, coef, midPad) {
    // 用实际速度而不是基础速度：按住 D 加速时恐龙相对障碍的位移更大，
    // 按基础速度铺的弧会被"冲过头"，导致终点金币吃不到、甚至落在障碍上。
    var span = G.speed * JUMP_TAU * coef;
    var list = [];
    var edgePad = coinEdgePad();
    var mid = midPad || 0;
    for (var i = 0; i < count; i++) {
      var t = count === 1 ? 0.5 : i / (count - 1);
      // 起点金币只管左侧（留出起跳助跑），终点金币只管右侧（留出落地缓冲）
      var isFirst = i === 0 && count > 1;
      var isLast = i === count - 1 && count > 1;
      list.push({
        dx: t * span,
        h: trailHeight(t * JUMP_TAU * coef) + COIN_TRAIL_OFFSET,
        padL: isFirst ? edgePad : mid,
        padR: isLast ? edgePad : mid
      });
    }
    return { coins: list, width: span };
  }

  /** 贴地金币串：贴着地面，跑动即可收，作为节奏调剂。 */
  function buildGround(count) {
    var gap = 30;
    var pad = coinGroundPad();
    var list = [];
    for (var i = 0; i < count; i++) list.push({ dx: i * gap, h: AIR.GROUND, padL: pad, padR: pad });
    return { coins: list, width: (count - 1) * gap };
  }

  /** 返回 { coins:[{dx,h,padL,padR}], width } */
  function buildGroup(name) {
    if (name === 'ground') return buildGround(randInt(3, 4));
    if (name === 'arcTight') return buildArc(randInt(3, 4), rand(0.55, 0.68), coinMidPad());
    return buildArc(randInt(5, 6), rand(0.78, 0.92), coinMidPad());
  }

  /**
   * 金币组放在 x 处需要等待的距离：让开既有障碍，也避免和既有金币贴在一起。
   * 逐枚金币按各自的 padL 检查（保护区是方向性的）—— 弧起点要求大，中段要求小；
   * padL = 0 的弧线中段与守卫弧内金币不参与避让。
   */
  function coinDelayFor(x, g) {
    var need = 0;
    for (var i = 0; i < g.coins.length; i++) {
      var c = g.coins[i];
      if (!(c.padL > 0)) continue;
      var coinX = x + c.dx;
      for (var k = 0; k < G.obs.length; k++) {
        var o = G.obs[k];
        // 障碍完全走在金币左边：金币前方要留够 padL
        var d = (o.x + o.w + c.padL) - coinX;
        if (d > need) need = d;
      }
    }
    for (var j = 0; j < G.coins.length; j++) {
      var e = (G.coins[j].x + COIN_R + COIN_MIN_GAP) - x;
      if (e > need) need = e;
    }
    return need;
  }

  function spawnCoinGroup() {
    var x = W + 40;
    var name = pickPattern();
    var g = buildGroup(name);

    // 避开障碍与既有金币：金币组之间永远不会挤在一起
    var need = coinDelayFor(x, g);
    if (need > 0) {
      G.coinCountdown = need;
      return;
    }

    for (var i = 0; i < g.coins.length; i++) {
      G.coins.push(makeCoin(x + g.coins[i].dx, g.coins[i].h, g.coins[i].padL, g.coins[i].padR));
    }
    G.patternHistory.push(name);
    if (G.patternHistory.length > 6) G.patternHistory.shift();

    // 组间隔按"时间"计算（1.8~2.5 秒一组），任何速度下密度都一致
    G.coinCountdown = G.speed * rand(1.8, 2.5);
  }

  // ==================== 连击与得分 ====================
  function multFor(combo) {
    for (var i = 0; i < COMBO_TIERS.length; i++) {
      if (combo >= COMBO_TIERS[i].min) return COMBO_TIERS[i].mult;
    }
    return 1.0;
  }

  function collectCoin(coin) {
    coin.taken = true;
    G.combo += 1;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;

    var mult = multFor(G.combo);
    if (mult > G.bestMult) G.bestMult = mult;

    G.coinCount += 1;
    G.coinScore += Math.round(COIN_VALUE * mult);

    Sfx.coin(G.combo);
    addParticles(coin.x, GROUND_Y - coin.h, 7, C().gold, 110);
    popCoinCard();
    updateComboUI(mult);
  }

  function breakCombo() {
    if (G.combo >= 6) {
      Sfx.breakCombo();
      var chip = el.comboChip;
      chip.classList.remove('broken');
      void chip.offsetWidth;
      chip.classList.add('broken');
    }
    G.combo = 0;
    updateComboUI(1.0);
  }

  // ==================== 碰撞 ====================
  function dinoBox() {
    var d = G.dino;
    if (d.ducking && d.onGround) {
      var dTop = GROUND_Y - DUCK_H;
      return { x: DINO_X + 4, y: dTop + 5, w: DUCK_W - 12, h: DUCK_H - 8 };
    }
    var top = GROUND_Y - d.h - DINO_H;
    return { x: DINO_X + 9, y: top + 6, w: DINO_W - 20, h: DINO_H - 8 };
  }

  function obstacleBox(o) {
    if (o.type === 'cactus') {
      var ix = o.kind === 'cactusLarge' ? 4 : 3;
      return { x: o.x + ix, y: o.top + 4, w: o.w - ix * 2, h: o.h - 5 };
    }
    return { x: o.x + 5, y: o.top + 5, w: o.w - 10, h: o.h - 10 };
  }

  function checkCollisions() {
    var db = dinoBox();
    var i, o;
    for (i = 0; i < G.obs.length; i++) {
      o = G.obs[i];
      if (overlap(db, obstacleBox(o))) {
        die();
        return;
      }
    }
    for (i = 0; i < G.coins.length; i++) {
      var c = G.coins[i];
      if (c.taken) continue;
      var cb = { x: c.x - COIN_R, y: GROUND_Y - c.h - COIN_R, w: COIN_R * 2, h: COIN_R * 2 };
      if (overlap(db, cb)) collectCoin(c);
    }
  }

  function die() {
    if (G.state !== 'running') return;
    G.state = 'dying';
    G.dyingT = 0;
    G.shake = 0.32;
    Sfx.die();
    addParticles(DINO_X + 22, GROUND_Y - 26, 12, C().dot, 150);
  }

  // ==================== 生命周期 ====================
  function resetRun() {
    G.baseSpeed = SPEED_START;
    G.speed = SPEED_START;
    G.factor = 1;
    G.distance = 0;
    G.scroll = 0;
    G.score = 0;
    G.coinCount = 0;
    G.coinScore = 0;
    G.combo = 0;
    G.bestCombo = 0;
    G.bestMult = 1.0;
    G.obs.length = 0;
    G.coins.length = 0;
    G.parts.length = 0;
    G.obsCountdown = 520;
    G.coinCountdown = 620;
    G.cloudCountdown = 0;
    G.patternHistory.length = 0;
    G.dino = { h: 0, vy: 0, onGround: true, ducking: false };
    G.runFrame = 0;
    G.duckFrame = 0;
    G.animT = 0;
    G.dyingT = 0;
    G.shake = 0;
    Input.jumpHeld = false;
    Input.duck = false;
    Input.slow = false;
    Input.fast = false;

    updateComboUI(1.0);
    el.coinVal.textContent = '0';
    el.scoreVal.textContent = '00000';
    el.hiVal.textContent = pad5(Save.data.best);
    hudInvalidate();               // 让状态栏缓存失效，下一帧重新写入
  }

  function start() {
    Sfx.ensure();
    resetRun();
    G.state = 'running';
    hideAllOverlays();
  }

  function pause() {
    if (G.state !== 'running') return;
    G.state = 'paused';
    el.pauseScreen.classList.add('show');
  }

  function resume() {
    if (G.state !== 'paused') return;
    Sfx.ensure();
    G.state = 'running';
    hideAllOverlays();
  }

  function gameOver() {
    G.state = 'over';
    var distance = Math.floor(G.score);
    var total = distance + G.coinScore;
    var isRecord = total > Save.data.best;

    if (isRecord) {
      Save.data.best = total;
      Sfx.record();
    }
    Save.data.totalCoins += G.coinCount;
    Save.save();

    G.lastResult = { distance: distance, coins: G.coinCount, coinScore: G.coinScore, total: total, isRecord: isRecord };

    el.finalDistance.textContent = fmt(distance);
    el.finalCoins.textContent = G.coinCount + ' 枚';
    el.finalCoinScore.textContent = fmt(G.coinScore);
    el.finalComboHint.textContent = '（最高连击 ' + G.bestCombo + '，' + G.bestMult.toFixed(1) + '×）';
    el.finalTotal.textContent = fmt(total);
    el.finalBest.textContent = fmt(Save.data.best);
    el.recordBadge.innerHTML = isRecord ? '<span class="badge-record">新纪录</span>' : '';
    el.finalAllCoins.textContent = fmt(Save.data.totalCoins) + ' 枚';
    el.overSub.textContent = isRecord ? '刷新了历史最高分！' : '撞到障碍，游戏结束';

    el.hiVal.textContent = pad5(Save.data.best);
    el.overScreen.classList.add('show');
  }

  function hideAllOverlays() {
    el.startScreen.classList.remove('show');
    el.pauseScreen.classList.remove('show');
    el.overScreen.classList.remove('show');
  }

  // ==================== 更新 ====================
  function update(dt) {
    if (G.state === 'paused') return;

    if (G.state === 'dying') {
      G.dyingT += dt;
      G.shake = Math.max(0, G.shake - dt);
      if (G.dyingT > 0.42) gameOver();
      return;
    }
    if (G.state !== 'running') {
      // 待机时云朵缓慢飘动，画面不死板
      for (var ci = 0; ci < G.clouds.length; ci++) {
        G.clouds[ci].x -= G.clouds[ci].v * 34 * dt;
      }
      G.clouds = G.clouds.filter(function (c) { return c.x > -80; });
      return;
    }

    updateSpeed(dt);
    var travel = G.speed * dt;
    G.distance += travel;
    G.scroll += travel;

    updateDino(dt);

    // 动画帧
    G.animT += dt * (G.speed / 400);
    if (G.animT > 0.1) { G.animT = 0; G.runFrame ^= 1; G.duckFrame ^= 1; }

    // ---- 生成 ----
    G.obsCountdown -= travel;
    if (G.obsCountdown <= 0) spawnObstacle();
    G.coinCountdown -= travel;
    if (G.coinCountdown <= 0) spawnCoinGroup();

    // ---- 云朵 ----
    G.cloudCountdown -= travel;
    if (G.cloudCountdown <= 0) {
      G.clouds.push(makeCloud(W + 60));
      G.cloudCountdown = rand(220, 520);
    }
    for (var i = 0; i < G.clouds.length; i++) {
      G.clouds[i].x -= travel * G.clouds[i].v;
    }
    G.clouds = G.clouds.filter(function (c) { return c.x > -80; });

    // ---- 障碍 ----
    var keepObs = [];
    for (var k = 0; k < G.obs.length; k++) {
      var o = G.obs[k];
      o.x -= travel;
      if (o.type === 'bird') {
        o.animT += dt;
        if (o.animT > 0.16) { o.animT = 0; o.frame ^= 1; }
      }
      if (o.x + o.w > -20) keepObs.push(o);
    }
    G.obs = keepObs;

    // ---- 金币（含"漏掉即断连击"判定）----
    var keepCoins = [];
    for (var m = 0; m < G.coins.length; m++) {
      var c = G.coins[m];
      c.x -= travel;
      c.phase += dt * 5.2;
      c.bob += dt * 3.4;
      if (c.taken) continue;
      if (c.x + COIN_R < DINO_X - 4) {   // 从恐龙身后滑走 = 漏掉
        breakCombo();
        continue;
      }
      if (c.x < -40) continue;
      keepCoins.push(c);
    }
    G.coins = keepCoins;

    // ---- 粒子 ----
    var keepParts = [];
    for (var p = 0; p < G.parts.length; p++) {
      var pt = G.parts[p];
      pt.life -= dt;
      if (pt.life <= 0) continue;
      pt.x += pt.vx * dt - travel * 0.55;
      pt.y += pt.vy * dt;
      pt.vy += 420 * dt;
      keepParts.push(pt);
    }
    G.parts = keepParts;

    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);

    checkCollisions();
  }

  // ==================== 渲染 ====================
  function drawGround() {
    var c = C();
    ctx.fillStyle = c.ground;
    ctx.fillRect(0, GROUND_Y, W, 2);

    ctx.fillStyle = c.dot;
    var off = G.scroll % TILE_W;
    for (var t = -1; t <= 1; t++) {
      var base = t * TILE_W - off;
      for (var i = 0; i < groundDots.length; i++) {
        var d = groundDots[i];
        var x = base + d.x;
        if (x < -6 || x > W + 6) continue;
        ctx.fillRect(Math.round(x), Math.round(d.y), d.w, d.h);
      }
    }
  }

  function drawClouds() {
    var c = C();
    ctx.fillStyle = c.cloud;
    for (var i = 0; i < G.clouds.length; i++) {
      var cl = G.clouds[i];
      var s = cl.s;
      var x = Math.round(cl.x), y = Math.round(cl.y);
      ctx.fillRect(x, y + 4 * s, 34 * s, 6 * s);
      ctx.fillRect(x + 6 * s, y, 16 * s, 5 * s);
      ctx.fillRect(x + 10 * s, y - 4 * s, 9 * s, 5 * s);
    }
  }

  function drawCoins() {
    var c = C();
    for (var i = 0; i < G.coins.length; i++) {
      var coin = G.coins[i];
      if (coin.taken) continue;
      var cx = coin.x;
      var cy = GROUND_Y - coin.h + Math.sin(coin.bob) * 1.6;

      var rx = Math.abs(Math.cos(coin.phase)) * COIN_R;
      rx = Math.max(2.0, rx);

      // 外圈
      ctx.fillStyle = c.gold;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, COIN_R, 0, 0, Math.PI * 2);
      ctx.fill();

      // 内圈高光
      if (rx > 4) {
        ctx.fillStyle = c.goldSoft;
        ctx.beginPath();
        ctx.ellipse(cx - rx * 0.16, cy - 1.2, rx * 0.52, COIN_R * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // 侧边暗线，增强立体
      if (rx > 6.5) {
        ctx.fillStyle = c.goldDeep;
        ctx.fillRect(Math.round(cx + rx - 2.4), Math.round(cy - COIN_R * 0.62), 2, Math.round(COIN_R * 1.24));
      }
    }
  }

  function drawObstacles() {
    for (var i = 0; i < G.obs.length; i++) {
      var o = G.obs[i];
      if (o.type === 'cactus') {
        var sp = S[o.sprite];
        ctx.drawImage(sp.canvas, Math.round(o.x), GROUND_Y - sp.h, sp.w, sp.h);
      } else {
        var bs = o.frame ? S.birdDown : S.birdUp;
        ctx.drawImage(bs.canvas, Math.round(o.x), Math.round(o.top), bs.w, bs.h);
      }
    }
  }

  function drawDino() {
    var d = G.dino;
    var sp;
    if (G.state === 'dying' || G.state === 'over') sp = S.dinoDead;
    else if (d.ducking && d.onGround) sp = G.duckFrame ? S.dinoDuck1 : S.dinoDuck2;
    else if (!d.onGround) sp = S.dinoIdle;
    else sp = G.runFrame ? S.dinoRun1 : S.dinoRun2;

    var top = GROUND_Y - d.h - sp.h;
    ctx.drawImage(sp.canvas, DINO_X, Math.round(top), sp.w, sp.h);
  }

  function drawParticles() {
    for (var i = 0; i < G.parts.length; i++) {
      var p = G.parts[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    var c = C();
    var sx = 0, sy = 0;
    if (G.shake > 0) {
      sx = rand(-3, 3) * (G.shake / 0.32);
      sy = rand(-2, 2) * (G.shake / 0.32);
    }
    ctx.setTransform(RS, 0, 0, RS, sx * RS, sy * RS);
    ctx.fillStyle = c.stage;
    ctx.fillRect(-6, -6, W + 12, H + 12);

    drawClouds();
    drawGround();
    drawCoins();
    drawObstacles();
    drawDino();
    drawParticles();
  }

  // ==================== HUD 绑定 ====================
  var el = {
    scoreVal: document.getElementById('scoreVal'),
    hiVal: document.getElementById('hiVal'),
    coinVal: document.getElementById('coinVal'),
    coinCard: document.getElementById('coinCard'),
    comboChip: document.getElementById('comboChip'),
    comboMult: document.getElementById('comboMult'),
    comboCount: document.getElementById('comboCount'),
    spFill: document.getElementById('spFill'),
    spVal: document.getElementById('spVal'),
    startScreen: document.getElementById('startScreen'),
    pauseScreen: document.getElementById('pauseScreen'),
    overScreen: document.getElementById('overScreen'),
    overSub: document.getElementById('overSub'),
    finalDistance: document.getElementById('finalDistance'),
    finalCoins: document.getElementById('finalCoins'),
    finalCoinScore: document.getElementById('finalCoinScore'),
    finalComboHint: document.getElementById('finalComboHint'),
    finalTotal: document.getElementById('finalTotal'),
    finalBest: document.getElementById('finalBest'),
    recordBadge: document.getElementById('recordBadge'),
    finalAllCoins: document.getElementById('finalAllCoins'),
    btnStart: document.getElementById('btnStart'),
    btnResume: document.getElementById('btnResume'),
    btnRestart: document.getElementById('btnRestart'),
    btnSound: document.getElementById('btnSound'),
    btnTheme: document.getElementById('btnTheme'),
    stage: stageEl,
    touchbar: document.getElementById('touchbar')
  };

  var coinPopTimer = 0;
  function popCoinCard() {
    el.coinCard.classList.add('pop');
    coinPopTimer = 0.11;
  }

  function updateComboUI(mult) {
    el.comboMult.textContent = '×' + mult.toFixed(1);
    el.comboCount.textContent = '连击 ' + G.combo;
    if (mult > 1.0) el.comboChip.classList.add('hot');
    else el.comboChip.classList.remove('hot');
  }

  var hudAcc = 0;
  // 缓存上一次写进 DOM 的值：值没变就完全不碰样式，避免每 60ms 触发样式重算/重绘
  var hudLast = { score: -1, coins: -1, pct: -1, factor: -1, dir: '' };

  function hudInvalidate() {
    if (!hudLast) return;          // 防御：初始化顺序若变化也不要抛错
    hudLast.score = -1;
    hudLast.coins = -1;
    hudLast.pct = -1;
    hudLast.factor = -1;
    hudLast.dir = '';
  }

  function updateHUD(dt) {
    var wasPop = coinPopTimer;
    coinPopTimer = Math.max(0, coinPopTimer - dt);
    if (wasPop > 0 && coinPopTimer === 0) el.coinCard.classList.remove('pop');

    hudAcc += dt;
    if (hudAcc < 0.06) return;
    hudAcc = 0;

    var sc = Math.floor(G.score);
    if (sc !== hudLast.score) {
      el.scoreVal.textContent = pad5(sc);
      hudLast.score = sc;
    }
    if (G.coinCount !== hudLast.coins) {
      el.coinVal.textContent = String(G.coinCount);
      hudLast.coins = G.coinCount;
    }

    var ratio = (G.factor - 1) / (G.factor >= 1 ? (FACTOR_MAX - 1) : (1 - FACTOR_MIN));
    var pct = Math.round(clamp(Math.abs(ratio), 0, 1) * 200) / 2;   // 0.5% 粒度足够且不抖
    var dir = G.factor >= 1 ? 'fast' : 'slow';
    if (pct !== hudLast.pct || dir !== hudLast.dir) {
      el.spFill.style.width = pct.toFixed(1) + '%';
      el.spFill.style.left = dir === 'fast' ? '50%' : (50 - pct).toFixed(1) + '%';
      el.spFill.dataset.dir = dir;                  // 颜色交给 CSS，不再写内联样式
      hudLast.pct = pct;
      hudLast.dir = dir;
    }

    var f = Math.round(G.factor * 100) / 100;
    if (f !== hudLast.factor) {
      el.spVal.textContent = f.toFixed(2) + '×';
      hudLast.factor = f;
    }
  }

  // ==================== 主循环 ====================
  var lastT = 0, acc = 0;
  var STEP = 1 / 120;
  // 单帧最多补足 0.10s 模拟量：既丢掉多余积压，又不会"追帧快进"——起跳瞬间的顿挫
  // 正是追帧造成的（一次卡顿后连补 10 步 = 瞬间推进 83ms 的弧线）。
  var MAX_CATCHUP = 0.10;
  var MAX_STEPS = Math.ceil(MAX_CATCHUP / STEP) + 2;   // 12 + 2，留余量，保证永不截断

  function frame(t) {
    requestAnimationFrame(frame);
    if (!lastT) lastT = t;
    var dt = (t - lastT) / 1000;
    lastT = t;
    if (dt > 0.25) dt = 0.25;      // 切换标签页回来时不要瞬移
    if (dt < 0) dt = 0;

    acc += dt;
    if (acc > MAX_CATCHUP) acc = MAX_CATCHUP;   // 丢弃积压，杜绝追帧快进
    var guard = 0;
    while (acc >= STEP && guard++ < MAX_STEPS) {
      update(STEP);
      acc -= STEP;
    }
    render();
    updateHUD(dt);
  }

  // ==================== 输入绑定 ====================
  var JUMP_KEYS = { 'w': 1, 'W': 1, ' ': 1, 'Spacebar': 1, 'ArrowUp': 1 };
  var DUCK_KEYS = { 's': 1, 'S': 1, 'ArrowDown': 1 };
  var SLOW_KEYS = { 'a': 1, 'A': 1, 'ArrowLeft': 1 };
  var FAST_KEYS = { 'd': 1, 'D': 1, 'ArrowRight': 1 };

  function onKeyDown(e) {
    var k = e.key;
    if (JUMP_KEYS[k] || k === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      if (G.state === 'ready' || G.state === 'over') { start(); return; }
      if (G.state === 'paused') { resume(); return; }
      Input.jumpHeld = true;
      doJump();
      return;
    }
    if (DUCK_KEYS[k]) {
      e.preventDefault();
      Input.duck = true;
      return;
    }
    if (SLOW_KEYS[k]) { e.preventDefault(); Input.slow = true; return; }
    if (FAST_KEYS[k]) { e.preventDefault(); Input.fast = true; return; }
    if (k === 'p' || k === 'P') {
      e.preventDefault();
      if (G.state === 'running') pause();
      else if (G.state === 'paused') resume();
      return;
    }
    if (k === 'm' || k === 'M') {
      e.preventDefault();
      toggleSound();
    }
  }

  function onKeyUp(e) {
    var k = e.key;
    if (JUMP_KEYS[k] || k === ' ') {
      Input.jumpHeld = false;
      releaseJump();
      return;
    }
    if (DUCK_KEYS[k]) { Input.duck = false; return; }
    if (SLOW_KEYS[k]) { Input.slow = false; return; }
    if (FAST_KEYS[k]) { Input.fast = false; return; }
  }

  // 触屏：按钮 + 画布点击跳跃
  function bindTouchButton(node, onDown, onUp) {
    if (!node) return;
    var active = false;
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      active = true;
      node.classList.add('active');
      node.setPointerCapture && node.setPointerCapture(e.pointerId);
      onDown();
    });
    var end = function (e) {
      if (!active) return;
      active = false;
      node.classList.remove('active');
      if (onUp) onUp();
      void e;
    };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    node.addEventListener('lostpointercapture', end);
  }

  function bindTouchbar() {
    if (!el.touchbar) return;
    var map = {
      slow: function () { Input.slow = true; },
      fast: function () { Input.fast = true; },
      duck: function () { Input.duck = true; },
      jump: function () { startIfNeeded(); Input.jumpHeld = true; doJump(); }
    };
    var mapUp = {
      slow: function () { Input.slow = false; },
      fast: function () { Input.fast = false; },
      duck: function () { Input.duck = false; },
      jump: function () { Input.jumpHeld = false; releaseJump(); }
    };
    var btns = el.touchbar.querySelectorAll('.touch-btn');
    for (var i = 0; i < btns.length; i++) {
      var act = btns[i].getAttribute('data-act');
      bindTouchButton(btns[i], map[act], mapUp[act]);
    }
  }

  function startIfNeeded() {
    if (G.state === 'ready' || G.state === 'over') { start(); return true; }
    if (G.state === 'paused') { resume(); return true; }
    return false;
  }

  // 画布点击 = 跳跃（移动端主要操作）
  el.stage.addEventListener('pointerdown', function (e) {
    if (e.target && e.target.closest && e.target.closest('.overlay')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startIfNeeded();
    Input.jumpHeld = true;
    doJump();
  });
  el.stage.addEventListener('pointerup', function () {
    Input.jumpHeld = false;
    releaseJump();
  });
  el.stage.addEventListener('pointercancel', function () {
    Input.jumpHeld = false;
    releaseJump();
  });

  // 触屏长按会触发系统文字选择菜单（Copy / 查询），挡住按键和画面，这里兜底拦掉。
  // 只作用于按键区与画布：页面上的提示文字仍可正常选中复制。
  function blockNativeSelection(node) {
    if (!node) return;
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    node.addEventListener('selectstart', function (e) { e.preventDefault(); });
  }
  blockNativeSelection(el.touchbar);
  blockNativeSelection(el.stage);

  function toggleSound() {
    Sfx.muted = !Sfx.muted;
    Save.data.muted = Sfx.muted;
    Save.save();
    el.btnSound.textContent = Sfx.muted ? '🔇' : '🔊';
  }

  el.btnStart.addEventListener('click', start);
  el.btnRestart.addEventListener('click', start);
  el.btnResume.addEventListener('click', resume);
  el.btnSound.addEventListener('click', toggleSound);
  el.btnTheme.addEventListener('click', function () {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
    el.btnTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
  });

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
  });
  window.addEventListener('blur', function () { pause(); });

  // ==================== 启动 ====================
  Save.load();
  if (Save.data.theme) applyTheme(Save.data.theme);
  else applyTheme(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  el.btnTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
  el.btnSound.textContent = Save.data.muted ? '🔇' : '🔊';

  bindTouchbar();
  resetRun();
  el.startScreen.classList.add('show');
  requestAnimationFrame(frame);

  // 调试/测试用接口
  window.__DINO__ = { G: G, Input: Input, start: start, multFor: multFor, AIR: AIR };
})();