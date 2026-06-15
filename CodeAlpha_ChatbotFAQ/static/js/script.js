// ═══════════════════════════════════════
//  Smart Chatbot - JavaScript
// ═══════════════════════════════════════

'use strict';

const messagesEl  = document.getElementById('messages');
const userInput   = document.getElementById('userInput');
const sendBtn     = document.getElementById('sendBtn');
const clearBtn    = document.getElementById('clearBtn');
const themeBtn    = document.getElementById('themeBtn');
const voiceBtn    = document.getElementById('voiceBtn');
const charCount   = document.getElementById('charCount');
const faqList     = document.getElementById('faqList');
const faqCountEl  = document.getElementById('faqCount');
const cats        = document.querySelectorAll('.cat');
const qBtns       = document.querySelectorAll('.q-btn');

let allFaqs    = [];
let isWaiting  = false;
let isDark     = true;

// Load FAQs
async function loadFAQs() {
    const res  = await fetch('/faqs');
    const data = await res.json();
    if (data.success) {
        allFaqs = data.faqs;
        faqCountEl.textContent = data.count;
        renderFAQs(allFaqs);
    }
}

function renderFAQs(faqs) {
    faqList.innerHTML = '';
    faqs.forEach(f => {
        const div = document.createElement('div');
        div.className   = 'faq-item';
        div.textContent = f.question;
        div.onclick     = () => {
            userInput.value = f.question;
            sendMessage();
        };
        faqList.appendChild(div);
    });
}

// Category filter
const keywords = {
    ai    : ['ai','artificial','machine','deep','neural','learning','nlp','language','vision','yolo'],
    python: ['python','flask','library','numpy','pandas','sklearn'],
    tools : ['github','api','opencv','chatbot','tfidf','cosine']
};

cats.forEach(c => {
    c.addEventListener('click', () => {
        cats.forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        const cat = c.getAttribute('data-cat');
        if (cat === 'all') { renderFAQs(allFaqs); return; }
        const kws = keywords[cat] || [];
        renderFAQs(allFaqs.filter(f =>
            kws.some(k => f.question.toLowerCase().includes(k) ||
                          f.answer.toLowerCase().includes(k))
        ));
    });
});

// Send message
async function sendMessage() {
    const msg = userInput.value.trim();
    if (!msg || isWaiting) return;

    addMessage(msg, 'user');
    userInput.value = '';
    charCount.textContent = '0';

    const tid = showTyping();
    isWaiting  = true;

    try {
        const res  = await fetch('/chat', {
            method : 'POST',
            headers: {'Content-Type':'application/json'},
            body   : JSON.stringify({message: msg})
        });
        const data = await res.json();
        removeTyping(tid);

        if (data.success) {
            addMessage(data.answer, 'bot', data.confidence);
        } else {
            addMessage('❌ Something went wrong!', 'bot');
        }
    } catch {
        removeTyping(tid);
        addMessage('❌ Connection error!', 'bot');
    }

    isWaiting = false;
}

function addMessage(text, who, conf = null) {
    const div = document.createElement('div');
    div.className = `msg ${who}`;
    const time = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

    const badge = conf && conf > 0
        ? `<div class="conf-badge"><i class="fas fa-chart-bar"></i> Match: ${conf}%</div>`
        : '';

    div.innerHTML = `
        <div class="msg-avatar">
            <i class="fas fa-${who === 'bot' ? 'robot' : 'user'}"></i>
        </div>
        <div class="msg-body">
            <div class="bubble"><p>${text}</p></div>
            ${who === 'bot' ? badge : ''}
            <span class="time">${time}</span>
        </div>`;

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTyping() {
    const id  = 'typ-' + Date.now();
    const div = document.createElement('div');
    div.id    = id;
    div.className = 'msg bot';
    div.innerHTML = `
        <div class="msg-avatar"><i class="fas fa-robot"></i></div>
        <div class="msg-body">
            <div class="bubble">
                <div class="typing-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return id;
}

function removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// Events
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
});
userInput.addEventListener('input', () => {
    charCount.textContent = userInput.value.length;
});

clearBtn.addEventListener('click', () => {
    messagesEl.innerHTML = `
        <div class="msg bot">
            <div class="msg-avatar"><i class="fas fa-robot"></i></div>
            <div class="msg-body">
                <div class="bubble"><p>🔄 Chat cleared! How can I help?</p></div>
            </div>
        </div>`;
});

themeBtn.addEventListener('click', () => {
    isDark = !isDark;
    document.body.classList.toggle('light');
    themeBtn.innerHTML = isDark
        ? '<i class="fas fa-moon"></i>'
        : '<i class="fas fa-sun"></i>';
});

// Voice
voiceBtn.addEventListener('click', () => {
    if (!('webkitSpeechRecognition' in window)) {
        alert('Use Chrome for voice input!'); return;
    }
    const SR = new webkitSpeechRecognition();
    SR.lang  = 'en-US';
    SR.onstart  = () => { voiceBtn.classList.add('listening'); voiceBtn.innerHTML = '<i class="fas fa-stop"></i>'; };
    SR.onresult = e => { userInput.value = e.results[0][0].transcript; charCount.textContent = userInput.value.length; };
    SR.onend    = () => { voiceBtn.classList.remove('listening'); voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>'; if (userInput.value) sendMessage(); };
    SR.start();
});

qBtns.forEach(b => {
    b.addEventListener('click', () => {
        userInput.value = b.getAttribute('data-q');
        sendMessage();
    });
});

document.addEventListener('DOMContentLoaded', loadFAQs);