
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { VideoScript, Segment, TransitionEffect, AudioClip } from '../types';
import { searchPixabayAudio } from "./pixabayService";
import { searchPexelsPhotos, searchPexelsVideos } from "./pexelsService";

// Helper to clean JSON string from Markdown code blocks often returned by LLMs
function cleanJsonText(text: string): string {
  if (!text) return "";
  // Remove ```json at start and ``` at end, and trim whitespace
  return text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
}

const getAI = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API Key is missing. Please add 'API_KEY' to your .env file (local) or Vercel Environment Variables.");
    }
    return new GoogleGenAI({ apiKey });
};

// ... existing generateVideoScript function ...
export async function generateVideoScript(topic: string, requestedDuration: string, aspectRatio: 'landscape' | 'portrait' = 'landscape', visualStyle: 'video' | 'image' = 'video'): Promise<VideoScript> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Act as a professional Video Editor and Stock Footage Researcher. Create a video script about "${topic}". The total duration MUST be approximately "${requestedDuration}".
        
        CRITICAL INSTRUCTIONS FOR MEDIA SELECTION (Relevance is Key):
        1. **1 Visual Keyword = 1 Segment**: Create a separate segment for every distinct visual change.
        2. **Visual Search Phrase (MOST IMPORTANT)**: The 'search_keywords_for_media' MUST be a specific search query optimized for Pexels/Shutterstock.
           - **RULE**: Use the formula "Subject + Action + Setting + Style".
           - **FORBIDDEN**: Abstract nouns (e.g., "Success", "History", "Knowledge", "Freedom", "Chaos"). Stock engines cannot understand these.
           - **REQUIRED**: Concrete, visible physical objects or people.
           - **Example (Bad)**: "Ancient history" -> **Example (Good)**: "Ancient roman colosseum drone shot sunny".
           - **Example (Bad)**: "Business growth" -> **Example (Good)**: "Business people shaking hands modern office".
           - **Example (Bad)**: "Thinking" -> **Example (Good)**: "Close up eye looking at computer screen reflection".
           - If the narration mentions a specific object (e.g., "Pizza"), the media MUST be that object ("Pepperoni pizza slice cheese pull").
        3. **Split Narration**: Break text so it aligns perfectly with the visual change.
        4. **Music Theme**: Suggest "background_music_keywords" (Genre + Mood + Instrument).
        5. **Sound Effects**: Provide specific "sfx_keywords" for actions (e.g. 'camera shutter', 'pouring water').
        
        Generate a fast-paced, visually accurate script.`,
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
                                    description: "A highly specific 3-5 word search phrase. Must be a visual description of a scene."
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

    // Fetch initial media for all segments from Pexels (Updated from Pixabay)
    const segmentsWithMediaPromises = parsedResponse.segments.map(async (segment, index) => {
        // Use the full descriptive phrase for better search results
        const keyword = segment.search_keywords_for_media.trim();
        
        // Fallback placeholder
        let mediaUrl = `https://picsum.photos/seed/${encodeURIComponent(keyword.split(' ')[0])}/640/360`; // Default SD
        let mediaType: 'image' | 'video' = 'image';
        
        try {
            if (visualStyle === 'video') {
                // PRIORITIZE VIDEO
                const videoResults = await searchPexelsVideos(keyword, aspectRatio);
                if (videoResults && videoResults.length > 0) {
                    const video = videoResults[0];
                    const bestVideoFile = video.video_files.find((f: any) => f.quality === 'sd') || 
                                          video.video_files.find((f: any) => f.quality === 'tiny') || 
                                          video.video_files[0];
                    if (bestVideoFile) {
                        mediaUrl = bestVideoFile.link;
                        mediaType = 'video';
                    }
                }
                
                // If video failed (or strictly not found), fallback to photo
                if (mediaType !== 'video') {
                    const photoResults = await searchPexelsPhotos(keyword, aspectRatio);
                    if (photoResults && photoResults.length > 0) {
                        mediaUrl = photoResults[0].src.medium;
                        mediaType = 'image';
                    }
                }
            } else {
                // PRIORITIZE IMAGE
                const photoResults = await searchPexelsPhotos(keyword, aspectRatio);
                if (photoResults && photoResults.length > 0) {
                    mediaUrl = photoResults[0].src.medium;
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

    // --- Auto-Generate Global Audio Tracks (Music & SFX) ---
    const audioTracks: AudioClip[] = [];
    
    // 1. Background Music (Pixabay is still used for Audio)
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

    // 2. Sound Effects (Pixabay)
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

// NEW FUNCTION: Audio to Video Visual Generation with Retry Logic
export async function generateVisualsFromAudio(base64Audio: string, mimeType: string): Promise<{ segments: any[], title: string }> {
    const ai = getAI();
    let lastError: any;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Audio
                        }
                    },
                    {
                        text: `Analyze this audio. I want to create a video background for it using stock footage.
                        
                        Instructions:
                        1. Identify the mood, tempo, and topic (if spoken) or vibe (if music).
                        2. Break the audio into DISTINCT visual segments based on beat changes, topic shifts, or natural pauses.
                        3. For each segment, provide:
                           - 'duration': The duration of this visual clip in seconds.
                           - 'search_keywords_for_media': Specific Pexels search terms (Subject + Action + Setting).
                           - 'narration_text': If there is speech in this segment, transcribe it. If music only, describe the visual mood (e.g. "Slow motion waves").
                        
                        The sum of all durations must match the total audio length roughly.
                        Generate a JSON response.`
                    }
                ],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING, description: "Suggested title for the video" },
                            segments: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        duration: { type: Type.NUMBER },
                                        search_keywords_for_media: { type: Type.STRING },
                                        narration_text: { type: Type.STRING }
                                    },
                                    required: ["duration", "search_keywords_for_media"]
                                }
                            }
                        },
                        required: ["title", "segments"]
                    }
                }
            });

            const rawText = response.text;
            if (!rawText) throw new Error("Empty response from Gemini.");
            const cleanedText = cleanJsonText(rawText);
            
            return JSON.parse(cleanedText);

        } catch (error: any) {
            console.warn(`Audio analysis attempt ${attempt} failed:`, error);
            lastError = error;

            // Check for 503 (Unavailable/Overloaded) or other transient errors
            const isOverloaded = 
                error.status === 503 || 
                error.code === 503 || 
                (error.message && (error.message.includes('overloaded') || error.message.includes('503')));

            if (isOverloaded && attempt < maxRetries) {
                // Exponential backoff: 2s, 4s, 8s
                const delayMs = Math.pow(2, attempt) * 1000;
                console.log(`Model overloaded. Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }
            
            break; // Stop retrying if not overloaded or max retries reached
        }
    }

    // Final Error Handling
    console.error("Gemini Audio Analysis Final Error:", lastError);
    
    let userMessage = lastError.message || "Failed to analyze audio.";
    
    // Clean up JSON error messages if present
    try {
        if (typeof userMessage === 'string' && userMessage.trim().startsWith('{')) {
            const parsed = JSON.parse(userMessage);
            if (parsed.error && parsed.error.message) {
                userMessage = parsed.error.message;
            }
        }
    } catch (e) { /* ignore */ }

    if (userMessage.includes('overloaded') || userMessage.includes('503')) {
        throw new Error("The AI model is currently overloaded with high traffic. Please wait a moment and try again.");
    }

    throw new Error(userMessage);
}

// ... existing helper functions (suggestMediaKeywords, etc) ...
export async function suggestMediaKeywords(narrationText: string, videoContext?: string): Promise<string> {
  const ai = getAI();
  const contextPrompt = videoContext ? `The overall video topic is: "${videoContext}".` : "";
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a Stock Footage Search Query Expert.
      
      Task: Convert the following narration text into highly effective search queries for Pexels/Pixabay/Shutterstock.
      ${contextPrompt}
      Narration: "${narrationText}"
      
      Instructions:
      1. IGNORE abstract concepts (e.g., "journey", "success", "future").
      2. EXTRACT concrete, visual subjects and actions that literally appear on screen.
      3. Use "Subject + Action + Context" format.
      4. Format output as a comma-separated list of 3 DISTINCT search phrases.
      
      Examples:
      - Narration: "Our company is reaching new heights." -> Output: Hiker on mountain top, Modern skyscraper looking up, Business team high five
      - Narration: "The mind is a complex web of thoughts." -> Output: Neural network animation, Glowing fiber optics, Abstract brain lights
      - Narration: "He cooked a delicious meal." -> Output: Chef cooking steak, Sizzling pan close up, Family eating dinner
      
      Output ONLY the comma-separated list. No explanations.
      `,
      config: {
        temperature: 0.5,
      }
    });
    return response.text.trim().replace(/"/g, '');
  } catch (error) {
    console.error('Error calling Gemini API for keyword suggestion:', error);
    return "";
  }
}

