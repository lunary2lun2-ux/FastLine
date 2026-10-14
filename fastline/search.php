<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/includes/functions.php';

$stations = $pdo->query('SELECT id, name FROM stations ORDER BY name')->fetchAll();
$results  = null;

if (isset($_GET['origin'], $_GET['destination'], $_GET['date'])) {
    $origin = (int)$_GET['origin'];
    $dest   = (int)$_GET['destination'];
    $date   = $_GET['date'];

    $d = DateTime::createFromFormat('Y-m-d', $date);
    if ($origin === $dest) {
        flash('error', 'Origin and destination must be different.');
    } elseif (!$d || $d->format('Y-m-d') !== $date) {
        flash('error', 'Invalid date.');
    } else {
        $sql = "
          SELECT s.id, s.departure_time, s.arrival_time, s.price,
                 t.name AS train_name, t.train_number,
                 o.name AS origin, d.name AS destination,
                 (t.total_seats - (
                    SELECT COUNT(*) FROM bookings b
                    WHERE b.schedule_id = s.id AND b.status = 'confirmed'
                 )) AS seats_left
          FROM schedules s
          JOIN trains   t ON t.id = s.train_id
          JOIN stations o ON o.id = s.origin_id
          JOIN stations d ON d.id = s.destination_id
          WHERE s.origin_id = :o AND s.destination_id = :d
            AND DATE(s.departure_time) = :date
            AND s.departure_time > NOW()
            AND s.status = 'scheduled'
          ORDER BY s.departure_time";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':o' => $origin, ':d' => $dest, ':date' => $date]);
        $results = $stmt->fetchAll();
    }
}
require __DIR__ . '/includes/header.php';
?>
<h2>Search Trains</h2>
<form method="get">
  <label>From
    <select name="origin" required>
      <?php foreach ($stations as $s): ?>
        <option value="<?= (int)$s['id'] ?>"><?= e($s['name']) ?></option>
      <?php endforeach; ?>
    </select></label>
  <label>To
    <select name="destination" required>
      <?php foreach ($stations as $s): ?>
        <option value="<?= (int)$s['id'] ?>"><?= e($s['name']) ?></option>
      <?php endforeach; ?>
    </select></label>
  <label>Date <input type="date" name="date" min="<?= date('Y-m-d') ?>" required></label>
  <button>Search</button>
</form>

<?php if ($results !== null): ?>
  <?php if (!$results): ?>
    <p>No trains found for that route and date.</p>
  <?php else: ?>
    <table>
      <tr><th>Train</th><th>Route</th><th>Departs</th><th>Arrives</th><th>Price (KES)</th><th>Seats</th><th></th></tr>
      <?php foreach ($results as $r): ?>
      <tr>
        <td><?= e($r['train_name']) ?> (<?= e($r['train_number']) ?>)</td>
        <td><?= e($r['origin']) ?> &rarr; <?= e($r['destination']) ?></td>
        <td><?= e($r['departure_time']) ?></td>
        <td><?= e($r['arrival_time']) ?></td>
        <td><?= number_format((float)$r['price'], 2) ?></td>
        <td><?= (int)$r['seats_left'] ?></td>
        <td>
          <?php if ($r['seats_left'] > 0): ?>
            <a href="book.php?id=<?= (int)$r['id'] ?>">Book</a>
          <?php else: ?>Sold out<?php endif; ?>
        </td>
      </tr>
      <?php endforeach; ?>
    </table>
  <?php endif; ?>
<?php endif; ?>
<?php require __DIR__ . '/includes/footer.php'; ?>
