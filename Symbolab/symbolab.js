/*
Symbolab 解锁高级功能 (需登录)

***************************
let obj = JSON.parse($response.body);

obj.membership = {
    "valid": true,
    "newlyAssociated": false,
    "hasUserConsumedAppleFreeTrial": false
  }

$done({body: JSON.stringify(obj)});
