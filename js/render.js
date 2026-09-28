/* 绘图工具 + 战场渲染。只读 World 的数据，不修改模拟状态。 */
(function (root) {
  var YG = root.YG || (root.YG = {});
  var KIND = YG.CITY_KIND;

  YG.THEME = {
    bg: '#0d080c',
    panel: 'rgba(28,16,24,0.94)',
    panelEdge: 'rgba(233,196,106,0.28)',
    gold: '#e9c46a',
    blood: '#b3261e',
    text: '#f3e9dc',
    dim: '#a89b92',
    faint: 'rgba(243,233,220,0.45)'
  };
  YG.FONT = 'sans-serif';
  YG.FONT_TITLE = 'serif';

  // ---------- 基础绘图 ----------
  var D = (YG.draw = {});

  D.font = function (size, weight, family) {
    return (weight || 'normal') + ' ' + size + 'px ' + (family || YG.FONT);
  };

  D.roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };

  D.panel = function (ctx, x, y, w, h, r, fill, stroke, lw) {
    D.roundRect(ctx, x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 1.5;
      ctx.stroke();
    }
  };

  D.text = function (ctx, str, x, y, size, color, align, weight, family) {
    ctx.font = D.font(size, weight, family);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  };

  // 带描边的文字（城池兵力等需要在任何底色上都清楚）
  D.outlined = function (ctx, str, x, y, size, color, outline, weight) {
    ctx.font = D.font(size, weight || 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = outline || 'rgba(0,0,0,0.75)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  };

  // 中文按字符换行；标点不放在行首（避头规则）
  var NO_LINE_START = '，。、；：！？）」』》%';
  D.wrap = function (ctx, str, maxW, size, weight) {
    ctx.font = D.font(size, weight);
    var lines = [];
    var parts = String(str).split('\n');
    for (var p = 0; p < parts.length; p++) {
      var line = '';
      for (var i = 0; i < parts[p].length; i++) {
        var test = line + parts[p][i];
        if (ctx.measureText(test).width > maxW && line && NO_LINE_START.indexOf(parts[p][i]) < 0) {
          lines.push(line);
          line = parts[p][i];
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
  };

  D.paragraph = function (ctx, str, x, y, maxW, size, color, lineH, align) {
    var lines = D.wrap(ctx, str, maxW, size);
    for (var i = 0; i < lines.length; i++) D.text(ctx, lines[i], x, y + i * lineH, size, color, align);
    return lines.length * lineH;
  };

  /** 按钮：{x,y,w,h,label,style,active,disabled,sub} */
  D.button = function (ctx, b) {
    var T = YG.THEME;
    var pressed = b.pressed ? 2 : 0;
    var y = b.y + pressed;
    var fill;
    var stroke;
    var color = T.text;
    if (b.style === 'primary') {
      var g = ctx.createLinearGradient(0, y, 0, y + b.h);
      g.addColorStop(0, '#c0392b');
      g.addColorStop(1, '#7b1d16');
      fill = g;
      stroke = T.gold;
    } else if (b.style === 'seg') {
      fill = b.active ? 'rgba(233,196,106,0.92)' : 'rgba(255,255,255,0.06)';
      stroke = b.active ? T.gold : 'rgba(255,255,255,0.16)';
      color = b.active ? '#2a1610' : T.text;
    } else {
      fill = 'rgba(255,255,255,0.08)';
      stroke = 'rgba(233,196,106,0.45)';
    }
    if (b.disabled) {
      fill = 'rgba(255,255,255,0.04)';
      stroke = 'rgba(255,255,255,0.1)';
      color = 'rgba(243,233,220,0.35)';
    }
    D.panel(ctx, b.x, y, b.w, b.h, b.r || 12, fill, stroke, b.style === 'primary' ? 2 : 1.5);
    var size = b.size || Math.min(26, Math.round(b.h * 0.42));
    if (b.sub) {
      D.text(ctx, b.label, b.x + b.w / 2, y + b.h * 0.38, size, color, 'center', 'bold');
      D.text(ctx, b.sub, b.x + b.w / 2, y + b.h * 0.72, Math.round(size * 0.6), b.disabled ? color : T.dim, 'center');
    } else {
      D.text(ctx, b.label, b.x + b.w / 2, y + b.h / 2 + 1, size, color, 'center', 'bold');
    }
  };

  // 虚线：个别小游戏画布没有 setLineDash，退化为实线
  D.dash = function (ctx, pattern, offset) {
    if (!ctx.setLineDash) return;
    ctx.setLineDash(pattern);
    ctx.lineDashOffset = offset || 0;
  };

  D.hit = function (b, x, y) {
    return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  };

  // ---------- 战场 ----------

  function WorldView(world, humanId, platform) {
    this.w = world;
    this.humanId = humanId;
    this.platform = platform;
    this.fx = [];
    this.embers = [];
    this.bg = null;
    this.bgScale = 0;
    this.grads = {};
    for (var i = 0; i < 26; i++) this.embers.push(this.newEmber(true));
  }

  WorldView.prototype.newEmber = function (anywhere) {
    var r = this.w.rect;
    return {
      x: r.x + Math.random() * r.w,
      y: anywhere ? r.y + Math.random() * r.h : r.y + r.h + 10,
      vy: -8 - Math.random() * 16,
      vx: (Math.random() - 0.5) * 6,
      a: 0.15 + Math.random() * 0.35,
      s: 1 + Math.random() * 1.8
    };
  };

  /** 静态背景（地面、忘川、道路）预渲染到离屏画布 */
  WorldView.prototype.buildBackground = function (W, H, pixelScale) {
    var cv = this.platform.createCanvas(Math.ceil(W * pixelScale), Math.ceil(H * pixelScale));
    var ctx = cv.getContext('2d');
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    var r = this.w.rect;
    var rng = new YG.Rng(this.w.seed ^ 0x5bd1e995);

    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1c0e15');
    g.addColorStop(0.5, '#140a10');
    g.addColorStop(1, '#0b0609');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var cx = r.x + r.w / 2;
    var cy = r.y + r.h / 2;
    var glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(r.w, r.h) * 0.6);
    glow.addColorStop(0, 'rgba(140,28,36,0.28)');
    glow.addColorStop(1, 'rgba(140,28,36,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // 忘川：一条蜿蜒的暗红色河
    ctx.save();
    ctx.lineCap = 'round';
    var y0 = r.y + r.h * rng.range(0.25, 0.75);
    var y1 = r.y + r.h * rng.range(0.25, 0.75);
    ctx.beginPath();
    ctx.moveTo(r.x - 20, y0);
    ctx.bezierCurveTo(r.x + r.w * 0.3, y0 + rng.range(-160, 160), r.x + r.w * 0.7, y1 + rng.range(-160, 160), r.x + r.w + 20, y1);
    ctx.strokeStyle = 'rgba(110,18,28,0.35)';
    ctx.lineWidth = 26;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(170,40,48,0.18)';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    // 灰烬斑点
    for (var i = 0; i < 380; i++) {
      ctx.fillStyle = 'rgba(255,220,200,' + rng.range(0.02, 0.07).toFixed(3) + ')';
      var s = rng.range(0.6, 2.2);
      ctx.fillRect(rng.range(0, W), rng.range(r.y, r.y + r.h), s, s);
    }

    // 道路
    ctx.save();
    D.dash(ctx, [2, 9]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(214,180,140,0.16)';
    ctx.lineWidth = 3;
    var cities = this.w.cities;
    for (var k = 0; k < this.w.roads.length; k++) {
      var a = cities[this.w.roads[k][0]];
      var b = cities[this.w.roads[k][1]];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();

    this.bg = cv;
    this.bgScale = pixelScale;
    this.bgW = W;
    this.bgH = H;
  };

  WorldView.prototype.colorOf = function (owner) {
    return owner < 0 ? YG.NEUTRAL_COLOR : this.w.players[owner].color;
  };

  WorldView.prototype.cityRadius = function (c) {
    return KIND[c.kind].radius + (c.level - 1) * 2;
  };

  /** 消化模拟事件，生成特效与通知 */
  WorldView.prototype.consume = function (onNotice) {
    var w = this.w;
    var evs = w.events;
    var clashes = 0;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      var c = e.city != null && e.city >= 0 ? w.cities[e.city] : null;
      switch (e.type) {
        case 'shot':
          this.fx.push({ k: 'shot', x1: w.cities[e.from].x, y1: w.cities[e.from].y - 10, x2: e.x, y2: e.y, t: 0, d: 0.18 });
          break;
        case 'clash':
          if (clashes++ < 6) this.fx.push({ k: 'spark', x: e.x, y: e.y, t: 0, d: 0.3 });
          break;
        case 'capture':
          this.fx.push({ k: 'ring', x: c.x, y: c.y, color: this.colorOf(e.to), t: 0, d: 0.6, r: this.cityRadius(c) });
          if (e.to === this.humanId) this.float(c.x, c.y - 40, '攻占', this.colorOf(e.to));
          else if (e.from === this.humanId) this.float(c.x, c.y - 40, '失守', '#ff6b6b');
          break;
        case 'blocked':
          this.fx.push({ k: 'ring', x: c.x, y: c.y, color: '#7fd1ff', t: 0, d: 0.35, r: this.cityRadius(c) + 6 });
          break;
        case 'upgrade':
          this.fx.push({ k: 'ring', x: c.x, y: c.y, color: YG.THEME.gold, t: 0, d: 0.6, r: this.cityRadius(c) });
          this.float(c.x, c.y - 42, '升级', YG.THEME.gold);
          break;
        case 'card': {
          var who = w.players[e.owner];
          var name = YG.CARDS[e.card].name;
          if (c) this.float(c.x, c.y - 44, '【' + name + '】', '#ffe7a3');
          onNotice({ kind: 'toast', text: (e.owner === this.humanId ? '你' : who.name) + ' 使用了【' + name + '】', color: who.color });
          break;
        }
        case 'draw':
          onNotice({ kind: 'toast', text: '你获得了一张锦囊', color: YG.THEME.gold });
          break;
        case 'eliminate':
          onNotice({ kind: 'eliminate', victim: e.victim, killer: e.killer, role: e.role, reward: e.reward });
          break;
        case 'surge':
          onNotice({ kind: 'banner', title: e.text, color: '#ff8a65' });
          break;
        case 'gameover':
          onNotice({ kind: 'gameover' });
          break;
      }
    }
    evs.length = 0;
  };

  WorldView.prototype.float = function (x, y, text, color) {
    this.fx.push({ k: 'text', x: x, y: y, text: text, color: color, t: 0, d: 1.1 });
  };

  WorldView.prototype.update = function (dt) {
    for (var i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].t += dt;
      if (this.fx[i].t >= this.fx[i].d) this.fx.splice(i, 1);
    }
    var r = this.w.rect;
    for (var k = 0; k < this.embers.length; k++) {
      var e = this.embers[k];
      e.y += e.vy * dt;
      e.x += e.vx * dt;
      if (e.y < r.y - 10) this.embers[k] = this.newEmber(false);
    }
  };

  /**
   * @param ui {selected, dragSel:[ids], hover, dragFrom:{x,y}, pointer:{x,y}, ratio, cardTarget}
   */
  WorldView.prototype.draw = function (ctx, W, H, pixelScale, time, ui) {
    if (!this.bg || this.bgScale !== pixelScale) this.buildBackground(W, H, pixelScale);
    ctx.drawImage(this.bg, 0, 0, this.bgW, this.bgH);

    var i;
    // 灰烬
    for (i = 0; i < this.embers.length; i++) {
      var em = this.embers[i];
      ctx.fillStyle = 'rgba(255,140,80,' + em.a + ')';
      ctx.fillRect(em.x, em.y, em.s, em.s);
    }

    var w = this.w;
    // 选中箭塔的射程
    var focus = ui.selected != null ? w.cities[ui.selected] : null;
    if (focus && focus.kind === 'tower') {
      ctx.beginPath();
      ctx.arc(focus.x, focus.y, KIND.tower.range[focus.level - 1], 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 出兵预览线
    if (ui.dragSel && ui.dragSel.length && ui.pointer) {
      var tgt = ui.hover != null ? w.cities[ui.hover] : null;
      var tx = tgt ? tgt.x : ui.pointer.x;
      var ty = tgt ? tgt.y : ui.pointer.y;
      var col = w.players[this.humanId].color;
      ctx.save();
      D.dash(ctx, [10, 8], -time * 40);
      ctx.lineWidth = 4;
      ctx.strokeStyle = YG.alpha(col, 0.85);
      for (i = 0; i < ui.dragSel.length; i++) {
        var s = w.cities[ui.dragSel[i]];
        if (tgt && s.id === tgt.id) continue;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
      ctx.restore();
      if (tgt) {
        ctx.beginPath();
        ctx.arc(tgt.x, tgt.y, this.cityRadius(tgt) + 10, 0, Math.PI * 2);
        ctx.strokeStyle = tgt.owner === this.humanId ? '#9be7a1' : '#ff7a6b';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // 城池
    for (i = 0; i < w.cities.length; i++) this.drawCity(ctx, w.cities[i], time, ui);

    // 行军小队
    for (i = 0; i < w.packets.length; i++) this.drawPacket(ctx, w.packets[i]);

    // 特效
    for (i = 0; i < this.fx.length; i++) this.drawFx(ctx, this.fx[i]);
  };

  WorldView.prototype.drawCity = function (ctx, c, time, ui) {
    var w = this.w;
    var r = this.cityRadius(c);
    var col = this.colorOf(c.owner);
    var mine = c.owner === this.humanId && this.humanId >= 0;

    // 阴影
    // 不用 ctx.ellipse：部分小游戏画布不支持
    ctx.save();
    ctx.translate(c.x, c.y + r * 0.75);
    ctx.scale(1, 0.37);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.restore();

    // 城池外形：主城带城垛，箭塔为六边形。以城池中心为原点绘制，渐变按颜色 + 半径缓存复用
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.beginPath();
    if (c.kind === 'capital') {
      var n = 10;
      for (var k = 0; k < n * 2; k++) {
        var a = (k / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        var rr = k % 2 === 0 ? r + 5 : r;
        var a2 = ((k + 1) / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
      }
      ctx.closePath();
    } else if (c.kind === 'tower') {
      for (var h = 0; h < 6; h++) {
        var ha = (h / 6) * Math.PI * 2 - Math.PI / 2;
        if (h === 0) ctx.moveTo(Math.cos(ha) * (r + 2), Math.sin(ha) * (r + 2));
        else ctx.lineTo(Math.cos(ha) * (r + 2), Math.sin(ha) * (r + 2));
      }
      ctx.closePath();
    } else {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    var key = col + r;
    var g = this.grads[key];
    if (!g) {
      g = this.grads[key] = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 2, 0, 0, r + 4);
      g.addColorStop(0, YG.mix(col, '#ffffff', 0.12));
      g.addColorStop(1, YG.mix(col, '#000000', 0.55));
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = mine ? 3.5 : 2.5;
    ctx.strokeStyle = mine ? '#fff4d6' : YG.mix(col, '#ffffff', 0.35);
    ctx.stroke();
    ctx.restore();

    // 选中
    if (ui.selected === c.id || (ui.dragSel && ui.dragSel.indexOf(c.id) >= 0)) {
      ctx.save();
      D.dash(ctx, [6, 5], time * 20);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 9, 0, Math.PI * 2);
      ctx.strokeStyle = YG.THEME.gold;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
    // 锦囊选择目标时的可选提示
    if (ui.cardTarget && ui.cardTarget(c)) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 7 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,231,163,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 免战 / 无懈可击护盾
    if (c.shieldT > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,200,255,0.10)';
      ctx.fill();
      D.dash(ctx, [4, 4], -time * 16);
      ctx.strokeStyle = 'rgba(140,210,255,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      D.text(ctx, '免战 ' + Math.ceil(c.shieldT), c.x, c.y - r - 30, 12, '#aee3ff', 'center', 'bold');
    }

    // 闪光
    if (c.flash > 0) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + (1 - c.flash) * 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,' + (c.flash * 0.7).toFixed(2) + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 兵种徽记
    if (c.kind !== 'city') {
      var bx = c.x - r * 0.78;
      var by = c.y - r * 0.78;
      ctx.beginPath();
      ctx.arc(bx, by, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#2a1610';
      ctx.fill();
      ctx.strokeStyle = YG.THEME.gold;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      D.text(ctx, KIND[c.kind].label, bx, by + 1, 13, YG.THEME.gold, 'center', 'bold');
    }

    // 主公的王冠
    if (c.kind === 'capital' && c.owner === w.lordId && c.capitalOf === w.lordId) {
      this.drawCrown(ctx, c.x, c.y - r - 12);
    }

    // 兵力
    D.outlined(ctx, String(Math.floor(c.troops)), c.x, c.y + 1, c.kind === 'capital' ? 24 : 20, '#ffffff');

    // 等级
    for (var l = 0; l < c.level; l++) {
      var px = c.x + (l - (c.level - 1) / 2) * 10;
      var py = c.y + r + 9;
      ctx.beginPath();
      ctx.moveTo(px, py - 4);
      ctx.lineTo(px + 4, py);
      ctx.lineTo(px, py + 4);
      ctx.lineTo(px - 4, py);
      ctx.closePath();
      ctx.fillStyle = YG.THEME.gold;
      ctx.fill();
    }

    // 名字
    var label = c.name;
    if (c.capitalOf >= 0) label = w.players[c.capitalOf].name + (c.capitalOf === this.humanId ? '' : '·主城');
    if (c.capitalOf === this.humanId) label = '你的主城';
    D.text(ctx, label, c.x, c.y + r + 24, 12, c.capitalOf >= 0 ? 'rgba(243,233,220,0.85)' : 'rgba(243,233,220,0.42)', 'center');
  };

  WorldView.prototype.drawCrown = function (ctx, x, y) {
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 6);
    ctx.lineTo(x - 13, y - 5);
    ctx.lineTo(x - 6, y + 1);
    ctx.lineTo(x, y - 9);
    ctx.lineTo(x + 6, y + 1);
    ctx.lineTo(x + 13, y - 5);
    ctx.lineTo(x + 12, y + 6);
    ctx.closePath();
    ctx.fillStyle = '#f2c94c';
    ctx.fill();
    ctx.strokeStyle = '#7a5a10';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  WorldView.prototype.drawPacket = function (ctx, p) {
    var col = this.colorOf(p.owner);
    var s = 3.2 + Math.sqrt(p.count) * 1.3;
    ctx.beginPath();
    if (p.heavy) {
      ctx.rect(p.x - s, p.y - s, s * 2, s * 2);
    } else if (p.cavalry) {
      var to = this.w.cities[p.to];
      var a = Math.atan2(to.y - p.y, to.x - p.x);
      ctx.moveTo(p.x + Math.cos(a) * s * 1.5, p.y + Math.sin(a) * s * 1.5);
      ctx.lineTo(p.x + Math.cos(a + 2.4) * s, p.y + Math.sin(a + 2.4) * s);
      ctx.lineTo(p.x + Math.cos(a - 2.4) * s, p.y + Math.sin(a - 2.4) * s);
      ctx.closePath();
    } else {
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
    }
    ctx.fillStyle = col;
    ctx.fill();
    // 进贡的援军用金边标出
    ctx.lineWidth = p.aid ? 2.2 : 1.2;
    ctx.strokeStyle = p.aid ? YG.THEME.gold : 'rgba(255,255,255,0.75)';
    ctx.stroke();
  };

  WorldView.prototype.drawFx = function (ctx, f) {
    var k = f.t / f.d;
    if (f.k === 'shot') {
      ctx.beginPath();
      ctx.moveTo(f.x1, f.y1);
      ctx.lineTo(f.x1 + (f.x2 - f.x1) * Math.min(1, k * 1.6), f.y1 + (f.y2 - f.y1) * Math.min(1, k * 1.6));
      ctx.strokeStyle = 'rgba(255,236,170,' + (1 - k).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (f.k === 'spark') {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 3 + k * 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,200,120,' + (1 - k).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (f.k === 'ring') {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + k * 30, 0, Math.PI * 2);
      ctx.strokeStyle = YG.alpha(f.color, (1 - k) * 0.9);
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.stroke();
    } else if (f.k === 'text') {
      ctx.globalAlpha = 1 - k * k;
      D.outlined(ctx, f.text, f.x, f.y - k * 26, 16, f.color);
      ctx.globalAlpha = 1;
    }
  };

  /** 屏幕坐标下最接近的城池 */
  WorldView.prototype.hitCity = function (x, y, slack) {
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < this.w.cities.length; i++) {
      var c = this.w.cities[i];
      var d = YG.dist(c.x, c.y, x, y);
      if (d < this.cityRadius(c) + (slack == null ? 16 : slack) && d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };

  YG.WorldView = WorldView;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : globalThis);
