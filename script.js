'use strict';

// --- Configuration ---
const OPENAI_API_CHAT_MODEL = "gpt-4.1";
const OPENAI_API_STT_MODEL = "gpt-4o-mini-transcribe";
const OPENAI_API_TTS_MODEL = "gpt-4o-mini-tts";
const SYSTEM_PROMPT = "You are an empathetic, brilliant, psychologist specializing in post partem issues,  You are advising ashima mathur.   Ashima lives in Vasant Vihar, New Delhi.  She had a child on February 12, 2025.  She has been married for almost five years now.  She was raised in a baniya/marwari business family in civil lines, New Delhi.  She has not really worked much, although she has pursued some creative opportunities on an ad hoc basis.  She is married to Nishant, an INSEAD and Johns Hopkins graduate working in the tech space.  She lives in a join family - her husband's parents (father has MSA-P), and her husband's brother and sister in law who spend about 6 months travelling, and the rest of their time in vasant vihar. Your goal is to help Ashima with her issues, not just by conducting a quick session, but by getting to the root of the issue, and being a partner with her over the next several days, until she solves them.";

// Silence Detection Configuration
const SILENCE_THRESHOLD = -50; // dB level threshold for silence (adjust as needed)
const SILENCE_DURATION_MS = 1500; // How long silence must last to trigger stop (milliseconds)
const AUDIO_CHECK_INTERVAL_MS = 200; // How often to check audio level

// --- DOM Elements ---
const settingsDiv = document.getElementById('settings'); // Added reference
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
let conversationHistory = [];
let currentMode = 'text';
let isTTSenabled = true;
let isProcessing = false; // Combined state for listening/STT/GPT/TTS cycle
let mediaRecorder = null;
let audioChunks = [];
let lastMessageDate = null;

// Audio Analysis State
let audioContext = null;
let analyserNode = null;
let audioSource = null;
let silenceCheckInterval = null;
let silenceTimeout = null;
let audioDataArray = null; // For storing audio level data

// --- Initialization ---
window.addEventListener('load', () => {
    loadApiKey(); // This will also hide settings if key exists
    loadHistory();
    updateUI();
    addEventListeners();
    renderTranscript();
});

function addEventListeners() {
    saveKeyButton.addEventListener('click', saveApiKey);
    modeButton.addEventListener('click', toggleMode);
    // Record button now only starts the process
    recordButton.addEventListener('click', startVoiceInput);
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
    // Mode Button and Input Area visibility
    if (currentMode === 'voice') {
        modeButton.textContent = 'Switch to Text Mode';
        recordButton.classList.remove('hidden');
        inputArea.classList.add('hidden');
    } else {
        modeButton.textContent = 'Switch to Voice Mode';
        recordButton.classList.add('hidden');
        inputArea.classList.remove('hidden');
    }

    // Record Button State (now just indicates if ready to start)
    recordButton.textContent = 'Start Recording';
    recordButton.disabled = isProcessing; // Disable if listening or processing
    if (isProcessing && currentMode === 'voice') {
        recordButton.classList.add('active'); // Keep visual cue if needed
    } else {
         recordButton.classList.remove('active');
    }


    // TTS Button State
    ttsButton.textContent = `TTS: ${isTTSenabled ? 'Enabled' : 'Disabled'}`;
    ttsButton.style.backgroundColor = isTTSenabled ? '#5cb85c' : '#d9534f';
    ttsButton.style.color = 'white';

    // Disable text input/send while processing
    textInput.disabled = isProcessing;
    sendButton.disabled = isProcessing;

    // API Key section is hidden via loadApiKey/saveApiKey directly adding/removing 'hidden' class
}

function setStatus(message, isError = false) {
    statusIndicator.textContent = message;
    statusIndicator.style.color = isError ? '#d9534f' : '#555';
    console.log(`Status: ${message}`);
    if (isError) {
        console.error(`Error Status: ${message}`);
    }
}

function renderTranscript() {
    // ... (renderTranscript function remains exactly the same as before) ...
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
        settingsDiv.classList.add('hidden'); // Hide settings if key exists
        console.log("API Key loaded from session storage.");
    } else {
        settingsDiv.classList.remove('hidden'); // Show settings if no key
        console.log("API Key not found in session storage.");
    }
}

function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        apiKey = key;
        sessionStorage.setItem('openaiApiKey', key);
        settingsDiv.classList.add('hidden'); // Hide settings on save
        console.log("API Key saved to session storage.");
        setStatus("API Key saved for this session.");
        updateUI(); // Update button states etc.
    } else {
        setStatus("Please enter an API Key.", true);
    }
}

function loadHistory() {
    // ... (loadHistory function remains exactly the same as before) ...
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
    // ... (saveHistory function remains exactly the same as before) ...
     try {
        localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
    } catch (error) {
        console.error("Failed to save history (maybe storage limit reached?):", error);
        setStatus("Error saving history. Storage might be full.", true);
    }
}

