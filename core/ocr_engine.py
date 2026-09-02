import torch
from config import DEFAULT_OCR_LANGS

_ocr_reader_instance = None

def get_ocr_reader(languages=None):
    global _ocr_reader_instance
    if languages is None:
        languages = DEFAULT_OCR_LANGS

    try:
        import easyocr
    except ImportError:
        return None, "EasyOCR লাইব্রেরি ইনস্টল করা নেই। (`pip install easyocr` রান করুন)"

    if _ocr_reader_instance is None:
        use_gpu = torch.cuda.is_available()
        _ocr_reader_instance = easyocr.Reader(languages, gpu=use_gpu)

    return _ocr_reader_instance, None

def extract_text_from_image(image, languages=None):
    """
    Extracts text from numpy image array using EasyOCR with GPU acceleration.
    """
    if image is None:
        return "⚠️ অনুগ্রহ করে একটি ছবি আপলোড করুন।"

    reader, err = get_ocr_reader(languages)
    if err:
        return f"❌ {err}"

    try:
        results = reader.readtext(image)
        extracted_lines = [item[1] for item in results]
        final_text = "\n".join(extracted_lines)
        return final_text if final_text.strip() else "ছবিতে কোনো পরিষ্কার টেক্সট পাওয়া যায়নি।"
    except Exception as e:
        return f"❌ OCR প্রসেসিং এরর: {str(e)}"
