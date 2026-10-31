// Русское имя программы для Finder и меню: файлы внутри остаются с латинскими именами.
const fs = require("fs"), path = require("path");
const strings = 'CFBundleDisplayName = "Журнал воскресной школы";\nCFBundleName = "Журнал";\n';
for (const arch of ["arm64", "x64"]) {
  const res = path.join("dist", `Zhurnal-darwin-${arch}`, "Zhurnal.app", "Contents", "Resources");
  for (const lang of ["ru.lproj", "en.lproj"]) {
    fs.mkdirSync(path.join(res, lang), { recursive: true });
    fs.writeFileSync(path.join(res, lang, "InfoPlist.strings"), strings, "utf8");
  }
}
console.log("Русское имя добавлено");
for (const arch of ["arm64", "x64"]) {
  const plist = path.join("dist", `Zhurnal-darwin-${arch}`, "Zhurnal.app", "Contents", "Info.plist");
  let s = fs.readFileSync(plist, "utf8");
  s = s.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, "$1Журнал воскресной школы$2");
  if (!s.includes("LSHasLocalizedDisplayName")) s = s.replace(/<dict>/, "<dict>\n    <key>LSHasLocalizedDisplayName</key>\n    <true/>");
  fs.writeFileSync(plist, s, "utf8");
}
console.log("Info.plist обновлён");
