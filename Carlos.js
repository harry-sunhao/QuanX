var body = $response.body
    .replace(/\"isBuy\":false/, "\"isBuy\":true");
$done({ body });
