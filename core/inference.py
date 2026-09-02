import threading
from transformers import TextIteratorStreamer
from core.model_loader import model_manager

def stream_chat_response(message: str, history: list, max_new_tokens: int = 512, temperature: float = 0.7, top_p: float = 0.9):
    """
    Yields streamed token responses for Gradio ChatInterface.
    Uses chat templates when provided by the tokenizer.
    """
    model = model_manager.current_model
    tokenizer = model_manager.current_tokenizer

    if model is None or tokenizer is None:
        yield "⚠️ বর্তমানে কোনো মডেল সক্রিয় নেই! অনুগ্রহ করে **'মডেল ম্যানেজার'** ট্যাব থেকে একটি মডেল লোড করুন।"
        return

    try:
        # Build chat message structure
        messages = []
        for user_msg, bot_msg in history:
            if user_msg:
                messages.append({"role": "user", "content": user_msg})
            if bot_msg:
                messages.append({"role": "assistant", "content": bot_msg})
        messages.append({"role": "user", "content": message})

        # Apply tokenizer chat template
        if hasattr(tokenizer, "apply_chat_template") and tokenizer.chat_template:
            prompt_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        else:
            prompt_text = ""
            for msg in messages:
                role = "User" if msg["role"] == "user" else "Assistant"
                prompt_text += f"{role}: {msg['content']}\n"
            prompt_text += "Assistant: "

        inputs = tokenizer(prompt_text, return_tensors="pt").to(model.device)
        streamer = TextIteratorStreamer(tokenizer, timeout=60.0, skip_prompt=True, skip_special_tokens=True)

        generation_kwargs = dict(
            **inputs,
            streamer=streamer,
            max_new_tokens=int(max_new_tokens),
            do_sample=temperature > 0.0,
            temperature=float(temperature),
            top_p=float(top_p)
        )

        thread = threading.Thread(target=model.generate, kwargs=generation_kwargs)
        thread.start()

        accumulated_text = ""
        for new_text in streamer:
            accumulated_text += new_text
            yield accumulated_text

    except Exception as e:
        yield f"❌ ইনফারেন্স এরর: {str(e)}"
