export type View = 'auth' | 'dashboard' | 'studySet';

export type StudySourceType = 'pdf' | 'youtube' | 'audio' | 'video';

export interface OutlineNode {
  title: string;
  children?: OutlineNode[];
}

export interface Folder {
  id: string;
  userId: string;
  name: string;
  createdAt: string; // ISO string
}

// Represents the document stored in the top-level 'study_sets' collection
export interface StudySetDocument {
  id: string;
  userId: string;
  folderId?: string; // Optional for backward compatibility
  title: string;
  sourceType: StudySourceType;
  sourceName: string;
  summaryText: string;
  hierarchicalOutline: OutlineNode;
}

// Represents the fully hydrated object used within the application state
export interface StudySet extends StudySetDocument {
  keywords: Keyword[];
  flashcards: Flashcard[];
  practiceQuestions: PracticeQuestion[];
  conceptLinks?: ConceptLink[];
}

export interface Keyword {
  id: string;
  text: string;
  definition: string;
  sourceSentence: string;
  aiImportanceScore: number; // 1-100
  userImportanceScore: number; // 1-5
}

export interface Flashcard {
  id: string;
  // FIX: Added studySetId to make flashcards self-contained for updates.
  studySetId: string;
  frontText: string;
  backText: string;
  isUserEdited: boolean;
  
  // Probabilistic Retrieval Scheduler (PRS) data
  stability: number;       // How long a memory lasts (in days). "Storage Strength".
  difficulty: number;    // (Float, 0.0 to 1.0) The inherent, learned difficulty of this card.
  lapses: number;          // The total number of times the user has failed this card.
  dueDate: string;         // ISO Timestamp string for when this card is due for review.
  lastReview: string | null; // ISO Timestamp string of the last review.
  state: 'new' | 'learning' | 'graduated';
}

export type BloomLevel = 'Remembering' | 'Understanding' | 'Applying' | 'Analyzing' | 'Evaluating' | 'Creating';

export interface PracticeQuestion {
  id: string;
  bloomLevel: BloomLevel;
  questionType: 'mcq' | 'open_ended';
  questionText: string;
  options?: string[];
  correctAnswer: string;
aiGradingRubric: string;
}

export interface ConceptLink {
    id: string;
    userExplanation: string; // The "story" from the Socratic chat
}

export interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
}

export interface GradedAnswer {
    isCorrect: boolean;
    feedbackText: string;
}

// Represents a file that has been read into memory to avoid permission issues.
export interface ProcessableFile {
  name: string;
  data: ArrayBuffer;
}
