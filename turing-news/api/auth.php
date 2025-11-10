<?php
require_once 'config.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"), true);

// REGISTRAZIONE
if ($method === 'POST' && isset($data['action']) && $data['action'] === 'register') {
    $username = trim($data['username'] ?? '');
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';
    
    // Validazione
    if (empty($username) || empty($email) || empty($password)) {
        jsonResponse(['success' => false, 'message' => 'Tutti i campi sono obbligatori'], 400);
    }
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => 'Email non valida'], 400);
    }
    
    // Verifica se l'utente esiste già
    $stmt = $db->prepare("SELECT id FROM users WHERE email = ? OR username = ?");
    $stmt->execute([$email, $username]);
    
    if ($stmt->rowCount() > 0) {
        jsonResponse(['success' => false, 'message' => 'Email o username già in uso'], 400);
    }
    
    // Hash password
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    
    // Inserisci utente
    $stmt = $db->prepare("INSERT INTO users (username, email, password) VALUES (?, ?, ?)");
    
    if ($stmt->execute([$username, $email, $hashedPassword])) {
        $userId = $db->lastInsertId();
        $token = generateToken($userId);
        
        jsonResponse([
            'success' => true,
            'message' => 'Registrazione completata',
            'data' => [
                'id' => $userId,
                'username' => $username,
                'email' => $email,
                'token' => $token
            ]
        ], 201);
    } else {
        jsonResponse(['success' => false, 'message' => 'Errore durante la registrazione'], 500);
    }
}

// LOGIN
if ($method === 'POST' && isset($data['action']) && $data['action'] === 'login') {
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';
    
    if (empty($email) || empty($password)) {
        jsonResponse(['success' => false, 'message' => 'Email e password sono obbligatori'], 400);
    }
    
    // Cerca utente
    $stmt = $db->prepare("SELECT id, username, email, password FROM users WHERE email = ?");
    $stmt->execute([$email]);
    
    if ($stmt->rowCount() === 0) {
        jsonResponse(['success' => false, 'message' => 'Credenziali non valide'], 401);
    }
    
    $user = $stmt->fetch();
    
    // Verifica password
    if (!password_verify($password, $user['password'])) {
        jsonResponse(['success' => false, 'message' => 'Credenziali non valide'], 401);
    }
    
    $token = generateToken($user['id']);
    
    jsonResponse([
        'success' => true,
        'message' => 'Login effettuato',
        'data' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'email' => $user['email'],
            'token' => $token
        ]
    ]);
}

// VERIFICA TOKEN (GET USER INFO)
if ($method === 'GET') {
    $userId = validateToken();
    
    $stmt = $db->prepare("SELECT id, username, email, created_at FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    
    if ($stmt->rowCount() === 0) {
        jsonResponse(['success' => false, 'message' => 'Utente non trovato'], 404);
    }
    
    $user = $stmt->fetch();
    jsonResponse(['success' => true, 'data' => $user]);
}

// Metodo non supportato
jsonResponse(['success' => false, 'message' => 'Metodo non supportato'], 405);
?>