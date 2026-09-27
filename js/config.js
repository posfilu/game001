/*
 * 狱国争霸 —— 全局配置与数值表
 * 所有脚本都挂在同一个命名空间 YG 上，浏览器 / 抖音小游戏 / Node 测试三端通用。
 */
(function (root) {
  var YG = root.YG || (root.YG = {});

  // ---------- 身份 ----------
  YG.ROLE = { LORD: 'lord', LOYAL: 'loyal', REBEL: 'rebel', SPY: 'spy' };

  YG.ROLE_NAME = { lord: '主公', loyal: '忠臣', rebel: '反贼', spy: '内奸' };

  YG.ROLE_COLOR = { lord: '#f2c94c', loyal: '#56ccf2', rebel: '#eb5757', spy: '#bb6bd9' };

  YG.ROLE_GOAL = {
    lord: '消灭所有反贼和内奸',
    loyal: '保护主公，消灭所有反贼和内奸',
    rebel: '攻破主公的主城',
    spy: '先除掉其他人，最后单挑主公'
  };

  // 与三国杀身份局相同的人数配置
  YG.ROLE_SETUP = {
    5: ['lord', 'loyal', 'rebel', 'rebel', 'spy'],
    6: ['lord', 'loyal', 'rebel', 'rebel', 'rebel', 'spy'],
    8: ['lord', 'loyal', 'loyal', 'rebel', 'rebel', 'rebel', 'rebel', 'spy']
  };

  // 主公的主城开局额外兵力（相当于三国杀主公多一点体力），按人数平衡
  YG.LORD_BONUS = { 5: 0, 6: 10, 8: 0 };
  // AI 反贼对主公的进攻欲望，按人数平衡（5 人局 2 反，8 人局 4 反）
  YG.REBEL_BOLD = { 5: 2, 6: 0.75, 8: 0.8 };

  // ---------- 势力 ----------
  YG.PLAYER_COLORS = ['#e5484d', '#3e8ef7', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#d6409f', '#a18072'];
  YG.NEUTRAL_COLOR = '#5c5560';

  // 十殿阎王争夺狱国
  YG.KING_NAMES = ['秦广王', '楚江王', '宋帝王', '五官王', '阎罗王', '卞城王', '泰山王', '都市王', '平等王', '转轮王'];

  YG.CITY_NAMES = [
    '酆都', '鬼门关', '奈何桥', '望乡台', '忘川', '黄泉路', '孟婆亭', '三生石', '枉死城', '血池',
    '刀山', '火海', '寒冰狱', '拔舌狱', '铁树狱', '孽镜台', '蒸笼狱', '铜柱狱', '油锅狱', '石磨狱',
    '血河', '恶狗岭', '金鸡山', '野鬼村', '阴山', '森罗殿', '轮回井', '判官府', '无常殿', '城隍庙',
    '黑绳狱', '剪刀狱', '阴阳界', '招魂幡', '鬼王殿', '冥河渡', '白骨林', '幽冥台', '牛头寨', '马面营'
  ];

  // ---------- 城池 ----------
  // prod: 每秒产兵（1 级）；cap: 各等级兵力上限；def: 防御系数（攻方伤害 / def）
  YG.CITY_KIND = {
    capital: { label: '都', name: '主城', prod: 1.5, cap: [70, 110, 160], def: 2.0, radius: 34,
      desc: '产兵快、城防高。主城被攻破即阵亡。' },
    city: { label: '城', name: '城池', prod: 1.0, cap: [40, 70, 110], def: 1.0, radius: 26,
      desc: '普通城池，稳定产兵。' },
    barracks: { label: '戟', name: '兵营', prod: 0.9, cap: [40, 70, 110], def: 1.0, radius: 26, atk: 1.5,
      desc: '训练重戟兵，出城兵攻击力 ×1.5。' },
    tower: { label: '塔', name: '箭塔', prod: 0.6, cap: [30, 55, 90], def: 1.5, radius: 26,
      range: [125, 145, 165], fire: [0.9, 0.7, 0.5],
      desc: '自动射杀射程内的敌兵，城防 ×1.5。' },
    stable: { label: '骑', name: '马场', prod: 0.9, cap: [40, 70, 110], def: 1.0, radius: 26, speed: 1.7,
      desc: '训练骑兵，出城兵移动速度 ×1.7。' }
  };

  YG.LEVEL_PROD = [1, 1.45, 1.9];
  YG.UPGRADE_COST = [20, 40]; // 1→2、2→3 需要消耗的兵力
  YG.MAX_LEVEL = 3;

  // ---------- 行军 ----------
  YG.UNIT_SPEED = 62; // 像素 / 秒
  YG.EMIT_INTERVAL = 0.09; // 出兵流发兵间隔
  YG.PACKET_MAX = 12; // 每条出兵流最多拆成几个小队
  YG.COLLIDE_DIST = 11;

  // ---------- 节奏 ----------
  YG.OPENING_SHIELD = 60; // 开局主城免战时间（秒）
  YG.CARD_INTERVAL = 20; // 每 N 秒摸一张锦囊
  YG.HAND_MAX = 3;
  YG.HAND_MAX_REWARD = 4; // 击杀反贼奖励可以超出手牌上限
  // 游戏拖得太久时，阴兵暴动：全场产兵加速
  // 拖到后期城防逐渐崩坏，保证对局能结束
  YG.SURGE = [
    { t: 360, mult: 1.5, def: 1, text: '阴兵暴动！全场产兵 ×1.5' },
    { t: 540, mult: 2, def: 0.7, text: '地府大乱！城防 ×0.7' },
    { t: 720, mult: 2, def: 0.45, text: '城墙崩坏！城防 ×0.45' }
  ];

  // ---------- 锦囊 ----------
  YG.CARDS = {
    wuzhong: { name: '无中生有', target: 'own', weight: 3, desc: '己方一座城池 +25 兵' },
    wanjian: { name: '万箭齐发', target: 'other', weight: 3, desc: '任意一座他方城池兵力 -45%' },
    nanman: { name: '南蛮入侵', target: 'none', weight: 2, desc: '其他所有势力的城池兵力 -20%' },
    tao: { name: '桃', target: 'none', weight: 2, desc: '己方所有城池 +8 兵' },
    wuxie: { name: '无懈可击', target: 'own', weight: 2, desc: '己方一座城池 8 秒内免疫攻击' }
  };
  YG.CARD_IDS = ['wuzhong', 'wanjian', 'nanman', 'tao', 'wuxie'];

  // ---------- 名声（跳忠 / 跳反） ----------
  YG.REP_TAG = 12; // |名声| 超过该值时公开显示「疑忠 / 疑反」
  YG.REP_MAX = 100;

  YG.DIFFICULTY = {
    easy: { name: '简单', think: 3.2, jitter: 1.6, greed: 0.55, cards: 0.5 },
    normal: { name: '普通', think: 2.0, jitter: 1.0, greed: 0.8, cards: 0.85 },
    hard: { name: '困难', think: 1.2, jitter: 0.6, greed: 1.0, cards: 1.0 }
  };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : typeof window !== 'undefined' ? window : globalThis);
