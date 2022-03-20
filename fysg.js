/*
脚本功能：飞扬时光 (需登录)
软件版本：0.0.3
脚本作者：吾爱破解论坛 云在天
更新时间：2022.03.21
使用声明：⚠️此脚本仅供学习与交流，
        请勿转载与贩卖！⚠️⚠️⚠️
***************************
Quantumult X:

[rewrite_local]
^http:\/\/app\.lnvcsow\.cn\/login\/login\/sign.html? url script-response-body https://raw.githubusercontent.com/harry-sunhao/QuanX/main/fysg.js
[mitm]
hostname = res.vesal.site
*/
let obj = JSON.parse($response.body);

obj= {"code":"1","msg":{"time":1742495767,"power":"100","share":100,"je":100,"ds":"100.00"}}
$done({body: JSON.stringify(obj)});
