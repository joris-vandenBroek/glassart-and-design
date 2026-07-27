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

function base64UrlDecode(string $data): string
{
    $padded = strtr($data, '-_', '+/');
    $padding = strlen($padded) % 4;
    if ($padding > 0) {
        $padded .= str_repeat('=', 4 - $padding);
    }
    return (string) base64_decode($padded);
}

function medewerkerUidFromIdToken(string $idToken): ?string
{
    $parts = explode('.', $idToken);
    if (count($parts) !== 3) {
        return null;
    }
    $payload = json_decode(base64UrlDecode($parts[1]), true);
    $uid = $payload['user_id'] ?? $payload['sub'] ?? null;
    return is_string($uid) && $uid !== '' ? $uid : null;
}

// The real authorization check: ask Firestore itself whether this exact
// idToken is allowed to read medewerkers/{uid}. Firestore verifies the
// token's signature/expiry/audience server-side -- we never need to (and
// must not try to) verify the JWT ourselves. A forged or expired token
// simply fails this call.
function isAuthorizedMedewerker(string $idToken, string $projectId): bool
{
    $uid = medewerkerUidFromIdToken($idToken);
    if ($uid === null) {
        return false;
    }
    $url = sprintf(
        'https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/medewerkers/%s',
        rawurlencode($projectId),
        rawurlencode($uid)
    );
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $idToken],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $status === 200;
}

$idToken = (string) ($_POST['idToken'] ?? '');
if ($idToken === '' || !isAuthorizedMedewerker($idToken, $config['firebase_project_id'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
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
$uploadDir = __DIR__ . '/uploads/kunstwerken';

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

$url = rtrim($config['upload_public_base_url'], '/') . '/' . $filename;
echo json_encode(['success' => true, 'url' => $url]);
