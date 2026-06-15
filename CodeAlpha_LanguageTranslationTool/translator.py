# =====================================================
# Language Translation Tool
# Developer: [Your Name]
# Tech: Flask + Deep Translator + Python
# =====================================================

from flask import Flask, render_template, request, jsonify
from deep_translator import GoogleTranslator
from flask_cors import CORS
import logging

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

LANGUAGES = {
    'af': 'Afrikaans', 'sq': 'Albanian', 'am': 'Amharic',
    'ar': 'Arabic', 'hy': 'Armenian', 'az': 'Azerbaijani',
    'eu': 'Basque', 'be': 'Belarusian', 'bn': 'Bengali',
    'bs': 'Bosnian', 'bg': 'Bulgarian', 'ca': 'Catalan',
    'zh-CN': 'Chinese Simplified', 'zh-TW': 'Chinese Traditional',
    'hr': 'Croatian', 'cs': 'Czech', 'da': 'Danish',
    'nl': 'Dutch', 'en': 'English', 'eo': 'Esperanto',
    'et': 'Estonian', 'fi': 'Finnish', 'fr': 'French',
    'gl': 'Galician', 'ka': 'Georgian', 'de': 'German',
    'el': 'Greek', 'gu': 'Gujarati', 'ht': 'Haitian Creole',
    'ha': 'Hausa', 'he': 'Hebrew', 'hi': 'Hindi',
    'hu': 'Hungarian', 'is': 'Icelandic', 'id': 'Indonesian',
    'ga': 'Irish', 'it': 'Italian', 'ja': 'Japanese',
    'kn': 'Kannada', 'kk': 'Kazakh', 'ko': 'Korean',
    'la': 'Latin', 'lv': 'Latvian', 'lt': 'Lithuanian',
    'mk': 'Macedonian', 'ms': 'Malay', 'ml': 'Malayalam',
    'mt': 'Maltese', 'mr': 'Marathi', 'mn': 'Mongolian',
    'ne': 'Nepali', 'no': 'Norwegian', 'fa': 'Persian',
    'pl': 'Polish', 'pt': 'Portuguese', 'pa': 'Punjabi',
    'ro': 'Romanian', 'ru': 'Russian', 'sr': 'Serbian',
    'si': 'Sinhala', 'sk': 'Slovak', 'sl': 'Slovenian',
    'so': 'Somali', 'es': 'Spanish', 'sw': 'Swahili',
    'sv': 'Swedish', 'tl': 'Filipino', 'ta': 'Tamil',
    'te': 'Telugu', 'th': 'Thai', 'tr': 'Turkish',
    'uk': 'Ukrainian', 'ur': 'Urdu', 'uz': 'Uzbek',
    'vi': 'Vietnamese', 'cy': 'Welsh', 'yi': 'Yiddish',
    'yo': 'Yoruba', 'zu': 'Zulu'
}


@app.route('/')
def index():
    sorted_languages = dict(
        sorted(LANGUAGES.items(), key=lambda x: x[1])
    )
    return render_template('index.html', languages=sorted_languages)


@app.route('/translate', methods=['POST'])
def translate():
    try:
        data        = request.get_json()
        text        = data.get('text', '').strip()
        source_lang = data.get('source_lang', 'auto')
        target_lang = data.get('target_lang', 'en')

        if not text:
            return jsonify({
                'success': False,
                'error'  : 'Please enter text to translate.'
            }), 400

        if len(text) > 5000:
            return jsonify({
                'success': False,
                'error'  : 'Text exceeds 5000 characters.'
            }), 400

        translator = GoogleTranslator(
            source=source_lang,
            target=target_lang
        )
        translated = translator.translate(text)

        source_name = 'Auto Detected' if source_lang == 'auto' \
                      else LANGUAGES.get(source_lang, source_lang)
        target_name = LANGUAGES.get(target_lang, target_lang)

        return jsonify({
            'success'         : True,
            'translated_text' : translated,
            'source_lang_name': source_name,
            'target_lang_name': target_name,
            'char_count'      : len(text)
        })

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({
            'success': False,
            'error'  : 'Translation failed. Try again.'
        }), 500


@app.route('/languages', methods=['GET'])
def get_languages():
    return jsonify({
        'success'  : True,
        'languages': LANGUAGES,
        'count'    : len(LANGUAGES)
    })


if __name__ == '__main__':
    print("=" * 50)
    print("  🌍 Language Translation Tool")
    print("  👨‍💻 Running: translator.py")
    print("  🚀 http://127.0.0.1:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)