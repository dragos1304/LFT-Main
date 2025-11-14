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
  frontText: string;
  backText: string;
  isUserEdited: boolean;
  srsData: {
    interval: number; // days
    easeFactor: number;
    dueDate: string; // ISO string
  };
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
