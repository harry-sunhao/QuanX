/*
# 京东比价 + 智能折合单价
# 整合慢慢买比价接口与守候购物小助手单价算法
# 支持：历史价格趋势、当前折合单价、史低折合单价、多单位换算(每斤/每L/百抽)
#
# 首次使用请打开【慢慢买】APP，点击【我的】，提示【获取ck成功🎉】即可正常比价
#
[rewrite_local]
^https?:\/\/in\.m\.jd\.com\/product\/graphext\/\d+\.html url script-response-body https://raw.githubusercontent.com/harry-sunhao/QuanX/refs/heads/main/jd-price.js?v=2026101001
^https?:\/\/apapia-sqk-weblogic\.manmanbuy\.com\/baoliao\/center\/menu$ url script-request-body https://raw.githubusercontent.com/harry-sunhao/QuanX/refs/heads/main/jd-price.js?v=2026101001

[mitm]
hostname = in.m.jd.com, apapia-sqk-weblogic.manmanbuy.com
*/

const $ = new Env("京东比价");

if ($.isNode()) {
    global.$request = {
        url: 'https://item.jd.com/product/graphext/100142754310.html',
        method: '',
        headers: {},
        body: ''
    };
    global.$response = { headers: {}, body: '<body>' };
    global.$done = (obj) => { console.log(obj); };
}

const path1 = '/product/graphext/';
const path2 = '/baoliao/center/menu';
const manmanbuy_key = 'manmanbuy_val';
const url = $request.url;

// 【V1】请求3次 次新接口 【V2】请求4次 最新接口
$.version = $.getdata('mmb_v') || 'V1';

if (url.includes(path2)) {
    const reqbody = $request.body;
    $.setdata(reqbody, manmanbuy_key);
    $.msg($.name, '获取ck成功🎉', reqbody);
}

if (url.includes(path1)) {
    const responseBody = $response?.body;
    main()
        .then(res => $done(res || { body: responseBody }))
        .catch(err => {
            const html = `<div style="max-width: 90%;margin: 20px auto;padding: 16px;background: #ffffff;color: #d32f2f;border: 2px solid #f44336;border-radius: 12px;font-size: 16px;text-align:left;box-shadow: 0 2px 6px rgba(0,0,0,0.06);"><strong>${err.message}</strong></div>`;
            $.msg('京东比价出现错误', '👉点击此处打开慢慢买检查👈', err.message, {
                url: `manmanbuy://?type=func&value=MainUtils.openWin(%7Bname%3A'TrendDetailScene',navi%3Anavigation%2CpageParam%3A%7BsearchKey%3A'${$.manmanbuy_url}'%2CsceneFrom%3A'mmbwx'%7D%7D)`
            });
            $done({
                body: responseBody.replace("<body>", `<body>${html}`)
            });
        });
}

async function main() {
    intCryptoJS();

    const match = url.match(/product\/graphext\/(\d+)\.html/);
    if (!match) throw new Error("京东URL匹配失败");

    const JD_Url = `https://item.jd.com/${match[1]}.html`;
    $.manmanbuy_url = encodeURIComponent(JD_Url);
    const responseBody = $response?.body || '';

    const version = $.version || "V1";
    let link = JD_Url, stteId;

    if (version === "V2") {
        const parse = checkRes(await get_stteId(JD_Url), '获取stteId [V2]');
        link = parse?.result?.link;
        stteId = parse?.result?.stteId;
    }
    const basic = checkRes(await get_spbh(link, stteId, version), '获取 spbh [V1/V2]');
    const jiagequshi = checkRes(await get_jiagequshi(basic?.result?.url, basic?.result?.spbh), '获取价格趋势');
    const trend = checkRes(await get_priceRemark(jiagequshi?.result?.trend), '价格备注');
    const ListPriceDetail = trend?.remark?.ListPriceDetail || [];
    const exclude = new Set(['当前到手价', '历史最低价', '618价格', '双11价格', '30天最低价', '60天最低价', '180天最低价']);
    const list = ListPriceDetail.filter(i => exclude.has(i.Name));

    // ====== 价格提取 ======
    const curItem = list.find(i => i.Name.includes('当前到手价') || i.Name.includes('当前')) || list[0];
    const curPrice = curItem ? parseFloat(String(curItem.Price).replace(/[^0-9.]/g, '')) : 0;

    const lowItem = list.find(i => i.Name.includes('历史最低'));
    const lowPrice = lowItem ? parseFloat(String(lowItem.Price).replace(/[^0-9.]/g, '')) : 0;

    // 优先从慢慢买返回的纯净标题中提取规格，避免 HTML 噪音
    const titleToScan = basic?.result?.title || basic?.result?.mc || extractTitleFromHtml(responseBody);

    // 计算折合单价
    let unitInfo = null;
    try {
        unitInfo = parseJDUnitPrice(titleToScan, curPrice, lowPrice);
    } catch (e) {
        // 容错静默
    }

    const html = Price_HTML(list, unitInfo);
    const body = responseBody.replace("<body>", `<body>${html}`);
    return { body };
}

