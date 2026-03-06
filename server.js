const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static("public/hls", {
  maxAge: "1h",
  etag: false,
  lastModified: false
}));

// MIME types for HLS
const mimeTypes = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html'
};

// Custom middleware for HLS files with proper caching
app.use((req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  
  if (ext === '.m3u8') {
    res.set({
      'Content-Type': mimeTypes['.m3u8'],
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*'
    });
  } else if (ext === '.ts') {
    res.set({
      'Content-Type': mimeTypes['.ts'],
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    });
  }
  
  next();
});

// Enhanced HLS streaming with range requests
app.get('/hls/stream.m3u8', (req, res) => {
  const m3u8Path = path.join(__dirname, 'public/hls/stream.m3u8');
  
  fs.readFile(m3u8Path, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading m3u8:', err);
      return res.status(500).send('#EXTM3U\n#EXT-X-ERROR:Stream not available');
    }
    
    // Rewrite relative URLs to absolute
    let modifiedData = data.replace(/^(?!#)(.*)$/gm, (match) => {
      if (match.includes('http')) return match;
      return `/hls/${match}`;
    });
    
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    
    res.send(modifiedData);
  });
});

// Segments proxy for better handling
app.get('/hls/:segment', (req, res) => {
  const segment = req.params.segment;
  const segmentPath = path.join(__dirname, 'public/hls', segment);
  
  if (!segment.endsWith('.ts') && !segment.endsWith('.m3u8')) {
    return res.status(404).send('Not found');
  }
  
  fs.stat(segmentPath, (err, stats) => {
    if (err || !stats.isFile()) {
      console.error('Segment not found:', segmentPath);
      return res.status(404).send('Segment not found');
    }
    
    const range = req.headers.range;
    const ext = path.extname(segment).toLowerCase();
    
    if (range && ext === '.ts') {
      const positions = range.replace(/bytes=/, "").split("-");
      const start = parseInt(positions[0], 10);
      const end = positions[1] ? parseInt(positions[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        "Content-Type": "video/mp2t",
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      });
      
      const stream = fs.createReadStream(segmentPath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Type": ext === '.m3u8' ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
        "Content-Length": stats.size,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      });
      
      const stream = fs.createReadStream(segmentPath);
      stream.pipe(res);
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const hlsDir = path.join(__dirname, 'public/hls');
  
  fs.readdir(hlsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ status: 'error', message: 'Cannot read HLS directory' });
    }
    
    const m3u8Exists = files.includes('stream.m3u8');
    const tsFiles = files.filter(f => f.endsWith('.ts'));
    
    res.json({
      status: m3u8Exists ? 'ok' : 'error',
      m3u8: m3u8Exists,
      segments: tsFiles.length,
      files: files
    });
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    server: 'Radio Video Stream v2.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Serve the player HTML
app.get('/player', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Radio Video Stream</title>
  <link href="https://vjs.zencdn.net/8.3.0/video-js.css" rel="stylesheet" />
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .container {
      width: 100%;
      max-width: 900px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      padding: 30px;
      backdrop-filter: blur(10px);
    }
    
    h1 {
      color: #fff;
      text-align: center;
      margin-bottom: 20px;
      font-size: 2rem;
    }
    
    .video-container {
      position: relative;
      width: 100%;
      padding-top: 56.25%;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
    }
    
    .video-container video {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    
    .controls {
      display: flex;
      justify-content: center;
      gap: 15px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
    
    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-weight: 600;
    }
    
    .btn-primary {
      background: #e94560;
      color: #fff;
    }
    
    .btn-primary:hover {
      background: #ff6b6b;
      transform: translateY(-2px);
    }
    
    .btn-secondary {
      background: #0f3460;
      color: #fff;
    }
    
    .btn-secondary:hover {
      background: #1a4a7a;
      transform: translateY(-2px);
    }
    
    .status {
      text-align: center;
      margin-top: 20px;
      color: #aaa;
      font-size: 14px;
    }
    
    .status-indicator {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 8px;
      animation: pulse 2s infinite;
    }
    
    .status-ok {
      background: #00ff88;
    }
    
    .status-error {
      background: #ff4757;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .error-message {
      background: rgba(255, 71, 87, 0.1);
      border: 1px solid #ff4757;
      color: #ff4757;
      padding: 15px;
      border-radius: 8px;
      margin-top: 15px;
      text-align: center;
      display: none;
    }
    
    .loader {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255, 255, 255, 0.1);
      border-top: 4px solid #e94560;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      z-index: 10;
    }
    
    @keyframes spin {
      0% { transform: translate(-50%, -50%) rotate(0deg); }
      100% { transform: translate(-50%, -50%) rotate(360deg); }
    }
    
    .video-js {
      width: 100%;
      height: 100%;
    }
    
    .video-js .vjs-tech {
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Radio Video Stream</h1>
    
    <div class="video-container">
      <div class="loader" id="loader"></div>
      <video
        id="my-video"
        class="video-js vjs-big-play-centered"
        controls
        preload="auto"
        autoplay
        muted
        playsinline
        data-setup='{
          "fluid": true,
          "playbackRates": [0.5, 1, 1.5, 2],
          "html5": {
            "vhs": {
              "overrideNative": true,
              "enableLowInitialPlaylist": true
            }
          }
        }'
      >
        <source src="/hls/stream.m3u8" type="application/x-mpegURL">
      </video>
    </div>
    
    <div class="error-message" id="error-message"></div>
    
    <div class="controls">
      <button class="btn btn-primary" onclick="playStream()">Reproducir</button>
      <button class="btn btn-secondary" onclick="checkStatus()">Verificar Estado</button>
      <button class="btn btn-secondary" onclick="reloadStream()">Recargar Stream</button>
    </div>
    
    <div class="status" id="status">
      <span class="status-indicator status-ok"></span>
      <span id="status-text">Conectando...</span>
    </div>
  </div>

  <script src="https://vjs.zencdn.net/8.3.0/video.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <script>
    let player = null;
    let hls = null;
    
    // Initialize video.js player
    document.addEventListener('DOMContentLoaded', function() {
      player = videojs('my-video', {
        fluid: true,
        autoplay: true,
        muted: true,
        controls: true,
        preload: 'auto',
        playbackRates: [0.5, 1, 1.5, 2],
        html5: {
          vhs: {
            overrideNative: true,
            enableLowInitialPlaylist: true,
            cacheEncryptionKeys: true
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false
        }
      });
      
      player.on('ready', function() {
        document.getElementById('loader').style.display = 'none';
        updateStatus('Conectado', true);
      });
      
      player.on('waiting', function() {
        document.getElementById('loader').style.display = 'block';
        updateStatus('Cargando buffer...', false);
      });
      
      player.on('playing', function() {
        document.getElementById('loader').style.display = 'none';
        updateStatus('Transmitiendo', true);
      });
      
      player.on('error', function() {
        document.getElementById('loader').style.display = 'none';
        updateStatus('Error de conexión', false);
        showError('Error al cargar el stream. Intentando reconectar...');
        setTimeout(reloadStream, 3000);
      });
      
      player.on('stalled', function() {
        updateStatus('Buffering...', false);
      });
      
      // Try to play
      player.play().catch(function(e) {
        console.log('Autoplay prevented:', e);
        updateStatus('Haz clic en reproducir para comenzar', false);
      });
    });
    
    function playStream() {
      if (player) {
        player.play().catch(function(e) {
          showError('No se pudo reproducir el stream');
        });
      }
    }
    
    function reloadStream() {
      hideError();
      document.getElementById('loader').style.display = 'block';
      
      if (player) {
        player.src({
          src: '/hls/stream.m3u8',
          type: 'application/x-mpegURL'
        });
        player.play().catch(function(e) {
          console.log('Play error:', e);
        });
      }
    }
    
    function checkStatus() {
      fetch('/health')
        .then(res => res.json())
        .then(data => {
          if (data.status === 'ok') {
            updateStatus('Stream activo (' + data.segments + ' segmentos)', true);
          } else {
            updateStatus('Stream no disponible', false);
            showError('El stream no está disponible en este momento');
          }
        })
        .catch(err => {
          updateStatus('Error de conexión', false);
          showError('No se pudo verificar el estado del servidor');
        });
    }
    
    function updateStatus(text, isOk) {
      const statusEl = document.getElementById('status');
      const indicator = statusEl.querySelector('.status-indicator');
      const statusText = document.getElementById('status-text');
      
      indicator.className = 'status-indicator ' + (isOk ? 'status-ok' : 'status-error');
      statusText.textContent = text;
    }
    
    function showError(message) {
      const errorEl = document.getElementById('error-message');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
    
    function hideError() {
      document.getElementById('error-message').style.display = 'none';
    }
    
    // Auto-reload on network issues
    window.addEventListener('online', function() {
      reloadStream();
    });
  </script>
</body>
</html>
  `);
});

// Root endpoint redirects to player
app.get("/", (req, res) => {
  res.redirect("/player");
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de streaming v2.0 iniciado en puerto ${PORT}`);
  console.log(`Player disponible en: http://localhost:${PORT}/player`);
  console.log(`Estado en: http://localhost:${PORT}/health`);
});
