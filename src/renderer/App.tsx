import React, { useState, useRef, useEffect } from "react";
import Header from "./components/Header";
import SearchBar, { type SearchBarRef } from "./components/SearchBar";
import WordExplanation from "./components/WordExplanation";
import VisualContext from "./components/VisualContext";
import ExamplePhrases from "./components/ExamplePhrases";
import SettingsModal from "./components/SettingsModal";
import AnkiCardCreator from "./components/AnkiCardCreator";
import { handleKeyboardShortcut, getModifierKey } from "./utils/keyboard";
import type {
  SearchResult,
  PaginatedImageResult,
  PaginationOptions,
  ExamplePhrase,
  ImageResult,
  AnkiCard,
  AppSettings,
} from "@shared/types";

function App() {
  const [currentWord, setCurrentWord] = useState<string>("");
  const [searchResult, setSearchResult] = useState<SearchResult | undefined>();
  const [paginatedImages, setPaginatedImages] = useState<
    PaginatedImageResult | undefined
  >();
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImagesLoading, setIsImagesLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnkiCardCreator, setShowAnkiCardCreator] = useState(false);
  const [selectedPhrases, setSelectedPhrases] = useState<ExamplePhrase[]>([]);
  const [selectedImages, setSelectedImages] = useState<ImageResult[]>([]);
  const [ankiMode, setAnkiMode] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const searchBarRef = useRef<SearchBarRef>(null);

  // Load settings on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const appSettings = await window.electronAPI.getSettings();
        setSettings(appSettings);
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };

    loadSettings();
  }, []);

  const handleAnkiModeToggle = () => {
    setAnkiMode(!ankiMode);
    if (ankiMode) {
      // Reset selections when exiting Anki mode
      setSelectedPhrases([]);
      setSelectedImages([]);
    }
  };

  const handleCreateAnkiCards = () => {
    if (selectedPhrases.length === 0) {
      alert("Please select at least one phrase to create Anki cards.");
      return;
    }
    setShowAnkiCardCreator(true);
  };

  const handleAnkiCardsCreated = (cards: AnkiCard[]) => {
    console.log(`Successfully created ${cards.length} Anki cards`);
    // Reset selections after successful creation
    setSelectedPhrases([]);
    setSelectedImages([]);
    setAnkiMode(false);
  };

  const handleSearch = async (word: string) => {
    if (!word.trim()) return;

    setIsLoading(true);
    setIsImagesLoading(true);
    setCurrentWord(word);
    setExplanation(null); // Reset explanation
    setPaginatedImages(undefined); // Reset pagination
    setSelectedPhrases([]); // Reset Anki selections
    setSelectedImages([]);
    setAnkiMode(false);

    try {
      // Add to search history
      await window.electronAPI.addSearch(word);

      // Fetch images, phrases, and explanation in parallel with independent error handling
      const [images, phrases, wordExplanation] = await Promise.allSettled([
        window.electronAPI.searchImages(word, { page: 1, perPage: 6 }),
        window.electronAPI.generatePhrases(word),
        window.electronAPI.generateExplanation(word),
      ]);

      // Handle images result
      const imageResults =
        images.status === "fulfilled"
          ? images.value
          : {
              images: [],
              currentPage: 1,
              totalPages: 1,
              hasNext: false,
              hasPrevious: false,
            };

      // Handle phrases result
      const phraseResults = phrases.status === "fulfilled" ? phrases.value : [];

      // Handle explanation result
      const explanationResult =
        wordExplanation.status === "fulfilled" ? wordExplanation.value : null;

      // Log any failures for debugging
      if (images.status === "rejected") {
        console.error("Images search failed:", images.reason);
      }
      if (phrases.status === "rejected") {
        console.error("Phrases generation failed:", phrases.reason);
      }
      if (wordExplanation.status === "rejected") {
        console.error("Explanation generation failed:", wordExplanation.reason);
      }

      setPaginatedImages(imageResults);
      setSearchResult({
        word,
        images: imageResults.images,
        phrases: phraseResults,
      });
      setExplanation(explanationResult);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
      setIsImagesLoading(false);
    }
  };

  const handlePageChange = async (page: number) => {
    if (!currentWord || isImagesLoading) return;

    setIsImagesLoading(true);

    try {
      const imageResult = await window.electronAPI.searchImages(currentWord, {
        page,
        perPage: 6,
      });

      setPaginatedImages(imageResult);
      setSearchResult((prev) =>
        prev
          ? {
              ...prev,
              images: imageResult.images,
            }
          : undefined,
      );
    } catch (error) {
      console.error("Page change failed:", error);
    } finally {
      setIsImagesLoading(false);
    }
  };

  // Handle focus search shortcut (Cmd/Ctrl + K)
  const handleFocusSearch = () => {
    searchBarRef.current?.focus();
  };

  // Handle paste and search shortcut (Cmd/Ctrl + P)
  const handlePasteAndSearch = async () => {
    try {
      // Check if clipboard API is available
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        console.warn("Clipboard API not available");
        return;
      }

      const clipboardText = await navigator.clipboard.readText();
      const trimmedText = clipboardText.trim();

      if (trimmedText) {
        // Set the search query
        searchBarRef.current?.setQuery(trimmedText);
        searchBarRef.current?.focus();

        // Automatically trigger search if the text looks like a single word or short phrase
        if (
          trimmedText.length > 0 &&
          trimmedText.length < 100 &&
          !trimmedText.includes("\n")
        ) {
          handleSearch(trimmedText);
        }
      }
    } catch (error) {
      console.error("Failed to read clipboard:", error);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input field (except for our paste shortcut)
      const target = event.target as HTMLElement;
      const isInInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true";

      if (isInInput && event.key.toLowerCase() !== "p") {
        return;
      }

      const modifierKey = getModifierKey();

      handleKeyboardShortcut(event, [
        {
          key: "k",
          modifierKey: modifierKey as "metaKey" | "ctrlKey",
          handler: handleFocusSearch,
        },
        {
          key: "p",
          modifierKey: modifierKey as "metaKey" | "ctrlKey",
          handler: handlePasteAndSearch,
        },
      ]);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="min-h-screen bg-surface-100 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Header onSettingsClick={() => setShowSettings(true)} />

        <div className="mt-8">
          <SearchBar
            ref={searchBarRef}
            onSearch={handleSearch}
            isLoading={isLoading}
          />
        </div>

        {currentWord && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">"{currentWord}"</h2>

              {/* Anki Controls */}
              {settings?.anki?.enabled && searchResult && (
                <div className="flex items-center space-x-3">
                  {ankiMode && (
                    <button
                      onClick={handleCreateAnkiCards}
                      disabled={selectedPhrases.length === 0}
                      className="px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                      </svg>
                      <span>Create Anki Cards ({selectedPhrases.length})</span>
                    </button>
                  )}

                  <button
                    onClick={handleAnkiModeToggle}
                    className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 ${
                      ankiMode
                        ? "bg-red-500 hover:bg-red-600 text-white"
                        : "bg-surface-300 hover:bg-surface-400 text-white"
                    }`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    <span>{ankiMode ? "Exit Anki Mode" : "Anki Mode"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Word Explanation Section */}
            <WordExplanation
              word={currentWord}
              explanation={explanation}
              isLoading={isLoading}
            />

            {/* Images and Phrases Grid */}
            {searchResult && paginatedImages && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <VisualContext
                  images={searchResult.images}
                  word={currentWord}
                  isLoading={isImagesLoading}
                  currentPage={paginatedImages.currentPage}
                  totalPages={paginatedImages.totalPages}
                  onPageChange={handlePageChange}
                  selectedImages={selectedImages}
                  onImageSelection={setSelectedImages}
                  showAnkiControls={ankiMode}
                />

                <ExamplePhrases
                  phrases={searchResult.phrases}
                  isLoading={isLoading}
                  selectedPhrases={selectedPhrases}
                  onPhraseSelection={setSelectedPhrases}
                  showAnkiControls={ankiMode}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <AnkiCardCreator
        word={currentWord}
        explanation={explanation}
        selectedPhrases={selectedPhrases}
        selectedImages={selectedImages}
        isOpen={showAnkiCardCreator}
        onClose={() => setShowAnkiCardCreator(false)}
        onCreateCard={handleAnkiCardsCreated}
      />
    </div>
  );
}

export default App;