// 辅助：从网页 body 提取商品主标题（作为兜底）
function extractTitleFromHtml(html) {
    if (!html) return '';
    const m = html.match(/<title>([^<]+)<\/title>/i);
    return m ? m[1] : '';
}

// ====== 守候算法核心：智能单位价格解析引擎 ======
function parseJDUnitPrice(title, currentPrice, lowestPrice) {
    if (!title || !currentPrice || currentPrice <= 0) return null;

    // 1. 过滤常见非规格干扰词
    const safeTitle = title
        .replace(/\d+\s*(?:个?月|天|周|年|小时|分钟|秒)\s*(?:质保|保修|保质期|免费包换|价保|无理由|售后)?/gi, '')
        .replace(/\d+\s*(?:期免息|期分期)/gi, '')
        .replace(/\d+(?:\.\d+)?\s*折\b/gi, '')
        .replace(/\d+(?:\.\d+)?%/g, '')
        .replace(/[245]G\s*(?:全网通|手机|网络|双模)/gi, '')
        .replace(/[248]K\s*(?:超清|高清|电视|显示器)/gi, '')
        .replace(/满\s*\d+\s*(?:元|件)?\s*减\s*\d+/gi, '')
        .replace(/第\s*\d+\s*件\s*(?:半价|打折|\d+折)/gi, '')
        .replace(/\s+/g, ' ');

    const isDigital = /(?:手机|平板|电脑|笔记本|相机|主机|显示器|iphone|ipad|android|xiaomi|huawei|honor|oppo|vivo)/i.test(safeTitle);
    const isStorage = /(?:ssd|固态|硬盘|内存|u盘|存储卡|tf卡|sd卡)/i.test(safeTitle);

    let parsed = null;

    // 2. 复合包装: 数值 + 计量单位 + 乘号 + 数量 + (包装单位)
    // 如: 330ml*24听, 250ml*24盒, 100抽*24包, 140g*27卷, 500g*2袋, 2.5kg*2
    const comboRegex = /([\d.]+)\s*(ml|毫升|l|升|g|克|kg|千克|市斤|斤|抽|片|米|条|张)\s*[*x×\/]\s*(\d+)\s*([瓶罐盒袋包听支桶片卷杯粒枚个次份]*)/i;
    let m = safeTitle.match(comboRegex);
    if (m) {
        const val = parseFloat(m[1]);
        const innerUnit = m[2].toLowerCase();
        const count = parseInt(m[3], 10);
        const pkgUnit = m[4] || (['抽', '片', '米', '张'].includes(innerUnit) ? '包' : '件');
        if (count > 0 && val > 0) {
            parsed = {
                type: 'combo',
                specDesc: `${val}${innerUnit} × ${count}${pkgUnit}`,
                count: count,
                pkgUnit: pkgUnit,
                val: val,
                innerUnit: innerUnit
            };
        }
    }

    // 3. 反向复合包装: 数量 + 包装单位 + 乘号 + 数值 + 计量单位
    // 如: 24听*330ml, 24瓶*500ml, 12盒*250ml
    if (!parsed) {
        const revComboRegex = /(\d+)\s*([瓶罐盒袋包听支桶片卷杯粒枚个次份])\s*[*x×\/装]\s*([\d.]+)\s*(ml|毫升|l|升|g|克|kg|千克|市斤|斤)/i;
        let rm = safeTitle.match(revComboRegex);
        if (rm) {
            const count = parseInt(rm[1], 10);
            const pkgUnit = rm[2];
            const val = parseFloat(rm[3]);
            const innerUnit = rm[4].toLowerCase();
            if (count > 0 && val > 0) {
                parsed = {
                    type: 'combo',
                    specDesc: `${val}${innerUnit} × ${count}${pkgUnit}`,
                    count: count,
                    pkgUnit: pkgUnit,
                    val: val,
                    innerUnit: innerUnit
                };
            }
        }
    }

    // 4. 单体容量/重量包装: 数值 + (kg/g/l/ml/斤)
    // 如: 5L, 2.6kg, 5.4kg, 500ml, 10斤
    if (!parsed) {
        // 数码产品排除 g，防止把 128G 误判为克
        const singleCapRegex = isDigital
            ? /([\d.]+)\s*(kg|千克|ml|毫升|l|升|市斤|斤)/i
            : /([\d.]+)\s*(kg|千克|g(?!b)|克|ml|毫升|l|升|市斤|斤)/i;
        let sm = safeTitle.match(singleCapRegex);
        if (sm) {
            const val = parseFloat(sm[1]);
            const unit = sm[2].toLowerCase();
            if (val > 0) {
                parsed = {
                    type: 'single',
                    specDesc: `${val}${unit}`,
                    val: val,
                    unit: unit
                };
            }
        }
    }

    // 5. 多件独立包装: 数量 + 常见量词 (如 24罐, 30包, 120抽, 10只装)
    if (!parsed) {
        const countOnlyRegex = /(\d+)\s*([只瓶袋抽包卷盒条片听桶罐支入枚根颗杯粒件份块次])/;
        let cm = safeTitle.match(countOnlyRegex);
        if (cm) {
            const count = parseInt(cm[1], 10);
            const unit = cm[2];
            if (count > 1) {
                parsed = {
                    type: 'count_only',
                    specDesc: `共 ${count} ${unit}`,
                    count: count,
                    unit: unit
                };
            }
        }
    }

    // 6. 数码存储: 1TB, 512GB, 256GB
    if (!parsed && isStorage) {
        const storageRegex = /(\d+)\s*(tb|gb)\b/i;
        let stm = safeTitle.match(storageRegex);
        if (stm) {
            let num = parseInt(stm[1], 10);
            let u = stm[2].toUpperCase();
            let totalGb = u === 'TB' ? num * 1024 : num;
            parsed = {
                type: 'storage',
                specDesc: `${stm[1]}${u}`,
                totalGb: totalGb
            };
        }
    }

    if (!parsed) return null;

    // 格式化输出主单价与辅助单价
    function formatPrices(p) {
        if (!p || p <= 0) return null;
        if (parsed.type === 'combo') {
            let pri = `¥${(p / parsed.count).toFixed(2)}/${parsed.pkgUnit}`;
            let sec = '';
            let u = parsed.innerUnit;
            if (['ml', '毫升'].includes(u)) {
                let totalL = (parsed.val * parsed.count) / 1000;
                sec = `约¥${(p / totalL).toFixed(2)}/L`;
            } else if (['l', '升'].includes(u)) {
                let totalL = parsed.val * parsed.count;
                sec = `约¥${(p / totalL).toFixed(2)}/L`;
            } else if (['g', '克'].includes(u)) {
                let totalJin = (parsed.val * parsed.count) / 500;
                let totalKg = (parsed.val * parsed.count) / 1000;
                sec = `约¥${(p / totalJin).toFixed(2)}/斤 (¥${(p / totalKg).toFixed(2)}/kg)`;
            } else if (['kg', '千克'].includes(u)) {
                let totalKg = parsed.val * parsed.count;
                sec = `约¥${(p / (totalKg * 2)).toFixed(2)}/斤 (¥${(p / totalKg).toFixed(2)}/kg)`;
            } else if (['抽', '张', '片'].includes(u)) {
                let totalPcs = parsed.val * parsed.count;
                let per100 = ((p / totalPcs) * 100).toFixed(2);
                sec = `约¥${per100}/百${u}`;
            }
            return { primary: pri, secondary: sec };
        } else if (parsed.type === 'single') {
            let u = parsed.unit;
            let pri = '', sec = '';
            if (['kg', '千克'].includes(u)) {
                pri = `¥${(p / parsed.val).toFixed(2)}/kg`;
                sec = `约¥${(p / (parsed.val * 2)).toFixed(2)}/斤`;
            } else if (['g', '克'].includes(u)) {
                pri = `约¥${(p / (parsed.val / 500)).toFixed(2)}/斤`;
                sec = `约¥${(p / (parsed.val / 1000)).toFixed(2)}/kg`;
            } else if (['l', '升'].includes(u)) {
                pri = `¥${(p / parsed.val).toFixed(2)}/L`;
                sec = `约¥${(p / (parsed.val * 2)).toFixed(2)}/斤`;
            } else if (['ml', '毫升'].includes(u)) {
                pri = `约¥${(p / (parsed.val / 1000)).toFixed(2)}/L`;
            } else if (['市斤', '斤'].includes(u)) {
                pri = `¥${(p / parsed.val).toFixed(2)}/斤`;
            }
            return { primary: pri, secondary: sec };
        } else if (parsed.type === 'count_only') {
            return {
                primary: `¥${(p / parsed.count).toFixed(2)}/${parsed.unit}`,
                secondary: `共 ${parsed.count} ${parsed.unit}`
            };
        } else if (parsed.type === 'storage') {
            return {
                primary: `¥${(p / parsed.totalGb).toFixed(2)}/GB`,
                secondary: `容量 ${parsed.specDesc}`
            };
        }
        return null;
    }

    return {
        spec: parsed.specDesc,
        current: formatPrices(currentPrice),
        lowest: formatPrices(lowestPrice)
    };
}

