import gradio as gr
from core.inference import stream_chat_response

def create_chat_tab():
    with gr.Tab("💬 ChatGPT Interface"):
        chatbot = gr.Chatbot(
            height=600,
            show_label=False,
            render_markdown=True,
            avatar_images=(
                "https://api.iconify.design/solar:user-bold.svg?color=%238e8ea0",
                "https://api.iconify.design/ri:sparkling-2-fill.svg?color=%2310a37f"
            ),
            elem_id="chatgpt-chatbot"
        )
        textbox = gr.Textbox(
            placeholder="Message Colab AI...",
            container=False,
            scale=8,
            elem_id="chatgpt-input"
        )

        with gr.Accordion("⚙️ Parameters (টোকেন ও ক্রিয়েটিভিটি সেটিংস)", open=False):
            with gr.Row():
                max_tokens = gr.Slider(64, 2048, value=512, step=64, label="Max New Tokens")
                temperature = gr.Slider(0.1, 1.5, value=0.7, step=0.1, label="Temperature")
                top_p = gr.Slider(0.1, 1.0, value=0.9, step=0.05, label="Top P")

        gr.ChatInterface(
            fn=stream_chat_response,
            chatbot=chatbot,
            textbox=textbox,
            additional_inputs=[max_tokens, temperature, top_p],
            examples=[
                "হ্যালো! আপনি কী কী করতে পারেন?",
                "Write a clean Python script to scrape a webpage.",
                "Explain quantum computing in simple terms."
            ]
        )
