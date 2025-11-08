<?php
// Configurazione database
define('DB_HOST', 'localhost');
define('DB_NAME', 'turing_news');
define('DB_USER', 'root');
define('DB_PASS', '');  // Password di default XAMPP è vuota

// Configurazione CORS (per permettere richieste dal frontend)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=UTF-8');

// Gestione preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Classe Database
class Database {
    private $conn;
    
    public function getConnection() {
        $this->conn = null;
        
        try {
            $this->conn = new PDO(
                "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
                DB_USER,
                DB_PASS
            );
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        } catch(PDOException $e) {
            echo json_encode([
                'success' => false,
                'message' => 'Errore di connessione: ' . $e->getMessage()
            ]);
            exit();
        }
        
        return $this->conn;
    }
}

// Funzione per validare JWT token (semplificata)
function validateToken() {
    $headers = getallheaders();
    $token = isset($headers['Authorization']) ? str_replace('Bearer ', '', $headers['Authorization']) : null;
    
    if (!$token) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Token mancante']);
        exit();
    }
    
    // Decodifica il token (in questo caso è semplicemente user_id:timestamp)
    $parts = explode(':', base64_decode($token));
    if (count($parts) !== 2) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Token non valido']);
        exit();
    }
    
    return (int)$parts[0]; // Restituisce user_id
}

// Funzione per generare token
function generateToken($userId) {
    return base64_encode($userId . ':' . time());
}

// Funzione per risposta JSON
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit();
}
?>