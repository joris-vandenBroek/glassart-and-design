<?php

declare(strict_types=1);

$config = require __DIR__ . '/config.php';

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($requestOrigin, $config['allowed_origins'], true)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

const MAX_FOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_EXTENSIONS = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];

// A static shared secret per environment (same pattern as mail-server/send-mail.php),
// checked with hash_equals() to avoid timing attacks. Test uploads from the staging
// secret must never land among the real production photos -- route them to a
// separate directory/URL instead, same as the production secret does for its own.
$secret = (string) ($_POST['secret'] ?? '');
$productionSecret = (string) ($config['upload_secret'] ?? '');
$stagingSecret = (string) ($config['staging_upload_secret'] ?? '');

$isStagingUpload = false;
$authorized = false;
if ($secret !== '' && $productionSecret !== '' && hash_equals($productionSecret, $secret)) {
    $authorized = true;
} elseif ($secret !== '' && $stagingSecret !== '' && hash_equals($stagingSecret, $secret)) {
    $authorized = true;
    $isStagingUpload = true;
}
if (!$authorized) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
    exit;
}
$publicBaseUrlKey = $isStagingUpload ? 'staging_upload_public_base_url' : 'upload_public_base_url';
if (!is_string($config[$publicBaseUrlKey] ?? null) || $config[$publicBaseUrlKey] === '') {
    // Fail before any file work happens -- catching this after move_uploaded_file() would
    // leave an orphaned file on disk and crash on the strict_types rtrim() call below.
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Upload endpoint misconfigured']);
    exit;
}

if (!isset($_FILES['foto']) || $_FILES['foto']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No photo uploaded']);
    exit;
}

$foto = $_FILES['foto'];

if ($foto['size'] > MAX_FOTO_BYTES) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'File too large']);
    exit;
}

$imageInfo = getimagesize($foto['tmp_name']);
$mime = $imageInfo['mime'] ?? null;
if ($mime === null || !isset(ALLOWED_MIME_EXTENSIONS[$mime])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid image type']);
    exit;
}

$extension = ALLOWED_MIME_EXTENSIONS[$mime];
$filename = bin2hex(random_bytes(16)) . '.' . $extension;
$uploadDirName = $isStagingUpload ? 'kunstwerken-test' : 'kunstwerken';
$uploadDir = __DIR__ . '/uploads/' . $uploadDirName;

if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not prepare upload directory']);
    exit;
}

$destination = $uploadDir . '/' . $filename;
if (!move_uploaded_file($foto['tmp_name'], $destination)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not store the file']);
    exit;
}

$url = rtrim($config[$publicBaseUrlKey], '/') . '/' . $filename;
echo json_encode(['success' => true, 'url' => $url]);
