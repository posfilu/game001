#!/usr/bin/env node
// 全 AI 对局批量模拟：检查对局能否结束，并统计各阵营胜率
// 用法：node tools/simulate.js [局数=60] [难度=normal]
var YG = require('./load')();

var games = parseInt(process.argv[2] || '60', 10);
var difficulty = process.argv[3] || 'normal';
var DT = 1 / 20;
var LIMIT = 30 * 60;

function runGame(seed, numPlayers) {
  var w = new YG.World({ seed: seed, numPlayers: numPlayers, difficulty: difficulty });
  var ais = w.players.map(function (p) { return new YG.AI(w, p.id); });
  while (!w.winner && w.t < LIMIT) {
    for (var i = 0; i < ais.length; i++) ais[i].update(DT);
    w.step(DT);
    w.events.length = 0;
  }
  return w;
}

var stats = {};
var started = Date.now();
[5, 6, 8].forEach(function (n) {
  var s = (stats[n] = { lord: 0, rebel: 0, spy: 0, timeout: 0, totalT: 0, maxT: 0 });
  for (var g = 0; g < games; g++) {
    var w = runGame(1000 + g * 7919 + n, n);
    if (!w.winner) s.timeout++;
    else {
      s[w.winner.side]++;
      s.totalT += w.winner.t;
      s.maxT = Math.max(s.maxT, w.winner.t);
    }
  }
  var done = games - s.timeout;
  console.log(
    n + '人局  主忠胜 ' + s.lord + '  反贼胜 ' + s.rebel + '  内奸胜 ' + s.spy + '  超时 ' + s.timeout +
      '  平均时长 ' + YG.formatTime(done ? s.totalT / done : 0) + '  最长 ' + YG.formatTime(s.maxT)
  );
});
console.log('耗时 ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
