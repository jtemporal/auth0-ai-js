import { genkit, z } from 'genkit';
import { openAI, gpt4o } from 'genkitx-openai';
import { FSSessionStore } from '@auth0/ai-genkit';
import { user } from '@auth0/ai/user';
import { session as sess } from '@auth0/ai/session';
import { tokens } from '@auth0/ai/tokens';
import { AuthorizationError } from '@auth0/ai';
import { parseWWWAuthenticateHeader } from 'http-auth-utils';


const ai = genkit({
  plugins: [ openAI({ apiKey: process.env.OPENAI_API_KEY }) ],
  model: gpt4o,
});

const buy = ai.defineTool(
  {
    name: "buy",
    description: "Use this function to buy stock",
    inputSchema: z.object({
      ticker: z.string(),
      qty: z.number()
    }),
    outputSchema: z.string(),
  },
  async ({ ticker, qty }) => {
    const headers = {
      'Content-Type': 'application/json'
    };
    const body = {
      ticker: ticker,
      qty: qty
    };
    
    const u = user();
    console.log('Buying stock for user: ')
    console.log(u);
    
    const accessToken = tokens().accessToken;
    if (accessToken) {
      headers['Authorization'] = 'Bearer ' + accessToken.value;
    }
    
    const response = await fetch('http://localhost:8081/', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    if (response.status == 401) {
      const challenge = parseWWWAuthenticateHeader(response.headers.get('WWW-Authenticate'));
      console.log(challenge);
      throw new AuthorizationError('You need authorization to buy stock', 'insufficient_scope', { scope: challenge.data.scope });
    }
    
    var json = await response.json();
    return 'OK';
  }
);


export async function prompt(message) {
  const sessionId = sess().id;
  let session;
  if (!sessionId) {
    session = ai.createSession({
      store: new FSSessionStore(),
    });
  } else {
    session = await ai.loadSession(sessionId, {
      store: new FSSessionStore(),
    });
  }
  
  
  const chat = session.chat();
  sess().id = chat.session.id;
  
  try {
    const { text } = await chat.send({
      //'Hello, I am a stock trader'
      prompt: message,
      tools: [ buy ]
    });
  
    return { message: {
      //content: 'OK'
      context: text
    } };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      // TODO: I wish there was a better interface here to explicitly persist
      // the session.  It may also be worth considering wether to inject a
      // system method saying that authorization was requested, in which case
      // `chat.updateMessages()` would be the correct approach.
      await chat.session.store.save(chat.session.id, chat.session.sessionData);
    }
    
    throw error;
  }
}
