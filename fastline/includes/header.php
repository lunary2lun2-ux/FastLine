<?php require_once __DIR__ . '/functions.php'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e(APP_NAME) ?></title>
  <style>
    body{font-family:Arial,sans-serif;max-width:900px;margin:auto;padding:1rem}
    nav a{margin-right:1rem} table{border-collapse:collapse;width:100%}
    td,th{border:1px solid #ccc;padding:6px} .flash{padding:8px;border-radius:4px}
    .error{background:#fdd} .success{background:#dfd}
  </style>
</head>
<body>
<nav>
  <a href="/fastline/index.php">Home</a>
  <a href="/fastline/search.php">Search Trains</a>
  <?php if (is_logged_in()): ?>
    <a href="/fastline/my_bookings.php">My Bookings</a>
    <?php if (($_SESSION['role'] ?? '') === 'admin'): ?>
      <a href="/fastline/admin/bookings.php">Admin</a>
    <?php endif; ?>
    <a href="/fastline/logout.php">Logout (<?= e($_SESSION['name']) ?>)</a>
  <?php else: ?>
    <a href="/fastline/login.php">Login</a>
    <a href="/fastline/register.php">Register</a>
  <?php endif; ?>
</nav>
<hr>
<?php show_flash(); ?>