# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Create a non-root user and group
RUN addgroup --system appuser && adduser --system --group appuser

# Copy the current directory contents into the container at /app
COPY . .

# Change ownership of the application files to the non-root user
RUN chown -R appuser:appuser /app

# Switch to the non-root user
USER appuser

# Expose port 5000 for the app
EXPOSE 5010

# Run the application using Gunicorn for a production-ready, multi-user setup
CMD sh -c "gunicorn -w 4 -b 0.0.0.0:${PORT:-5010} 'app:create_app()'"
