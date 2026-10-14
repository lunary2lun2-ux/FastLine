<?php
require_once __DIR__ . '/config/config.php';
require __DIR__ . '/includes/header.php';
?>
<h1>Welcome to <?= e(APP_NAME) ?></h1>
<p>Fast, safe and comfortable train travel. Search a route, pick a seat, and travel.</p>
<p><a href="search.php">Search trains &rarr;</a></p>
<?php require __DIR__ . '/includes/footer.php'; ?>