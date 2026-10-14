<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/includes/functions.php';
require_login();

$scheduleId = (int)($_GET['id'] ?? $_POST['schedule_id'] ?? 0);

// Load schedule details for display
$stmt = $pdo->prepare("
  SELECT s.*, t.name AS train_name, o.name AS origin, d.name AS destination
  FROM schedules s
  JOIN trains t ON t.id = s.train_id
  JOIN stations o ON o.id = s.origin_id
  JOIN stations d ON d.id = s.destination_id
  WHERE s.id = ?");
$stmt->execute([$scheduleId]);
$schedule = $stmt->fetch();

if (!$schedule) { http_response_code(404); exit('Schedule not found.'); }

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();

    $passenger = trim($_POST['passenger_name'] ?? '');
    $method    = in_array($_POST['method'] ?? '', ['mpesa','card','cash'], true) ? $_POST['method'] : 'mpesa';

    if ($passenger === '' || mb_strlen($passenger) > 100) {
        flash('error', 'Enter a valid passenger name.');
        redirect("book.php?id=$scheduleId");
    }

    try {
        $pdo->beginTransaction();

        // Lock the schedule row so concurrent bookings queue up
        $lock = $pdo->prepare("
          SELECT s.id, s.price, s.departure_time, s.status, t.total_seats
          FROM schedules s JOIN trains t ON t.id = s.train_id
          WHERE s.id = ? FOR UPDATE");
        $lock->execute([$scheduleId]);
        $s = $lock->fetch();

        if (!$s || $s['status'] !== 'scheduled' || strtotime($s['departure_time']) <= time()) {
            throw new RuntimeException('This trip is no longer available.');
        }

        // Find taken seats
        $q = $pdo->prepare("SELECT seat_number FROM bookings
                            WHERE schedule_id = ? AND status = 'confirmed'");
        $q->execute([$scheduleId]);
        $taken = array_map('intval', array_column($q->fetchAll(), 'seat_number'));

        // First free seat
        $seat = null;
        for ($i = 1; $i <= (int)$s['total_seats']; $i++) {
            if (!in_array($i, $taken, true)) { $seat = $i; break; }
        }
        if ($seat === null) {
            throw new RuntimeException('Sorry, this train is fully booked.');
        }

        $ref = generate_booking_ref();
        $pdo->prepare("INSERT INTO bookings (booking_ref, user_id, schedule_id, passenger_name, seat_number)
                       VALUES (?,?,?,?,?)")
            ->execute([$ref, $_SESSION['user_id'], $scheduleId, $passenger, $seat]);
        $bookingId = (int)$pdo->lastInsertId();

        $pdo->prepare("INSERT INTO payments (booking_id, amount, method, status)
                       VALUES (?,?,?, 'pending')")
            ->execute([$bookingId, $s['price'], $method]);

        $pdo->commit();
        flash('success', "Booking confirmed! Ref: $ref, Seat: $seat");
        redirect('my_bookings.php');

    } catch (RuntimeException $ex) {
        $pdo->rollBack();
        flash('error', $ex->getMessage());
        redirect('search.php');
    } catch (Throwable $ex) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log($ex->getMessage());
        flash('error', 'Booking failed. Please try again.');
        redirect("book.php?id=$scheduleId");
    }
}
require __DIR__ . '/includes/header.php';
?>
<h2>Confirm Booking</h2>
<p><strong><?= e($schedule['train_name']) ?></strong>:
   <?= e($schedule['origin']) ?> &rarr; <?= e($schedule['destination']) ?><br>
   Departs: <?= e($schedule['departure_time']) ?><br>
   Price: KES <?= number_format((float)$schedule['price'], 2) ?></p>

<form method="post">
  <?= csrf_field() ?>
  <input type="hidden" name="schedule_id" value="<?= (int)$scheduleId ?>">
  <p><label>Passenger name
     <input name="passenger_name" required value="<?= e($_SESSION['name']) ?>"></label></p>
  <p><label>Payment method
     <select name="method">
       <option value="mpesa">M-Pesa</option>
       <option value="card">Card</option>
       <option value="cash">Cash at station</option>
     </select></label></p>
  <button>Confirm &amp; Book</button>
</form>
<?php require __DIR__ . '/includes/footer.php'; ?>