// ═══════════════════════════════════════
//  Language Translator - JavaScript
// ═══════════════════════════════════════

'use strict';

const inputText   = document.getElementById('inputText');
const outputText  = document.getElementById('outputText');
const sourceLang  = document.getElementById('sourceLang');
const targetLang  = document.getElementById('targetLang');
const translateBtn= document.getElementById('translateBtn');
const swapBtn     = document.getElementById('swapBtn');
const clearBtn    = document.getElementById('clearBtn');
const copyBtn     = document.getElementById('copyBtn');
const pasteBtn    = document.getElementById('pasteBtn');
const speakInput  = document.getElementById('speakInput');
const speakOutput = document.getElementById('speakOutput');
const charCount   = document.getElementById('charCount');
const langInfo    = document.getElementById('langInfo');
const toast       = document.getElementById('toast');
const toastMsg    = document.getElementById('toastMsg');
const qlBtns      = document.querySelectorAll('.ql-btn');

let lastTranslation = '';

// Translate
async function translate() {
    const text = inputText.value.trim();
    if (!text) { showToast('Enter text first!', 'warn'); return; }

    translateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    translateBtn.disabled  = true;

    try {
        const res  = await fetch('/translate', {
            method : 'POST',
            headers: {'Content-Type': 'application/json'},
            body   : JSON.stringify({
                text,
                source_lang: sourceLang.value,
                target_lang: targetLang.value
            })
        });
        const data = await res.json();

        if (data.success) {
            outputText.innerHTML = `<div class="translated">${data.translated_text}</div>`;
            lastTranslation      = data.translated_text;
            langInfo.textContent = `${data.source_lang_name} → ${data.target_lang_name}`;
            showToast('✅ Translated!');
        } else {
            showToast('❌ ' + data.error, 'error');
        }
    } catch {
        showToast('❌ Connection error!', 'error');
    }

    translateBtn.innerHTML = '<i class="fas fa-language"></i><span>GO</span>';
    translateBtn.disabled  = false;
}

// Swap
swapBtn.addEventListener('click', () => {
    if (sourceLang.value === 'auto') {
        showToast('Select source language first!', 'warn'); return;
    }
    const tmp        = sourceLang.value;
    sourceLang.value = targetLang.value;
    targetLang.value = tmp;

    if (lastTranslation) {
        inputText.value = lastTranslation;
        updateCount();
        translate();
    }
    showToast('🔄 Swapped!');
});

// Clear
clearBtn.addEventListener('click', () => {
    inputText.value  = '';
    outputText.innerHTML = `
        <div class="output-placeholder">
            <i class="fas fa-magic"></i>
            <p>Translation appears here</p>
        </div>`;
    lastTranslation  = '';
    langInfo.textContent = '';
    updateCount();
});

// Copy
copyBtn.addEventListener('click', async () => {
    if (!lastTranslation) { showToast('Nothing to copy!', 'warn'); return; }
    await navigator.clipboard.writeText(lastTranslation);
    showToast('📋 Copied!');
});

// Paste
pasteBtn.addEventListener('click', async () => {
    const text       = await navigator.clipboard.readText();
    inputText.value  = text;
    updateCount();
    showToast('📋 Pasted!');
});

// Speak Input
speakInput.addEventListener('click', () => {
    speak(inputText.value, sourceLang.value === 'auto' ? 'en' : sourceLang.value);
});

// Speak Output
speakOutput.addEventListener('click', () => {
    speak(lastTranslation, targetLang.value);
});

function speak(text, lang) {
    if (!text) { showToast('Nothing to speak!', 'warn'); return; }
    window.speechSynthesis.cancel();
    const u  = new SpeechSynthesisUtterance(text);
    u.lang   = lang;
    u.rate   = 0.9;
    window.speechSynthesis.speak(u);
    showToast('🔊 Speaking...');
}

// Quick Language Buttons
qlBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        targetLang.value = btn.getAttribute('data-lang');
        qlBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (inputText.value.trim()) translate();
    });
});

// Character Count
function updateCount() {
    charCount.textContent = inputText.value.length;
}
inputText.addEventListener('input', updateCount);

// Enter to translate
translateBtn.addEventListener('click', translate);
inputText.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') translate();
});

// Toast
function showToast(msg, type = 'success') {
    toastMsg.textContent = msg;
    toast.style.background = type === 'error'
        ? 'linear-gradient(135deg,#FF6584,#ff4757)'
        : type === 'warn'
        ? 'linear-gradient(135deg,#FFD700,#FFA500)'
        : 'linear-gradient(135deg,#6C63FF,#FF6584)';
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 3000);
}