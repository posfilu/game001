/* 场景：主菜单 / 玩法说明 / 对局 / 结算 */
(function (root) {
  var YG = root.YG || (root.YG = {});
  var D = YG.draw;
  var T = YG.THEME;
  var R = YG.ROLE;

  var ROLE_TIPS = {
    lord: ['你的身份公开，反贼会集中攻打你的主城', '打你的人会被标记为「疑反」，据此分辨敌友'],
    loyal: ['千万别攻打主公（主城上有王冠）', '点主公的城池可以「进贡」示好；攻打「疑反」者也能证明忠诚'],
    rebel: ['你不知道谁是同伙——攻打主公的就是自己人', '先扩张积攒兵力，再多路齐攻主公主城；也可以假意进贡来伪装'],
    spy: ['前期向主公进贡装作忠臣，必要时保护主公', '其他人全部阵亡后，再单挑主公']
  };

  var SIDE_TEXT = {
    lord: '主公与忠臣获胜 —— 反贼与内奸已全部伏诛',
    rebel: '反贼获胜 —— 主公的主城已被攻破',
    spy: '内奸获胜 —— 隐忍到最后，独霸狱国'
  };

  // 通用：场景背景（渐变 + 血月 + 鬼门剪影）
  function drawBackdrop(ctx, W, H, t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#24101a');
    g.addColorStop(0.55, '#130a10');
    g.addColorStop(1, '#070405');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var mx = W * 0.5;
    var my = H * 0.2;
    var glow = ctx.createRadialGradient(mx, my, 30, mx, my, 330);
    glow.addColorStop(0, 'rgba(200,40,40,0.45)');
    glow.addColorStop(0.4, 'rgba(140,20,30,0.18)');
    glow.addColorStop(1, 'rgba(140,20,30,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H * 0.6);
    ctx.beginPath();
    ctx.arc(mx, my, 118, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(150,26,30,0.55)';
    ctx.fill();

    // 鬼门关剪影
    var gy = H - 40;
    ctx.fillStyle = '#050304';
    ctx.fillRect(0, gy, W, 40);
    ctx.fillRect(110, gy - 230, 36, 230);
    ctx.fillRect(W - 146, gy - 230, 36, 230);
    ctx.beginPath();
    ctx.moveTo(40, gy - 222);
    ctx.quadraticCurveTo(W / 2, gy - 262, W - 40, gy - 222);
    ctx.lineTo(W - 70, gy - 250);
    ctx.quadraticCurveTo(W / 2, gy - 300, 70, gy - 250);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(130, gy - 196, W - 260, 18);

    // 飘动的鬼火
    for (var i = 0; i < 14; i++) {
      var x = (i * 97 + t * (8 + (i % 5) * 3)) % W;
      var y = H - ((i * 173 + t * (18 + (i % 4) * 7)) % (H * 0.9));
      ctx.fillStyle = 'rgba(120,220,200,' + (0.12 + (i % 3) * 0.06) + ')';
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTitle(ctx, W, y, size) {
    ctx.save();
    ctx.font = D.font(size, 'bold', YG.FONT_TITLE);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(40,6,8,0.9)';
    ctx.strokeText('狱国争霸', W / 2, y);
    var g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, '#fff1c1');
    g.addColorStop(0.5, '#e9c46a');
    g.addColorStop(1, '#b5651d');
    ctx.fillStyle = g;
    ctx.fillText('狱国争霸', W / 2, y);
    ctx.restore();
  }

  // ======================= 主菜单 =======================

  function MenuScene(app) {
    this.app = app;
    this.t = 0;
    this.pressed = null;
    this.build();
  }

  MenuScene.prototype.build = function () {
    var W = this.app.W;
    var H = this.app.H;
    var s = this.app.settings;
    var self = this;
    this.buttons = [];
    var y = Math.max(400, H * 0.36);
    function seg(label, key, values, names, top) {
      var n = values.length;
      var gap = 10;
      var w = (W - 120 - gap * (n - 1)) / n;
      for (var i = 0; i < n; i++) {
        self.buttons.push({
          x: 60 + i * (w + gap), y: top, w: w, h: 56, label: names[i], style: 'seg',
          active: s[key] === values[i], size: 22,
          act: (function (v) { return function () { s[key] = v; self.app.saveSettings(); self.build(); }; })(values[i])
        });
      }
      self.labels.push({ text: label, y: top - 22 });
    }
    this.labels = [];
    seg('人数', 'players', [5, 6, 8], ['5 人', '6 人', '8 人'], y);
    seg('身份', 'role', ['random', 'lord', 'loyal', 'rebel', 'spy'], ['随机', '主公', '忠臣', '反贼', '内奸'], y + 104);
    seg('难度', 'difficulty', ['easy', 'normal', 'hard'], ['简单', '普通', '困难'], y + 208);
    this.buttons.push({
      x: W / 2 - 200, y: y + 300, w: 400, h: 84, label: '开 始 游 戏', style: 'primary', size: 32,
      act: function () { self.app.startGame(); }
    });
    this.buttons.push({
      x: W / 2 - 200, y: y + 400, w: 400, h: 62, label: '玩法说明', size: 24,
      act: function () { self.app.setScene(new HelpScene(self.app)); }
    });
  };

  MenuScene.prototype.update = function (dt) {
    this.t += dt;
  };

  MenuScene.prototype.draw = function (ctx) {
    var W = this.app.W;
    var H = this.app.H;
    drawBackdrop(ctx, W, H, this.t);
    var ty = Math.max(170, H * 0.17);
    drawTitle(ctx, W, ty, 108);
    D.text(ctx, '十殿阎王 · 身份局攻城', W / 2, ty + 88, 24, T.text, 'center');
    D.text(ctx, '主公 · 忠臣 · 反贼 · 内奸', W / 2, ty + 124, 18, T.dim, 'center');
    for (var i = 0; i < this.labels.length; i++) {
      D.text(ctx, this.labels[i].text, 60, this.labels[i].y, 18, T.gold, 'left', 'bold');
    }
    for (var k = 0; k < this.buttons.length; k++) {
      this.buttons[k].pressed = this.pressed === this.buttons[k];
      D.button(ctx, this.buttons[k]);
    }
    var rec = this.app.record;
    var yRec = this.buttons[this.buttons.length - 1].y + 100;
    D.text(ctx, '战绩  ' + rec.wins + ' 胜 ' + (rec.games - rec.wins) + ' 负', W / 2, yRec, 18, T.dim, 'center');
  };

  MenuScene.prototype.onDown = function (x, y) {
    this.pressed = null;
    for (var i = 0; i < this.buttons.length; i++) if (D.hit(this.buttons[i], x, y)) this.pressed = this.buttons[i];
  };
  MenuScene.prototype.onMove = function () {};
  MenuScene.prototype.onUp = function (x, y) {
    var b = this.pressed;
    this.pressed = null;
    if (b && D.hit(b, x, y)) b.act();
  };

  // ======================= 玩法说明 =======================

  var HELP = [
    ['身份', '主公：身份公开，消灭所有反贼和内奸。\n忠臣：保护主公，消灭所有反贼和内奸。\n反贼：攻破主公的主城即可获胜。\n内奸：先除掉其他所有人，最后单挑主公。\n除主公外身份隐藏，阵亡时亮明身份。攻打主公会被标为「疑反」，攻打疑反者会被标为「疑忠」。'],
    ['操作', '按住己方城池拖到目标城池出兵，途经的己方城池会一起出兵；也可以先点己方城池，再点目标。点击己方城池可以升级；点击主公的城池可以「进贡」示好（送兵入城，名声变为疑忠）。点击锦囊使用，右下角切换出兵比例。'],
    ['城池', '都·主城：产兵快、城防高，被攻破即阵亡；开局免战 60 秒。\n戟·兵营：训练重戟兵，攻击力 ×1.5。\n骑·马场：训练骑兵，行军速度 ×1.7。\n塔·箭塔：自动射杀射程内的敌兵，城防 ×1.5。'],
    ['奖惩', '击杀反贼：摸 2 张锦囊。主公误杀忠臣：弃置全部锦囊，全军兵力减半。阵亡者的其他城池沦为中立。拖到 6 分钟后阴兵暴动，城防逐渐崩坏。']
  ];

  function HelpScene(app) {
    this.app = app;
    this.t = 0;
    this.back = { x: app.W / 2 - 150, y: app.H - 110, w: 300, h: 66, label: '返回', style: 'primary', act: function () { app.setScene(new MenuScene(app)); } };
  }
  HelpScene.prototype.update = function (dt) {
    this.t += dt;
  };
  HelpScene.prototype.draw = function (ctx) {
    var W = this.app.W;
    var H = this.app.H;
    drawBackdrop(ctx, W, H, this.t);
    ctx.fillStyle = 'rgba(10,5,8,0.72)';
    ctx.fillRect(0, 0, W, H);
    D.text(ctx, '玩法说明', W / 2, 70, 40, T.gold, 'center', 'bold', YG.FONT_TITLE);
    var y = 130;
    var size = H < 1200 ? 18 : 20;
    for (var i = 0; i < HELP.length; i++) {
      D.text(ctx, '【' + HELP[i][0] + '】', 40, y, size + 2, T.gold, 'left', 'bold');
      y += size + 16;
      y += D.paragraph(ctx, HELP[i][1], 48, y, W - 96, size, T.text, size + 12) + 14;
    }
    this.back.pressed = this.pressed;
    D.button(ctx, this.back);
  };
  HelpScene.prototype.onDown = function (x, y) {
    this.pressed = D.hit(this.back, x, y);
  };
  HelpScene.prototype.onMove = function () {};
  HelpScene.prototype.onUp = function (x, y) {
    if (this.pressed && D.hit(this.back, x, y)) this.back.act();
    this.pressed = false;
  };

  // ======================= 对局 =======================

  var STEP = 1 / 60;
  var RATIOS = [0.5, 0.75, 1, 0.25];

  function GameScene(app, opts) {
    this.app = app;
    this.opts = opts;
    var W = app.W;
    var H = app.H;
    this.TOP = 168;
    this.BOTTOM = 252;
    var n = opts.players;
    var seat = Math.floor(Math.random() * n);
    this.world = new YG.World({
      numPlayers: n,
      humanSeat: seat,
      humanRole: opts.role === 'random' ? null : opts.role,
      difficulty: opts.difficulty,
      seed: opts.seed,
      rect: { x: 8, y: this.TOP + 10, w: W - 16, h: H - this.TOP - this.BOTTOM - 20 }
    });
    this.human = seat;
    this.me = this.world.players[seat];
    var w = this.world;
    this.ais = w.players.filter(function (p) { return !p.isHuman; }).map(function (p) { return new YG.AI(w, p.id); });
    this.view = new YG.WorldView(w, seat, app.platform);

    this.t = 0;
    this.acc = 0;
    this.speed = 1;
    this.ratioIdx = 0;
    this.overlay = 'reveal';
    this.deadShown = false;
    this.overTimer = -1;
    this.toasts = [];
    this.banners = [];
    this.drag = null;
    this.selected = null;
    this.cardMode = -1;
    this.pressed = null;
    this.layout();
  }

  GameScene.prototype.layout = function () {
    var H = this.app.H;
    var y0 = H - this.BOTTOM;
    this.y0 = y0;
    this.cardRects = [];
    for (var i = 0; i < YG.HAND_MAX_REWARD; i++) this.cardRects.push({ x: 16 + i * 106, y: y0 + 72, w: 96, h: 132 });
    var self = this;
    this.ratioBtn = { x: 450, y: y0 + 72, w: 254, h: 64, size: 24, act: function () { self.ratioIdx = (self.ratioIdx + 1) % RATIOS.length; } };
    this.pauseBtn = { x: 450, y: y0 + 144, w: 122, h: 60, label: '暂停', size: 22, act: function () { self.overlay = 'pause'; } };
    this.speedBtn = { x: 582, y: y0 + 144, w: 122, h: 60, size: 22, act: function () { self.cycleSpeed(); } };
  };

  GameScene.prototype.cycleSpeed = function () {
    var opts = this.me.alive ? [1, 2] : [1, 2, 4];
    var i = opts.indexOf(this.speed);
    this.speed = opts[(i + 1) % opts.length];
  };

  GameScene.prototype.ratio = function () {
    return RATIOS[this.ratioIdx];
  };

  // ---------- 更新 ----------

  GameScene.prototype.update = function (dt) {
    this.t += dt;
    var w = this.world;
    var self = this;
    if (!this.overlay) {
      this.acc += dt * this.speed;
      var steps = 0;
      while (this.acc >= STEP && steps < 12) {
        this.acc -= STEP;
        steps++;
        for (var i = 0; i < this.ais.length; i++) this.ais[i].update(STEP);
        w.step(STEP);
      }
      if (steps >= 12) this.acc = 0;
    }
    this.view.consume(function (n) { self.notice(n); });
    this.view.update(this.overlay ? 0 : dt * this.speed);

    // 选中的城池易主后取消选中
    if (this.selected != null && this.world.cities[this.selected].owner !== this.human && this.selectedOwn) this.selected = null;
    if (this.cardMode >= 0 && !this.me.hand[this.cardMode]) this.cardMode = -1;

    for (var k = this.toasts.length - 1; k >= 0; k--) {
      this.toasts[k].t += dt;
      if (this.toasts[k].t > 2.8) this.toasts.splice(k, 1);
    }
    if (this.banners.length) {
      this.banners[0].t += dt;
      if (this.banners[0].t > 2.8) this.banners.shift();
    }

    if (!this.me.alive && !this.deadShown && !w.winner) {
      this.deadShown = true;
      this.drag = null;
      this.cardMode = -1;
      this.overlay = 'dead';
    }
    if (w.winner) {
      if (this.overTimer < 0) this.overTimer = 2.2;
      this.overTimer -= dt;
      if (this.overTimer <= 0) this.app.finishGame(this);
    }
  };

  GameScene.prototype.notice = function (n) {
    var w = this.world;
    if (n.kind === 'toast') {
      this.toasts.push({ text: n.text, color: n.color, t: 0 });
      if (this.toasts.length > 3) this.toasts.shift();
    } else if (n.kind === 'banner') {
      this.banners.push({ title: n.title, color: n.color, t: 0 });
    } else if (n.kind === 'eliminate') {
      if (n.victim === this.human) return; // 自己阵亡由阵亡面板展示
      var v = w.players[n.victim];
      var k = w.players[n.killer];
      this.banners.push({
        title: (n.victim === this.human ? '你' : v.name) + ' 阵亡',
        role: n.role,
        sub: '主城被 ' + (n.killer === this.human ? '你' : k.name) + ' 攻破' + (n.reward ? '\n' + (n.killer === this.human ? '你' : k.name) + (n.reward.indexOf('主公') === 0 ? '：' : ' ') + n.reward : ''),
        color: YG.ROLE_COLOR[n.role],
        t: 0
      });
    }
  };

  // ---------- 输入 ----------

  GameScene.prototype.hitButton = function (x, y) {
    var list = this.overlayButtons || [];
    if (this.overlay) {
      for (var i = 0; i < list.length; i++) if (D.hit(list[i], x, y)) return list[i];
      return null;
    }
    if (this.popupBtn && D.hit(this.popupBtn, x, y)) return this.popupBtn;
    var btns = [this.ratioBtn, this.pauseBtn, this.speedBtn];
    for (var k = 0; k < btns.length; k++) if (D.hit(btns[k], x, y)) return btns[k];
    for (var c = 0; c < this.me.hand.length; c++) {
      if (D.hit(this.cardRects[c], x, y)) return { card: c };
    }
    return null;
  };

  GameScene.prototype.onDown = function (x, y) {
    this.pointer = { x: x, y: y };
    var b = this.hitButton(x, y);
    if (b || this.overlay) {
      this.pressed = b;
      return;
    }
    if (!this.me.alive || this.world.winner) return;
    var c = this.view.hitCity(x, y);
    if (this.cardMode >= 0) {
      this.pendingCardCity = c;
      return;
    }
    if (c && c.owner === this.human) {
      this.drag = { start: c, sel: [c.id], sx: x, sy: y, moved: false };
    } else {
      this.tapCity = c || 'none';
    }
  };

  GameScene.prototype.onMove = function (x, y) {
    this.pointer = { x: x, y: y };
    if (!this.drag) return;
    if (!this.drag.moved && YG.dist(x, y, this.drag.sx, this.drag.sy) > 12) this.drag.moved = true;
    if (!this.drag.moved) return;
    var c = this.view.hitCity(x, y, 10);
    this.drag.hover = c ? c.id : null;
    // 划过的己方城池一起出兵
    if (c && c.owner === this.human && this.drag.sel.indexOf(c.id) < 0) {
      var nearTarget = YG.dist(x, y, c.x, c.y) < this.view.cityRadius(c);
      if (nearTarget) this.drag.sel.push(c.id);
    }
  };

  GameScene.prototype.onUp = function (x, y) {
    var w = this.world;
    var b = this.pressed;
    this.pressed = null;
    if (b) {
      if (b.card != null) {
        if (this.hitButton(x, y) && this.hitButton(x, y).card === b.card) this.useCard(b.card);
      } else if (D.hit(b, x, y) && !b.disabled) {
        b.act();
      }
      return;
    }
    if (this.overlay || !this.me.alive || w.winner) return;

    if (this.cardMode >= 0) {
      var cc = this.view.hitCity(x, y);
      if (cc && cc === this.pendingCardCity && w.canTarget(this.human, this.me.hand[this.cardMode], cc.id)) {
        w.playCard(this.human, this.cardMode, cc.id);
        this.cardMode = -1;
      }
      this.pendingCardCity = null;
      return;
    }

    if (this.drag) {
      var d = this.drag;
      this.drag = null;
      if (!d.moved) {
        // 点击：已选中己方城池时，再点另一座己方城池 → 调兵；否则切换选中
        if (this.selected != null && this.selectedOwn && this.selected !== d.start.id) {
          w.dispatch(this.human, [this.selected], d.start.id, this.ratio());
          this.selected = null;
        } else {
          this.select(this.selected === d.start.id ? null : d.start.id);
        }
        return;
      }
      var target = this.view.hitCity(x, y, 10);
      if (!target) return;
      var sources = d.sel.filter(function (id) { return id !== target.id; });
      if (sources.length) w.dispatch(this.human, sources, target.id, this.ratio());
      this.selected = null;
      return;
    }

    if (this.tapCity) {
      var tc = this.tapCity;
      this.tapCity = null;
      if (tc === 'none') {
        this.select(null);
      } else if (this.selected != null && this.selectedOwn) {
        // 先点己方城池，再点目标 → 出兵
        w.dispatch(this.human, [this.selected], tc.id, this.ratio());
        this.selected = null;
      } else {
        this.select(this.selected === tc.id ? null : tc.id);
      }
    }
  };

  GameScene.prototype.select = function (id) {
    this.selected = id;
    this.selectedOwn = id != null && this.world.cities[id].owner === this.human;
  };

  GameScene.prototype.useCard = function (idx) {
    var cardId = this.me.hand[idx];
    if (!cardId) return;
    if (this.cardMode === idx) {
      this.cardMode = -1;
      return;
    }
    if (YG.CARDS[cardId].target === 'none') {
      this.world.playCard(this.human, idx, -1);
      this.cardMode = -1;
    } else {
      this.cardMode = idx;
      this.selected = null;
    }
  };

  // ---------- 绘制 ----------

  GameScene.prototype.draw = function (ctx) {
    var W = this.app.W;
    var H = this.app.H;
    var w = this.world;
    var self = this;
    var ui = {
      selected: this.selected,
      dragSel: this.drag && this.drag.moved ? this.drag.sel : null,
      hover: this.drag ? this.drag.hover : null,
      pointer: this.pointer,
      cardTarget: this.cardMode >= 0 ? function (c) { return w.canTarget(self.human, self.me.hand[self.cardMode], c.id); } : null
    };
    this.view.draw(ctx, W, H, this.app.pixelScale, this.t, ui);

    this.drawDragCount(ctx);
    this.drawPopup(ctx);
    this.drawTop(ctx);
    this.drawBottom(ctx);
    this.drawToasts(ctx);
    if (!this.overlay) this.drawBanner(ctx);
    this.overlayButtons = [];
    if (this.overlay === 'reveal') this.drawReveal(ctx);
    else if (this.overlay === 'pause') this.drawPause(ctx);
    else if (this.overlay === 'dead') this.drawDead(ctx);
    if (w.winner && this.overTimer >= 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.5 * (1 - this.overTimer / 2.2)).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  };

  GameScene.prototype.drawDragCount = function (ctx) {
    if (!this.drag || !this.drag.moved || !this.pointer) return;
    var w = this.world;
    var n = 0;
    var r = this.ratio();
    var hover = this.drag.hover;
    for (var i = 0; i < this.drag.sel.length; i++) {
      if (this.drag.sel[i] === hover) continue;
      n += Math.floor(w.cities[this.drag.sel[i]].troops * r);
    }
    var x = this.pointer.x;
    var y = this.pointer.y - 56;
    D.panel(ctx, x - 40, y - 18, 80, 36, 18, 'rgba(0,0,0,0.7)', this.me.color, 2);
    D.text(ctx, '⚔ ' + n, x, y + 1, 18, '#fff', 'center', 'bold');
  };

  GameScene.prototype.drawPopup = function (ctx) {
    this.popupBtn = null;
    if (this.selected == null || this.overlay) return;
    var w = this.world;
    var c = w.cities[this.selected];
    var kind = YG.CITY_KIND[c.kind];
    var own = c.owner === this.human;
    var canTribute = !own && c.owner === w.lordId && this.human !== w.lordId && this.me.alive;
    var pw = 280;
    var ph = own || canTribute ? 150 : 104;
    var r = this.view.cityRadius(c);
    var x = YG.clamp(c.x - pw / 2, 10, this.app.W - pw - 10);
    var y = c.y - r - ph - 34;
    if (y < this.TOP + 4) y = c.y + r + 34;
    D.panel(ctx, x, y, pw, ph, 14, 'rgba(20,11,16,0.95)', T.panelEdge, 1.5);
    var ownerName = c.owner < 0 ? '中立' : c.owner === this.human ? '你' : w.players[c.owner].name;
    D.text(ctx, c.name + ' · ' + kind.name + ' Lv' + c.level, x + 14, y + 22, 17, T.gold, 'left', 'bold');
    D.text(ctx, ownerName + '  兵 ' + Math.floor(c.troops) + '/' + w.cityCap(c) + '  产 ' + w.cityProd(c).toFixed(1) + '/秒', x + 14, y + 48, 14, T.text);
    D.text(ctx, kind.desc, x + 14, y + 72, 12, T.dim);
    if (own) {
      if (c.level < YG.MAX_LEVEL) {
        var cost = w.upgradeCost(c);
        var self = this;
        this.popupBtn = {
          x: x + 14, y: y + 92, w: 150, h: 46, size: 17, style: 'primary',
          label: '升级 -' + cost + '兵', disabled: c.troops < cost + 1,
          act: function () { w.upgrade(self.human, c.id); }
        };
        this.popupBtn.pressed = this.pressed === this.popupBtn;
        D.button(ctx, this.popupBtn);
      } else {
        D.text(ctx, '已满级', x + 20, y + 115, 16, T.dim, 'left', 'bold');
      }
      D.text(ctx, '再点目标出兵', x + pw - 14, y + 115, 13, T.dim, 'right');
    } else if (canTribute) {
      var src = this.nearestOwn(c);
      var self2 = this;
      this.popupBtn = {
        x: x + 14, y: y + 92, w: 150, h: 46, size: 17,
        label: '进贡示好', disabled: !src || src.troops < 2,
        act: function () {
          var from = self2.nearestOwn(c);
          if (from) w.tribute(self2.human, from.id, c.id, self2.ratio());
          self2.select(null);
        }
      };
      this.popupBtn.pressed = this.pressed === this.popupBtn;
      D.button(ctx, this.popupBtn);
      D.text(ctx, '送兵入城 → 疑忠', x + pw - 14, y + 115, 13, T.dim, 'right');
    }
  };

  GameScene.prototype.nearestOwn = function (c) {
    var best = null;
    var bestD = Infinity;
    var cities = this.world.cities;
    for (var i = 0; i < cities.length; i++) {
      if (cities[i].owner !== this.human) continue;
      var d = YG.dist(cities[i].x, cities[i].y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = cities[i];
      }
    }
    return best;
  };

  GameScene.prototype.roleTag = function (p) {
    var w = this.world;
    if (p.role === R.LORD || !p.alive || p.id === this.human || w.winner) {
      return { text: YG.ROLE_NAME[p.role], color: YG.ROLE_COLOR[p.role], solid: true };
    }
    var tag = w.repTag(p.id);
    if (tag === '疑反') return { text: '疑反', color: '#ff8a80' };
    if (tag === '疑忠') return { text: '疑忠', color: '#8fd3ff' };
    return { text: '身份?', color: '#8b8189' };
  };

  GameScene.prototype.drawTop = function (ctx) {
    var W = this.app.W;
    var w = this.world;
    ctx.fillStyle = T.panel;
    ctx.fillRect(0, 0, W, this.TOP);
    ctx.fillStyle = T.panelEdge;
    ctx.fillRect(0, this.TOP - 1, W, 1);
    var n = w.players.length;
    var cols = n <= 6 ? 3 : 4;
    var gap = 8;
    var cw = (W - 24 - gap * (cols - 1)) / cols;
    var ch = 68;
    for (var i = 0; i < n; i++) {
      var p = w.players[i];
      var x = 12 + (i % cols) * (cw + gap);
      var y = 12 + Math.floor(i / cols) * (ch + gap);
      var mine = p.id === this.human;
      D.panel(ctx, x, y, cw, ch, 12, mine ? 'rgba(233,196,106,0.12)' : 'rgba(255,255,255,0.04)', mine ? T.gold : 'rgba(255,255,255,0.1)', mine ? 2 : 1);
      // 头像
      ctx.beginPath();
      ctx.arc(x + 28, y + ch / 2, 20, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      D.text(ctx, mine ? '你' : p.title.charAt(0), x + 28, y + ch / 2 + 1, 18, '#fff', 'center', 'bold');
      if (p.role === R.LORD) this.view.drawCrown(ctx, x + 28, y + 9);

      var name = mine ? '你' : p.name;
      D.text(ctx, name, x + 56, y + 22, cols === 4 ? 15 : 17, T.text, 'left', 'bold');
      var tag = this.roleTag(p);
      var tw = tag.text.length * 13 + 12;
      var tx = x + cw - tw - 8;
      D.panel(ctx, tx, y + 11, tw, 22, 11, tag.solid ? YG.alpha(tag.color, 0.9) : 'rgba(0,0,0,0.3)', tag.solid ? null : tag.color, 1);
      D.text(ctx, tag.text, tx + tw / 2, y + 22.5, 13, tag.solid ? '#1b0f0b' : tag.color, 'center', 'bold');
      var pow = w.power(p.id);
      D.text(ctx, '城' + pow.cities + '  兵' + Math.floor(pow.troops), x + 56, y + 49, 14, T.dim);
      if (p.alive && w.players[p.id].hand.length && !mine) {
        D.text(ctx, '牌' + p.hand.length, x + cw - 10, y + 49, 13, 'rgba(233,196,106,0.7)', 'right');
      }
      if (!p.alive) {
        D.panel(ctx, x, y, cw, ch, 12, 'rgba(0,0,0,0.55)');
        ctx.save();
        ctx.translate(x + cw - 34, y + 46);
        ctx.rotate(-0.25);
        D.panel(ctx, -26, -13, 52, 26, 4, null, '#e5484d', 2);
        D.text(ctx, '阵亡', 0, 1, 15, '#e5484d', 'center', 'bold');
        ctx.restore();
      }
    }
  };

  GameScene.prototype.drawBottom = function (ctx) {
    var W = this.app.W;
    var H = this.app.H;
    var w = this.world;
    var y0 = this.y0;
    var me = this.me;
    ctx.fillStyle = T.panel;
    ctx.fillRect(0, y0, W, H - y0);
    ctx.fillStyle = T.panelEdge;
    ctx.fillRect(0, y0, W, 1);

    // 身份
    D.panel(ctx, 16, y0 + 12, 92, 46, 10, YG.alpha(YG.ROLE_COLOR[me.role], 0.9));
    D.text(ctx, YG.ROLE_NAME[me.role], 62, y0 + 36, 24, '#1b0f0b', 'center', 'bold');
    D.text(ctx, YG.ROLE_GOAL[me.role], 122, y0 + 24, 17, T.text, 'left', 'bold');
    var seen;
    if (me.role === R.LORD) seen = '你的身份公开';
    else {
      var tag = w.repTag(me.id);
      seen = '他人眼中：' + (tag || '身份未明');
    }
    D.text(ctx, seen, 122, y0 + 48, 14, me.rep <= -YG.REP_TAG ? '#ff8a80' : me.rep >= YG.REP_TAG ? '#8fd3ff' : T.dim);
    D.text(ctx, YG.formatTime(w.t), W - 16, y0 + 30, 24, T.gold, 'right', 'bold');
    if (w.surgeIdx > 0) D.text(ctx, '产兵×' + w.prodMult + (w.defMult < 1 ? ' 城防×' + w.defMult : ''), W - 16, y0 + 52, 12, '#ff8a65', 'right');

    // 锦囊
    for (var i = 0; i < YG.HAND_MAX_REWARD; i++) {
      var r = this.cardRects[i];
      var id = me.hand[i];
      if (!id) {
        if (i < YG.HAND_MAX) {
          ctx.save();
          D.dash(ctx, [6, 6]);
          D.panel(ctx, r.x, r.y, r.w, r.h, 10, null, 'rgba(233,196,106,0.25)', 1.5);
          ctx.restore();
          D.text(ctx, '锦囊', r.x + r.w / 2, r.y + r.h / 2, 16, 'rgba(233,196,106,0.25)', 'center');
        }
        continue;
      }
      this.drawCard(ctx, id, r, this.cardMode === i, this.pressed && this.pressed.card === i);
    }
    // 摸牌进度
    var barW = 96 * 4 + 30;
    var by = y0 + 220;
    D.panel(ctx, 16, by, barW, 8, 4, 'rgba(255,255,255,0.08)');
    if (me.alive) {
      var full = me.hand.length >= YG.HAND_MAX;
      var prog = full ? 1 : 1 - me.cardT / YG.CARD_INTERVAL;
      D.panel(ctx, 16, by, Math.max(8, barW * prog), 8, 4, full ? 'rgba(233,196,106,0.35)' : T.gold);
      D.text(ctx, full ? '锦囊已满，快用掉吧' : '下一张锦囊 ' + Math.ceil(me.cardT) + ' 秒', 16, by + 20, 12, T.dim);
    }

    this.ratioBtn.label = '出兵 ' + Math.round(this.ratio() * 100) + '%';
    this.ratioBtn.sub = '点击切换比例';
    this.speedBtn.label = '倍速 ×' + this.speed;
    var btns = [this.ratioBtn, this.pauseBtn, this.speedBtn];
    for (var k = 0; k < btns.length; k++) {
      btns[k].pressed = this.pressed === btns[k];
      D.button(ctx, btns[k]);
    }

  };

  GameScene.prototype.drawCardHint = function (ctx) {
    if (this.cardMode < 0) return 0;
    var W = this.app.W;
    var cid = this.me.hand[this.cardMode];
    var hint = YG.CARDS[cid].target === 'own' ? '点选一座己方城池' : '点选一座他方城池';
    var y = this.TOP + 12;
    D.panel(ctx, W / 2 - 200, y, 400, 44, 22, 'rgba(0,0,0,0.8)', T.gold, 1.5);
    D.text(ctx, '【' + YG.CARDS[cid].name + '】' + hint + ' · 再点卡牌取消', W / 2, y + 22, 16, '#ffe7a3', 'center', 'bold');
    return 52;
  };

  GameScene.prototype.drawCard = function (ctx, id, r, active, pressed) {
    var def = YG.CARDS[id];
    var y = r.y - (active ? 12 : 0) + (pressed ? 2 : 0);
    var g = ctx.createLinearGradient(0, y, 0, y + r.h);
    g.addColorStop(0, '#f3e4c0');
    g.addColorStop(1, '#d2b27a');
    D.panel(ctx, r.x, y, r.w, r.h, 10, g, active ? '#ffdd66' : '#6b3f1f', active ? 3 : 2);
    D.panel(ctx, r.x + 5, y + 5, r.w - 10, r.h - 10, 7, null, 'rgba(107,63,31,0.35)', 1);
    var title = def.name;
    D.text(ctx, title, r.x + r.w / 2, y + 26, title.length > 3 ? 19 : 22, '#8b1a1a', 'center', 'bold', YG.FONT_TITLE);
    var lines = D.wrap(ctx, def.desc, r.w - 16, 12);
    for (var i = 0; i < lines.length && i < 5; i++) D.text(ctx, lines[i], r.x + r.w / 2, y + 54 + i * 17, 12, '#4a2e1c', 'center');
  };

  GameScene.prototype.drawToasts = function (ctx) {
    var W = this.app.W;
    var offset = this.drawCardHint(ctx);
    for (var i = 0; i < this.toasts.length; i++) {
      var t = this.toasts[i];
      var a = t.t < 0.2 ? t.t / 0.2 : t.t > 2.4 ? (2.8 - t.t) / 0.4 : 1;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = D.font(15, 'bold');
      var tw = ctx.measureText(t.text).width + 36;
      var y = this.TOP + 14 + offset + i * 40;
      D.panel(ctx, W / 2 - tw / 2, y, tw, 32, 16, 'rgba(0,0,0,0.7)', t.color, 1.5);
      D.text(ctx, t.text, W / 2, y + 16.5, 15, T.text, 'center', 'bold');
      ctx.globalAlpha = 1;
    }
  };

  GameScene.prototype.drawBanner = function (ctx) {
    var b = this.banners[0];
    if (!b) return;
    var W = this.app.W;
    var cy = this.TOP + (this.y0 - this.TOP) * 0.42;
    var a = b.t < 0.25 ? b.t / 0.25 : b.t > 2.4 ? (2.8 - b.t) / 0.4 : 1;
    var s = 0.9 + 0.1 * Math.min(1, b.t / 0.25);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.translate(W / 2, cy);
    ctx.scale(s, s);
    var h = b.role ? 176 : 84;
    D.panel(ctx, -290, -h / 2, 580, h, 18, 'rgba(12,6,9,0.9)', b.color, 2.5);
    if (b.role) {
      D.text(ctx, b.title, 0, -h / 2 + 34, 28, T.text, 'center', 'bold');
      D.text(ctx, '身份：【' + YG.ROLE_NAME[b.role] + '】', 0, -h / 2 + 84, 36, b.color, 'center', 'bold', YG.FONT_TITLE);
      var lines = b.sub.split('\n');
      for (var i = 0; i < lines.length; i++) D.text(ctx, lines[i], 0, -h / 2 + 126 + i * 24, 16, T.dim, 'center');
    } else {
      D.text(ctx, b.title, 0, 2, 28, b.color, 'center', 'bold');
    }
    ctx.restore();
  };

  GameScene.prototype.dim = function (ctx, a) {
    ctx.fillStyle = 'rgba(5,2,4,' + (a || 0.72) + ')';
    ctx.fillRect(0, 0, this.app.W, this.app.H);
  };

  GameScene.prototype.addOverlayButton = function (ctx, b) {
    b.pressed = this.pressed === b || (this.pressed && this.pressed.label === b.label);
    D.button(ctx, b);
    this.overlayButtons.push(b);
  };

  GameScene.prototype.drawReveal = function (ctx) {
    var W = this.app.W;
    var H = this.app.H;
    var me = this.me;
    var self = this;
    this.dim(ctx, 0.78);
    var pw = 520;
    var ph = 620;
    var x = (W - pw) / 2;
    var y = (H - ph) / 2;
    D.panel(ctx, x, y, pw, ph, 22, 'rgba(24,12,18,0.97)', T.gold, 2);
    D.text(ctx, '你 的 身 份', W / 2, y + 46, 22, T.dim, 'center', 'bold');
    var col = YG.ROLE_COLOR[me.role];
    var cy = y + 170;
    ctx.beginPath();
    ctx.arc(W / 2, cy, 86 + Math.sin(this.t * 3) * 3, 0, Math.PI * 2);
    ctx.fillStyle = YG.alpha(col, 0.18);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = col;
    ctx.stroke();
    D.text(ctx, YG.ROLE_NAME[me.role], W / 2, cy + 4, 72, col, 'center', 'bold', YG.FONT_TITLE);
    D.text(ctx, YG.ROLE_GOAL[me.role], W / 2, y + 300, 22, T.text, 'center', 'bold');
    var tips = ROLE_TIPS[me.role].concat(['按住己方城池拖到目标出兵，主城开局免战 60 秒']);
    var ty = y + 350;
    for (var i = 0; i < tips.length; i++) {
      ty += D.paragraph(ctx, '· ' + tips[i], x + 40, ty, pw - 80, 17, T.dim, 26) + 8;
    }
    var lordName = this.world.players[this.world.lordId];
    if (me.role !== R.LORD) D.text(ctx, '本局主公：' + lordName.name, W / 2, y + ph - 122, 18, YG.ROLE_COLOR.lord, 'center', 'bold');
    this.addOverlayButton(ctx, {
      x: W / 2 - 150, y: y + ph - 94, w: 300, h: 70, label: '开 战', style: 'primary', size: 30,
      act: function () { self.overlay = null; }
    });
  };

  GameScene.prototype.drawPause = function (ctx) {
    var W = this.app.W;
    var H = this.app.H;
    var self = this;
    this.dim(ctx);
    D.text(ctx, '暂停', W / 2, H / 2 - 170, 44, T.gold, 'center', 'bold', YG.FONT_TITLE);
    this.addOverlayButton(ctx, { x: W / 2 - 170, y: H / 2 - 100, w: 340, h: 72, label: '继续', style: 'primary', act: function () { self.overlay = null; } });
    this.addOverlayButton(ctx, { x: W / 2 - 170, y: H / 2, w: 340, h: 66, label: '重新开始', act: function () { self.app.startGame(); } });
    this.addOverlayButton(ctx, { x: W / 2 - 170, y: H / 2 + 86, w: 340, h: 66, label: '返回主页', act: function () { self.app.setScene(new MenuScene(self.app)); } });
  };

  GameScene.prototype.drawDead = function (ctx) {
    var W = this.app.W;
    var H = this.app.H;
    var self = this;
    this.dim(ctx, 0.6);
    var me = this.me;
    var killer = this.world.players[me.killer];
    D.panel(ctx, W / 2 - 250, H / 2 - 240, 500, 410, 22, 'rgba(24,12,18,0.97)', '#e5484d', 2);
    D.text(ctx, '你 已 阵 亡', W / 2, H / 2 - 180, 48, '#e5484d', 'center', 'bold', YG.FONT_TITLE);
    D.text(ctx, '主城被 ' + (killer ? killer.name : '敌军') + ' 攻破 · 你的身份：' + YG.ROLE_NAME[me.role], W / 2, H / 2 - 120, 19, YG.ROLE_COLOR[me.role], 'center', 'bold');
    D.text(ctx, '阵亡不等于失败：胜负按阵营结算', W / 2, H / 2 - 84, 17, T.dim, 'center');
    this.addOverlayButton(ctx, { x: W / 2 - 170, y: H / 2 - 30, w: 340, h: 72, label: '继续观战', style: 'primary', act: function () { self.overlay = null; self.speed = 2; } });
    this.addOverlayButton(ctx, { x: W / 2 - 170, y: H / 2 + 60, w: 340, h: 66, label: '返回主页', act: function () { self.app.setScene(new MenuScene(self.app)); } });
  };

  // ======================= 结算 =======================

  function ResultScene(app, game) {
    this.app = app;
    this.game = game;
    this.t = 0;
    var w = game.world;
    this.win = w.winner.winners.indexOf(game.human) >= 0;
    var W = app.W;
    var H = app.H;
    this.buttons = [
      { x: W / 2 - 250, y: H - 150, w: 240, h: 76, label: '再来一局', style: 'primary', size: 28, act: function () { app.startGame(); } },
      { x: W / 2 + 10, y: H - 150, w: 240, h: 76, label: '返回主页', size: 26, act: function () { app.setScene(new MenuScene(app)); } }
    ];
  }
  ResultScene.prototype.update = function (dt) {
    this.t += dt;
  };
  ResultScene.prototype.draw = function (ctx) {
    var W = this.app.W;
    var H = this.app.H;
    var g = this.game;
    var w = g.world;
    drawBackdrop(ctx, W, H, this.t);
    ctx.fillStyle = 'rgba(8,4,6,0.6)';
    ctx.fillRect(0, 0, W, H);
    var ty = 130;
    D.text(ctx, this.win ? '胜  利' : '败  北', W / 2, ty, 96, this.win ? T.gold : '#9a8f95', 'center', 'bold', YG.FONT_TITLE);
    D.text(ctx, SIDE_TEXT[w.winner.side], W / 2, ty + 84, 21, T.text, 'center', 'bold');
    D.text(ctx, '你的身份：' + YG.ROLE_NAME[g.me.role] + '   用时 ' + YG.formatTime(w.winner.t), W / 2, ty + 120, 17, T.dim, 'center');

    var y = ty + 170;
    var rowH = 62;
    D.panel(ctx, 30, y, W - 60, w.players.length * rowH + 50, 16, 'rgba(24,12,18,0.9)', T.panelEdge, 1.5);
    D.text(ctx, '势力', 110, y + 26, 15, T.dim, 'center');
    D.text(ctx, '身份', 300, y + 26, 15, T.dim, 'center');
    D.text(ctx, '结局', 440, y + 26, 15, T.dim, 'center');
    D.text(ctx, '攻城 / 击杀', 590, y + 26, 15, T.dim, 'center');
    for (var i = 0; i < w.players.length; i++) {
      var p = w.players[i];
      var ry = y + 50 + i * rowH;
      var won = w.winner.winners.indexOf(p.id) >= 0;
      if (p.id === g.human) D.panel(ctx, 40, ry + 4, W - 80, rowH - 8, 10, 'rgba(233,196,106,0.1)', 'rgba(233,196,106,0.45)', 1);
      ctx.beginPath();
      ctx.arc(66, ry + rowH / 2, 16, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      D.text(ctx, p.id === g.human ? '你' : p.name, 92, ry + rowH / 2, 19, T.text, 'left', 'bold');
      D.text(ctx, YG.ROLE_NAME[p.role], 300, ry + rowH / 2, 20, YG.ROLE_COLOR[p.role], 'center', 'bold');
      D.text(ctx, (won ? '胜 · ' : '败 · ') + (p.alive ? '存活' : '阵亡 ' + YG.formatTime(p.deathT)), 440, ry + rowH / 2, 16, won ? T.gold : T.dim, 'center', won ? 'bold' : 'normal');
      D.text(ctx, p.stats.captured + ' / ' + p.stats.kills, 590, ry + rowH / 2, 18, T.text, 'center');
    }
    // 个人战绩
    var sy = y + w.players.length * rowH + 80;
    var rec = this.app.record;
    var roleRec = rec.byRole[g.me.role] || { games: 0, wins: 0 };
    var st = g.me.stats;
    D.panel(ctx, 30, sy, W - 60, 150, 16, 'rgba(24,12,18,0.9)', T.panelEdge, 1.5);
    D.text(ctx, '本局战绩', 56, sy + 30, 18, T.gold, 'left', 'bold');
    D.text(ctx, '攻占 ' + st.captured + ' 座城  ·  击杀 ' + st.kills + '  ·  巅峰 ' + st.peakCities + ' 城', 56, sy + 66, 19, T.text);
    D.text(ctx, '作为' + YG.ROLE_NAME[g.me.role] + '：' + roleRec.games + ' 局 ' + roleRec.wins + ' 胜' +
      '      总战绩：' + rec.games + ' 局 ' + rec.wins + ' 胜', 56, sy + 108, 16, T.dim);
    for (var k = 0; k < this.buttons.length; k++) {
      this.buttons[k].pressed = this.pressed === this.buttons[k];
      D.button(ctx, this.buttons[k]);
    }
  };
  ResultScene.prototype.onDown = MenuScene.prototype.onDown;
  ResultScene.prototype.onMove = function () {};
  ResultScene.prototype.onUp = MenuScene.prototype.onUp;

  YG.MenuScene = MenuScene;
  YG.HelpScene = HelpScene;
  YG.GameScene = GameScene;
  YG.ResultScene = ResultScene;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : globalThis);
