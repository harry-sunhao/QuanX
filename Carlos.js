var body = $response.body .replace(/\"isBuy\":false/g,"\"isBuy\":true");
$done({ body });
