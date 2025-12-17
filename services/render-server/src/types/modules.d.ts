
declare module 'ffmpeg-static' {
    const path: string | null;
    export default path;
}

declare module 'ffprobe-static' {
    const path: string;
    export { path };
    const content: { path: string };
    export default content;
}
