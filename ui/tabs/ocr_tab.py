import gradio as gr
from core.ocr_engine import extract_text_from_image

def create_ocr_tab():
    with gr.Tab("📷 ওসিআর (OCR)"):
        gr.Markdown("### বাংলা ও ইংরেজি ডকুমেন্ট/ইমেজ থেকে টেক্সট এক্সট্রাকশন")
        with gr.Row():
            with gr.Column(scale=1):
                img_input = gr.Image(type="numpy", label="ইমেজ আপলোড করুন")
                lang_selector = gr.CheckboxGroup(["en", "bn"], value=["en", "bn"], label="সক্রিয় ভাষাসমূহ (Languages)")
                extract_btn = gr.Button("🔍 টেক্সট এক্সট্রাক্ট করুন", variant="primary")
            with gr.Column(scale=1):
                txt_output = gr.Textbox(label="শনাক্তকৃত টেক্সট (Extracted Text)", lines=16, show_copy_button=True)

        extract_btn.click(
            fn=extract_text_from_image,
            inputs=[img_input, lang_selector],
            outputs=txt_output
        )
