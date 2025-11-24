
import React, { useState, useRef, useEffect } from 'react';
import type { TransitionEffect } from '../types';
import { TransitionIcon } from './icons';

interface TransitionPickerProps {
    currentTransition: TransitionEffect;
    onSelect: (transition: TransitionEffect) => void;
}

const transitionOptions: { name: TransitionEffect, label: string }[] = [
    { name: 'fade', label: 'Fade' },
    { name: 'slide', label: 'Slide' },
    { name: 'zoom', label: 'Zoom' },
];

const TransitionPicker: React.FC<TransitionPickerProps> = ({ currentTransition, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !(wrapperRef.current as any).contains(event.target as any)) {
                setIsOpen(false);
            }
        };
        (window as any).document.addEventListener('mousedown', handleClickOutside);
        return () => (window as any).document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (transition: TransitionEffect) => {
        onSelect(transition);
        setIsOpen(false);
    }

    return (
        <div className="relative" ref={wrapperRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-full hover:bg-purple-600 transition-colors"
                title="Change transition"
            >
                <TransitionIcon className="w-5 h-5 text-white" />
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-28 bg-gray-600 rounded-md shadow-lg z-10 p-1">
                    {transitionOptions.map(option => (
                        <button
                            key={option.name}
                            onClick={() => handleSelect(option.name)}
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${
                                currentTransition === option.name 
                                ? 'bg-purple-600 text-white' 
                                : 'text-gray-200 hover:bg-gray-500'
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TransitionPicker;