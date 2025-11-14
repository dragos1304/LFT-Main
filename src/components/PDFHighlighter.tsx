import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, setDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import type { StudySet, Keyword, Flashcard, Highlight, HighlightPosition } from '../types';
import { generateFlashcardForConcept } from '../services/geminiService';
import { IconSparkles } from './Icons';

import {
  PdfLoader,
  PdfHighlighter,
  Tip,
  Highlight as PdfHighlightComponent,
  Popup,
  AreaHighlight,
} from 'react-pdf-highlighter';

interface PDFHighlighterProps {
    user: User;
    studySet: StudySet;
}

const PDFHighlighter: React.FC<PDFHighlighterProps> = ({ user, studySet }) => {
    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // FIX: Adapt the highlights to match the structure expected by react-pdf-highlighter (IHighlight).
    // The library requires a `comment` property, which is not part of our data model.
    // We add a dummy comment object to satisfy the type requirement for rendering.
    const highlightsForRenderer = useMemo(() => {
        return highlights.map(highlight => ({
            ...highlight,
            comment: { text: '', emoji: '' },
        }));
    }, [highlights]);

    useEffect(() => {
        const highlightsRef = collection(db, `study_sets/${studySet.id}/highlights`);
        const unsubscribe = onSnapshot(highlightsRef, (snapshot) => {
            const loadedHighlights = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Highlight));
            setHighlights(loadedHighlights);
        });
        return () => unsubscribe();
    }, [studySet.id]);

    const processHighlightText = async (text: string) => {
        const textToSave = text.trim();
        if (!textToSave) return;
        
        setIsLoading(true);

        const classGroupId = studySet.classGroupId || 'default_class_group';
        const keywordsRef = collection(db, `study_sets/${studySet.id}/keywords`);
        const q = query(keywordsRef, where("text", "==", textToSave));
        
        try {
            const querySnapshot = await getDocs(q);
            let keywordId: string;

            if (!querySnapshot.empty) { // Keyword exists
                keywordId = querySnapshot.docs[0].id;
            } else { // New keyword
                const newKeyword: Omit<Keyword, 'id'> = {
                    text: textToSave,
                    definition: "User-highlighted concept. AI definition pending.",
                    sourceSentence: "Highlighted directly from the document by a user.",
                    aiImportanceScore: 75,
                    userImportanceScore: 5,
                };
                const newKeywordRef = await addDoc(keywordsRef, newKeyword);
                keywordId = newKeywordRef.id;

                const flashcardData = await generateFlashcardForConcept(textToSave);
                const newFlashcard: Omit<Flashcard, 'id' | 'studySetId'> = {
                    ...flashcardData,
                    isUserEdited: false,
                    stability: 0,
                    difficulty: 0.6,
                    lapses: 0,
                    dueDate: new Date().toISOString(),
                    lastReview: null,
                    state: 'new',
                };
                await addDoc(collection(db, `study_sets/${studySet.id}/flashcards`), newFlashcard);
            }

            const highlightLogRef = doc(db, `study_sets/${studySet.id}/keywords/${keywordId}/Highlight_Log`, user.uid);
            await setDoc(highlightLogRef, {
                highlighted_at: new Date().toISOString(),
                class_group_id: classGroupId,
            });

        } catch (error) {
            console.error("Error processing highlight text:", error);
        } finally {
            setIsLoading(false);
        }
    };
    
    const addHighlight = async (highlight: { content: { text: string }; position: HighlightPosition }) => {
        // Save the positional highlight to its own collection
        await addDoc(collection(db, `study_sets/${studySet.id}/highlights`), {
            content: highlight.content,
            position: highlight.position,
        });

        // Then process the text for keywords and flashcards
        await processHighlightText(highlight.content.text);
    };

    if (!studySet.sourceUrl) {
        return (
            <div className="bg-gray-800 p-6 rounded-lg text-center">
                <h2 className="text-xl font-bold mb-2">PDF Not Available</h2>
                <p className="text-gray-400">The original PDF for this study set could not be found.</p>
            </div>
        );
    }
    
    return (
        <div className="bg-gray-800 p-2 rounded-lg relative w-full h-[80vh]">
            <PdfLoader url={studySet.sourceUrl} beforeLoad={<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto mt-20"></div>}>
                {(pdfDocument) => (
                    <PdfHighlighter
                        pdfDocument={pdfDocument}
                        enableAreaSelection={(event) => event.altKey}
                        onScrollChange={() => {}}
                        scrollRef={(scrollTo) => {}}
                        onSelectionFinished={(
                            position,
                            content,
                            hideTip,
                            transformSelection
                        ) => (
                            <Tip
                                onOpen={transformSelection}
                                onConfirm={() => {
                                    // FIX: The `content.text` from the library is optional, and the `position` object
                                    // needs to be transformed to match our internal `HighlightPosition` type.
                                    if (content.text) {
                                        const transformedPosition: HighlightPosition = {
                                            boundingRect: {
                                                ...position.boundingRect,
                                                pageNumber: position.pageNumber,
                                            },
                                            rects: position.rects.map((rect) => ({
                                                ...rect,
                                                pageNumber: position.pageNumber,
                                            })),
                                            pageNumber: position.pageNumber,
                                        };
                                        addHighlight({
                                            content: { text: content.text },
                                            position: transformedPosition,
                                        });
                                    }
                                    hideTip();
                                }}
                            />
                        )}
                        highlightTransform={(
                            highlight,
                            index,
                            setTip,
                            hideTip,
                            viewportToScaled,
                            screenshot,
                            isScrolledTo
                        ) => {
                            // FIX: Cast PdfHighlightComponent to `any` to work around a potential
                            // issue with the library's TypeScript definitions that causes a type error.
                            const AnyPdfHighlightComponent = PdfHighlightComponent as any;
                             const component = highlight.position.rects.length > 1 
                                ? <AreaHighlight
                                    isScrolledTo={isScrolledTo}
                                    highlight={highlight}
                                    onChange={() => {}}
                                  />
                                : <AnyPdfHighlightComponent
                                    isScrolledTo={isScrolledTo}
                                    highlight={highlight}
                                    onChange={() => {}}
                                  />
                            return (
                            <Popup
                                popupContent={<></>}
                                onMouseOver={(popupContent) =>
                                setTip(highlight, (highlight) => popupContent)
                                }
                                onMouseOut={hideTip}
                                key={index}
                                children={component}
                            />
                            )
                        }}
                        highlights={highlightsForRenderer}
                    />
                )}
            </PdfLoader>
        </div>
    );
};

export default PDFHighlighter;