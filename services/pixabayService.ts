
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY || '53479357-80b3feb16fd61b8af448448fc';
const PIXABAY_API_BASE = 'https://pixabay.com/api/';

type PixabayOrientation = 'horizontal' | 'vertical' | 'all';

interface PixabayImage {
    id: number;
    webformatURL: string;
    largeImageURL: string;
    tags: string;
    user: string;
}

interface PixabayVideo {
    id: number;
    picture_id: string;
    videos: {
        medium: { url: string };
        small: { url: string };
    };
    user: string;
}

async function pixabayFetch(endpoint: string) {
    const response = await fetch(`${PIXABAY_API_BASE}${endpoint}&key=${PIXABAY_API_KEY}`);

    if (!response.ok) {
        throw new Error(`Pixabay API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

// Map 'landscape' | 'portrait' | 'square' to Pixabay 'horizontal' | 'vertical'
function mapOrientation(o: 'landscape' | 'portrait' | 'square'): PixabayOrientation {
    if (o === 'portrait') return 'vertical';
    return 'horizontal'; // Pixabay doesn't support square explicitly in free API, default to horizontal
}

export async function searchPixabayImages(query: string, orientation: 'landscape' | 'portrait' | 'square' = 'landscape'): Promise<any[]> {
    try {
        const pixabayOrientation = mapOrientation(orientation);
        const safeQuery = query.substring(0, 100).trim();
        const data = await pixabayFetch(`?q=${encodeURIComponent(safeQuery)}&image_type=photo&orientation=${pixabayOrientation}&per_page=20`);
        
        return (data.hits || []).map((hit: PixabayImage) => ({
            id: hit.id,
            src: {
                medium: hit.webformatURL,
                large2x: hit.largeImageURL
            },
            alt: hit.tags,
            photographer: hit.user,
            _type: 'photo'
        }));
    } catch (e) {
        console.warn("Pixabay Image Search failed:", e);
        return [];
    }
}

export async function searchPixabayVideos(query: string, orientation: 'landscape' | 'portrait' | 'square' = 'landscape'): Promise<any[]> {
    try {
        const pixabayOrientation = mapOrientation(orientation);
        const safeQuery = query.substring(0, 100).trim();
        // Video API is /videos/
        // Construct URL manually since base is slightly different
        const response = await fetch(`https://pixabay.com/api/videos/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(safeQuery)}&video_type=film&orientation=${pixabayOrientation}&per_page=20`);
        
        if (!response.ok) {
             throw new Error(`Pixabay Video API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();

        return (data.hits || []).map((hit: PixabayVideo) => ({
            id: hit.id,
            image: `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg`, 
            video_files: [
                // Map Pixabay format to Pexels-like format for compatibility
                { quality: 'hd', link: hit.videos.medium.url }, 
                { quality: 'sd', link: hit.videos.small.url }
            ],
            user: {
                name: hit.user
            },
            _type: 'video'
        }));
    } catch (e) {
        console.warn("Pixabay Video Search failed:", e);
        return [];
    }
}

export async function searchPixabayAudio(query: string, type: 'music' | 'sfx' = 'music'): Promise<any[]> {
    try {
        const audioTypeParam = type === 'sfx' ? 'sound_effect' : 'music';
        // Sanitize query: limit length and remove special chars that might break the URL
        const safeQuery = query.substring(0, 100).replace(/[^\w\s,.-]/gi, '').trim(); 
        
        // Sometimes simple 'q' with keyword works best if param isn't strictly enforced.
        const url = `https://pixabay.com/api/audio/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(safeQuery)}&audio_type=${audioTypeParam}&per_page=20`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            // Attempt to read error text
            const errText = await response.text().catch(() => '');
            console.warn(`Pixabay Audio API Error (${response.status}):`, errText);
            // Don't throw here to avoid crashing UI components expecting arrays
            return [];
        }
        
        const data = await response.json();

        return (data.hits || []).map((hit: any) => ({
            id: hit.id,
            name: hit.name || (type === 'sfx' ? "Sound Effect" : "Unknown Track"),
            // Ensure we have a valid URL. Pixabay audio sometimes requires different property access
            url: hit.url || (hit.audio_file ? hit.audio_file.url : ''),
            duration: hit.duration,
            tags: hit.tags,
            artist: hit.user
        })).filter((track: any) => track.url); // Filter out any tracks missing URLs

    } catch (e) {
        console.error("Pixabay Audio Search Exception:", e);
        return [];
    }
}
