/*
Notability 解锁脚本 - Shadowrocket 专用版
*/

// 1. 获取响应体并解析
let body = $response.body;
let obj = JSON.parse(body);

// 2. 定义 Mock 数据 (Pro 权限)
const proSubscription = {
  "__typename": "AppStoreSubscription",
  "status": "active",
  "originalPurchaseDate": "2024-09-19T09:27:35.000Z",
  "originalTransactionId": "888882904188888",
  "expirationDate": "5138-11-16T23:59:59.000Z",
  "productId": "com.gingerlabs.Notability.pro_subscription",
  "tier": "pro",
  "refundedDate": null,
  "refundedReason": null,
  "isInBillingRetryPeriod": false,
  "gracePeriodExpiresAt": null,
  "expirationIntent": null,
  "overDeviceLimit": false,
  "user": null
};

const proOverview = {
  "__typename": "SubscriptionOverview",
  "tier": "pro",
  "current": {
    "__typename": "Subscription",
    "source": "AppStoreConsumer",
    "tier": "pro",
    "expirationDate": 99999999999999,
    "renewalDate": null,
    "gracePeriodEndDate": null,
    "details": proSubscription
  },
  "prior": null,
  "quotas": {
    "__typename": "SubscriptionFeatureQuotaView",
    "learnQuestions": { "__typename": "SubscriptionFeatureQuota", "isUsageExceeded": false, "usagePercentage": 0 },
    "learnSummaries": { "__typename": "SubscriptionFeatureQuota", "isUsageExceeded": false, "usagePercentage": 0 },
    "liveTranscription": { "__typename": "SubscriptionFeatureQuota", "isUsageExceeded": false, "usagePercentage": 0 }
  }
};

// 3. 逻辑判断与替换
if (obj && obj.data) {
    if (obj.data.processAppleReceipt) {
        // 处理收据验证
        obj.data.processAppleReceipt.subscription = proSubscription;
        obj.data.processAppleReceipt.isClassic = true;
    } else if (obj.data.associateAppStoreTransactions) {
        // 处理关联交易
        obj.data.associateAppStoreTransactions = proOverview;
    } else if (obj.data.me) {
        // 处理个人信息页
        obj.data.me.subscriptionOverview = proOverview;
    }
    body = JSON.stringify(obj);
}

// 4. 小火箭结束指令
$done({ body });
