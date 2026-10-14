<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/includes/functions.php';

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();

    $email = strtolower(trim($_POST['email'] ?? ''));
    $pass  = $_POST['password'] ?? '';

    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user && password_verify($pass, $user['password_hash'])) {
        session_regenerate_id(true);               // prevents session fixation
        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['name']    = $user['full_name'];
        $_SESSION['role']    = $user['role'];

        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')
                ->execute([password_hash($pass, PASSWORD_DEFAULT), $user['id']]);
        }
        redirect($user['role'] === 'admin' ? 'admin/bookings.php' : 'search.php');
    }
    $error = 'Invalid email or password.';      // generic message on purpose
}
require __DIR__ . '/includes/header.php';
?>
<h2>Login</h2>
<?php if ($error): ?><p class="flash error"><?= e($error) ?></p><?php endif; ?>
<form method="post">
  <?= csrf_field() ?>
  <p><label>Email <input type="email" name="email" required></label></p>
  <p><label>Password <input type="password" name="password" required></label></p>
  <button>Login</button>
</form>
<?php require __DIR__ . '/includes/footer.php'; ?>