<?php
declare(strict_types=1);

// ---- Database settings ----
define('DB_HOST', 'localhost');
define('DB_NAME', 'fastline_db');
define('DB_USER', 'root');
define('DB_PASS', '');
define('APP_NAME', 'FastLine Transport');

// ---- Secure session ----
ini_set('session.use_strict_mode', '1');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    // 'secure' => true,   // enable when using HTTPS
]);
session_start();

// ---- PDO connection ----
try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    error_log($e->getMessage());
    exit('Database connection failed. Please try again later.');
}