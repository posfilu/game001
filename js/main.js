/* 应用外壳：逻辑分辨率适配、主循环、场景切换、存档 */
(function (root) {
  var YG = root.YG || (root.YG = {});

  var LOGICAL_W = 720;
  var SETTINGS_KEY = 'ygzb_settings';
  var RECORD_KEY = 'ygzb_record';

  function App(platform) {
    this.platform = platform;
    YG.FONT = platform.font;
    YG.FONT_TITLE = platform.titleFont;
    this.W = LOGICAL_W;
    var size = platform.getSize();
    // 竖屏手机按屏幕比例拉高画面；横屏 / 电脑上左右留边
    this.H = Math.round(YG.clamp((LOGICAL_W * size.h) / size.w, 1180, 1560));

    var s = platform.storage.get(SETTINGS_KEY) || {};
    this.settings = {
      players: YG.ROLE_SETUP[s.players] ? s.players : 6,
      role: s.role || 'random',
      difficulty: YG.DIFFICULTY[s.difficulty] ? s.difficulty : 'normal'
    };
    this.record = platform.storage.get(RECORD_KEY) || { games: 0, wins: 0, byRole: {} };

    var self = this;
    this.resize();
    platform.onResize(function () { self.resize(); });
    platform.onPointer(
      function (x, y) { self.pointer('onDown', x, y); },
      function (x, y) { self.pointer('onMove', x, y); },
      function (x, y) { self.pointer('onUp', x, y); }
    );
    this.setScene(new YG.MenuScene(this));
    this.last = 0;
    this.frame = function (ts) {
      self.tick(ts);
      platform.raf(self.frame);
    };
    platform.raf(this.frame);
  }

  App.prototype.resize = function () {
    var size = this.platform.getSize();
    var dpr = this.platform.dpr();
    this.platform.applySize(size.w, size.h, dpr);
    this.screen = size;
    this.dpr = dpr;
    this.scale = Math.min(size.w / this.W, size.h / this.H);
    this.ox = (size.w - this.W * this.scale) / 2;
    this.oy = (size.h - this.H * this.scale) / 2;
    this.pixelScale = this.scale * dpr;
  };

  App.prototype.pointer = function (fn, x, y) {
    if (!this.scene) return;
    this.scene[fn]((x - this.ox) / this.scale, (y - this.oy) / this.scale);
  };

  App.prototype.tick = function (ts) {
    var dt = this.last ? Math.min(0.1, Math.max(0, (ts - this.last) / 1000)) : 1 / 60;
    this.last = ts;
    this.scene.update(dt);
    var ctx = this.platform.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = YG.THEME.bg;
    ctx.fillRect(0, 0, this.screen.w * this.dpr, this.screen.h * this.dpr);
    ctx.setTransform(this.pixelScale, 0, 0, this.pixelScale, this.ox * this.dpr, this.oy * this.dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.W, this.H);
    ctx.clip();
    this.scene.draw(ctx);
    ctx.restore();
  };

  App.prototype.setScene = function (scene) {
    this.scene = scene;
  };

  App.prototype.saveSettings = function () {
    this.platform.storage.set(SETTINGS_KEY, this.settings);
  };

  App.prototype.startGame = function () {
    this.setScene(new YG.GameScene(this, {
      players: this.settings.players,
      role: this.settings.role,
      difficulty: this.settings.difficulty
    }));
  };

  App.prototype.finishGame = function (game) {
    var w = game.world;
    var win = w.winner.winners.indexOf(game.human) >= 0;
    var r = this.record;
    r.games++;
    if (win) r.wins++;
    var role = game.me.role;
    r.byRole[role] = r.byRole[role] || { games: 0, wins: 0 };
    r.byRole[role].games++;
    if (win) r.byRole[role].wins++;
    this.platform.storage.set(RECORD_KEY, r);
    this.setScene(new YG.ResultScene(this, game));
  };

  YG.App = App;
  YG.boot = function (platform) {
    return new App(platform);
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : globalThis);