// 返回结果检查函数
function checkRes(res, desc = '') {
    if (!res || res.ok !== 1) {
        $.log('慢慢买提示您：' + $.toStr(res));
        throw new Error(`慢慢买提示您：${res?.msg || `${desc}失败`}`);
    }
    return res;
}

// 比价 HTML 构建
function Price_HTML(priceList, unitInfo) {
    let unitRows = '';
    if (unitInfo && unitInfo.current) {
        unitRows += `
        <tr class="unit-row-cur">
            <td><strong>折合单价</strong></td>
            <td class="spec-label">${unitInfo.spec}</td>
            <td colspan="2" class="price-val-cur">
                <strong>${unitInfo.current.primary}</strong>
                ${unitInfo.current.secondary ? `<div class="sub-unit">${unitInfo.current.secondary}</div>` : ''}
            </td>
        </tr>`;

        if (unitInfo.lowest) {
            unitRows += `
            <tr class="unit-row-low">
                <td><strong>史低折合</strong></td>
                <td class="spec-label">按史低折算</td>
                <td colspan="2" class="price-val-low">
                    <strong>${unitInfo.lowest.primary}</strong>
                    ${unitInfo.lowest.secondary ? `<div class="sub-unit">${unitInfo.lowest.secondary}</div>` : ''}
                </td>
            </tr>`;
        }
    }

    const rows = priceList.map(item => {
        let { Name: name, Date: date, Price: price = '', Difference: diff = '' } = item;
        if (name === '当前到手价') {
            date = $.time('yyyy-MM-dd');
            diff = '仅供参考';
        } else {
            date = date || '-';
        }
        let diffClass = '';
        if (diff.startsWith('↑')) diffClass = 'up';
        else if (diff.startsWith('↓')) diffClass = 'down';
        return `<tr><td>${name}</td><td>${date}</td><td>${price}</td><td class="price-diff ${diffClass}">${diff}</td></tr>`;
    }).join('');

    return `
    <div class="price-container">
        <table class="price-table">
            <thead>
                <tr><th>类型</th><th>日期/规格</th><th>价格/单价</th><th>差价</th></tr>
            </thead>
            <tbody>
                ${unitRows}
                ${rows}
            </tbody>
        </table>
    </div>
    <style>
        body, table { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }
        .price-container {
            max-width: 800px; margin: 10px auto; padding: 10px; font-size: 13px; font-weight: bold;
            background: #FFF9F9; color: #333; border-radius: 12px; overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .price-table { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 8px; overflow: hidden; }
        .price-table th { background: #e61a23; color: #fff; padding: 10px 12px; text-align: left; font-weight: bold; }
        .price-table td { padding: 10px 12px; border-bottom: 1px solid #EEE; }
        .price-diff.up { color: #C91623; }
        .price-diff.down { color: #00aa00; }
        .unit-row-cur { background: #FFF0F0; }
        .unit-row-low { background: #F6FFF6; }
        .price-val-cur { color: #E61A23; font-size: 14px; }
        .price-val-low { color: #009900; font-size: 13px; }
        .sub-unit { font-size: 11px; color: #777; font-weight: normal; margin-top: 2px; }
        .spec-label { font-size: 12px; color: #666; font-weight: normal; }
    </style>`;
}

