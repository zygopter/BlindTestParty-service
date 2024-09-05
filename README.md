# BlindTest Party - Backend

This is the **backend** for the BlindTest Party app, which serves as the game engine. It provides song clips via Spotify, manages game sessions, and handles communication with the frontend.

## Table of Contents
- [Technologies](#technologies)
- [Features](#features)
- [Setup and Installation](#setup-and-installation)
- [Environment Variables](#environment-variables)
- [Running the Project Locally](#running-the-project-locally)
- [Deployment](#deployment)
- [Endpoints](#endpoints)

## Technologies
- **Node.js** with **Express.js** for the server
- **Spotify API** for music clips
- **OpenAI GPT-4** for game logic (TTS, question handling)
- **Axios** for API communication
- **Render** for backend hosting
- **MongoDB (optional)** for session persistence

## Features
- Manages game sessions and user guesses.
- Connects to Spotify for fetching song clips.
- Provides a REST API for game interaction with the frontend.
- OpenAI integration for game logic and responses.
  
## Setup and Installation

### Prerequisites
- **Node.js** and **npm** installed locally.
- A **Spotify Developer Account** with API credentials.
- An account with **OpenAI** (for game logic and TTS).
- Deployed on **Render** or another server provider.

### Steps to Install Locally
1. Clone this repository:
   ```bash
   git clone https://github.com/your-repo/blindtest-backend.git
   cd blindtest-backend
2. Install the dependencies:
    ```bash Copier le code
    npm install
    ```
3. Set up your environment variables in a `.env` file (see below).

## Environment Variables
Create a `.env` file at the root of the project with the following variables:
```bash
ALLOWED_ORIGIN=https://your-frontend-url.com
OPENAI_API_KEY=your-openai-api-key
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
```

## Running the Project Locally
To run the development server:
```bash
npm start
```
This will start the React app on `http://localhost:3000`.

## Deployment
For deployment, the project uses **Render**.

## Endpoints

### Start a New Game

- **Endpoint**: `POST /start-game`
- **Description**: Starts a new game and returns a game ID.
- **Parameters**: None
- **Response**:
```json
{
  "message": "Game started",
  "gameId": "1234567890",
  "gptAnswer": "Welcome to the game!",
  "gameState": { ... }
}
```

### Choose a theme

- **Endpoint**: `POST /choose-theme`
- **Description**: Chooses a theme for the game.
- **Parameters**:
```json
{
  "gameId": "1234567890",
  "theme": "1980s"
}
```
- **Response**:
```json
{
  "message": "Theme chosen",
  "gptAnswer": {
    "texte": "You chose the 1980s, awesome! You can start the game as soon as you're ready by pressing the button.",
    "theme": "1980s"
  },
  "gameState": { ... }
}
```

### Start a song clip

- **Endpoint**: `POST /start-song`
- **Description**: Starts a song clip based on the chosen theme.
- **Parameters**:
```json
{
  "gameId": "1234567890"
}
```
- **Response**:
```json
{
  "message": "Song is ready to play!",
  "trackUrl": "https://spotify-url-to-track",
  "parsedAnswer": { ... },
  "gameState": { ... }
}
```

### Submit an answer

- **Endpoint**: `POST /submit-answer`
- **Description**: Submits an answer to a song clip.
- **Parameters**:
```json
{
  "gameId": "1234567890",
  "userAnswer": "Kenny Loggins - Footloose"
}
```
- **Response**:
```json
{
  "message": "Correct! You guessed the song.",
  "parsedAnswer": { ... },
  "success": true,
  "points": 3
}
```

### Complete an answer

- **Endpoint**: `POST /complete-answer`
- **Description**: Completes an answer with additional details.
- **Parameters**:
```json
{
  "gameId": "1234567890",
  "userAnswer": "The title is Footloose and the artist is Kenny Loggins."
}
```
- **Response**:
```json
{
  "message": "Correct! You guessed the song.",
  "parsedAnswer": { ... },
  "success": true,
  "points": 3
}
```
