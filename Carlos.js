var body = $response.body .replace(/\"isBuy\":false/g,"\"isBuy\":true").replace(/\"chargeType\":4/g,"\"chargeType\":1");
$done({ body });
