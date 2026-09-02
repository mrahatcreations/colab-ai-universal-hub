import gc
import torch
import logging

logger = logging.getLogger("VRAMManager")

def free_gpu_memory():
    """Forces garbage collection and clears PyTorch CUDA memory cache."""
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()
    logger.info("VRAM cache flushed successfully.")
    return "✅ GPU মেমরি খালি করা হয়েছে।"

def get_vram_telemetry():
    """Returns human-readable VRAM stats."""
    if not torch.cuda.is_available():
        return "💻 **রানটাইম:** CPU মোডে সক্রিয় (কোনো GPU সক্রিয় নেই)"
    
    device_name = torch.cuda.get_device_name(0)
    total_mem = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    allocated_mem = torch.cuda.memory_allocated(0) / (1024 ** 3)
    reserved_mem = torch.cuda.memory_reserved(0) / (1024 ** 3)
    free_mem = total_mem - reserved_mem
    
    return (
        f"🖥️ **GPU:** `{device_name}` | "
        f"**ব্যবহৃত VRAM:** `{allocated_mem:.2f} GB` / `{total_mem:.2f} GB` "
        f"(রিসার্ভড: `{reserved_mem:.2f} GB`, ফাঁকা: `{free_mem:.2f} GB`)"
    )
