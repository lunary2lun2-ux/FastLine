<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_admin();

$rows = $pdo->query("
  SELECT b.booking_ref, b.passenger_name, b.seat_number, b.status, b.booked_at,
         u.email, t.name AS train_name,
         o.name AS origin, d.name AS destination, s.departure_time
  FROM bookings b
  JOIN users u     ON u.id = b.user_id
  JOIN schedules s ON s.id = b.schedule_id
  JOIN trains t    ON t.id = s.train_id
  JOIN stations o  ON o.id = s.origin_id
  JOIN stations d  ON d.id = s.destination_id
  ORDER BY b.booked_at DESC
  LIMIT 200")->fetchAll();

require __DIR__ . '/../includes/header.php';
?>
<h2>All Bookings</h2>
<p>
  <a href="add_station.php">Add station</a> |
  <a href="add_train.php">Add train</a> |
  <a href="add_schedule.php">Add schedule</a>
</p>
<table>
  <tr><th>Ref</th><th>Passenger</th><th>Email</th><th>Train</th><th>Route</th><th>Departs</th><th>Seat</th><th>Status</th></tr>
  <?php foreach ($rows as $r): ?>
  <tr>
    <td><?= e($r['booking_ref']) ?></td>
    <td><?= e($r['passenger_name']) ?></td>
    <td><?= e($r['email']) ?></td>
    <td><?= e($r['train_name']) ?></td>
    <td><?= e($r['origin']) ?> &rarr; <?= e($r['destination']) ?></td>
    <td><?= e($r['departure_time']) ?></td>
    <td><?= $r['seat_number'] ?: '-' ?></td>
    <td><?= e($r['status']) ?></td>
  </tr>
  <?php endforeach; ?>
</table>
<?php require __DIR__ . '/../includes/footer.php'; ?>