function clearHistory() {
    // ... (clearHistory function remains exactly the same as before) ...
    if (isProcessing) {
        setStatus("Please wait for the current action to complete.", true);
        return;
    }
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
    if (isProcessing) {
        setStatus("Cannot switch modes while processing.", true);
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
    if (!text || isProcessing) return;

    if (!apiKey) {
        setStatus("Please save your OpenAI API Key first.", true);
        // Ensure settings are visible if API key is missing
        settingsDiv.classList.remove('hidden');
        return;
    }

    isProcessing = true; // Start processing state
    updateUI();
    addMessageToHistory('user', text);
    textInput.value = '';
    getAssistantResponse(); // This will eventually set isProcessing = false
}

function addMessageToHistory(role, content) {
    // ... (addMessageToHistory function remains exactly the same as before, including daily marker logic) ...
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


// --- Voice Recording & Silence Detection ---

async function startVoiceInput() {
    if (isProcessing) {
        console.warn("Already processing, cannot start new voice input.");
        return;
    }
    if (!apiKey) {
        setStatus("Please save your OpenAI API Key first.", true);
        settingsDiv.classList.remove('hidden'); // Ensure settings are visible
        return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus("Media Devices API not supported.", true);
        return;
    }

    isProcessing = true;
    setStatus("Listening...");
    updateUI(); // Disable button etc.

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Setup MediaRecorder
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        mediaRecorder.onstop = handleRecordingStop; // This is triggered by silence detection now
        mediaRecorder.onerror = (event) => {
            console.error("Recorder Error:", event.error);
            setStatus(`Recorder Error: ${event.error.message}`, true);
            cleanupAfterRecording(); // Clean up audio resources
        };

        // Setup Audio Analysis for Silence Detection
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048; // Standard FFT size
        analyserNode.minDecibels = -90; // Minimum power value in dB
        analyserNode.maxDecibels = -10; // Maximum power value in dB
        analyserNode.smoothingTimeConstant = 0.85; // Smoothing factor

        audioSource = audioContext.createMediaStreamSource(stream);
        audioSource.connect(analyserNode);

        // Prepare data array for analysis
        const bufferLength = analyserNode.frequencyBinCount;
        audioDataArray = new Uint8Array(bufferLength);

        // Start recording and silence detection
        mediaRecorder.start();
        startSilenceDetection();
        console.log("Recording and silence detection started.");

    } catch (err) {
        console.error("Error starting voice input:", err);
        setStatus(`Mic Access Error: ${err.message}`, true);
        isProcessing = false; // Reset processing state on error
        updateUI();
        cleanupAfterRecording(); // Ensure cleanup if setup failed
    }
}

function startSilenceDetection() {
    clearTimeout(silenceTimeout); // Clear any previous timeout
    clearInterval(silenceCheckInterval); // Clear any previous interval

    silenceCheckInterval = setInterval(() => {
        if (!analyserNode || !audioDataArray) return;

        analyserNode.getByteFrequencyData(audioDataArray); // Get frequency data

        // Calculate average volume (simple approach)
        let sum = 0;
        for (let i = 0; i < audioDataArray.length; i++) {
            sum += audioDataArray[i];
        }
        let average = sum / audioDataArray.length;

        // Convert average to dB-like scale (rough approximation)
        // This mapping might need adjustment based on SILENCE_THRESHOLD
        let volumeIndB = 20 * Math.log10(average / 255); // Normalize and convert to dB-ish
        if (!isFinite(volumeIndB)) volumeIndB = -100; // Handle log(0) -> -Infinity

        // console.log(`Current Volume (approx dB): ${volumeIndB.toFixed(2)}`); // DEBUG

        if (volumeIndB < SILENCE_THRESHOLD) {
            // Silence detected, start or reset the timeout
            if (!silenceTimeout) {
                // console.log("Silence detected, starting timer..."); // DEBUG
                silenceTimeout = setTimeout(handleSilenceDetected, SILENCE_DURATION_MS);
            }
        } else {
            // Sound detected, clear the timeout
            if (silenceTimeout) {
                // console.log("Sound detected, clearing silence timer."); // DEBUG
                clearTimeout(silenceTimeout);
                silenceTimeout = null;
            }
        }
    }, AUDIO_CHECK_INTERVAL_MS);
}

function handleSilenceDetected() {
    console.log(`Silence detected for ${SILENCE_DURATION_MS}ms. Stopping recording.`);
    setStatus("Silence detected, processing...");
    stopRecording(); // Trigger the stop process
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop(); // Triggers 'onstop' -> handleRecordingStop
    }
    // Cleanup happens in handleRecordingStop or cleanupAfterRecording
    stopSilenceDetection(); // Stop the analysis loop
}

