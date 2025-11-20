
// This is a placeholder for your actual Pexels API key.
// In a real application, this should be stored securely and not hardcoded.
// For this environment, it's expected to be in process.env.
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'np1dGKKGGlLeT7JjklA5l8mspt3LhwLGtHXEBgnskJKfVFnNVXuAODDu';

const PEXELS_API_BASE = 'https://api.pexels.com';

type PexelsOrientation = 'landscape' | 'portrait' | 'square';

interface PexelsPhoto {
    id: number;
    src: {
        large2x: string;
        medium: string;
    };
    alt: string;
    photographer: string;
}

interface PexelsVideo {
    id: number;
    image: string; // poster image
    video_files: {
        quality: string;
        link: string;
    }[];
    user: {
        name: string;
    }
}

async function pexelsFetch(endpoint: string) {
    if (PEXELS_API_KEY === 'YOUR_PEXELS_API_KEY_HERE') {
        console.error("Pexels API Key is not configured. Please set `process.env.PEXELS_API_KEY`.");
        // Return a mock error response or an empty array to prevent app crash
        return Promise.reject("Pexels API key not found. Please add it to your environment variables.");
    }

    const response = await fetch(`${PEXELS_API_BASE}${endpoint}`, {
        headers: {
            Authorization: PEXELS_API_KEY
        }
    });

    if (!response.ok) {
        throw new Error(`Pexels API request failed: ${response.statusText}`);
    }

    return response.json();
}


export async function searchPexelsPhotos(query: string, orientation: PexelsOrientation = 'landscape'): Promise<PexelsPhoto[]> {
    const data = await pexelsFetch(`/v1/search?query=${encodeURIComponent(query)}&per_page=20&orientation=${orientation}`);
    return data.photos || [];
}

export async function searchPexelsVideos(query: string, orientation: PexelsOrientation = 'landscape'): Promise<PexelsVideo[]> {
    const data = await pexelsFetch(`/videos/search?query=${encodeURIComponent(query)}&per_page=20&orientation=${orientation}`);
    return data.videos || [];
}
