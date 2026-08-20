const fs = require('fs');
const path = require('path');

function brandLocales(file) {
  let s = fs.readFileSync(file, 'utf8');
  const ids = [];
  s = s.replace(/XEN-\d{4}-\d+/g, (m) => {
    ids.push(m);
    return `__ID_${ids.length - 1}__`;
  });
  s = s.replace(/XEN-xxxx-xxxx/g, (m) => {
    ids.push(m);
    return `__ID_${ids.length - 1}__`;
  });
  s = s.replace(/XEN-YYYY-NNNN/g, (m) => {
    ids.push(m);
    return `__ID_${ids.length - 1}__`;
  });

  s = s.replace(/XEN Community/g, 'MyTuition Community');
  s = s.replace(/Welcome to XEN/g, 'Welcome to MyTuition');
  s = s.replace(/"appName": "XEN"/g, '"appName": "MyTuition"');
  s = s.replace(/XEN Admin/g, 'MyTuition Admin');
  s = s.replace(/support@XEN\.app/g, 'support@wovello.com');
  s = s.replace(/support@xen\.app/g, 'support@wovello.com');
  s = s.replace(/\bXEN\b/g, 'MyTuition');

  s = s.replace(/__ID_(\d+)__/g, (_, i) => ids[Number(i)]);
  fs.writeFileSync(file, s);
  console.log('updated', file);
}

['en', 'si', 'ta'].forEach((l) => brandLocales(path.join('src/locales', `${l}.json`)));
