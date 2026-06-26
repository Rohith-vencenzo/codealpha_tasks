# =====================================================
# Smart FAQ Chatbot
# Tech: Flask + NLTK + Cosine Similarity
# =====================================================

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import nltk
import string
import random
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

nltk.download('punkt',     quiet=True)
nltk.download('stopwords', quiet=True)
nltk.download('wordnet',   quiet=True)
nltk.download('punkt_tab', quiet=True)

from nltk.corpus import stopwords
from nltk.stem   import WordNetLemmatizer

app        = Flask(__name__)
CORS(app)
lemmatizer = WordNetLemmatizer()
stop_words = set(stopwords.words('english'))

# ── FAQ Database ───────────────────────────────────
faqs = [
    {
        "question": "Hello",
        "answer"  : "👋 Hello! Welcome! I am your Smart AI Assistant. How can I help you today?"
    },
    {
        "question": "Hi there",
        "answer"  : "😊 Hi! Great to see you! Ask me anything and I will do my best to help!"
    },
    {
        "question": "How are you?",
        "answer"  : "🤖 I am doing great, thank you for asking! I am always ready to help you!"
    },
    {
        "question": "What is artificial intelligence?",
        "answer"  : "🤖 Artificial Intelligence (AI) is the simulation of human intelligence in machines. It includes learning, reasoning, problem-solving, perception, and language understanding."
    },
    {
        "question": "What is machine learning?",
        "answer"  : "📊 Machine Learning is a subset of AI where systems learn from data to improve performance without being explicitly programmed. Examples include recommendation systems and image recognition."
    },
    {
        "question": "What is deep learning?",
        "answer"  : "🧠 Deep Learning uses neural networks with many layers to analyze data. It powers applications like face recognition, voice assistants, and self-driving cars."
    },
    {
        "question": "What is natural language processing?",
        "answer"  : "💬 Natural Language Processing (NLP) helps computers understand and generate human language. It is used in chatbots, translators, and sentiment analysis tools."
    },
    {
        "question": "What is Python?",
        "answer"  : "🐍 Python is a high-level, easy-to-learn programming language widely used in AI, data science, web development, and automation due to its simple syntax and large library ecosystem."
    },
    {
        "question": "What Python libraries are used in AI?",
        "answer"  : "📚 Popular AI libraries include: TensorFlow, PyTorch, Scikit-learn, Keras, NLTK, SpaCy, Pandas, NumPy, OpenCV, and Matplotlib."
    },
    {
        "question": "What is computer vision?",
        "answer"  : "👁️ Computer Vision is a field of AI that trains computers to interpret visual data like images and videos. Applications include object detection, facial recognition, and medical imaging."
    },
    {
        "question": "What is a neural network?",
        "answer"  : "🔗 A Neural Network is a computational model inspired by the human brain. It consists of layers of interconnected nodes that process and learn from data."
    },
    {
        "question": "What is data science?",
        "answer"  : "📈 Data Science combines statistics, programming, and domain knowledge to extract insights from data. It involves data collection, cleaning, analysis, visualization, and modeling."
    },
    {
        "question": "How do I start learning AI?",
        "answer"  : "🎯 Start with: 1) Learn Python basics 2) Study mathematics (linear algebra, statistics) 3) Take ML courses on Coursera or edX 4) Practice on Kaggle 5) Build real projects!"
    },
    {
        "question": "What is YOLO?",
        "answer"  : "🎯 YOLO (You Only Look Once) is a real-time object detection algorithm. It processes entire images in one pass, making it extremely fast and accurate for detecting multiple objects."
    },
    {
        "question": "What is Flask?",
        "answer"  : "🌐 Flask is a lightweight Python web framework used to build web applications and APIs. It is simple, flexible, and great for deploying AI models as web services."
    },
    {
        "question": "What is OpenCV?",
        "answer"  : "📷 OpenCV is an open-source computer vision library. It provides tools for image processing, video capture, object detection, face recognition, and much more."
    },
    {
        "question": "What is a chatbot?",
        "answer"  : "💬 A chatbot is an AI program that simulates human conversation. It uses NLP to understand user input and provide relevant responses. I am a chatbot!"
    },
    {
        "question": "What is cosine similarity?",
        "answer"  : "📐 Cosine Similarity measures the similarity between two vectors. In NLP, it compares text documents by measuring the angle between their vector representations. Values close to 1 mean very similar."
    },
    {
        "question": "What is TF-IDF?",
        "answer"  : "📊 TF-IDF (Term Frequency-Inverse Document Frequency) is a technique to evaluate how important a word is to a document. It is widely used in text analysis and search engines."
    },
    {
        "question": "Thank you",
        "answer"  : "🙏 You are welcome! Feel free to ask me anything else. Happy to help!"
    },
    {
        "question": "Goodbye",
        "answer"  : "👋 Goodbye! Have a wonderful day! Come back anytime you have questions! 🌟"
    },
    {
        "question": "What can you do?",
        "answer"  : "🤖 I can answer questions about AI, Machine Learning, Python, Data Science, and many other tech topics! Just ask me anything!"
    },
    {
        "question": "Who built you?",
        "answer"  : "👨‍💻 I was built by a developer using Python, Flask, NLTK, and Cosine Similarity as part of an AI project!"
    },
    {
        "question": "What is GitHub?",
        "answer"  : "🐱 GitHub is a platform for version control and collaboration. Developers use it to store, manage, and share code. It uses Git for tracking changes."
    },
    {
        "question": "What is an API?",
        "answer"  : "🔌 An API (Application Programming Interface) allows different software applications to communicate with each other. It defines rules for how programs can request and exchange data."
    }
]


