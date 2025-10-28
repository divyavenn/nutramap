# matrix is an object to be looped over
# process is a function to be applied to each element of the matrix
# args is a list of arguments to be passed to the process function
async def parallel_process(matrix, process, args = []):
  import asyncio
  tasks = [process(m, *args) for m in matrix]
  return await asyncio.gather(*tasks)


def batch_process_gpu(data: list, batch_size: int = 256):
  try:
    # Check if we're running on Modal with GPU
    import torch
    if torch.cuda.is_available():
      print(f"✓ GPU available for batch processing: {torch.cuda.get_device_name(0)}")
      return _process_gpu_batch(data, batch_size)
    else:
      print("⚠ No GPU available, falling back to CPU batch processing")
      return _process_cpu_batch(data, batch_size)
  except ImportError:
    # torch not available, fall back to CPU
    print("⚠ PyTorch not available, using CPU batch processing")
    return _process_cpu_batch(data, batch_size)


def _process_gpu_batch(data: list, batch_size: int):
  """Process data in batches on GPU."""
  import torch

  # This is a generic GPU batch processor
  # Specific implementations should be done in the calling code
  results = []

  for i in range(0, len(data), batch_size):
    batch = data[i:i + batch_size]
    # Process batch on GPU
    # (implementation depends on the specific operation)
    results.extend(batch)

  return results


def _process_cpu_batch(data: list, batch_size: int):
  """Process data in batches on CPU."""
  results = []

  for i in range(0, len(data), batch_size):
    batch = data[i:i + batch_size]
    # Process batch on CPU
    # (implementation depends on the specific operation)
    results.extend(batch)

  return results