import gradio as gr
from core.hf_hub import search_models, download_hf_model

def create_search_tab():
    with gr.Tab("🔎 Hugging Face সার্চ ও ডাউনলোড"):
        gr.Markdown("### Hugging Face Hub থেকে যেকোনো মডেল খুঁজুন এবং সরাসরি Colab-এ ডাউনলোড করুন")
        with gr.Row():
            with gr.Column(scale=1):
                query_input = gr.Textbox(
                    label="সার্চ কিওয়ার্ড বা নাম",
                    placeholder="যেমন: mistral, qwen2, llama-3, bengali"
                )
                category_dropdown = gr.Dropdown(
                    choices=["text-generation", "image-text-to-text", "all"],
                    value="text-generation",
                    label="ক্যাটাগরি ফিল্টার"
                )
                search_trigger = gr.Button("🔍 অনুসন্ধান করুন", variant="primary")
            with gr.Column(scale=1):
                search_output = gr.Markdown("সার্চ ফলাফল এখানে দেখা যাবে...")

        search_trigger.click(
            fn=search_models,
            inputs=[query_input, category_dropdown],
            outputs=search_output
        )

        gr.Markdown("---")
        gr.Markdown("### 📥 নির্দিষ্ট Repo ID দিয়ে মডেল ডাউনলোড করুন")
        with gr.Row():
            with gr.Column(scale=1):
                repo_input = gr.Textbox(
                    label="Hugging Face Model Repo ID",
                    placeholder="যেমন: TinyLlama/TinyLlama-1.1B-Chat-v1.0 বা unsloth/mistral-7b-instruct-v0.3-bnb-4bit"
                )
                download_trigger = gr.Button("📥 ডাউনলোড শুরু করুন", variant="primary")
            with gr.Column(scale=1):
                download_status = gr.Textbox(label="ডাউনলোড প্রগ্রেস / স্ট্যাটাস", lines=3)

        download_trigger.click(
            fn=download_hf_model,
            inputs=repo_input,
            outputs=download_status
        )
