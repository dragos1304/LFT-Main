export type View = 'auth' | 'dashboard' | 'studySet' | 'progress';

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
  classGroupId?: string; // For collaborative features
  title: string;
  sourceType: StudySourceType;
  sourceName: string;
  sourceUrl?: string; // URL to the original file in Firebase Storage
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

export interface HighlightLog {
  highlighted_at: string; // ISO string
  class_group_id: string;
}

// --- PDF Highlighter Types ---
export interface HighlightPosition {
  boundingRect: { x1: number; y1: number; x2: number; y2: number; width: number; height: number; pageNumber: number };
  rects: Array<{ x1: number; y1: number; x2: number; y2: number; width: number; height: number; pageNumber: number }>;
  pageNumber: number;
}

export interface Highlight {
  id: string; // Firestore document ID
  content: { text: string };
  position: HighlightPosition;
}