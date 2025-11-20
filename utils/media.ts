
import { WordTiming } from "../types";

// Audio decoding helpers from Gemini documentation
export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


export async function playGeneratedAudio(base64Audio: string) {
    try {
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        const outputNode = outputAudioContext.createGain();
        outputNode.connect(outputAudioContext.destination);

        const audioBuffer = await decodeAudioData(
          decode(base64Audio),
          outputAudioContext,
          24000,
          1,
        );
        const source = outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(outputNode);
        source.start();
    } catch(e) {
        console.error("Failed to play audio", e);
        alert("Could not play the generated audio. Please check the console for errors.")
    }
}


export function imageUrlToBase64(url: string): Promise<{ base64: string, mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }
      ctx.drawImage(img, 0, 0);
      
      // picsum.photos returns jpeg
      const mimeType = 'image/jpeg';
      const dataUrl = canvas.toDataURL(mimeType);

      // remove the "data:mimeType;base64," prefix
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mimeType });
    };
    img.onerror = (e) => {
      reject(new Error('Failed to load image. This may be a CORS issue.'));
    };
    img.src = url;
  });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function createWavBlobUrl(base64Audio: string): string {
    const pcmData = decode(base64Audio);
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    
    const buffer = new ArrayBuffer(44 + pcmData.length);
    const view = new DataView(buffer);
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length, true);
    writeString(view, 8, 'WAVE');
    
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.length, true);
    
    for (let i = 0; i < pcmData.length; i++) {
        view.setUint8(44 + i, pcmData[i]);
    }

    const blob = new Blob([view], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
}

export function estimateWordTimings(text: string, totalDuration: number): WordTiming[] {
    const words = text.trim().split(/\s+/);
    if (words.length === 0) return [];

    // Advanced estimation that considers punctuation for better sync
    const getWeight = (word: string) => {
        let weight = word.length;
        // Add weight for punctuation to simulate pauses
        if (/[.,;!?]+$/.test(word)) {
            if (/[.,;]/.test(word)) weight += 3; // Short pause
            if (/[!?]/.test(word) || word.endsWith('.')) weight += 6; // Long pause
        }
        return weight;
    };

    const totalWeight = words.reduce((acc, word) => acc + getWeight(word), 0);
    
    let currentTime = 0;
    const timings: WordTiming[] = [];

    words.forEach(word => {
        const weight = getWeight(word);
        const duration = (weight / totalWeight) * totalDuration;
        
        timings.push({
            word,
            start: currentTime,
            end: currentTime + duration
        });
        
        currentTime += duration;
    });
    
    // Adjust the last word to exactly match duration to avoid drift
    if (timings.length > 0) {
        timings[timings.length - 1].end = totalDuration;
    }

    return timings;
}

export interface SubtitleChunk {
    timings: WordTiming[];
    start: number;
    end: number;
}

export function generateSubtitleChunks(
    timings: WordTiming[], 
    fontSize: number, 
    maxLines: number,
    containerWidthApprox: number = 800 
): SubtitleChunk[] {
    // Heuristic: average char width ~0.6 of font size
    const avgCharWidth = fontSize * 0.6;
    const maxCharsPerLine = containerWidthApprox / avgCharWidth;
    const maxCharsPerChunk = maxCharsPerLine * maxLines;
    
    const chunks: SubtitleChunk[] = [];
    let currentChunk: WordTiming[] = [];
    let currentLength = 0;

    timings.forEach((t, index) => {
        if (currentLength + t.word.length > maxCharsPerChunk && currentChunk.length > 0) {
            chunks.push({
                timings: currentChunk,
                start: currentChunk[0].start,
                end: currentChunk[currentChunk.length - 1].end 
            });
            currentChunk = [];
            currentLength = 0;
        }
        
        currentChunk.push(t);
        currentLength += t.word.length + 1; // +1 for space assumption
    });

    if (currentChunk.length > 0) {
        chunks.push({
            timings: currentChunk,
            start: currentChunk[0].start,
            end: currentChunk[currentChunk.length - 1].end
        });
    }
    
    // Extend chunk visibility to close gaps for smoother visual
    for(let i=0; i<chunks.length-1; i++) {
        // If gap is small (< 1.5s), extend current chunk end to next start
        if (chunks[i+1].start - chunks[i].end < 1.5) {
             chunks[i].end = chunks[i+1].start;
        }
    }
    
    // Extend last chunk slightly
    if (chunks.length > 0) {
        const lastChunk = chunks[chunks.length - 1];
        if (lastChunk.timings.length > 0) {
             // Ensure it stays visible for the full duration of the last word
             lastChunk.end = lastChunk.timings[lastChunk.timings.length - 1].end; 
        }
    }

    return chunks;
}