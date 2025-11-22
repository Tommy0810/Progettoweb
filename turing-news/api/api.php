<?php
session_start(); // Gestione sessione PHP
require_once 'db.php';
header('Content-Type: application/json');

// Recupera parametri
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$userId = $_SESSION['user_id'] ?? null;

// Leggi input JSON
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true) ?? [];

// Funzione risposta standard
function response($success, $data = null, $message = '') {
    echo json_encode(['success' => $success, 'data' => $data, 'message' => $message]);
    exit;
}

// ROUTER DELLE AZIONI
switch ($action) {
    
    // --- AUTH ---
    case 'login':
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';
        
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password'])) {
            $_SESSION['user_id'] = $user['id']; // Salva sessione
            response(true, ['id' => $user['id'], 'username' => $user['username']]);
        } else {
            response(false, null, 'Credenziali non valide');
        }
        break;

    case 'register':
        $username = $input['username'] ?? '';
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';
        
        // Hash password
        $hash = password_hash($password, PASSWORD_DEFAULT);
        
        try {
            $stmt = $pdo->prepare("INSERT INTO users (username, email, password) VALUES (?, ?, ?)");
            $stmt->execute([$username, $email, $hash]);
            $_SESSION['user_id'] = $pdo->lastInsertId();
            response(true, null, 'Registrazione effettuata');
        } catch (Exception $e) {
            response(false, null, 'Email o Username già esistenti');
        }
        break;

    case 'logout':
        session_destroy();
        response(true);
        break;

    case 'check_auth':
        if ($userId) {
            $stmt = $pdo->prepare("SELECT id, username, email FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $user = $stmt->fetch();
            response(true, $user);
        } else {
            response(false);
        }
        break;

    // --- POSTS ---
    case 'get_posts':
        $sql = "SELECT p.*, u.username, 
                (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes,
                (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as liked_by_me
                FROM posts p 
                JOIN users u ON p.user_id = u.id 
                ORDER BY created_at DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$userId ?? 0]);
        $posts = $stmt->fetchAll();
        response(true, $posts);
        break;

    case 'create_post':
        if (!$userId) response(false, null, 'Non sei loggato');
        
        $title = $input['title'] ?? '';
        $content = $input['content'] ?? '';
        $image = $input['image_url'] ?? null;
        
        $stmt = $pdo->prepare("INSERT INTO posts (user_id, title, content, image_url) VALUES (?, ?, ?, ?)");
        $stmt->execute([$userId, $title, $content, $image]);
        response(true);
        break;
        
    case 'delete_post':
        if (!$userId) response(false, null, 'Non sei loggato');
        $postId = $input['id'] ?? 0;
        
        $stmt = $pdo->prepare("DELETE FROM posts WHERE id = ? AND user_id = ?");
        $stmt->execute([$postId, $userId]);
        response(true);
        break;

    // --- LIKES ---
    case 'toggle_like':
        if (!$userId) response(false, null, 'Effettua il login');
        $postId = $input['post_id'] ?? 0;

        // Controlla se esiste
        $check = $pdo->prepare("SELECT id FROM likes WHERE post_id = ? AND user_id = ?");
        $check->execute([$postId, $userId]);

        if ($check->rowCount() > 0) {
            $pdo->prepare("DELETE FROM likes WHERE post_id = ? AND user_id = ?")->execute([$postId, $userId]);
        } else {
            $pdo->prepare("INSERT INTO likes (post_id, user_id) VALUES (?, ?)")->execute([$postId, $userId]);
        }

        // Ritorna conteggio aggiornato
        $count = $pdo->prepare("SELECT COUNT(*) FROM likes WHERE post_id = ?");
        $count->execute([$postId]);
        response(true, $count->fetchColumn());
        break;

    // --- UPLOAD ---
    case 'upload':
        if (!isset($_FILES['image'])) response(false, null, 'Nessun file');
        
        $fileName = time() . '_' . basename($_FILES['image']['name']);
        $targetPath = '../uploads/' . $fileName;
        
        if (move_uploaded_file($_FILES['image']['tmp_name'], $targetPath)) {
            response(true, 'uploads/' . $fileName);
        } else {
            response(false, null, 'Errore caricamento file');
        }
        break;
// --- COMMENTI ---
    case 'get_comments':
        $postId = $input['post_id'] ?? $_GET['post_id'] ?? 0;
        // Recupera commenti e nome utente di chi ha scritto
        $stmt = $pdo->prepare("SELECT c.*, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC");
        $stmt->execute([$postId]);
        response(true, $stmt->fetchAll());
        break;

    case 'add_comment':
        if (!$userId) response(false, null, 'Devi essere loggato');
        $postId = $input['post_id'] ?? 0;
        $content = $input['content'] ?? '';
        
        if(empty($content)) response(false, null, 'Commento vuoto');

        $stmt = $pdo->prepare("INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)");
        $stmt->execute([$postId, $userId, $content]);
        response(true);
        break;
    default:
        response(false, null, 'Azione non valida');
}
?>