#!/bin/bash

echo "========================================="
echo "INICIANDO SERVICIO DE STREAMING v2.0"
echo "========================================="

# Create HLS directory
mkdir -p public/hls

# Function to handle cleanup on exit
cleanup() {
    echo "Deteniendo servicios..."
    pkill -f "ffmpeg.*stream.m3u8" 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Download sample video if not exists (for testing)
if [ ! -f "video.mp4" ]; then
    echo "Descargando video de prueba..."
    # Use a small test video
    curl -L -o video.mp4 "https://filesamples.com/samples/video/mp4/sample_640x360.mp4" 2>/dev/null || \
    curl -L -o video.mp4 "https://www.w3schools.com/html/mov_bbb.mp4" 2>/dev/null || \
    echo "AVISO: No se pudo descargar video de prueba"
fi

# Wait for network to be ready
echo "Esperando conexión de red..."
sleep 3

# Kill any existing ffmpeg processes
pkill -f "ffmpeg.*stream.m3u8" 2>/dev/null
sleep 1

# Clean old HLS files
rm -f public/hls/stream*.ts public/hls/stream*.m3u8 2>/dev/null

# Function to start FFmpeg
start_ffmpeg() {
    echo "Iniciando FFmpeg con configuración optimizada..."
    
    if [ ! -f "video.mp4" ]; then
        echo "ERROR: No se encontró video.mp4"
        return 1
    fi
    
    # Optimized FFmpeg configuration for stable streaming
    ffmpeg -re -stream_loop -1 \
        -i video.mp4 \
        -i https://stream.zeno.fm/yg7bvksbfwzuv \
        -map 0:v:0 -map 1:a:0 \
        -c:v libx264 \
        -preset veryfast \
        -tune zerolatency \
        -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" \
        -pix_fmt yuv420p \
        -c:a aac \
        -b:a 128k \
        -ar 44100 \
        -ac 2 \
        -f hls \
        -hls_time 2 \
        -hls_list_size 10 \
        -hls_flags delete_segments+append_list+omit_endlist \
        -hls_segment_filename public/hls/stream_%03d.ts \
        -start_number 1 \
        -y public/hls/stream.m3u8 \
        -flush_packets 1 \
        -fflags +genpts+discardcorrupt \
        -max_delay 5000000 \
        -reconnect 1 \
        -reconnect_streamed 1 \
        -reconnect_delay_max 5 \
        -loglevel error
    
    return $?
}

# Main loop - restart FFmpeg if it fails
while true; do
    start_ffmpeg
    EXIT_CODE=$?
    
    echo "FFmpeg se detuvo (código: $EXIT_CODE), reiniciando en 10 segundos..."
    sleep 10
done
