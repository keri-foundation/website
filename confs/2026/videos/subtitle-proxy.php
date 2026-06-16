<?php
// Proxy script to fetch subtitles from external URLs
// This helps bypass browser security restrictions when loading subtitles locally

header('Content-Type: text/plain');
header('Access-Control-Allow-Origin: *');

if (isset($_GET['url'])) {
    $url = $_GET['url'];
    
    // Validate that the URL is from GitHub (to prevent abuse)
    if (strpos($url, 'raw.githubusercontent.com') !== false) {
        $content = file_get_contents($url);
        if ($content !== false) {
            echo $content;
            exit;
        }
    }
}

// If we get here, return an error
http_response_code(404);
echo "Subtitle not found or access denied";
?>