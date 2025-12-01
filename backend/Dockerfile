# Gunakan image Node.js yang ringan
FROM node:18-slim

# Install FFmpeg (Wajib untuk rendering video)
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set working directory di dalam container
WORKDIR /app

# Copy package.json dan package-lock.json (jika ada)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy seluruh kode sumber backend
COPY . .

# Build TypeScript code (hasilnya masuk ke folder dist/)
RUN npm run build

# Expose port (biasanya Railway akan meng-override ini dengan variable PORT)
EXPOSE 3001

# Jalankan server
CMD ["npm", "start"]
