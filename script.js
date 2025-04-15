'use strict';

// --- Configuration ---
const OPENAI_API_CHAT_MODEL = "gpt-4.1"; // Or your preferred chat model
const OPENAI_API_STT_MODEL = "gpt-4o-mini-transcribe"; // Or whisper-1
const OPENAI_API_TTS_MODEL = "gpt-4o-mini-tts"; // Or tts-1
const SYSTEM_PROMPT = "You are a helpful assistant. Keep your responses concise and clear.";
// --- IMPORTANT: API Key is handled insecurely below for simplicity ---
// --- In a real app, NEVER embed keys directly or store in localStorage/sessionStorage ---

// --- DOM Elements ---
const apiKeyInput = document.getElementById('api-key');
const saveKeyButton = document.getElementById('save-key-button');
const modeButton = document.getElementById('mode-button');
const recordButton = document.getElementById('record-button');
const ttsButton = document.getElementById('tts-button');
const clearButton = document.getElementById('clear-button');
const statusIndicator = document.getElementById('status-indicator');
const transcriptDiv = document.getElementById('transcript');
const textInput = document.getElementById('text-input');
const sendButton = document.getElementById('send-button');
const inputArea = document.getElementById('input-area');

// --- State Variables ---
let apiKey = null;
let conversationHistory = []; // Array of { role: 'user'/'assistant', content: 'message' }
let currentMode = 'text'; // 'text' or 'voice'
let isTTSenabled = true;
let isListening = false;
let mediaRecorder = null;
let audioChunks = [];
let lastMessageDate = null; // To track for daily markers

// --- Initialization ---
window.addEventListener('load', () => {
    loadApiKey();
    loadHistory();
    updateUI();
    addEventListeners();
    renderTranscript(); // Render initial history
});

function addEventListeners() {
    saveKeyButton.addEventListener('click', saveApiKey);
    modeButton.addEventListener('click', toggleMode);
    recordButton.addEventListener('click', toggleRecording);
    ttsButton.addEventListener('click', toggleTTS);
    clearButton.addEventListener('click', clearHistory);
    sendButton.addEventListener('click', handleTextInput);
    textInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleTextInput();
        }
    });
}

// --- UI Update Functions ---
function updateUI() {
    // Mode Button and Input Area
    if (currentMode === 'voice') {
        modeButton.textContent = 'Switch to Text Mode';
        recordButton.classList.remove('hidden');
        inputArea.classList.add('hidden'); // Hide text input in voice mode
    } else {
        modeButton.textContent = 'Switch to Voice Mode';
        recordButton.classList.add('hidden');
        inputArea.classList.remove('hidden'); // Show text input in text mode
    }

    // Record Button State
    if (isListening) {
        recordButton.textContent = 'Stop Recording';
        recordButton.classList.add('active');
        setStatus('Listening...');
    } else {
        recordButton.textContent = 'Start Recording';
        recordButton.classList.remove('active');
        // Don't overwrite other statuses like "Processing..." when not listening
        if (statusIndicator.textContent === 'Listening...') {
             setStatus('Ready');
        }
    }

    // TTS Button State
    ttsButton.textContent = `TTS: ${isTTSenabled ? 'Enabled' : 'Disabled'}`;
    ttsButton.style.backgroundColor = isTTSenabled ? '#5cb85c' : '#d9534f'; // Green/Red indication
    ttsButton.style.color = 'white';


    // API Key Input State
    if (apiKey) {
        apiKeyInput.disabled = true;
        saveKeyButton.textContent = 'Key Saved';
        saveKeyButton.disabled = true;
    } else {
        apiKeyInput.disabled = false;
        saveKeyButton.textContent = 'Save Key';
        saveKeyButton.disabled = false;
    }
}

function setStatus(message, isError = false) {
    statusIndicator.textContent = message;
    statusIndicator.style.color = isError ? '#d9534f' : '#555'; // Red for errors
    console.log(`Status: ${message}`);
    if (isError) {
        console.error(`Error Status: ${message}`);
    }
}

