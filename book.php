<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/includes/functions.php';

if (isset($_GET['api'])) {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    
    // Get JSON input from app.js
    $input = json_decode(file_get_contents('php://input'), true);
    
    $schedule_id = (int)($input['schedule_id'] ?? 0);
    $user_id = (int)($input['user_id'] ?? 0);
    $passenger_name = trim($input['passenger_name'] ?? '');
    
    if (!$schedule_id || !$passenger_name) {
        echo json_encode(['success' => false, 'message' => 'Missing required booking details.']);
        exit;
    }

    // Generate a random booking reference
    $booking_ref = 'FL-' . strtoupper(substr(uniqid(), -6));
    
    // If no user is logged in, user_id is NULL (guest checkout)
    $user_id_val = $user_id > 0 ? $user_id : null;

    try {
        $sql = "INSERT INTO bookings (booking_ref, user_id, schedule_id, passenger_name, status) 
                VALUES (?, ?, ?, ?, 'confirmed')";
        $stmt = $pdo->prepare($sql);
        
        if ($stmt->execute([$booking_ref, $user_id_val, $schedule_id, $passenger_name])) {
            echo json_encode(['success' => true, 'booking_ref' => $booking_ref]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Database error. Could not book.']);
        }
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// If someone visits book.php without the API, send them back to the homepage
header('Location: index.html');
exit;
?>