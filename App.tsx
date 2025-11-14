import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { User, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, doc, writeBatch, Timestamp, orderBy } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { View, StudySet, StudySourceType, StudySetDocument, ProcessableFile, Folder } from './types';
import { processNewSource } from './services/geminiService';
import { IconAudio, IconBookOpen, IconFolder, IconLogout, IconPDF, IconPlus, IconSparkles, IconX, IconYouTube, IconChevronDown } from './components/Icons';
import StudySetView from './components/StudySetView';

// AuthView Component
const AuthView: React.FC<{
    onLogin: (email: string, pass: string) => Promise<void>;
    onSignUp: (email: string, pass: string) => Promise<void>;
}> = ({ onLogin, onSignUp }) => {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (isSignUp) {
                await onSignUp(email, password);
            } else {
                await onLogin(email, password);
            }
        } catch (err: any) {
            if (err.code) {
                switch (err.code) {
                    case 'auth/invalid-email':
                        setError('Please enter a valid email address.');
                        break;
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                         case 'auth/invalid-credential':
                        setError('Invalid email or password.');
                        break;
                    case 'auth/email-already-in-use':
                        setError('An account already exists with this email.');
                        break;
                    case 'auth/weak-password':
                         setError('Password should be at least 6 characters.');
                        break;
                    default:
                        setError('An unexpected error occurred. Please try again.');
                }
            } else {
                 setError('An unexpected error occurred. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
            <div className="text-center mb-8">
                <IconSparkles className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Learning Fast-Track</h1>
                <p className="text-lg text-gray-400">Your personal AI-powered study partner.</p>
            </div>
            <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-sm">
                <h2 className="text-2xl font-semibold text-center text-white mb-6">{isSignUp ? 'Create Account' : 'Sign In'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 disabled:bg-gray-600">
                        {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
                    </button>
                </form>
                <div className="text-center mt-4">
                    <button onClick={() => { setIsSignUp(!isSignUp); setError(null); }} className="text-sm text-indigo-400 hover:text-indigo-300">
                        {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// AddSourceModal Component
const AddSourceModal: React.FC<{ 
    onClose: () => void; 
    onAddStudySet: (studySet: StudySetDocument) => void; 
    user: User;
    folderId: string;
}> = ({ onClose, onAddStudySet, user, folderId }) => {
    const [sourceType, setSourceType] = useState<StudySourceType | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (sourceType === 'pdf' || sourceType === 'audio' || sourceType === 'video') {
            fileInputRef.current?.click();
        }
    }, [sourceType]);

    const handleSourceSelect = (type: StudySourceType) => {
        setSourceType(type);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (event.target) event.target.value = '';

        if (!file || !sourceType) {
            setSourceType(null);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            (async () => {
                if (e.target?.result && e.target.result instanceof ArrayBuffer) {
                    const processableFile: ProcessableFile = { name: file.name, data: e.target.result };
                    await handleSubmit(processableFile, sourceType);
                } else {
                    setError('Could not read the file content correctly.');
                    setSourceType(null);
                }
            })().catch(err => {
                console.error("Error during file submission process:", err);
            });
        };
        reader.onerror = () => {
            console.error("FileReader error:", reader.error);
            setError('Failed to read the file.');
            setSourceType(null);
        };
        reader.readAsArrayBuffer(file);
    };
    
    const handleUrlSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const url = formData.get('youtubeUrl') as string;
        if(url && sourceType === 'youtube') {
           await handleSubmit(url, sourceType);
        }
    }

    const handleSubmit = async (source: ProcessableFile | string, type: StudySourceType) => {
        setIsLoading(true);
        setError(null);
        try {
            const processedData = await processNewSource(source, type);
            const { keywords, flashcards, practiceQuestions, conceptLinks, ...coreData } = processedData;

            const studySetDoc: Omit<StudySetDocument, 'id'> = {
                ...coreData,
                userId: user.uid,
                folderId: folderId,
                summaryText: processedData.summaryText,
                hierarchicalOutline: processedData.hierarchicalOutline,
            };
            
            const docRef = await addDoc(collection(db, "study_sets"), studySetDoc);

            const batch = writeBatch(db);
            keywords.forEach(kw => batch.set(doc(collection(db, `study_sets/${docRef.id}/keywords`)), kw));
            flashcards.forEach(fc => batch.set(doc(collection(db, `study_sets/${docRef.id}/flashcards`)), fc));
            practiceQuestions.forEach(pq => batch.set(doc(collection(db, `study_sets/${docRef.id}/practice_questions`)), pq));
            await batch.commit();
            
            onAddStudySet({ ...studySetDoc, id: docRef.id });
            onClose();
        } catch (err) {
            setError('Failed to process the source. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const sourceOptions = [
        { type: 'pdf' as StudySourceType, label: 'Upload PDF', icon: <IconPDF className="w-10 h-10" /> },
        { type: 'youtube' as StudySourceType, label: 'YouTube URL', icon: <IconYouTube className="w-10 h-10" /> },
        { type: 'audio' as StudySourceType, label: 'Upload Audio/Video', icon: <IconAudio className="w-10 h-10" /> },
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all duration-300 ease-in-out scale-95 hover:scale-100 p-6 relative">
                 <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    <IconX className="w-6 h-6" />
                </button>
                <div className="text-center">
                    <IconSparkles className="mx-auto w-12 h-12 text-indigo-400 mb-2"/>
                    <h2 className="text-3xl font-bold text-white mb-2">Create New Study Set</h2>
                    <p className="text-gray-400 mb-8">Choose your source material to begin.</p>
                </div>
                
                {isLoading ? (
                    <div className="text-center p-8">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
                        <p className="mt-4 text-lg text-white">AI is generating your study set...</p>
                        <p className="text-gray-400">This may take a moment.</p>
                    </div>
                ) : (
                    <div>
                        {!sourceType ? (
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {sourceOptions.map(opt => (
                                     <button key={opt.type} onClick={() => handleSourceSelect(opt.type)} className="flex flex-col items-center justify-center p-6 bg-gray-700 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors duration-200 aspect-square">
                                         {opt.icon}
                                         <span className="mt-2 font-semibold">{opt.label}</span>
                                     </button>
                                ))}
                             </div>
                        ) : sourceType === 'youtube' ? (
                            <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
                                <input type="url" name="youtubeUrl" placeholder="https://www.youtube.com/watch?v=..." required className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"/>
                                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300">Generate from URL</button>
                                <button type="button" onClick={() => setSourceType(null)} className="text-gray-400 hover:text-white">Back</button>
                            </form>
                        ) : null}
                         <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept={sourceType === 'pdf' ? '.pdf' : 'audio/*,video/*'}/>
                        {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
                    </div>
                )}
            </div>
        </div>
    );
};


// DashboardView Component
const DashboardView: React.FC<{ user: User; onSelectStudySet: (studySet: StudySetDocument) => void; }> = ({ user, onSelectStudySet }) => {
    const [studySets, setStudySets] = useState<StudySetDocument[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [folderForNewSet, setFolderForNewSet] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState('');
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            
            // Fetch folders
            const folderQuery = query(collection(db, "folders"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
            const folderSnapshot = await getDocs(folderQuery);
            const fetchedFolders = folderSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Folder));
            setFolders(fetchedFolders);

            // Fetch study sets
            const setQuery = query(collection(db, "study_sets"), where("userId", "==", user.uid));
            const setSnapshot = await getDocs(setQuery);
            const fetchedSets = setSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudySetDocument));
            setStudySets(fetchedSets);
            
            setIsLoading(false);
        };

        fetchData();
    }, [user.uid]);

    const groupedStudySets = useMemo(() => {
        const groups = new Map<string | undefined, StudySetDocument[]>();
        studySets.forEach(set => {
            const group = groups.get(set.folderId) || [];
            group.push(set);
            groups.set(set.folderId, group);
        });
        return groups;
    }, [studySets]);

    const handleAddStudySet = (newStudySet: StudySetDocument) => {
        setStudySets(prev => [newStudySet, ...prev]);
        onSelectStudySet(newStudySet);
    };

    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;
        
        const newFolder: Omit<Folder, 'id'> = {
            name: newFolderName.trim(),
            userId: user.uid,
            createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, "folders"), newFolder);
        setFolders(prev => [{...newFolder, id: docRef.id}, ...prev]);
        setNewFolderName('');
    };
    
    const getIconForType = (type: StudySourceType) => {
        switch(type){
            case 'pdf': return <IconPDF className="w-5 h-5"/>;
            case 'youtube': return <IconYouTube className="w-5 h-5"/>;
            case 'audio':
            case 'video': return <IconAudio className="w-5 h-5"/>;
        }
    };
    
    const toggleFolder = (folderId: string) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folderId)) {
                newSet.delete(folderId);
            } else {
                newSet.add(folderId);
            }
            return newSet;
        });
    };

    const handleOpenModal = (folderId: string) => {
        setFolderForNewSet(folderId);
        setIsModalOpen(true);
    };
    
    const handleLogout = () => {
        signOut(auth);
    };

    const StudySetGrid: React.FC<{sets?: StudySetDocument[]}> = ({ sets }) => {
        if (!sets || sets.length === 0) {
            return <p className="text-gray-500 px-4 py-8 text-center">No study sets in this folder yet.</p>;
        }
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-4">
                {sets.map(set => (
                    <div key={set.id} onClick={() => onSelectStudySet(set)} className="bg-gray-800 rounded-lg shadow-lg p-5 cursor-pointer hover:shadow-indigo-500/30 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
                        <div>
                            <h3 className="text-xl font-bold text-white truncate mb-2">{set.title}</h3>
                            <p className="text-gray-400 text-sm line-clamp-3">{set.summaryText}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
                            {getIconForType(set.sourceType)}
                            <span className="truncate">{set.sourceName}</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-900 p-4 sm:p-6 lg:p-8">
            <header className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-3">
                    <IconBookOpen className="w-8 h-8 text-indigo-400" />
                    <h1 className="text-3xl font-bold text-white">My Study Sets</h1>
                </div>
                <button onClick={handleLogout} className="text-gray-400 hover:text-white" title="Sign Out">
                    <IconLogout className="w-6 h-6" />
                </button>
            </header>

            <div className="bg-gray-800 p-4 rounded-lg mb-8">
                <form onSubmit={handleCreateFolder} className="flex gap-4">
                    <input 
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="New Folder Name (e.g., Biology 101)"
                        className="flex-grow p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <button type="submit" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                        <IconPlus className="w-5 h-5" />
                        <span>Create Folder</span>
                    </button>
                </form>
            </div>
            
            {isLoading ? (
                 <div className="text-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto"></div></div>
            ) : (
                <div className="space-y-4">
                    {folders.map(folder => (
                        <div key={folder.id} className="bg-gray-800 rounded-lg overflow-hidden">
                            <div onClick={() => toggleFolder(folder.id)} className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-700/50">
                                <div className="flex items-center gap-3">
                                    <IconFolder className="w-6 h-6 text-indigo-400"/>
                                    <h2 className="text-xl font-bold text-white">{folder.name}</h2>
                                    <span className="text-sm text-gray-400">({groupedStudySets.get(folder.id)?.length || 0})</span>
                                </div>
                                <div className="flex items-center gap-4">
                                     <button onClick={(e) => { e.stopPropagation(); alert("Feature coming soon!"); }} className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold py-1 px-3 rounded-lg transition disabled:opacity-50" disabled>Study All</button>
                                     <button onClick={(e) => { e.stopPropagation(); handleOpenModal(folder.id); }} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-1 px-3 rounded-lg transition">+ Add Source</button>
                                     <IconChevronDown className={`w-6 h-6 text-gray-400 transition-transform ${expandedFolders.has(folder.id) ? 'rotate-180' : ''}`} />
                                </div>
                            </div>
                            {expandedFolders.has(folder.id) && <StudySetGrid sets={groupedStudySets.get(folder.id)} />}
                        </div>
                    ))}
                    {groupedStudySets.get(undefined)?.length > 0 && (
                        <div className="bg-gray-800 rounded-lg overflow-hidden">
                            <div className="flex items-center p-4">
                                <IconFolder className="w-6 h-6 text-gray-500 mr-3"/>
                                <h2 className="text-xl font-bold text-gray-400">Uncategorized</h2>
                            </div>
                            <StudySetGrid sets={groupedStudySets.get(undefined)} />
                        </div>
                    )}
                </div>
            )}
            
            {folders.length === 0 && studySets.length === 0 && !isLoading && (
                 <div className="text-center py-20 border-2 border-dashed border-gray-700 rounded-lg">
                    <IconFolder className="mx-auto w-12 h-12 text-gray-600 mb-4"/>
                    <h2 className="text-xl font-semibold text-white">Create a folder to get started</h2>
                    <p className="text-gray-400 mt-2">Organize your study sets by subject, class, or topic.</p>
                </div>
            )}

            {isModalOpen && folderForNewSet && <AddSourceModal onClose={() => setIsModalOpen(false)} onAddStudySet={handleAddStudySet} user={user} folderId={folderForNewSet} />}
        </div>
    );
};

// Main App Component
const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [view, setView] = useState<View>('dashboard');
    const [currentStudySetDoc, setCurrentStudySetDoc] = useState<StudySetDocument | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);
            if (!currentUser) {
                setCurrentStudySetDoc(null);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleLogin = async (email: string, pass: string) => {
        await signInWithEmailAndPassword(auth, email, pass);
    };
    
    const handleSignUp = async (email: string, pass: string) => {
        await createUserWithEmailAndPassword(auth, email, pass);
    };

    const handleSelectStudySet = useCallback((studySetDoc: StudySetDocument) => {
        setCurrentStudySetDoc(studySetDoc);
        setView('studySet');
    }, []);

    const handleBackToDashboard = useCallback(() => {
        setCurrentStudySetDoc(null);
        setView('dashboard');
    }, []);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }
    
    if (!user) {
        return <AuthView onLogin={handleLogin} onSignUp={handleSignUp} />;
    }

    const renderContent = () => {
        if (view === 'studySet' && currentStudySetDoc) {
            return <StudySetView studySetDoc={currentStudySetDoc} onBack={handleBackToDashboard} />;
        }
        return <DashboardView user={user} onSelectStudySet={handleSelectStudySet} />;
    };
    
    return <div className="antialiased">{renderContent()}</div>;
};

export default App;
