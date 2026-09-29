/*
 * 核心模拟：纯数据 + 固定步长，不依赖任何渲染/平台 API，可在 Node 里跑完整对局。
 *
 * 规则（对照三国杀身份局）：
 *   - 主公身份公开，其余身份隐藏，阵亡时亮明身份。
 *   - 主城被攻破即阵亡，残余城池沦为中立，主城归攻破者。
 *   - 击杀反贼：击杀者获得 2 张锦囊奖励；主公击杀忠臣：弃置全部锦囊且全军兵力减半。
 *   - 主公阵亡时，若场上只剩内奸则内奸胜，否则反贼胜；反贼与内奸全部阵亡则主公与忠臣胜。
 *   - 可以向主公进贡兵力「示好」，名声变为疑忠（内奸、反贼也可以借此伪装）。
 *
 * 出兵方式：城池之间有道路才能连线；连线后源城池沿道路源源不断地出兵，直到断线。
 */
(function (root) {
  var YG = root.YG || (root.YG = {});
  var KIND = YG.CITY_KIND;

  function World(opts) {
    opts = opts || {};
    this.opts = opts;
    this.seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
    this.rng = new YG.Rng(this.seed);
    this.numPlayers = opts.numPlayers || 5;
    this.rect = opts.rect || { x: 20, y: 20, w: 680, h: 880 };
    this.difficulty = opts.difficulty || 'normal';

    this.t = 0;
    this.packets = [];
    this.streams = []; // 一次性出兵（进贡）
    this.links = []; // 连线：{ owner, from, to, timer, born }
    this.events = [];
    this.winner = null;
    this.prodMult = 1;
    this.flowMult = 1;
    this.defMult = 1;
    this.surgeIdx = 0;
    this._pid = 0;

    var map = YG.generateMap(this.rng, this.numPlayers, this.rect);
    this.cities = map.cities;
    this.roads = map.roads;
    this.adj = map.adj;

    // 分配身份：humanRole 指定时让玩家坐到对应身份的座位上
    var roles = this.rng.shuffle(YG.ROLE_SETUP[this.numPlayers].slice());
    var humanSeat = opts.humanSeat != null ? opts.humanSeat : -1;
    if (humanSeat >= 0 && opts.humanRole) {
      var idx = roles.indexOf(opts.humanRole);
      var tmp = roles[humanSeat];
      roles[humanSeat] = roles[idx];
      roles[idx] = tmp;
    }
    var names = this.rng.shuffle(YG.KING_NAMES.slice());
    this.players = [];
    for (var i = 0; i < this.numPlayers; i++) {
      var isHuman = i === humanSeat;
      var p = {
        id: i,
        name: isHuman ? '你' : names[i],
        title: names[i],
        color: YG.PLAYER_COLORS[i],
        role: roles[i],
        isHuman: isHuman,
        alive: true,
        capitalId: map.capitals[i],
        hand: [],
        cardT: YG.CARD_INTERVAL * (0.5 + 0.1 * i),
        rep: 0,
        deathT: -1,
        killer: -1,
        stats: { captured: 0, kills: 0, peakCities: 1 }
      };
      this.players.push(p);
      if (roles[i] === YG.ROLE.LORD) this.lordId = i;
      var cap = this.cities[p.capitalId];
      cap.owner = i;
      cap.shieldT = YG.OPENING_SHIELD;
      cap.name = isHuman ? '你的主城' : names[i].replace('王', '') + '殿';
      // 主公与三国杀一样多一点「体力」
      if (roles[i] === YG.ROLE.LORD) cap.troops += YG.LORD_BONUS[this.numPlayers] || 0;
    }
    this.humanId = humanSeat;
    // 开局每人一张锦囊
    for (var h = 0; h < this.players.length; h++) this.drawCard(this.players[h], YG.HAND_MAX);
  }

  // ---------- 查询 ----------

  World.prototype.cityDef = function (c) {
    return Math.max(1, KIND[c.kind].def * this.defMult);
  };

  World.prototype.cityCap = function (c) {
    return KIND[c.kind].cap[c.level - 1];
  };

  World.prototype.cityProd = function (c) {
    return KIND[c.kind].prod * YG.LEVEL_PROD[c.level - 1] * this.prodMult;
  };

  World.prototype.upgradeCost = function (c) {
    if (c.level >= YG.MAX_LEVEL) return Infinity;
    var cost = YG.UPGRADE_COST[c.level - 1];
    return c.kind === 'capital' ? Math.round(cost * 1.5) : cost;
  };

  World.prototype.isAdjacent = function (a, b) {
    return !!this.adj[a] && this.adj[a].indexOf(b) >= 0;
  };

  World.prototype.maxLinks = function (c) {
    return YG.LINK_SLOTS[c.level - 1] + (c.kind === 'capital' ? 1 : 0);
  };

  World.prototype.linkRate = function (c) {
    var r = YG.LINK_RATE[c.level - 1] + Math.max(0, c.troops) * YG.LINK_RATE_PER_TROOP;
    return Math.min(YG.LINK_RATE_MAX, r) * this.flowMult;
  };

  /** 连线出兵时城里至少留下的兵力（只有主城需要留守） */
  World.prototype.guard = function (c) {
    return c.kind === 'capital' ? this.cityCap(c) * YG.CAPITAL_GUARD : 0;
  };

  World.prototype.linksFrom = function (cityId) {
    return this.links.filter(function (l) { return l.from === cityId; });
  };

  World.prototype.findLink = function (fromId, toId) {
    for (var i = 0; i < this.links.length; i++) {
      if (this.links[i].from === fromId && this.links[i].to === toId) return this.links[i];
    }
    return null;
  };

  World.prototype.alivePlayers = function () {
    return this.players.filter(function (p) { return p.alive; });
  };

  World.prototype.power = function (pid) {
    var troops = 0;
    var cities = 0;
    for (var i = 0; i < this.cities.length; i++) {
      if (this.cities[i].owner === pid) {
        troops += this.cities[i].troops;
        cities++;
      }
    }
    for (var k = 0; k < this.packets.length; k++) {
      if (this.packets[k].owner === pid) troops += this.packets[k].count;
    }
    for (var s = 0; s < this.streams.length; s++) {
      if (this.streams[s].owner === pid) troops += this.streams[s].remaining;
    }
    return { troops: troops, cities: cities };
  };

  // 名声标签：主公公开；阵亡者亮身份；其余看行为
  World.prototype.repTag = function (pid) {
    var p = this.players[pid];
    if (p.role === YG.ROLE.LORD) return null;
    if (p.rep >= YG.REP_TAG) return '疑忠';
    if (p.rep <= -YG.REP_TAG) return '疑反';
    return null;
  };

  World.prototype.emit = function (type, data) {
    data.type = type;
    data.t = this.t;
    this.events.push(data);
  };

  // ---------- 名声：谁在打谁 ----------

  World.prototype.recordHostility = function (attacker, victim, amount) {
    if (attacker < 0 || victim < 0 || attacker === victim || amount <= 0) return;
    var a = this.players[attacker];
    var v = this.players[victim];
    if (!a.alive || a.role === YG.ROLE.LORD) return;
    var delta = 0;
    if (victim === this.lordId) {
      delta = -amount * 0.9; // 打主公 = 跳反
    } else if (!v.alive || v.deathT >= 0) {
      delta = 0;
    } else if (v.rep <= -YG.REP_TAG * 0.5) {
      delta = amount * 0.6; // 打疑似反贼 = 跳忠
    } else if (v.rep >= YG.REP_TAG * 0.5) {
      delta = -amount * 0.3; // 打疑似忠臣 = 有点像反贼
    }
    a.rep = YG.clamp(a.rep + delta, -YG.REP_MAX, YG.REP_MAX);
  };

  // ---------- 玩家指令 ----------

  /**
   * 建立连线：from 必须是自己的城池，且与 to 有道路相连。
   * 超出该城的连线上限时，替换掉最早的一条。
   * 返回 'linked' | 'exists' | 'noroad' | 'shield' | 'invalid'
   */
  World.prototype.link = function (pid, fromId, toId) {
    if (this.winner || !this.players[pid] || !this.players[pid].alive) return 'invalid';
    var from = this.cities[fromId];
    var to = this.cities[toId];
    if (!from || !to || from.owner !== pid || fromId === toId) return 'invalid';
    if (!this.isAdjacent(fromId, toId)) return 'noroad';
    if (to.owner !== pid && to.shieldT > 0) return 'shield';
    if (this.findLink(fromId, toId)) return 'exists';
    var mine = this.linksFrom(fromId);
    if (mine.length >= this.maxLinks(from)) this.removeLink(mine[0]);
    this.links.push({ owner: pid, from: fromId, to: toId, timer: 0, born: this.t });
    return 'linked';
  };

  World.prototype.removeLink = function (l) {
    var i = this.links.indexOf(l);
    if (i >= 0) this.links.splice(i, 1);
  };

  World.prototype.unlink = function (pid, fromId, toId) {
    var l = this.findLink(fromId, toId);
    if (!l || l.owner !== pid) return false;
    this.removeLink(l);
    return true;
  };

  /** 有连线就断开，没有就建立；返回 'unlinked' 或 link() 的结果 */
  World.prototype.toggleLink = function (pid, fromId, toId) {
    if (this.unlink(pid, fromId, toId)) return 'unlinked';
    return this.link(pid, fromId, toId);
  };

  /** 断开某座城（省略时为全部城池）的所有连线，返回断开的条数 */
  World.prototype.cutLinks = function (pid, fromId) {
    var before = this.links.length;
    this.links = this.links.filter(function (l) {
      return !(l.owner === pid && (fromId == null || l.from === fromId));
    });
    return before - this.links.length;
  };

  /** 一次性出兵（目前用于进贡）：只能沿道路送往相邻城池；aid 为向主公进贡的援军 */
  World.prototype.dispatch = function (pid, fromIds, toId, ratio, aid) {
    if (this.winner || !this.players[pid].alive) return 0;
    var target = this.cities[toId];
    if (!target) return 0;
    var sent = 0;
    for (var i = 0; i < fromIds.length; i++) {
      var from = this.cities[fromIds[i]];
      if (!from || from.owner !== pid || from.id === toId || !this.isAdjacent(from.id, toId)) continue;
      var n = Math.floor(from.troops * (ratio == null ? 0.5 : ratio));
      if (n < 1) continue;
      from.troops -= n;
      sent += n;
      var kind = KIND[from.kind];
      this.streams.push({
        owner: pid,
        from: from.id,
        to: toId,
        remaining: n,
        size: Math.max(1, Math.ceil(n / YG.PACKET_MAX)),
        atk: kind.atk || 1,
        speed: YG.UNIT_SPEED * (kind.speed || 1),
        heavy: !!kind.atk,
        cavalry: !!kind.speed,
        intent: aid ? -1 : target.owner, // 出兵时目标的主人，用来判断是否「有意」敌对
        aid: !!aid,
        timer: 0
      });
    }
    return sent;
  };

  /** 向主公进贡（示好）：兵力沿道路送入相邻的主公城池，不会被主公的箭塔和部队拦截 */
  World.prototype.tribute = function (pid, fromId, toId, ratio) {
    var to = this.cities[toId];
    if (!to || pid === this.lordId || to.owner !== this.lordId || !this.players[this.lordId].alive) return 0;
    return this.dispatch(pid, [fromId], toId, ratio, true);
  };

  World.prototype.isAidFor = function (unit, owner) {
    return !!unit.aid && owner === this.lordId && owner >= 0;
  };

  World.prototype.upgrade = function (pid, cityId) {
    var c = this.cities[cityId];
    if (!c || c.owner !== pid || this.winner) return false;
    var cost = this.upgradeCost(c);
    if (c.troops < cost + 1) return false;
    c.troops -= cost;
    c.level++;
    c.flash = 1;
    this.emit('upgrade', { city: c.id, owner: pid });
    return true;
  };

  World.prototype.drawCard = function (p, max) {
    if (p.hand.length >= max) return false;
    var id = this.rng.weighted(YG.CARD_IDS, function (k) { return YG.CARDS[k].weight; });
    p.hand.push(id);
    return true;
  };

  World.prototype.canTarget = function (pid, cardId, cityId) {
    var def = YG.CARDS[cardId];
    if (def.target === 'none') return true;
    var c = this.cities[cityId];
    if (!c) return false;
    if (def.target === 'own') return c.owner === pid;
    if (def.target === 'other') return c.owner !== pid;
    return false;
  };

  World.prototype.playCard = function (pid, handIdx, cityId) {
    var p = this.players[pid];
    if (!p.alive || this.winner) return false;
    var cardId = p.hand[handIdx];
    if (!cardId || !this.canTarget(pid, cardId, cityId)) return false;
    p.hand.splice(handIdx, 1);
    var c = this.cities[cityId];
    var i;
    switch (cardId) {
      case 'wuzhong':
        c.troops += 25;
        c.flash = 1;
        break;
      case 'wanjian': {
        var loss = c.troops * 0.45;
        c.troops -= loss;
        c.flash = 1;
        this.recordHostility(pid, c.owner, loss);
        break;
      }
      case 'nanman':
        for (i = 0; i < this.cities.length; i++) {
          var o = this.cities[i];
          if (o.owner === pid || o.owner < 0) continue;
          var l = o.troops * 0.2;
          o.troops -= l;
          o.flash = 1;
          this.recordHostility(pid, o.owner, l * 0.25); // 群攻锦囊不太暴露身份
        }
        break;
      case 'tao':
        for (i = 0; i < this.cities.length; i++) {
          if (this.cities[i].owner === pid) {
            this.cities[i].troops += 8;
            this.cities[i].flash = 1;
          }
        }
        break;
      case 'wuxie':
        c.shieldT = 8;
        break;
    }
    this.emit('card', { owner: pid, card: cardId, city: c ? c.id : -1 });
    return true;
  };

  // ---------- 模拟 ----------

  World.prototype.step = function (dt) {
    if (this.winner) return;
    this.t += dt;

    if (this.surgeIdx < YG.SURGE.length && this.t >= YG.SURGE[this.surgeIdx].t) {
      this.flowMult = YG.SURGE[this.surgeIdx].flow;
      this.defMult = YG.SURGE[this.surgeIdx].def;
      this.emit('surge', { text: YG.SURGE[this.surgeIdx].text });
      this.surgeIdx++;
    }

    this.stepCities(dt);
    this.stepLinks(dt);
    this.stepStreams(dt);
    this.stepPackets(dt);
    this.stepCards(dt);
  };

  World.prototype.stepCities = function (dt) {
    for (var i = 0; i < this.cities.length; i++) {
      var c = this.cities[i];
      if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 2);
      if (c.shieldT > 0) c.shieldT = Math.max(0, c.shieldT - dt);
      if (c.owner < 0) continue;
      var cap = this.cityCap(c);
      if (c.troops < cap) {
        c.troops = Math.min(cap, c.troops + this.cityProd(c) * dt);
      } else if (c.troops > cap) {
        // 超出上限的兵力慢慢逃散
        c.troops = Math.max(cap, c.troops - (c.troops - cap) * 0.08 * dt - 0.5 * dt);
      }
      if (c.kind === 'tower') this.towerFire(c, dt);
    }
  };

  World.prototype.towerFire = function (c, dt) {
    c.fireT -= dt;
    if (c.fireT > 0) return;
    var kind = KIND.tower;
    var range = kind.range[c.level - 1];
    var best = null;
    var bestD = range;
    for (var i = 0; i < this.packets.length; i++) {
      var pk = this.packets[i];
      if (pk.owner === c.owner || pk.dead || this.isAidFor(pk, c.owner)) continue;
      var d = YG.dist(pk.x, pk.y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = pk;
      }
    }
    if (!best) {
      c.fireT = 0.1;
      return;
    }
    c.fireT = kind.fire[c.level - 1];
    best.count -= 1; // 箭塔自动射击，不计入名声
    this.emit('shot', { from: c.id, x: best.x, y: best.y, owner: c.owner });
    if (best.count <= 0.001) best.dead = true;
  };

  World.prototype.stepLinks = function (dt) {
    for (var i = this.links.length - 1; i >= 0; i--) {
      var l = this.links[i];
      var from = this.cities[l.from];
      if (from.owner !== l.owner || !this.players[l.owner].alive) {
        this.links.splice(i, 1);
        continue;
      }
      l.timer -= dt;
      // 城里没兵就等产兵，攒够一队再出；流量大时每队人数变多
      while (l.timer <= 0) {
        var rate = this.linkRate(from);
        var interval = Math.max(1 / rate, 1 / YG.LINK_PACKETS_PER_SEC);
        var size = rate * interval;
        if (from.troops - size < this.guard(from)) {
          l.timer = 0;
          break;
        }
        l.timer += interval;
        from.troops -= size;
        var kind = KIND[from.kind];
        this.spawnPacket({
          owner: l.owner,
          to: l.to,
          atk: kind.atk || 1,
          speed: YG.UNIT_SPEED * (kind.speed || 1),
          heavy: !!kind.atk,
          cavalry: !!kind.speed,
          intent: this.cities[l.to].owner,
          aid: false
        }, from, size);
      }
    }
  };

  World.prototype.stepStreams = function (dt) {
    for (var i = this.streams.length - 1; i >= 0; i--) {
      var s = this.streams[i];
      var from = this.cities[s.from];
      // 出兵途中城池易主：还没出城的兵就地溃散
      if (from.owner !== s.owner || !this.players[s.owner].alive) {
        this.streams.splice(i, 1);
        continue;
      }
      s.timer -= dt;
      while (s.timer <= 0 && s.remaining > 0) {
        s.timer += YG.EMIT_INTERVAL;
        var n = Math.min(s.size, s.remaining);
        s.remaining -= n;
        this.spawnPacket(s, from, n);
      }
      if (s.remaining <= 0) this.streams.splice(i, 1);
    }
  };

  World.prototype.spawnPacket = function (s, from, n) {
    var to = this.cities[s.to];
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var r = KIND[from.kind].radius;
    // 小队沿连线所在的道路一侧行进，轻微错开，看起来像一条队伍
    var side = YG.LINK_OFFSET + (this.rng.next() - 0.5) * 4;
    this.packets.push({
      id: this._pid++,
      owner: s.owner,
      to: s.to,
      x: from.x + (dx / d) * r + (-dy / d) * side,
      y: from.y + (dy / d) * r + (dx / d) * side,
      count: n,
      atk: s.atk,
      speed: s.speed,
      heavy: s.heavy,
      cavalry: s.cavalry,
      intent: s.intent,
      aid: s.aid,
      dead: false
    });
  };

  World.prototype.stepPackets = function (dt) {
    var packets = this.packets;
    var i;
    // 移动
    for (i = 0; i < packets.length; i++) {
      var pk = packets[i];
      if (pk.dead) continue;
      var to = this.cities[pk.to];
      var dx = to.x - pk.x;
      var dy = to.y - pk.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var reach = KIND[to.kind].radius * 0.7;
      var move = pk.speed * dt;
      if (d - move <= reach) {
        this.arrive(pk, to);
        pk.dead = true;
      } else {
        pk.x += (dx / d) * move;
        pk.y += (dy / d) * move;
      }
    }

    // 不同势力的队伍在路上相遇会互相厮杀（网格加速）
    var cell = 24;
    var grid = {};
    for (i = 0; i < packets.length; i++) {
      var p = packets[i];
      if (p.dead) continue;
      var key = Math.floor(p.x / cell) + ',' + Math.floor(p.y / cell);
      (grid[key] || (grid[key] = [])).push(p);
    }
    for (i = 0; i < packets.length; i++) {
      var a = packets[i];
      if (a.dead) continue;
      var gx = Math.floor(a.x / cell);
      var gy = Math.floor(a.y / cell);
      for (var ox = -1; ox <= 1 && !a.dead; ox++) {
        for (var oy = -1; oy <= 1 && !a.dead; oy++) {
          var bucket = grid[gx + ox + ',' + (gy + oy)];
          if (!bucket) continue;
          for (var k = 0; k < bucket.length; k++) {
            var b = bucket[k];
            if (b === a || b.dead || b.owner === a.owner) continue;
            if (this.isAidFor(a, b.owner) || this.isAidFor(b, a.owner)) continue;
            if (YG.dist(a.x, a.y, b.x, b.y) > YG.COLLIDE_DIST) continue;
            this.clash(a, b);
            if (a.dead) break;
          }
        }
      }
    }

    // 清理
    var alive = [];
    for (i = 0; i < packets.length; i++) if (!packets[i].dead) alive.push(packets[i]);
    this.packets = alive;
  };

  World.prototype.clash = function (a, b) {
    var sa = a.count * a.atk;
    var sb = b.count * b.atk;
    var m = Math.min(sa, sb);
    a.count -= m / a.atk;
    b.count -= m / b.atk;
    // 只有「正在进攻对方」的一方才算主动敌对，路上擦肩而过的交战不影响名声
    if (a.intent === b.owner) this.recordHostility(a.owner, b.owner, m / a.atk);
    if (b.intent === a.owner) this.recordHostility(b.owner, a.owner, m / b.atk);
    if (a.count <= 0.001) a.dead = true;
    if (b.count <= 0.001) b.dead = true;
    this.emit('clash', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  };

  World.prototype.arrive = function (pk, c) {
    if (!this.players[pk.owner].alive) return;
    if (c.owner === pk.owner) {
      c.troops += pk.count;
      return;
    }
    if (this.isAidFor(pk, c.owner)) {
      // 进贡：援军入城，进贡者「疑忠」
      c.troops += pk.count;
      var giver = this.players[pk.owner];
      giver.rep = YG.clamp(giver.rep + pk.count * 0.8, -YG.REP_MAX, YG.REP_MAX);
      c.flash = Math.max(c.flash, 0.5);
      return;
    }
    if (c.shieldT > 0) {
      this.emit('blocked', { city: c.id });
      return;
    }
    var def = this.cityDef(c);
    var dmg = (pk.count * pk.atk) / def;
    // 行军途中目标易主（例如和别人抢同一座中立城）不算主动敌对
    if (pk.intent === c.owner) this.recordHostility(pk.owner, c.owner, Math.min(dmg, c.troops));
    c.troops -= dmg;
    if (c.troops < 0) {
      var overflow = (-c.troops * def) / pk.atk;
      this.capture(c, pk.owner, overflow);
    }
  };

  World.prototype.capture = function (c, newOwner, troops) {
    var prev = c.owner;
    c.owner = newOwner;
    c.troops = troops;
    c.flash = 1;
    c.shieldT = 0;
    // 城池易主：原主人从这里拉出的连线失效；别人攻打这座城的连线自动断开（目标换了主人，需重新决定）
    this.links = this.links.filter(function (l) {
      if (l.from === c.id) return l.owner === newOwner;
      if (l.to === c.id) return l.owner === newOwner;
      return true;
    });
    var np = this.players[newOwner];
    np.stats.captured++;
    var nc = this.power(newOwner).cities;
    if (nc > np.stats.peakCities) np.stats.peakCities = nc;
    this.emit('capture', { city: c.id, from: prev, to: newOwner });
    if (prev >= 0 && c.capitalOf === prev && this.players[prev].alive) {
      this.eliminate(prev, newOwner);
    }
  };

  World.prototype.eliminate = function (victimId, killerId) {
    var v = this.players[victimId];
    var k = this.players[killerId];
    v.alive = false;
    v.deathT = this.t;
    v.killer = killerId;
    v.hand = [];
    k.stats.kills++;

    var lordKilledLoyal = k.role === YG.ROLE.LORD && v.role === YG.ROLE.LOYAL;
    var i;
    // 主城失去主城加成
    var cap = this.cities[v.capitalId];
    cap.kind = 'city';
    cap.capitalOf = -1;
    if (cap.level > YG.MAX_LEVEL) cap.level = YG.MAX_LEVEL;
    cap.troops = Math.min(cap.troops, this.cityCap(cap));

    // 残余城池群龙无首，沦为中立
    for (i = 0; i < this.cities.length; i++) {
      var c = this.cities[i];
      if (c.owner !== victimId) continue;
      c.owner = -1;
      c.troops = Math.max(3, c.troops * 0.6);
      c.flash = 1;
    }
    // 行军中的部队溃散
    for (i = 0; i < this.packets.length; i++) {
      if (this.packets[i].owner === victimId) this.packets[i].dead = true;
    }
    this.streams = this.streams.filter(function (s) { return s.owner !== victimId; });
    this.links = this.links.filter(function (l) { return l.owner !== victimId; });

    var reward = null;
    if (v.role === YG.ROLE.REBEL) {
      // 击杀反贼奖励两张锦囊
      var got = 0;
      if (this.drawCard(k, YG.HAND_MAX_REWARD)) got++;
      if (this.drawCard(k, YG.HAND_MAX_REWARD)) got++;
      reward = got > 0 ? '获得 ' + got + ' 张锦囊' : null;
    } else if (lordKilledLoyal) {
      k.hand = [];
      for (i = 0; i < this.cities.length; i++) {
        if (this.cities[i].owner === killerId) this.cities[i].troops *= 0.5;
      }
      reward = '主公误杀忠臣，弃置全部锦囊且全军减半';
    }
    this.emit('eliminate', { victim: victimId, killer: killerId, role: v.role, reward: reward });
    this.checkVictory();
  };

  World.prototype.checkVictory = function () {
    if (this.winner) return;
    var lord = this.players[this.lordId];
    var alive = this.alivePlayers();
    var R = YG.ROLE;
    var side = null;
    if (!lord.alive) {
      side = alive.length === 1 && alive[0].role === R.SPY ? 'spy' : 'rebel';
    } else {
      var threats = alive.filter(function (p) { return p.role === R.REBEL || p.role === R.SPY; });
      if (threats.length === 0) side = 'lord';
    }
    if (!side) return;
    var winners = this.players.filter(function (p) {
      if (side === 'lord') return p.role === R.LORD || p.role === R.LOYAL;
      if (side === 'rebel') return p.role === R.REBEL;
      return p.role === R.SPY;
    }).map(function (p) { return p.id; });
    this.winner = { side: side, winners: winners, t: this.t };
    this.emit('gameover', { side: side });
  };

  World.prototype.stepCards = function (dt) {
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (!p.alive) continue;
      p.cardT -= dt;
      if (p.cardT <= 0) {
        p.cardT += YG.CARD_INTERVAL;
        if (this.drawCard(p, YG.HAND_MAX) && p.isHuman) this.emit('draw', { owner: p.id });
      }
    }
  };

  /**
   * 某城受到的威胁（已按城防折算），供 AI 与界面使用：
   *   hostile / friendly：路上的敌军 / 援军；hostileRate / friendlyRate：连线每秒送来的敌军 / 援军
   */
  World.prototype.incomingThreat = function (cityId) {
    var c = this.cities[cityId];
    var def = this.cityDef(c);
    var hostile = 0;
    var friendly = 0;
    var hostileRate = 0;
    var friendlyRate = 0;
    for (var li = 0; li < this.links.length; li++) {
      var l = this.links[li];
      if (l.to !== cityId) continue;
      var src = this.cities[l.from];
      var rate = src.troops >= 2 ? this.linkRate(src) : Math.min(this.linkRate(src), this.cityProd(src));
      if (l.owner === c.owner) friendlyRate += rate;
      else hostileRate += (rate * (KIND[src.kind].atk || 1)) / def;
    }
    for (var i = 0; i < this.packets.length; i++) {
      var pk = this.packets[i];
      if (pk.to !== cityId) continue;
      if (pk.owner === c.owner || this.isAidFor(pk, c.owner)) friendly += pk.count;
      else hostile += (pk.count * pk.atk) / def;
    }
    for (var s = 0; s < this.streams.length; s++) {
      var st = this.streams[s];
      if (st.to !== cityId) continue;
      if (st.owner === c.owner || this.isAidFor(st, c.owner)) friendly += st.remaining;
      else hostile += (st.remaining * st.atk) / def;
    }
    return { hostile: hostile, friendly: friendly, hostileRate: hostileRate, friendlyRate: friendlyRate };
  };

  YG.World = World;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : globalThis);
