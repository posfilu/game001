// 规则层单元测试：node --test tests/
var test = require('node:test');
var assert = require('node:assert/strict');
var YG = require('../tools/load')();

var R = YG.ROLE;

function makeWorld(n, seed, extra) {
  var opts = { numPlayers: n || 5, seed: seed == null ? 42 : seed };
  for (var k in extra || {}) opts[k] = extra[k];
  return new YG.World(opts);
}

function byRole(w, role) {
  return w.players.filter(function (p) { return p.role === role; });
}

function run(w, seconds) {
  for (var t = 0; t < seconds; t += 0.05) w.step(0.05);
}

test('地图：同一种子生成相同地图，城池互不重叠', function () {
  var a = makeWorld(8, 7);
  var b = makeWorld(8, 7);
  assert.deepEqual(
    a.cities.map(function (c) { return [c.x, c.y, c.kind]; }),
    b.cities.map(function (c) { return [c.x, c.y, c.kind]; })
  );
  for (var i = 0; i < a.cities.length; i++) {
    for (var k = i + 1; k < a.cities.length; k++) {
      var d = YG.dist(a.cities[i].x, a.cities[i].y, a.cities[k].x, a.cities[k].y);
      assert.ok(d > 60, 'cities ' + i + ' and ' + k + ' too close: ' + d);
    }
  }
  var capitals = a.cities.filter(function (c) { return c.kind === 'capital'; });
  assert.equal(capitals.length, 8);
  assert.ok(a.cities.some(function (c) { return c.name === '酆都'; }));
});

test('身份：人数配置与三国杀一致，每人一座主城', function () {
  [5, 6, 8].forEach(function (n) {
    var w = makeWorld(n, n);
    var counts = {};
    w.players.forEach(function (p) { counts[p.role] = (counts[p.role] || 0) + 1; });
    var expect = {};
    YG.ROLE_SETUP[n].forEach(function (r) { expect[r] = (expect[r] || 0) + 1; });
    assert.deepEqual(counts, expect);
    assert.equal(w.players[w.lordId].role, R.LORD);
    w.players.forEach(function (p) {
      var cap = w.cities[p.capitalId];
      assert.equal(cap.owner, p.id);
      assert.equal(cap.capitalOf, p.id);
      assert.ok(cap.shieldT > 0, '开局主城免战');
    });
  });
});

test('身份：可以指定玩家的身份', function () {
  ['lord', 'loyal', 'rebel', 'spy'].forEach(function (role) {
    for (var seat = 0; seat < 5; seat++) {
      var w = makeWorld(5, seat * 13, { humanSeat: seat, humanRole: role });
      assert.equal(w.players[seat].role, role);
      assert.ok(w.players[seat].isHuman);
      assert.equal(byRole(w, R.LORD).length, 1);
    }
  });
});

function neighbor(w, cityId, pred) {
  return w.adj[cityId].map(function (id) { return w.cities[id]; }).filter(pred || function () { return true; })[0];
}

function runUntil(w, cond, maxSeconds) {
  for (var t = 0; t < (maxSeconds || 60) && !cond(); t += 0.05) w.step(0.05);
}

test('道路：所有城池连通，道路互不交叉，主城之间不直接相连', function () {
  [5, 6, 8].forEach(function (n) {
    for (var seed = 0; seed < 30; seed++) {
      var w = makeWorld(n, seed);
      var seen = {};
      var queue = [0];
      seen[0] = true;
      while (queue.length) {
        var c = queue.pop();
        w.adj[c].forEach(function (x) {
          if (!seen[x]) {
            seen[x] = true;
            queue.push(x);
          }
        });
      }
      assert.equal(Object.keys(seen).length, w.cities.length, n + 'p seed ' + seed + ' disconnected');
      for (var i = 0; i < w.roads.length; i++) {
        var a = w.cities[w.roads[i][0]];
        var b = w.cities[w.roads[i][1]];
        assert.ok(!(a.kind === 'capital' && b.kind === 'capital'));
        for (var k = i + 1; k < w.roads.length; k++) {
          var r = w.roads[k];
          if (r.indexOf(a.id) >= 0 || r.indexOf(b.id) >= 0) continue;
          var c1 = w.cities[r[0]];
          var c2 = w.cities[r[1]];
          assert.ok(!YG.segmentsCross(a.x, a.y, b.x, b.y, c1.x, c1.y, c2.x, c2.y), 'roads cross');
        }
      }
    }
  });
});

