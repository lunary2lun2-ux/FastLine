<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_admin();

$trains   = $pdo->query('SELECT id, name, train_number FROM trains ORDER BY name')->fetchAll();
$stations = $pdo->query('SELECT id, name FROM stations ORDER BY name')->fetchAll();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $train  = (int)($_POST['train_id'] ?? 0);
    $origin = (int)($_POST['origin_id'] ?? 0);
    $dest   = (int)($_POST['destination_id'] ?? 0);
    $dep    = str_replace('T', ' ', $_POST['departure_time'] ?? '') . ':00';
    $arr    = str_replace('T', ' ', $_POST['arrival_time'] ?? '') . ':00';
    $price  = (float)($_POST['price'] ?? 0);

    if ($origin === $dest)                         flash('error', 'Origin and destination must differ.');
    elseif (strtotime($arr) <= strtotime($dep))    flash('error', 'Arrival must be after departure.');
    elseif ($price <= 0)                           flash('error', 'Price must be positive.');
    else {
        $pdo->prepare("INSERT INTO schedules
            (train_id, origin_id, destination_id, departure_time, arrival_time, price)
            VALUES (?,?,?,?,?,?)")
            ->execute([$train, $origin, $dest, $dep, $arr, $price]);
        flash('success', 'Schedule created.');
    }
    redirect('add_schedule.php');
}
require __DIR__ . '/../includes/header.php';
?>
<h2>Add Schedule</h2>
<form method="post">
  <?= csrf_field() ?>
  <p><label>Train
    <select name="train_id"><?php foreach ($trains as $t): ?>
      <option value="<?= (int)$t['id'] ?>"><?= e($t['name']) ?> (<?= e($t['train_number']) ?>)</option>
    <?php endforeach; ?></select></label></p>
  <p><label>From
    <select name="origin_id"><?php foreach ($stations as $s): ?>
      <option value="<?= (int)$s['id'] ?>"><?= e($s['name']) ?></option>
    <?php endforeach; ?></select></label></p>
  <p><label>To
    <select name="destination_id"><?php foreach ($stations as $s): ?>
      <option value="<?= (int)$s['id'] ?>"><?= e($s['name']) ?></option>
    <?php endforeach; ?></select></label></p>
  <p><label>Departure <input type="datetime-local" name="departure_time" required></label></p>
  <p><label>Arrival <input type="datetime-local" name="arrival_time" required></label></p>
  <p><label>Price (KES) <input type="number" step="0.01" name="price" required></label></p>
  <button>Create</button>
</form>
<?php require __DIR__ . '/../includes/footer.php'; ?>