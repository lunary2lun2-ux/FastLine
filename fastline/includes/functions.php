<?php
declare(strict_types=1);

/** Escape output (prevents XSS) */
function e(?string $value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function redirect(string $url): never {
    header("Location: $url");
    exit;
}

/** Flash messages */
function flash(string $type, string $msg): void {
    $_SESSION['flash'][] = ['type' => $type, 'msg' => $msg];
}
function show_flash(): void {
    foreach ($_SESSION['flash'] ?? [] as $f) {
        echo '<p class="flash ' . e($f['type']) . '">' . e($f['msg']) . '</p>';
    }
    unset($_SESSION['flash']);
}

/** CSRF protection */
function csrf_token(): string {
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}
function csrf_field(): string {
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}
function csrf_check(): void {
    $sent = $_POST['csrf'] ?? '';
    if (!hash_equals($_SESSION['csrf'] ?? '', $sent)) {
        http_response_code(419);
        exit('Invalid or expired form. Please go back and try again.');
    }
}

/** Authentication helpers */
function is_logged_in(): bool {
    return isset($_SESSION['user_id']);
}
function require_login(): void {
    if (!is_logged_in()) {
        flash('error', 'Please log in first.');
        redirect('/fastline/login.php');
    }
}
function require_admin(): void {
    require_login();
    if (($_SESSION['role'] ?? '') !== 'admin') {
        http_response_code(403);
        exit('Access denied.');
    }
}

/** Unique booking reference e.g. FL3A9C01BD */
function generate_booking_ref(): string {
    return 'FL' . strtoupper(bin2hex(random_bytes(4)));
}