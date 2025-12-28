
import React from 'react';
import { MagicWandIcon, MediaIcon, MusicIcon, EffectsIcon, ExportIcon, LargePlayIcon } from './icons';

interface LandingPageProps {
    onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
    return (
        <div className="flex flex-col min-h-full pb-20 overflow-y-auto custom-scrollbar">
            {/* HERO SECTION */}
            <section className="relative pt-24 pb-16 md:pt-32 md:pb-32 overflow-hidden px-4">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full z-0 pointer-events-none">
                    <div className="absolute top-20 left-1/4 w-64 h-64 md:w-96 md:h-96 bg-purple-600/20 rounded-full blur-[80px] md:blur-[100px] animate-pulse"></div>
                    <div className="absolute bottom-20 right-1/4 w-64 h-64 md:w-96 md:h-96 bg-blue-600/10 rounded-full blur-[80px] md:blur-[100px]"></div>
                </div>

                <div className="max-w-7xl mx-auto relative z-10 text-center">
                    <div className="inline-block mb-6 px-4 py-1.5 rounded-full bg-gray-800 border border-gray-700 animate-fade-in-up backdrop-blur-sm">
                        <span className="text-xs md:text-sm font-medium text-purple-400">✨ AI-Powered Video Creation</span>
                    </div>
                    
                    <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-6 animate-fade-in-up leading-tight" style={{ animationDelay: '0.1s' }}>
                        Turn Ideas into <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                            Magic Videos
                        </span>
                    </h1>
                    
                    <p className="mt-4 max-w-2xl mx-auto text-base sm:text-lg md:text-xl text-gray-400 mb-10 animate-fade-in-up px-2" style={{ animationDelay: '0.2s' }}>
                        Transform simple text prompts into fully edited videos with AI narration, 
                        smart stock footage matching, and professional subtitles in seconds.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row justify-center gap-4 animate-fade-in-up px-4" style={{ animationDelay: '0.3s' }}>
                        <button 
                            onClick={onGetStarted}
                            className="w-full sm:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white text-lg font-bold rounded-full transition-all transform hover:scale-105 shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2"
                        >
                            <MagicWandIcon className="w-6 h-6" />
                            Create Video Now
                        </button>
                    </div>

                    {/* Dashboard Preview Mockup */}
                    <div className="mt-16 md:mt-20 relative animate-fade-in-up px-2" style={{ animationDelay: '0.5s' }}>
                        <div className="rounded-xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden max-w-5xl mx-auto transform rotate-1 hover:rotate-0 transition-transform duration-700">
                            <div className="h-6 md:h-8 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-2">
                                <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-red-500"></div>
                                <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-yellow-500"></div>
                                <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-green-500"></div>
                            </div>
                            <div className="aspect-[16/9] bg-gray-800 relative group flex items-center justify-center">
                                <div className="text-center p-4">
                                    <div className="inline-flex p-4 rounded-full bg-gray-700 mb-4 group-hover:scale-110 transition-transform">
                                        <MagicWandIcon className="w-8 h-8 md:w-12 md:h-12 text-purple-500" />
                                    </div>
                                    <p className="text-gray-500 font-mono text-xs md:text-base">Generating Scene 3...</p>
                                </div>
                                {/* Fake UI Elements */}
                                <div className="absolute bottom-0 left-0 right-0 h-16 md:h-24 bg-gray-900 border-t border-gray-700 p-2 md:p-4 flex gap-2 md:gap-4 opacity-50">
                                    <div className="w-20 md:w-32 h-full bg-purple-900/40 rounded border border-purple-500/30"></div>
                                    <div className="w-32 md:w-48 h-full bg-blue-900/40 rounded border border-blue-500/30"></div>
                                    <div className="w-20 md:w-32 h-full bg-orange-900/40 rounded border border-orange-500/30"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FEATURES SECTION */}
            <section className="py-16 md:py-24 bg-gray-800/50 border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Everything you need</h2>
                        <p className="text-gray-400 text-sm md:text-base">Professional video editing tools meet Generative AI.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                        <FeatureCard 
                            icon={<MagicWandIcon className="w-6 h-6 md:w-8 md:h-8 text-purple-400" />}
                            title="AI Script & Narration"
                            description="Just type a topic. Our AI writes the script, generates professional voiceovers, and plans the visual scenes."
                        />
                        <FeatureCard 
                            icon={<MediaIcon className="w-6 h-6 md:w-8 md:h-8 text-blue-400" />}
                            title="Smart Stock Matching"
                            description="Automatically finds the perfect royalty-free clips and images from Pixabay/Pexels to match every sentence."
                        />
                        <FeatureCard 
                            icon={<EffectsIcon className="w-6 h-6 md:w-8 md:h-8 text-pink-400" />}
                            title="Full Timeline Editor"
                            description="Customize everything. Trim clips, change music, adjust transitions, and edit subtitles with a familiar timeline."
                        />
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="bg-gray-900 border-t border-gray-800 py-8">
                <div className="max-w-7xl mx-auto px-4 text-center">
                    <p className="text-gray-500 text-sm">&copy; {new Date().getFullYear()} Magistory Instant Video. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
};

const FeatureCard: React.FC<{icon: React.ReactNode, title: string, description: string}> = ({ icon, title, description }) => (
    <div className="bg-gray-800/50 p-6 md:p-8 rounded-2xl border border-gray-700 hover:border-purple-500/50 transition-all hover:bg-gray-800 group">
        <div className="w-12 h-12 md:w-14 md:h-14 bg-gray-900 rounded-xl flex items-center justify-center mb-4 md:mb-6 group-hover:scale-110 transition-transform">
            {icon}
        </div>
        <h3 className="text-lg md:text-xl font-bold text-white mb-2 md:mb-3">{title}</h3>
        <p className="text-sm md:text-base text-gray-400 leading-relaxed">{description}</p>
    </div>
);

export default LandingPage;
