#!/usr/bin/env node
// 把 index.html 和所有脚本打包成一个独立的 HTML 文件（便于分享 / 发到任意静态托管）
// 用法：node tools/build-web.js [输出路径=dist/yuguo-zhengba.html]
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var out = path.resolve(process.argv[2] || path.join(root, 'dist', 'yuguo-zhengba.html'));
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

var count = 0;
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, function (_, src) {
  count++;
  var code = fs.readFileSync(path.join(root, src), 'utf8');
  // 防止脚本内容里出现 </script> 提前结束标签
  return '<script>/* ' + src + ' */\n' + code.replace(/<\/script/gi, '<\\/script') + '</script>';
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('inlined ' + count + ' scripts -> ' + path.relative(process.cwd(), out) + ' (' + Math.round(html.length / 1024) + ' KB)');