function stopSilenceDetection() {
    clearInterval(silenceCheckInterval);
    clearTimeout(silenceTimeout);
    silenceCheckInterval = null;
    silenceTimeout = null;
    console.log("Silence detection stopped.");
}

function cleanupAfterRecording() {
    console.log("Cleaning up audio resources.");
    stopSilenceDetection(); // Ensure detection is stopped

    if (mediaRecorder) {
        // Stop microphone tracks
        mediaRecorder.stream?.getTracks().forEach(track => track.stop());
        mediaRecorder = null;
    }
    if (audioContext) {
        audioContext.close().catch(e => console.error("Error closing AudioContext:", e));
        audioContext = null;
    }
    audioSource = null;
    analyserNode = null;
    audioDataArray = null;
    audioChunks = []; // Clear recorded chunks

    // Reset processing state ONLY if not handled elsewhere (e.g., after TTS/error)
    // isProcessing = false; // Be careful where this is set
    // updateUI();
}

async function handleRecordingStop() {
    console.log("Recording stopped (handleRecordingStop). Processing audio chunks.");

    if (audioChunks.length === 0) {
        console.warn("No audio data recorded.");
        setStatus("No audio detected.", true);
        cleanupAfterRecording();
        isProcessing = false; // Reset state
        updateUI();
        return;
    }

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // Or 'audio/ogg' etc.

    // --- Call OpenAI STT API ---
    setStatus("Transcribing audio...");
    // No need to updateUI here as isProcessing is true

    try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('model', OPENAI_API_STT_MODEL);

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || `STT HTTP error! status: ${response.status}`);
        }

        const transcribedText = result.text.trim();
        setStatus("Transcription complete.");
        console.log("Transcription:", transcribedText);

        if (transcribedText) {
            addMessageToHistory('user', transcribedText);
            getAssistantResponse(); // Chain to get response (this handles isProcessing=false eventually)
        } else {
            setStatus("Transcription empty.", true);
            isProcessing = false; // Reset state
            updateUI();
        }

    } catch (error) {
        console.error('STT API Error:', error);
        setStatus(`STT Error: ${error.message}`, true);
        isProcessing = false; // Reset state on error
        updateUI();
    } finally {
        cleanupAfterRecording(); // Clean up mic/audio resources now
    }
}


// --- OpenAI API Calls ---

async function getAssistantResponse() {
    // Assumes isProcessing = true when called
    if (!apiKey) {
        setStatus("API Key not set.", true);
        isProcessing = false; updateUI(); return;
    }
    setStatus("Assistant thinking...");

    const messagesPayload = [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory.map(({ role, content }) => ({ role, content }))
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
             const errorMsg = result.error?.message || `Chat HTTP error! status: ${response.status}`;
             throw new Error(errorMsg);
        }

        const assistantMessage = result.choices[0].message.content.trim();
        addMessageToHistory('assistant', assistantMessage);

        if (isTTSenabled && assistantMessage) {
            // TTS will handle setting status and eventually isProcessing = false
            await speakText(assistantMessage);
        } else {
            // If TTS disabled or message empty, finish processing now
            setStatus("Ready");
            isProcessing = false;
            updateUI();
        }

    } catch (error) {
        console.error('Chat API Error:', error);
        setStatus(`Chat Error: ${error.message}`, true);
        isProcessing = false; // Reset state on error
        updateUI();
    }
}

async function speakText(text) {
    // Assumes isProcessing = true when called
    if (!apiKey) {
        setStatus("API Key not set for TTS.", true);
        isProcessing = false; updateUI(); return;
    }
    if (!text) {
        // No text to speak, finish processing
        setStatus("Ready");
        isProcessing = false; updateUI(); return;
    }

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
                voice: "alloy"
            })
        });

        if (!response.ok) {
            let errorMsg = `TTS HTTP error! status: ${response.status}`;
             try { const errorResult = await response.json(); errorMsg = errorResult.error?.message || errorMsg; } catch (e) {}
             throw new Error(errorMsg);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        setStatus("Speaking...");
        audio.play();

        // Use promises to handle audio end/error for cleaner state management
        await new Promise((resolve, reject) => {
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                console.log("TTS playback finished.");
                resolve(); // Playback completed successfully
            };
            audio.onerror = (e) => {
                 URL.revokeObjectURL(audioUrl);
                 console.error("Error playing TTS audio:", e);
                 reject(new Error("Error playing audio.")); // Playback failed
            };
        });

        // If playback finished without error
        setStatus("Ready");

    } catch (error) {
        console.error('TTS API Error:', error);
        setStatus(`TTS Error: ${error.message}`, true);
        // Error occurred during TTS generation or playback
    } finally {
        // Ensure processing state is reset regardless of TTS success/failure
        isProcessing = false;
        updateUI();
    }
}