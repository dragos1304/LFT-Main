import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { StudySet, StudySetDocument, OutlineNode, Keyword, Flashcard, PracticeQuestion, ChatMessage, GradedAnswer, BloomLevel } from '../types';
import { getSocraticTutorResponse, gradeOpenEndedQuestion } from '../services/geminiService';
import { IconArrowLeft, IconChevronDown, IconCube, IconPencil, IconSend, IconSparkles, IconX } from './Icons';

type Tab = 'summary' | 'keywords' | 'flashcards' | 'quiz' | 'links';

// Helper: StarRating component
const StarRating: React.FC<{ score: number; onRate: (rating: number) => void }> = ({ score, onRate }) => {
  return (
    <div className="flex space-x-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          onClick={() => onRate(star)}
          className={`w-5 h-5 cursor-pointer ${star <= score ? 'text-yellow-400' : 'text-gray-600'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
};

// Helper: OutlineViewer component
const OutlineViewer: React.FC<{ node: OutlineNode }> = ({ node }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (!node.children || node.children.length === 0) {
    return <li className="ml-8 list-disc list-inside text-gray-300">{node.title}</li>;
  }

  return (
    <li className="ml-4 my-1">
      <div onClick={() => setIsOpen(!isOpen)} className="flex items-center cursor-pointer text-gray-200 hover:text-white">
        <IconChevronDown className={`w-4 h-4 mr-2 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
        <span>{node.title}</span>
      </div>
      {isOpen && (
        <ul className="pl-4 border-l border-gray-700">
          {node.children.map((child, index) => (
            <OutlineViewer key={index} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
};


// Main StudySetView Component
const StudySetView: React.FC<{ studySetDoc: StudySetDocument; onBack: () => void; }> = ({ studySetDoc, onBack }) => {
  const [studySet, setStudySet] = useState<StudySet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  // Title edit state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(studySetDoc.title);
  
  useEffect(() => {
      const fetchSubCollections = async () => {
          setIsLoading(true);
          const keywordsCol = await getDocs(collection(db, `study_sets/${studySetDoc.id}/keywords`));
          const keywords = keywordsCol.docs.map(d => ({...d.data(), id: d.id})) as Keyword[];

          const flashcardsCol = await getDocs(collection(db, `study_sets/${studySetDoc.id}/flashcards`));
          const flashcards = flashcardsCol.docs.map(d => ({...d.data(), id: d.id})) as Flashcard[];

          const practiceQuestionsCol = await getDocs(collection(db, `study_sets/${studySetDoc.id}/practice_questions`));
          const practiceQuestions = practiceQuestionsCol.docs.map(d => ({...d.data(), id: d.id})) as PracticeQuestion[];
          
          const fullSet = {
              ...studySetDoc,
              keywords,
              flashcards,
              practiceQuestions
          };

          setStudySet(fullSet);
          setCurrentTitle(fullSet.title);
          setIsLoading(false);
      }
      fetchSubCollections();
  }, [studySetDoc]);

  const handleTitleSave = async () => {
    if (!studySet) return;
    const trimmedTitle = currentTitle.trim();
  
    if (trimmedTitle === '' || trimmedTitle === studySet.title) {
      setCurrentTitle(studySet.title); // Reset if invalid or unchanged
      setIsEditingTitle(false);
      return;
    }
  
    try {
      const docRef = doc(db, 'study_sets', studySet.id);
      await updateDoc(docRef, { title: trimmedTitle });
      setStudySet(prev => prev ? { ...prev, title: trimmedTitle } : null);
    } catch (error) {
      console.error("Failed to update title:", error);
      setCurrentTitle(studySet.title); // Revert on error
    } finally {
      setIsEditingTitle(false);
    }
  };


  // Summary Tab State
  const [summary, setSummary] = useState(studySetDoc.summaryText);
  const handleSummarySave = async () => {
      if (summary !== studySet?.summaryText) {
          const docRef = doc(db, 'study_sets', studySetDoc.id);
          await updateDoc(docRef, { summaryText: summary });
          setStudySet(prev => prev ? {...prev, summaryText: summary} : null);
          alert("Summary saved!");
      }
  };

  // Keywords Tab State
  const handleKeywordRate = async (keywordId: string, rating: number) => {
    const docRef = doc(db, `study_sets/${studySetDoc.id}/keywords`, keywordId);
    await updateDoc(docRef, { userImportanceScore: rating });
    
    setStudySet(prev => prev ? ({
        ...prev,
        keywords: prev.keywords.map(k => k.id === keywordId ? {...k, userImportanceScore: rating} : k)
    }) : null);
  };

  // Flashcards Tab State
  const [isTrainerOpen, setIsTrainerOpen] = useState(false);

  // Quiz Tab State
  const [isQuizActive, setIsQuizActive] = useState(false);

  // Links Tab State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAiTyping) return;

    const newUserMessage: ChatMessage = { sender: 'user', text: chatInput };
    const newHistory = [...chatMessages, newUserMessage];
    setChatMessages(newHistory);
    setChatInput('');
    setIsAiTyping(true);

    try {
        const aiResponseText = await getSocraticTutorResponse(newHistory);
        const newAiMessage: ChatMessage = { sender: 'ai', text: aiResponseText };
        setChatMessages(prev => [...prev, newAiMessage]);
    } catch (error) {
        console.error("Error getting AI response", error);
        const errorMessage: ChatMessage = { sender: 'ai', text: 'Sorry, I encountered an error.' };
        setChatMessages(prev => [...prev, errorMessage]);
    } finally {
        setIsAiTyping(false);
    }
  };
  
  const tabs: { id: Tab, label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'keywords', label: 'Exam Keywords' },
    { id: 'flashcards', label: 'Flashcards' },
    { id: 'quiz', label: 'Practice Quiz' },
    { id: 'links', label: 'Conceptual Links' },
  ];

  if (isLoading || !studySet) {
       return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div></div>;
  }

  const renderContent = () => {
    switch (activeTab) {
        case 'summary':
            return <SummaryTab summary={summary} setSummary={setSummary} onSave={handleSummarySave} />;
        case 'keywords':
            return <KeywordsTab keywords={studySet.keywords} onRate={handleKeywordRate} />;
        case 'flashcards':
            return <FlashcardsTab flashcards={studySet.flashcards} onStartTrainer={() => setIsTrainerOpen(true)} />;
        case 'quiz':
            return <QuizTab questions={studySet.practiceQuestions} isActive={isQuizActive} setIsActive={setIsQuizActive} />;
        case 'links':
            return <LinksTab 
                        outline={studySet.hierarchicalOutline}
                        chatMessages={chatMessages}
                        chatInput={chatInput}
                        setChatInput={setChatInput}
                        handleChatSubmit={handleChatSubmit}
                        isAiTyping={isAiTyping}
                        keywords={studySet.keywords}
                    />;
        default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <button onClick={onBack} className="flex items-center text-sm text-indigo-400 hover:text-indigo-300 mb-4">
          <IconArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>
        <div className="flex items-center gap-3 min-h-[48px]">
          {isEditingTitle ? (
            <form onSubmit={(e) => { e.preventDefault(); handleTitleSave(); }} className="flex-grow">
              <input
                value={currentTitle}
                onChange={e => setCurrentTitle(e.target.value)}
                onBlur={handleTitleSave}
                autoFocus
                className="text-4xl font-extrabold bg-gray-700 rounded px-2 w-full outline-none ring-2 ring-indigo-500"
              />
            </form>
          ) : (
            <div onClick={() => setIsEditingTitle(true)} className="flex items-center gap-3 cursor-pointer group">
              <h1 className="text-4xl font-extrabold">{studySet.title}</h1>
              <IconPencil className="w-6 h-6 text-gray-600 group-hover:text-white transition-colors" />
            </div>
          )}
        </div>
      </header>
      <div className="border-b border-gray-700">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-6">
        {renderContent()}
      </div>
      {isTrainerOpen && <FlashcardTrainer flashcards={studySet.flashcards} studySetId={studySet.id} onClose={() => setIsTrainerOpen(false)} />}
    </div>
  );
};


// --- Tab Components ---

const SummaryTab: React.FC<{summary: string; setSummary: (s: string) => void; onSave: () => void}> = ({ summary, setSummary, onSave }) => (
    <div className="bg-gray-800 p-6 rounded-lg">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">AI-Generated Summary</h2>
            <button onClick={onSave} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition">Save Changes</button>
        </div>
        <textarea 
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full h-96 p-4 bg-gray-900 border border-gray-700 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
        />
    </div>
);

const KeywordsTab: React.FC<{ keywords: Keyword[], onRate: (id: string, rating: number) => void }> = ({ keywords, onRate }) => (
    <div className="space-y-4">
        {keywords.map(kw => (
            <div key={kw.id} className="bg-gray-800 p-5 rounded-lg flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-grow">
                    <h3 className="text-xl font-bold text-indigo-400">{kw.text}</h3>
                    <p className="text-gray-300 mt-1">{kw.definition}</p>
                    <p className="text-sm text-gray-500 italic mt-2">"{kw.sourceSentence}"</p>
                </div>
                <div className="flex-shrink-0 flex flex-col items-start md:items-end gap-3 bg-gray-900/50 p-3 rounded-md">
                    <div className="w-full">
                        <label className="text-xs font-semibold text-gray-400">YOUR RATING</label>
                        <StarRating score={kw.userImportanceScore} onRate={(rating) => onRate(kw.id, rating)} />
                    </div>
                    <div className="w-full">
                        <label className="text-xs font-semibold text-gray-400">AI IMPORTANCE</label>
                         <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${kw.aiImportanceScore}%` }}></div>
                        </div>
                    </div>
                     <div className="w-full">
                        <label className="text-xs font-semibold text-gray-400">CROWD SCORE</label>
                        <div className="flex items-center gap-1 text-yellow-400 text-sm font-bold">
                            4.2 <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                            <span className="text-gray-500 text-xs font-normal">(from 12 students)</span>
                        </div>
                    </div>
                </div>
            </div>
        ))}
    </div>
);

const FlashcardsTab: React.FC<{ flashcards: Flashcard[], onStartTrainer: () => void }> = ({ flashcards, onStartTrainer }) => (
    <div>
        <button onClick={onStartTrainer} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg mb-6 transition duration-300">
            Study Deck
        </button>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {flashcards.map(fc => (
                <div key={fc.id} className="bg-gray-800 p-4 rounded-lg">
                    <p className="font-semibold text-gray-300">{fc.frontText}</p>
                    <hr className="border-gray-700 my-2"/>
                    <p className="text-gray-400">{fc.backText}</p>
                </div>
            ))}
        </div>
    </div>
);

const FlashcardTrainer: React.FC<{ flashcards: Flashcard[], studySetId: string, onClose: () => void }> = ({ flashcards, studySetId, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const card = flashcards[currentIndex];

    const handleNext = async (difficulty: 'again' | 'hard' | 'good' | 'easy') => {
        // In a real app, this would update SRS data in Firestore
        console.log(`Card ${card.id} marked as ${difficulty}`);
        // Example of how you would update Firestore:
        // const cardRef = doc(db, `study_sets/${studySetId}/flashcards`, card.id);
        // await updateDoc(cardRef, { srsData: newSrsData });
        
        setIsFlipped(false);
        setCurrentIndex(prev => (prev + 1) % flashcards.length);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg w-full max-w-2xl p-6 relative">
                 <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                    <IconX className="w-6 h-6" />
                </button>
                <div className="aspect-[3/2] flex items-center justify-center rounded-lg cursor-pointer perspective-1000" onClick={() => setIsFlipped(!isFlipped)}>
                    <div className={`w-full h-full preserve-3d transition-transform duration-500 ${isFlipped ? 'rotate-y-180' : ''}`}>
                        <div className="absolute w-full h-full backface-hidden bg-gray-700 rounded-lg p-6 flex items-center justify-center">
                            <p className="text-2xl text-center">{card.frontText}</p>
                        </div>
                        <div className="absolute w-full h-full backface-hidden bg-indigo-900 rounded-lg p-6 flex items-center justify-center rotate-y-180">
                            <p className="text-2xl text-center">{card.backText}</p>
                        </div>
                    </div>
                </div>
                {isFlipped ? (
                    <div className="grid grid-cols-4 gap-4 mt-6">
                        <button onClick={() => handleNext('again')} className="bg-red-600/80 hover:bg-red-600 text-white font-bold py-3 rounded-lg transition-colors">Again</button>
                        <button onClick={() => handleNext('hard')} className="bg-orange-500/80 hover:bg-orange-500 text-white font-bold py-3 rounded-lg transition-colors">Hard</button>
                        <button onClick={() => handleNext('good')} className="bg-green-600/80 hover:bg-green-600 text-white font-bold py-3 rounded-lg transition-colors">Good</button>
                        <button onClick={() => handleNext('easy')} className="bg-blue-600/80 hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition-colors">Easy</button>
                    </div>
                ) : (
                    <div className="mt-6 text-center">
                        <button onClick={() => setIsFlipped(true)} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-8 rounded-lg">Show Answer</button>
                    </div>
                )}
            </div>
        </div>
    );
};

const QuizTab: React.FC<{ questions: PracticeQuestion[], isActive: boolean, setIsActive: (a: boolean) => void }> = ({ questions, isActive, setIsActive }) => {
  const bloomLevels: BloomLevel[] = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'];
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string|null>(null);
  const [gradedResult, setGradedResult] = useState<GradedAnswer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  if(questions.length === 0) {
      return <p className="text-gray-400">No practice questions available for this study set.</p>
  }

  const currentQuestion = questions[currentQuestionIndex];
  
  const handleAnswerSubmit = async () => {
    if (currentQuestion.questionType === 'mcq') {
        const isCorrect = selectedOption === currentQuestion.correctAnswer;
        setGradedResult({ isCorrect, feedbackText: isCorrect ? 'Correct!' : `The correct answer is: ${currentQuestion.correctAnswer}` });
    } else {
        setIsLoading(true);
        const result = await gradeOpenEndedQuestion(currentQuestion, userAnswer);
        setGradedResult(result);
        setIsLoading(false);
    }
  };

  const handleNextQuestion = () => {
    setGradedResult(null);
    setUserAnswer('');
    setSelectedOption(null);
    setCurrentQuestionIndex(prev => (prev + 1) % questions.length);
  }
  
  const startQuiz = () => {
      setCurrentQuestionIndex(0);
      setGradedResult(null);
      setUserAnswer('');
      setSelectedOption(null);
      setIsActive(true);
  }

  if (!isActive) {
    return <button onClick={startQuiz} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg">Start Quiz</button>;
  }

  return (
    <div className="bg-gray-800 p-6 rounded-lg max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-4">
            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${currentQuestion.bloomLevel === 'Analyzing' ? 'bg-red-500/30 text-red-300' : 'bg-blue-500/30 text-blue-300'}`}>{currentQuestion.bloomLevel}</span>
            <span className="text-gray-400">Question {currentQuestionIndex + 1} of {questions.length}</span>
        </div>
        
        <p className="text-xl my-6">{currentQuestion.questionText}</p>

        {currentQuestion.questionType === 'mcq' && (
            <div className="space-y-3">
                {currentQuestion.options?.map(opt => (
                    <button 
                        key={opt}
                        onClick={() => setSelectedOption(opt)}
                        disabled={!!gradedResult}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                            selectedOption === opt ? 'bg-indigo-500/40 border-indigo-500' : 'bg-gray-700/50 border-gray-700 hover:bg-gray-700'
                        } ${gradedResult ? (opt === currentQuestion.correctAnswer ? 'border-green-500' : (opt === selectedOption ? 'border-red-500' : '')) : ''}`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        )}

        {currentQuestion.questionType === 'open_ended' && (
            <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                disabled={!!gradedResult}
                placeholder="Type your answer here..."
                className="w-full h-40 p-3 bg-gray-900 border border-gray-700 rounded-md focus:ring-2 focus:ring-indigo-500"
            />
        )}
        
        {gradedResult && (
            <div className={`mt-4 p-4 rounded-lg border ${gradedResult.isCorrect ? 'bg-green-500/20 border-green-500' : 'bg-red-500/20 border-red-500'}`}>
                <h4 className="font-bold">{gradedResult.isCorrect ? 'Correct!' : 'Needs Improvement'}</h4>
                <p>{gradedResult.feedbackText}</p>
            </div>
        )}

        <div className="mt-6 flex justify-end gap-4">
             {gradedResult ? (
                <button onClick={handleNextQuestion} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg">Next</button>
             ) : (
                <button onClick={handleAnswerSubmit} disabled={isLoading || (currentQuestion.questionType === 'mcq' && !selectedOption) || (currentQuestion.questionType === 'open_ended' && !userAnswer.trim())} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-600 disabled:cursor-not-allowed">
                   {isLoading ? 'Grading...' : 'Submit'}
                </button>
             )}
        </div>
    </div>
  );
};

const LinksTab: React.FC<{outline: OutlineNode, chatMessages: ChatMessage[], chatInput: string, setChatInput: (s:string) => void, handleChatSubmit: (e:React.FormEvent) => void, isAiTyping: boolean, keywords: Keyword[]}> = 
({ outline, chatMessages, chatInput, setChatInput, handleChatSubmit, isAiTyping, keywords }) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4">Top-Down Outline</h2>
            <ul className="text-lg">
                <OutlineViewer node={outline} />
            </ul>
        </div>
        <div className="flex flex-col gap-8">
            <div className="bg-gray-800 p-6 rounded-lg flex-grow flex flex-col h-[60vh]">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><IconSparkles className="text-indigo-400"/> Socratic AI Tutor</h2>
                <div className="flex-grow overflow-y-auto mb-4 pr-2 space-y-4">
                    {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.sender === 'ai' && <div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center font-bold">AI</div>}
                             <div className={`px-4 py-2 rounded-xl max-w-md ${msg.sender === 'user' ? 'bg-indigo-600 rounded-br-none' : 'bg-gray-700 rounded-bl-none'}`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {isAiTyping && <div className="flex items-end gap-2 justify-start"><div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center font-bold">AI</div><div className="px-4 py-2 rounded-xl bg-gray-700 rounded-bl-none">Typing...</div></div>}
                </div>
                <form onSubmit={handleChatSubmit} className="flex gap-2">
                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask a question to find connections..." className="flex-grow p-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-lg disabled:bg-gray-600"><IconSend className="w-6 h-6"/></button>
                </form>
            </div>
            <div className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-2xl font-bold mb-4">3D Model Viewer</h2>
                <p className="text-gray-400 mb-4">Click on a keyword to view a 3D model if available.</p>
                {keywords.find(k => k.text === "Mitochondria") && (
                    <button className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">
                        <IconCube /> View "Mitochondria" in 3D/AR
                    </button>
                )}
            </div>
        </div>
    </div>
);

export default StudySetView;
