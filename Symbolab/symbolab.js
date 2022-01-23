/*
Symbolab 解锁高级功能 (需登录)

***************************
QuantumultX:

[rewrite_local]
^https?:\/\/scibug\.com\/appleSubscriptionValidate url script-response-body https://raw.githubusercontent.com/NobyDa/Script/master/Surge/JS/VUE.js

[mitm]
hostname = scibug.com


var body = $response.body
    .replace(/\"valid\":false/, "\"valid\":true");
$done({ body });
