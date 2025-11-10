<?php
require_once 'config.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"), true);

// LIKE
if ($method === 'POST' && isset($data['action']) && $data['action'] === 'like') {
    $userId = validateToken();
    $postId = (int)($data['post_id'] ?? 0);
    
    if (!$postId) {
        jsonResponse(['success' => false, 'message' => 'ID post mancante'], 400);
    }
    
    // Verifica se il like esiste già
    $stmt = $db->prepare("SELECT id FROM likes WHERE post_id = ? AND user_id = ?");
    $stmt->execute([$postId, $userId]);
    
    if ($stmt->rowCount() > 0) {
        // Rimuovi like
        $stmt = $db->prepare("DELETE FROM likes WHERE post_id = ? AND user_id = ?");
        $stmt->execute([$postId, $userId]);
        $liked = false;
    } else {
        // Aggiungi like
        $stmt = $db->prepare("INSERT INTO likes (post_id, user_id) VALUES (?, ?)");
        $stmt->execute([$postId, $userId]);
        $liked = true;
    }
    
    // Conta i like totali
    $stmt = $db->prepare("SELECT COUNT(*) as count FROM likes WHERE post_id = ?");
    $stmt->execute([$postId]);
    $likesCount = $stmt->fetch()['count'];
    
    jsonResponse([
        'success' => true,
        'data' => [
            'liked' => $liked,
            'likes_count' => (int)$likesCount
        ]
    ]);
}

// COMMENTI - Aggiungi commento
if ($method === 'POST' && isset($data['action']) && $data['action'] === 'comment') {
    $userId = validateToken();
    $postId = (int)($data['post_id'] ?? 0);
    $content = trim($data['content'] ?? '');
    
    if (!$postId || empty($content)) {
        jsonResponse(['success' => false, 'message' => 'Post ID e contenuto sono obbligatori'], 400);
    }
    
    $stmt = $db->prepare("INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)");
    
    if ($stmt->execute([$postId, $userId, $content])) {
        $commentId = $db->lastInsertId();
        
        // Recupera il commento con username
        $stmt = $db->prepare("
            SELECT c.*, u.username 
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        ");
        $stmt->execute([$commentId]);
        $comment = $stmt->fetch();
        
        jsonResponse([
            'success' => true,
            'message' => 'Commento aggiunto',
            'data' => $comment
        ], 201);
    } else {
        jsonResponse(['success' => false, 'message' => 'Errore durante l\'aggiunta del commento'], 500);
    }
}

// COMMENTI - Lista commenti di un post
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'comments') {
    $postId = (int)($_GET['post_id'] ?? 0);
    
    if (!$postId) {
        jsonResponse(['success' => false, 'message' => 'ID post mancante'], 400);
    }
    
    $stmt = $db->prepare("
        SELECT c.*, u.username 
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC
    ");
    $stmt->execute([$postId]);
    
    $comments = $stmt->fetchAll();
    
    jsonResponse([
        'success' => true,
        'data' => $comments
    ]);
}
// POST CON LIKE
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'liked') {
    $userId = validateToken();
    
    $stmt = $db->prepare("
        SELECT p.*, u.username,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count
        FROM posts p
        JOIN users u ON p.user_id = u.id
        JOIN likes l ON p.id = l.post_id
        WHERE l.user_id = ?
        ORDER BY l.created_at DESC
    ");
    $stmt->execute([$userId]);
    
    $posts = $stmt->fetchAll();
    
    jsonResponse([
        'success' => true,
        'data' => $posts
    ]);
}

// CHECK LIKE 
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'check_like') {
    $userId = validateToken();
    $postId = (int)($_GET['post_id'] ?? 0);
    
    if (!$postId) {
        jsonResponse(['success' => false, 'message' => 'ID post mancante'], 400);
    }
    
    $stmt = $db->prepare("SELECT id FROM likes WHERE post_id = ? AND user_id = ?");
    $stmt->execute([$postId, $userId]);
    
    jsonResponse([
        'success' => true,
        'data' => [
            'liked' => $stmt->rowCount() > 0
        ]
    ]);
}

jsonResponse(['success' => false, 'message' => 'Metodo o azione non supportati'], 405);
?>