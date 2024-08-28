const express = require('express');
const axios = require('axios');
const router = express.Router();

const callChatGPT = require('../utils/openai');
const { getSpotifyToken, searchSongOnSpotify, checkSongAvailability } = require('../utils/spotify');
const { logMessage } = require('../utils/logger');


// Utiliser un simple stockage en mémoire pour l'état du jeu (pour développement)
let gameStates = {};
let unavailableTracks = [];


// Endpoint pour démarrer un nouveau jeu
router.post('/start-game', async (req, res) => {
  const gameId = Date.now().toString(); // ID unique basé sur le timestamp
  const gameState = {
    points: 0,
    songCount: 0,
    currentSong: {},
    theme: '',
    songHistory: [],
    gameStep: 'CHOOSE_THEME',
    maxSongs: 5,
    guessedItems: {},
    messageHistory: []
  };

  gameStates[gameId] = gameState;

  try {
    logMessage(`Starting new game with ID: ${gameId}`);
    gameState.messageHistory.push({ role: "user", content: `L'utilisateur a démarré le jeu, accueille le et propose lui de choisir un thème pour cette partie.` });

    const gptAnswer = await callChatGPT(gameState.messageHistory);
    gameState.messageHistory.push(
      { role: "assistant", content: gptAnswer}
    );

    logMessage(`Game started successfully. GPT Answer: ${gptAnswer}`);
    return res.json({ message: 'Game started', gameId, gptAnswer, gameState });
  } catch (error) {
    logMessage(`Error starting game: ${error.message}`, 'error');
    return res.status(500).json({ error: 'Failed to process the theme' });
  }
});

router.post('/choose-theme', async (req, res) => {
  const { gameId, theme } = req.body;
  const gameState = gameStates[gameId];

  if (!gameState) {
    logMessage('Game not found', 'error');
    return res.status(404).json({ error: 'Game not found' });
  }

  if (gameState.gameStep !== 'CHOOSE_THEME') {
    logMessage('Invalid game step for choosing theme', 'error');
    return res.status(400).json({ error: 'Theme already chosen or invalid game state' });
  }
  
  try {
    logMessage(`User chose theme: ${theme} for game ID: ${gameId}`);
    gameState.messageHistory.push(
      { role: "system", content: `L'utilisateur va choisir un thème pour le blind test musical. Tu dois extraire le thème choisi pour le redonner dans ta réponse.
        Tu dois informer l'utilisateur qu'il peut maintenant lancer la partie en appuyent sur le bouton depuis l'interface.
        Ta réponse doit être formatée en JSON de manière concise et précise.
        Le format de la réponse doit être :
        
        {
          "texte": "Texte que le présentateur doit dire.",
          "theme": "Thème proposé par l'utilisateur"
        }
        
        Par exemple, une réponse pourrait ressembler à ceci :
        
        {
          "texte": "Vous avez choisi les années 80, j'adore ! Vous allez pouvoir démarrer la partie dès que vous êtes prèts en appuyant sur le bouton!",
          "theme": "Années 80"
        }
        
        Si l'utilisateur ne sait pas, choisis pour lui.`
      },
      { role: "user", content: `${theme}` }
    );
    
    const gptAnswer = await callChatGPT(gameState.messageHistory);
    gameState.messageHistory.push(
      { role: "assistant", content: gptAnswer}
    );

    let parsedAnswer;
    try {
      parsedAnswer = JSON.parse(gptAnswer);
    } catch (error) {
      logMessage(`Failed to parse GPT answer as JSON: ${gptAnswer}`, 'error');
      return res.status(500).json({ error: 'Failed to parse GPT answer as JSON' });
    }
    
    const extractedTheme = parsedAnswer.theme || "";
    
    gameState.theme = extractedTheme;
    gameState.gameStep = 'THEME_CHOSEN';

    logMessage(`Theme chosen successfully: ${extractedTheme}`);
    return res.json({ message: 'Theme chosen', gptAnswer: parsedAnswer.texte, gameState });
  } catch (error) {
    logMessage(`Failed to process the theme: ${error.message}`, 'error');
    res.status(500).json({ error: 'Failed to process the theme' });
  }
});

