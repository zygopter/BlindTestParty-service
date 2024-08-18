const express = require('express');
const axios = require('axios');
const router = express.Router();

const callChatGPT = require('../utils/openai');

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
    maxSongs: 5
  };

  gameStates[gameId] = gameState;

  try {
    const messages = [
      { role: "user", content: `L'utilisateur a démarré le jeu, accueille le et propose lui de choisir un thème pour cette partie.` }
    ];

    const gptAnswer = await callChatGPT(messages);

    res.json({ message: 'Game started', gameId, gptAnswer, gameState });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Failed to process the theme' });
  }
});

router.post('/choose-theme', async (req, res) => {
  const { gameId, theme } = req.body;
  const gameState = gameStates[gameId];

  if (!gameState) {
    return res.status(404).json({ error: 'Game not found' });
  }

  if (gameState.gameStep !== 'CHOOSE_THEME') {
    return res.status(400).json({ error: 'Theme already chosen or invalid game state' });
  }

  console.log('User chose theme:', theme);
  
  try {
    const messages = [
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
    ];
    
    const gptAnswer = await callChatGPT(messages);

    let parsedAnswer;
    try {
      parsedAnswer = JSON.parse(gptAnswer);
      console.log('Parsed GPT answer:', parsedAnswer);
    } catch (error) {
      console.error('Failed to parse GPT answer as JSON:', gptAnswer);
      return res.status(500).json({ error: 'Failed to parse GPT answer as JSON' });
    }
    
    const extractedTheme = parsedAnswer.theme || "";
    
    gameState.theme = extractedTheme;
    gameState.gameStep = 'THEME_CHOSEN';

    return res.json({ message: 'Theme chosen', gptAnswer: parsedAnswer.texte, gameState });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Failed to process the theme' });
  }
});

// Endpoint pour démarrer un extrait
router.post('/start-song', async (req, res) => {
  const { gameId } = req.body;
  const gameState = gameStates[gameId];

  if (!gameState) {
    return res.status(404).json({ error: 'Game not found' });
  }

  if (gameState.gameStep === 'CHOOSE_THEME') {
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
      const messages = [
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
      ];
      console.log('Messages sent to GPT:', messages);

      const gptAnswer = await callChatGPT(messages);

      let parsedAnswer;
      try {
        parsedAnswer = JSON.parse(gptAnswer);
        console.log('Parsed GPT answer:', parsedAnswer);
      } catch (error) {
        console.error('Failed to parse GPT answer as JSON:', gptAnswer);
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

          return res.json({
            message: 'Song is ready to play!',
            trackUrl: track.preview_url,
            parsedAnswer,
            gameState
          });
        }
        else {
          unavailableTracks.push({ artiste, titre });
          console.log(`Track not available: ${artiste} - ${titre}. Requesting another song.`);
        }
      }
    }
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Failed to start the song' });
  }
});

