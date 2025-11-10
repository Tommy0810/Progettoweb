<?php
require_once 'config.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"), true);

if ($method === 'GET') {
    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    $perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 5;
    $search = isset($_GET['search']) ? trim($_GET['search']) : '';
    $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    
    $offset = ($page - 1) * $perPage;
    
    // Array per i parametri (sia per COUNT che per SELECT)
    $params = [];
    
    // Query base per SELECT
    $sqlSelect = "SELECT p.*, u.username,
            (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count";
            
    // Query base per FROM e WHERE
    $sqlFromWhere = " FROM posts p JOIN users u ON p.user_id = u.id WHERE 1=1";

    
    // Query base per COUNT
    $sqlCount = "SELECT COUNT(p.id) as total";

    // Filtro ricerca
    if (!empty($search)) {
        $sqlFromWhere .= " AND (p.title LIKE :search1 OR p.content LIKE :search2)";
        $params[':search1'] = "%$search%";
        $params[':search2'] = "%$search%";
    }
    
    // Filtro per utente specifico
    if ($userId) {
        $sqlFromWhere .= " AND p.user_id = :userid";
        $params[':userid'] = $userId;
    }
    
    // --- Esegui Query di Conteggio ---
    $countStmt = $db->prepare($sqlCount . $sqlFromWhere);
    $countStmt->execute($params);
    $total = $countStmt->fetch()['total'];
    
    // --- Esegui Query dei Post ---
    $sqlOrderLimit = " ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset";
    
    // Aggiungi i parametri di paginazione all'array
    $params[':limit'] = $perPage;
    $params[':offset'] = $offset;
    
    $stmt = $db->prepare($sqlSelect . $sqlFromWhere . $sqlOrderLimit);
    
    // Associa tutti i parametri
    foreach ($params as $key => $value) {
        // Usa PDO::PARAM_INT per i numeri, PDO::PARAM_STR per il resto
        if ($key === ':limit' || $key === ':offset' || $key === ':userid') {
            $stmt->bindValue($key, $value, PDO::PARAM_INT);
        } else {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
    }
    
    $stmt->execute();
    
    $posts = $stmt->fetchAll();
    
    jsonResponse([
        'success' => true,
        'data' => [
            'posts' => $posts,
            'pagination' => [
                'total' => (int)$total,
                'current_page' => $page,
                'per_page' => $perPage,
                'total_pages' => ceil($total / $perPage)
            ]
        ]
    ]);
}
// POST - Crea nuovo post
if ($method === 'POST') {
    $userId = validateToken();
    
    $title = trim($data['title'] ?? '');
    $content = trim($data['content'] ?? '');
    $imageUrl = $data['image_url'] ?? null;
    
    if (empty($title) || empty($content)) {
        jsonResponse(['success' => false, 'message' => 'Titolo e contenuto sono obbligatori'], 400);
    }
    
    $stmt = $db->prepare("INSERT INTO posts (user_id, title, content, image_url) VALUES (?, ?, ?, ?)");
    
    if ($stmt->execute([$userId, $title, $content, $imageUrl])) {
        $postId = $db->lastInsertId();
        
        // Recupera il post appena creato con tutti i dati
        $stmt = $db->prepare("
            SELECT p.*, u.username,
            0 as likes_count,
            0 as comments_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ?
        ");
        $stmt->execute([$postId]);
        $post = $stmt->fetch();
        
        jsonResponse([
            'success' => true,
            'message' => 'Post creato con successo',
            'data' => $post
        ], 201);
    } else {
        jsonResponse(['success' => false, 'message' => 'Errore durante la creazione del post'], 500);
    }
}

// DELETE - Elimina un post
if ($method === 'DELETE') {
    $userId = validateToken();
    
    // Ottieni l'ID del post dai parametri GET (es. .../posts.php?id=123)
    $postId = (int)($_GET['id'] ?? 0);
    
    if (empty($postId)) {
        jsonResponse(['success' => false, 'message' => 'ID post mancante'], 400);
    }
    
    // Query per eliminare il post SOLO se l'user_id corrisponde
    $stmt = $db->prepare("DELETE FROM posts WHERE id = ? AND user_id = ?");
    
    if ($stmt->execute([$postId, $userId])) {
        if ($stmt->rowCount() > 0) {
            // rowCount() > 0 significa che l'eliminazione è avvenuta
            jsonResponse([
                'success' => true,
                'message' => 'Post eliminato con successo'
            ]);
        } else {
            // rowCount() == 0 significa che nessun post corrispondeva (o non era dell'utente)
            jsonResponse([
                'success' => false,
                'message' => 'Impossibile eliminare il post. Potrebbe non esistere o non essere tuo.'
            ], 403); // 403 Forbidden
        }
    } else {
        jsonResponse(['success' => false, 'message' => 'Errore durante l\'eliminazione del post'], 500);
    }
}

// Metodo non supportato
jsonResponse(['success' => false, 'message' => 'Metodo non supportato'], 405);
?>