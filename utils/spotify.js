const axios = require('axios');

// Fonction pour obtenir un token Spotify
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
    console.error('Error getting Spotify token:', error.message);
    throw new Error('Failed to authenticate with Spotify');
  }
};

// Fonction pour rechercher une chanson sur Spotify
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

// Fonction pour vérifier la disponibilité d'une chanson
const checkSongAvailability = (track) => {
  if (track && track.preview_url) {
    console.log('Track is available on Spotify:', track.preview_url);
    return true;
  } else {
    console.error('Track is not available on Spotify.');
    return false;
  }
};

module.exports = { getSpotifyToken, searchSongOnSpotify, checkSongAvailability };
