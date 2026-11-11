<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/includes/functions.php';

if (isset($_GET['api'])) {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    
    // Get the user_id sent from the frontend
    $user_id = (int)($_GET['user_id'] ?? 0);
    
    if (!$user_id) {
        echo json_encode(['success' => false, 'message' => 'Not logged in.']);
        exit;
    }

    try {
        // Join bookings with schedules and trains to get full details
        $sql = "SELECT b.id, b.booking_ref, b.passenger_name, b.status, b.booked_at,
                       s.departure_time, s.arrival_time, s.price,
                       t.name AS train_name, t.train_number,
                       o.name AS origin, d.name AS destination
                FROM bookings b
                JOIN schedules s ON s.id = b.schedule_id
                JOIN trains t ON t.id = s.train_id
                JOIN stations o ON o.id = s.origin_id
                JOIN stations d ON d.id = s.destination_id
                WHERE b.user_id = ?
                ORDER BY b.booked_at DESC";
                
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$user_id]);
        $bookings = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode(['success' => true, 'bookings' => $bookings]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}
?>