/*
脚本功能：维萨里3D解剖 解锁高级功能 (需登录)
软件版本：5.4.3
脚本作者：吾爱破解论坛 云在天
更新时间：2022.03.14
使用声明：⚠️此脚本仅供学习与交流，
        请勿转载与贩卖！⚠️⚠️⚠️
***************************
Quantumult X:

[rewrite_local]
^http:\/\/res\.vesal\.site\/json\/home\/v543\/IosGetHomeStruct\.json\? url script-response-body https://raw.githubusercontent.com/harry-sunhao/QuanX/main/3djiepou.js
[mitm]
hostname = res.vesal.site
*/
var body = $response.body
    .replace(/yes/, "no");
$done({ body });
