<?php

declare(strict_types=1);

require __DIR__ . '/PHPMailer/Exception.php';
require __DIR__ . '/PHPMailer/PHPMailer.php';
require __DIR__ . '/PHPMailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

$config = require __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: ' . $config['allowed_origin']);
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

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input) || !hash_equals($config['shared_secret'], (string) ($input['secret'] ?? ''))) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
    exit;
}

$to = trim((string) ($input['to'] ?? ''));
$subject = trim((string) ($input['subject'] ?? ''));
$body = trim((string) ($input['body'] ?? ''));

if (!filter_var($to, FILTER_VALIDATE_EMAIL) || $subject === '' || $body === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid input']);
    exit;
}

$mail = new PHPMailer(true);

try {
    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->isSMTP();
    $mail->Host = $config['smtp_host'];
    $mail->Port = $config['smtp_port'];
    $mail->SMTPAuth = true;
    $mail->Username = $config['smtp_username'];
    $mail->Password = $config['smtp_password'];
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;

    $mail->setFrom($config['from_email'], $config['from_name']);
    $mail->addAddress($to);
    $mail->Subject = $subject;
    $mail->Body = $body;
    $mail->isHTML(false);

    $mail->send();

    echo json_encode(['success' => true]);
} catch (PHPMailerException $exception) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $mail->ErrorInfo]);
}
