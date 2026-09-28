/* 地图生成：主城环形分布，其余城池泊松采样散布，中心是中立大城「酆都」 */
(function (root) {
  var YG = root.YG || (root.YG = {});

  function farEnough(list, x, y, minD) {
    for (var i = 0; i < list.length; i++) {
      var need = list[i].kind === 'capital' ? minD * 1.2 : minD;
      if (YG.dist(list[i].x, list[i].y, x, y) < need) return false;
    }
    return true;
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

    // 装饰用道路：每座城连向最近的两座城
    var roads = [];
    var seen = {};
    for (var r = 0; r < cities.length; r++) {
      var near = cities
        .filter(function (o) { return o !== cities[r]; })
        .map(function (o) { return { o: o, d: YG.dist(o.x, o.y, cities[r].x, cities[r].y) }; })
        .sort(function (p, q) { return p.d - q.d; })
        .slice(0, 2);
      for (var q = 0; q < near.length; q++) {
        var a = Math.min(r, near[q].o.id);
        var b = Math.max(r, near[q].o.id);
        if (!seen[a + '_' + b] && near[q].d < 260) {
          seen[a + '_' + b] = true;
          roads.push([a, b]);
        }
      }
    }

    return { cities: cities, roads: roads, capitals: capitals };
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : globalThis);
