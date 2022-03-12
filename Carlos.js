var body = $response.body
    .replace(/\"premiumExpires\":1/, "\"premiumExpires\":0");
$done({ body });
