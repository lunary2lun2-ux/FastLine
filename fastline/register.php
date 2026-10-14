<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/includes/functions.php';

$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();

    $name  = trim($_POST['full_name'] ?? '');
    $email = strtolower(trim($_POST['email'] ?? ''));
    $phone = trim($_POST['phone'] ?? '');
    $pass  = $_POST['password'] ?? '';
    $pass2 = $_POST['password2'] ?? '';

    // Validation
    if ($name === '' || mb_strlen($name) > 100)            $errors[] = 'Enter a valid full name.';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL))        $errors[] = 'Enter a valid email.';
    if (!preg_match('/^\+?[0-9]{9,15}$/', $phone))         $errors[] = 'Enter a valid phone number.';
    if (strlen($pass) < 8)                                 $errors[] = 'Password must be at least 8 characters.';
    if ($pass !== $pass2)                                  $errors[] = 'Passwords do not match.';

    if (!$errors) {
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            $errors[] = 'Email is already registered.';
        } else {
            $hash = password_hash($pass, PASSWORD_DEFAULT);
            $ins  = $pdo->prepare(
                'INSERT INTO users (full_name, email, phone, password_hash) VALUES (?,?,?,?)'
            );
            $ins->execute([$name, $email, $phone, $hash]);
            flash('success', 'Account created. You can now log in.');
            redirect('login.php');
        }
    }
}
require __DIR__ . '/includes/header.php';
?>
<h2>Create Account</h2>
<?php foreach ($errors as $err): ?><p class="flash error"><?= e($err) ?></p><?php endforeach; ?>
<form method="post">
  <?= csrf_field() ?>
  <p><label>Full name <input name="full_name" required value="<?= e($_POST['full_name'] ?? '') ?>"></label></p>
  <p><label>Email <input type="email" name="email" required value="<?= e($_POST['email'] ?? '') ?>"></label></p>
  <p><label>Phone <input name="phone" required value="<?= e($_POST['phone'] ?? '') ?>"></label></p>
  <p><label>Password <input type="password" name="password" required></label></p>
  <p><label>Confirm <input type="password" name="password2" required></label></p>
  <button>Register</button>
</form>
<?php require __DIR__ . '/includes/footer.php'; ?>