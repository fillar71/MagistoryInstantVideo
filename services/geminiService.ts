
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { VideoScript, Segment, TransitionEffect, AudioClip } from '../types';
import { searchPixabayImages, searchPixabayVideos, searchPixabayAudio } from "./pixabayService";

// Helper to clean JSON string from Markdown code blocks often returned by LLMs
function cleanJsonText(text: string): string {
  if (!text) return "";
  // Remove ```json at start and ``` at end, and trim whitespace
  return text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
}

if (!process.env.API_KEY) {
    console.warn("API_KEY environment variable not found. Please check your .env or Vercel settings.");
}

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateVideoScript(topic: string, requestedDuration: string, aspectRatio: 'landscape' | 'portrait' = 'landscape'): Promise<VideoScript> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Create a video script about "${topic}". The total duration of the video MUST be approximately "${requestedDuration}".
        
        CRITICAL INSTRUCTION FOR SEGMENTATION:
        1. **1 Visual Keyword = 1 Segment**: You MUST create a separate segment for EVERY distinct visual subject.
        2. **Split Narration Exactly**: Break the narration text so it aligns perfectly with the visual.
        3. **Visual Search Phrase**: The 'search_keywords_for_media' must be strictly **2 words** (Subject + Context).
           - INVALID: "happiness" (too short), "business team meeting office" (too long), "a cat" (filler words).
           - VALID: "business meeting", "running dog", "storm clouds", "cooking steak", "office working".
        4. **No Generic Segments**: Every segment must have a specific visual focus matching the narration.
        5. **Music Theme**: Suggest "background_music_keywords" (3-5 words) that describe the perfect background track. Include Genre, Mood, and Tempo. Use Pixabay-friendly terms.
           - Examples: "Cinematic Ambient Piano", "Upbeat Corporate Pop", "Epic Orchestral Heroic", "Lo-fi Hip Hop Chill".
        6. **Sound Effects**: For segments that depict specific actions or environments, provide "sfx_keywords".
           - Examples: "ocean waves", "camera shutter", "city traffic", "keyboard typing", "whoosh".
           - Leave empty if no specific sound effect is needed.
        
        The goal is a fast-paced, visually accurate video where the image changes exactly when the subject in the narration changes.`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    title: { 
                        type: Type.STRING,
                        description: "A catchy title for the video."
                    },
                    background_music_keywords: {
                        type: Type.STRING,
                        description: "Keywords to search for background music (Genre + Mood + Instruments)."
                    },
                    segments: {
                        type: Type.ARRAY,
                        description: "An array of video segments. Strictly one segment per visual concept.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                narration_text: { 
                                    type: Type.STRING,
                                    description: "The narration text specific to this visual segment."
                                },
                                search_keywords_for_media: { 
                                    type: Type.STRING,
                                    description: "A strictly 2-word search phrase (Subject + Context) for finding stock footage."
                                },
                                duration: {
                                    type: Type.INTEGER,
                                    description: "Duration of this segment in seconds (keep it short, 2-5s)."
                                },
                                sfx_keywords: {
                                    type: Type.STRING,
                                    description: "Keywords for a relevant sound effect (e.g. 'whoosh', 'applause'). Optional."
                                }
                            },
                            required: ["narration_text", "search_keywords_for_media", "duration"]
                        }
                    }
                },
                required: ["title", "segments", "background_music_keywords"]
            }
        }
    });

    const rawText = response.text;
    if (!rawText) {
        throw new Error("Received empty response from AI. Please try again.");
    }

    // Clean text before parsing to handle potential Markdown formatting
    const cleanedText = cleanJsonText(rawText);
    
    let parsedResponse: { 
        title: string; 
        background_music_keywords: string; 
        segments: (Omit<Segment, 'id' | 'media' | 'mediaType' | 'mediaUrl'> & { sfx_keywords?: string })[] 
    };

    try {
        parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
        console.error("JSON Parse Error:", parseError, "Raw Text:", cleanedText);
        throw new Error("Failed to parse AI response. The model generated invalid JSON.");
    }

    // Fetch initial media for all segments from Pixabay
    const segmentsWithMediaPromises = parsedResponse.segments.map(async (segment, index) => {
        // Use the full descriptive phrase for better search results
        const keyword = segment.search_keywords_for_media.trim();
        
        // Fallback placeholder
        let mediaUrl = `https://picsum.photos/seed/${encodeURIComponent(keyword.split(' ')[0])}/1280/720`;
        let mediaType: 'image' | 'video' = 'image';
        
        try {
            // Try fetching video first to prioritize dynamic content
            // Pass the aspect ratio here
            const videoResults = await searchPixabayVideos(keyword, aspectRatio);
            if (videoResults && videoResults.length > 0) {
                const video = videoResults[0];
                // Try to find HD quality, fallback to first available
                const bestVideoFile = video.video_files.find((f: any) => f.quality === 'hd') || video.video_files[0];
                if (bestVideoFile) {
                    mediaUrl = bestVideoFile.link;
                    mediaType = 'video';
                }
            }

            // If no video found, fallback to photo
            if (mediaType !== 'video') {
                const photoResults = await searchPixabayImages(keyword, aspectRatio);
                if (photoResults && photoResults.length > 0) {
                    mediaUrl = photoResults[0].src.large2x;
                    mediaType = 'image';
                }
            }
        } catch (e) {
            console.warn("Failed to fetch initial media from Pixabay, using placeholder.", e)
        }
        
        const transitions: TransitionEffect[] = ['fade', 'slide', 'zoom'];
        const randomTransition = transitions[Math.floor(Math.random() * transitions.length)];

        return {
            ...segment,
            id: `segment-${Date.now()}-${index}`,
            media: [{
                id: `clip-${Date.now()}-${index}-0`,
                url: mediaUrl,
                type: mediaType
            }],
            audioVolume: 1.0, // Default volume
            transition: randomTransition,
            textOverlayStyle: {
                fontFamily: 'Arial, sans-serif',
                fontSize: 40,
                color: '#EAB308', // Default gold-ish for highlight
                position: 'bottom' as const,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                animation: 'scale' as const,
                maxCaptionLines: 2,
            },
            duration: segment.duration || 3 // Fallback duration if missing
        };
    });

    const segmentsWithMedia = await Promise.all(segmentsWithMediaPromises);

    // --- Auto-Generate Global Audio Tracks (Music & SFX) ---
    const audioTracks: AudioClip[] = [];
    
    // 1. Background Music
    try {
        if (parsedResponse.background_music_keywords) {
            const musicResults = await searchPixabayAudio(parsedResponse.background_music_keywords, 'music');
            if (musicResults && musicResults.length > 0) {
                const bestTrack = musicResults[0];
                // Calculate total duration to set music duration initially
                const totalVideoDuration = segmentsWithMedia.reduce((acc, seg) => acc + seg.duration, 0);
                
                audioTracks.push({
                    id: `audio-bg-${Date.now()}`,
                    url: bestTrack.url,
                    name: bestTrack.name || "Background Music",
                    type: 'music',
                    startTime: 0,
                    duration: totalVideoDuration, // Match video length
                    volume: 0.2 // Low volume for background
                });
            }
        }
    } catch (e) {
        console.warn("Failed to auto-generate background music:", e);
    }

    // 2. Sound Effects
    try {
        let currentTimelineOffset = 0;
        // Fetch SFX for segments sequentially to avoid rate limiting or just map concurrently
        // We iterate through original parsed segments which match segmentsWithMedia indices
        const sfxPromises = parsedResponse.segments.map(async (seg, index) => {
            const start = currentTimelineOffset;
            currentTimelineOffset += seg.duration;

            if (seg.sfx_keywords) {
                 try {
                     const sfxResults = await searchPixabayAudio(seg.sfx_keywords, 'sfx');
                     if (sfxResults && sfxResults.length > 0) {
                         const bestSfx = sfxResults[0];
                         return {
                             id: `audio-sfx-${Date.now()}-${index}`,
                             url: bestSfx.url,
                             name: bestSfx.name || seg.sfx_keywords || "SFX",
                             type: 'sfx' as const,
                             startTime: start,
                             duration: bestSfx.duration > 5 ? 5 : bestSfx.duration, // Cap max SFX duration
                             volume: 0.8
                         };
                     }
                 } catch (err) {
                     console.warn(`Failed to fetch SFX for segment ${index}:`, err);
                 }
            }
            return null;
        });

        const sfxTracks = (await Promise.all(sfxPromises)).filter(t => t !== null) as AudioClip[];
        audioTracks.push(...sfxTracks);

    } catch (e) {
        console.warn("Failed to auto-generate sound effects:", e);
    }

    const processedScript: VideoScript = {
        title: parsedResponse.title,
        backgroundMusicKeywords: parsedResponse.background_music_keywords,
        segments: segmentsWithMedia,
        audioTracks: audioTracks
    };

    return processedScript;
  } catch (error: any) {
    console.error('Error calling Gemini API:', error);
    // Propagate the specific error message
    throw new Error(error.message || 'Failed to fetch video script from Gemini API.');
  }
}

