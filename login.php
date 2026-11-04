<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/includes/functions.php';

if (isset($_GET['api'])) {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    
    $input = json_decode(file_get_contents('php://input'), true);
    $email = trim($input['email'] ?? '');
    $pw = $input['pw'] ?? '';
    
    if (!$email || !$pw) {
        echo json_encode(['success' => false, 'message' => 'Email and password required.']);
        exit;
    }
    
    // Look up the user
    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    
    // Verify the password against the hash in the database
    if ($user && password_verify($pw, $user['password_hash'])) {
        echo json_encode(['success' => true, 'id' => $user['id'], 'name' => $user['full_name'], 'email' => $user['email']]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid email or password.']);
    }
    exit;
}
?>