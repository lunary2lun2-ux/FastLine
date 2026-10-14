<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_admin();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $name   = trim($_POST['name'] ?? '');
    $number = strtoupper(trim($_POST['train_number'] ?? ''));
    $seats  = (int)($_POST['total_seats'] ?? 0);

    if ($name === '' || $number === '' || $seats < 1 || $seats > 1000) {
        flash('error', 'Provide valid train details.');
    } else {
        try {
            $pdo->prepare('INSERT INTO trains (name, train_number, total_seats) VALUES (?,?,?)')
                ->execute([$name, $number, $seats]);
            flash('success', 'Train added.');
        } catch (PDOException $e) {
            flash('error', 'Train number already exists.');
        }
    }
    redirect('add_train.php');
}
require __DIR__ . '/../includes/header.php';
?>
<h2>Add Train</h2>
<form method="post">
  <?= csrf_field() ?>
  <p><label>Name <input name="name" required></label></p>
  <p><label>Train number <input name="train_number" required></label></p>
  <p><label>Total seats <input type="number" name="total_seats" min="1" max="1000" required></label></p>
  <button>Add</button>
</form>
<?php require __DIR__ . '/../includes/footer.php'; ?>