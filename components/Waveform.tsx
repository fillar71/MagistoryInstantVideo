
import React, { useRef, useEffect } from 'react';

interface WaveformProps {
    width: number;
    height: number;
    color: string;
    seedId: string; // Used to generate deterministic patterns
    type?: 'narration' | 'music' | 'sfx';
}

const Waveform: React.FC<WaveformProps> = ({ width, height, color, seedId, type = 'music' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Handle high DPI displays for crisp lines
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = color;

        // Simple seeded random function to make the waveform consistent for the same clip ID
        // Linear Congruential Generator
        let seed = 0;
        for (let i = 0; i < seedId.length; i++) {
            seed = (seed << 5) - seed + seedId.charCodeAt(i);
            seed |= 0;
        }
        const random = () => {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };

        const barWidth = 3;
        const gap = 1;
        const totalBars = Math.ceil(width / (barWidth + gap));
        const center = height / 2;

        for (let i = 0; i < totalBars; i++) {
            const noise = random(); 
            let barHeightFactor = 0;

            if (type === 'narration') {
                // Speech looks like bursts with pauses
                // Introduce gaps (silence)
                if (noise < 0.3) {
                    barHeightFactor = 0.05; // Silence/Noise floor
                } else {
                    // Spiky bursts
                    barHeightFactor = (noise * 0.8) + 0.2; 
                }
                
                // Grouping effect for words (slow sine modulation)
                const sentenceStructure = Math.sin(i * 0.2) * 0.5 + 0.5;
                if (sentenceStructure < 0.2) barHeightFactor *= 0.2;

            } else if (type === 'sfx') {
                // SFX usually has an attack and decay or is a singular blob
                // Use a different envelope based on position in clip (approx via i/totalBars)
                const progress = i / totalBars;
                // Randomized burstiness
                barHeightFactor = noise;
                
                // Envelope shaping (Attack-Decay ish) - erratic
                if (progress < 0.1) barHeightFactor *= (progress * 10);
                if (progress > 0.8) barHeightFactor *= ((1 - progress) * 5);
                
            } else {
                // Music: Structured, continuous, rhythmic
                const beat = Math.sin(i * 0.5) * 0.5 + 0.5; // High freq beat
                const flow = Math.sin(i * 0.05) * 0.5 + 0.5; // Low freq swell
                
                barHeightFactor = (noise * 0.4) + (beat * 0.3) + (flow * 0.3);
            }

            // Global constraints
            const h = Math.max(2, barHeightFactor * height * 0.8); 
            
            const x = i * (barWidth + gap);
            const y = center - (h / 2);

            // Draw rounded bar using path for compatibility
            ctx.beginPath();
            const radius = 2;
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + barWidth - radius, y);
            ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
            ctx.lineTo(x + barWidth, y + h - radius);
            ctx.quadraticCurveTo(x + barWidth, y + h, x + barWidth - radius, y + h);
            ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fill();
        }

    }, [width, height, color, seedId, type]);

    return (
        <canvas 
            ref={canvasRef} 
            className="w-full h-full pointer-events-none"
        />
    );
};

export default React.memo(Waveform);
