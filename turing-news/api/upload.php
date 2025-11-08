<?php
require_once 'config.php';

$userId = validateToken();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['success' => false, 'message' => 'Metodo non supportato'], 405);
}

if (!isset($_FILES['image'])) {
    jsonResponse(['success' => false, 'message' => 'Nessuna immagine caricata'], 400);
}

$file = $_FILES['image'];

// Validazione file
$allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$maxSize = 5 * 1024 * 1024; // 5MB

if (!in_array($file['type'], $allowedTypes)) {
    jsonResponse(['success' => false, 'message' => 'Tipo di file non supportato. Usa JPG, PNG, GIF o WebP'], 400);
}

if ($file['size'] > $maxSize) {
    jsonResponse(['success' => false, 'message' => 'File troppo grande. Max 5MB'], 400);
}

// Crea cartella uploads se non esiste
$uploadDir = '../uploads/';
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

// Genera nome file unico
$extension = pathinfo($file['name'], PATHINFO_EXTENSION);
$filename = $userId . '_' . time() . '_' . uniqid() . '.' . $extension;
$filepath = $uploadDir . $filename;

// Sposta il file
if (move_uploaded_file($file['tmp_name'], $filepath)) {
    // URL relativo
    $imageUrl = 'uploads/' . $filename;
    
    jsonResponse([
        'success' => true,
        'message' => 'Immagine caricata con successo',
        'data' => [
            'url' => $imageUrl
        ]
    ], 201);
} else {
    jsonResponse(['success' => false, 'message' => 'Errore durante il caricamento'], 500);
}
?>