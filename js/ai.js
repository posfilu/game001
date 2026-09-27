/*
 * 电脑玩家。每个 AI 只知道公开信息：主公是谁、阵亡者身份、每个人的「名声」（跳忠 / 跳反）。
 * 各身份的策略：
 *   主公：扩张，打疑反者；只剩敌人时全面进攻。
 *   忠臣：绝不打主公，专打疑反者（谁打主公谁就疑反）。
 *   反贼：先发育，时机合适就猛攻主公；跳忠的人也是敌人。
 *   内奸：前期装忠、保护主公，最后只剩自己和主公时再动手。
 * 进贡（向主公输送援军）会让名声变为「疑忠」：忠臣用它救主，内奸和反贼用它伪装。
 */
(function (root) {
  var YG = root.YG || (root.YG = {});
  var R = YG.ROLE;

  function AI(world, pid) {
    this.w = world;
    this.pid = pid;
    this.rng = new YG.Rng((world.seed ^ (pid * 2654435761)) >>> 0);
    this.diff = YG.DIFFICULTY[world.difficulty] || YG.DIFFICULTY.normal;
    this.timer = 1 + this.rng.next() * 2;
  }

  AI.prototype.update = function (dt) {
    var me = this.w.players[this.pid];
    if (!me.alive || this.w.winner) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.diff.think + this.rng.next() * this.diff.jitter;
    this.think();
  };

  // ---------- 局势判断 ----------

  AI.prototype.roleCount = function (role, aliveOnly) {
    var n = 0;
    var ps = this.w.players;
    var setup = YG.ROLE_SETUP[this.w.numPlayers];
    for (var i = 0; i < setup.length; i++) if (setup[i] === role) n++;
    if (!aliveOnly) return n;
    // 已阵亡的身份是公开的
    for (var k = 0; k < ps.length; k++) if (!ps[k].alive && ps[k].role === role) n--;
    return n;
  };

  /** 其余存活者是否必然都是敌人（根据已公开的阵亡身份推理） */
  AI.prototype.allOthersHostile = function () {
    var w = this.w;
    var me = w.players[this.pid];
    var others = w.alivePlayers().filter(function (p) { return p.id !== me.id && p.id !== w.lordId; });
    if (others.length === 0) return true;
    if (me.role === R.LORD) return this.roleCount(R.LOYAL, true) === 0;
    if (me.role === R.LOYAL) return this.roleCount(R.LOYAL, true) - 1 === 0;
    if (me.role === R.REBEL) return this.roleCount(R.REBEL, true) - 1 === 0;
    return true;
  };

  /** 从公开信息估算「主公方」与「反贼方」的兵力（不含自己） */
  AI.prototype.sideStrength = function () {
    var w = this.w;
    var s = { lord: 0, rebel: 0 };
    for (var i = 0; i < w.players.length; i++) {
      var p = w.players[i];
      if (!p.alive || p.id === this.pid) continue;
      var pow = this.powerOf(p.id);
      if (p.id === w.lordId || p.rep > 0) s.lord += pow;
      else s.rebel += pow;
    }
    return s;
  };

  function byRep(rep, whenRebelish, whenLoyalish, unknown) {
    var t = YG.clamp(rep / YG.REP_TAG, -1, 1);
    return t < 0 ? unknown + (whenRebelish - unknown) * -t : unknown + (whenLoyalish - unknown) * t;
  }

  /** 对某个势力的敌意：0 表示不打，越大越想打 */
  AI.prototype.hostility = function (owner) {
    var w = this.w;
    var late = w.t > 240 ? 0.25 : 0;
    var stall = w.t > 420 ? 0.45 : 0; // 拖太久就不再客气
    if (owner < 0) return w.t > 300 ? 0.65 : 0.9;
    if (owner === this.pid) return 0;
    var me = w.players[this.pid];
    var o = w.players[owner];
    var isLord = owner === w.lordId;
    var lordP = w.players[w.lordId];
    switch (me.role) {
      case R.LORD:
        if (this.allOthersHostile()) return 1.3;
        return Math.max(stall, byRep(o.rep, 1.35, 0.02, 0.15 + late));
      case R.LOYAL:
        if (isLord) return 0;
        if (this.allOthersHostile()) return 1.3;
        return Math.max(stall, byRep(o.rep, 1.4, 0.02, 0.3 + late));
      case R.REBEL: {
        if (isLord) {
          var lordPow = this.powerOf(w.lordId);
          var myPow = this.powerOf(this.pid);
          // 有人正在围攻主城时一拥而上
          var siege = w.incomingThreat(lordP.capitalId).hostile > 0 ? 0.5 : 0;
          // 反贼越少越要激进（5 人局 2 反，8 人局 4 反）
          var bold = YG.REBEL_BOLD[this.w.numPlayers] || 1;
          return ((lordPow < myPow * 1.2 ? 1.8 : 1.4) + late + siege) * bold;
        }
        if (this.allOthersHostile()) return 1.1;
        return byRep(o.rep, 0.06, 1.1, 0.25 + late);
      }
      case R.SPY: {
        var others = w.alivePlayers().filter(function (p) { return p.id !== me.id; });
        if (isLord) return others.length === 1 ? 1.6 : 0;
        // 内奸要平衡两边：根据公开的阵亡身份数人头，再比较兵力
        var rebelsLeft = this.roleCount(R.REBEL, true);
        var lordSide = 1 + this.roleCount(R.LOYAL, true);
        var sides = this.sideStrength();
        var lordAhead = rebelsLeft < lordSide || (rebelsLeft === lordSide && sides.lord > sides.rebel * 1.1);
        if (lordAhead) return byRep(o.rep, 0.25, 1.2, 0.45 + late);
        var lordWeak = this.powerOf(lordP.id) < this.powerOf(this.pid) * 0.6;
        return byRep(o.rep, lordWeak ? 1.4 : 1.0, 0.5, 0.4 + late);
      }
    }
    return 0.3;
  };

  AI.prototype.reserve = function (c) {
    var w = this.w;
    var base = c.kind === 'capital' ? Math.max(12, w.cityCap(c) * (this.duel ? 0.15 : 0.35)) : 3;
    var th = w.incomingThreat(c.id);
    return base + th.hostile * 1.1;
  };

  AI.prototype.mine = function () {
    var pid = this.pid;
    return this.w.cities.filter(function (c) { return c.owner === pid; });
  };

  // ---------- 决策 ----------

  /** 每次思考内缓存各势力兵力，避免重复遍历 */
  AI.prototype.powerOf = function (pid) {
    if (!this._pow) this._pow = {};
    if (this._pow[pid] == null) this._pow[pid] = this.w.power(pid).troops;
    return this._pow[pid];
  };

  AI.prototype.think = function () {
    this._pow = null;
    // 只剩两人时进入决战：全军压上攻打对方主城
    this.duel = this.w.alivePlayers().length === 2;
    var mine = this.mine();
    if (mine.length === 0) return;
    this.defend(mine);
    this.support(this.mine());
    if (this.rng.next() < this.diff.cards) this.useCards(mine);
    var attacks = this.w.difficulty === 'hard' ? 2 : 1;
    for (var i = 0; i < attacks; i++) {
      if (!this.attack(this.mine())) break;
    }
    this.upgradeSome(this.mine());
    this.consolidate(this.mine());
  };

  AI.prototype.defend = function (mine) {
    var w = this.w;
    var sorted = mine.slice().sort(function (a, b) { return (b.kind === 'capital') - (a.kind === 'capital'); });
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i];
      var th = w.incomingThreat(c.id);
      if (th.hostile <= 0) continue;
      var deficit = th.hostile - (c.troops + th.friendly) + 4;
      if (deficit <= 0) continue;
      var helpers = mine
        .filter(function (h) { return h !== c && w.incomingThreat(h.id).hostile < h.troops * 0.5; })
        .sort(function (a, b) { return YG.dist(a.x, a.y, c.x, c.y) - YG.dist(b.x, b.y, c.x, c.y); });
      for (var k = 0; k < helpers.length && deficit > 0; k++) {
        var h = helpers[k];
        if (YG.dist(h.x, h.y, c.x, c.y) > 480) break;
        var avail = h.troops - (h.kind === 'capital' && c.kind !== 'capital' ? this.reserve(h) : 2);
        if (avail < 3) continue;
        var amt = Math.min(avail, deficit * 1.15);
        w.dispatch(this.pid, [h.id], c.id, amt / h.troops);
        deficit -= amt;
      }
    }
  };

  /** 向主公进贡：忠臣救主，内奸装忠 / 必要时保主，反贼偶尔伪装 */
  AI.prototype.support = function (mine) {
    var w = this.w;
    var me = w.players[this.pid];
    var lord = w.players[w.lordId];
    if (me.role === R.LORD || !lord.alive) return;
    var cap = w.cities[lord.capitalId];
    if (cap.owner !== lord.id) return;
    var th = w.incomingThreat(cap.id);
    var deficit = th.hostile - (cap.troops + th.friendly) + 6;
    var want = 0;
    if (me.role === R.LOYAL) {
      if (deficit > 0) want = deficit;
    } else if (me.role === R.SPY) {
      var others = w.alivePlayers().length - 2;
      if (deficit > 0 && others > 0) want = deficit;
      else if (!this.gaveTribute && w.t < 150 && me.rep < YG.REP_TAG) want = 12;
    } else if (me.role === R.REBEL) {
      if (!this.gaveTribute && w.t > 20 && w.t < 90 && me.rep <= 0 && this.rng.next() < 0.08) want = 8;
    }
    if (want <= 0) return;
    var self = this;
    var src = mine
      .filter(function (c) { return c.troops - self.reserve(c) >= 5 && YG.dist(c.x, c.y, cap.x, cap.y) < 600; })
      .sort(function (a, b) { return YG.dist(a.x, a.y, cap.x, cap.y) - YG.dist(b.x, b.y, cap.x, cap.y); })[0];
    if (!src) return;
    var amt = Math.min(src.troops - this.reserve(src), want);
    if (w.tribute(this.pid, src.id, cap.id, Math.min(1, (amt + 0.999) / src.troops)) > 0) this.gaveTribute = true;
  };

  AI.prototype.attack = function (mine) {
    var w = this.w;
    var self = this;
    var best = null;
    var bestScore = 0;
    for (var t = 0; t < w.cities.length; t++) {
      var target = w.cities[t];
      if (target.owner === this.pid) continue;
      var h = this.hostility(target.owner);
      if (h <= 0.06) continue;
      if (target.shieldT > 0) continue;

      // 攻打主城时多路齐发
      var isCapital = target.capitalOf >= 0;
      var allIn = isCapital && this.duel;
      var sources = mine
        .map(function (c) {
          return { c: c, d: YG.dist(c.x, c.y, target.x, target.y), avail: c.troops - self.reserve(c) };
        })
        .filter(function (s) { return s.avail >= 3 && (allIn || s.d < (isCapital ? 720 : 560)); })
        .sort(function (a, b) { return a.d - b.d; })
        .slice(0, allIn ? 99 : isCapital ? 6 : 3);
      if (sources.length === 0) continue;

      var def = w.cityDef(target);
      var travel = sources[0].d / YG.UNIT_SPEED;
      var growth = 0;
      if (target.owner >= 0) {
        growth = Math.min(Math.max(0, w.cityCap(target) - target.troops), w.cityProd(target) * travel);
      }
      var th = w.incomingThreat(target.id);
      var mineIncoming = 0;
      for (var p = 0; p < w.packets.length; p++) {
        var pk = w.packets[p];
        if (pk.to === target.id && pk.owner === this.pid) mineIncoming += (pk.count * pk.atk) / def;
      }
      for (var s = 0; s < w.streams.length; s++) {
        var st = w.streams[s];
        if (st.to === target.id && st.owner === this.pid) mineIncoming += (st.remaining * st.atk) / def;
      }
      var needed = (target.troops + growth - mineIncoming) * def + 3 + sources[0].d * 0.01;
      if (needed <= 0) continue;
      // 有别人正在打这座城时，可以捡漏
      if (th.hostile - mineIncoming > 0 && target.owner >= 0) needed *= 0.85;

      var total = 0;
      for (var q = 0; q < sources.length; q++) total += sources[q].avail;
      if (total < needed * 1.05) continue;

      var value = 10 + target.level * 4;
      if (target.kind === 'tower') value += 3;
      if (target.kind === 'barracks' || target.kind === 'stable') value += 4;
      if (target.center) value += 6;
      if (isCapital && h > 0.6) value += this.duel ? 120 : 35; // 一击致命
      var score = (h * value) / (needed + 8 + sources[0].d * 0.04);
      score *= 1 + (this.rng.next() - 0.5) * (1.1 - this.diff.greed);
      if (score > bestScore) {
        bestScore = score;
        // 主城会有援军，多派一些余量
        var margin = isCapital ? (this.duel ? 2 : 1.4) : 1.1;
        best = { target: target, sources: sources, needed: Math.min(total, needed * margin) };
      }
    }
    if (!best) return false;
    var left = best.needed;
    for (var i = 0; i < best.sources.length && left > 0; i++) {
      var src = best.sources[i];
      var amt = Math.min(src.avail, left);
      if (amt < 1) continue;
      w.dispatch(this.pid, [src.c.id], best.target.id, Math.min(1, (amt + 0.999) / src.c.troops));
      left -= amt;
    }
    return true;
  };

  AI.prototype.upgradeSome = function (mine) {
    var w = this.w;
    var list = mine.slice().sort(function (a, b) {
      return (b.kind === 'capital') - (a.kind === 'capital') || w.cityProd(b) - w.cityProd(a);
    });
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.level >= YG.MAX_LEVEL) continue;
      var cost = w.upgradeCost(c);
      var safety = c.kind === 'capital' ? 25 : 8;
      if (w.incomingThreat(c.id).hostile > 0) continue;
      if (c.troops >= cost + safety && c.troops >= w.cityCap(c) * 0.8) {
        w.upgrade(this.pid, c.id);
        return;
      }
    }
  };

  /** 后方满员的城池把兵力送往前线 */
  AI.prototype.consolidate = function (mine) {
    if (mine.length < 2) return;
    var w = this.w;
    var self = this;
    var hostileCities = w.cities.filter(function (c) { return c.owner !== self.pid && self.hostility(c.owner) > 0.3; });
    if (hostileCities.length === 0) return;
    function frontDist(c) {
      var m = Infinity;
      for (var i = 0; i < hostileCities.length; i++) {
        var d = YG.dist(c.x, c.y, hostileCities[i].x, hostileCities[i].y);
        if (d < m) m = d;
      }
      return m;
    }
    for (var i = 0; i < mine.length; i++) {
      var c = mine[i];
      if (c.troops < w.cityCap(c) * 0.9 || c.kind === 'capital') continue;
      var fd = frontDist(c);
      var dest = null;
      var destD = Infinity;
      for (var k = 0; k < mine.length; k++) {
        var o = mine[k];
        if (o === c) continue;
        var ofd = frontDist(o);
        var d = YG.dist(c.x, c.y, o.x, o.y);
        if (ofd < fd - 60 && d < 380 && d < destD && o.troops < w.cityCap(o) * 0.8) {
          dest = o;
          destD = d;
        }
      }
      if (dest) {
        w.dispatch(this.pid, [c.id], dest.id, 0.6);
        return;
      }
    }
  };

  AI.prototype.useCards = function (mine) {
    var w = this.w;
    var me = w.players[this.pid];
    if (me.hand.length === 0) return;
    var full = me.hand.length >= YG.HAND_MAX;
    var bestIdx = -1;
    var bestTarget = -1;
    var bestVal = 0;
    var capital = w.cities[me.capitalId];

    for (var i = 0; i < me.hand.length; i++) {
      var id = me.hand[i];
      var val = 0;
      var target = -1;
      var k;
      if (id === 'wuzhong') {
        // 受威胁最严重的城，否则主城
        var worst = null;
        var worstDef = 0;
        for (k = 0; k < mine.length; k++) {
          var th = w.incomingThreat(mine[k].id);
          var deficit = th.hostile - mine[k].troops;
          if (deficit > worstDef) {
            worstDef = deficit;
            worst = mine[k];
          }
        }
        if (worst) {
          target = worst.id;
          val = 20 + worstDef;
        } else {
          target = mine.reduce(function (a, b) { return w.cityCap(b) - b.troops > w.cityCap(a) - a.troops ? b : a; }).id;
          val = 14;
        }
      } else if (id === 'wanjian') {
        for (k = 0; k < w.cities.length; k++) {
          var c = w.cities[k];
          if (c.owner === this.pid) continue;
          var h = this.hostility(c.owner);
          var v = h * c.troops * 0.45 * (c.capitalOf >= 0 ? 1.4 : 1);
          if (v > val) {
            val = v;
            target = c.id;
          }
        }
      } else if (id === 'nanman') {
        for (k = 0; k < w.cities.length; k++) {
          var o = w.cities[k];
          if (o.owner < 0 || o.owner === this.pid) continue;
          var hh = this.hostility(o.owner);
          // 伤到友军要扣分
          val += (hh < 0.2 ? -1.5 : hh) * o.troops * 0.2;
        }
      } else if (id === 'tao') {
        val = mine.length * 8 * 0.9;
      } else if (id === 'wuxie') {
        var cth = w.incomingThreat(capital.id).hostile;
        if (capital.owner === this.pid && cth > capital.troops * 0.6) {
          target = capital.id;
          val = 40 + cth;
        } else {
          for (k = 0; k < mine.length; k++) {
            var t2 = w.incomingThreat(mine[k].id).hostile;
            if (t2 > mine[k].troops && t2 > val) {
              val = t2;
              target = mine[k].id;
            }
          }
        }
      }
      if (YG.CARDS[id].target !== 'none' && target < 0) continue;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
        bestTarget = target;
      }
    }
    if (bestIdx >= 0 && (bestVal >= 18 || full)) w.playCard(this.pid, bestIdx, bestTarget);
  };

  YG.AI = AI;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : globalThis);
