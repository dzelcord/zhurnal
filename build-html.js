// Собирает app/index.html из общей страницы журнала (та же разметка, что и в веб-версии).
const fs = require("fs");
const src = fs.readFileSync(process.env.JOURNAL_SRC || "journal.html", "utf8")
  .replace(/<link rel="preconnect"[^>]*>\n?/, "")
  .replace(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>\n?/, "")
  .replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/, "");
const out = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' file: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:">
<style>[hidden]{display:none!important} body{margin:0}</style>
<script src="localdb.js"></script>
</head><body>
${src}
</body></html>
`;
fs.writeFileSync("app/index.html", out);
console.log("app/index.html готов");
