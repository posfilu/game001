/* 通用工具：可复现随机数、几何、颜色 */
(function (root) {
  var YG = root.YG || (root.YG = {});

  // mulberry32：同一个种子得到同一局地图和 AI 行为，便于测试和复盘
  function Rng(seed) {
    this.s = (seed >>> 0) || 1;
  }
  Rng.prototype.next = function () {
    var t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.range = function (a, b) {
    return a + (b - a) * this.next();
  };
  Rng.prototype.int = function (a, b) {
    // [a, b]
    return a + Math.floor(this.next() * (b - a + 1));
  };
  Rng.prototype.pick = function (arr) {
    return arr[Math.floor(this.next() * arr.length)];
  };
  Rng.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  };
  Rng.prototype.weighted = function (items, weightOf) {
    var total = 0;
    for (var i = 0; i < items.length; i++) total += weightOf(items[i]);
    var r = this.next() * total;
    for (var k = 0; k < items.length; k++) {
      r -= weightOf(items[k]);
      if (r <= 0) return items[k];
    }
    return items[items.length - 1];
  };

  function dist(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 线段 (x1,y1)-(x2,y2) 与 (x3,y3)-(x4,y4) 是否相交 */
  function segmentsCross(x1, y1, x2, y2, x3, y3, x4, y4) {
    function orient(ax, ay, bx, by, cx, cy) {
      return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    }
    var o1 = orient(x1, y1, x2, y2, x3, y3);
    var o2 = orient(x1, y1, x2, y2, x4, y4);
    var o3 = orient(x3, y3, x4, y4, x1, y1);
    var o4 = orient(x3, y3, x4, y4, x2, y2);
    return o1 * o2 <= 0 && o3 * o4 <= 0 && !(o1 === 0 && o2 === 0);
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // 按比例混合两种颜色，返回 rgb() 字符串
  function mix(hexA, hexB, t) {
    var a = hexToRgb(hexA);
    var b = hexToRgb(hexB);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  function alpha(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  function formatTime(sec) {
    var s = Math.floor(sec);
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  YG.Rng = Rng;
  YG.dist = dist;
  YG.clamp = clamp;
  YG.segmentsCross = segmentsCross;
  YG.mix = mix;
  YG.alpha = alpha;
  YG.formatTime = formatTime;
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : globalThis);
