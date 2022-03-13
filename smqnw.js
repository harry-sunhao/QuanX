/*
脚本功能：扫描全能王 解锁高级功能 (需登录)
软件版本：9.6.1
下载地址：http://u6.gg/ks1gn
脚本作者：吾爱破解论坛 云在天
更新时间：2022.03.13
使用声明：⚠️此脚本仅供学习与交流，
        请勿转载与贩卖！⚠️⚠️⚠️


***************************
Quantumult X:

[rewrite_local]
^https:\/\/(api|api-cs)\.intsig\.net\/purchase\/cs\/query_property\?$ url script-response-body https://raw.githubusercontent.com/harry-sunhao/QuanX/main/smqnw.js

[mitm]
hostname = ap*.intsig.net

**************************/
let obj = JSON.parse($response.body);
obj = {"data":{"psnl_vip_property":{"expiry":"1741878605"}}};
$done({body: JSON.stringify(obj)});
