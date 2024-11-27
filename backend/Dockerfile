# Use Miniconda as the base image
FROM continuumio/miniconda3:latest

# Set the working directory
WORKDIR /app

# Copy the conda environment file
COPY environment.yml .

# Create the conda environment
RUN conda env create -f environment.yml

# Activate the environment and ensure it's available
ENV PATH=/opt/conda/envs/app-env/bin:$PATH

# Copy the rest of the application code
COPY . .

RUN ls -la

# Expose the port
EXPOSE 8000

# Activate the environment and run the backend application
CMD ["bash", "-c", "source activate nutramapEnv && uvicorn main:app --host 0.0.0.0 --port 8000"]