// Endpoint pour soumettre une réponse
router.post('/guess-answer', async (req, res) => {
  const { gameId, userAnswer } = req.body;
  const gameState = gameStates[gameId];

  if (!gameState) {
    return res.status(404).json({ error: 'Game not found' });
  }

  const { artiste, titre } = gameState.currentSong;

  if (!artiste || !titre) {
    return res.status(400).json({ error: 'No song is currently being played.' });
  }

  console.log('Checking user answer:', userAnswer);
  console.log('Current song:', gameState.currentSong);

  try {
    const messages = [
      { role: "system", content: `
        L'extrait a deviner est ${titre} de ${artiste}. Tu dois évaluer si la réponse est correcte ou non et si elle est complète ou non.
        Une réponse complète (artiste et titre) vaut 3 points, une réponse incomplète vaut 1 point, une réponse fausse vaut 0 point.
        Ta réponse doit être formatée en JSON de manière concise et précise.
        Le format de la réponse doit être :

        {
          "texte": "Texte que le présentateur doit dire.",
          "pointsEarned": number_of_points_earned
        }

        Par exemple, une réponse pourrait ressembler à ceci :

        {
          "texte": "Bravo vous avez trouvez la réponse en partie !",
          "pointsEarned": 1
        }`
      },
      { role: "user", content: userAnswer }
    ];
  
    const gptAnswer = await callChatGPT(messages);

    // Extraire l'artiste et le titre de la réponse de GPT
    let parsedAnswer;
    try {
      parsedAnswer = JSON.parse(gptAnswer);
      console.log('Parsed GPT answer:', parsedAnswer);
    } catch (error) {
      console.error('Failed to parse GPT answer as JSON:', gptAnswer);
      return res.status(500).json({ error: 'Failed to parse GPT answer as JSON' });
    }

    const pointsEarned = parsedAnswer.pointsEarned;
    gameState.points += pointsEarned;

    if (pointsEarned>0) {
      return res.json({ message: 'Correct! You guessed the song.', gptAnswer, success: true, points: gameState.points });
    } else {
      return res.json({ message: 'Incorrect. Try again!', gptAnswer, success: false, points: gameState.points });
    }
  } catch (error) {
    console.error('Error communicating with OpenAI:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to process the answer' });
  }

});

// Endpoint pour jouer une chanson
router.post('/play-song', async (req, res) => {
    const { artist, title } = req.body;
  
    try {
      const accessToken = await getSpotifyToken();
  
      // Rechercher la chanson sur Spotify
      const spotifyResponse = await axios.get('https://api.spotify.com/v1/search', {
        params: {
          q: `artist:${artist} track:${title}`,
          type: 'track',
          limit: 1
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
  
      const track = spotifyResponse.data.tracks.items[0];
  
      if (track && track.preview_url) {
        res.json({ trackUrl: track.preview_url });
      } else {
        console.error('No preview available for this track, asking GPT for another one.');
        askForNewExtract(res);
      }
    } catch (error) {
      console.error('Error searching for song:', error);
      askForNewExtract(res);
    }
});  

const getSpotifyToken = async () => {
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', 'grant_type=client_credentials', {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${process.env.REACT_APP_SPOTIFY_CLIENT_ID}:${process.env.REACT_APP_SPOTIFY_CLIENT_SECRET}`).toString('base64')
        }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting Spotify token:', error);
        throw new Error('Failed to authenticate with Spotify');
    }
};

// Function to check song availability
const searchSongOnSpotify = async (artist, title) => {
  try {
    const accessToken = await getSpotifyToken();
    const response = await axios.get('https://api.spotify.com/v1/search', {
      params: {
        q: `artist:${artist} track:${title}`,
        type: 'track',
        limit: 1
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.data.tracks.items.length > 0) {
      const track = response.data.tracks.items[0];
      if (checkSongAvailability(track)) return track;
      else return null;
    } else {
      console.error('No tracks found for this artist and title.');
      return null;
    }
  } catch (error) {
    console.error('Error searching for song on Spotify:', error.message);
    return null;
  }
};

const checkSongAvailability = (track) => {
  if (track && track.preview_url) {
    console.log('Track is available on Spotify:', track.preview_url);
    return true;
  } else {
    console.error('Track is not available on Spotify.');
    return false;
  }
};


// Fonction pour demander un nouvel extrait à GPT
const askForNewExtract = async (res) => {
    try {
      const messages = [
        { role: "system", content: "Tu es un animateur de jeu de blindtest. Demande à l'utilisateur de deviner le titre de la chanson et l'artiste, et donne un retour sur la réponse." },
        { role: "user", content: "L'extrait précédent n'est pas disponible, propose un autre extrait de chanson." }
      ];
    
      const gptAnswer = await callChatGPT(messages);
  
      res.json({ message: 'New song suggested by GPT', gptAnswer });
  
    } catch (error) {
      console.error('Error communicating with OpenAI:', error.response ? error.response.data : error.message);
      res.status(500).json({ error: 'Failed to get a new extract' });
    }
};

module.exports = router;
