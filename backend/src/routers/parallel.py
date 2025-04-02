# matrix is an object to be looped over
# process is a function to be applied to each element of the matrix
# args is a list of arguments to be passed to the process function
async def parallel_process(matrix, process, args = []):
  import asyncio
  tasks = [process(matrix, *args) for m in matrix]
  return await asyncio.gather(*tasks)