
import React from 'react';
import { MagicWandIcon } from './icons';

const PricingSection: React.FC = () => {
    const plans = [
        { credits: 50, price: "$5", label: "Starter" },
        { credits: 120, price: "$10", label: "Creator", popular: true },
        { credits: 300, price: "$20", label: "Pro" },
    ];

    return (
        <section id="pricing" className="py-20 bg-gray-900 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 text-center">
                <h2 className="text-3xl font-bold text-white mb-4">Simple Credit Pricing</h2>
                <p className="text-gray-400 mb-12">Pay as you go. No monthly subscriptions.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                    {plans.map((plan) => (
                        <div key={plan.label} className={`relative bg-gray-800 p-8 rounded-2xl border ${plan.popular ? 'border-purple-500 shadow-lg shadow-purple-900/20 transform scale-105' : 'border-gray-700'}`}>
                            {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">MOST POPULAR</div>}
                            <h3 className="text-xl font-bold text-white mb-2">{plan.label}</h3>
                            <div className="text-4xl font-extrabold text-white mb-4">{plan.price}</div>
                            <div className="text-purple-400 font-bold mb-6 flex items-center justify-center gap-1">
                                <MagicWandIcon className="w-5 h-5" /> {plan.credits} Credits
                            </div>
                            <button className={`w-full py-3 rounded-lg font-bold transition-colors ${plan.popular ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}>
                                Buy Now
                            </button>
                        </div>
                    ))}
                </div>
                
                <div className="mt-12 text-sm text-gray-500 max-w-2xl mx-auto bg-gray-800/50 p-6 rounded-lg border border-gray-700">
                    <h4 className="font-bold text-gray-300 mb-2 uppercase">Usage Costs</h4>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                        <li>• Magic Video Generation: <span className="text-white">1 Credit / min</span></li>
                        <li>• AI Text-to-Speech: <span className="text-white">2 Credits / min</span></li>
                        <li>• AI Image Generation: <span className="text-white">1 Credit / image</span></li>
                        <li>• AI Video (Veo): <span className="text-white">2 Credits / video</span></li>
                        <li>• Stock Media & Uploads: <span className="text-green-400">FREE</span></li>
                    </ul>
                </div>
            </div>
        </section>
    );
};

export default PricingSection;