// 提交请求
async function mmbRequest(Params, url) {
    if (!$.manmanbuy) {
        $.manmanbuy = getck();
    }
    let payloadStr;
    if (typeof Params === 'string') {
        payloadStr = Params;
    } else {
        const SECRET_KEY = '3E41D1331F5DDAFCD0A38FE2D52FF66F';
        const requestBody = {
            ...$.manmanbuy,
            ...Params,
            t: Date.now().toString()
        };
        requestBody.token = md5(encodeURIComponent(SECRET_KEY + jsonToCustomString(requestBody) + SECRET_KEY)).toUpperCase();
        payloadStr = jsonToQueryString(requestBody);
    }
    const opt = {
        url,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios"
        },
        body: payloadStr
    };
    return await httpRequest(opt);
}

// 获取 stteId (V2)
async function get_stteId(searchKey) {
    const url = 'https://apapia-common.manmanbuy.com/SiteCommand/parse';
    const payload = {
        methodName: "commonMethod",
        searchKey,
        scene: "TrendHomeUnInput",
        c_ctrl: "Tabs"
    };
    return await mmbRequest(payload, url);
}

// 获取 spbh
async function get_spbh(link, stteId, version) {
    const base = 'https://apapia-history-weblogic.manmanbuy.com/basic';
    const url = version === "V2"
        ? `${base}/v2/getItemBasicInfo`
        : `${base}/getItemBasicInfo`;
    const payload = {
        methodName: "getHistoryInfoJava",
        searchKey: link,
        c_ctrl: "Tabs",
        ...(version === "V2" && { stteId })
    };
    return await mmbRequest(payload, url);
}