function renderTranscript() {
    transcriptDiv.innerHTML = ''; // Clear existing content
    let lastDate = null; // Track date for markers within render

    conversationHistory.forEach(msg => {
        // Check for daily marker logic during rendering
        const messageDate = new Date(msg.timestamp); // Assuming messages have timestamps
        if (msg.timestamp && (!lastDate || messageDate.toDateString() !== lastDate.toDateString())) {
             if (lastDate) { // Don't add marker before the very first message
                const marker = document.createElement('div');
                marker.className = 'daily-marker';
                marker.textContent = `--- ${messageDate.toLocaleDateString()} ---`;
                transcriptDiv.appendChild(marker);
            }
            lastDate = messageDate;
        }


        const messageElement = document.createElement('div');
        messageElement.classList.add('message', msg.role); // 'user' or 'assistant'

        const roleElement = document.createElement('strong');
        roleElement.textContent = msg.role === 'user' ? 'You:' : 'Assistant:';

        const contentElement = document.createElement('span');
        contentElement.textContent = msg.content; // Use textContent to prevent XSS

        messageElement.appendChild(roleElement);
        messageElement.appendChild(contentElement);
        transcriptDiv.appendChild(messageElement);
    });

    // Auto-scroll to bottom
    transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
}


// --- State Management & Persistence ---
function loadApiKey() {
    const savedKey = sessionStorage.getItem('openaiApiKey');
    if (savedKey) {
        apiKey = savedKey;
        console.log("API Key loaded from session storage.");
    } else {
        console.log("API Key not found in session storage.");
    }
}

function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        apiKey = key;
        sessionStorage.setItem('openaiApiKey', key);
        console.log("API Key saved to session storage.");
        updateUI(); // Reflect saved state
        setStatus("API Key saved for this session.");
    } else {
        setStatus("Please enter an API Key.", true);
    }
}

function loadHistory() {
    const savedHistory = localStorage.getItem('chatHistory');
    if (savedHistory) {
        try {
            conversationHistory = JSON.parse(savedHistory);
            // Find the date of the last message for daily marker logic
            if (conversationHistory.length > 0) {
                 const lastMsg = conversationHistory[conversationHistory.length - 1];
                 if (lastMsg.timestamp) {
                     lastMessageDate = new Date(lastMsg.timestamp);
                 }
            }
            console.log("Conversation history loaded.");
        } catch (error) {
            console.error("Failed to parse saved history:", error);
            localStorage.removeItem('chatHistory'); // Clear corrupted data
            conversationHistory = [];
            lastMessageDate = null;
        }
    }
}

function saveHistory() {
    try {
        localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
    } catch (error) {
        console.error("Failed to save history (maybe storage limit reached?):", error);
        setStatus("Error saving history. Storage might be full.", true);
    }
}

function clearHistory() {
    if (confirm("Are you sure you want to clear the entire conversation history?")) {
        conversationHistory = [];
        lastMessageDate = null;
        localStorage.removeItem('chatHistory');
        renderTranscript();
        setStatus("History cleared.");
        console.log("History cleared.");
    }
}

// --- Core Functionality Toggles ---
function toggleMode() {
    if (isListening) {
        setStatus("Stop recording before switching modes.", true);
        return;
    }
    currentMode = (currentMode === 'text') ? 'voice' : 'text';
    console.log(`Switched to ${currentMode} mode.`);
    setStatus(`Switched to ${currentMode} mode.`);
    updateUI();
}

function toggleTTS() {
    isTTSenabled = !isTTSenabled;
    console.log(`TTS ${isTTSenabled ? 'Enabled' : 'Disabled'}.`);
    setStatus(`TTS ${isTTSenabled ? 'Enabled' : 'Disabled'}.`);
    updateUI();
}

// --- User Input Handling ---
function handleTextInput() {
    const text = textInput.value.trim();
    if (!text) return; // Ignore empty input

    if (!apiKey) {
        setStatus("Please save your OpenAI API Key first.", true);
        return;
    }

    addMessageToHistory('user', text);
    textInput.value = ''; // Clear input field
    getAssistantResponse();
}

function addMessageToHistory(role, content) {
    const timestamp = new Date().toISOString(); // Add timestamp for daily markers

    // --- Daily Marker Logic ---
    const now = new Date();
    let markerText = null;
    if (!lastMessageDate || now.toDateString() !== lastMessageDate.toDateString()) {
        if (role === 'user') { // Only add marker before the first user message of the day
             markerText = `It is now ${now.toLocaleTimeString()}, on ${now.toLocaleDateString()}.`;
             console.log("Adding daily marker.");
             // We'll prepend this to the user's *content* for simplicity in the OpenAI prompt
             content = markerText + "\n\n" + content;
        }
        lastMessageDate = now; // Update the date tracker
    }
    // --- End Daily Marker Logic ---


    conversationHistory.push({ role, content, timestamp }); // Store with timestamp
    renderTranscript();
    saveHistory();
}


// --- Voice Recording (Web Audio API) ---
async function toggleRecording() {
    if (!apiKey) {
        setStatus("Please save your OpenAI API Key first.", true);
        return;
    }

    if (isListening) {
        stopRecording();
    } else {
        await startRecording();
    }
    updateUI();
}