// Endpoint pour démarrer un extrait
router.post('/start-song', async (req, res) => {
  const { gameId } = req.body;
  const gameState = gameStates[gameId];

  if (!gameState) {
    logMessage('Game not found', 'error');
    return res.status(404).json({ error: 'Game not found' });
  }

  if (gameState.gameStep === 'CHOOSE_THEME') {
    logMessage('Theme not chosen before starting song', 'error');
    return res.status(400).json({ error: 'You must choose a theme first' });
  }

  try {
    while (true) {
      const unavailableTracksText = unavailableTracks
        .map(track => `${track.artiste} - ${track.titre}`)
        .join(', ');
      const alreadyPlayedTracksText = gameState.songHistory
        .map(track => `${track.artiste} - ${track.titre}`)
        .join(', ');
      gameState.messageHistory.push(
        { role: "system", content: `
          L'utilisateur a choisi le thème ${gameState.theme}.
          Ta réponse doit être formatée en JSON de manière concise et précise.
          Le format de la réponse doit être :

          {
            "texte": "Texte que le présentateur doit dire.",
            "extrait": {
              "artiste": "Nom de l'artiste",
              "titre": "Titre de la chanson"
            }
          }

          Par exemple, une réponse pourrait ressembler à ceci :

          {
            "texte": "Voici le premier extrait, soyez prêts !",
            "extrait": {
              "artiste": "Kenny Loggins",
              "titre": "Footloose"
            }
          }`
        },
        { role: "user", content: `Propose un extrait de chanson correspondant au thème. Tu en es au tour ${gameState.songCount+1} de cette partie.
          Ne rejoue pas ces musiques que tu as déjà jouées: ${alreadyPlayedTracksText || 'aucune pour le moment'}.
          N'utilise pas ces musiques qui sont indisponibles: ${unavailableTracksText}` }
      );

      const gptAnswer = await callChatGPT(gameState.messageHistory);
      const cleanedGptAnswer = cleanJsonString(gptAnswer);
      gameState.messageHistory.push(
        { role: "assistant", content: gptAnswer}
      );

      let parsedAnswer;
      try {
        parsedAnswer = JSON.parse(cleanedGptAnswer);
      } catch (error) {
        logMessage(`Failed to parse GPT answer as JSON: ${cleanedGptAnswer}`, 'error');
        return res.status(500).json({ error: 'Failed to parse GPT answer as JSON' });
      }

      const { artiste, titre } = parsedAnswer.extrait || {};

      // Verify song availability
      if (artiste && titre) {
        const track = await searchSongOnSpotify(artiste, titre);
        if (track) {
          // Stocker l'extrait en cours dans l'état du jeu
          gameState.currentSong = { artiste, titre };
          gameState.songHistory.push({ artiste, titre });
          gameState.songCount += 1;
          gameState.gameStep = 'PLAY_CLIP';
          gameState.guessedItems = {};

          logMessage(`Song found and ready to play: ${artiste} - ${titre}`);
          return res.json({
            message: 'Song is ready to play!',
            trackUrl: track.preview_url,
            parsedAnswer,
            gameState
          });
        }
        else {
          unavailableTracks.push({ artiste, titre });
          logMessage(`Track not available on Spotify: ${artiste} - ${titre}. Requesting another song.`);
        }
      }
    }
  } catch (error) {
    logMessage(`Error starting song: ${error.message}`, 'error');
    return res.status(500).json({ error: 'Failed to start the song' });
  }
});

// Endpoint pour soumettre une réponse
router.post('/guess-answer', async (req, res) => {
  const { gameId, userAnswer } = req.body;
  const gameState = gameStates[gameId];

  if (!gameState) {
    logMessage('Game not found', 'error');
    return res.status(404).json({ error: 'Game not found' });
  }

  const { artiste, titre } = gameState.currentSong;

  if (!artiste || !titre) {
    logMessage('No song is currently being played', 'error');
    return res.status(400).json({ error: 'No song is currently being played.' });
  }

  console.log('Checking user answer:', userAnswer);
  console.log('Current song:', gameState.currentSong);

  try {
    logMessage(`User submitted an answer for song: ${artiste} - ${titre}`);
    gameState.messageHistory.push(
      { role: "system", content: `
        L'extrait à deviner est ${titre} de ${artiste}. 
        Tu dois évaluer si la réponse est correcte, partielle ou incorrecte.
        Une réponse complète (artiste et titre) vaut 3 points,
        une réponse partielle vaut 1 point, et une réponse incorrecte vaut 0 point.
        Si la réponse est partielle, encourage l'utilisateur à compléter sa réponse.
        La réponse doit être formatée en JSON de manière concise et précise.
        Le format de la réponse doit être :
        {
          "texte": "Texte que le présentateur doit dire.",
          "pointsEarned": number_of_points_earned,
          "guessedItems": {
              "artiste": true_or_false,
              "titre": true_or_false
          }
        }
        Exemple:
        {
          "texte": "Bravo, vous avez trouvé le titre ! Il ne manque plus que l'artiste.",
          "pointsEarned": 1,
          "guessedItems": {
            "artiste": false,
            "titre": true
          }
        }`
      },
      { role: "user", content: userAnswer }
    );
  
    const gptAnswer = await callChatGPT(gameState.messageHistory);
    const cleanedGptAnswer = cleanJsonString(gptAnswer);
    gameState.messageHistory.push(
      { role: "assistant", content: gptAnswer}
    );

    // Extraire l'artiste et le titre de la réponse de GPT
    let parsedAnswer;
    try {
      parsedAnswer = JSON.parse(cleanedGptAnswer);
    } catch (error) {
      logMessage(`Failed to parse GPT answer as JSON: ${cleanedGptAnswer}`, 'error');
      return res.status(500).json({ error: 'Failed to parse GPT answer as JSON' });
    }

    if (!parsedAnswer.guessedItems.artiste && !parsedAnswer.guessedItems.titre) {
      logMessage('User guessed incorrectly');
      return res.json({ message: 'Incorrect. Try again!', parsedAnswer, success: false, points: gameState.points });
    } else if (!parsedAnswer.guessedItems.artiste || !parsedAnswer.guessedItems.titre) {
      logMessage(`User guessed partially, let's try again`);
      gameState.guessedItems = parsedAnswer.guessedItems;
      return res.json({ message: 'Partial answer, encourage user to complete.', parsedAnswer, success: false, points: gameState.points });
    } else {
      const pointsEarned = parsedAnswer.pointsEarned;
      gameState.points += pointsEarned;
      logMessage(`User guessed correctly, points earned: ${pointsEarned}`);
      return res.json({ message: 'Correct! You guessed the song.', parsedAnswer, success: true, points: gameState.points });
    }
  } catch (error) {
    logMessage(`Error processing answer: ${error.message}`, 'error');
    res.status(500).json({ error: 'Failed to process the answer' });
  }

});

