
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { VideoScript, Segment, TransitionEffect } from '../types';
import { searchPexelsPhotos, searchPexelsVideos } from "./pexelsService";

if (!process.env.API_KEY) {
    console.warn("API_KEY environment variable not found. Using a placeholder.");
}

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateVideoScript(topic: string, requestedDuration: string): Promise<VideoScript> {
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
                                }
                            },
                            required: ["narration_text", "search_keywords_for_media", "duration"]
                        }
                    }
                },
                required: ["title", "segments"]
            }
        }
    });

    const parsedResponse: { title: string; segments: Omit<Segment, 'id' | 'media' | 'mediaType' | 'mediaUrl'>[] } = JSON.parse(response.text);

    // Fetch initial media for all segments from Pexels
    const segmentsWithMediaPromises = parsedResponse.segments.map(async (segment, index) => {
        // Use the full descriptive phrase for better search results
        const keyword = segment.search_keywords_for_media.trim();
        
        // Fallback placeholder
        let mediaUrl = `https://picsum.photos/seed/${encodeURIComponent(keyword.split(' ')[0])}/1280/720`;
        let mediaType: 'image' | 'video' = 'image';
        
        try {
            // Try fetching video first to prioritize dynamic content
            const videoResults = await searchPexelsVideos(keyword);
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
                const photoResults = await searchPexelsPhotos(keyword);
                if (photoResults && photoResults.length > 0) {
                    mediaUrl = photoResults[0].src.large2x;
                    mediaType = 'image';
                }
            }
        } catch (e) {
            console.warn("Failed to fetch initial media from Pexels, using placeholder.", e)
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

    const processedScript: VideoScript = {
        ...parsedResponse,
        segments: segmentsWithMedia,
    };

    return processedScript;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw new Error('Failed to fetch video script from Gemini API.');
  }
}

export async function suggestMediaKeywords(narrationText: string, videoContext?: string): Promise<string> {
  const ai = getAI();
  const contextPrompt = videoContext ? `The overall video topic is: "${videoContext}".` : "";
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Based on the following narration text for a video segment, suggest 5 to 7 visually descriptive search phrases for stock footage (Pexels). 
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
    throw new Error('Failed to suggest media keywords from Gemini API.');
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
