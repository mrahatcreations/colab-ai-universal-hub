import gradio as gr
from core.inference import stream_chat_response

def create_chat_tab():
    with gr.Tab("💬 চ্যাট (Chat)"):
        gr.ChatInterface(
            fn=stream_chat_response,
            additional_inputs=[
                gr.Slider(64, 2048, value=512, step=64, label="Max New Tokens (সর্বোচ্চ টোকেন)"),
                gr.Slider(0.1, 1.5, value=0.7, step=0.1, label="Temperature (সৃজনশীলতা)"),
                gr.Slider(0.1, 1.0, value=0.9, step=0.05, label="Top P")
            ]
        )
