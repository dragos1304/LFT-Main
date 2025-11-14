import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import type { Flashcard } from '@/types';
import { IconArrowLeft, IconChartBar } from '@/components/Icons';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { FlashcardTrainer } from '@/components/FlashcardTrainer';

const MasteryDonutChart: React.FC<{ cards: Flashcard[] }> = ({ cards }) => {
    const data = useMemo(() => {
        const counts = { new: 0, learning: 0, graduated: 0 };
        cards.forEach(card => {
            if (counts[card.state] !== undefined) {
                counts[card.state]++;
            }
        });
        return [
            { name: 'New', value: counts.new },
            { name: 'Learning', value: counts.learning },
            { name: 'Graduated', value: counts.graduated },
        ];
    }, [cards]);

    const COLORS = ['#6B7280', '#F97316', '#22C55E'];

    return (
        <div className="bg-gray-800 p-6 rounded-lg h-full flex flex-col">
            <h3 className="text-xl font-bold">Mastery Breakdown</h3>
            <p className="text-sm text-gray-400 mb-4">This shows the current learning stage of all your flashcards.</p>
            <div className="flex-grow relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius="80%"
                            innerRadius="60%"
                            fill="#8884d8"
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563', borderRadius: '0.5rem' }} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                        <p className="text-3xl font-extrabold">{cards.length}</p>
                        <p className="text-gray-400">Total Cards</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const KPIRow: React.FC<{ cards: Flashcard[] }> = ({ cards }) => {
    const { totalLapses, avgStability, masteryRate } = useMemo(() => {
        if (cards.length === 0) {
            return { totalLapses: 0, avgStability: 0, masteryRate: 0 };
        }

        const totalLapses = cards.reduce((sum, card) => sum + card.lapses, 0);

        const graduatedCards = cards.filter(c => c.state === 'graduated');
        const avgStability = graduatedCards.length > 0
            ? graduatedCards.reduce((sum, card) => sum + card.stability, 0) / graduatedCards.length
            : 0;

        const masteryRate = (graduatedCards.length / cards.length) * 100;

        return { totalLapses, avgStability, masteryRate };
    }, [cards]);

    const StatCard: React.FC<{ title: string; value: string; description: string; }> = ({ title, value, description }) => (
        <div className="bg-gray-800 p-6 rounded-lg text-center">
            <p className="text-sm text-gray-400 font-medium">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            <p className="text-xs text-gray-500 mt-2">{description}</p>
        </div>
    );

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="Total Lapses" value={totalLapses.toString()} description="Total times a card was forgotten. Lower is better." />
            <StatCard title="Avg. Memory Strength" value={`${avgStability.toFixed(1)} days`} description="Average time a 'Graduated' card is remembered. Higher is better." />
            <StatCard title="Mastery Rate" value={`${masteryRate.toFixed(0)}%`} description="Percentage of cards you've 'Graduated'. Aim for 100%!" />
        </div>
    );
};


const ForecastBarChart: React.FC<{ cards: Flashcard[] }> = ({ cards }) => {
    const data = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const buckets = Array(7).fill(0).map((_, i) => {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'short' });
            return { name: dayName, date, Reviews: 0 };
        });

        cards.forEach(card => {
            const dueDate = new Date(card.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            const diffTime = dueDate.getTime() - today.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays < 7) {
                buckets[diffDays].Reviews++;
            }
        });

        return buckets;
    }, [cards]);

    return (
        <div className="bg-gray-800 p-6 rounded-lg h-96 flex flex-col">
            <h3 className="text-xl font-bold">Your 7-Day Study Forecast</h3>
            <p className="text-sm text-gray-400 mb-4">This chart shows how many cards are scheduled for review each day.</p>
            <div className="flex-grow">
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <XAxis dataKey="name" stroke="#9CA3AF" />
                        <YAxis allowDecimals={false} stroke="#9CA3AF" />
                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563', borderRadius: '0.5rem' }} cursor={{ fill: 'rgba(79, 70, 229, 0.2)' }} />
                        <Bar dataKey="Reviews" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const ActionHotlist: React.FC<{ cards: Flashcard[]; onStudyCard: (card: Flashcard) => void }> = ({ cards, onStudyCard }) => {
    const problemCards = useMemo(() => {
        return [...cards]
            .sort((a, b) => b.difficulty - a.difficulty || b.lapses - a.lapses)
            .slice(0, 5);
    }, [cards]);

    return (
        <div className="bg-gray-800 p-6 rounded-lg h-full">
            <h3 className="text-xl font-bold">Top 5 Problem Cards</h3>
            <p className="text-sm text-gray-400 mb-4">Focus your efforts on the cards you struggle with the most.</p>
            {problemCards.length > 0 ? (
                <ul className="space-y-3">
                    {problemCards.map(card => (
                        <li key={card.id}>
                            <button onClick={() => onStudyCard(card)} className="w-full text-left p-3 bg-gray-700 hover:bg-indigo-600 rounded-md transition">
                                <p className="text-white truncate">{card.frontText}</p>
                                <div className="flex text-xs text-gray-400 mt-1 gap-4">
                                    <span>Difficulty: {card.difficulty.toFixed(2)}</span>
                                    <span>Lapses: {card.lapses}</span>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="flex items-center justify-center h-48 border-2 border-dashed border-gray-700 rounded-lg">
                    <p className="text-gray-500">No problem cards identified yet. Keep studying!</p>
                </div>
            )}
        </div>
    );
};

const ProgressDashboard: React.FC<{ user: User; onBack: () => void }> = ({ user, onBack }) => {
    const [allFlashcards, setAllFlashcards] = useState<Flashcard[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [studyingCard, setStudyingCard] = useState<Flashcard | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const studySetsQuery = query(collection(db, "study_sets"), where("userId", "==", user.uid));
            const studySetsSnapshot = await getDocs(studySetsQuery);
            
            const flashcardPromises = studySetsSnapshot.docs.map(setDoc => {
                const studySetId = setDoc.id;
                return getDocs(collection(db, `study_sets/${studySetId}/flashcards`)).then(snapshot => 
                    snapshot.docs.map(doc => {
                        const data = doc.data();
                        return {
                            id: doc.id,
                            studySetId: studySetId,
                            frontText: data.frontText || data.front_text,
                            backText: data.backText || data.back_text,
                            isUserEdited: data.isUserEdited ?? false,
                            stability: data.stability ?? 0,
                            difficulty: data.difficulty ?? 0.5,
                            lapses: data.lapses ?? 0,
                            dueDate: data.dueDate || new Date().toISOString(),
                            lastReview: data.lastReview ?? null,
                            state: data.state ?? 'new',
                        } as Flashcard;
                    })
                );
            });
            
            const flashcardsBySet = await Promise.all(flashcardPromises);
            const flattenedFlashcards = flashcardsBySet.flat();
            setAllFlashcards(flattenedFlashcards);
        } catch (error) {
            console.error("Failed to fetch user's flashcards:", error);
        } finally {
            setIsLoading(false);
        }
    }, [user.uid]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div></div>;
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8">
            <header className="mb-6">
                <button onClick={onBack} className="flex items-center text-sm text-indigo-400 hover:text-indigo-300 mb-4">
                    <IconArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                </button>
                <div className="flex items-center gap-3">
                    <IconChartBar className="w-8 h-8 text-indigo-400" />
                    <h1 className="text-4xl font-extrabold">Your Learning Progress</h1>
                </div>
            </header>

            {allFlashcards.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-gray-700 rounded-lg">
                    <IconChartBar className="mx-auto w-12 h-12 text-gray-600 mb-4"/>
                    <h2 className="text-xl font-semibold text-white">No Progress Data Yet</h2>
                    <p className="text-gray-400 mt-2">Create a study set and review some flashcards to see your progress here.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <KPIRow cards={allFlashcards} />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <ForecastBarChart cards={allFlashcards} />
                        </div>
                        <MasteryDonutChart cards={allFlashcards} />
                    </div>
                    <ActionHotlist cards={allFlashcards} onStudyCard={setStudyingCard} />
                </div>
            )}

            {studyingCard && (
                <FlashcardTrainer 
                    flashcards={[studyingCard]} 
                    onClose={() => {
                        setStudyingCard(null);
                        fetchData(); // Refresh data after the micro-session
                    }} 
                />
            )}
        </div>
    );
};

export default ProgressDashboard;