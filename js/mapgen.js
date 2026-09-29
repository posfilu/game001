/* 地图生成：主城环形分布，其余城池泊松采样散布，中心是中立大城「酆都」；城池之间修建道路网 */
(function (root) {
  var YG = root.YG || (root.YG = {});

  function farEnough(list, x, y, minD) {
    for (var i = 0; i < list.length; i++) {
      var need = list[i].kind === 'capital' ? minD * 1.2 : minD;
      if (YG.dist(list[i].x, list[i].y, x, y) < need) return false;
    }
    return true;
  }

  // 两条线段是否在内部相交（共享端点不算）
  function crosses(a, b, c, d) {
    if (a === c || a === d || b === c || b === d) return false;
    function orient(p, q, r) {
      return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    }
    var o1 = orient(a, b, c);
    var o2 = orient(a, b, d);
    var o3 = orient(c, d, a);
    var o4 = orient(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
  }

  function distToSegment(p, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var len2 = dx * dx + dy * dy || 1;
    var t = YG.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
    return YG.dist(p.x, p.y, a.x + dx * t, a.y + dy * t);
  }

  /**
   * 道路网：先用最短边把所有城池连通（Kruskal），再补充不交叉的短边。
   * 道路不交叉、不穿过其他城池，相邻主城之间不直接修路。
   */
  function buildRoads(cities) {
    var n = cities.length;
    var cand = [];
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        cand.push({ a: i, b: j, d: YG.dist(cities[i].x, cities[i].y, cities[j].x, cities[j].y) });
      }
    }
    cand.sort(function (p, q) { return p.d - q.d; });

    var roads = [];
    var deg = [];
    var parent = [];
    for (var k = 0; k < n; k++) {
      deg.push(0);
      parent.push(k);
    }
    function find(x) {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    }
    function clear(e) {
      var A = cities[e.a];
      var B = cities[e.b];
      for (var r = 0; r < roads.length; r++) {
        if (crosses(A, B, cities[roads[r][0]], cities[roads[r][1]])) return false;
      }
      for (var c = 0; c < n; c++) {
        if (c === e.a || c === e.b) continue;
        var rad = YG.CITY_KIND[cities[c].kind].radius + 14;
        if (distToSegment(cities[c], A, B) < rad) return false;
      }
      return true;
    }
    function add(e) {
      roads.push([e.a, e.b]);
      deg[e.a]++;
      deg[e.b]++;
      parent[find(e.a)] = find(e.b);
      e.used = true;
    }

    // 1. 连通：最短边优先，只连接不同的连通块
    for (var pass = 0; pass < 2; pass++) {
      for (var m = 0; m < cand.length; m++) {
        var e = cand[m];
        if (e.used || find(e.a) === find(e.b)) continue;
        if (pass === 0 && e.d > YG.ROAD_MAX_LEN * 1.3) continue;
        if (clear(e)) add(e);
      }
    }
    // 2. 补路：不交叉的短边，控制每座城的道路数
    for (var x = 0; x < cand.length; x++) {
      var f = cand[x];
      if (f.used || f.d > YG.ROAD_MAX_LEN) continue;
      if (deg[f.a] >= YG.ROAD_MAX_DEGREE || deg[f.b] >= YG.ROAD_MAX_DEGREE) continue;
      if (cities[f.a].kind === 'capital' && cities[f.b].kind === 'capital') continue;
      if (clear(f)) add(f);
    }
    return roads;
  }

  /**
   * @param {YG.Rng} rng
   * @param {number} numPlayers
   * @param {{x:number,y:number,w:number,h:number}} rect 地图可用区域
   */
  YG.generateMap = function (rng, numPlayers, rect) {
    var cities = [];
    // 可摆放区域：上方留出护盾倒计时，下方留出城名和等级
    var inner = { x: rect.x + 36, y: rect.y + 46, w: rect.w - 72, h: rect.h - 46 - 52 };
    var cx = inner.x + inner.w / 2;
    var cy = inner.y + inner.h / 2;
    var rx = inner.w / 2 - 10;
    var ry = inner.h / 2 - 16;

    // 主城：椭圆上等分，带少量抖动
    var a0 = rng.next() * Math.PI * 2;
    for (var i = 0; i < numPlayers; i++) {
      var ang = a0 + (i * Math.PI * 2) / numPlayers + rng.range(-0.1, 0.1);
      cities.push({
        x: cx + Math.cos(ang) * rx * 0.94,
        y: cy + Math.sin(ang) * ry * 0.94,
        kind: 'capital'
      });
    }

    // 中心大城
    cities.push({ x: cx, y: cy, kind: 'city', center: true });

    var target = Math.round(numPlayers * 3.2 + 8);
    var minD = Math.min(96, Math.sqrt((inner.w * inner.h) / target) * 0.75);
    var attempts = 0;
    while (cities.length < target && attempts < 6000) {
      attempts++;
      if (attempts % 1500 === 0) minD *= 0.92;
      var x = rng.range(inner.x, inner.x + inner.w);
      var y = rng.range(inner.y, inner.y + inner.h);
      if (farEnough(cities, x, y, minD)) cities.push({ x: x, y: y, kind: 'city' });
    }

    // 普通城池里随机分配特殊建筑
    var normals = [];
    for (var n = 0; n < cities.length; n++) {
      if (cities[n].kind === 'city' && !cities[n].center) normals.push(cities[n]);
    }
    rng.shuffle(normals);
    var nTower = Math.round(normals.length * 0.16);
    var nBarracks = Math.round(normals.length * 0.16);
    var nStable = Math.round(normals.length * 0.14);
    for (var k = 0; k < normals.length; k++) {
      if (k < nTower) normals[k].kind = 'tower';
      else if (k < nTower + nBarracks) normals[k].kind = 'barracks';
      else if (k < nTower + nBarracks + nStable) normals[k].kind = 'stable';
    }

    var names = rng.shuffle(YG.CITY_NAMES.filter(function (s) { return s !== '酆都'; }));
    var nameIdx = 0;
    var capitals = [];
    for (var c = 0; c < cities.length; c++) {
      var city = cities[c];
      city.id = c;
      city.owner = -1;
      city.level = 1;
      city.shieldT = 0;
      city.fireT = 0;
      city.capitalOf = -1;
      city.flash = 0;
      if (city.kind === 'capital') {
        city.capitalOf = capitals.length;
        capitals.push(city.id);
        city.troops = 40;
      } else if (city.center) {
        city.name = '酆都';
        city.level = 2;
        city.troops = 42;
      } else {
        city.name = names[nameIdx++ % names.length];
        var base = { city: [9, 20], tower: [15, 25], barracks: [13, 23], stable: [11, 21] }[city.kind];
        city.troops = rng.int(base[0], base[1]);
        if (rng.next() < 0.18) {
          city.level = 2;
          city.troops += 10;
        }
      }
    }

    var roads = buildRoads(cities);
    var adj = cities.map(function () { return []; });
    for (var e = 0; e < roads.length; e++) {
      adj[roads[e][0]].push(roads[e][1]);
      adj[roads[e][1]].push(roads[e][0]);
    }

    return { cities: cities, roads: roads, adj: adj, capitals: capitals };
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : globalThis);