test('连线：只能连有道路相连的城池，连线后持续出兵并攻占', function () {
  var w = makeWorld(5, 3);
  var cap = w.cities[w.players[0].capitalId];
  var far = w.cities.find(function (c) { return c.id !== cap.id && !w.isAdjacent(cap.id, c.id); });
  assert.equal(w.link(0, cap.id, far.id), 'noroad');
  var target = neighbor(w, cap.id, function (c) { return c.owner < 0; });
  target.troops = 10;
  cap.troops = 60;
  assert.equal(w.link(0, cap.id, target.id), 'linked');
  assert.equal(w.link(0, cap.id, target.id), 'exists');
  w.step(1);
  assert.ok(cap.troops < 60, '源城池持续出兵');
  runUntil(w, function () { return target.owner === 0; }, 30);
  assert.equal(target.owner, 0);
  // 攻下后连线保留，变成向新城池输送兵力
  assert.ok(w.findLink(cap.id, target.id));
  var t0 = target.troops;
  run(w, 3);
  assert.ok(target.troops > t0, '继续输送兵力');
});

test('连线：流量随城内兵力增加，兵少时等产兵', function () {
  var w = makeWorld(5, 3);
  var cap = w.cities[w.players[0].capitalId];
  cap.troops = 10;
  var small = w.linkRate(cap);
  cap.troops = 100;
  assert.ok(w.linkRate(cap) > small);
  assert.ok(w.linkRate(cap) <= YG.LINK_RATE_MAX);
  var target = neighbor(w, cap.id);
  cap.troops = 0;
  w.link(0, cap.id, target.id);
  run(w, 5);
  assert.ok(cap.troops >= 0, '兵力不会被扣成负数');
});

test('连线：主城出兵至少留守三成兵力', function () {
  var w = makeWorld(5, 3);
  var cap = w.cities[w.players[0].capitalId];
  var target = neighbor(w, cap.id, function (c) { return c.owner < 0; });
  target.troops = 500;
  cap.troops = 60;
  w.link(0, cap.id, target.id);
  run(w, 40);
  assert.ok(cap.troops >= w.cityCap(cap) * YG.CAPITAL_GUARD - 1e-9, 'capital kept ' + cap.troops);
  assert.ok(target.troops < 500, '仍在持续进攻');
});

test('连线：不能从别人的城池或向免战的主城连线', function () {
  var w = makeWorld(5, 3);
  var other = w.cities[w.players[1].capitalId];
  var nb = neighbor(w, other.id);
  assert.equal(w.link(0, other.id, nb.id), 'invalid');
  nb.owner = 0;
  assert.equal(w.link(0, nb.id, other.id), 'shield');
  other.shieldT = 0;
  assert.equal(w.link(0, nb.id, other.id), 'linked');
});

test('连线：超出连线上限时替换最早的一条；可以断开', function () {
  var w = makeWorld(6, 9);
  var c = w.cities.find(function (x) { return x.kind === 'city' && !x.center && w.adj[x.id].length >= 3; });
  c.owner = 0;
  c.level = 1;
  var nb = w.adj[c.id];
  w.cities[nb[0]].shieldT = 0;
  w.cities[nb[1]].shieldT = 0;
  assert.equal(w.maxLinks(c), 1);
  w.link(0, c.id, nb[0]);
  w.link(0, c.id, nb[1]);
  assert.equal(w.linksFrom(c.id).length, 1);
  assert.equal(w.linksFrom(c.id)[0].to, nb[1]);
  assert.equal(w.toggleLink(0, c.id, nb[1]), 'unlinked');
  assert.equal(w.linksFrom(c.id).length, 0);
  c.level = 3;
  assert.equal(w.maxLinks(c), 3);
  w.link(0, c.id, nb[0]);
  w.link(0, c.id, nb[1]);
  assert.equal(w.cutLinks(0, c.id), 2);
});

test('连线：源城池失守连线消失；目标被第三方攻下时自动断开', function () {
  var w = makeWorld(6, 12);
  var cap = w.cities[w.players[0].capitalId];
  var mid = neighbor(w, cap.id, function (c) { return c.owner < 0; });
  w.link(0, cap.id, mid.id);
  w.capture(mid, 1, 5);
  assert.equal(w.findLink(cap.id, mid.id), null, '目标换了主人，连线自动断开');

  var src = neighbor(w, cap.id, function (c) { return c.owner < 0; }) || mid;
  src.owner = 0;
  var tgt = neighbor(w, src.id, function (c) { return c.id !== cap.id; });
  tgt.shieldT = 0;
  w.link(0, src.id, tgt.id);
  w.capture(src, 2, 5);
  assert.equal(w.findLink(src.id, tgt.id), null, '源城池失守，连线失效');
});

