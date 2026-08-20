# Use official Python 3.11 slim image
FROM python:3.11-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Install system build dependencies required for demoparser2
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    bzip2-doc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirement definition and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Run watcher process
CMD ["python", "-u", "watcher.py"]
