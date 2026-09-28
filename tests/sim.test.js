// 全 AI 对局：每局都要在限定时间内结束，且胜负结果符合身份局规则
var test = require('node:test');
var assert = require('node:assert/strict');
var YG = require('../tools/load')();

var R = YG.ROLE;
var DT = 1 / 20;
var LIMIT = 25 * 60;

function play(seed, n, difficulty) {
  var w = new YG.World({ seed: seed, numPlayers: n, difficulty: difficulty });
  var ais = w.players.map(function (p) { return new YG.AI(w, p.id); });
  while (!w.winner && w.t < LIMIT) {
    for (var i = 0; i < ais.length; i++) ais[i].update(DT);
    w.step(DT);
    w.events.length = 0;
  }
  return w;
}

function checkOutcome(w) {
  var lord = w.players[w.lordId];
  var alive = w.players.filter(function (p) { return p.alive; });
  switch (w.winner.side) {
    case 'lord':
      assert.ok(lord.alive);
      assert.ok(alive.every(function (p) { return p.role === R.LORD || p.role === R.LOYAL; }));
      break;
    case 'rebel':
      assert.ok(!lord.alive);
      assert.ok(!(alive.length === 1 && alive[0].role === R.SPY));
      break;
    case 'spy':
      assert.ok(!lord.alive);
      assert.equal(alive.length, 1);
      assert.equal(alive[0].role, R.SPY);
      break;
    default:
      assert.fail('unknown side ' + w.winner.side);
  }
  // 兵力与城池数据保持合法
  w.cities.forEach(function (c) {
    assert.ok(Number.isFinite(c.troops) && c.troops >= 0, 'city troops ' + c.troops);
    assert.ok(c.level >= 1 && c.level <= YG.MAX_LEVEL);
  });
}

[5, 6, 8].forEach(function (n) {
  ['easy', 'normal', 'hard'].forEach(function (diff) {
    test(n + ' 人局 / ' + diff + '：AI 对局能正常结束', function () {
      for (var s = 0; s < 4; s++) {
        var w = play(777 + s * 31 + n, n, diff);
        assert.ok(w.winner, 'seed ' + (777 + s * 31 + n) + ' did not finish in time');
        checkOutcome(w);
      }
    });
  });
});

test('同一种子的 AI 对局完全可复现', function () {
  var a = play(2024, 6, 'normal');
  var b = play(2024, 6, 'normal');
  assert.equal(a.winner.side, b.winner.side);
  assert.equal(a.winner.t, b.winner.t);
});