test('兵种：兵营出重戟兵（攻击 ×1.5），马场出骑兵（更快）', function () {
  var w = makeWorld(6, 11);
  var b = w.cities.find(function (c) { return c.kind === 'barracks'; });
  var s = w.cities.find(function (c) { return c.kind === 'stable'; });
  b.owner = 0;
  s.owner = 0;
  b.troops = 40;
  s.troops = 40;
  var tb = neighbor(w, b.id);
  var ts = neighbor(w, s.id);
  tb.shieldT = 0;
  ts.shieldT = 0;
  assert.equal(w.link(0, b.id, tb.id), 'linked');
  assert.equal(w.link(0, s.id, ts.id), 'linked');
  w.step(0.3);
  var heavy = w.packets.filter(function (p) { return p.heavy; });
  var cav = w.packets.filter(function (p) { return p.cavalry; });
  assert.ok(heavy.length > 0 && heavy[0].atk === 1.5);
  assert.ok(cav.length > 0 && cav[0].speed > YG.UNIT_SPEED * 1.5);
});

test('箭塔：射杀射程内的敌兵', function () {
  var w = makeWorld(5, 5);
  var tower = w.cities.find(function (c) { return c.kind === 'tower'; });
  tower.owner = 1;
  w.packets.push({ id: 999, owner: 0, to: tower.id, x: tower.x + 60, y: tower.y, count: 5, atk: 1, speed: 0, dead: false, intent: 1 });
  w.stepCities(0.05);
  assert.equal(w.packets[0].count, 4);
  assert.ok(w.events.some(function (e) { return e.type === 'shot'; }));
});

test('无懈可击 / 免战：护盾期间攻击无效', function () {
  var w = makeWorld(5, 8);
  var cap = w.cities[w.players[1].capitalId];
  var before = cap.troops;
  w.arrive({ owner: 0, count: 500, atk: 1, intent: 1 }, cap);
  assert.equal(cap.troops, before);
  assert.equal(cap.owner, 1);
});

test('升级：消耗兵力，提升等级、上限和产量', function () {
  var w = makeWorld(5, 9);
  var cap = w.cities[w.players[0].capitalId];
  cap.troops = 60;
  var cost = w.upgradeCost(cap);
  var capBefore = w.cityCap(cap);
  var prodBefore = w.cityProd(cap);
  assert.ok(w.upgrade(0, cap.id));
  assert.equal(cap.level, 2);
  assert.equal(cap.troops, 60 - cost);
  assert.ok(w.cityCap(cap) > capBefore);
  assert.ok(w.cityProd(cap) > prodBefore);
  cap.troops = 1;
  assert.equal(w.upgrade(0, cap.id), false, '兵力不足不能升级');
});

test('攻破主城：阵亡、亮身份、残城中立、行军部队溃散', function () {
  var w = makeWorld(6, 21);
  var victim = w.players.find(function (p) { return p.role !== R.LORD; });
  var killer = w.players.find(function (p) { return p.id !== victim.id; });
  var extra = w.cities.find(function (c) { return c.owner < 0 && !c.center; });
  extra.owner = victim.id;
  var cap = w.cities[victim.capitalId];
  cap.shieldT = 0;
  w.packets.push({ id: 1, owner: victim.id, to: extra.id, x: 0, y: 0, count: 5, atk: 1, speed: 1, dead: false });
  w.arrive({ owner: killer.id, count: 1000, atk: 1, intent: victim.id }, cap);
  assert.equal(victim.alive, false);
  assert.equal(cap.owner, killer.id);
  assert.equal(cap.kind, 'city', '主城被攻破后变为普通城池');
  assert.equal(extra.owner, -1);
  assert.ok(w.packets[0].dead);
  var ev = w.events.find(function (e) { return e.type === 'eliminate'; });
  assert.equal(ev.victim, victim.id);
  assert.equal(ev.role, victim.role);
});

test('奖惩：击杀反贼摸两张锦囊', function () {
  var w = makeWorld(6, 4);
  var rebel = byRole(w, R.REBEL)[0];
  var loyal = byRole(w, R.LOYAL)[0];
  loyal.hand = [];
  w.eliminate(rebel.id, loyal.id);
  assert.equal(loyal.hand.length, 2);
});

test('奖惩：主公误杀忠臣，弃光锦囊且兵力减半', function () {
  var w = makeWorld(5, 4);
  var lord = w.players[w.lordId];
  var loyal = byRole(w, R.LOYAL)[0];
  var cap = w.cities[lord.capitalId];
  cap.troops = 80;
  lord.hand = ['tao', 'wuzhong'];
  w.eliminate(loyal.id, lord.id);
  assert.equal(lord.hand.length, 0);
  assert.equal(cap.troops, 40);
});

