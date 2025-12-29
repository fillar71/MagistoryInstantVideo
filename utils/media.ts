
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
  ctx: any, // AudioContext
  sampleRate: number,
  numChannels: number,
): Promise<any> { // Promise<AudioBuffer>
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
        const outputAudioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
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
        (window as any).alert("Could not play the generated audio. Please check the console for errors.")
    }
}

export function getAudioDuration(url: string): Promise<number> {
    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onloadedmetadata = () => {
            resolve(audio.duration);
        };
        audio.onerror = () => {
            resolve(0);
        };
    });
}


export function imageUrlToBase64(url: string): Promise<{ base64: string, mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = (window as any).document.createElement('canvas');
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

export function audioBufferToWav(buffer: any): ArrayBuffer { // buffer: AudioBuffer
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    let result;
    if (numChannels === 2) {
        result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
        result = buffer.getChannelData(0);
    }

    return encodeWAV(result, numChannels, sampleRate, bitDepth);
}

function interleave(inputL: Float32Array, inputR: Float32Array) {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);

    let index = 0;
    let inputIndex = 0;

    while (index < length) {
        result[index++] = inputL[inputIndex];
        result[index++] = inputR[inputIndex];
        inputIndex++;
    }
    return result;
}

function encodeWAV(samples: Float32Array, numChannels: number, sampleRate: number, bitDepth: number) {
    const byteRate = sampleRate * numChannels * bitDepth / 8;
    const blockAlign = numChannels * bitDepth / 8;
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + samples.length * 2, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, numChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, byteRate, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, blockAlign, true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, samples.length * 2, true);

    floatTo16BitPCM(view, 44, samples);

    return buffer;
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

export function estimateWordTimings(text: string, totalDuration: number): WordTiming[] {
    const words = text.trim().split(/\s+/);
    if (words.length === 0) return [];

    // Advanced estimation that considers punctuation and natural speech rhythm
    const getWeight = (word: string) => {
        // Remove punctuation to count actual characters spoken
        const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
        // Base weight: Every word takes at least some time (prevent micro-flashing)
        let weight = 1.5 + (cleanWord.length * 0.8);
        
        // Add specific weights for punctuation pauses
        if (word.includes(',')) weight += 3; // Comma pause
        if (word.includes('.') || word.includes('?') || word.includes('!')) weight += 5; // Sentence end pause
        if (word.includes(':') || word.includes(';')) weight += 4;
        
        return weight;
    };

    const totalWeight = words.reduce((acc, word) => acc + getWeight(word), 0);
    
    let currentTime = 0;
    const timings: WordTiming[] = [];

    words.forEach(word => {
        const weight = getWeight(word);
        // Distribute totalDuration proportionally based on weight
        const duration = (weight / totalWeight) * totalDuration;
        
        timings.push({
            word,
            start: currentTime,
            end: currentTime + duration
        });
        
        currentTime += duration;
    });
    
    // Strict clamp: Ensure the last word ends EXACTLY at totalDuration to prevent drift/clipping
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
        // If gap is small (< 1.0s), extend current chunk end to next start
        if (chunks[i+1].start - chunks[i].end < 1.0) {
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
