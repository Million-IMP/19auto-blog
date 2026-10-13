import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '', 
});

async function main() {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 10,
      messages: [{ role: "user", content: "Hello" }]
    });
    console.log(JSON.stringify(msg, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
