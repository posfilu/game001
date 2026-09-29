/*
 * 电脑玩家。每个 AI 只知道公开信息：主公是谁、阵亡者身份、每个人的「名声」（跳忠 / 跳反）。
 * 各身份的策略：
 *   主公：扩张，打疑反者；只剩敌人时全面进攻。
 *   忠臣：绝不打主公，专打疑反者（谁打主公谁就疑反）。
 *   反贼：先发育，时机合适就猛攻主公；跳忠的人也是敌人。
 *   内奸：前期装忠、保护主公，最后只剩自己和主公时再动手。
 * 进贡（向主公输送援军）会让名声变为「疑忠」：忠臣用它救主，内奸和反贼用它伪装。
 * 出兵全部通过道路连线：进攻相邻城池、后方向前线输送补给、支援受威胁的城池，打不下来就断线。
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

  /**
   * 主公 / 忠臣的推理：还活着的忠臣有几个（阵亡身份公开可以算出来），
   * 就把名声最「忠」的那几个人当自己人，其余都当敌人。
   */
  AI.prototype.presumedLoyal = function (owner) {
    var w = this.w;
    var me = w.players[this.pid];
    var slots = this.roleCount(R.LOYAL, true) - (me.role === R.LOYAL ? 1 : 0);
    if (slots <= 0) return false;
    var others = w.alivePlayers()
      .filter(function (p) { return p.id !== me.id && p.id !== w.lordId; })
      .sort(function (a, b) { return b.rep - a.rep || a.id - b.id; });
    for (var i = 0; i < slots && i < others.length; i++) if (others[i].id === owner) return true;
    return false;
  };

  function byRep(rep, whenRebelish, whenLoyalish, unknown) {
    var t = YG.clamp(rep / YG.REP_TAG, -1, 1);
    return t < 0 ? unknown + (whenRebelish - unknown) * -t : unknown + (whenLoyalish - unknown) * t;
  }

  /** 对某个势力的敌意：0 表示不打，越大越想打 */
  AI.prototype.hostility = function (owner) {
    var w = this.w;
    var late = w.t > 240 ? 0.25 : 0;
    var stall = w.t > 420; // 拖太久就按名声排队推理身份
    if (owner < 0) return w.t > 300 ? 0.65 : 0.9;
    if (owner === this.pid) return 0;
    var me = w.players[this.pid];
    var o = w.players[owner];
    var isLord = owner === w.lordId;
    var lordP = w.players[w.lordId];
    switch (me.role) {
      case R.LORD:
        if (this.allOthersHostile()) return 1.3;
        if (stall) return this.presumedLoyal(owner) ? 0.02 : 1.1;
        return byRep(o.rep, 1.35, 0.02, 0.15 + late);
      case R.LOYAL:
        if (isLord) return 0;
        if (this.allOthersHostile()) return 1.3;
        if (stall) return this.presumedLoyal(owner) ? 0.02 : 1.1;
        return byRep(o.rep, 1.4, 0.02, 0.3 + late);
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

  /** 某城在 horizon 秒内面临的净压力（敌军 - 援军，已按城防折算） */
  AI.prototype.pressure = function (c, horizon) {
    var th = this.w.incomingThreat(c.id);
    var h = horizon || 4;
    return th.hostile + th.hostileRate * h - th.friendly - th.friendlyRate * h;
  };

  AI.prototype.reserve = function (c) {
    var w = this.w;
    var base = c.kind === 'capital' ? Math.max(12, w.cityCap(c) * (this.duel ? 0.15 : 0.35)) : 3;
    return base + Math.max(0, this.pressure(c)) * 1.1;
  };

  AI.prototype.mine = function () {
    var pid = this.pid;
    return this.w.cities.filter(function (c) { return c.owner === pid; });
  };

  AI.prototype.myLinks = function () {
    var pid = this.pid;
    return this.w.links.filter(function (l) { return l.owner === pid; });
  };

  /** 腾出一个连线位：优先拆掉向己方城池输送的连线；腾不出返回 false */
  AI.prototype.makeRoom = function (c) {
    var w = this.w;
    var out = w.linksFrom(c.id);
    if (out.length < w.maxLinks(c)) return true;
    for (var i = 0; i < out.length; i++) {
      if (w.cities[out[i].to].owner === this.pid) {
        w.removeLink(out[i]);
        return true;
      }
    }
    return false;
  };

  /** 我方各城到前线的道路步数（前线 = 与想打的城池相邻），不连通的城没有值 */
  AI.prototype.computeFront = function (mine) {
    var w = this.w;
    var dist = {};
    var queue = [];
    for (var i = 0; i < mine.length; i++) {
      var nb = w.adj[mine[i].id];
      for (var k = 0; k < nb.length; k++) {
        var o = w.cities[nb[k]];
        if (o.owner !== this.pid && this.hostility(o.owner) > 0.1) {
          dist[mine[i].id] = 0;
          queue.push(mine[i].id);
          break;
        }
      }
    }
    while (queue.length) {
      var id = queue.shift();
      var nbs = w.adj[id];
      for (var j = 0; j < nbs.length; j++) {
        var n = nbs[j];
        if (w.cities[n].owner === this.pid && dist[n] == null) {
          dist[n] = dist[id] + 1;
          queue.push(n);
        }
      }
    }
    return dist;
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
    this.front = this.computeFront(mine);
    this.prune();
    this.defend(mine);
    this.support(mine);
    if (this.rng.next() < this.diff.cards) this.useCards(mine);
    var attacks = this.diff.attacks;
    for (var i = 0; i < attacks; i++) {
      if (!this.attack(mine)) break;
    }
    this.upgradeSome(mine);
    this.supply(mine);
  };

  /** 检查现有连线：不该打的、打不下来的、老家告急的都断开 */
  AI.prototype.prune = function () {
    var w = this.w;
    var links = this.myLinks();
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      var from = w.cities[l.from];
      var to = w.cities[l.to];
      var cut = false;
      var homePressure = this.pressure(from);
      if (to.owner === this.pid) {
        // 己方之间：救援，或者从后方往前线输送
        var helping = this.pressure(to) > to.troops * 0.3;
        var fFrom = this.front[from.id];
        var fTo = this.front[to.id];
        var towardFront = fTo != null && (fFrom == null || fTo < fFrom);
        var canSpare = from.troops > this.reserve(from) + 3 && to.troops < w.cityCap(to) * 1.2;
        cut = !(helping || (towardFront && canSpare));
        if (homePressure > from.troops * 0.5 && !helping) cut = true;
      } else {
        var h = this.hostility(to.owner);
        if (h <= 0.06 || to.shieldT > 0) cut = true;
        else if (homePressure > from.troops) cut = true; // 老家告急
        else if (from.kind === 'capital' && !this.duel && from.troops < this.reserve(from)) cut = true;
        else if (this.hopeless(to)) cut = true;
      }
      if (cut) w.removeLink(l);
    }
  };

  /**
   * 粗略推演：用 sources 这些城池连线进攻 target，逐秒计算流量、存兵消耗、补给和对方产兵。
   * 返回 { t: 几秒打下, spent: 花费兵力 }；horizon 秒内打不下返回 null。
   */
  AI.prototype.siege = function (target, sources, horizon) {
    var w = this.w;
    var KIND = YG.CITY_KIND;
    var def = w.cityDef(target);
    var th = w.incomingThreat(target.id);
    var hp = target.troops + th.friendly;
    for (var i = 0; i < w.packets.length; i++) {
      var pk = w.packets[i];
      if (pk.owner === this.pid && pk.to === target.id) hp -= (pk.count * pk.atk) / def;
    }
    var regen = (target.owner >= 0 ? w.cityProd(target) : 0) + th.friendlyRate;
    var self = this;
    var st = sources.map(function (c) {
      return {
        stock: Math.max(0, c.troops - self.reserve(c)),
        sustain: w.cityProd(c) + w.incomingThreat(c.id).friendlyRate,
        base: YG.LINK_RATE[c.level - 1],
        atk: KIND[c.kind].atk || 1
      };
    });
    var spent = 0;
    for (var t = 1; t <= horizon; t++) {
      if (hp < 0) return { t: t, spent: spent };
      var dmg = 0;
      for (var k = 0; k < st.length; k++) {
        var x = st[k];
        var rate = Math.min(YG.LINK_RATE_MAX, x.base + x.stock * YG.LINK_RATE_PER_TROOP) * w.flowMult;
        var send = Math.min(rate, x.stock + x.sustain);
        x.stock = Math.max(0, x.stock + x.sustain - send);
        spent += send;
        dmg += (send * x.atk) / def;
      }
      hp += regen - dmg;
    }
    return hp < 0 ? { t: horizon, spent: spent } : null;
  };

  /** 我方正在进攻某城的连线源城池 */
  AI.prototype.attackers = function (targetId) {
    var w = this.w;
    var out = [];
    for (var i = 0; i < w.links.length; i++) {
      var l = w.links[i];
      if (l.owner === this.pid && l.to === targetId) out.push(w.cities[l.from]);
    }
    return out;
  };

  /** 我方对某城的攻势是否无望：一分钟内推演打不下来 */
  AI.prototype.hopeless = function (target) {
    return !this.siege(target, this.attackers(target.id), 60);
  };

  /** 受威胁的城：相邻的己方城池连线过去支援；主城告急时先收回主城的进攻连线 */
  AI.prototype.defend = function (mine) {
    var w = this.w;
    var pid = this.pid;
    var self = this;
    var sorted = mine.slice().sort(function (a, b) { return (b.kind === 'capital') - (a.kind === 'capital'); });
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i];
      var deficit = this.pressure(c, 5) - c.troops + 4;
      if (deficit <= 0) continue;
      if (c.kind === 'capital') {
        w.linksFrom(c.id).forEach(function (l) {
          if (w.cities[l.to].owner !== pid) w.removeLink(l);
        });
      }
      var helpers = w.adj[c.id]
        .map(function (id) { return w.cities[id]; })
        .filter(function (h) {
          return h.owner === pid && !w.findLink(h.id, c.id) && h.troops >= 5 && self.pressure(h) < h.troops * 0.5;
        })
        .sort(function (a, b) { return b.troops - a.troops; });
      for (var k = 0; k < helpers.length && deficit > 0; k++) {
        if (w.link(pid, helpers[k].id, c.id) === 'linked') deficit -= helpers[k].troops * 0.7 + w.linkRate(helpers[k]) * 3;
      }
    }
  };

  /** 向主公进贡：忠臣救主，内奸装忠 / 必要时保主，反贼偶尔伪装（需要与主公的城池相连） */
  AI.prototype.support = function (mine) {
    var w = this.w;
    var me = w.players[this.pid];
    var lord = w.players[w.lordId];
    if (me.role === R.LORD || !lord.alive) return;
    if (me.role === R.LOYAL && this.relay(mine)) return;
    var cap = w.cities[lord.capitalId];
    if (cap.owner !== lord.id) return;
    var th = w.incomingThreat(cap.id);
    var deficit = th.hostile + th.hostileRate * 5 - (cap.troops + th.friendly) + 6;
    var want = 0;
    var capitalOnly = true;
    if (me.role === R.LOYAL) {
      if (deficit > 0) want = deficit;
    } else if (me.role === R.SPY) {
      var others = w.alivePlayers().length - 2;
      if (deficit > 0 && others > 0) want = deficit;
      else if (!this.gaveTribute && w.t < 150 && me.rep < YG.REP_TAG) {
        want = 12;
        capitalOnly = false;
      }
    } else if (me.role === R.REBEL) {
      if (!this.gaveTribute && w.t > 20 && w.t < 90 && me.rep <= 0 && this.rng.next() < 0.08) {
        want = 8;
        capitalOnly = false;
      }
    }
    if (want <= 0) return;
    // 找与主公城池相连、兵力最充足的己方城池
    var best = null;
    var bestAvail = 5;
    for (var i = 0; i < mine.length; i++) {
      var src = mine[i];
      var avail = src.troops - this.reserve(src);
      if (avail < bestAvail) continue;
      var nb = w.adj[src.id];
      for (var k = 0; k < nb.length; k++) {
        var dst = w.cities[nb[k]];
        if (dst.owner !== lord.id || (capitalOnly && dst !== cap)) continue;
        best = { src: src, dst: dst, avail: avail };
        bestAvail = avail;
        break;
      }
    }
    if (!best) return;
    var amt = Math.min(best.avail, want);
    if (w.tribute(this.pid, best.src.id, best.dst.id, Math.min(1, (amt + 0.999) / best.src.troops)) > 0) {
      this.gaveTribute = true;
    }
  };

  /** 忠臣被主公的领地挡住、没有自己的前线时，把多余兵力进贡给相邻的主公城池，由主公带去打仗 */
  AI.prototype.relay = function (mine) {
    var w = this.w;
    if (Object.keys(this.front).length > 0) return false;
    var best = null;
    for (var i = 0; i < mine.length; i++) {
      var src = mine[i];
      if (src.troops < w.cityCap(src) * 0.7 || src.troops - this.reserve(src) < 10) continue;
      var nb = w.adj[src.id];
      for (var k = 0; k < nb.length; k++) {
        var dst = w.cities[nb[k]];
        if (dst.owner !== w.lordId) continue;
        var need = dst.troops / w.cityCap(dst);
        if (!best || need < best.need) best = { src: src, dst: dst, need: need };
      }
    }
    if (!best) return false;
    return w.tribute(this.pid, best.src.id, best.dst.id, 0.6) > 0;
  };

  /** 选一个相邻的目标城池，从与它相连的己方城池拉线进攻 */
  AI.prototype.attack = function (mine) {
    var w = this.w;
    var pid = this.pid;
    var self = this;
    var seen = {};
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < mine.length; i++) {
      var nb = w.adj[mine[i].id];
      for (var n = 0; n < nb.length; n++) {
        var t = nb[n];
        if (seen[t]) continue;
        seen[t] = true;
        var target = w.cities[t];
        if (target.owner === pid || target.shieldT > 0) continue;
        var h = this.hostility(target.owner);
        if (h <= 0.06) continue;
        var isCapital = target.capitalOf >= 0;

        var cand = w.adj[t]
          .map(function (id) { return w.cities[id]; })
          .filter(function (c) {
            return c.owner === pid && !w.findLink(c.id, t) && c.troops - self.reserve(c) >= 4 &&
              (w.linksFrom(c.id).length < w.maxLinks(c) || self.hasSupplyLink(c));
          })
          .sort(function (a, b) { return b.troops - a.troops; })
          .slice(0, isCapital ? 6 : 4);
        if (cand.length === 0) continue;

        // 用最少的城池拿下：逐个加入进攻方，直到推演能打下来
        var existing = this.attackers(t);
        var chosen = [];
        var res = null;
        for (var k = 0; k < cand.length && !res; k++) {
          chosen.push(cand[k]);
          res = this.siege(target, existing.concat(chosen), 40);
        }
        if (!res) continue;

        var value = 10 + target.level * 4;
        if (target.kind === 'tower') value += 3;
        if (target.kind === 'barracks' || target.kind === 'stable') value += 4;
        if (target.center) value += 6;
        if (isCapital && h > 0.6) value += this.duel ? 120 : 35; // 一击致命
        var score = (h * value) / (res.spent * 0.5 + res.t * 1.5 + 8);
        score *= 1 + (this.rng.next() - 0.5) * (1.1 - this.diff.greed);
        if (score > bestScore) {
          bestScore = score;
          // 攻打主城时多拉几条线，防止对方援军翻盘
          best = { target: target, chosen: isCapital ? cand : chosen };
        }
      }
    }
    if (!best) return false;
    for (var j = 0; j < best.chosen.length; j++) {
      var c = best.chosen[j];
      if (this.makeRoom(c)) w.link(pid, c.id, best.target.id);
    }
    return true;
  };

  AI.prototype.hasSupplyLink = function (c) {
    var w = this.w;
    var out = w.linksFrom(c.id);
    for (var i = 0; i < out.length; i++) if (w.cities[out[i].to].owner === this.pid) return true;
    return false;
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
      if (this.pressure(c) > 0) continue;
      if (c.troops >= cost + safety && c.troops >= w.cityCap(c) * 0.8) {
        w.upgrade(this.pid, c.id);
        return;
      }
    }
  };

  /** 后方兵力充足的城池沿道路向前线输送（形成补给线） */
  AI.prototype.supply = function (mine) {
    var w = this.w;
    var pid = this.pid;
    var made = 0;
    var sorted = mine.slice().sort(function (a, b) { return b.troops / w.cityCap(b) - a.troops / w.cityCap(a); });
    for (var i = 0; i < sorted.length && made < 2; i++) {
      var c = sorted[i];
      var f = this.front[c.id];
      if (f == null || f === 0) continue;
      if (w.linksFrom(c.id).length > 0) continue;
      var full = c.troops / w.cityCap(c);
      if (full < (c.kind === 'capital' && !this.duel ? 0.85 : 0.6)) continue;
      var dest = null;
      var nb = w.adj[c.id];
      for (var k = 0; k < nb.length; k++) {
        var o = w.cities[nb[k]];
        var fo = this.front[o.id];
        if (o.owner !== pid || fo == null || fo >= f) continue;
        if (!dest || fo < this.front[dest.id] || (fo === this.front[dest.id] && o.troops < dest.troops)) dest = o;
      }
      if (dest && w.link(pid, c.id, dest.id) === 'linked') made++;
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