test('胜负：反贼与内奸全灭 → 主公与忠臣胜', function () {
  var w = makeWorld(5, 1);
  var lord = w.players[w.lordId];
  byRole(w, R.REBEL).concat(byRole(w, R.SPY)).forEach(function (p) { w.eliminate(p.id, lord.id); });
  assert.equal(w.winner.side, 'lord');
  var winners = w.winner.winners.map(function (id) { return w.players[id].role; }).sort();
  assert.deepEqual(winners, ['lord', 'loyal']);
});

test('胜负：阵亡的忠臣也随主公一起获胜', function () {
  var w = makeWorld(5, 2);
  var lord = w.players[w.lordId];
  var loyal = byRole(w, R.LOYAL)[0];
  var rebels = byRole(w, R.REBEL);
  w.eliminate(loyal.id, rebels[0].id);
  rebels.concat(byRole(w, R.SPY)).forEach(function (p) { w.eliminate(p.id, lord.id); });
  assert.equal(w.winner.side, 'lord');
  assert.ok(w.winner.winners.indexOf(loyal.id) >= 0);
});

test('胜负：主公阵亡但场上不止内奸一人 → 反贼胜（即使反贼已全灭）', function () {
  var w = makeWorld(5, 3);
  var spy = byRole(w, R.SPY)[0];
  var lord = w.players[w.lordId];
  byRole(w, R.REBEL).forEach(function (p) { w.eliminate(p.id, spy.id); });
  assert.equal(w.winner, null);
  w.eliminate(lord.id, spy.id); // 忠臣还活着
  assert.equal(w.winner.side, 'rebel');
});

test('胜负：内奸最后单挑杀死主公 → 内奸胜', function () {
  var w = makeWorld(5, 4);
  var spy = byRole(w, R.SPY)[0];
  var lord = w.players[w.lordId];
  byRole(w, R.REBEL).concat(byRole(w, R.LOYAL)).forEach(function (p) { w.eliminate(p.id, spy.id); });
  assert.equal(w.winner, null);
  w.eliminate(lord.id, spy.id);
  assert.equal(w.winner.side, 'spy');
  assert.deepEqual(w.winner.winners, [spy.id]);
});

test('胜负：反贼攻破主公 → 反贼胜', function () {
  var w = makeWorld(8, 5);
  var rebel = byRole(w, R.REBEL)[0];
  w.eliminate(w.lordId, rebel.id);
  assert.equal(w.winner.side, 'rebel');
  assert.equal(w.winner.winners.length, 4);
});

test('名声：打主公会「疑反」，打疑反者会「疑忠」', function () {
  var w = makeWorld(6, 6);
  var others = w.players.filter(function (p) { return p.role !== R.LORD; });
  var a = others[0];
  var b = others[1];
  w.recordHostility(a.id, w.lordId, 30);
  assert.ok(a.rep <= -YG.REP_TAG);
  assert.equal(w.repTag(a.id), '疑反');
  w.recordHostility(b.id, a.id, 30);
  assert.ok(b.rep >= YG.REP_TAG);
  assert.equal(w.repTag(b.id), '疑忠');
  assert.equal(w.repTag(w.lordId), null, '主公身份公开，不需要名声标签');
});

test('名声：目标在行军途中易主，不算主动攻击', function () {
  var w = makeWorld(6, 6);
  var other = w.players.find(function (p) { return p.role !== R.LORD; });
  var lordCity = w.cities.find(function (c) { return c.owner < 0; });
  lordCity.owner = w.lordId;
  lordCity.troops = 10;
  w.arrive({ owner: other.id, count: 5, atk: 1, intent: -1 }, lordCity); // 出兵时还是中立
  assert.equal(other.rep, 0);
  w.arrive({ owner: other.id, count: 5, atk: 1, intent: w.lordId }, lordCity);
  assert.ok(other.rep < 0);
});

test('锦囊：各效果生效，目标合法性检查', function () {
  var w = makeWorld(5, 12);
  var p = w.players[0];
  var mine = w.cities[p.capitalId];
  var theirs = w.cities[w.players[1].capitalId];
  var neutral = w.cities.find(function (c) { return c.owner < 0; });

  p.hand = ['wuzhong', 'wanjian', 'nanman', 'tao', 'wuxie'];
  assert.equal(w.playCard(0, 0, theirs.id), false, '无中生有只能给自己');
  var t0 = mine.troops;
  assert.ok(w.playCard(0, 0, mine.id));
  assert.equal(mine.troops, t0 + 25);

  neutral.troops = 20;
  assert.ok(w.playCard(0, 0, neutral.id)); // 万箭齐发
  assert.ok(Math.abs(neutral.troops - 11) < 1e-9);

  var e0 = theirs.troops;
  assert.ok(w.playCard(0, 0, -1)); // 南蛮入侵
  assert.ok(Math.abs(theirs.troops - e0 * 0.8) < 1e-9);

  var m0 = mine.troops;
  assert.ok(w.playCard(0, 0, -1)); // 桃
  assert.equal(mine.troops, m0 + 8);

  mine.shieldT = 0;
  assert.ok(w.playCard(0, 0, mine.id)); // 无懈可击
  assert.equal(mine.shieldT, 8);
  assert.equal(p.hand.length, 0);
});

