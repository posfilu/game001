// 抖音小游戏入口：按顺序加载各模块（它们都挂在 GameGlobal.YG 上），然后启动
require('./js/config.js');
require('./js/util.js');
require('./js/mapgen.js');
require('./js/world.js');
require('./js/ai.js');
require('./js/render.js');
require('./js/scenes.js');
require('./js/platform.js');
require('./js/main.js');

GameGlobal.YG.boot(GameGlobal.YG.createTTPlatform());
