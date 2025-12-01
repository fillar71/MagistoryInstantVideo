# Gunakan image Node.js versi 18 (Slim version agar lebih ringan)
FROM node:18-slim

# Install FFmpeg (Wajib untuk rendering video)
# Kita membersihkan cache apt setelah install untuk mengurangi ukuran image
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set working directory di dalam container
WORKDIR /app

# Copy package.json dan package-lock.json terlebih dahulu
# Ini memanfaatkan fitur caching Docker layer agar npm install tidak dijalankan ulang jika tidak ada perubahan dependency
COPY package*.json ./

# Install dependencies project
RUN npm install

# Copy seluruh source code backend ke dalam container
COPY . .

# Build code TypeScript menjadi JavaScript (output ke folder dist/)
RUN npm run build

# Expose port 3001 (Railway akan meng-override ini lewat env variable PORT, tapi ini good practice)
EXPOSE 3001

# Jalankan aplikasi langsung menggunakan node
# CMD ["node", "dist/index.js"] lebih stabil daripada "npm start" untuk menangani sinyal shutdown dari Railway
CMD ["node", "dist/index.js"]
