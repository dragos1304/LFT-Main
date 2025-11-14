import { GoogleGenAI, Type } from "@google/genai";
import * as pdfjsLib from 'pdfjs-dist';
import type { StudySet, GradedAnswer, ChatMessage, PracticeQuestion, StudySourceType, OutlineNode, ProcessableFile } from '../types';

// The workerSrc property needs to be specified for pdf.js to work.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.mjs`;

// In a real production app, the API key should be handled by a backend server/function
// to avoid exposing it on the client-side. We initialize it here for demonstration.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


/**
 * Extracts text content from a PDF file's ArrayBuffer.
 */
const getTextFromPdf = async (file: ProcessableFile): Promise<string> => {
    const pdf = await pdfjsLib.getDocument({ data: file.data }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n';
    }
    return fullText;
};


// --- LIVE API CALLS ---

const studySetSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'A concise, descriptive title for the study material, under 10 words.' },
    summary_text: { type: Type.STRING, description: 'A detailed, multi-paragraph summary of the entire text.' },
    hierarchical_outline: {
      type: Type.OBJECT,
      description: 'A nested JSON object representing the document structure. Each node has a "title" and an optional "children" array of nodes.',
      properties: {
        title: { type: Type.STRING },
        children: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
             properties: {
                title: { type: Type.STRING },
                 children: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                           title: { type: Type.STRING },
                        },
                        required: ['title']
                    }
                 }
             },
             required: ['title']
          }
        }
      },
      required: ['title']
    },
    keywords: {
      type: Type.ARRAY,
      description: 'A list of 5-10 essential keywords or concepts.',
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: 'The keyword itself.' },
          definition: { type: Type.STRING, description: 'A clear definition of the keyword.' },
          source_sentence: { type: Type.STRING, description: 'The original sentence from the text where the keyword appeared.'},
          ai_importance_score: { type: Type.INTEGER, description: 'A score from 1-100 indicating the keyword\'s importance.' }
        },
        required: ['text', 'definition', 'source_sentence', 'ai_importance_score']
      }
    },
    flashcards: {
      type: Type.ARRAY,
      description: 'A list of at least 5 question/answer flashcards for spaced repetition.',
      items: {
        type: Type.OBJECT,
        properties: {
          front_text: { type: Type.STRING, description: 'The question or front side of the card.' },
          back_text: { type: Type.STRING, description: 'The answer or back side of the card.' }
        },
        required: ['front_text', 'back_text']
      }
    },
    practice_questions: {
      type: Type.ARRAY,
      description: 'A list of 3-5 practice questions of varying difficulty (Bloom\'s Taxonomy).',
      items: {
        type: Type.OBJECT,
        properties: {
          bloom_level: { type: Type.STRING, enum: ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'] },
          question_type: { type: Type.STRING, enum: ['mcq', 'open_ended'] },
          question_text: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Array of 4 strings for MCQ options.' },
          correct_answer: { type: Type.STRING, description: 'The correct option for MCQ or a model answer for open_ended.' },
          ai_grading_rubric: { type: Type.STRING, description: 'A simple rubric for an AI to grade an open-ended answer.' }
        },
        required: ['bloom_level', 'question_type', 'question_text', 'correct_answer', 'ai_grading_rubric']
      }
    }
  },
  required: ['title', 'summary_text', 'hierarchical_outline', 'keywords', 'flashcards', 'practice_questions']
};


/**
 * Calls the Gemini API to process an uploaded source.
 */
