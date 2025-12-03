
import React from 'react';
import { MagicWandIcon, MediaIcon, MusicIcon, EffectsIcon, ExportIcon, LargePlayIcon } from './icons';

interface LandingPageProps {
    onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
    return (
        <div className="flex flex-col min-h-full">
            {/* HERO SECTION */}
            <section className="relative pt-20 pb-32 overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full z-0 pointer-events-none">
                    <div className="absolute top-20 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] animate-pulse"></div>
                    <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]"></div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
                    <div className="inline-block mb-6 px-4 py-1.5 rounded-full bg-gray-800 border border-gray-700 animate-fade-in-up">
                        <span className="text-sm font-medium text-purple-400">✨ AI-Powered Video Creation</span>
                    </div>
                    
                    <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                        Turn Ideas into <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                            Magic Videos
                        </span>
                    </h1>
                    
                    <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-400 mb-10 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                        Transform simple text prompts into fully edited videos with AI narration, 
                        smart stock footage matching, and professional subtitles in seconds.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                        <button 
                            onClick={onGetStarted}
                            className="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white text-lg font-bold rounded-full transition-all transform hover:scale-105 shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2"
                        >
                            <MagicWandIcon className="w-6 h-6" />
                            Create Video Now
                        </button>
                        <button className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-white text-lg font-bold rounded-full border border-gray-700 transition-all flex items-center justify-center gap-2">
                            <LargePlayIcon className="w-6 h-6" />
                            Watch Demo
                        </button>
                    </div>

                    {/* Dashboard Preview Mockup */}
                    <div className="mt-20 relative animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
                        <div className="rounded-xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden max-w-5xl mx-auto transform rotate-1 hover:rotate-0 transition-transform duration-700">
                            <div className="h-8 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            </div>
                            <div className="aspect-[16/9] bg-gray-800 relative group">
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="inline-flex p-4 rounded-full bg-gray-700 mb-4 group-hover:scale-110 transition-transform">
                                            <MagicWandIcon className="w-12 h-12 text-purple-500" />
                                        </div>
                                        <p className="text-gray-500 font-mono">Generating Scene 3...</p>
                                    </div>
                                </div>
                                {/* Fake UI Elements */}
                                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gray-900 border-t border-gray-700 p-4 flex gap-4 opacity-50">
                                    <div className="w-32 h-full bg-purple-900/40 rounded border border-purple-500/30"></div>
                                    <div className="w-48 h-full bg-blue-900/40 rounded border border-blue-500/30"></div>
                                    <div className="w-32 h-full bg-orange-900/40 rounded border border-orange-500/30"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FEATURES SECTION */}
            <section className="py-24 bg-gray-800/50 border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-white mb-4">Everything you need to tell your story</h2>
                        <p className="text-gray-400">Professional video editing tools meet Generative AI.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <FeatureCard 
                            icon={<MagicWandIcon className="w-8 h-8 text-purple-400" />}
                            title="AI Script & Narration"
                            description="Just type a topic. Our AI writes the script, generates professional voiceovers, and plans the visual scenes for you."
                        />
                        <FeatureCard 
                            icon={<MediaIcon className="w-8 h-8 text-blue-400" />}
                            title="Smart Stock Matching"
                            description="Automatically finds the perfect royalty-free clips and images from Pixabay to match every sentence of your story."
                        />
                        <FeatureCard 
                            icon={<EffectsIcon className="w-8 h-8 text-pink-400" />}
                            title="Full NLE Editor"
                            description="Don't like the AI result? Customize everything. Trim clips, change music, adjust transitions, and edit subtitles."
                        />
                    </div>
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section className="py-24 bg-gray-900">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                        <div>
                            <h2 className="text-3xl font-bold text-white mb-6">From text to video in <br/><span className="text-purple-500">3 simple steps</span></h2>
                            <div className="space-y-8">
                                <Step 
                                    number="1" 
                                    title="Enter your idea" 
                                    desc="Describe your topic, choose a duration, and select your aspect ratio (Landscape or Portrait)." 
                                />
                                <Step 
                                    number="2" 
                                    title="AI Magic Happens" 
                                    desc="Magistory generates a script, finds relevant media, creates voiceovers, and syncs everything to the beat." 
                                />
                                <Step 
                                    number="3" 
                                    title="Customize & Export" 
                                    desc="Use our powerful timeline editor to tweak visuals, add effects, and export your masterpiece in 1080p." 
                                />
                            </div>
                        </div>
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl transform rotate-3 blur-lg opacity-30"></div>
                            <div className="relative bg-gray-800 rounded-2xl p-8 border border-gray-700 shadow-2xl">
                                <div className="space-y-4">
                                    <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                                    <div className="h-4 bg-gray-700 rounded w-1/2"></div>
                                    <div className="h-32 bg-gray-900 rounded-lg border border-gray-600 flex items-center justify-center mt-6">
                                        <ExportIcon className="w-12 h-12 text-gray-600" />
                                    </div>
                                    <button onClick={onGetStarted} className="w-full py-3 bg-purple-600 rounded-lg text-white font-bold mt-4">Generate Video</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="bg-gray-900 border-t border-gray-800 py-12">
                <div className="max-w-7xl mx-auto px-4 text-center">
                    <p className="text-gray-500">&copy; {new Date().getFullYear()} Magistory Instant Video. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
};

const FeatureCard: React.FC<{icon: React.ReactNode, title: string, description: string}> = ({ icon, title, description }) => (
    <div className="bg-gray-800/50 p-8 rounded-2xl border border-gray-700 hover:border-purple-500/50 transition-all hover:bg-gray-800 group">
        <div className="w-14 h-14 bg-gray-900 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            {icon}
        </div>
        <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
        <p className="text-gray-400 leading-relaxed">{description}</p>
    </div>
);

const Step: React.FC<{number: string, title: string, desc: string}> = ({ number, title, desc }) => (
    <div className="flex gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center font-bold text-purple-400">
            {number}
        </div>
        <div>
            <h4 className="text-lg font-bold text-white mb-1">{title}</h4>
            <p className="text-gray-400 text-sm">{desc}</p>
        </div>
    </div>
);

export default LandingPage;
