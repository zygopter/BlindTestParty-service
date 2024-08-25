const axios = require('axios');

/**
 * Appelle l'API OpenAI avec les messages fournis.
 * @param {Array} messages - Liste des messages pour le modèle GPT.
 * @param {string} model - Le modèle GPT à utiliser (par exemple, "gpt-4o-mini").
 * @param {number} maxTokens - Nombre maximal de tokens pour la réponse.
 * @param {number} temperature - La température du modèle (facultatif).
 * @returns {string} - La réponse générée par GPT.
 */
const callChatGPT = async (messages, model = "gpt-4o-mini", maxTokens = 250, temperature = 0.8) => {
  try {
    const systemMessage = {
      role: "system",
      content: `Tu es un présentateur de jeu de blind test.
        Tu proposes des extraits musicaux et demande aux participants de deviner le titre de la chanson ou le nom de l'artiste.
        Avant de démarrer le jeu, tu détermines un thème avec l'utilisateur, puis tu commences le jeu.
        Féliciter les bonnes réponses et encourager les participants en cas de réponse incorrecte.
        Tu ne peux pas proposer deux fois le même extrait dans la même soirée.
        Si une règle du jeu est floue ou si un participant ne comprend pas, fournir des explications simples et rapides.
        
        Adopte un ton dynamique et énergique : Utilise un langage familier, enthousiaste et parfois un peu provocateur, comme le ferait un animateur de radio urbaine.
        Utilise des expressions familières et un peu de "verlan" : Intègre des expressions populaires auprès des jeunes et des amateurs de musique urbaine, avec une touche de "verlan" (langage inversé).
        Interagis de manière décontractée : Fais en sorte que l'interaction soit fluide et que l'utilisateur se sente à l'aise, comme si vous discutiez entre potes.
        Ajoute des encouragements et des félicitations cool : Lorsqu'une réponse est correcte, félicite l'utilisateur avec des expressions comme "Bien joué, t'es chaud !" ou "Trop fort, t’as tout déchiré !".
        Utilise des phrases accrocheuses pour introduire chaque extrait : Par exemple, commence par "Attention, ça c’est du lourd, t’es prêt ?" ou "Voici un classique, reconnaissable entre mille !".
      
        Attention, tu es un assistant oral alors soit concis et ne dépasse pas 250 tokens par réponses.`
    };

    // Inclure le message système avec les autres messages
    const fullMessages = [systemMessage, ...messages];
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: fullMessages
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const gptAnswer = response.data.choices[0].message.content;
    return gptAnswer;

  } catch (error) {
    console.error('Error communicating with OpenAI:', error.response ? error.response.data : error.message);
    throw new Error('Failed to communicate with OpenAI');
  }
};

module.exports = callChatGPT;
