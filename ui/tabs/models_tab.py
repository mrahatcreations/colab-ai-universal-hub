import gradio as gr
from core.hf_hub import list_downloaded_models, delete_downloaded_model
from core.model_loader import model_manager

def create_models_tab(vram_display, active_model_display):
    with gr.Tab("💾 ডাউনলোডকৃত মডেল (Model Manager)"):
        gr.Markdown(
            "### ডিস্কে থাকা মডেল ম্যানেজমেন্ট\n"
            "*(একবারে মেমরিতে শুধুমাত্র **১টি মডেল** থাকবে। নতুন মডেল লোড করার সাথে সাথে পূর্বের মডেল স্বয়ংক্রিয়ভাবে মেমরি থেকে রিলিজ হয়ে যাবে।)*"
        )
        with gr.Row():
            with gr.Column(scale=1):
                model_dropdown = gr.Dropdown(
                    choices=list_downloaded_models(),
                    label="সংরক্ষিত মডেলসমূহ",
                    value=list_downloaded_models()[0] if list_downloaded_models() else None
                )
                quant_radio = gr.Radio(
                    choices=["4bit", "8bit", "fp16"],
                    value="4bit",
                    label="Quantization মোড (T4 GPU-র জন্য 4-Bit বাধ্যতামূলক)"
                )
                with gr.Row():
                    run_btn = gr.Button("⚡ মডেল লোড করুন (Run)", variant="primary")
                    refresh_btn = gr.Button("🔄 রিফ্রেশ তালিকা")
                with gr.Row():
                    unload_btn = gr.Button("🧹 মেমরি খালি করুন (Unload)", variant="stop")
                    delete_btn = gr.Button("🗑️ ডিস্ক থেকে ডিলিট", variant="secondary")

            with gr.Column(scale=1):
                action_log = gr.Textbox(label="অ্যাকশন লগ / স্ট্যাটাস", lines=6)

        # Handlers
        def handle_load(model_id, quant):
            msg, vram, active = model_manager.load_model(model_id, quant)
            return msg, vram, active

        def handle_unload():
            msg, vram, active = model_manager.unload_model()
            return msg, vram, active

        def handle_refresh():
            models = list_downloaded_models()
            new_val = models[0] if models else None
            return gr.update(choices=models, value=new_val)

        def handle_delete(model_id):
            if model_id == model_manager.active_model_name:
                model_manager.unload_model()
            msg = delete_downloaded_model(model_id)
            models = list_downloaded_models()
            new_val = models[0] if models else None
            return msg, gr.update(choices=models, value=new_val)

        run_btn.click(
            fn=handle_load,
            inputs=[model_dropdown, quant_radio],
            outputs=[action_log, vram_display, active_model_display]
        )
        unload_btn.click(
            fn=handle_unload,
            outputs=[action_log, vram_display, active_model_display]
        )
        refresh_btn.click(
            fn=handle_refresh,
            outputs=model_dropdown
        )
        delete_btn.click(
            fn=handle_delete,
            inputs=[model_dropdown],
            outputs=[action_log, model_dropdown]
        )
