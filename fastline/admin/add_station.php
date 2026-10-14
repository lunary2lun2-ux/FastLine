<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../includes/functions.php';
require_admin();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $name = trim($_POST['name'] ?? '');
    $city = trim($_POST['city'] ?? '');
    if ($name === '' || $city === '') {
        flash('error', 'All fields are required.');
    } else {
        try {
            $pdo->prepare('INSERT INTO stations (name, city) VALUES (?,?)')->execute([$name, $city]);
            flash('success', 'Station added.');
        } catch (PDOException $e) {
            flash('error', 'Station already exists.');
        }
    }
    redirect('add_station.php');
}
require __DIR__ . '/../includes/header.php';
?>
<h2>Add Station</h2>
<form method="post">
  <?= csrf_field() ?>
  <p><label>Station name <input name="name" required></label></p>
  <p><label>City <input name="city" required></label></p>
  <button>Add</button>
</form>
<?php require __DIR__ . '/../includes/footer.php'; ?>