def preprocess(text):
    text   = text.lower()
    text   = text.translate(str.maketrans('', '', string.punctuation))
    tokens = nltk.word_tokenize(text)
    tokens = [
        lemmatizer.lemmatize(w)
        for w in tokens
        if w not in stop_words and w.isalpha()
    ]
    return ' '.join(tokens)


def find_answer(user_q):
    processed_q    = preprocess(user_q)
    all_questions  = [faq['question'] for faq in faqs]
    processed_faqs = [preprocess(q) for q in all_questions]
    all_texts      = processed_faqs + [processed_q]

    vectorizer  = TfidfVectorizer()
    tfidf       = vectorizer.fit_transform(all_texts)

    user_vec    = tfidf[-1]
    faq_vecs    = tfidf[:-1]
    similarities= cosine_similarity(user_vec, faq_vecs)[0]

    best_idx    = np.argmax(similarities)
    best_score  = similarities[best_idx]

    if best_score < 0.1:
        defaults = [
            "🤔 I am not sure about that. Try asking about AI or technology!",
            "❓ I do not have that information. Ask me about Python, ML, or AI topics!",
            "💭 Interesting question! Try rephrasing or ask me something about AI!"
        ]
        return {'answer': random.choice(defaults), 'confidence': 0, 'matched': 'N/A'}

    return {
        'answer'    : faqs[best_idx]['answer'],
        'confidence': round(float(best_score) * 100, 1),
        'matched'   : all_questions[best_idx]
    }


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/chat', methods=['POST'])
def chat():
    try:
        data    = request.get_json()
        message = data.get('message', '').strip()

        if not message:
            return jsonify({'success': False, 'error': 'Empty message'}), 400

        result = find_answer(message)
        return jsonify({'success': True, **result})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/faqs', methods=['GET'])
def get_faqs():
    return jsonify({'success': True, 'faqs': faqs, 'count': len(faqs)})


if __name__ == '__main__':
    print("=" * 50)
    print("  🤖 Smart FAQ Chatbot")
    print("  👨‍💻 Running: chatbot.py")
    print("  🚀 http://127.0.0.1:5001")
    print("=" * 50)
    app.run(debug=True, port=5001)