// 获取价格趋势
async function get_jiagequshi(link, spbh) {
    const url = "https://apapia-history-weblogic.manmanbuy.com/history/v2/getHistoryTrend";
    const payload = {
        methodName: "getHistoryTrend2021",
        url: link,
        spbh: spbh,
        c_ctrl: "TrendDetailScene",
        callPos: "trend_detail",
        currentScene: "TrendDetailRecent",
        eventName: "查询商品历史价格",
        pagecFrom: "TrendHomeUnInput",
        chartStyleTest: "testA"
    };
    return await mmbRequest(payload, url);
}

// 获取价格备注
async function get_priceRemark(jiagequshiyh) {
    const url = "https://apapia-history-weblogic.manmanbuy.com/history/priceRemark";
    const payload = {
        methodName: "priceRemarkJava",
        jiagequshiyh: jiagequshiyh,
        c_ctrl: "TrendDetailScene"
    };
    return await mmbRequest(payload, url);
}

function int_ck(Params) {
    const keysToDelete = ["c_ctrl", "methodName", "level", "t", "token"];
    const newParams = { ...Params };
    keysToDelete.forEach(key => delete newParams[key]);
    return newParams;
}

function getck() {
    const ck = $.isNode() ? process.env[manmanbuy_key] : $.getdata(manmanbuy_key);
    if (!ck) {
        $.msg($.name, '请先打开【慢慢买】APP', '请确保已成功获取ck');
        throw new Error(`请先打开【慢慢买】APP,点击我的，获取ck`);
    }
    const Params = parseQueryString(ck);
    if (!Params || !Params.c_mmbDevId) {
        $.msg($.name, '数据异常', '请联系脚本作者检查ck格式');
        throw new Error(`请联系脚本作者检查ck格式`);
    }
    return int_ck(Params);
}

async function httpRequest(options) {
    try {
        options = options.url ? options : { url: options };
        const _method = options?._method || ('body' in options ? 'post' : 'get');
        const _respType = options?._respType || 'body';
        const _timeout = options?._timeout || 15e3;
        const _http = [
            new Promise((_, reject) => setTimeout(() => reject(`⛔️ 请求超时: ${options['url']}`), _timeout)),
            new Promise((resolve, reject) => {
                $[_method.toLowerCase()](<options, (error, response, data>) => {
                    error && $.log($.toStr(error));
                    if (_respType !== 'all') {
                        resolve($.toObj(response?.[_respType], response?.[_respType]));
                    } else {
                        resolve(response);
                    }
                });
            })
        ];
        return await Promise.race(_http);
    } catch (err) {
        $.logErr(err);
    }
}