test('摸牌：定时获得锦囊且不超过手牌上限', function () {
  var w = makeWorld(5, 13);
  var p = w.players[0];
  run(w, YG.CARD_INTERVAL * 6);
  assert.ok(p.hand.length <= YG.HAND_MAX);
  assert.equal(p.hand.length, YG.HAND_MAX);
});

test('后期：阴兵暴动加快连线出兵、降低城防', function () {
  var w = makeWorld(5, 14);
  var cap = w.cities[w.players[0].capitalId];
  var def0 = w.cityDef(cap);
  run(w, YG.SURGE[YG.SURGE.length - 1].t + 1);
  assert.ok(w.flowMult > 1);
  assert.ok(w.cityDef(cap) < def0);
});

/** 找一座与主公城池相邻的城池交给 giver，返回 [源城池, 主公城池] */
function besideLord(w, giver) {
  var lordCity = w.cities[w.players[w.lordId].capitalId];
  var src = neighbor(w, lordCity.id);
  src.owner = giver.id;
  src.troops = 60;
  return [src, lordCity];
}

test('进贡：援军沿道路进入相邻的主公城池，进贡者名声变为疑忠', function () {
  var w = makeWorld(6, 31);
  var giver = w.players.find(function (p) { return p.role !== R.LORD; });
  var pair = besideLord(w, giver);
  var lordCap = pair[1];
  var before = lordCap.troops;
  assert.ok(w.tribute(giver.id, pair[0].id, lordCap.id, 0.5) > 0);
  runUntil(w, function () { return !w.streams.length && !w.packets.length; }, 60);
  assert.equal(lordCap.owner, w.lordId);
  assert.ok(lordCap.troops > before + 20, 'lord capital reinforced: ' + before + ' -> ' + lordCap.troops);
  assert.equal(w.repTag(giver.id), '疑忠');
});

test('进贡：只能进贡给相邻的主公城池，主公自己不能进贡', function () {
  var w = makeWorld(6, 32);
  var a = w.players.find(function (p) { return p.role !== R.LORD; });
  var b = w.players.find(function (p) { return p.role !== R.LORD && p.id !== a.id; });
  w.cities[a.capitalId].troops = 50;
  assert.equal(w.tribute(a.id, a.capitalId, b.capitalId, 0.5), 0);
  var lord = w.players[w.lordId];
  assert.equal(w.tribute(lord.id, lord.capitalId, a.capitalId, 0.5), 0);
  var lordCity = w.cities[lord.capitalId];
  var far = w.cities.find(function (c) { return c.owner < 0 && !w.isAdjacent(c.id, lordCity.id); });
  far.owner = a.id;
  far.troops = 50;
  assert.equal(w.tribute(a.id, far.id, lordCity.id, 0.5), 0, '没有道路不能进贡');
});

test('进贡：主公的箭塔和部队不会拦截援军', function () {
  var w = makeWorld(6, 33);
  var tower = w.cities.find(function (c) { return c.kind === 'tower'; });
  tower.owner = w.lordId;
  var giver = w.players.find(function (p) { return p.role !== R.LORD; });
  w.packets.push({ id: 1, owner: giver.id, to: tower.id, x: tower.x + 50, y: tower.y, count: 5, atk: 1, speed: 0, dead: false, intent: -1, aid: true });
  w.stepCities(0.05);
  assert.equal(w.packets[0].count, 5);
  var lordPk = { id: 2, owner: w.lordId, to: w.players[w.lordId].capitalId, x: 10, y: 10, count: 5, atk: 1, speed: 0, dead: false, intent: -1 };
  var aidPk = { id: 3, owner: giver.id, to: w.players[w.lordId].capitalId, x: 12, y: 10, count: 5, atk: 1, speed: 0, dead: false, intent: -1, aid: true };
  w.packets = [lordPk, aidPk];
  w.stepPackets(0);
  assert.equal(lordPk.count, 5);
  assert.equal(aidPk.count, 5);
});
