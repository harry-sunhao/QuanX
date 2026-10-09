let body = $response.body;
if (!body) $done({});

let obj;
try {
  obj = JSON.parse(body);
} catch {
  $done({ body });
}

const now = new Date();
const thisYear = now.getFullYear();

function decodeTimestamp(noteId) {
  const hex = noteId.slice(0, 8);
  return new Date(parseInt(hex, 16) * 1000);
}

// 格式化准确时间后缀：当年显示 04.12 15:30，跨年显示 2024.04.12 15:30
function formatSuffix(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const date = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());

  if (y === thisYear) {
    return ` · ${m}.${date} ${h}:${min}`;
  }
  return ` · ${y}.${m}.${date} ${h}:${min}`;
}

// 防重复追加检测
function hasSuffix(str) {
  return /[\s·|]\d{2,4}\.\d{2}\.\d{2}(?:\s+\d{2}:\d{2})?$/.test(str) ||
         /[\s·|]\d{2}\.\d{2}\s+\d{2}:\d{2}$/.test(str);
}

function processItem(item) {
  const target = item?.note_card || item;
  const id = item?.id || target?.id;
  if (!id || !/^[a-f0-9]{24}$/i.test(id)) return;

  try {
    const d = decodeTimestamp(id);
    if (isNaN(d.getTime())) return;

    const suffix = formatSuffix(d);

    for (const field of ['display_title', 'title', 'name']) {
      if (target[field] && !hasSuffix(target[field])) {
        target[field] = target[field] + suffix;
      }
      if (item[field] && !hasSuffix(item[field])) {
        item[field] = item[field] + suffix;
      }
    }
  } catch {
    // skip
  }
}

if (Array.isArray(obj?.data)) {
  for (const item of obj.data) {
    processItem(item);
  }
}

$done({ body: JSON.stringify(obj) });