export const processNewSource = async (file: ProcessableFile | string, type: StudySourceType): Promise<StudySet> => {
  if (type !== 'pdf') {
      // Temporarily disable non-PDF sources until they are implemented
      throw new Error("This feature is not yet implemented. Please upload a PDF.");
  }
  
  if (typeof file === 'string') {
      throw new Error("Invalid file format for PDF processing.");
  }

  const pdfText = await getTextFromPdf(file);
  const sourceName = file.name;

  const prompt = `
    You are an expert learning assistant. Analyze the following text extracted from a document named "${sourceName}".
    Your task is to generate a complete and comprehensive study set based on its content.
    The response must be a single, valid JSON object that strictly adheres to the provided schema.
    Do not include any markdown formatting like \`\`\`json.
    
    Text Content:
    ---
    ${pdfText.substring(0, 20000)}
    ---
  `;
  
  console.log("SENDING PROMPT TO GEMINI API...");

  const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
          responseMimeType: 'application/json',
          responseSchema: studySetSchema,
      }
  });

  const rawText = response.text;
  // Robustly parse the JSON, removing potential markdown wrappers that the model might add.
  const jsonText = rawText.trim().replace(/^```json/, '').replace(/```$/, '').trim();
  const jsonResponse = JSON.parse(jsonText);


  // The API returns the core data, we need to add the metadata
  const fullStudySet: Omit<StudySet, 'id' | 'userId'> = {
      title: jsonResponse.title,
      sourceType: type,
      sourceName: sourceName,
      summaryText: jsonResponse.summary_text,
      hierarchicalOutline: jsonResponse.hierarchical_outline,
      keywords: jsonResponse.keywords.map((kw: any) => ({
          ...kw,
          userImportanceScore: 0 // Default value
      })),
      flashcards: jsonResponse.flashcards.map((fc: any) => ({
          ...fc,
          isUserEdited: false, // Default value
          srsData: { interval: 1, easeFactor: 2.5, dueDate: new Date().toISOString() } // Default SRS
      })),
      practiceQuestions: jsonResponse.practice_questions,
  };

  // The userId and id will be added in App.tsx when saving to Firestore.
  // We cast here because we know the final object will be a complete StudySet.
  return fullStudySet as StudySet;
};


/**
 * Simulates using the Gemini API to grade an open-ended question.
 */
export const gradeOpenEndedQuestion = (question: PracticeQuestion, userAnswer: string): Promise<GradedAnswer> => {
  console.log(`Grading answer for: "${question.questionText}"`);
  const prompt = `
    You are an AI teaching assistant. Grade the user's answer based on the provided rubric.
    Question: "${question.questionText}"
    Grading Rubric: "${question.aiGradingRubric}"
    User's Answer: "${userAnswer}"
    
    Return a single, valid JSON object with two keys: "is_correct" (boolean) and "feedback_text" (string).
  `;
  console.log("SIMULATED GRADING PROMPT:", prompt);

  return new Promise(resolve => {
    setTimeout(() => {
      const isCorrect = userAnswer.toLowerCase().includes('light');
      resolve({
        isCorrect: isCorrect,
        feedbackText: isCorrect
          ? "Excellent! You correctly identified that light is essential for the initial energy-capturing reactions."
          : "You're on the right track, but remember to mention the role of light in the light-dependent reactions which produce the energy needed for the Calvin Cycle."
      });
    }, 1500);
  });
};

/**
 * Simulates a multi-turn chat with a Socratic AI tutor.
 */
export const getSocraticTutorResponse = (chatHistory: ChatMessage[]): Promise<string> => {
    const prompt = `
    System Prompt: You are a Socratic tutor. Your goal is to help the user discover connections between concepts in their study set. Ask guiding questions, do not give the answer directly.
    
    Chat History:
    ${chatHistory.map(msg => `${msg.sender}: ${msg.text}`).join('\n')}
    AI:
  `;
   console.log("SIMULATED SOCRATIC TUTOR PROMPT:", prompt);

  return new Promise(resolve => {
    setTimeout(() => {
        const lastUserMessage = chatHistory[chatHistory.length-1]?.text.toLowerCase() || "";
        let response = "That's an interesting thought. How do you think that relates to the energy a plant needs to live?";
        if(lastUserMessage.includes("atp")) {
            response = "You mentioned ATP. Where in the process is that generated, and where is it used? What does that suggest about the flow of energy?";
        } else if (lastUserMessage.includes("chloroplast")) {
            response = "Good, you've identified the location. But why that location? What is special about the chloroplast that makes it suitable for this job?";
        }
        resolve(response);
    }, 1200);
  });
};