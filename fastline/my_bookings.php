<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/includes/functions.php';
require_login();

$stmt = $pdo->prepare("
  SELECT b.id, b.booking_ref, b.passenger_name, b.seat_number, b.status, b.booked_at,
         s.departure_time, s.price,
         t.name AS train_name,
         o.name AS origin, d.name AS destination,
         p.status AS pay_status, p.method
  FROM bookings b
  JOIN schedules s ON s.id = b.schedule_id
  JOIN trains t    ON t.id = s.train_id
  JOIN stations o  ON o.id = s.origin_id
  JOIN stations d  ON d.id = s.destination_id
  LEFT JOIN payments p ON p.booking_id = b.id
  WHERE b.user_id = ?
  ORDER BY s.departure_time DESC");
$stmt->execute([$_SESSION['user_id']]);
$bookings = $stmt->fetchAll();

require __DIR__ . '/includes/header.php';
?>
<h2>My Bookings</h2>
<?php if (!$bookings): ?>
  <p>You have no bookings yet.</p>
<?php else: ?>
<table>
  <tr><th>Ref</th><th>Passenger</th><th>Route</th><th>Departs</th><th>Seat</th><th>Status</th><th>Payment</th><th></th></tr>
  <?php foreach ($bookings as $b): ?>
  <tr>
    <td><?= e($b['booking_ref']) ?></td>
    <td><?= e($b['passenger_name']) ?></td>
    <td><?= e($b['origin']) ?> &rarr; <?= e($b['destination']) ?></td>
    <td><?= e($b['departure_time']) ?></td>
    <td><?= $b['seat_number'] ? (int)$b['seat_number'] : '-' ?></td>
    <td><?= e($b['status']) ?></td>
    <td><?= e($b['pay_status'] ?? '') ?> (<?= e($b['method'] ?? '') ?>)</td>
    <td>
      <?php if ($b['status'] === 'confirmed' && strtotime($b['departure_time']) > time()): ?>
      <form method="post" action="cancel_booking.php" onsubmit="return confirm('Cancel this booking?')">
        <?= csrf_field() ?>
        <input type="hidden" name="booking_id" value="<?= (int)$b['id'] ?>">
        <button>Cancel</button>
      </form>
      <?php endif; ?>
    </td>
  </tr>
  <?php endforeach; ?>
</table>
<?php endif; ?>
<?php require __DIR__ . '/includes/footer.php'; ?>
cancel_booking.php
<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/includes/functions.php';
require_login();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') redirect('my_bookings.php');
csrf_check();

$bookingId = (int)($_POST['booking_id'] ?? 0);

try {
    $pdo->beginTransaction();

    // Ownership check: user_id must match the logged-in user
    $stmt = $pdo->prepare("
      SELECT b.id, b.status, s.departure_time
      FROM bookings b JOIN schedules s ON s.id = b.schedule_id
      WHERE b.id = ? AND b.user_id = ? FOR UPDATE");
    $stmt->execute([$bookingId, $_SESSION['user_id']]);
    $b = $stmt->fetch();

    if (!$b)                                  throw new RuntimeException('Booking not found.');
    if ($b['status'] !== 'confirmed')         throw new RuntimeException('Booking already cancelled.');
    if (strtotime($b['departure_time']) <= time())
                                              throw new RuntimeException('Departed trips cannot be cancelled.');

    // Free the seat (seat_number = NULL) and mark cancelled
    $pdo->prepare("UPDATE bookings SET status='cancelled', seat_number=NULL WHERE id=?")
        ->execute([$bookingId]);
    $pdo->prepare("UPDATE payments SET status = IF(status='paid','refunded',status) WHERE booking_id=?")
        ->execute([$bookingId]);

    $pdo->commit();
    flash('success', 'Booking cancelled.');
} catch (RuntimeException $ex) {
    $pdo->rollBack();
    flash('error', $ex->getMessage());
} catch (Throwable $ex) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log($ex->getMessage());
    flash('error', 'Could not cancel booking.');
}
redirect('my_bookings.php');