function parseQueryString(queryString) {
    const jsonObject = {};
    const pairs = queryString.split('&');
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        jsonObject[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
    return jsonObject;
}

function jsonToQueryString(jsonObject) {
    return Object.keys(jsonObject).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(jsonObject[key])}`).join('&');
}

function jsonToCustomString(jsonObject) {
    return Object.keys(jsonObject)
        .filter(key => jsonObject[key] !== '' && key.toLowerCase() !== 'token')
        .sort()
        .map(key => `${key.toUpperCase()}${jsonObject[key].toUpperCase()}`)
        .join('');
}

function intCryptoJS() {
    CryptoJS = function(t, r) {
        var n;
        if ("undefined" != typeof window && window.crypto && (n = window.crypto), "undefined" != typeof self && self.crypto && (n = self.crypto), "undefined" != typeof globalThis && globalThis.crypto && (n = globalThis.crypto), !n && "undefined" != typeof window && window.msCrypto && (n = window.msCrypto), !n && "undefined" != typeof global && global.crypto && (n = global.crypto), !n && "function" == typeof require) try { n = require("crypto") } catch (t) {}
        var e = function() {
            if (n) {
                if ("function" == typeof n.getRandomValues) try { return n.getRandomValues(new Uint32Array(1))[0] } catch (t) {}
                if ("function" == typeof n.randomBytes) try { return n.randomBytes(4).readInt32LE() } catch (t) {}
            }
            throw new Error("Native crypto module could not be used to get secure random number.")
        }, i = Object.create || function() { function t() {} return function(r) { var n; return t.prototype = r, n = new t, t.prototype = null, n } }(), o = {}, a = o.lib = {}, s = a.Base = {
            extend: function(t) { var r = i(this); return t && r.mixIn(t), r.hasOwnProperty("init") && this.init !== r.init || (r.init = function() { r.$super.init.apply(this, arguments) }), r.init.prototype = r, r.$super = this, r },
            create: function() { var t = this.extend(); return t.init.apply(t, arguments), t },
            init: function() {},
            mixIn: function(t) { for (var r in t) t.hasOwnProperty(r) && (this[r] = t[r]); t.hasOwnProperty("toString") && (this.toString = t.toString) },
            clone: function() { return this.init.prototype.extend(this) }
        }, c = a.WordArray = s.extend({
            init: function(t, r) { t = this.words = t || [], this.sigBytes = null != r ? r : 4 * t.length },
            toString: function(t) { return (t || f).stringify(this) },
            concat: function(t) { var r = this.words, n = t.words, e = this.sigBytes, i = t.sigBytes; if (this.clamp(), e % 4) for (var o = 0; o < i; o++) { var a = n[o >>> 2] >>> 24 - o % 4 * 8 & 255; r[e + o >>> 2] |= a << 24 - (e + o) % 4 * 8 } else for (var s = 0; s < i; s += 4) r[e + s >>> 2] = n[s >>> 2]; return this.sigBytes += i, this },
            clamp: function() { var r = this.words, n = this.sigBytes; r[n >>> 2] &= 4294967295 << 32 - n % 4 * 8, r.length = t.ceil(n / 4) },
            clone: function() { var t = s.clone.call(this); return t.words = this.words.slice(0), t }
        }), u = o.enc = {}, f = u.Hex = {
            stringify: function(t) { for (var r = t.words, n = t.sigBytes, e = [], i = 0; i < n; i++) { var o = r[i >>> 2] >>> 24 - i % 4 * 8 & 255; e.push((o >>> 4).toString(16)), e.push((15 & o).toString(16)) } return e.join("") }
        }, h = u.Latin1 = {
            stringify: function(t) { for (var r = t.words, n = t.sigBytes, e = [], i = 0; i < n; i++) { var o = r[i >>> 2] >>> 24 - i % 4 * 8 & 255; e.push(String.fromCharCode(o)) } return e.join("") },
            parse: function(t) { for (var r = t.length, n = [], e = 0; e < r; e++) n[e >>> 3] |= (255 & t.charCodeAt(e)) << 24 - e % 4 * 8; return new c.init(n, r) }
        }, p = u.Utf8 = {
            stringify: function(t) { try { return decodeURIComponent(escape(h.stringify(t))) } catch (t) { throw new Error("Malformed UTF-8 data") } },
            parse: function(t) { return h.parse(unescape(encodeURIComponent(t))) }
        }, d = a.BufferedBlockAlgorithm = s.extend({
            reset: function() { this._data = new c.init, this._nDataBytes = 0 },
            _append: function(t) { "string" == typeof t && (t = p.parse(t)), this._data.concat(t), this._nDataBytes += t.sigBytes },
            _process: function(r) { var n, e = this._data, i = e.words, o = e.sigBytes, a = this.blockSize, s = o / (4 * a), u = (s = r ? t.ceil(s) : t.max((0 | s) - this._minBufferSize, 0)) * a, f = t.min(4 * u, o); if (u) { for (var h = 0; h < u; h += a) this._doProcessBlock(i, h); n = i.splice(0, u), e.sigBytes -= f } return new c.init(n, f) },
            clone: function() { var t = s.clone.call(this); return t._data = this._data.clone(), t },
            _minBufferSize: 0
        }), l = (a.Hasher = d.extend({
            cfg: s.extend(),
            init: function(t) { this.cfg = this.cfg.extend(t), this.reset() },
            reset: function() { d.reset.call(this), this._doReset() },
            update: function(t) { return this._append(t), this._process(), this },
            finalize: function(t) { return t && this._append(t), this._doFinalize() },
            blockSize: 16
        }), o.algo = {});
        return o;
    }(Math);

    !function(t) {
        var r = CryptoJS, n = r.lib, e = n.WordArray, i = n.Hasher, o = r.algo, a = [];
        !function() { for (var r = 0; r < 64; r++) a[r] = 4294967296 * t.abs(t.sin(r + 1)) | 0 }();
        var s = o.MD5 = i.extend({
            _doReset: function() { this._hash = new e.init([1732584193, 4023233417, 2562383102, 271733878]) },
            _doProcessBlock: function(t, r) {
                for (var n = 0; n < 16; n++) { var e = r + n, i = t[e]; t[e] = 16711935 & (i << 8 | i >>> 24) | 4278255360 & (i << 24 | i >>> 8) }
                var o = this._hash.words, s = t[r + 0], p = t[r + 1], d = t[r + 2], l = t[r + 3], y = t[r + 4], v = t[r + 5], g = t[r + 6], w = t[r + 7], _ = t[r + 8], m = t[r + 9], B = t[r + 10], b = t[r + 11], C = t[r + 12], S = t[r + 13], x = t[r + 14], A = t[r + 15], H = o[0], z = o[1], M = o[2], D = o[3];
                z = h(z = h(z = h(z = h(z = f(z = f(z = f(z = f(z = u(z = u(z = u(z = u(z = c(z = c(z = c(z = c(z, M = c(M, D = c(D, H = c(H, z, M, D, s, 7, a[0]), z, M, p, 12, a[1]), H, z, d, 17, a[2]), D, H, l, 22, a[3]), M = c(M, D = c(D, H = c(H, z, M, D, y, 7, a[4]), z, M, v, 12, a[5]), H, z, g, 17, a[6]), D, H, w, 22, a[7]), M = c(M, D = c(D, H = c(H, z, M, D, _, 7, a[8]), z, M, m, 12, a[9]), H, z, B, 17, a[10]), D, H, b, 22, a[11]), M = c(M, D = c(D, H = c(H, z, M, D, C, 7, a[12]), z, M, S, 12, a[13]), H, z, x, 17, a[14]), D, H, A, 22, a[15]), M = u(M, D = u(D, H = u(H, z, M, D, p, 5, a[16]), z, M, g, 9, a[17]), H, z, b, 14, a[18]), D, H, s, 20, a[19]), M = u(M, D = u(D, H = u(H, z, M, D, v, 5, a[20]), z, M, B, 9, a[21]), H, z, A, 14, a[22]), D, H, y, 20, a[23]), M = u(M, D = u(D, H = u(H, z, M, D, m, 5, a[24]), z, M, x, 9, a[25]), H, z, l, 14, a[26]), D, H, _, 20, a[27]), M = u(M, D = u(D, H = u(H, z, M, D, S, 5, a[28]), z, M, d, 9, a[29]), H, z, w, 14, a[30]), D, H, C, 20, a[31]), M = f(M, D = f(D, H = f(H, z, M, D, v, 4, a[32]), z, M, _, 11, a[33]), H, z, b, 16, a[34]), D, H, x, 23, a[35]), M = f(M, D = f(D, H = f(H, z, M, D, p, 4, a[36]), z, M, y, 11, a[37]), H, z, w, 16, a[38]), D, H, B, 23, a[39]), M = f(M, D = f(D, H = f(H, z, M, D, S, 4, a[40]), z, M, s, 11, a[41]), H, z, l, 16, a[42]), D, H, g, 23, a[43]), M = f(M, D = f(D, H = f(H, z, M, D, m, 4, a[44]), z, M, C, 11, a[45]), H, z, A, 16, a[46]), D, H, d, 23, a[47]), M = h(M, D = h(D, H = h(H, z, M, D, s, 6, a[48]), z, M, w, 10, a[49]), H, z, x, 15, a[50]), D, H, v, 21, a[51]), M = h(M, D = h(D, H = h(H, z, M, D, C, 6, a[52]), z, M, l, 10, a[53]), H, z, B, 15, a[54]), D, H, p, 21, a[55]), M = h(M, D = h(D, H = h(H, z, M, D, _, 6, a[56]), z, M, A, 10, a[57]), H, z, g, 15, a[58]), D, H, S, 21, a[59]), M = h(M, D = h(D, H = h(H, z, M, D, y, 6, a[60]), z, M, b, 10, a[61]), H, z, d, 15, a[62]), D, H, m, 21, a[63]), o[0] = o[0] + H | 0, o[1] = o[1] + z | 0, o[2] = o[2] + M | 0, o[3] = o[3] + D | 0
            },
            _doFinalize: function() {
                var r = this._data, n = r.words, e = 8 * this._nDataBytes, i = 8 * r.sigBytes;
                n[i >>> 5] |= 128 << 24 - i % 32;
                var o = t.floor(e / 4294967296), a = e;
                n[15 + (i + 64 >>> 9 << 4)] = 16711935 & (o << 8 | o >>> 24) | 4278255360 & (o << 24 | o >>> 8), n[14 + (i + 64 >>> 9 << 4)] = 16711935 & (a << 8 | a >>> 24) | 4278255360 & (a << 24 | a >>> 8), r.sigBytes = 4 * (n.length + 1), this._process();
                for (var s = this._hash, c = s.words, u = 0; u < 4; u++) { var f = c[u]; c[u] = 16711935 & (f << 8 | f >>> 24) | 4278255360 & (f << 24 | f >>> 8) }
                return s;
            }
        });
        function c(t, r, n, e, i, o, a) { var s = t + (r & n | ~r & e) + i + a; return (s << o | s >>> 32 - o) + r }
        function u(t, r, n, e, i, o, a) { var s = t + (r & e | n & ~e) + i + a; return (s << o | s >>> 32 - o) + r }
        function f(t, r, n, e, i, o, a) { var s = t + (r ^ n ^ e) + i + a; return (s << o | s >>> 32 - o) + r }
        function h(t, r, n, e, i, o, a) { var s = t + (n ^ (r | ~e)) + i + a; return (s << o | s >>> 32 - o) + r }
        r.MD5 = i._createHelper(s);
    }(Math);
}

function md5(word) { return CryptoJS.MD5(word).toString(); }

// 保持原版 Env 环境封装不变
function Env(t, e) {
    class s {
        constructor(t) { this.env = t }
        send(t, e = "GET") {
            t = "string" == typeof t ? { url: t } : t;
            let s = this.get; "POST" === e && (s = this.post);
            const i = new Promise(((e, i) => { s.call(this, t, ((t, s, o) => { t ? i(t) : e(s) })) }));
            return t.timeout ? ((t, e = 1e3) => Promise.race([t, new Promise(((t, s) => { setTimeout((() => { s(new Error("请求超时")) }), e) }))]))(i, t.timeout) : i
        }
        get(t) { return this.send.call(this.env, t) }
        post(t) { return this.send.call(this.env, t, "POST") }
    }
    return new class {
        constructor(t, e) {
            this.logLevels = { debug: 0, info: 1, warn: 2, error: 3 };
            this.logLevelPrefixs = { debug: "[DEBUG] ", info: "[INFO] ", warn: "[WARN] ", error: "[ERROR] " };
            this.logLevel = "info"; this.name = t; this.http = new s(this); this.data = null; this.dataFile = "box.dat";
            this.logs = []; this.isMute = !1; this.isNeedRewrite = !1; this.logSeparator = "\n"; this.encoding = "utf-8";
            this.startTime = (new Date).getTime(); Object.assign(this, e); this.log("", `🔔${this.name}, 开始!`);
        }
        getEnv() {
            return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0
        }
        isNode() { return "Node.js" === this.getEnv() }
        isQuanX() { return "Quantumult X" === this.getEnv() }
        toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } }
        toStr(t, e = null, ...s) { try { return JSON.stringify(t, ...s) } catch { return e } }
        getdata(t) {
            switch (this.getEnv()) {
                case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t);
                case "Quantumult X": return $prefs.valueForKey(t);
                case "Node.js": return this.data = this.loaddata(), this.data[t];
                default: return this.data && this.data[t] || null
            }
        }
        setdata(t, e) {
            switch (this.getEnv()) {
                case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e);
                case "Quantumult X": return $prefs.setValueForKey(t, e);
                case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0;
                default: return this.data && this.data[e] || null
            }
        }
        loaddata() {
            if (!this.isNode()) return {};
            this.fs = this.fs ? this.fs : require("fs"); this.path = this.path ? this.path : require("path");
            const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile);
            const s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e);
            if (!s && !i) return {};
            const o = s ? t : e; try { return JSON.parse(this.fs.readFileSync(o)) } catch (t) { return {} }
        }
        writedata() {
            if (this.isNode()) {
                this.fs = this.fs ? this.fs : require("fs"); this.path = this.path ? this.path : require("path");
                const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile);
                const s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), o = JSON.stringify(this.data);
                s ? this.fs.writeFileSync(t, o) : i ? this.fs.writeFileSync(e, o) : this.fs.writeFileSync(t, o)
            }
        }
        get(t, e = (() => {})) {
            switch (this.getEnv()) {
                case "Quantumult X":
                    this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 }));
                    $task.fetch(t).then((t => { const { statusCode: s, headers: o, body: r } = t; e(null, { status: s, statusCode: s, headers: o, body: r }, r) }), (t => e(t && t.error || "UndefinedError")));
                    break;
                default:
                    $httpClient.get(t, ((t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode); e(t, s, i) }));
                    break;
            }
        }
        post(t, e = (() => {})) {
            const s = t.method ? t.method.toLocaleLowerCase() : "post";
            switch (this.getEnv()) {
                case "Quantumult X":
                    t.method = s;
                    this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 }));
                    $task.fetch(t).then((t => { const { statusCode: s, headers: o, body: r } = t; e(null, { status: s, statusCode: s, headers: o, body: r }, r) }), (t => e(t && t.error || "UndefinedError")));
                    break;
                default:
                    $httpClient[s](<t, ((t, s, i>) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode); e(t, s, i) }));
                    break;
            }
        }
        time(t, e = null) {
            const s = e ? new Date(e) : new Date;
            let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds() };
            /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length)));
            for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length)));
            return t;
        }
        msg(e = t, s = "", i = "", o = {}) {
            if (!this.isMute) {
                if (this.isQuanX()) $notify(e, s, i, o);
                else if (typeof $notification !== "undefined") $notification.post(e, s, i, o);
            }
        }
        log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]); console.log(t.map((t => t ?? String(t))).join(this.logSeparator)) }
        logErr(t, e) { this.log("", `❗️${this.name}, 错误!`, e, t) }
    }(t, e);
}