export async function generateSFXKeywords(prompt: string): Promise<string> {
    const ai = getAI();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `The user wants a sound effect matching this description: "${prompt}".
            Convert this description into a comma-separated list of 3 precise, short search keywords suitable for a sound effects library like Pixabay.
            
            Example Input: "A spooky ghost in a hallway"
            Example Output: ghost, eerie wind, creaking floor
            
            Return ONLY the comma-separated list.`,
            config: {
                temperature: 0.5,
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating SFX keywords:", error);
        return prompt; // Fallback to original prompt
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
    
    // Retry count reduced to 3. Removed aggressive backoff to improve perceived speed.
    // If it fails 3 times with ~5s total wait, it's better to fail than hang the UI for 1 min.
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
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
        } catch (error: any) {
            console.warn(`TTS Attempt ${attempt + 1} failed:`, error);
            lastError = error;
            
            // Fail fast on fatal errors (Bad Request, Unauthorized, Forbidden)
            if (error.status === 400 || error.status === 401 || error.status === 403) {
                 throw error;
            }
            
            // Reduced backoff: 1s, 2s, 3s
            const delay = (attempt + 1) * 1000;
            if (attempt < 2) await new Promise(r => setTimeout(r, delay));
        }
    }
    
    console.error('Final error generating speech:', lastError);
    throw new Error(lastError.message || 'Failed to generate speech. Please check your text.');
}
