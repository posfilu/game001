// 在 Node 中按浏览器相同的顺序加载游戏核心脚本，返回 YG 命名空间
var path = require('path');

var CORE = ['config.js', 'util.js', 'mapgen.js', 'world.js', 'ai.js'];

module.exports = function loadCore() {
  CORE.forEach(function (f) {
    require(path.join(__dirname, '..', 'js', f));
  });
  return globalThis.YG;
};

module.exports.CORE = CORE;
