ARG PORT

# Use Miniconda as the base image
FROM continuumio/miniconda3:latest

# Set the working directory
WORKDIR /app
ENV PORT=${PORT}

# Copy the conda environment file
COPY environment.yml .

# Set PATH to include conda binaries
ENV PATH=/opt/conda/bin:$PATH

# Create the conda environment
RUN conda env create -f environment.yml

# Ensure the Conda environment is activated
ENV CONDA_DEFAULT_ENV=nutramapEnv
ENV PATH=/opt/conda/envs/nutramapEnv/bin:$PATH

# Copy the rest of the application code into the container
COPY . .

# Expose the application port
EXPOSE $PORT

# Command to activate the Conda environment and run Uvicorn
CMD ["bash", "-c", "source activate nutramapEnv && uvicorn main:app --host 0.0.0.0 --port ${PORT}"]