async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus("Media Devices API not supported on this browser.", true);
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = []; // Reset chunks

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = handleRecordingStop;

        mediaRecorder.onerror = (event) => {
            setStatus(`Recorder Error: ${event.error.message}`, true);
            isListening = false;
            updateUI();
        };

        mediaRecorder.start();
        isListening = true;
        console.log("Recording started.");

    } catch (err) {
        setStatus(`Mic Access Error: ${err.message}`, true);
        console.error("Error accessing microphone:", err);
        isListening = false; // Ensure state is correct
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop(); // This will trigger the 'onstop' event
        // Stop microphone tracks to turn off indicator
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isListening = false;
        console.log("Recording stopped.");
        setStatus("Processing audio..."); // Indicate processing
    }
    updateUI(); // Update button text immediately
}

async function handleRecordingStop() {
    console.log("handleRecordingStop triggered");
    if (audioChunks.length === 0) {
        console.warn("No audio data recorded.");
        setStatus("No audio detected.", true);
        return;
    }

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // Adjust type if needed, webm/ogg often work
    audioChunks = []; // Clear chunks for next recording

    // --- Call OpenAI STT API ---
    setStatus("Transcribing audio...");
    try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm'); // Filename is required by API
        formData.append('model', OPENAI_API_STT_MODEL);
        // formData.append('language', 'en'); // Optional: Specify language

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                // 'Content-Type': 'multipart/form-data' is set automatically by fetch with FormData
            },
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || `HTTP error! status: ${response.status}`);
        }

        const transcribedText = result.text;
        setStatus("Transcription complete.");
        console.log("Transcription:", transcribedText);

        if (transcribedText) {
            addMessageToHistory('user', transcribedText);
            getAssistantResponse(); // Get response after successful transcription
        } else {
            setStatus("Transcription empty.", true);
        }

    } catch (error) {
        console.error('STT API Error:', error);
        setStatus(`STT Error: ${error.message}`, true);
    } finally {
         // Ensure status is reset if nothing else sets it
         if (statusIndicator.textContent === 'Transcribing audio...') {
            setStatus('Ready');
         }
    }
}


// --- OpenAI API Calls ---

async function getAssistantResponse() {
    if (!apiKey) {
        setStatus("API Key not set.", true);
        return;
    }
    setStatus("Assistant thinking...");

    // Prepare messages for the API (include system prompt)
    const messagesPayload = [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory.map(({ role, content }) => ({ role, content })) // Map to required format
    ];

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: OPENAI_API_CHAT_MODEL,
                messages: messagesPayload
            })
        });

        const result = await response.json();

        if (!response.ok || !result.choices || result.choices.length === 0) {
             const errorMsg = result.error?.message || `HTTP error! status: ${response.status}`;
             throw new Error(errorMsg);
        }

        const assistantMessage = result.choices[0].message.content.trim();
        addMessageToHistory('assistant', assistantMessage);
        setStatus("Ready"); // Reset status after successful response

        if (isTTSenabled && assistantMessage) {
            speakText(assistantMessage);
        }

    } catch (error) {
        console.error('Chat API Error:', error);
        setStatus(`Chat Error: ${error.message}`, true);
        // Optionally remove the last user message if the API call failed?
    }
}

async function speakText(text) {
    if (!apiKey) {
        setStatus("API Key not set for TTS.", true);
        return;
    }
    if (!text) return;

    setStatus("Generating audio...");
    try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: OPENAI_API_TTS_MODEL,
                input: text,
                voice: "alloy" // Choose a voice (alloy, echo, fable, onyx, nova, shimmer)
                // response_format: "mp3" // Default is mp3
            })
        });

        if (!response.ok) {
            // Try to get error message from OpenAI if possible
            let errorMsg = `TTS HTTP error! status: ${response.status}`;
             try {
                 const errorResult = await response.json();
                 errorMsg = errorResult.error?.message || errorMsg;
             } catch (e) { /* Ignore parsing error if body isn't JSON */ }
             throw new Error(errorMsg);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        setStatus("Speaking..."); // Indicate playback start
        audio.play();

        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            console.log("TTS playback finished.");
             // Reset status only if it was 'Speaking...'
             if (statusIndicator.textContent === 'Speaking...') {
                 setStatus("Ready");
             }
        };
        audio.onerror = (e) => {
             URL.revokeObjectURL(audioUrl);
             console.error("Error playing TTS audio:", e);
             setStatus("Error playing audio.", true);
        };


    } catch (error) {
        console.error('TTS API Error:', error);
        setStatus(`TTS Error: ${error.message}`, true);
    }
}