/*
Notability 解锁脚本 - 修正 JSON 解析错误版
*/

if (typeof $response !== "undefined" && $response.body) {
    let body = $response.body;
    try {
        let obj = JSON.parse(body);

        // 定义 Pro 权限数据
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

        // 逻辑判断与替换
        if (obj.data) {
            if (obj.data.processAppleReceipt) {
                obj.data.processAppleReceipt.subscription = proSubscription;
                obj.data.processAppleReceipt.isClassic = true;
            } else if (obj.data.associateAppStoreTransactions) {
                obj.data.associateAppStoreTransactions = proOverview;
            } else if (obj.data.me) {
                obj.data.me.subscriptionOverview = proOverview;
            }
        }

        $done({ body: JSON.stringify(obj) });
    } catch (e) {
        console.log("Notability 脚本解析 JSON 出错: " + e);
        $done({}); // 解析失败则返回原样，不阻塞网络
    }
} else {
    $done({}); // 响应体为空时直接结束
}
