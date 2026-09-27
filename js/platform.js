/*
 * 平台适配层：把画布、触摸、存储、离屏画布统一成同一套接口。
 *   - createBrowserPlatform(canvas)：网页 / H5
 *   - createTTPlatform()：抖音小游戏（tt.*）
 */
(function (root) {
  var YG = root.YG || (root.YG = {});

  function safeParse(s) {
    try {
      return s == null || s === '' ? null : JSON.parse(s);
    } catch (e) {
      return null;
    }
  }

  YG.createBrowserPlatform = function (canvas) {
    var ctx = canvas.getContext('2d');
    var activePointer = null;
    return {
      name: 'browser',
      canvas: canvas,
      ctx: ctx,
      dpr: function () {
        return Math.min(window.devicePixelRatio || 1, 3);
      },
      // 以画布容器的尺寸为准（容器可能因安全区留白而小于窗口）
      getSize: function () {
        var box = canvas.parentElement;
        if (box && box !== document.body && box.clientWidth > 0 && box.clientHeight > 0) {
          return { w: box.clientWidth, h: box.clientHeight };
        }
        return { w: window.innerWidth, h: window.innerHeight };
      },
      applySize: function (w, h, dpr) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      },
      onResize: function (cb) {
        window.addEventListener('resize', cb);
        if (window.ResizeObserver && canvas.parentElement) new window.ResizeObserver(cb).observe(canvas.parentElement);
      },
      onPointer: function (down, move, up) {
        canvas.addEventListener('pointerdown', function (e) {
          if (activePointer !== null) return;
          activePointer = e.pointerId;
          try {
            canvas.setPointerCapture(e.pointerId);
          } catch (err) { /* 某些浏览器不支持 */ }
          e.preventDefault();
          down(e.clientX, e.clientY);
        });
        canvas.addEventListener('pointermove', function (e) {
          if (e.pointerId !== activePointer) return;
          e.preventDefault();
          move(e.clientX, e.clientY);
        });
        function end(e) {
          if (e.pointerId !== activePointer) return;
          activePointer = null;
          e.preventDefault();
          up(e.clientX, e.clientY);
        }
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      },
      raf: function (fn) {
        return window.requestAnimationFrame(fn);
      },
      createCanvas: function (w, h) {
        var c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
      },
      storage: {
        get: function (k) {
          try {
            return safeParse(window.localStorage.getItem(k));
          } catch (e) {
            return null;
          }
        },
        set: function (k, v) {
          try {
            window.localStorage.setItem(k, JSON.stringify(v));
          } catch (e) { /* 隐私模式等情况下忽略 */ }
        }
      },
      font: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif',
      titleFont: '"Ma Shan Zheng","STKaiti","KaiTi","Kaiti SC","Noto Serif CJK SC","Noto Serif SC","Songti SC",serif'
    };
  };

  YG.createTTPlatform = function () {
    /* global tt, requestAnimationFrame */
    var sys = tt.getSystemInfoSync();
    var canvas = tt.createCanvas(); // 第一次调用得到的是上屏画布
    var ctx = canvas.getContext('2d');
    var touchId = null;
    function pick(e) {
      var list = e.changedTouches || e.touches || [];
      for (var i = 0; i < list.length; i++) {
        if (touchId === null || list[i].identifier === touchId) return list[i];
      }
      return null;
    }
    if (tt.onShareAppMessage) {
      tt.onShareAppMessage(function () {
        return { title: '狱国争霸：主公、忠臣、反贼、内奸，谁能独霸狱国？' };
      });
    }
    if (tt.showShareMenu) tt.showShareMenu({});
    return {
      name: 'tt',
      canvas: canvas,
      ctx: ctx,
      dpr: function () {
        return Math.min(sys.pixelRatio || 2, 3);
      },
      getSize: function () {
        return { w: sys.windowWidth, h: sys.windowHeight };
      },
      applySize: function (w, h, dpr) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      },
      onResize: function (cb) {
        if (!tt.onWindowResize) return;
        tt.onWindowResize(function (r) {
          sys.windowWidth = r.windowWidth;
          sys.windowHeight = r.windowHeight;
          cb();
        });
      },
      onPointer: function (down, move, up) {
        tt.onTouchStart(function (e) {
          if (touchId !== null) return;
          var t = (e.changedTouches || [])[0];
          if (!t) return;
          touchId = t.identifier;
          down(t.clientX, t.clientY);
        });
        tt.onTouchMove(function (e) {
          var t = pick(e);
          if (t && touchId !== null) move(t.clientX, t.clientY);
        });
        function end(e) {
          var t = pick(e);
          if (!t || touchId === null) return;
          touchId = null;
          up(t.clientX, t.clientY);
        }
        tt.onTouchEnd(end);
        tt.onTouchCancel(end);
      },
      raf: function (fn) {
        return requestAnimationFrame(fn);
      },
      createCanvas: function (w, h) {
        var c = tt.createCanvas();
        c.width = w;
        c.height = h;
        return c;
      },
      storage: {
        get: function (k) {
          try {
            return safeParse(tt.getStorageSync(k));
          } catch (e) {
            return null;
          }
        },
        set: function (k, v) {
          try {
            tt.setStorageSync(k, JSON.stringify(v));
          } catch (e) { /* 忽略 */ }
        }
      },
      font: 'sans-serif',
      titleFont: 'serif'
    };
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : globalThis);