export async function suggestMediaKeywords(narrationText: string, videoContext?: string): Promise<string> {
  const ai = getAI();
  const contextPrompt = videoContext ? `The overall video topic is: "${videoContext}".` : "";
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Based on the following narration text for a video segment, suggest 5 to 7 visually descriptive search phrases for stock footage (Pixabay). 
      ${contextPrompt}
      
      Rules:
      1. Each phrase should be strictly **2 words** (Subject + Context).
      2. Ensure the visual style aligns with the overall video topic.
      3. Focus on visible elements.
      4. Avoid abstract words like "concept" or "success".
      5. Provide ONLY a comma-separated list.
      
      Narration: "${narrationText}"`,
      config: {
        temperature: 0.7,
      }
    });
    return response.text.trim().replace(/"/g, '');
  } catch (error) {
    console.error('Error calling Gemini API for keyword suggestion:', error);
    // Don't throw here, just return empty so UI doesn't break
    return "";
  }
}

export async function generateImageFromPrompt(prompt: string): Promise<string> {
    const ai = getAI();
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/jpeg',
              aspectRatio: '16:9',
            },
        });
        if (!response.generatedImages || response.generatedImages.length === 0) {
            throw new Error('No image was generated by the model.');
        }
        const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    } catch (error) {
        console.error('Error generating image:', error);
        throw new Error('Failed to generate image from prompt.');
    }
}

export async function editImageFromPrompt(base64ImageData: string, mimeType: string, prompt: string): Promise<string> {
    const ai = getAI();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    {
                        inlineData: { data: base64ImageData, mimeType: mimeType },
                    },
                    { text: prompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });
        
        const firstCandidate = response.candidates?.[0];
        if (firstCandidate?.content?.parts) {
            for (const part of firstCandidate.content.parts) {
                if (part.inlineData) {
                    const base64ImageBytes: string = part.inlineData.data;
                    const imageMimeType = part.inlineData.mimeType;
                    return `data:${imageMimeType};base64,${base64ImageBytes}`;
                }
            }
        }
        throw new Error('No image was generated by the model.');
    } catch (error) {
        console.error('Error editing image:', error);
        throw new Error('Failed to edit image from prompt.');
    }
}

export async function generateVideoFromPrompt(prompt: string, aspectRatio: '16:9' | '9:16') {
    const ai = getAI();
    try {
        const operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio,
            }
        });
        return operation;
    } catch (error) {
        console.error('Error generating video:', error);
        throw error;
    }
}

export async function getVideosOperation(operation: { operation: any }) {
    const ai = getAI();
    return await ai.operations.getVideosOperation(operation);
}

export async function generateSpeechFromText(text: string): Promise<string> {
    const ai = getAI();
    let lastError: any;
    
    // Retry logic for resilience (e.g., against 500/RPC errors)
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                // Simply passing the text is often more robust for the TTS model than wrapping it in an instruction
                contents: [{ parts: [{ text: text }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: 'Kore' },
                        },
                    },
                },
            });
            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!base64Audio) {
                throw new Error("No audio data returned from API.");
            }
            return base64Audio;
        } catch (error) {
            console.warn(`TTS Attempt ${attempt + 1} failed:`, error);
            lastError = error;
            // Exponential backoff: wait 1s, 2s, etc.
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
    
    console.error('Final error generating speech:', lastError);
    throw new Error('Failed to generate speech from text. Please try again later.');
}
