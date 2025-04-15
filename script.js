document.addEventListener('DOMContentLoaded', () => {
    // ==== DOM Elements ====
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyButton = document.getElementById('save-key-button');
    const modeToggleButton = document.getElementById('mode-toggle-button');
    const ttsToggleButton = document.getElementById('tts-toggle-button');
    const clearHistoryButton = document.getElementById('clear-history-button');
    const transcriptDiv = document.getElementById('transcript');
    const transcriptContainer = document.getElementById('transcript-container');
    const textInputModeDiv = document.getElementById('text-input-mode');
    const textInput = document.getElementById('text-input');
    const sendButton = document.getElementById('send-button');
    const voiceInputModeDiv = document.getElementById('voice-input-mode');
    const micButton = document.getElementById('mic-button');
    const listeningIndicator = document.getElementById('listening-indicator');
    const errorDisplay = document.getElementById('error-display');

    // ==== CREDENTIALS SECTION ====
    // API key is stored in session storage for security reasons (cleared when browser tab closes)
    // Security Note: Storing API keys client-side is inherently insecure for production.
    // A backend proxy is the recommended approach for protecting keys.
    let OPENAI_API_KEY = sessionStorage.getItem('openai_api_key') || "";
    // =============================

    // ==== OpenAI Models ====
    const CHAT_MODEL = "gpt-4o"; // Or "gpt-4-turbo", "gpt-4.1" - verify latest/preferred model
    const TTS_MODEL = "tts-1"; // Or "tts-1-hd", "gpt-4o-mini-tts" - verify model
    const STT_MODEL = "whisper-1"; // Or "gpt-4o-mini-transcribe" - verify model

    // ==== System Prompt ====
    const SYSTEM_PROMPT = "You are a helpful assistant."; // Editable in code

    // ==== State Variables ====
    let conversationHistory = []; // Array of { role: 'user'/'assistant', content: 'message', timestamp: Date }
    let isVoiceMode = false;
    let isTTSEnabled = true;
    let isListening = false;
    let mediaRecorder;
    let audioChunks = [];

    // ==== Initialization ====
    function initializeApp() {
        loadApiKey();
        loadHistory();
        renderHistory();
        updateUI();
        attachEventListeners();
        if (!OPENAI_API_KEY) {
            displayError("Please enter your OpenAI API Key.");
        }
    }

    function loadApiKey() {
        OPENAI_API_KEY = sessionStorage.getItem('openai_api_key') || "";
        if (OPENAI_API_KEY) {
            apiKeyInput.value = "********"; // Mask if loaded
            apiKeyInput.disabled = true;
            saveKeyButton.textContent = "Key Saved";
            saveKeyButton.disabled = true;
        }
    }

    function saveApiKey() {
        const key = apiKeyInput.value.trim();
        if (key) {
            OPENAI_API_KEY = key;
            sessionStorage.setItem('openai_api_key', key);
            apiKeyInput.value = "********"; // Mask after saving
            apiKeyInput.disabled = true;
            saveKeyButton.textContent = "Key Saved";
            saveKeyButton.disabled = true;
            displayError(""); // Clear previous errors
            console.log("API Key saved to session storage.");
        } else {
            displayError("Please enter a valid API Key.");
        }
    }

    function loadHistory() {
        const storedHistory = localStorage.getItem('conversationHistory');
        if (storedHistory) {
            try {
                conversationHistory = JSON.parse(storedHistory);
                // Convert string timestamps back to Date objects
                conversationHistory = conversationHistory.map(msg => ({
                    ...msg,
                    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date() // Handle potential missing timestamps
                }));
            } catch (error) {
                console.error("Failed to parse conversation history:", error);
                localStorage.removeItem('conversationHistory'); // Clear corrupted data
                conversationHistory = [];
            }
        } else {
            conversationHistory = [];
        }
        console.log("History loaded:", conversationHistory);
    }

    function saveHistory() {
        try {
            localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
        } catch (error) {
            console.error("Failed to save conversation history:", error);
            displayError("Error saving history (LocalStorage might be full).");
        }
    }

    function renderHistory() {
        transcriptDiv.innerHTML = ''; // Clear existing messages
        conversationHistory.forEach(message => {
            addMessageToTranscript(message.role, message.content, message.isMarker);
        });
        scrollToBottom();
    }

    function addMessageToTranscript(role, content, isMarker = false) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        if (isMarker) {
            messageElement.classList.add('date-marker');
        } else if (role === 'user') {
            messageElement.classList.add('user-message');
        } else if (role === 'assistant') {
            messageElement.classList.add('assistant-message');
        }
        messageElement.textContent = content;
        transcriptDiv.appendChild(messageElement);
        scrollToBottom();
    }

     function addDailyMarkerIfNeeded() {
        if (conversationHistory.length === 0) return; // No history yet

        const lastMessage = conversationHistory[conversationHistory.length - 1];
        const lastMessageDate = lastMessage.timestamp;
        const now = new Date();

        // Check if the last message was on a different day (ignoring time)
        if (lastMessageDate.toDateString() !== now.toDateString()) {
            const dateString = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const timeString = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            const markerContent = `It is now ${timeString}, on ${dateString}.`;

            const markerMessage = {
                role: 'system', // Use system or a custom role if needed
                content: markerContent,
                timestamp: now,
                isMarker: true
            };
            conversationHistory.push(markerMessage);
            addMessageToTranscript(markerMessage.role, markerMessage.content, true);
            // No need to save history here, it will be saved after the user message
        }
    }


    function scrollToBottom() {
        // Use setTimeout to allow the DOM to update before scrolling
        setTimeout(() => {
            transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
        }, 0);
    }

    function updateUI() {
        // Mode Toggle
        if (isVoiceMode) {
            modeToggleButton.textContent = 'Switch to Text Mode';
            textInputModeDiv.classList.add('hidden');
            voiceInputModeDiv.classList.remove('hidden');
        } else {
            modeToggleButton.textContent = 'Switch to Voice Mode';
            textInputModeDiv.classList.remove('hidden');
            voiceInputModeDiv.classList.add('hidden');
        }

        // TTS Toggle
        ttsToggleButton.textContent = isTTSEnabled ? 'Disable TTS' : 'Enable TTS';

        // Mic Button & Indicator
        if (isListening) {
            micButton.textContent = 'Stop';
            micButton.classList.add('listening');
            listeningIndicator.classList.remove('hidden');
        } else {
            micButton.textContent = 'Start';
            micButton.classList.remove('listening');
            listeningIndicator.classList.add('hidden');
        }
    }

    function displayError(message) {
        errorDisplay.textContent = message;
        // Optional: Clear error after some time
        // setTimeout(() => { errorDisplay.textContent = ''; }, 5000);
    }

    // ==== Event Listeners ====
    function attachEventListeners() {
        saveKeyButton.addEventListener('click', saveApiKey);
        apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') saveApiKey();
        });

        modeToggleButton.addEventListener('click', () => {
            isVoiceMode = !isVoiceMode;
            // Stop listening if switching away from voice mode
            if (!isVoiceMode && isListening) {
                stopListening();
            }
            updateUI();
        });

        ttsToggleButton.addEventListener('click', () => {
            isTTSEnabled = !isTTSEnabled;
            updateUI();
        });

        clearHistoryButton.addEventListener('click', () => {
            if (confirm("Are you sure you want to clear the entire conversation history?")) {
                conversationHistory = [];
                localStorage.removeItem('conversationHistory');
                renderHistory();
                displayError("History cleared.");
            }
        });

        sendButton.addEventListener('click', handleTextInput);
        textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter, allow Shift+Enter for newline
                e.preventDefault(); // Prevent default newline behavior
                handleTextInput();
            }
        });

        micButton.addEventListener('click', () => {
            if (!isListening) {
                startListening();
            } else {
                stopListening();
            }
        });
    }

    // ==== Core Logic ====

    function handleTextInput() {
        const messageText = textInput.value.trim();
        if (messageText) {
            handleUserMessage(messageText);
            textInput.value = ''; // Clear input field
            textInput.style.height = 'auto'; // Reset height after sending
            textInput.style.height = textInput.scrollHeight + 'px'; // Adjust if needed
        }
    }

     async function handleUserMessage(text) {
        if (!OPENAI_API_KEY) {
            displayError("API Key not set. Please enter your OpenAI API Key.");
            return;
        }
        displayError(""); // Clear previous errors

        addDailyMarkerIfNeeded(); // Add marker before adding the user message

        const userMessage = { role: 'user', content: text, timestamp: new Date() };
        conversationHistory.push(userMessage);
        addMessageToTranscript(userMessage.role, userMessage.content);
        saveHistory();

        // Disable input while processing
        setInputsDisabled(true);

        try {
            await getOpenAIResponse();
        } catch (error) {
            console.error("Error getting OpenAI response:", error);
            displayError(`Error: ${error.message || 'Failed to get response'}`);
            // Optionally add an error message to the transcript
             addMessageToTranscript('system', `Error communicating with OpenAI: ${error.message}`, true);
        } finally {
             setInputsDisabled(false); // Re-enable inputs
        }
    }

    async function getOpenAIResponse() {
        // Prepare messages for the API, including the system prompt
        const messagesForAPI = [
            { role: "system", content: SYSTEM_PROMPT },
            // Include only user/assistant messages from history for the API call
            ...conversationHistory
                .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                .map(msg => ({ role: msg.role, content: msg.content }))
        ];

        console.log("Sending to OpenAI Chat:", messagesForAPI);

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: CHAT_MODEL,
                    messages: messagesForAPI,
                    // max_tokens: 150 // Optional: Limit response length
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("OpenAI API Error:", errorData);
                throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Received from OpenAI Chat:", data);

            if (data.choices && data.choices.length > 0) {
                const assistantMessageContent = data.choices[0].message.content.trim();
                const assistantMessage = {
                    role: 'assistant',
                    content: assistantMessageContent,
                    timestamp: new Date()
                };

                conversationHistory.push(assistantMessage);
                addMessageToTranscript(assistantMessage.role, assistantMessage.content);
                saveHistory();

                if (isTTSEnabled) {
                    await speakText(assistantMessageContent);
                }
            } else {
                throw new Error("No response choices received from OpenAI.");
            }

        } catch (error) {
            console.error("Error fetching OpenAI Chat completion:", error);
            displayError(`Chat API Error: ${error.message}`);
             // Optionally add an error message to the transcript
             addMessageToTranscript('system', `Error getting chat response: ${error.message}`, true);
        }
    }

    async function speakText(text) {
        if (!OPENAI_API_KEY) {
            displayError("API Key not set for TTS.");
            return;
        }
        if (!text) return;

        console.log("Sending to OpenAI TTS:", text.substring(0, 100) + "..."); // Log beginning of text
        setInputsDisabled(true); // Disable input while speaking

        try {
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: TTS_MODEL,
                    input: text,
                    voice: 'alloy' // Choose a voice: alloy, echo, fable, onyx, nova, shimmer
                    // response_format: 'mp3' // Default is mp3
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("OpenAI TTS API Error:", errorData);
                throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            // Play audio and re-enable inputs when finished
            audio.play();
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                setInputsDisabled(false); // Re-enable after speech finishes
                console.log("TTS playback finished.");
            };
            audio.onerror = (err) => {
                 console.error("Error playing TTS audio:", err);
                 displayError("Error playing audio.");
                 URL.revokeObjectURL(audioUrl);
                 setInputsDisabled(false); // Re-enable on error too
            };


        } catch (error) {
            console.error("Error fetching OpenAI TTS:", error);
            displayError(`TTS API Error: ${error.message}`);
            setInputsDisabled(false); // Re-enable on fetch error
        }
    }

    async function startListening() {
        if (!OPENAI_API_KEY) {
            displayError("API Key not set. Cannot start listening.");
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            displayError("Microphone access (getUserMedia) is not supported by your browser.");
            return;
        }

        displayError(""); // Clear previous errors
        audioChunks = []; // Reset audio chunks

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Log the selected audio track to potentially identify Bluetooth mic
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
                console.log("Using audio input device:", audioTracks[0].label || "Default Mic");
            }

            // Use 'audio/webm' or 'audio/ogg' if available, as they are often well-supported
            // MP3 recording directly in the browser is tricky. Send WAV or WEBM to OpenAI.
            const options = { mimeType: 'audio/webm;codecs=opus' }; // Try webm first
             try {
                mediaRecorder = new MediaRecorder(stream, options);
            } catch (e1) {
                console.warn("WebM Opus mimeType failed, trying default:", e1.message);
                try {
                    // Fallback to browser default (might be WAV or other)
                    mediaRecorder = new MediaRecorder(stream);
                } catch (e2) {
                     console.error("Failed to create MediaRecorder:", e2);
                     displayError("Could not start recording. Check microphone permissions and browser support.");
                     return; // Exit if MediaRecorder fails completely
                }
            }

            console.log("Using mimeType:", mediaRecorder.mimeType);


            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                    console.log("Audio chunk received, size:", event.data.size);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("Recording stopped. Total chunks:", audioChunks.length);
                stream.getTracks().forEach(track => track.stop()); // Stop the mic stream track

                if (audioChunks.length === 0) {
                    console.warn("No audio data recorded.");
                    displayError("No audio data was captured.");
                    setInputsDisabled(false); // Re-enable inputs
                    return;
                }

                // Determine file extension based on mimeType
                let fileExtension = 'webm'; // Default assumption
                if (mediaRecorder.mimeType.includes('wav')) {
                    fileExtension = 'wav';
                } else if (mediaRecorder.mimeType.includes('ogg')) {
                    fileExtension = 'ogg';
                } // Add more checks if needed for other types

                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
                const audioFile = new File([audioBlob], `recording.${fileExtension}`, { type: mediaRecorder.mimeType });

                console.log(`Created audio blob, size: ${audioBlob.size}, type: ${audioBlob.type}`);
                audioChunks = []; // Clear chunks after creating blob

                // Disable inputs while transcribing
                setInputsDisabled(true);
                displayError("Transcribing audio..."); // Indicate processing

                try {
                    await transcribeAudio(audioFile);
                } catch (error) {
                    console.error("Transcription error:", error);
                    displayError(`Transcription failed: ${error.message}`);
                } finally {
                    // Re-enable inputs should happen within transcribeAudio or its downstream calls
                    // but add a fallback here just in case.
                    setInputsDisabled(false);
                    displayError(""); // Clear transcribing message
                }
            };

            mediaRecorder.onerror = (event) => {
                console.error("MediaRecorder error:", event.error);
                displayError(`Recording Error: ${event.error.name} - ${event.error.message}`);
                isListening = false;
                updateUI();
                setInputsDisabled(false);
                stream.getTracks().forEach(track => track.stop()); // Ensure mic is off
            };

            mediaRecorder.start();
            isListening = true;
            updateUI();
            setInputsDisabled(true); // Disable other inputs while listening
            console.log("MediaRecorder started.");

        } catch (err) {
            console.error("Error accessing microphone:", err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                displayError("Microphone permission denied. Please allow access in browser settings.");
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                 displayError("No microphone found. Please ensure a microphone is connected and enabled.");
            } else {
                displayError(`Error accessing microphone: ${err.name}`);
            }
            isListening = false; // Ensure state is correct
            updateUI();
            setInputsDisabled(false);
        }
    }

    function stopListening() {
        if (mediaRecorder && isListening) {
            console.log("Stopping MediaRecorder...");
            mediaRecorder.stop(); // This triggers the 'onstop' event
            isListening = false; // State update
            updateUI();
            // Inputs will be re-enabled after transcription/response cycle finishes
        } else {
            console.warn("Stop listening called but not currently listening or recorder unavailable.");
            isListening = false; // Ensure state is correct
            updateUI();
            setInputsDisabled(false); // Re-enable if stopped unexpectedly
        }
    }

    async function transcribeAudio(audioFile) {
        if (!OPENAI_API_KEY) {
            displayError("API Key not set for STT.");
            setInputsDisabled(false); // Re-enable
            return;
        }
        if (!audioFile || audioFile.size === 0) {
             displayError("No audio file to transcribe.");
             setInputsDisabled(false); // Re-enable
             return;
        }

        console.log("Sending to OpenAI STT:", audioFile.name, audioFile.size, audioFile.type);

        const formData = new FormData();
        formData.append('file', audioFile);
        formData.append('model', STT_MODEL);
        // formData.append('language', 'en'); // Optional: Specify language ISO-639-1 code
        // formData.append('response_format', 'json'); // Or 'text', 'srt', 'vtt', 'verbose_json'

        try {
            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                    // Content-Type is set automatically by FormData
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("OpenAI STT API Error:", errorData);
                throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Received from OpenAI STT:", data);
            const transcribedText = data.text.trim();

            if (transcribedText) {
                displayError(""); // Clear "Transcribing..." message
                // Handle the transcribed text as a user message
                await handleUserMessage(transcribedText);
            } else {
                displayError("Transcription returned empty text.");
                setInputsDisabled(false); // Re-enable if transcription is empty
            }

        } catch (error) {
            console.error("Error fetching OpenAI STT:", error);
            displayError(`STT API Error: ${error.message}`);
            setInputsDisabled(false); // Re-enable on error
        }
    }

     function setInputsDisabled(disabled) {
        textInput.disabled = disabled;
        sendButton.disabled = disabled;
        micButton.disabled = disabled;
        modeToggleButton.disabled = disabled;
        ttsToggleButton.disabled = disabled;
        clearHistoryButton.disabled = disabled;
        // Keep API key input enabled status separate
        // apiKeyInput.disabled = disabled || (!!OPENAI_API_KEY); // Only disable if key is set OR processing
        // saveKeyButton.disabled = disabled || (!!OPENAI_API_KEY);
    }

    // Adjust textarea height dynamically
    textInput.addEventListener('input', () => {
        textInput.style.height = 'auto'; // Reset height
        textInput.style.height = textInput.scrollHeight + 'px'; // Set to content height
    });


    // ==== Start the App ====
    initializeApp();
});