// Endpoint pour compléter une réponse
router.post('/complete-answer', async (req, res) => {
  const { gameId, userAnswer } = req.body;
  const gameState = gameStates[gameId];

  if (!gameState) {
    logMessage('Game not found', 'error');
    return res.status(404).json({ error: 'Game not found' });
  }

  const { artiste, titre } = gameState.currentSong;

  if (!artiste || !titre) {
    logMessage('No song is currently being played', 'error');
    return res.status(400).json({ error: 'No song is currently being played.' });
  }

  console.log('Checking user answer:', userAnswer);
  console.log('Current song:', gameState.currentSong);

  try {
    logMessage(`User submitted an answer for song: ${artiste} - ${titre}`);
    let concatenatedUserAnswer = userAnswer;
    if (gameState.guessedItems.artiste) {
      concatenatedUserAnswer += ` et l'artiste est ${artiste}.`;
    } else if (gameState.guessedItems.titre) {
      concatenatedUserAnswer += ` et le titre est ${titre}.`;
    }
    gameState.messageHistory.push(
      { role: "system", content: `
        L'extrait à deviner est ${titre} de ${artiste}. 
        Tu dois évaluer si la réponse est correcte, partielle ou incorrecte.
        Une réponse complète (artiste et titre) vaut 3 points,
        une réponse partielle vaut 1 point, et une réponse incorrecte vaut 0 point.
        La réponse doit être formatée en JSON de manière concise et précise.
        Le format de la réponse doit être :
        {
          "texte": "Texte que le présentateur doit dire.",
          "pointsEarned": number_of_points_earned,
          "guessedItems": {
              "artiste": true_or_false,
              "titre": true_or_false
          }
        }
        Exemple:
        {
          "texte": "Bravo, vous avez trouvé le titre ! L'artiste était "Kenny Loggins".",
          "pointsEarned": 1,
          "guessedItems": {
            "artiste": false,
            "titre": true
          }
        }`
      },
      { role: "user", content: concatenatedUserAnswer }
    );
    
    const gptAnswer = await callChatGPT(gameState.messageHistory);
    const cleanedGptAnswer = cleanJsonString(gptAnswer);
    gameState.messageHistory.push(
      { role: "assistant", content: gptAnswer}
    );

    // Extraire l'artiste et le titre de la réponse de GPT
    let parsedAnswer;
    try {
      parsedAnswer = JSON.parse(cleanedGptAnswer);
    } catch (error) {
      logMessage(`Failed to parse GPT answer as JSON: ${cleanedGptAnswer}`, 'error');
      return res.status(500).json({ error: 'Failed to parse GPT answer as JSON' });
    }

    const pointsEarned = parsedAnswer.pointsEarned;
    gameState.points += pointsEarned;

    if (pointsEarned > 0) {
      logMessage(`User guessed correctly, points earned: ${pointsEarned}`);
      return res.json({ message: 'Correct! You guessed the song.', parsedAnswer, success: true, points: gameState.points });
    } else {
      logMessage('User guessed incorrectly');
      return res.json({ message: 'Incorrect. Try again!', parsedAnswer, success: false, points: gameState.points });
    }
  } catch (error) {
    logMessage(`Error processing answer: ${error.message}`, 'error');
    res.status(500).json({ error: 'Failed to process the answer' });
  }

});

const cleanJsonString = (jsonString) => {
  // Utiliser une expression régulière pour remplacer uniquement les guillemets dans les valeurs
  return jsonString.replace(/"([^"]+)":\s*"([^"]*)"/g, function(match, p1, p2) {
    // Remplacer les guillemets à l'intérieur des valeurs par des guillemets simples
    const cleanedValue = p2.replace(/"/g, "'");
    return `"${p1}": "${cleanedValue}"`;
  });
};

// Endpoint to log message history
router.post('/log-message-history', async (req, res) => {
  const { gameId } = req.body;
  const gameState = gameStates[gameId];
  logMessage(gameState.messageHistory, 'info');
  res.json({ history: gameState.messageHistory });
});

module.exports = router;
