<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/includes/functions.php';

if (isset($_GET['api'])) {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    
    // Get the JSON sent from the frontend
    $input = json_decode(file_get_contents('php://input'), true);
    
    $name = trim($input['name'] ?? '');
    $email = trim($input['email'] ?? '');
    $pw = $input['pw'] ?? '';
    $phone = trim($input['phone'] ?? '0000000000'); // Optional default
    
    if (strlen($name) < 3 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($pw) < 8) {
        echo json_encode(['success' => false, 'message' => 'Invalid name, email, or password (min 8 chars).']);
        exit;
    }
    
    // Check if email already exists
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        echo json_encode(['success' => false, 'message' => 'Email already registered.']);
        exit;
    }
    
    // Hash the password securely
    $hash = password_hash($pw, PASSWORD_DEFAULT);
    
    // Insert into database
    $stmt = $pdo->prepare("INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'passenger')");
    
    if ($stmt->execute([$name, $email, $phone, $hash])) {
        echo json_encode(['success' => true, 'name' => $name, 'email' => $email]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Database error. Could not register.']);
    }
    exit;
}
?>