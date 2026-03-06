#!/bin/bash

echo "========================================="
echo "INICIANDO SERVICIO DE STREAMING v2.0"
echo "========================================="

# Create HLS directory
mkdir -p public/hls

# Function to handle cleanup on exit
cleanup() {
    echo "Deteniendo FFmpeg..."
    pkill -f "ffmpeg.*stream.m3u8" 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Function to check if stream is working
check_stream() {
    if [ -f "public/hls/stream.m3u8" ]; then
        local segments=$(ls -1 public/hls/stream*.ts 2>/dev/null | wc -l)
        if [ "$segments" -gt 0 ]; then
            return 0
        fi
    fi
    return 1
}

# Wait for network to be ready
echo "Esperando conexión de red..."
sleep 2

# Kill any existing ffmpeg processes
pkill -f "ffmpeg.*stream.m3u8" 2>/dev/null
sleep 1

# Clean old HLS files
rm -f public/hls/stream*.ts public/hls/stream*.m3u8 2>/dev/null

echo "Iniciando FFmpeg con configuración optimizada..."

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
    2>&1 | while read line; do
        echo "[FFmpeg] $line"
        
        # Check for errors
        if echo "$line" | grep -q "Connection refused\|Failed\|Error"; then
            echo "[ERROR] Problema de conexión detectado, esperando..."
            sleep 5
        fi
    done

# If FFmpeg exits, wait and restart
echo "FFmpeg se detuvo, reiniciando en 5 segundos..."
sleep 5

# Restart the stream
exec "$0" "$@"
