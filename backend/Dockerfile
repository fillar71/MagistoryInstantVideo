# Gunakan image Node.js yang ringan
FROM node:18-slim

# Install FFmpeg DAN Font (Wajib untuk drawtext/subtitle)
# fonts-dejavu: font standar
# fontconfig: utility untuk manajemen font agar ffmpeg bisa menemukannya
RUN apt-get update && \
    apt-get install -y ffmpeg fonts-dejavu fontconfig && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

# Jalankan server
CMD ["node", "dist/index.js"]
