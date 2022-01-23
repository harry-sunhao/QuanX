/*
Symbolab 解锁高级功能 (需登录)

***************************
let obj = JSON.parse($response.body);

obj.membership = {
    "valid":true,
    "hasUserConsumedAppleFreeTrial":false,
    "newlyAssociated":false
    }

$done({body: JSON.stringify(obj)});
