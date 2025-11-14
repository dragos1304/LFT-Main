import React, { useState, useEffect, useMemo } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Flashcard } from '../types';
import { IconX } from './Icons';

// CSS for the 3D flip effect. This is injected into the document head.
const flipAnimationCSS = `
.perspective-1000 { perspective: 1000px; }
.preserve-3d { transform-style: preserve-3d; }
.rotate-y-180 { transform: rotateY(180deg); }
.backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
`;

export const FlashcardTrainer: React.FC<{
    flashcards: Flashcard[];
    onClose: () => void;
}> = ({ flashcards, onClose }) => {
    const [deck, setDeck] = useState<Flashcard[]>([]);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isSessionComplete, setIsSessionComplete] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        const styleElement = document.createElement('style');
        styleElement.id = 'flashcard-flip-styles';
        styleElement.innerHTML = flipAnimationCSS;
        document.head.appendChild(styleElement);
        return () => {
            document.getElementById('flashcard-flip-styles')?.remove();
        };
    }, []);

    useEffect(() => {
        if (flashcards && flashcards.length > 0) {
            setDeck([...flashcards].sort(() => Math.random() - 0.5));
            setIsFlipped(false);
            setIsSessionComplete(false);
        } else {
            setIsSessionComplete(true);
        }
    }, [flashcards]);

    const card = useMemo(() => deck[0], [deck]);

    const handleRating = async (rating_q: 1 | 2 | 3 | 4) => {
        if (!card || isProcessing) return;
        setIsProcessing(true);

        const { stability, difficulty, lapses, state } = card;
        const now = new Date();
        let new_difficulty, new_stability, next_due_date;
        let new_lapses = lapses;
        let new_state = state;

        // Step 1: Calculate New Difficulty
        let difficulty_change = 0;
        if (rating_q === 1) difficulty_change = 0.15;
        if (rating_q === 2) difficulty_change = 0.05;
        if (rating_q === 3) difficulty_change = -0.05;
        if (rating_q === 4) difficulty_change = -0.15;
        new_difficulty = Math.max(0, Math.min(1, difficulty + difficulty_change));

        // Step 2: Handle Failures vs. Successes
        if (rating_q === 1) { // FAIL (Lapse)
            new_lapses = lapses + 1;
            new_stability = stability * 0.2;
            new_state = 'learning';
            next_due_date = new Date(now.getTime() + 5 * 60 * 1000); // Re-learn in 5 minutes
        } else { // PASS
            new_state = 'graduated';
            
            // Calculate Gain (G)
            const base_gain = (rating_q - 1.5) * 4.0;
            const difficulty_modifier = Math.pow(1.0 - new_difficulty, 2);
            const lapse_modifier = 1 / (lapses + 1);
            const gain = base_gain * difficulty_modifier * lapse_modifier;

            if (state === 'new') {
                new_stability = 1.0;
            } else {
                new_stability = stability * (1 + gain);
            }

            // Step 3: Probabilistic Scheduling
            const new_interval_days = new_stability * 0.10536; // -S * ln(0.9)
            const fuzz_factor = (Math.random() - 0.5) * 0.1; // +/- 5%
            const final_interval_days = Math.max(1, new_interval_days * (1 + fuzz_factor));
            
            next_due_date = new Date(now.getTime() + final_interval_days * 24 * 60 * 60 * 1000);
        }

        try {
            // FIX: Use studySetId from the card object itself.
            const cardRef = doc(db, `study_sets/${card.studySetId}/flashcards`, card.id);
            await updateDoc(cardRef, {
                difficulty: new_difficulty,
                stability: new_stability,
                lapses: new_lapses,
                state: new_state,
                dueDate: next_due_date.toISOString(),
                lastReview: now.toISOString(),
            });
        } catch (error) {
            console.error("Failed to update flashcard SRS data:", error);
        }
        
        setIsFlipped(false);
        setTimeout(() => {
            const newDeck = deck.slice(1);
            setDeck(newDeck);
            if (newDeck.length === 0) {
                setIsSessionComplete(true);
            }
            setIsProcessing(false);
        }, 250);
    };

    const SessionEndView = () => (
        <div className="bg-gray-800 rounded-lg w-full max-w-2xl p-8 relative text-white text-center">
            <h3 className="text-2xl font-bold mb-2">Session Complete!</h3>
            <p className="text-gray-400 mt-2">
                {flashcards.length > 0
                    ? "You've reviewed all your due cards for now. Great work!"
                    : "There were no cards due for review in this deck."}
            </p>
            <div className="mt-6">
                <button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700 font-bold py-2 px-6 rounded-lg">Close</button>
            </div>
        </div>
    );

    if (isSessionComplete) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
                <SessionEndView />
            </div>
        );
    }

    if (!card) {
        return null; // Should be handled by isSessionComplete, but as a fallback.
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg w-full max-w-3xl p-6 relative text-white">
                 <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white z-10">
                    <IconX className="w-6 h-6" />
                </button>
                <div className="absolute top-4 left-4 text-sm text-gray-400 font-medium z-10">
                    Card {flashcards.length - deck.length + 1} of {flashcards.length}
                </div>
                <div className="mt-8 aspect-[3/2] flex items-center justify-center rounded-lg cursor-pointer perspective-1000" onClick={() => setIsFlipped(!isFlipped)}>
                    <div className={`w-full h-full preserve-3d transition-transform duration-500 ${isFlipped ? 'rotate-y-180' : ''}`}>
                        <div className="absolute w-full h-full backface-hidden bg-gray-700 rounded-lg p-6 flex items-center justify-center overflow-y-auto">
                            <p className="text-2xl text-center">{card.frontText}</p>
                        </div>
                        <div className="absolute w-full h-full backface-hidden bg-indigo-900 rounded-lg p-6 flex items-center justify-center rotate-y-180 overflow-y-auto">
                            <p className="text-2xl text-center">{card.backText}</p>
                        </div>
                    </div>
                </div>
                {isFlipped ? (
                    <div className="grid grid-cols-4 gap-4 mt-6">
                        <button onClick={() => handleRating(1)} disabled={isProcessing} className="bg-red-600/80 hover:bg-red-600 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">Again</button>
                        <button onClick={() => handleRating(2)} disabled={isProcessing} className="bg-orange-500/80 hover:bg-orange-500 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">Hard</button>
                        <button onClick={() => handleRating(3)} disabled={isProcessing} className="bg-green-600/80 hover:bg-green-600 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">Good</button>
                        <button onClick={() => handleRating(4)} disabled={isProcessing} className="bg-blue-600/80 hover:bg-blue-600 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">Easy</button>
                    </div>
                ) : (
                    <div className="mt-6 text-center">
                        <button onClick={() => setIsFlipped(true)} className="bg-gray-600 hover:bg-gray-500 font-bold py-3 px-8 rounded-lg">Show Answer</button>
                    </div>
                )}
            </div>
        </div>
    );
};
