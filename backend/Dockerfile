# Gunakan image Node.js yang ringan
FROM node:18-slim

# Install FFmpeg DAN Font (Wajib untuk drawtext/subtitle)
# fonts-dejavu dibutuhkan agar filter drawtext FFmpeg tidak crash
RUN apt-get update && \
    apt-get install -y ffmpeg fonts-dejavu && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files untuk install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code backend
COPY . .

# Build TypeScript code
RUN npm run build

# Expose port (Railway akan override, tapi 3001 default)
EXPOSE 3001

# Jalankan server
CMD ["node", "dist/index.js"]
